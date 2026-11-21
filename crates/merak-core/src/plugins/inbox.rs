//! Linus-style Inbox service & Cordis waterfall funnel (`"inbox"`).

use std::sync::Arc;

use cordis::{BoxFuture, Context, CordisError, EventOptions, Inject, Next, Service};
use merak_contracts::{
    ArtifactKind, ArtifactVerdict, InboxItem, InboxKind, InboxStatus, ScheduleNotifyPolicy,
};

use crate::events::{
    EVT_INBOX_FILTER, EVT_RULING_DISPUTED, EVT_SCHEDULE_COMPLETED, InboxCandidate,
    InboxFilterDecision, RulingDisputedEvent, ScheduleCompletedEvent,
};
use crate::plugins::artifact::ArtifactService;
use crate::store::StoreService;

/// Cordis service managing the low-noise Inbox queue and `EVT_INBOX_FILTER` waterfall funnel.
pub struct InboxService {
    ctx: Context,
    store: Arc<StoreService>,
    artifacts: Arc<ArtifactService>,
}

impl InboxService {
    /// Route a candidate through `EVT_INBOX_FILTER` and insert into Inbox only if delivered.
    pub fn submit_candidate(&self, candidate: InboxCandidate) -> Option<String> {
        match self
            .ctx
            .waterfall(EVT_INBOX_FILTER, candidate, InboxFilterDecision::Deliver)
        {
            InboxFilterDecision::Deliver(accepted) => {
                let id = self.store.next_id("inb");
                self.store.write("inbox.submit_candidate", |snap| {
                    snap.inbox.insert(
                        0,
                        InboxItem {
                            id: id.clone(),
                            kind: accepted.kind,
                            status: InboxStatus::Pending,
                            title: accepted.title,
                            summary: accepted.summary,
                            source_label: accepted.source_label,
                            timestamp: "刚刚".into(),
                            project_id: accepted.project_id,
                            task_id: accepted.task_id,
                            artifact_id: accepted.artifact_id,
                            schedule_id: accepted.schedule_id,
                            bot_id: accepted.bot_id,
                            command_preview: accepted.command_preview,
                            reply_text: None,
                            receipt_settled: false,
                        },
                    );
                });
                Some(id)
            }
            InboxFilterDecision::Suppress { .. } => None,
        }
    }

    /// Record a verdict on an Inbox item, optionally pinning a reply comment and approving VerifyReport.
    pub fn decide_inbox(
        &self,
        id: &str,
        status: InboxStatus,
        reply: Option<String>,
    ) -> Option<String> {
        let clean_reply = reply
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let (title, aid) = self.store.write("inbox.decide", |snap| {
            let idx = snap.inbox.iter().position(|i| i.id == id)?;
            snap.inbox[idx].status = status;
            snap.inbox[idx].receipt_settled = true;
            if let Some(r) = clean_reply.clone() {
                snap.inbox[idx].reply_text = Some(r);
            }
            let title = snap.inbox[idx].title.clone();
            let aid = snap.inbox[idx].artifact_id.clone();

            if status == InboxStatus::Approved
                && let Some(aid_ref) = aid.as_deref()
                && let Some(art) = snap.artifacts.iter_mut().find(|a| a.id == aid_ref)
                && art.kind == ArtifactKind::VerifyReport
            {
                art.verdict = ArtifactVerdict::Passed;
            }

            Some((title, aid))
        })?;

        if let (Some(aid_ref), Some(r)) = (aid.as_deref(), clean_reply.as_deref()) {
            self.artifacts
                .pin_artifact_comment(aid_ref, "Mailbox 回执", r);
        }

        Some(format!("{}：{}", status.label(), title))
    }

    /// Settle a Decision Canvas Inbox card using the artifact's staged/default option.
    pub fn settle_inbox_canvas_decision(
        &self,
        inbox_id: &str,
        reply: Option<String>,
    ) -> Option<String> {
        let aid = self.store.read(|snap| {
            let aid = snap
                .inbox
                .iter()
                .find(|i| i.id == inbox_id)
                .and_then(|i| i.artifact_id.clone())?;
            let art = snap.artifacts.iter().find(|a| a.id == aid)?;
            if art.kind != ArtifactKind::DecisionCanvas || art.options.is_empty() {
                return None;
            }
            Some(aid)
        })?;
        let oid = self.artifacts.staged_option_for(&aid)?;
        let _ = self.artifacts.choose_canvas_option(&aid, &oid)?;
        self.decide_inbox(inbox_id, InboxStatus::Settled, reply)
    }

