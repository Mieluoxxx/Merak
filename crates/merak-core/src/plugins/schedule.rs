//! Schedule execution & event emission Cordis service (`"schedules"`).

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use cordis::{Context, CordisError, Inject, Service};
use merak_contracts::{ScheduleRun, ScheduleRunOutcome};

use crate::events::{EVT_SCHEDULE_COMPLETED, ScheduleCompletedEvent};
use crate::store::StoreService;

/// Cordis service managing schedule toggles and immediate runs without directly mutating Inbox.
pub struct ScheduleService {
    ctx: Context,
    store: Arc<StoreService>,
    run_turn: AtomicU64,
}

impl ScheduleService {
    /// Toggle `enabled` on `schedule_id` and update its next-run label.
    pub fn toggle_schedule_enabled(&self, schedule_id: &str) -> Option<String> {
        if !self
            .store
            .read(|snap| snap.schedules.iter().any(|s| s.id == schedule_id))
        {
            return None;
        }
        self.store.write("schedule.toggle_enabled", |snap| {
            let job = snap.schedules.iter_mut().find(|s| s.id == schedule_id)?;
            job.enabled = !job.enabled;
            job.next_run_at = if job.enabled {
                "按 Cron 队列".into()
            } else {
                "已暂停".into()
            };
            Some(format!(
                "{}：{}",
                if job.enabled {
                    "已启用定时任务"
                } else {
                    "已暂停定时任务"
                },
                job.name
            ))
        })
    }

    /// Toggle `notify_policy` between `SilentOnPass` and `AlwaysInbox`.
    pub fn toggle_schedule_policy(&self, schedule_id: &str) -> Option<String> {
        if !self
            .store
            .read(|snap| snap.schedules.iter().any(|s| s.id == schedule_id))
        {
            return None;
        }
        self.store.write("schedule.toggle_policy", |snap| {
            let job = snap.schedules.iter_mut().find(|s| s.id == schedule_id)?;
            job.notify_policy = job.notify_policy.toggle();
            Some(format!("通知策略切为：{}", job.notify_policy.label()))
        })
    }

    /// Execute `schedule_id` immediately, record the run, release the store lock, and emit `EVT_SCHEDULE_COMPLETED`.
    pub fn run_schedule_now(&self, schedule_id: &str) -> Option<String> {
        if !self
            .store
            .read(|snap| snap.schedules.iter().any(|s| s.id == schedule_id))
        {
            return None;
        }

        let turn = self.run_turn.fetch_add(1, Ordering::SeqCst);
        let run_id = self.store.next_id("run");
        let next_outcome = if turn.is_multiple_of(2) {
            ScheduleRunOutcome::AllGreen
        } else {
            ScheduleRunOutcome::HasGaps
        };

        let event = self.store.write("schedule.run_now", |snap| {
            let job = snap.schedules.iter_mut().find(|s| s.id == schedule_id)?;
            let verify_aid = job.runs.iter().find_map(|r| r.verify_artifact_id.clone());
            let summary: String = match (next_outcome, job.notify_policy) {
                (ScheduleRunOutcome::AllGreen, merak_contracts::ScheduleNotifyPolicy::SilentOnPass) => {
                    "手动执行全绿通过（绿灯静默策略生效：未打扰 Inbox）".into()
                }
                (ScheduleRunOutcome::AllGreen, merak_contracts::ScheduleNotifyPolicy::AlwaysInbox) => {
                    "手动执行全绿通过（已按策略推送 Inbox 简报）".into()
                }
                _ => "手动执行发现 1 项需关注 Gap，已推送 Inbox 裁决卡".into(),
            };

            job.last_run_at = "刚刚".into();
            job.last_outcome = next_outcome;
            job.runs.insert(
                0,
                ScheduleRun {
                    id: run_id,
                    ran_at: "刚刚".into(),
                    duration_ms: 1420,
                    outcome: next_outcome,
                    summary: summary.clone(),
                    verify_artifact_id: verify_aid.clone(),
                },
            );

            Some(ScheduleCompletedEvent {
                schedule_id: schedule_id.to_string(),
                project_id: job.project_id.clone(),
                bot_id: job.bot_id.clone(),
                title: format!("定时任务运行结果：{}", job.name),
                summary,
                notify_policy: job.notify_policy,
                all_green: next_outcome == ScheduleRunOutcome::AllGreen,
                target_artifact_id: verify_aid,
                target_task_id: None,
            })
        })?;

        let summary = event.summary.clone();
        self.ctx.emit(EVT_SCHEDULE_COMPLETED, event);
        Some(summary)
    }
}

impl Service for ScheduleService {
    type Config = ();

