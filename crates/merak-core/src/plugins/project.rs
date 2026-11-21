//! Per-project and child Git-repo Cordis Fiber host (`ProjectHostService`).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use cordis::{BoxFuture, Cleanup, Context, CordisError, Fiber, Inject, PluginDef, Service};
use merak_contracts::{
    Artifact, ArtifactKind, ArtifactVerdict, BotSession, ChatMessage, ChatRole, Project,
    SessionStatus,
};

use crate::events::{
    EVT_GIT_STATUS_UPDATED, EVT_PROJECT_DISPOSED, EVT_PROJECT_MOUNTED, GitStatusEvent,
    ProjectLifecycleEvent,
};
use crate::git::{expand_tilde, inspect_repo, short_repo_name};
use crate::store::StoreService;
use crate::types::{
    CreateProjectInput, CreateProjectOutput, GitFiberInfo, GitRepoStatus, ProjectFiberInfo,
};

pub const PROJECT_COLORS: [u32; 6] = [
    0x3b66f5,
    0x10b981,
    0xf59e0b,
    0x8b5cf6,
    0xef4444,
    0x06b6d4,
];

struct ProjectFiberRecord {
    fiber: Fiber,
    ctx: Context,
    git_fibers: HashMap<String, Fiber>,
}

/// Cordis service (`"projects"`) managing per-project Fibers and child Git-repo Fibers.
pub struct ProjectHostService {
    ctx: Context,
    store: Arc<StoreService>,
    projects: Mutex<HashMap<String, ProjectFiberRecord>>,
    git_statuses: Arc<RwLock<HashMap<String, GitRepoStatus>>>,
    cleanup_count: Arc<AtomicU64>,
}

fn resolve_repo_path(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    expand_tilde(trimmed).to_string_lossy().to_string()
}

fn normalize_project_slug(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c == ' ' || c == '_' { '-' } else { c })
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '-')
        .take(24)
        .collect();
    let trimmed = slug.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "project".to_string()
    } else {
        trimmed
    }
}

fn mount_git_repo_plugin(
    proj_ctx: &Context,
    project_id: &str,
    repo_path: &str,
    store: Arc<StoreService>,
    git_statuses: Arc<RwLock<HashMap<String, GitRepoStatus>>>,
    cleanup_count: Arc<AtomicU64>,
) -> Result<Fiber, CordisError> {
    let pid = project_id.to_string();
    let path = repo_path.to_string();
    let plugin_name = format!("git:{}", short_repo_name(repo_path));

    proj_ctx.try_plugin(
        PluginDef::new(plugin_name, move |repo_ctx, ()| {
            let pid = pid.clone();
            let path = path.clone();
            let store = Arc::clone(&store);
            let git_statuses = Arc::clone(&git_statuses);
            let cleanup_count = Arc::clone(&cleanup_count);

            async move {
                let path_for_cleanup = path.clone();
                let store_for_cleanup = Arc::clone(&store);
                let statuses_for_cleanup = Arc::clone(&git_statuses);
                let cleanup_counter = Arc::clone(&cleanup_count);
                repo_ctx.effect("git-repo-binding", move || {
                    Ok::<_, CordisError>(Some(Cleanup::sync(move || {
                        cleanup_counter.fetch_add(1, Ordering::SeqCst);
                        // Preserve shared repo status if another project still binds this path.
                        let still_bound = store_for_cleanup.read(|snap| {
                            snap.projects
                                .iter()
                                .any(|p| p.repo_paths.iter().any(|r| r == &path_for_cleanup))
                        });
                        if !still_bound {
                            statuses_for_cleanup
                                .write()
                                .unwrap()
                                .remove(&path_for_cleanup);
                        }
                    })))
                })?;

                let inspect_target = path.clone();
                let status = tokio::task::spawn_blocking(move || inspect_repo(&inspect_target))
                    .await
                    .map_err(|e| CordisError::Message(format!("git inspect task failed: {e}")))?;

                let is_git = status.is_git;
                if repo_ctx.fiber().uid().is_some() {
                    git_statuses.write().unwrap().insert(path.clone(), status);
                }
                repo_ctx.emit(
                    EVT_GIT_STATUS_UPDATED,
                    GitStatusEvent {
                        project_id: pid,
                        path,
                        is_git,
                    },
                );
                Ok::<_, CordisError>(None)
            }
        }),
        (),
    )
}