    /// Reply to an Inbox card and pin the message onto its linked artifact, if any.
    pub fn reply_to_inbox(&self, inbox_id: &str, raw: &str) -> bool {
        let clean = raw.trim().to_string();
        if clean.is_empty() {
            return false;
        }
        let aid_opt = self.store.write("inbox.reply", |snap| {
            let item = snap.inbox.iter_mut().find(|i| i.id == inbox_id)?;
            item.reply_text = Some(clean.clone());
            item.receipt_settled = true;
            Some(item.artifact_id.clone())
        });
        let Some(aid_opt) = aid_opt else {
            return false;
        };
        if let Some(aid) = aid_opt {
            self.artifacts.pin_artifact_comment(&aid, "Mailbox 回执", &clean);
        }
        true
    }

    fn handle_ruling_disputed(&self, ev: &RulingDisputedEvent) {
        self.store.write("inbox.ruling_disputed", |snap| {
            let task_key = snap
                .tasks
                .iter()
                .find(|t| t.id == ev.task_id)
                .map(|t| t.key.as_str())
                .unwrap_or(ev.task_title.as_str());
            let source_label = format!("{task_key} · 账本纠偏");
            let id = self.store.next_id("inb");
            snap.inbox.insert(
                0,
                InboxItem {
                    id,
                    kind: InboxKind::InlineComment,
                    status: InboxStatus::Settled,
                    title: format!("已对 Ruling「{}」发起纠偏批注", ev.ruling_decision),
                    summary: "已写入产物批注流并标记等待 Bot 消费回执。".into(),
                    source_label,
                    timestamp: "刚刚".into(),
                    project_id: ev.project_id.clone(),
                    task_id: Some(ev.task_id.clone()),
                    artifact_id: ev.artifact_id.clone(),
                    schedule_id: None,
                    bot_id: ev.bot_id.clone(),
                    command_preview: None,
                    reply_text: None,
                    receipt_settled: false,
                },
            );
        });
    }

    fn handle_schedule_completed(&self, ev: &ScheduleCompletedEvent) {
        let (source_label, command_preview) = self.store.read(|snap| {
            snap.schedules
                .iter()
                .find(|s| s.id == ev.schedule_id)
                .map(|s| {
                    (
                        format!("{} · 立即执行", s.schedule_label),
                        Some(s.schedule_expr.clone()),
                    )
                })
                .unwrap_or_else(|| ("定时巡检 · 立即执行".to_string(), None))
        });

        let kind = if ev.all_green {
            InboxKind::VerifyVerdict
        } else {
            InboxKind::GapWaiver
        };
        let candidate = InboxCandidate {
            project_id: ev.project_id.clone(),
            bot_id: ev.bot_id.clone(),
            kind,
            title: ev.title.clone(),
            summary: ev.summary.clone(),
            source_label,
            artifact_id: ev.target_artifact_id.clone(),
            task_id: ev.target_task_id.clone(),
            schedule_id: Some(ev.schedule_id.clone()),
            command_preview,
            notify_policy: Some(ev.notify_policy),
            all_green: ev.all_green,
        };
        let _ = self.submit_candidate(candidate);
    }
}

impl Service for InboxService {
    type Config = ();

