//! Task & Ruling Cordis service (`"tasks"`).

use std::sync::Arc;

use cordis::{Context, CordisError, Inject, Service};
use merak_contracts::{ArtifactComment, TaskStatus};

use crate::events::{EVT_RULING_DISPUTED, RulingDisputedEvent};
use crate::store::StoreService;

/// Cordis service managing Task checklists, status transitions, and autonomous Ruling disputes.
pub struct TaskService {
    ctx: Context,
    store: Arc<StoreService>,
}

impl TaskService {
    /// Toggle completion state of a task checklist item.
    pub fn toggle_checklist(&self, task_id: &str, check_id: &str) {
        self.store.write("task.toggle_checklist", |snap| {
            if let Some(task) = snap.tasks.iter_mut().find(|t| t.id == task_id)
                && let Some(item) = task.checklist.iter_mut().find(|c| c.id == check_id)
            {
                item.done = !item.done;
                task.updated_at = "刚刚".into();
            }
        });
    }

    /// Advance a task status to the next variant in `TaskStatus::next`.
    pub fn cycle_task_status(&self, task_id: &str) -> Option<TaskStatus> {
        self.store.write("task.cycle_status", |snap| {
            let task = snap.tasks.iter_mut().find(|t| t.id == task_id)?;
            task.status = task.status.next();
            task.updated_at = "刚刚".into();
            Some(task.status)
        })
    }

    /// Toggle dispute state on an autonomous Ruling; on new dispute, mark task Waiting,
    /// append an artifact comment, and emit `EVT_RULING_DISPUTED` so `InboxService`
    /// creates the Inbox notification asynchronously from the store write lock.
    pub fn dispute_ruling(&self, task_id: &str, ruling_id: &str) -> Option<String> {
        let (msg, event_opt) = self.store.write("task.dispute_ruling", |snap| {
            let task = snap.tasks.iter_mut().find(|t| t.id == task_id)?;
            let r = task.rulings.iter_mut().find(|r| r.id == ruling_id)?;
            r.disputed = !r.disputed;
            let disputed = r.disputed;

            if !disputed {
                return Some(("已取消 Ruling 异议".to_string(), None));
            }

            task.status = TaskStatus::Waiting;
            task.updated_at = "刚刚".into();

            let dec = r.decision.clone();
            let reason = r.reason.clone();
            let project_id = task.project_id.clone();
            let bot_id = task.linked_bot_id.clone();
            let art_id = task.primary_artifact_id.clone();
            let task_title = task.title.clone();

            if let Some(art) = snap.artifacts.iter_mut().find(|a| a.id == art_id) {
                art.comments.push(ArtifactComment {
                    id: self.store.next_id("cm"),
                    author: "主人".into(),
                    is_bot: false,
                    anchor: format!("Ruling 纠偏 · {dec}"),
                    body: "主人对此自主裁决提出异议，请重新评估替代方案。".into(),
                    timestamp: "刚刚".into(),
                    receipt_ack: false,
                });
            }

            let artifact_id = (!art_id.is_empty()).then_some(art_id);
            let ev = RulingDisputedEvent {
                task_id: task_id.to_string(),
                project_id,
                bot_id,
                ruling_id: ruling_id.to_string(),
                ruling_decision: dec,
                ruling_reason: reason,
                artifact_id,
                task_title,
            };
            Some(("已标记 Ruling 异议并发送批注".to_string(), Some(ev)))
        })?;

        if let Some(ev) = event_opt {
            // Emit outside the store write lock so InboxService can write without deadlocking.
            self.ctx.emit(EVT_RULING_DISPUTED, ev);
        }
        Some(msg)
    }
}

impl Service for TaskService {
    type Config = ();

