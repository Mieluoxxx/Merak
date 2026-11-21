//! Artifact, Decision Canvas, Verify Report & Comment Cordis service (`"artifacts"`).

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use cordis::{Context, CordisError, Inject, Service};
use merak_contracts::{
    ArtifactComment, ArtifactVerdict, BotStatus, ClaimStatus, DiffLine, DiffLineKind, DiffPreview,
    InboxStatus, MerakSnapshot, Ruling, Task, TaskPriority, TaskStage, TaskStatus, VerifyJudge,
    ChecklistItem,
};

use crate::events::{CanvasDecidedEvent, EVT_CANVAS_DECIDED};
use crate::store::StoreService;

/// Cordis service managing Artifacts, Decision Canvases, Verify Reports, and comments.
pub struct ArtifactService {
    ctx: Context,
    store: Arc<StoreService>,
    staged_options: RwLock<HashMap<String, String>>,
}

impl ArtifactService {
    /// Record a transiently staged Decision Canvas option prior to final confirmation.
    pub fn stage_canvas_option(&self, artifact_id: &str, option_id: &str) {
        self.staged_options
            .write()
            .unwrap()
            .insert(artifact_id.to_string(), option_id.to_string());
    }

    /// Resolve the staged option for an artifact, falling back to chosen, recommended, or first.
    pub fn staged_option_for(&self, artifact_id: &str) -> Option<String> {
        if let Some(id) = self.staged_options.read().unwrap().get(artifact_id) {
            return Some(id.clone());
        }
        self.store.read(|snap| {
            let art = snap.artifacts.iter().find(|a| a.id == artifact_id)?;
            art.options
                .iter()
                .find(|o| o.chosen)
                .or_else(|| art.options.iter().find(|o| o.recommended))
                .or_else(|| art.options.first())
                .map(|o| o.id.clone())
        })
    }

    /// Settle a Decision Canvas option, updating bot/task/inbox state and emitting `EVT_CANVAS_DECIDED`.
    pub fn choose_canvas_option(&self, artifact_id: &str, option_id: &str) -> Option<String> {
        let chosen_label = self.store.write("artifact.choose_canvas_option", |snap| {
            let idx = snap.artifacts.iter().position(|a| a.id == artifact_id)?;
            let chosen_label = snap.artifacts[idx]
                .options
                .iter()
                .find(|o| o.id == option_id)
                .map(|o| o.label.clone())
                .filter(|label| !label.is_empty())?;

            for opt in &mut snap.artifacts[idx].options {
                opt.chosen = opt.id == option_id;
            }
            snap.artifacts[idx].verdict = ArtifactVerdict::Settled;
            snap.artifacts[idx].updated_at = "刚刚".into();

            let comment_id = self.store.next_id("cm");
            let ruling_id = self.store.next_id("rul");
            let task_id = snap.artifacts[idx].task_id.clone();
            let bot_id = snap.artifacts[idx].bot_id.clone();

            snap.artifacts[idx].comments.push(ArtifactComment {
                id: comment_id,
                author: "主人".into(),
                is_bot: false,
                anchor: "决策栏拍板".into(),
                body: format!("已拍板选定：{chosen_label}"),
                timestamp: "刚刚".into(),
                receipt_ack: true,
            });

            if let Some(bot) = snap.bots.iter_mut().find(|b| b.id == bot_id) {
                bot.status = BotStatus::Running;
                bot.summary = format!("收到画板拍板「{chosen_label}」，继续推进执行。");
            }

            if let Some(tid) = task_id
                && let Some(task) = snap.tasks.iter_mut().find(|t| t.id == tid)
            {
                task.stage = TaskStage::SpecApproved;
                task.status = TaskStatus::InProgress;
                task.updated_at = "刚刚".into();
                for c in &mut task.checklist {
                    if c.label.contains("拍板") || c.label.contains("策略") {
                        c.done = true;
                    }
                }
                task.rulings.insert(
                    0,
                    Ruling {
                        id: ruling_id,
                        decision: format!("采用 {chosen_label}"),
                        reason: "人类在 Excalidraw 决策白板上完成选型拍板".into(),
                        cost_if_wrong: "架构边界变更需重新调整实现".into(),
                        timestamp: "刚刚".into(),
                        disputed: false,
                    },
                );
            }

            for item in &mut snap.inbox {
                if item.artifact_id.as_deref() == Some(artifact_id) && item.status.is_pending() {
                    item.status = InboxStatus::Settled;
                    item.receipt_settled = true;
                    item.reply_text = Some(format!("已拍板：{chosen_label}"));
                }
            }

            Some(chosen_label)
        })?;

        self.stage_canvas_option(artifact_id, option_id);
        // Emit only after releasing the store write lock so listeners can safely read/write store.
        self.ctx.emit(
            EVT_CANVAS_DECIDED,
            CanvasDecidedEvent {
                artifact_id: artifact_id.to_string(),
                option_id: option_id.to_string(),
                option_label: chosen_label.clone(),
            },
        );
        Some(format!("已拍板定案：{chosen_label}"))
    }

