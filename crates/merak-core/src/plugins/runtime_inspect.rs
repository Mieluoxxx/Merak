//! Live Cordis Fiber tree & active services introspection (`"runtimeInspect"`).

use std::sync::Arc;

use cordis::{Context, CordisError, Inject, Service};

use crate::store::StoreService;
use crate::types::{CordisRuntimeReport, FiberNodeInfo, ProjectFiberInfo};

/// Cordis service providing live introspection over active services and the Fiber tree.
pub struct RuntimeInspectService {
    ctx: Context,
}

impl RuntimeInspectService {
    /// Snapshot every Fiber registered in Cordis, sorted deterministically by `uid`.
    pub fn list_fibers(&self) -> Vec<FiberNodeInfo> {
        let mut nodes = Vec::new();
        for runtime in self.ctx.registry().values() {
            for fiber in runtime.fibers() {
                let uid = fiber.uid().unwrap_or(0);
                let name = fiber.name();
                let state = format!("{:?}", fiber.state());
                let parent_uid = fiber.parent_fiber().and_then(|p| p.uid());
                let kind = if name.starts_with("project:") {
                    "project"
                } else if name.starts_with("git:") {
                    "git"
                } else {
                    "service"
                }
                .to_string();

                nodes.push(FiberNodeInfo {
                    uid,
                    name,
                    state,
                    parent_uid,
                    kind,
                });
            }
        }
        nodes.sort_by(|a, b| a.uid.cmp(&b.uid).then_with(|| a.name.cmp(&b.name)));
        nodes
    }

    /// Build an aggregate runtime report combining active Cordis services, Fibers, and project summaries.
    pub fn build_report(
        &self,
        projects: Vec<ProjectFiberInfo>,
        cleanup_count: u64,
    ) -> CordisRuntimeReport {
        let active_services = self.ctx.reflect().active_service_names();
        let fibers = self.list_fibers();
        let total_fibers = fibers.len();
        let active_fibers = fibers.iter().filter(|f| f.state == "Active").count();

        CordisRuntimeReport {
            active_services,
            total_fibers,
            active_fibers,
            cleanup_count,
            projects,
            fibers,
        }
    }
}

impl Service for RuntimeInspectService {
    type Config = ();

    fn service_name() -> &'static str {
        "runtimeInspect"
    }

    fn inject() -> Inject {
        Inject::new(["store"])
    }

    fn create(ctx: &Context, _config: Self::Config) -> Result<Arc<Self>, CordisError> {
        let _store = ctx.service::<StoreService>("store")?;
        Ok(Arc::new(Self { ctx: ctx.clone() }))
    }
}

#[cfg(test)]
mod tests {
    use cordis::PluginDef;

    use super::*;
    use crate::plugins::bot_chat::BotChatService;
    use crate::plugins::schedule::ScheduleService;
    use crate::store::StoreConfig;

    #[tokio::test]
    async fn build_report_introspects_mounted_services_and_fiber_kinds() {
        let ctx = Context::new();
        ctx.plugin(StoreService::plugin(), StoreConfig::default())
            .await
            .expect("store mounted");
        ctx.plugin(BotChatService::plugin(), ())
            .await
            .expect("botChat mounted");
        ctx.plugin(ScheduleService::plugin(), ())
            .await
            .expect("schedules mounted");
        ctx.plugin(RuntimeInspectService::plugin(), ())
            .await
            .expect("runtimeInspect mounted");

        // Mount sample project and git fibers to verify kind classification & deterministic uid sorting.
        let project_fiber = ctx
            .plugin(
                PluginDef::<()>::new("project:proj-merak", |sub_ctx, ()| async move {
                    sub_ctx
                        .plugin(
                            PluginDef::<()>::sync("git:/tmp/repo", |_, ()| Ok::<(), CordisError>(())),
                            (),
                        )
                        .await?;
                    Ok::<(), CordisError>(())
                }),
                (),
            )
            .await
            .expect("project fiber active");

        // Mount a pending fiber (missing dependency) to verify active_fibers != total_fibers filtering.
        let _pending_fiber = ctx.plugin(
            PluginDef::<()>::sync("pending-helper", |_, ()| Ok::<(), CordisError>(()))
                .inject(["nonexistentService"]),
            (),
        );

        let inspect = ctx
            .get::<RuntimeInspectService>("runtimeInspect")
            .expect("runtimeInspect service");

        let projects = vec![ProjectFiberInfo {
            project_id: "proj-merak".into(),
            project_name: "Merak 工作台".into(),
            fiber_uid: project_fiber.uid().unwrap_or(0),
            state: format!("{:?}", project_fiber.state()),
            git_fibers: vec![],
        }];

        let report = inspect.build_report(projects.clone(), 3);
        assert_eq!(
            report.active_services,
            vec!["botChat", "runtimeInspect", "schedules", "store"]
        );
        assert_eq!(report.total_fibers, 7);
        assert_eq!(report.active_fibers, 6);
        assert_eq!(report.cleanup_count, 3);
        assert_eq!(report.projects, projects);

        assert!(report.fibers.windows(2).all(|w| w[0].uid <= w[1].uid));
        let proj_node = report
            .fibers
            .iter()
            .find(|f| f.name == "project:proj-merak")
            .expect("project fiber present");
        assert_eq!(proj_node.kind, "project");
        assert_eq!(proj_node.state, "Active");

        let git_node = report
            .fibers
            .iter()
            .find(|f| f.name == "git:/tmp/repo")
            .expect("git fiber present");
        assert_eq!(git_node.kind, "git");
        assert_eq!(git_node.parent_uid, Some(proj_node.uid));
    }
}