impl ProjectHostService {
    async fn mount_project_fiber(
        &self,
        project_id: String,
        repo_paths: Vec<String>,
    ) -> Result<u64, String> {
        let git_fibers_slot: Arc<Mutex<HashMap<String, Fiber>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let git_fibers_for_apply = Arc::clone(&git_fibers_slot);

        let pid_for_plugin = project_id.clone();
        let store_for_plugin = Arc::clone(&self.store);
        let statuses_for_plugin = Arc::clone(&self.git_statuses);
        let cleanup_for_plugin = Arc::clone(&self.cleanup_count);

        let project_fiber = self
            .ctx
            .try_plugin(
                PluginDef::new(format!("project:{project_id}"), move |proj_ctx, ()| {
                    let pid = pid_for_plugin.clone();
                    let store = Arc::clone(&store_for_plugin);
                    let git_statuses = Arc::clone(&statuses_for_plugin);
                    let cleanup_count = Arc::clone(&cleanup_for_plugin);
                    let repos = repo_paths.clone();
                    let git_fibers_slot = Arc::clone(&git_fibers_for_apply);

                    async move {
                        let uid = proj_ctx.fiber().uid().unwrap_or(0);
                        let pid_cleanup = pid.clone();
                        let ctx_cleanup = proj_ctx.clone();
                        let cleanup_counter = Arc::clone(&cleanup_count);
                        proj_ctx.effect("project-lifecycle", move || {
                            Ok::<_, CordisError>(Some(Cleanup::sync(move || {
                                cleanup_counter.fetch_add(1, Ordering::SeqCst);
                                ctx_cleanup.emit(
                                    EVT_PROJECT_DISPOSED,
                                    ProjectLifecycleEvent {
                                        project_id: pid_cleanup,
                                        fiber_uid: uid,
                                    },
                                );
                            })))
                        })?;

                        let mut child_fibers = Vec::with_capacity(repos.len());
                        for repo_path in repos {
                            let git_fiber = mount_git_repo_plugin(
                                &proj_ctx,
                                &pid,
                                &repo_path,
                                Arc::clone(&store),
                                Arc::clone(&git_statuses),
                                Arc::clone(&cleanup_count),
                            )?;
                            git_fibers_slot
                                .lock()
                                .unwrap()
                                .insert(repo_path, git_fiber.clone());
                            child_fibers.push(git_fiber);
                        }

                        for child in child_fibers {
                            child.wait_settled().await?;
                        }

                        proj_ctx.emit(
                            EVT_PROJECT_MOUNTED,
                            ProjectLifecycleEvent {
                                project_id: pid,
                                fiber_uid: uid,
                            },
                        );
                        Ok::<_, CordisError>(None)
                    }
                }),
                (),
            )
            .map_err(|e| e.to_string())?;

        project_fiber
            .wait_settled()
            .await
            .map_err(|e| e.to_string())?;

        let fiber_uid = project_fiber.uid().unwrap_or(0);
        let proj_ctx = project_fiber.ctx();
        let git_fibers = std::mem::take(&mut *git_fibers_slot.lock().unwrap());
        self.projects.lock().unwrap().insert(
            project_id,
            ProjectFiberRecord {
                fiber: project_fiber,
                ctx: proj_ctx,
                git_fibers,
            },
        );
        Ok(fiber_uid)
    }