    /// Record a human Pass/Reject verdict on a Verify Report claim and recompute verdict.
    pub fn verdict_human_claim(
        &self,
        artifact_id: &str,
        claim_id: &str,
        pass: bool,
    ) -> Option<String> {
        self.store.write("artifact.verdict_human_claim", |snap| {
            let art = snap.artifacts.iter_mut().find(|a| a.id == artifact_id)?;
            let rep = art.verify_report.as_mut()?;
            let clm = rep.claims.iter_mut().find(|c| c.id == claim_id)?;
            clm.status = if pass {
                ClaimStatus::Passed
            } else {
                ClaimStatus::Rejected
            };
            let title = clm.title.clone();
            recompute_verify_verdict(snap, artifact_id);
            Some(if pass {
                format!("Pass：{title}")
            } else {
                format!("已退回 Reject：{title}")
            })
        })
    }

    /// Toggle waived status of a Verify Report gap and recompute verdict.
    pub fn waive_verify_gap(&self, artifact_id: &str, gap_id: &str) -> Option<String> {
        self.store.write("artifact.waive_verify_gap", |snap| {
            waive_verify_gap_in(snap, artifact_id, gap_id)
        })
    }

    /// Create a follow-up task from a Verify Report gap, waive the gap, and return the new task ID.
    pub fn spawn_task_from_gap(&self, artifact_id: &str, gap_id: &str) -> Option<String> {
        self.store.write("artifact.spawn_task_from_gap", |snap| {
            let art = snap.artifacts.iter().find(|a| a.id == artifact_id)?.clone();
            let rep = art.verify_report.as_ref()?;
            let gap = rep.gaps.iter().find(|g| g.id == gap_id)?.clone();

            let task_id = self.store.next_id("task");
            let key = self.store.next_id("GAP");
            let check_id = self.store.next_id("chk");

            let task = Task {
                id: task_id.clone(),
                key,
                title: format!("补测 Gap：{}", gap.title),
                description: format!(
                    "来源报告：{}\n未覆盖原因：{}\n补齐条件：{}",
                    art.title, gap.why, gap.needs
                ),
                stage: TaskStage::SpecApproved,
                status: TaskStatus::Todo,
                priority: TaskPriority::High,
                project_id: art.project_id,
                linked_bot_id: art.bot_id,
                primary_artifact_id: artifact_id.to_string(),
                verify_artifact_id: Some(artifact_id.to_string()),
                updated_at: "刚刚".into(),
                tags: vec!["Verify-Gap".into()],
                checklist: vec![ChecklistItem {
                    id: check_id,
                    label: gap.needs,
                    done: false,
                }],
                rulings: vec![],
                diff_preview: DiffPreview {
                    file: "pending".into(),
                    additions: 0,
                    deletions: 0,
                    lines: vec![DiffLine {
                        kind: DiffLineKind::Context,
                        text: "// 待 Bot 补齐测试与证据".into(),
                    }],
                },
            };
            snap.tasks.insert(0, task);
            let _ = waive_verify_gap_in(snap, artifact_id, gap_id);
            Some(task_id)
        })
    }

