//! Shared pure Rust data types exchanged between Cordis services and the GPUI shell.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitWorktreeInfo {
    pub path: String,
    pub branch: String,
    pub head_short: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitRepoStatus {
    pub path: String,
    pub is_git: bool,
    pub branch: Option<String>,
    pub head_short: Option<String>,
    pub dirty_count: usize,
    pub remote_origin: Option<String>,
    pub last_commit_subject: Option<String>,
    pub worktrees: Vec<GitWorktreeInfo>,
    pub error: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionDeliverableKind {
    FreeChat,
    DecisionCanvas,
    VerifyReport,
    SpecDoc,
    Schedule,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CreateProjectInput {
    pub name: String,
    pub summary: String,
    pub color_hex: u32,
    pub bot_id: String,
    pub repo_path: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CreateProjectOutput {
    pub project_id: String,
    pub fiber_uid: u64,
    pub git_bound: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StartSessionInput {
    pub project_id: String,
    pub bot_id: String,
    pub deliverable: SessionDeliverableKind,
    pub prompt: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StartSessionOutput {
    pub kind: SessionDeliverableKind,
    pub primary_id: String,
    pub extra_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitFiberInfo {
    pub path: String,
    pub repo_name: String,
    pub fiber_uid: u64,
    pub state: String,
    pub branch: Option<String>,
    pub is_git: bool,
    pub dirty_count: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectFiberInfo {
    pub project_id: String,
    pub project_name: String,
    pub fiber_uid: u64,
    pub state: String,
    pub git_fibers: Vec<GitFiberInfo>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FiberNodeInfo {
    pub uid: u64,
    pub name: String,
    pub state: String,
    pub parent_uid: Option<u64>,
    pub kind: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CordisRuntimeReport {
    pub active_services: Vec<String>,
    pub total_fibers: usize,
    pub active_fibers: usize,
    pub cleanup_count: u64,
    pub projects: Vec<ProjectFiberInfo>,
    pub fibers: Vec<FiberNodeInfo>,
}