    /// Create a new project in `StoreService` and mount its Cordis Project + Git Fibers.
    pub async fn create_project(
        &self,
        input: CreateProjectInput,
    ) -> Result<CreateProjectOutput, String> {
        let clean_name = input.name.trim().to_string();
        if clean_name.is_empty() {
            return Err("请输入项目名称".into());
        }

        let pid = self.store.next_id("proj");
        let aid = self.store.next_id("art-proj");
        let sid = self.store.next_id("ses");
        let msg_id = self.store.next_id("msg");

        let clean_repo = input
            .repo_path
            .as_deref()
            .map(resolve_repo_path)
            .filter(|p| !p.is_empty());
        let repo_paths: Vec<String> = clean_repo.iter().cloned().collect();
        let git_bound = !repo_paths.is_empty();
        let slug = normalize_project_slug(&clean_name);

        let requested_bot = input.bot_id.clone();
        let clean_summary = input.summary.trim().to_string();
        let color_hex = input.color_hex;

        self.store.write(format!("create_project:{pid}"), |snap| {
            let bot = snap
                .bots
                .iter()
                .find(|b| b.id == requested_bot)
                .or_else(|| snap.bots.first())
                .cloned();
            let bot_id = bot
                .as_ref()
                .map(|b| b.id.clone())
                .unwrap_or(requested_bot);
            let bot_name = bot
                .as_ref()
                .map(|b| b.name.clone())
                .unwrap_or_else(|| "Bot".into());
            let bot_role = bot
                .as_ref()
                .map(|b| b.role.clone())
                .unwrap_or_else(|| "协作者".into());

            let summary = if !clean_summary.is_empty() {
                clean_summary
            } else if let Some(ref repo) = clean_repo {
                format!("关联本地代码仓 {repo}，由 {bot_name} 协作推进。")
            } else {
                format!("围绕「{clean_name}」收集资料、绘制决策白板并与 {bot_name} 协作推进。")
            };

            let starter_md = if let Some(ref repo) = clean_repo {
                format!(
                    "# {clean_name}\n\n- 关联代码仓：`{repo}`\n- 默认负责 Bot：{bot_name}\n\n## 工作区说明\n\n可在「代码仓」标签查看实时分支与变更状态，或通过左上角新建按钮发起架构白板与双轨验收。\n"
                )
            } else {
                format!(
                    "# {clean_name}\n\n- 默认负责 Bot：{bot_name}\n\n## 资料与目标\n\n随时记录目标约束、整理参考资料，或让 {bot_name} 将想法沉淀为决策白板与规格文档。\n"
                )
            };

            snap.artifacts.insert(
                0,
                Artifact {
                    id: aid.clone(),
                    project_id: pid.clone(),
                    task_id: None,
                    bot_id: bot_id.clone(),
                    kind: ArtifactKind::SpecDoc,
                    title: format!("{clean_name} · 项目概览"),
                    question: "项目初始概览文档，可随时编辑补充约束与参考上下文".into(),
                    updated_at: "刚刚".into(),
                    verdict: ArtifactVerdict::Settled,
                    options: vec![],
                    canvas_scene_json: None,
                    verify_report: None,
                    doc_markdown: Some(starter_md),
                    comments: vec![],
                },
            );

            snap.projects.push(Project {
                id: pid.clone(),
                name: clean_name.clone(),
                slug,
                summary,
                color_hex,
                repo_paths: repo_paths.clone(),
                default_bot_id: bot_id.clone(),
                skills: vec![],
                active_artifact_id: aid,
            });

            let title = clean_name.chars().take(28).collect::<String>();
            snap.sessions.insert(
                0,
                BotSession {
                    id: sid,
                    title,
                    bot_id,
                    project_id: pid.clone(),
                    status: SessionStatus::Active,
                    updated_at: "刚刚".into(),
                    summary: format!("在「{clean_name}」下与 {bot_name} 实时协作中。"),
                    pinned_artifact_id: None,
                    messages: vec![ChatMessage {
                        id: msg_id,
                        role: ChatRole::Bot,
                        author: bot_name.clone(),
                        body: format!(
                            "主人好，我是 {bot_name}（{bot_role}），当前绑定项目为「{clean_name}」。直接告诉我目标或需要核对的代码/方案，随时可以把讨论一键沉淀为决策白板或规格文档。"
                        ),
                        timestamp: "刚刚".into(),
                        tool_calls: vec![],
                        linked_artifact_id: None,
                    }],
                },
            );
        });

        let fiber_uid = self.mount_project_fiber(pid.clone(), repo_paths).await?;
        Ok(CreateProjectOutput {
            project_id: pid,
            fiber_uid,
            git_bound,
        })
    }

    /// Dispose a project's Cordis Fiber (cascading reverse teardown to child Git Fibers) and remove it from `StoreService`.
    pub async fn dispose_project(&self, project_id: &str) -> Result<bool, String> {
        let record = {
            let mut guard = self.projects.lock().unwrap();
            guard.remove(project_id)
        };
        // Remove from StoreService before disposing Fibers so cleanup checks see the updated binding set.
        let removed_from_store = self.store.write(format!("dispose_project:{project_id}"), |snap| {
            let before = snap.projects.len();
            snap.projects.retain(|p| p.id != project_id);
            snap.projects.len() != before
        });

        if let Some(rec) = record {
            rec.fiber.dispose().await;
            Ok(true)
        } else {
            Ok(removed_from_store)
        }
    }