    fn service_name() -> &'static str {
        "tasks"
    }

    fn inject() -> Inject {
        Inject::from(["store"])
    }

    fn create(ctx: &Context, _config: Self::Config) -> Result<Arc<Self>, CordisError> {
        let store = ctx.service::<StoreService>("store")?;
        Ok(Arc::new(Self {
            ctx: ctx.clone(),
            store,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    use merak_contracts::{InboxKind, InboxStatus};

    use crate::plugins::artifact::ArtifactService;
    use crate::plugins::inbox::InboxService;
    use crate::store::StoreConfig;

    #[tokio::test]
    async fn toggle_checklist_and_cycle_task_status_work() {
        let ctx = Context::new();
        ctx.plugin(StoreService::plugin(), StoreConfig::default())
            .await
            .unwrap();
        ctx.plugin(TaskService::plugin(), ()).await.unwrap();

        let store = ctx.service::<StoreService>("store").unwrap();
        let tasks = ctx.service::<TaskService>("tasks").unwrap();

        let before_done = store.read(|snap| {
            snap.tasks
                .iter()
                .find(|t| t.id == "task-101")
                .unwrap()
                .checklist[1]
                .done
        });
        tasks.toggle_checklist("task-101", "c101-2");
        let after_done = store.read(|snap| {
            snap.tasks
                .iter()
                .find(|t| t.id == "task-101")
                .unwrap()
                .checklist[1]
                .done
        });
        assert_eq!(after_done, !before_done);

        let next_status = tasks.cycle_task_status("task-101").unwrap();
        assert_eq!(next_status, TaskStatus::Review);
        assert_eq!(tasks.cycle_task_status("task-missing"), None);

        ctx.fiber().dispose().await;
    }

    #[tokio::test]
    async fn dispute_ruling_emits_event_without_direct_inbox_mutation_and_toggles() {
        let ctx = Context::new();
        ctx.plugin(StoreService::plugin(), StoreConfig::default())
            .await
            .unwrap();
        ctx.plugin(TaskService::plugin(), ()).await.unwrap();

        let store = ctx.service::<StoreService>("store").unwrap();
        let tasks = ctx.service::<TaskService>("tasks").unwrap();

        let emitted = Arc::new(Mutex::new(Vec::<RulingDisputedEvent>::new()));
        let emitted_capture = Arc::clone(&emitted);
        ctx.on::<RulingDisputedEvent, _>(EVT_RULING_DISPUTED, move |ev| {
            emitted_capture.lock().unwrap().push(ev.clone());
        })
        .unwrap();

        let initial_inbox_len = store.read(|snap| snap.inbox.len());

        // First dispute sets ruling.disputed = true, task status = Waiting, emits event,
        // and leaves snap.inbox untouched when InboxService is not mounted.
        let msg1 = tasks.dispute_ruling("task-101", "rul-101-1").unwrap();
        assert_eq!(msg1, "已标记 Ruling 异议并发送批注");
        store.read(|snap| {
            let task = snap.tasks.iter().find(|t| t.id == "task-101").unwrap();
            assert!(task.rulings[0].disputed);
            assert_eq!(task.status, TaskStatus::Waiting);
            assert_eq!(snap.inbox.len(), initial_inbox_len);
            let art = snap
                .artifacts
                .iter()
                .find(|a| a.id == "art-merak-arch-canvas")
                .unwrap();
            assert!(
                art.comments
                    .last()
                    .unwrap()
                    .anchor
                    .starts_with("Ruling 纠偏 · ")
            );
        });
        assert_eq!(emitted.lock().unwrap().len(), 1);

        // Second call cancels the dispute without emitting another event.
        let msg2 = tasks.dispute_ruling("task-101", "rul-101-1").unwrap();
        assert_eq!(msg2, "已取消 Ruling 异议");
        store.read(|snap| {
            let task = snap.tasks.iter().find(|t| t.id == "task-101").unwrap();
            assert!(!task.rulings[0].disputed);
        });
        assert_eq!(emitted.lock().unwrap().len(), 1);

        ctx.fiber().dispose().await;
    }

    #[tokio::test]
    async fn dispute_ruling_decouples_inbox_creation_via_cordis_event() {
        let ctx = Context::new();
        ctx.plugin(StoreService::plugin(), StoreConfig::default())
            .await
            .unwrap();
        ctx.plugin(ArtifactService::plugin(), ()).await.unwrap();
        ctx.plugin(InboxService::plugin(), ()).await.unwrap();
        ctx.plugin(TaskService::plugin(), ()).await.unwrap();

        let store = ctx.service::<StoreService>("store").unwrap();
        let tasks = ctx.service::<TaskService>("tasks").unwrap();

        let before_len = store.read(|snap| snap.inbox.len());
        let msg = tasks.dispute_ruling("task-101", "rul-101-1").unwrap();
        assert_eq!(msg, "已标记 Ruling 异议并发送批注");

        store.read(|snap| {
            assert_eq!(snap.inbox.len(), before_len + 1);
            let card = &snap.inbox[0];
            assert_eq!(card.kind, InboxKind::InlineComment);
            assert_eq!(card.status, InboxStatus::Settled);
            assert!(!card.receipt_settled);
            assert_eq!(card.source_label, "MRK-101 · 账本纠偏");
            assert_eq!(card.task_id.as_deref(), Some("task-101"));
            assert_eq!(card.artifact_id.as_deref(), Some("art-merak-arch-canvas"));
            assert!(card.title.contains("已对 Ruling「"));
        });

        ctx.fiber().dispose().await;
    }
}
