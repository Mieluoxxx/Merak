use std::path::Path;

#[allow(unused_imports)]
pub use merak_core::git::{expand_tilde, short_repo_name};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitWorktreeInfo {
    pub path: String,
    pub branch: String,
    pub head_short: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitRepoStatus {
    pub path: String,
    pub exists: bool,
    pub is_git_repo: bool,
    pub repo_root: Option<String>,
    pub branch: String,
    pub head_short: String,
    pub remote_url: Option<String>,
    pub dirty_count: usize,
    pub last_commit_subject: Option<String>,
    pub worktrees: Vec<GitWorktreeInfo>,
    pub error: Option<String>,
}

impl From<merak_core::GitWorktreeInfo> for GitWorktreeInfo {
    fn from(wt: merak_core::GitWorktreeInfo) -> Self {
        Self {
            path: wt.path,
            branch: wt.branch,
            head_short: wt.head_short,
        }
    }
}

impl From<merak_core::GitRepoStatus> for GitRepoStatus {
    fn from(core: merak_core::GitRepoStatus) -> Self {
        let exists = core.is_git || (!core.path.is_empty() && Path::new(&core.path).exists());
        let repo_root = core.is_git.then(|| core.path.clone());
        let branch = core
            .branch
            .unwrap_or_else(|| if core.is_git { "HEAD".into() } else { String::new() });
        let head_short = core.head_short.unwrap_or_else(|| {
            if core.is_git {
                "------".into()
            } else {
                String::new()
            }
        });

        Self {
            path: core.path,
            exists,
            is_git_repo: core.is_git,
            repo_root,
            branch,
            head_short,
            remote_url: core.remote_origin,
            dirty_count: core.dirty_count,
            last_commit_subject: core.last_commit_subject,
            worktrees: core.worktrees.into_iter().map(GitWorktreeInfo::from).collect(),
            error: core.error,
        }
    }
}

pub fn inspect_repo(raw_path: &str) -> GitRepoStatus {
    GitRepoStatus::from(merak_core::git::inspect_repo(raw_path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inspect_current_workspace_repo() {
        let status = inspect_repo(env!("CARGO_MANIFEST_DIR"));
        assert!(status.exists);
        assert!(status.is_git_repo);
        assert!(!status.branch.is_empty());
        assert!(status.repo_root.is_some());
    }

    #[test]
    fn inspect_nonexistent_path_gracefully() {
        let status = inspect_repo("/tmp/__merak_nonexistent_git_repo_xyz__");
        assert!(!status.exists);
        assert!(!status.is_git_repo);
        assert!(status.error.is_some());
    }
}