    /// Bind a local repository path to an existing project and mount a child `GitRepoPlugin` Fiber.
    pub async fn bind_repo(&self, project_id: &str, raw_path: String) -> Result<bool, String> {
        let normalized = resolve_repo_path(&raw_path);
        if normalized.is_empty() {
            return Err("请输入本地仓库路径".into());
        }

        let proj_ctx = {
            let guard = self.projects.lock().unwrap();
            guard.get(project_id).map(|rec| rec.ctx.clone())
        }
        .ok_or_else(|| format!("未找到目标项目: {project_id}"))?;

        let inserted = self.store.write(format!("bind_repo:{project_id}"), |snap| {
            let proj = snap
                .projects
                .iter_mut()
                .find(|p| p.id == project_id)
                .ok_or_else(|| "未找到目标项目".to_string())?;
            if proj.repo_paths.iter().any(|p| p == &normalized) {
                return Ok(false);
            }
            proj.repo_paths.push(normalized.clone());
            Ok::<bool, String>(true)
        })?;

        if !inserted {
            return Ok(false);
        }

        let git_fiber = mount_git_repo_plugin(
            &proj_ctx,
            project_id,
            &normalized,
            Arc::clone(&self.store),
            Arc::clone(&self.git_statuses),
            Arc::clone(&self.cleanup_count),
        )
        .map_err(|e| e.to_string())?;

        if let Err(err) = git_fiber.wait_settled().await {
            git_fiber.dispose().await;
            self.store
                .write(format!("bind_repo_rollback:{project_id}"), |snap| {
                    if let Some(proj) = snap.projects.iter_mut().find(|p| p.id == project_id) {
                        proj.repo_paths.retain(|p| p != &normalized);
                    }
                });
            return Err(err.to_string());
        }

        if let Some(rec) = self.projects.lock().unwrap().get_mut(project_id) {
            rec.git_fibers.insert(normalized, git_fiber);
        }
        Ok(true)
    }

    /// Unbind a repository path from a project and dispose ONLY its child `GitRepoPlugin` Fiber.
    pub async fn unbind_repo(&self, project_id: &str, path: &str) -> Result<bool, String> {
        let normalized = resolve_repo_path(path);
        let removed_path = self.store.write(format!("unbind_repo:{project_id}"), |snap| {
            let proj = snap
                .projects
                .iter_mut()
                .find(|p| p.id == project_id)
                .ok_or_else(|| "未找到目标项目".to_string())?;
            let target = if proj.repo_paths.iter().any(|p| p == path) {
                path.to_string()
            } else if !normalized.is_empty() && proj.repo_paths.iter().any(|p| p == &normalized) {
                normalized.clone()
            } else {
                return Ok(None);
            };
            proj.repo_paths.retain(|p| p != &target);
            Ok::<Option<String>, String>(Some(target))
        })?;

        let Some(target_path) = removed_path else {
            return Ok(false);
        };

        let git_fiber = {
            let mut guard = self.projects.lock().unwrap();
            guard
                .get_mut(project_id)
                .and_then(|rec| rec.git_fibers.remove(&target_path))
        };

        if let Some(fiber) = git_fiber {
            fiber.dispose().await;
        }
        Ok(true)
    }

    /// Move `path` to index 0 of `project.repo_paths` in `StoreService`.
    pub fn set_primary_repo(&self, project_id: &str, path: &str) -> bool {
        let normalized = resolve_repo_path(path);
        self.store
            .write(format!("set_primary_repo:{project_id}"), |snap| {
                let Some(proj) = snap.projects.iter_mut().find(|p| p.id == project_id) else {
                    return false;
                };
                let pos = proj.repo_paths.iter().position(|p| p == path).or_else(|| {
                    (!normalized.is_empty())
                        .then(|| proj.repo_paths.iter().position(|p| p == &normalized))
                        .flatten()
                });
                let Some(pos) = pos else {
                    return false;
                };
                if pos > 0 {
                    let moved = proj.repo_paths.remove(pos);
                    proj.repo_paths.insert(0, moved);
                }
                true
            })
    }

