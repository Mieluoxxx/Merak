//! `merak-core` — Cordis-backed domain microkernel for Merak.

pub mod events;
pub mod git;
pub mod plugins;
pub mod store;
pub mod types;

use std::collections::HashMap;
use std::future::Future;
use std::sync::Arc;

use cordis::{Context, CordisError, Fiber, Service};
use merak_contracts::{
    ArtifactKind, InboxStatus, MerakSnapshot, TaskStatus, seed_snapshot,
};

pub use events::*;
pub use plugins::artifact::ArtifactService;
pub use plugins::bot_chat::BotChatService;
pub use plugins::inbox::InboxService;
pub use plugins::project::{PROJECT_COLORS, ProjectHostService};
pub use plugins::runtime_inspect::RuntimeInspectService;
pub use plugins::schedule::ScheduleService;
pub use plugins::task::TaskService;
pub use store::{StoreConfig, StoreService};
pub use types::*;

/// Booted Cordis microkernel hosting all Merak domain services and per-project Fibers.
pub struct MerakCore {
    ctx: Context,
    root_fibers: Vec<Fiber>,
    store: Arc<StoreService>,
    projects: Arc<ProjectHostService>,
    artifacts: Arc<ArtifactService>,
    inbox: Arc<InboxService>,
    tasks: Arc<TaskService>,
    bot_chat: Arc<BotChatService>,
    schedules: Arc<ScheduleService>,
    runtime_inspect: Arc<RuntimeInspectService>,
}

impl MerakCore {
    /// Boot with the default seeded `MerakSnapshot`.
    pub async fn boot() -> Result<Self, CordisError> {
        Self::boot_with_seed(seed_snapshot()).await
    }

    /// Boot all 8 Cordis services with a custom initial `MerakSnapshot`, awaiting readiness.
    pub async fn boot_with_seed(seed: MerakSnapshot) -> Result<Self, CordisError> {
        let ctx = Context::new();

        let store_fiber = ctx.try_plugin(StoreService::plugin(), StoreService::with_seed(seed))?;
        store_fiber.wait_settled().await?;

        let projects_fiber = ctx.try_plugin(ProjectHostService::plugin(), ())?;
        projects_fiber.wait_settled().await?;

        let artifacts_fiber = ctx.try_plugin(ArtifactService::plugin(), ())?;
        artifacts_fiber.wait_settled().await?;

        let inbox_fiber = ctx.try_plugin(InboxService::plugin(), ())?;
        inbox_fiber.wait_settled().await?;

        let tasks_fiber = ctx.try_plugin(TaskService::plugin(), ())?;
        tasks_fiber.wait_settled().await?;

        let bot_chat_fiber = ctx.try_plugin(BotChatService::plugin(), ())?;
        bot_chat_fiber.wait_settled().await?;

        let schedules_fiber = ctx.try_plugin(ScheduleService::plugin(), ())?;
        schedules_fiber.wait_settled().await?;

        let inspect_fiber = ctx.try_plugin(RuntimeInspectService::plugin(), ())?;
        inspect_fiber.wait_settled().await?;

        let store = ctx
            .get::<StoreService>(StoreService::service_name())
            .ok_or_else(|| CordisError::InactiveService(StoreService::service_name().into()))?;
        let projects = ctx
            .get::<ProjectHostService>(ProjectHostService::service_name())
            .ok_or_else(|| CordisError::InactiveService(ProjectHostService::service_name().into()))?;
        let artifacts = ctx
            .get::<ArtifactService>(ArtifactService::service_name())
            .ok_or_else(|| CordisError::InactiveService(ArtifactService::service_name().into()))?;
        let inbox = ctx
            .get::<InboxService>(InboxService::service_name())
            .ok_or_else(|| CordisError::InactiveService(InboxService::service_name().into()))?;
        let tasks = ctx
            .get::<TaskService>(TaskService::service_name())
            .ok_or_else(|| CordisError::InactiveService(TaskService::service_name().into()))?;
        let bot_chat = ctx
            .get::<BotChatService>(BotChatService::service_name())
            .ok_or_else(|| CordisError::InactiveService(BotChatService::service_name().into()))?;
        let schedules = ctx
            .get::<ScheduleService>(ScheduleService::service_name())
            .ok_or_else(|| CordisError::InactiveService(ScheduleService::service_name().into()))?;
        let runtime_inspect = ctx
            .get::<RuntimeInspectService>(RuntimeInspectService::service_name())
            .ok_or_else(|| {
                CordisError::InactiveService(RuntimeInspectService::service_name().into())
            })?;

        Ok(Self {
            ctx,
            root_fibers: vec![
                store_fiber,
                projects_fiber,
                artifacts_fiber,
                inbox_fiber,
                tasks_fiber,
                bot_chat_fiber,
                schedules_fiber,
                inspect_fiber,
            ],
            store,
            projects,
            artifacts,
            inbox,
            tasks,
            bot_chat,
            schedules,
            runtime_inspect,
        })
    }