    /// Pin a new human comment anchored on an artifact.
    pub fn pin_artifact_comment(&self, artifact_id: &str, anchor: &str, body: &str) -> bool {
        let clean = body.trim();
        if clean.is_empty() {
            return false;
        }
        self.store.write("artifact.pin_comment", |snap| {
            if let Some(art) = snap.artifacts.iter_mut().find(|a| a.id == artifact_id) {
                art.comments.push(ArtifactComment {
                    id: self.store.next_id("cm"),
                    author: "主人".into(),
                    is_bot: false,
                    anchor: anchor.to_string(),
                    body: clean.to_string(),
                    timestamp: "刚刚".into(),
                    receipt_ack: false,
                });
                art.updated_at = "刚刚".into();
                true
            } else {
                false
            }
        })
    }

    /// Mark an artifact comment as acknowledged by its owning bot.
    pub fn ack_artifact_comment(&self, artifact_id: &str, comment_id: &str) -> Option<String> {
        self.store.write("artifact.ack_comment", |snap| {
            let bot_id = {
                let art = snap.artifacts.iter_mut().find(|a| a.id == artifact_id)?;
                let cm = art.comments.iter_mut().find(|c| c.id == comment_id)?;
                cm.receipt_ack = true;
                art.bot_id.clone()
            };
            let bot_name = snap
                .bots
                .iter()
                .find(|b| b.id == bot_id)
                .map(|b| b.name.clone())
                .unwrap_or_else(|| "Bot".into());
            Some(format!("{bot_name} 已确认消费批注回执（ack）"))
        })
    }
}

impl Service for ArtifactService {
    type Config = ();

    fn service_name() -> &'static str {
        "artifacts"
    }

    fn inject() -> Inject {
        Inject::from(["store"])
    }

    fn create(ctx: &Context, _config: Self::Config) -> Result<Arc<Self>, CordisError> {
        let store = ctx.service::<StoreService>("store")?;
        Ok(Arc::new(Self {
            ctx: ctx.clone(),
            store,
            staged_options: RwLock::new(HashMap::new()),
        }))
    }
}

fn waive_verify_gap_in(
    snap: &mut MerakSnapshot,
    artifact_id: &str,
    gap_id: &str,
) -> Option<String> {
    let art = snap.artifacts.iter_mut().find(|a| a.id == artifact_id)?;
    let rep = art.verify_report.as_mut()?;
    let gap = rep.gaps.iter_mut().find(|g| g.id == gap_id)?;
    gap.waived = !gap.waived;
    let waived = gap.waived;
    let title = gap.title.clone();
    recompute_verify_verdict(snap, artifact_id);
    Some(if waived {
        format!("已豁免 Gap：{title}")
    } else {
        format!("已恢复待覆盖 Gap：{title}")
    })
}