    /// Re-inspect a single repository path off the async runtime and update `git_statuses`.
    pub async fn refresh_repo(&self, path: &str) -> GitRepoStatus {
        let normalized = resolve_repo_path(path);
        let key = if normalized.is_empty() {
            path.trim().to_string()
        } else {
            normalized
        };
        let inspect_target = key.clone();
        let status = tokio::task::spawn_blocking(move || inspect_repo(&inspect_target))
            .await
            .unwrap_or_else(|e| GitRepoStatus {
                path: key.clone(),
                is_git: false,
                branch: None,
                head_short: None,
                dirty_count: 0,
                remote_origin: None,
                last_commit_subject: None,
                worktrees: vec![],
                error: Some(format!("git inspect task failed: {e}")),
            });

        if !key.is_empty() {
            self.git_statuses
                .write()
                .unwrap()
                .insert(key, status.clone());
        }
        status
    }

    /// Refresh all bound repository paths for `project_id`.
    pub async fn refresh_project_repos(&self, project_id: &str) -> Vec<GitRepoStatus> {
        let repo_paths = self
            .store
            .read(|snap| {
                snap.projects
                    .iter()
                    .find(|p| p.id == project_id)
                    .map(|p| p.repo_paths.clone())
            })
            .unwrap_or_default();

        let mut results = Vec::with_capacity(repo_paths.len());
        for path in repo_paths {
            let status = self.refresh_repo(&path).await;
            self.ctx.emit(
                EVT_GIT_STATUS_UPDATED,
                GitStatusEvent {
                    project_id: project_id.to_string(),
                    path,
                    is_git: status.is_git,
                },
            );
            results.push(status);
        }
        results
    }

    pub fn git_status_map(&self) -> HashMap<String, GitRepoStatus> {
        self.git_statuses.read().unwrap().clone()
    }

    /// Format a compact live Git summary for the project's primary bound path.
    pub fn git_summary_for_project(&self, project_id: &str) -> Option<String> {
        let primary_path = self.store.read(|snap| {
            snap.projects
                .iter()
                .find(|p| p.id == project_id)
                .and_then(|p| p.repo_paths.first().cloned())
        })?;

        let name = short_repo_name(&primary_path);
        let statuses = self.git_statuses.read().unwrap();
        match statuses.get(&primary_path) {
            Some(status) if status.is_git => {
                let branch = status.branch.as_deref().unwrap_or("HEAD");
                if status.dirty_count == 0 {
                    Some(format!("{name} @ {branch} (clean)"))
                } else {
                    Some(format!("{name} @ {branch} ({} 改动)", status.dirty_count))
                }
            }
            _ => Some(name),
        }
    }

    /// Return Fiber metadata for all mounted projects, ordered to match `StoreService`.
    pub fn project_fibers_info(&self) -> Vec<ProjectFiberInfo> {
        let projects_snapshot = self.store.read(|snap| snap.projects.clone());
        let records = self.projects.lock().unwrap();
        let statuses = self.git_statuses.read().unwrap();

        projects_snapshot
            .into_iter()
            .filter_map(|proj| {
                let rec = records.get(&proj.id)?;
                let git_fibers = proj
                    .repo_paths
                    .iter()
                    .filter_map(|path| {
                        let gf = rec.git_fibers.get(path)?;
                        let st = statuses.get(path);
                        Some(GitFiberInfo {
                            path: path.clone(),
                            repo_name: short_repo_name(path),
                            fiber_uid: gf.uid().unwrap_or(0),
                            state: gf.state().to_string(),
                            branch: st.and_then(|s| s.branch.clone()),
                            is_git: st.map(|s| s.is_git).unwrap_or(false),
                            dirty_count: st.map(|s| s.dirty_count).unwrap_or(0),
                        })
                    })
                    .collect();

                Some(ProjectFiberInfo {
                    project_id: proj.id,
                    project_name: proj.name,
                    fiber_uid: rec.fiber.uid().unwrap_or(0),
                    state: rec.fiber.state().to_string(),
                    git_fibers,
                })
            })
            .collect()
    }

    pub fn cleanup_count(&self) -> u64 {
        self.cleanup_count.load(Ordering::SeqCst)
    }
}

impl Service for ProjectHostService {
    type Config = ();