    pub fn ctx(&self) -> &Context {
        &self.ctx
    }

    pub fn store(&self) -> &Arc<StoreService> {
        &self.store
    }

    pub fn projects(&self) -> &Arc<ProjectHostService> {
        &self.projects
    }

    pub fn artifacts(&self) -> &Arc<ArtifactService> {
        &self.artifacts
    }

    pub fn inbox(&self) -> &Arc<InboxService> {
        &self.inbox
    }

    pub fn tasks(&self) -> &Arc<TaskService> {
        &self.tasks
    }

    pub fn bot_chat(&self) -> &Arc<BotChatService> {
        &self.bot_chat
    }

    pub fn schedules(&self) -> &Arc<ScheduleService> {
        &self.schedules
    }

    pub fn runtime_inspect(&self) -> &Arc<RuntimeInspectService> {
        &self.runtime_inspect
    }

    pub fn runtime_report(&self) -> CordisRuntimeReport {
        self.runtime_inspect.build_report(
            self.projects.project_fibers_info(),
            self.projects.cleanup_count(),
        )
    }

    /// Dispose all top-level Cordis service Fibers in reverse mount order.
    pub async fn shutdown(&self) {
        for fiber in self.root_fibers.iter().rev() {
            fiber.dispose().await;
        }
    }
}

struct MerakCoreRuntime {
    rt: Option<tokio::runtime::Runtime>,
    core: Arc<MerakCore>,
}

impl Drop for MerakCoreRuntime {
    fn drop(&mut self) {
        if let Some(rt) = self.rt.take() {
            // Avoid Tokio "Cannot drop a runtime in a context where blocking is not allowed"
            // if a caller drops the last handle inside an async worker thread.
            if tokio::runtime::Handle::try_current().is_ok() {
                rt.shutdown_background();
            } else {
                rt.block_on(self.core.shutdown());
                rt.shutdown_background();
            }
        }
    }
}

/// Thread-safe synchronous/async facade for the GPUI shell, owning an isolated Tokio runtime.
#[derive(Clone)]
pub struct MerakCoreHandle {
    inner: Arc<MerakCoreRuntime>,
}

impl MerakCoreHandle {
    /// Boot the Cordis microkernel on an isolated `"merak-cordis-rt"` Tokio runtime with seed data.
    pub fn boot_default() -> Self {
        Self::boot_with_seed(seed_snapshot())
    }

    /// Boot the Cordis microkernel with a custom initial snapshot.
    pub fn boot_with_seed(seed: MerakSnapshot) -> Self {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .thread_name("merak-cordis-rt")
            .enable_all()
            .build()
            .expect("failed to start merak-cordis-rt tokio runtime");

        let core = if tokio::runtime::Handle::try_current().is_ok() {
            std::thread::scope(|s| {
                s.spawn(|| rt.block_on(MerakCore::boot_with_seed(seed)))
                    .join()
                    .expect("merak-core boot thread panicked")
            })
        } else {
            rt.block_on(MerakCore::boot_with_seed(seed))
        }
        .expect("failed to boot Cordis services for MerakCore");

        Self {
            inner: Arc::new(MerakCoreRuntime {
                rt: Some(rt),
                core: Arc::new(core),
            }),
        }
    }