    fn service_name() -> &'static str {
        "inbox"
    }

    fn inject() -> Inject {
        Inject::from(["store", "artifacts"])
    }

    fn create(ctx: &Context, _config: Self::Config) -> Result<Arc<Self>, CordisError> {
        let store = ctx.service::<StoreService>("store")?;
        let artifacts = ctx.service::<ArtifactService>("artifacts")?;
        Ok(Arc::new(Self {
            ctx: ctx.clone(),
            store,
            artifacts,
        }))
    }

    fn init(self: Arc<Self>, ctx: &Context) -> BoxFuture<'static, Result<(), CordisError>> {
        let ctx = ctx.clone();
        Box::pin(async move {
            // Register default funnel after priority-0 user middleware so custom waterfall plugins
            // can intercept, rewrite, or override SilentOnPass without needing explicit priority.
            ctx.on_waterfall_with(
                EVT_INBOX_FILTER,
                |candidate: InboxCandidate, next: Next<InboxCandidate, InboxFilterDecision>| {
                    if candidate.notify_policy == Some(ScheduleNotifyPolicy::SilentOnPass)
                        && candidate.all_green
                    {
                        InboxFilterDecision::Suppress {
                            reason: "silent_on_pass_all_green".into(),
                        }
                    } else {
                        next.call(candidate)
                    }
                },
                EventOptions {
                    priority: 100,
                    prepend: false,
                },
            )?;

            let weak_ruling = Arc::downgrade(&self);
            ctx.on::<RulingDisputedEvent, _>(EVT_RULING_DISPUTED, move |ev| {
                if let Some(svc) = weak_ruling.upgrade() {
                    svc.handle_ruling_disputed(ev);
                }
            })?;

            let weak_schedule = Arc::downgrade(&self);
            ctx.on::<ScheduleCompletedEvent, _>(EVT_SCHEDULE_COMPLETED, move |ev| {
                if let Some(svc) = weak_schedule.upgrade() {
                    svc.handle_schedule_completed(ev);
                }
            })?;

            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cordis::{Fiber, PluginDef};

    use crate::events::CanvasDecidedEvent;
    use crate::events::EVT_CANVAS_DECIDED;
    use crate::store::StoreConfig;
    use std::sync::Mutex;

    async fn setup_inbox() -> (Context, Arc<StoreService>, Arc<ArtifactService>, Arc<InboxService>, Fiber) {
        let ctx = Context::new();
        ctx.plugin(StoreService::plugin(), StoreConfig::default())
            .await
            .unwrap();
        ctx.plugin(ArtifactService::plugin(), ()).await.unwrap();
        let inbox_fiber = ctx.plugin(InboxService::plugin(), ()).await.unwrap();
        let store = ctx.service::<StoreService>("store").unwrap();
        let artifacts = ctx.service::<ArtifactService>("artifacts").unwrap();
        let inbox = ctx.service::<InboxService>("inbox").unwrap();
        (ctx, store, artifacts, inbox, inbox_fiber)
    }

    #[tokio::test]
    async fn schedule_completed_respects_silent_on_pass_waterfall_funnel() {
        let (ctx, store, _artifacts, _inbox, _fiber) = setup_inbox().await;
        let initial_len = store.read(|snap| snap.inbox.len());

        // SilentOnPass + all_green=true must be suppressed.
        ctx.emit(
            EVT_SCHEDULE_COMPLETED,
            ScheduleCompletedEvent {
                schedule_id: "sch-merak-qa".into(),
                project_id: "proj-merak".into(),
                bot_id: "bot-review".into(),
                title: "定时任务运行结果：夜间回归".into(),
                summary: "全绿静默".into(),
                notify_policy: ScheduleNotifyPolicy::SilentOnPass,
                all_green: true,
                target_artifact_id: Some("art-merak-verify-report".into()),
                target_task_id: None,
            },
        );
        assert_eq!(store.read(|snap| snap.inbox.len()), initial_len);

        // SilentOnPass + all_green=false must pass through as GapWaiver.
        ctx.emit(
            EVT_SCHEDULE_COMPLETED,
            ScheduleCompletedEvent {
                schedule_id: "sch-merak-qa".into(),
                project_id: "proj-merak".into(),
                bot_id: "bot-review".into(),
                title: "定时任务运行结果：夜间回归".into(),
                summary: "发现 1 项 Gap".into(),
                notify_policy: ScheduleNotifyPolicy::SilentOnPass,
                all_green: false,
                target_artifact_id: Some("art-merak-verify-report".into()),
                target_task_id: None,
            },
        );
        store.read(|snap| {
            assert_eq!(snap.inbox.len(), initial_len + 1);
            assert_eq!(snap.inbox[0].kind, InboxKind::GapWaiver);
            assert_eq!(snap.inbox[0].status, InboxStatus::Pending);
            assert_eq!(snap.inbox[0].source_label, "每天 02:00 · 立即执行");
            assert_eq!(snap.inbox[0].command_preview.as_deref(), Some("0 2 * * *"));
        });

        // AlwaysInbox + all_green=true must pass through as VerifyVerdict.
        ctx.emit(
            EVT_SCHEDULE_COMPLETED,
            ScheduleCompletedEvent {
                schedule_id: "sch-notes-brief".into(),
                project_id: "proj-notes".into(),
                bot_id: "bot-ui".into(),
                title: "定时任务运行结果：晨报".into(),
                summary: "全绿简报".into(),
                notify_policy: ScheduleNotifyPolicy::AlwaysInbox,
                all_green: true,
                target_artifact_id: None,
                target_task_id: None,
            },
        );
        store.read(|snap| {
            assert_eq!(snap.inbox.len(), initial_len + 2);
            assert_eq!(snap.inbox[0].kind, InboxKind::VerifyVerdict);
        });

        ctx.fiber().dispose().await;
    }

    #[tokio::test]
    async fn custom_waterfall_plugin_can_block_modify_and_override_candidates() {
        let (ctx, store, _artifacts, inbox, _fiber) = setup_inbox().await;

        let filter_plugin = ctx
            .plugin(
                PluginDef::sync("custom-inbox-filter", |c, ()| {
                    c.on_waterfall(
                        EVT_INBOX_FILTER,
                        |mut candidate: InboxCandidate,
                         next: Next<InboxCandidate, InboxFilterDecision>| {
                            if candidate.title.contains("[BLOCK]") {
                                return InboxFilterDecision::Suppress {
                                    reason: "blocked_by_plugin".into(),
                                };
                            }
                            if candidate.title.contains("[FORCE]") {
                                candidate.notify_policy = Some(ScheduleNotifyPolicy::AlwaysInbox);
                            }
                            candidate.title = format!("[Plugin] {}", candidate.title);
                            next.call(candidate)
                        },
                    )?;
                    Ok::<_, CordisError>(())
                }),
                (),
            )
            .await
            .unwrap();

        let make_candidate = |title: &str, policy: ScheduleNotifyPolicy, all_green: bool| InboxCandidate {
            project_id: "proj-merak".into(),
            bot_id: "bot-arch".into(),
            kind: InboxKind::VerifyVerdict,
            title: title.into(),
            summary: "sum".into(),
            source_label: "test".into(),
            artifact_id: None,
            task_id: None,
            schedule_id: None,
            command_preview: None,
            notify_policy: Some(policy),
            all_green,
        };

        // Blocked by custom plugin even though AlwaysInbox.
        assert_eq!(
            inbox.submit_candidate(make_candidate(
                "[BLOCK] noisy alert",
                ScheduleNotifyPolicy::AlwaysInbox,
                false,
            )),
            None
        );

        // Modified title propagates through built-in funnel and lands in store.
        let delivered_id = inbox
            .submit_candidate(make_candidate(
                "important check",
                ScheduleNotifyPolicy::AlwaysInbox,
                true,
            ))
            .expect("should deliver");
        store.read(|snap| {
            let item = snap.inbox.iter().find(|i| i.id == delivered_id).unwrap();
            assert_eq!(item.title, "[Plugin] important check");
        });

        // Custom plugin overrides SilentOnPass + all_green=true when tagged [FORCE].
        let forced_id = inbox
            .submit_candidate(make_candidate(
                "[FORCE] green summary",
                ScheduleNotifyPolicy::SilentOnPass,
                true,
            ))
            .expect("custom plugin override should deliver");
        store.read(|snap| {
            let item = snap.inbox.iter().find(|i| i.id == forced_id).unwrap();
            assert_eq!(item.title, "[Plugin] [FORCE] green summary");
        });

        filter_plugin.dispose().await;
        ctx.fiber().dispose().await;
    }

    #[tokio::test]
    async fn decide_settle_canvas_and_reply_to_inbox_work() {
        let (ctx, store, artifacts, inbox, _fiber) = setup_inbox().await;

        assert!(!inbox.reply_to_inbox("inb-1", "   "));
        assert!(!inbox.reply_to_inbox("inb-missing", "hello"));
        assert!(inbox.reply_to_inbox("inb-1", "请继续推进方案 B"));
        store.read(|snap| {
            let item = snap.inbox.iter().find(|i| i.id == "inb-1").unwrap();
            assert_eq!(item.reply_text.as_deref(), Some("请继续推进方案 B"));
            assert!(item.receipt_settled);
            let art = snap
                .artifacts
                .iter()
                .find(|a| a.id == "art-merak-arch-canvas")
                .unwrap();
            assert_eq!(art.comments.last().unwrap().anchor, "Mailbox 回执");
            assert_eq!(art.comments.last().unwrap().body, "请继续推进方案 B");
        });

        // Settle canvas decision via staged option opt-arch-b on inb-1.
        let decided = Arc::new(Mutex::new(Vec::<CanvasDecidedEvent>::new()));
        let decided_cap = Arc::clone(&decided);
        ctx.on::<CanvasDecidedEvent, _>(EVT_CANVAS_DECIDED, move |ev| {
            decided_cap.lock().unwrap().push(ev.clone());
        })
        .unwrap();
        artifacts.stage_canvas_option("art-merak-arch-canvas", "opt-arch-b");
        let settle_msg = inbox
            .settle_inbox_canvas_decision("inb-1", Some("同意采用 B".into()))
            .unwrap();
        assert!(settle_msg.starts_with("已拍板定案："));
        assert_eq!(decided.lock().unwrap().len(), 1);
        assert_eq!(decided.lock().unwrap()[0].option_id, "opt-arch-b");
        store.read(|snap| {
            let item = snap.inbox.iter().find(|i| i.id == "inb-1").unwrap();
            assert_eq!(item.status, InboxStatus::Settled);
            assert_eq!(item.reply_text.as_deref(), Some("同意采用 B"));
        });

        // Also verify fallback to recommended option when not explicitly staged (inb-3 -> opt-sus-a).
        let settle_sus = inbox.settle_inbox_canvas_decision("inb-3", None).unwrap();
        assert!(settle_sus.starts_with("已拍板定案："));
        assert_eq!(decided.lock().unwrap().len(), 2);
        assert_eq!(decided.lock().unwrap()[1].option_id, "opt-sus-a");

        // Approving a VerifyVerdict Inbox card marks its VerifyReport Passed.
        let approve_msg = inbox
            .decide_inbox("inb-2", InboxStatus::Approved, Some("LGTM".into()))
            .unwrap();
        assert!(approve_msg.starts_with("已批准 Pass："));
        store.read(|snap| {
            let art = snap
                .artifacts
                .iter()
                .find(|a| a.id == "art-merak-verify-report")
                .unwrap();
            assert_eq!(art.verdict, ArtifactVerdict::Passed);
            assert_eq!(art.comments.last().unwrap().body, "LGTM");
        });

        ctx.fiber().dispose().await;
    }

    #[tokio::test]
    async fn disposing_inbox_service_unregisters_cordis_listeners() {
        let (ctx, store, _artifacts, _inbox, inbox_fiber) = setup_inbox().await;
        let baseline = store.read(|snap| snap.inbox.len());

        // Listener works before disposal.
        ctx.emit(
            EVT_RULING_DISPUTED,
            RulingDisputedEvent {
                task_id: "task-101".into(),
                project_id: "proj-merak".into(),
                bot_id: "bot-arch".into(),
                ruling_id: "rul-101-1".into(),
                ruling_decision: "test decision".into(),
                ruling_reason: "reason".into(),
                artifact_id: Some("art-merak-arch-canvas".into()),
                task_title: "title".into(),
            },
        );
        assert_eq!(store.read(|snap| snap.inbox.len()), baseline + 1);

        // Dispose InboxService and confirm service + listeners + waterfall are cleanly removed.
        inbox_fiber.dispose().await;
        assert!(ctx.get::<InboxService>("inbox").is_none());

        ctx.emit(
            EVT_RULING_DISPUTED,
            RulingDisputedEvent {
                task_id: "task-101".into(),
                project_id: "proj-merak".into(),
                bot_id: "bot-arch".into(),
                ruling_id: "rul-101-1".into(),
                ruling_decision: "after dispose".into(),
                ruling_reason: "reason".into(),
                artifact_id: Some("art-merak-arch-canvas".into()),
                task_title: "title".into(),
            },
        );
        ctx.emit(
            EVT_SCHEDULE_COMPLETED,
            ScheduleCompletedEvent {
                schedule_id: "sch-merak-qa".into(),
                project_id: "proj-merak".into(),
                bot_id: "bot-review".into(),
                title: "after dispose".into(),
                summary: "should not enqueue".into(),
                notify_policy: ScheduleNotifyPolicy::AlwaysInbox,
                all_green: false,
                target_artifact_id: None,
                target_task_id: None,
            },
        );
        assert_eq!(store.read(|snap| snap.inbox.len()), baseline + 1);

        // Waterfall hook was also removed, so SilentOnPass+all_green falls directly to inner Deliver.
        let decision = ctx.waterfall(
            EVT_INBOX_FILTER,
            InboxCandidate {
                project_id: "proj-merak".into(),
                bot_id: "bot-arch".into(),
                kind: InboxKind::VerifyVerdict,
                title: "t".into(),
                summary: "s".into(),
                source_label: "l".into(),
                artifact_id: None,
                task_id: None,
                schedule_id: None,
                command_preview: None,
                notify_policy: Some(ScheduleNotifyPolicy::SilentOnPass),
                all_green: true,
            },
            InboxFilterDecision::Deliver,
        );
        assert!(matches!(decision, InboxFilterDecision::Deliver(_)));

        ctx.fiber().dispose().await;
    }
}