    fn service_name() -> &'static str {
        "schedules"
    }

    fn inject() -> Inject {
        Inject::new(["store"])
    }

    fn create(ctx: &Context, _config: Self::Config) -> Result<Arc<Self>, CordisError> {
        let store = ctx.service::<StoreService>("store")?;
        Ok(Arc::new(Self {
            ctx: ctx.clone(),
            store,
            run_turn: AtomicU64::new(0),
        }))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use merak_contracts::ScheduleNotifyPolicy;

    use super::*;
    use crate::store::StoreConfig;

    async fn setup_schedules() -> (Context, Arc<ScheduleService>, Arc<StoreService>) {
        let ctx = Context::new();
        ctx.plugin(StoreService::plugin(), StoreConfig::default())
            .await
            .expect("store mounted");
        ctx.plugin(ScheduleService::plugin(), ())
            .await
            .expect("schedules mounted");
        let schedules = ctx
            .get::<ScheduleService>("schedules")
            .expect("schedules service");
        let store = ctx.get::<StoreService>("store").expect("store service");
        (ctx, schedules, store)
    }

    #[tokio::test]
    async fn toggle_schedule_enabled_and_policy() {
        let (_ctx, schedules, store) = setup_schedules().await;

        let msg_off = schedules
            .toggle_schedule_enabled("sch-merak-qa")
            .expect("toggled off");
        assert!(msg_off.contains("已暂停定时任务"));
        store.read(|s| {
            let job = s.schedules.iter().find(|j| j.id == "sch-merak-qa").unwrap();
            assert!(!job.enabled);
            assert_eq!(job.next_run_at, "已暂停");
        });

        let msg_on = schedules
            .toggle_schedule_enabled("sch-merak-qa")
            .expect("toggled on");
        assert!(msg_on.contains("已启用定时任务"));
        store.read(|s| {
            let job = s.schedules.iter().find(|j| j.id == "sch-merak-qa").unwrap();
            assert!(job.enabled);
            assert_eq!(job.next_run_at, "按 Cron 队列");
        });

        let msg_policy = schedules
            .toggle_schedule_policy("sch-merak-qa")
            .expect("policy toggled");
        assert!(msg_policy.contains("每次均进 Inbox"));
        store.read(|s| {
            let job = s.schedules.iter().find(|j| j.id == "sch-merak-qa").unwrap();
            assert_eq!(job.notify_policy, ScheduleNotifyPolicy::AlwaysInbox);
        });

        assert!(schedules.toggle_schedule_enabled("nonexistent").is_none());
        assert!(schedules.toggle_schedule_policy("nonexistent").is_none());
    }

    #[tokio::test]
    async fn run_schedule_now_updates_runs_and_emits_event_without_mutating_inbox() {
        let (ctx, schedules, store) = setup_schedules().await;

        let captured: Arc<Mutex<Vec<ScheduleCompletedEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let captured_clone = Arc::clone(&captured);
        let _listener = ctx
            .on::<ScheduleCompletedEvent, _>(EVT_SCHEDULE_COMPLETED, move |ev| {
                captured_clone.lock().unwrap().push(ev.clone());
            })
            .expect("listener registered");

        let inbox_len_before = store.read(|s| s.inbox.len());
        let runs_len_before = store.read(|s| {
            s.schedules
                .iter()
                .find(|j| j.id == "sch-merak-qa")
                .unwrap()
                .runs
                .len()
        });

        // First run: AllGreen with SilentOnPass
        let summary_1 = schedules
            .run_schedule_now("sch-merak-qa")
            .expect("first run succeeded");
        assert!(summary_1.contains("绿灯静默"));

        // Second run: HasGaps
        let summary_2 = schedules
            .run_schedule_now("sch-merak-qa")
            .expect("second run succeeded");
        assert!(summary_2.contains("Gap"));

        // Third run after toggling to AlwaysInbox: AllGreen with AlwaysInbox summary
        let _ = schedules.toggle_schedule_policy("sch-merak-qa");
        let summary_3 = schedules
            .run_schedule_now("sch-merak-qa")
            .expect("third run succeeded");
        assert!(summary_3.contains("已按策略推送 Inbox 简报"));

        // Store inbox must remain untouched by ScheduleService (InboxService handles EVT_SCHEDULE_COMPLETED).
        store.read(|s| {
            assert_eq!(s.inbox.len(), inbox_len_before);
            let job = s.schedules.iter().find(|j| j.id == "sch-merak-qa").unwrap();
            assert_eq!(job.runs.len(), runs_len_before + 3);
            assert_eq!(job.last_run_at, "刚刚");
            assert_eq!(job.last_outcome, ScheduleRunOutcome::AllGreen);
            assert_eq!(job.runs[0].outcome, ScheduleRunOutcome::AllGreen);
            assert_eq!(job.runs[1].outcome, ScheduleRunOutcome::HasGaps);
            assert_eq!(job.runs[2].outcome, ScheduleRunOutcome::AllGreen);
        });

        let events = captured.lock().unwrap();
        assert_eq!(events.len(), 3);
        assert!(events[0].all_green);
        assert_eq!(events[0].schedule_id, "sch-merak-qa");
        assert_eq!(events[0].notify_policy, ScheduleNotifyPolicy::SilentOnPass);
        assert_eq!(
            events[0].target_artifact_id.as_deref(),
            Some("art-merak-verify-report")
        );
        assert!(!events[1].all_green);
        assert_eq!(events[1].summary, summary_2);
        assert!(events[2].all_green);
        assert_eq!(events[2].notify_policy, ScheduleNotifyPolicy::AlwaysInbox);
        assert_eq!(events[2].summary, summary_3);

        assert!(schedules.run_schedule_now("nonexistent").is_none());
    }
}