    fn rt(&self) -> &tokio::runtime::Runtime {
        self.inner
            .rt
            .as_ref()
            .expect("merak-cordis-rt runtime already dropped")
    }

    fn block_on<F>(&self, fut: F) -> F::Output
    where
        F: Future + Send,
        F::Output: Send,
    {
        if tokio::runtime::Handle::try_current().is_ok() {
            std::thread::scope(|s| s.spawn(|| self.rt().block_on(fut)).join().unwrap())
        } else {
            self.rt().block_on(fut)
        }
    }

    pub fn snapshot(&self) -> MerakSnapshot {
        self.inner.core.store().snapshot()
    }

    pub fn revision(&self) -> u64 {
        self.inner.core.store().revision()
    }

    pub fn git_cache(&self) -> HashMap<String, GitRepoStatus> {
        self.inner.core.projects().git_status_map()
    }

    pub fn runtime_report(&self) -> CordisRuntimeReport {
        self.inner.core.runtime_report()
    }

    pub fn probe_repo(&self, raw_path: &str) -> GitRepoStatus {
        git::inspect_repo(raw_path)
    }

    pub fn create_project(&self, input: CreateProjectInput) -> Result<CreateProjectOutput, String> {
        let projects = Arc::clone(self.inner.core.projects());
        self.block_on(async move { projects.create_project(input).await })
    }

    pub fn dispose_project(&self, project_id: &str) -> Result<bool, String> {
        let projects = Arc::clone(self.inner.core.projects());
        let pid = project_id.to_string();
        self.block_on(async move { projects.dispose_project(&pid).await })
    }

    pub fn bind_project_repo(&self, project_id: &str, raw_path: String) -> Result<bool, String> {
        let projects = Arc::clone(self.inner.core.projects());
        let pid = project_id.to_string();
        self.block_on(async move { projects.bind_repo(&pid, raw_path).await })
    }

    pub fn unbind_project_repo(&self, project_id: &str, path: &str) -> Result<bool, String> {
        let projects = Arc::clone(self.inner.core.projects());
        let pid = project_id.to_string();
        let path = path.to_string();
        self.block_on(async move { projects.unbind_repo(&pid, &path).await })
    }

    pub fn set_primary_project_repo(&self, project_id: &str, path: &str) -> bool {
        self.inner.core.projects().set_primary_repo(project_id, path)
    }

    pub fn refresh_repo(&self, path: &str) -> GitRepoStatus {
        let projects = Arc::clone(self.inner.core.projects());
        let path = path.to_string();
        self.block_on(async move { projects.refresh_repo(&path).await })
    }

    pub fn refresh_project_repos(&self, project_id: &str) -> Vec<GitRepoStatus> {
        let projects = Arc::clone(self.inner.core.projects());
        let pid = project_id.to_string();
        self.block_on(async move { projects.refresh_project_repos(&pid).await })
    }

    pub fn stage_canvas_option(&self, artifact_id: &str, option_id: &str) {
        self.inner
            .core
            .artifacts()
            .stage_canvas_option(artifact_id, option_id);
    }

    pub fn staged_option_for(&self, artifact_id: &str) -> Option<String> {
        self.inner.core.artifacts().staged_option_for(artifact_id)
    }

    pub fn choose_canvas_option(&self, artifact_id: &str, option_id: &str) -> Option<String> {
        self.inner
            .core
            .artifacts()
            .choose_canvas_option(artifact_id, option_id)
    }

    pub fn verdict_human_claim(&self, artifact_id: &str, claim_id: &str, pass: bool) -> Option<String> {
        self.inner
            .core
            .artifacts()
            .verdict_human_claim(artifact_id, claim_id, pass)
    }

    pub fn waive_verify_gap(&self, artifact_id: &str, gap_id: &str) -> Option<String> {
        self.inner
            .core
            .artifacts()
            .waive_verify_gap(artifact_id, gap_id)
    }