fn recompute_verify_verdict(snap: &mut MerakSnapshot, artifact_id: &str) {
    let Some(art) = snap.artifacts.iter_mut().find(|a| a.id == artifact_id) else {
        return;
    };
    let Some(rep) = &art.verify_report else {
        return;
    };
    let any_rejected = rep
        .claims
        .iter()
        .any(|c| matches!(c.status, ClaimStatus::Rejected | ClaimStatus::Failed));
    let any_pending_human = rep
        .claims
        .iter()
        .any(|c| c.judge == VerifyJudge::Human && c.status == ClaimStatus::PendingHuman);
    let any_open_gap = rep.gaps.iter().any(|g| !g.waived);

    let new_verdict = if any_rejected {
        ArtifactVerdict::Rejected
    } else if any_pending_human || any_open_gap {
        ArtifactVerdict::PendingHuman
    } else {
        ArtifactVerdict::Passed
    };
    art.verdict = new_verdict;
    art.updated_at = "刚刚".into();

    let task_id = art.task_id.clone();
    if new_verdict != ArtifactVerdict::PendingHuman {
        for item in &mut snap.inbox {
            if item.artifact_id.as_deref() == Some(artifact_id) && item.status.is_pending() {
                item.status = if new_verdict == ArtifactVerdict::Rejected {
                    InboxStatus::Rejected
                } else {
                    InboxStatus::Approved
                };
                item.receipt_settled = true;
            }
        }
        if let Some(tid) = task_id
            && let Some(task) = snap.tasks.iter_mut().find(|t| t.id == tid)
        {
            if new_verdict == ArtifactVerdict::Passed {
                task.stage = TaskStage::Done;
                task.status = TaskStatus::Done;
            } else {
                task.status = TaskStatus::InProgress;
            }
            task.updated_at = "刚刚".into();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    use crate::store::StoreConfig;

    async fn setup_artifacts() -> (Context, Arc<StoreService>, Arc<ArtifactService>) {
        let ctx = Context::new();
        ctx.plugin(StoreService::plugin(), StoreConfig::default())
            .await
            .unwrap();
        ctx.plugin(ArtifactService::plugin(), ()).await.unwrap();
        let store = ctx.service::<StoreService>("store").unwrap();
        let artifacts = ctx.service::<ArtifactService>("artifacts").unwrap();
        (ctx, store, artifacts)
    }

    #[tokio::test]
    async fn choose_canvas_option_updates_domain_and_emits_event() {
        let (ctx, store, artifacts) = setup_artifacts().await;
        let events = Arc::new(Mutex::new(Vec::<CanvasDecidedEvent>::new()));
        let events_capture = Arc::clone(&events);
        ctx.on::<CanvasDecidedEvent, _>(EVT_CANVAS_DECIDED, move |ev| {
            events_capture.lock().unwrap().push(ev.clone());
        })
        .unwrap();

        let msg = artifacts
            .choose_canvas_option("art-merak-arch-canvas", "opt-arch-b")
            .expect("valid canvas option should settle");
        assert!(msg.starts_with("已拍板定案："));

        // Invalid option must return None and emit nothing further.
        assert_eq!(
            artifacts.choose_canvas_option("art-merak-arch-canvas", "non-existent"),
            None
        );

        store.read(|snap| {
            let art = snap
                .artifacts
                .iter()
                .find(|a| a.id == "art-merak-arch-canvas")
                .unwrap();
            assert_eq!(art.verdict, ArtifactVerdict::Settled);
            assert!(art.options.iter().any(|o| o.id == "opt-arch-b" && o.chosen));
            assert!(art.options.iter().any(|o| o.id == "opt-arch-a" && !o.chosen));
            assert_eq!(art.comments.last().unwrap().anchor, "决策栏拍板");
            assert!(art.comments.last().unwrap().receipt_ack);

            let bot = snap.bots.iter().find(|b| b.id == "bot-arch").unwrap();
            assert_eq!(bot.status, BotStatus::Running);

            let task = snap.tasks.iter().find(|t| t.id == "task-101").unwrap();
            assert_eq!(task.stage, TaskStage::SpecApproved);
            assert_eq!(task.status, TaskStatus::InProgress);
            assert!(task.checklist.iter().all(|c| c.done));
            assert!(task.rulings[0].decision.starts_with("采用 "));

            let inbox_item = snap.inbox.iter().find(|i| i.id == "inb-1").unwrap();
            assert_eq!(inbox_item.status, InboxStatus::Settled);
            assert!(inbox_item.receipt_settled);
            assert!(inbox_item.reply_text.is_some());
        });

        {
            let captured = events.lock().unwrap();
            assert_eq!(captured.len(), 1);
            assert_eq!(captured[0].artifact_id, "art-merak-arch-canvas");
            assert_eq!(captured[0].option_id, "opt-arch-b");
        }

        ctx.fiber().dispose().await;
    }

    #[tokio::test]
    async fn verdict_human_claim_transitions_report_inbox_and_task() {
        let (ctx, store, artifacts) = setup_artifacts().await;

        let msg1 = artifacts
            .verdict_human_claim("art-merak-verify-report", "clm-3", true)
            .unwrap();
        assert!(msg1.starts_with("Pass："));
        store.read(|snap| {
            let art = snap
                .artifacts
                .iter()
                .find(|a| a.id == "art-merak-verify-report")
                .unwrap();
            assert_eq!(art.verdict, ArtifactVerdict::PendingHuman);
        });

        // Rejecting remaining human claim marks report Rejected and settles linked Inbox item.
        let msg_rej = artifacts
            .verdict_human_claim("art-merak-verify-report", "clm-4", false)
            .unwrap();
        assert!(msg_rej.starts_with("已退回 Reject："));
        store.read(|snap| {
            let art = snap
                .artifacts
                .iter()
                .find(|a| a.id == "art-merak-verify-report")
                .unwrap();
            assert_eq!(art.verdict, ArtifactVerdict::Rejected);
            let inb = snap.inbox.iter().find(|i| i.id == "inb-2").unwrap();
            assert_eq!(inb.status, InboxStatus::Rejected);
            assert!(inb.receipt_settled);
            let task = snap.tasks.iter().find(|t| t.id == "task-103").unwrap();
            assert_eq!(task.status, TaskStatus::InProgress);
        });

        // Passing clm-4 and waiving both gaps moves report, inbox, and task to Passed/Approved/Done.
        artifacts.verdict_human_claim("art-merak-verify-report", "clm-4", true);
        artifacts.waive_verify_gap("art-merak-verify-report", "gap-1");
        artifacts.waive_verify_gap("art-merak-verify-report", "gap-2");
        store.read(|snap| {
            let art = snap
                .artifacts
                .iter()
                .find(|a| a.id == "art-merak-verify-report")
                .unwrap();
            assert_eq!(art.verdict, ArtifactVerdict::Passed);
            let task = snap.tasks.iter().find(|t| t.id == "task-103").unwrap();
            assert_eq!(task.stage, TaskStage::Done);
            assert_eq!(task.status, TaskStatus::Done);
        });

        ctx.fiber().dispose().await;
    }

    #[tokio::test]
    async fn waive_gap_and_spawn_task_from_gap_work() {
        let (ctx, store, artifacts) = setup_artifacts().await;

        let waived_msg = artifacts
            .waive_verify_gap("art-mizar-nightly-verify", "mgap-1")
            .unwrap();
        assert!(waived_msg.starts_with("已豁免 Gap："));
        let unwaived_msg = artifacts
            .waive_verify_gap("art-mizar-nightly-verify", "mgap-1")
            .unwrap();
        assert!(unwaived_msg.starts_with("已恢复待覆盖 Gap："));

        let new_task_id = artifacts
            .spawn_task_from_gap("art-mizar-nightly-verify", "mgap-1")
            .expect("should return spawned task ID");
        assert!(new_task_id.starts_with("task-"));

        store.read(|snap| {
            let spawned = &snap.tasks[0];
            assert_eq!(spawned.id, new_task_id);
            assert!(spawned.key.starts_with("GAP-"));
            assert!(spawned.title.starts_with("补测 Gap："));
            assert_eq!(spawned.tags, vec!["Verify-Gap"]);
            assert_eq!(spawned.priority, TaskPriority::High);

            let art = snap
                .artifacts
                .iter()
                .find(|a| a.id == "art-mizar-nightly-verify")
                .unwrap();
            let gap = &art.verify_report.as_ref().unwrap().gaps[0];
            assert!(gap.waived);
        });

        ctx.fiber().dispose().await;
    }

    #[tokio::test]
    async fn pin_and_ack_artifact_comment_work() {
        let (ctx, store, artifacts) = setup_artifacts().await;

        assert!(!artifacts.pin_artifact_comment("art-merak-arch-canvas", "anchor", "   "));
        assert!(artifacts.pin_artifact_comment(
            "art-merak-arch-canvas",
            "Frame B",
            "  请补充超时重试逻辑  ",
        ));

        let new_cm_id = store.read(|snap| {
            let art = snap
                .artifacts
                .iter()
                .find(|a| a.id == "art-merak-arch-canvas")
                .unwrap();
            let cm = art.comments.last().unwrap();
            assert_eq!(cm.body, "请补充超时重试逻辑");
            assert_eq!(cm.anchor, "Frame B");
            assert!(!cm.receipt_ack);
            cm.id.clone()
        });

        let ack_msg = artifacts
            .ack_artifact_comment("art-merak-arch-canvas", &new_cm_id)
            .unwrap();
        assert!(ack_msg.contains("Arch-Bot"));
        store.read(|snap| {
            let art = snap
                .artifacts
                .iter()
                .find(|a| a.id == "art-merak-arch-canvas")
                .unwrap();
            let cm = art.comments.iter().find(|c| c.id == new_cm_id).unwrap();
            assert!(cm.receipt_ack);
        });

        ctx.fiber().dispose().await;
    }
}
