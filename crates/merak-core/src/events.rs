//! Shared Cordis event names and payloads exchanged between Merak domain plugins.

use merak_contracts::{InboxKind, ScheduleNotifyPolicy};

pub const EVT_SNAPSHOT_CHANGED: &str = "merak/snapshot-changed";
pub const EVT_PROJECT_MOUNTED: &str = "merak/project-mounted";
pub const EVT_PROJECT_DISPOSED: &str = "merak/project-disposed";
pub const EVT_GIT_STATUS_UPDATED: &str = "merak/git-status-updated";
pub const EVT_RULING_DISPUTED: &str = "merak/ruling-disputed";
pub const EVT_CANVAS_DECIDED: &str = "merak/canvas-decided";
pub const EVT_SCHEDULE_COMPLETED: &str = "merak/schedule-completed";
pub const EVT_INBOX_FILTER: &str = "merak/inbox/filter";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotChangedEvent {
    pub revision: u64,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectLifecycleEvent {
    pub project_id: String,
    pub fiber_uid: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitStatusEvent {
    pub project_id: String,
    pub path: String,
    pub is_git: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RulingDisputedEvent {
    pub task_id: String,
    pub project_id: String,
    pub bot_id: String,
    pub ruling_id: String,
    pub ruling_decision: String,
    pub ruling_reason: String,
    pub artifact_id: Option<String>,
    pub task_title: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanvasDecidedEvent {
    pub artifact_id: String,
    pub option_id: String,
    pub option_label: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScheduleCompletedEvent {
    pub schedule_id: String,
    pub project_id: String,
    pub bot_id: String,
    pub title: String,
    pub summary: String,
    pub notify_policy: ScheduleNotifyPolicy,
    pub all_green: bool,
    pub target_artifact_id: Option<String>,
    pub target_task_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InboxCandidate {
    pub project_id: String,
    pub bot_id: String,
    pub kind: InboxKind,
    pub title: String,
    pub summary: String,
    pub source_label: String,
    pub artifact_id: Option<String>,
    pub task_id: Option<String>,
    pub schedule_id: Option<String>,
    pub command_preview: Option<String>,
    pub notify_policy: Option<ScheduleNotifyPolicy>,
    pub all_green: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InboxFilterDecision {
    Deliver(InboxCandidate),
    Suppress { reason: String },
}
