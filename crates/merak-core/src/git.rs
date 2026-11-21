//! Local Git repository inspection utilities.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::types::{GitRepoStatus, GitWorktreeInfo};

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .filter(|v| !v.is_empty())
        .or_else(|| std::env::var_os("USERPROFILE").filter(|v| !v.is_empty()))
        .map(PathBuf::from)
}

/// Expand a leading `~` or `~/` against the current user's home directory.
pub fn expand_tilde(raw: &str) -> PathBuf {
    let trimmed = raw.trim();
    if trimmed == "~" {
        return home_dir().unwrap_or_else(|| PathBuf::from(trimmed));
    }
    if let Some(rest) = trimmed.strip_prefix("~/")
        && let Some(home) = home_dir()
    {
        return home.join(rest);
    }
    PathBuf::from(trimmed)
}

/// Extract the trailing directory name for display and Fiber naming.
pub fn short_repo_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| path.to_string())
}

fn run_git(dir: &Path, args: &[&str]) -> Option<String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).to_string())
}

fn parse_worktrees(porcelain: &str) -> Vec<GitWorktreeInfo> {
    let mut out = Vec::new();
    let mut cur_path: Option<String> = None;
    let mut cur_head = String::new();
    let mut cur_branch = String::new();

    let flush = |out: &mut Vec<GitWorktreeInfo>,
                 p: &mut Option<String>,
                 h: &mut String,
                 b: &mut String| {
        if let Some(path) = p.take() {
            out.push(GitWorktreeInfo {
                path,
                branch: if b.is_empty() {
                    "detached".into()
                } else {
                    std::mem::take(b)
                },
                head_short: if h.is_empty() {
                    "尚无提交".into()
                } else {
                    std::mem::take(h)
                },
            });
        } else {
            b.clear();
        }
        h.clear();
    };

    for line in porcelain.lines() {
        let line = line.trim();
        if line.is_empty() {
            flush(&mut out, &mut cur_path, &mut cur_head, &mut cur_branch);
            continue;
        }
        if let Some(path) = line.strip_prefix("worktree ") {
            cur_path = Some(path.to_string());
        } else if let Some(sha) = line.strip_prefix("HEAD ") {
            let short = if sha.chars().all(|c| c == '0') {
                "尚无提交".to_string()
            } else {
                sha.chars().take(7).collect()
            };
            cur_head = short;
        } else if let Some(branch_ref) = line.strip_prefix("branch ") {
            cur_branch = branch_ref
                .strip_prefix("refs/heads/")
                .unwrap_or(branch_ref)
                .to_string();
        } else if line == "detached" {
            cur_branch = "detached".into();
        }
    }
    flush(&mut out, &mut cur_path, &mut cur_head, &mut cur_branch);
    out
}

/// Inspect a local filesystem path as a Git repository without panicking on unborn HEAD or missing dirs.
pub fn inspect_repo(raw_path: &str) -> GitRepoStatus {
    let path_buf = expand_tilde(raw_path);
    let display_path = path_buf.to_string_lossy().to_string();

    if !path_buf.exists() {
        return GitRepoStatus {
            path: display_path,
            is_git: false,
            branch: None,
            head_short: None,
            dirty_count: 0,
            remote_origin: None,
            last_commit_subject: None,
            worktrees: vec![],
            error: Some("本地目录不存在".into()),
        };
    }

    let Some(root_raw) = run_git(&path_buf, &["rev-parse", "--show-toplevel"]) else {
        return GitRepoStatus {
            path: display_path,
            is_git: false,
            branch: None,
            head_short: None,
            dirty_count: 0,
            remote_origin: None,
            last_commit_subject: None,
            worktrees: vec![],
            error: Some("该目录尚未初始化为 Git 仓库".into()),
        };
    };

    let repo_root = root_raw.trim().to_string();
    let root_path = Path::new(&repo_root);

    // Prefer `symbolic-ref` first so unborn-HEAD repositories still report their branch name.
    let branch = run_git(root_path, &["symbolic-ref", "--short", "HEAD"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            run_git(root_path, &["rev-parse", "--short", "HEAD"])
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        })
        .unwrap_or_else(|| "HEAD".into());

    let head_short = run_git(root_path, &["rev-parse", "--short", "HEAD"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let remote_origin = run_git(root_path, &["remote", "get-url", "origin"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let dirty_count = run_git(root_path, &["status", "--porcelain"])
        .map(|s| s.lines().filter(|l| !l.trim().is_empty()).count())
        .unwrap_or(0);

    let last_commit_subject = run_git(root_path, &["log", "-1", "--pretty=%s"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let worktrees = run_git(root_path, &["worktree", "list", "--porcelain"])
        .map(|s| parse_worktrees(&s))
        .unwrap_or_default();

    GitRepoStatus {
        path: repo_root,
        is_git: true,
        branch: Some(branch),
        head_short,
        dirty_count,
        remote_origin,
        last_commit_subject,
        worktrees,
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expand_tilde_and_short_name() {
        let expanded = expand_tilde("  ~/workspace/Merak  ");
        if let Some(home) = home_dir() {
            assert_eq!(expanded, home.join("workspace/Merak"));
        } else {
            assert_eq!(expanded, PathBuf::from("~/workspace/Merak"));
        }
        assert_eq!(expand_tilde(" /tmp/demo "), PathBuf::from("/tmp/demo"));
        assert_eq!(short_repo_name("/Users/demo/Merak"), "Merak");
        assert_eq!(short_repo_name("/Users/demo/Merak/"), "Merak");
    }

    #[test]
    fn inspect_current_workspace_if_git() {
        let status = inspect_repo(env!("CARGO_MANIFEST_DIR"));
        if status.is_git {
            assert!(status.branch.is_some());
            assert!(status.error.is_none());
            assert!(!status.worktrees.is_empty());
        }

        let missing = inspect_repo("/tmp/__merak_nonexistent_git_repo_xyz__");
        assert!(!missing.is_git);
        assert!(missing.branch.is_none());
        assert!(missing.error.is_some());
    }
}