    pub fn spawn_task_from_gap(&self, artifact_id: &str, gap_id: &str) -> Option<String> {
        self.inner
            .core
            .artifacts()
            .spawn_task_from_gap(artifact_id, gap_id)
    }

    pub fn pin_artifact_comment(&self, artifact_id: &str, anchor: &str, body: &str) -> bool {
        self.inner
            .core
            .artifacts()
            .pin_artifact_comment(artifact_id, anchor, body)
    }

    pub fn ack_artifact_comment(&self, artifact_id: &str, comment_id: &str) -> Option<String> {
        self.inner
            .core
            .artifacts()
            .ack_artifact_comment(artifact_id, comment_id)
    }

    pub fn toggle_checklist(&self, task_id: &str, check_id: &str) {
        self.inner.core.tasks().toggle_checklist(task_id, check_id);
    }

    pub fn cycle_task_status(&self, task_id: &str) -> Option<TaskStatus> {
        self.inner.core.tasks().cycle_task_status(task_id)
    }

    pub fn dispute_ruling(&self, task_id: &str, ruling_id: &str) -> Option<String> {
        self.inner.core.tasks().dispute_ruling(task_id, ruling_id)
    }

    pub fn decide_inbox(
        &self,
        id: &str,
        status: InboxStatus,
        reply: Option<String>,
    ) -> Option<String> {
        self.inner.core.inbox().decide_inbox(id, status, reply)
    }

    pub fn settle_inbox_canvas_decision(
        &self,
        inbox_id: &str,
        reply: Option<String>,
    ) -> Option<String> {
        self.inner
            .core
            .inbox()
            .settle_inbox_canvas_decision(inbox_id, reply)
    }

    pub fn reply_to_inbox(&self, inbox_id: &str, raw: &str) -> bool {
        self.inner.core.inbox().reply_to_inbox(inbox_id, raw)
    }

    pub fn toggle_schedule_enabled(&self, schedule_id: &str) -> Option<String> {
        self.inner
            .core
            .schedules()
            .toggle_schedule_enabled(schedule_id)
    }

    pub fn toggle_schedule_policy(&self, schedule_id: &str) -> Option<String> {
        self.inner
            .core
            .schedules()
            .toggle_schedule_policy(schedule_id)
    }

    pub fn run_schedule_now(&self, schedule_id: &str) -> Option<String> {
        self.inner.core.schedules().run_schedule_now(schedule_id)
    }

    pub fn start_session(&self, input: StartSessionInput) -> Option<StartSessionOutput> {
        self.inner.core.bot_chat().start_session(input)
    }

    pub fn ensure_bot_session(&self, bot_id: &str) -> String {
        self.inner.core.bot_chat().ensure_bot_session(bot_id)
    }

    pub fn create_bot_session(
        &self,
        bot_id: &str,
        project_id: &str,
        title: Option<&str>,
    ) -> String {
        self.inner
            .core
            .bot_chat()
            .create_bot_session(bot_id, project_id, title)
    }

    pub fn active_session_id_for_bot(&self, bot_id: &str) -> Option<String> {
        self.inner
            .core
            .bot_chat()
            .active_session_id_for_bot(bot_id)
    }

    pub fn select_session(&self, sid: &str) {
        self.inner.core.bot_chat().select_session(sid);
    }

    pub fn send_chat_message(
        &self,
        sid: &str,
        raw: &str,
        git_summary_override: Option<String>,
    ) -> Option<String> {
        let git_summary = git_summary_override.or_else(|| {
            self.inner
                .core
                .bot_chat()
                .session_project_id(sid)
                .and_then(|pid| self.inner.core.projects().git_summary_for_project(&pid))
        });
        self.inner
            .core
            .bot_chat()
            .send_chat_message(sid, raw, git_summary)
    }

    pub fn promote_session_to_artifact(
        &self,
        sid: &str,
        kind: ArtifactKind,
    ) -> Option<(String, String)> {
        self.inner
            .core
            .bot_chat()
            .promote_session_to_artifact(sid, kind)
    }
}