    fn service_name() -> &'static str {
        "projects"
    }

    fn inject() -> Inject {
        Inject::new(["store"])
    }

    fn create(ctx: &Context, _config: Self::Config) -> Result<Arc<Self>, CordisError> {
        let store = ctx.service::<StoreService>("store")?;
        Ok(Arc::new(Self {
            ctx: ctx.clone(),
            store,
            projects: Mutex::new(HashMap::new()),
            git_statuses: Arc::new(RwLock::new(HashMap::new())),
            cleanup_count: Arc::new(AtomicU64::new(0)),
        }))
    }

    fn init(self: Arc<Self>, _ctx: &Context) -> BoxFuture<'static, Result<(), CordisError>> {
        Box::pin(async move {
            let projects = self.store.snapshot().projects;
            for proj in projects {
                self.mount_project_fiber(proj.id, proj.repo_paths)
                    .await
                    .map_err(CordisError::Message)?;
            }
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::process::Command;
    use std::sync::atomic::AtomicUsize;

    use cordis::FiberState;

    use super::*;
    use crate::store::StoreConfig;

    async fn setup_projects_service() -> (Context, Arc<StoreService>, Arc<ProjectHostService>) {
        let ctx = Context::new();
        ctx.plugin(StoreService::plugin(), StoreConfig::default())
            .await
            .expect("store plugin active");
        ctx.plugin(ProjectHostService::plugin(), ())
            .await
            .expect("projects plugin active");
        let store = ctx
            .get::<StoreService>("store")
            .expect("store service registered");
        let projects = ctx
            .get::<ProjectHostService>("projects")
            .expect("projects service registered");
        (ctx, store, projects)
    }

    struct TempGitRepo {
        root: PathBuf,
    }

    impl TempGitRepo {
        fn new(suffix: &str) -> Self {
            Self::create(suffix, true)
        }

        fn new_unborn(suffix: &str) -> Self {
            Self::create(suffix, false)
        }

        fn create(suffix: &str, with_commit: bool) -> Self {
            let uniq = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "merak-project-fiber-test-{}-{}-{suffix}",
                std::process::id(),
                uniq
            ));
            std::fs::create_dir_all(&root).expect("create temp git dir");

            let run = |args: &[&str]| {
                let out = Command::new("git")
                    .arg("-C")
                    .arg(&root)
                    .args(args)
                    .output()
                    .expect("run git");
                assert!(
                    out.status.success(),
                    "git {:?} failed: {}",
                    args,
                    String::from_utf8_lossy(&out.stderr)
                );
            };
            run(&["init", "-b", "main"]);
            if with_commit {
                std::fs::write(root.join("README.md"), "# temp repo\n").expect("write readme");
                run(&["add", "README.md"]);
                run(&[
                    "-c",
                    "user.name=MerakTest",
                    "-c",
                    "user.email=test@merak.local",
                    "commit",
                    "-m",
                    "init repo",
                ]);
            }

            Self { root }
        }

        fn path_str(&self) -> String {
            self.root.to_string_lossy().to_string()
        }
    }

    impl Drop for TempGitRepo {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    #[tokio::test]
    async fn seeded_projects_mount_as_active_project_fibers() {
        let (_ctx, store, projects) = setup_projects_service().await;
        let seeded_ids: Vec<String> = store
            .read(|s| s.projects.iter().map(|p| p.id.clone()).collect());
        assert_eq!(
            seeded_ids,
            vec!["proj-merak", "proj-mizar", "proj-notes"]
        );

        let info = projects.project_fibers_info();
        assert_eq!(info.len(), 3);
        assert_eq!(info[0].project_id, "proj-merak");
        assert_eq!(info[0].state, "ACTIVE");
        assert_eq!(info[1].project_id, "proj-mizar");
        assert_eq!(info[1].state, "ACTIVE");
        assert_eq!(info[2].project_id, "proj-notes");
        assert_eq!(info[2].state, "ACTIVE");

        let guard = projects.projects.lock().unwrap();
        let merak_rec = guard.get("proj-merak").expect("proj-merak mounted");
        assert_eq!(merak_rec.fiber.name(), "project:proj-merak");
        assert_eq!(merak_rec.fiber.state(), FiberState::Active);
        assert_eq!(merak_rec.git_fibers.len(), 1);
        let child = merak_rec.git_fibers.values().next().unwrap();
        assert_eq!(child.state(), FiberState::Active);
        assert_eq!(child.parent_fiber().unwrap().uid(), merak_rec.fiber.uid());
    }

    #[tokio::test]
    async fn create_project_blank_and_from_git_repo_mount_fibers_and_live_status() {
        let (ctx, store, projects) = setup_projects_service().await;
        let mounted_events = Arc::new(AtomicUsize::new(0));
        let git_events = Arc::new(AtomicUsize::new(0));
        let mounted_counter = Arc::clone(&mounted_events);
        let git_counter = Arc::clone(&git_events);
        let _h1 = ctx
            .on::<ProjectLifecycleEvent, _>(EVT_PROJECT_MOUNTED, move |_| {
                mounted_counter.fetch_add(1, Ordering::SeqCst);
            })
            .unwrap();
        let _h2 = ctx
            .on::<GitStatusEvent, _>(EVT_GIT_STATUS_UPDATED, move |evt| {
                if evt.is_git {
                    git_counter.fetch_add(1, Ordering::SeqCst);
                }
            })
            .unwrap();

        let blank_err = projects
            .create_project(CreateProjectInput {
                name: "   ".into(),
                summary: "".into(),
                color_hex: PROJECT_COLORS[0],
                bot_id: "bot-arch".into(),
                repo_path: None,
            })
            .await
            .expect_err("empty name rejected");
        assert_eq!(blank_err, "请输入项目名称");

        let blank_out = projects
            .create_project(CreateProjectInput {
                name: "Q4 产品规划".into(),
                summary: "".into(),
                color_hex: PROJECT_COLORS[1],
                bot_id: "bot-arch".into(),
                repo_path: None,
            })
            .await
            .expect("blank project created");
        assert!(!blank_out.git_bound);
        assert!(blank_out.fiber_uid > 0);
        assert!(projects.git_summary_for_project(&blank_out.project_id).is_none());

        let repo = TempGitRepo::new("create");
        let repo_path = repo.path_str();
        let repo_name = short_repo_name(&repo_path);
        let git_out = projects
            .create_project(CreateProjectInput {
                name: "Live Git Project".into(),
                summary: "临时 Git 仓库".into(),
                color_hex: PROJECT_COLORS[2],
                bot_id: "bot-rust".into(),
                repo_path: Some(repo_path.clone()),
            })
            .await
            .expect("git project created");
        assert!(git_out.git_bound);
        assert_eq!(
            projects.git_summary_for_project(&git_out.project_id),
            Some(format!("{repo_name} @ main (clean)"))
        );

        let unborn = TempGitRepo::new_unborn("unborn");
        let unborn_path = unborn.path_str();
        assert!(
            projects
                .bind_repo(&git_out.project_id, unborn_path.clone())
                .await
                .expect("bind unborn repo")
        );
        let statuses = projects.git_status_map();
        let unborn_status = statuses.get(&unborn_path).expect("unborn status recorded");
        assert!(unborn_status.is_git);
        assert_eq!(unborn_status.branch.as_deref(), Some("main"));
        assert!(unborn_status.head_short.is_none());

        std::fs::write(repo.root.join("dirty.txt"), "untracked\n").expect("write dirty file");
        let refreshed = projects.refresh_project_repos(&git_out.project_id).await;
        assert_eq!(refreshed.len(), 2);
        assert!(refreshed[0].is_git);
        assert_eq!(refreshed[0].branch.as_deref(), Some("main"));
        assert_eq!(refreshed[0].dirty_count, 1);
        assert_eq!(
            projects.git_summary_for_project(&git_out.project_id),
            Some(format!("{repo_name} @ main (1 改动)"))
        );

        let proj = store
            .read(|s| s.projects.iter().find(|p| p.id == git_out.project_id).cloned())
            .expect("project persisted in store");
        assert_eq!(proj.slug, "live-git-project");
        assert_eq!(proj.repo_paths, vec![repo_path, unborn_path]);
        assert_eq!(mounted_events.load(Ordering::SeqCst), 2);
        assert!(git_events.load(Ordering::SeqCst) >= 3);
    }

    #[tokio::test]
    async fn unbind_repo_disposes_only_child_git_fiber_keeping_parent_active() {
        let (_ctx, _store, projects) = setup_projects_service().await;
        let repo = TempGitRepo::new("unbind");
        let repo_path = repo.path_str();

        let created = projects
            .create_project(CreateProjectInput {
                name: "Unbind Target".into(),
                summary: "".into(),
                color_hex: PROJECT_COLORS[3],
                bot_id: "bot-arch".into(),
                repo_path: Some(repo_path.clone()),
            })
            .await
            .expect("create project");

        let (parent_fiber, child_fiber) = {
            let guard = projects.projects.lock().unwrap();
            let rec = guard.get(&created.project_id).unwrap();
            (
                rec.fiber.clone(),
                rec.git_fibers.get(&repo_path).unwrap().clone(),
            )
        };

        let cleanup_before = projects.cleanup_count();
        let unbound = projects
            .unbind_repo(&created.project_id, &repo_path)
            .await
            .expect("unbind repo");
        assert!(unbound);

        assert_eq!(child_fiber.state(), FiberState::Disposed);
        assert_eq!(parent_fiber.state(), FiberState::Active);
        assert_eq!(projects.cleanup_count(), cleanup_before + 1);
        assert!(!projects.git_status_map().contains_key(&repo_path));

        let info = projects
            .project_fibers_info()
            .into_iter()
            .find(|p| p.project_id == created.project_id)
            .expect("parent fiber still listed");
        assert_eq!(info.state, "ACTIVE");
        assert!(info.git_fibers.is_empty());
    }

    #[tokio::test]
    async fn dispose_project_cascades_to_children_and_preserves_shared_repo_until_last_unmount() {
        let (ctx, store, projects) = setup_projects_service().await;
        let disposed_events: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let disposed_sink = Arc::clone(&disposed_events);
        let _disp_handle = ctx
            .on::<ProjectLifecycleEvent, _>(EVT_PROJECT_DISPOSED, move |evt| {
                disposed_sink.lock().unwrap().push(evt.project_id.clone());
            })
            .unwrap();
        let repo_shared = TempGitRepo::new("shared");
        let repo_extra = TempGitRepo::new("extra");
        let shared_path = repo_shared.path_str();
        let extra_path = repo_extra.path_str();

        let proj_a = projects
            .create_project(CreateProjectInput {
                name: "Project A".into(),
                summary: "".into(),
                color_hex: PROJECT_COLORS[0],
                bot_id: "bot-arch".into(),
                repo_path: Some(shared_path.clone()),
            })
            .await
            .expect("create project A");

        assert!(
            projects
                .bind_repo(&proj_a.project_id, extra_path.clone())
                .await
                .expect("bind extra")
        );
        assert!(
            !projects
                .bind_repo(&proj_a.project_id, extra_path.clone())
                .await
                .expect("duplicate bind returns false")
        );
        assert!(projects.set_primary_repo(&proj_a.project_id, &extra_path));
        let ordered_paths = store
            .read(|s| {
                s.projects
                    .iter()
                    .find(|p| p.id == proj_a.project_id)
                    .map(|p| p.repo_paths.clone())
            })
            .unwrap();
        assert_eq!(ordered_paths, vec![extra_path.clone(), shared_path.clone()]);

        let proj_b = projects
            .create_project(CreateProjectInput {
                name: "Project B".into(),
                summary: "".into(),
                color_hex: PROJECT_COLORS[4],
                bot_id: "bot-rust".into(),
                repo_path: Some(shared_path.clone()),
            })
            .await
            .expect("create project B");

        let (a_parent, a_children) = {
            let guard = projects.projects.lock().unwrap();
            let rec = guard.get(&proj_a.project_id).unwrap();
            (
                rec.fiber.clone(),
                rec.git_fibers.values().cloned().collect::<Vec<_>>(),
            )
        };
        assert_eq!(a_children.len(), 2);

        let before_a = projects.cleanup_count();
        assert!(
            projects
                .dispose_project(&proj_a.project_id)
                .await
                .expect("dispose A")
        );
        assert_eq!(a_parent.state(), FiberState::Disposed);
        for child in &a_children {
            assert_eq!(child.state(), FiberState::Disposed);
        }
        assert_eq!(projects.cleanup_count(), before_a + 3);
        assert!(!projects.git_status_map().contains_key(&extra_path));
        assert!(projects.git_status_map().contains_key(&shared_path));

        let before_b = projects.cleanup_count();
        assert!(
            projects
                .dispose_project(&proj_b.project_id)
                .await
                .expect("dispose B")
        );
        assert_eq!(projects.cleanup_count(), before_b + 2);
        assert!(!projects.git_status_map().contains_key(&shared_path));
        assert_eq!(
            *disposed_events.lock().unwrap(),
            vec![proj_a.project_id, proj_b.project_id]
        );
    }
}
