//! End-to-end integration tests for the booted `MerakCore` Cordis microkernel & `MerakCoreHandle`.

use std::process::Command;

use merak_contracts::{ArtifactKind, InboxStatus, ScheduleNotifyPolicy};
use merak_core::{
    CreateProjectInput, MerakCore, MerakCoreHandle, PROJECT_COLORS, SessionDeliverableKind,
    StartSessionInput,
};

fn init_temp_git_repo(name: &str) -> std::path::PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("merak-int-{name}-{nanos}"));
    std::fs::create_dir_all(&dir).unwrap();
    let run = |args: &[&str]| {
        let status = Command::new("git")
            .args(args)
            .current_dir(&dir)
            .status()
            .expect("git command should run");
        assert!(status.success(), "git {args:?} failed");
    };
    run(&["init", "-b", "main"]);
    run(&["config", "user.name", "Merak Test"]);
    run(&["config", "user.email", "merak@example.com"]);
    std::fs::write(dir.join("README.md"), "# Temp Repo\n").unwrap();
    run(&["add", "README.md"]);
    run(&["commit", "-m", "initial commit"]);
    dir
}

#[tokio::test]
async fn cordis_core_boots_all_services_and_project_fibers() {
    let core = MerakCore::boot().await.expect("core boots cleanly");
    let report = core.runtime_report();

    for expected in [
        "artifacts",
        "botChat",
        "inbox",
        "projects",
        "runtimeInspect",
        "schedules",
        "store",
        "tasks",
    ] {
        assert!(
            report.active_services.iter().any(|s| s == expected),
            "missing active service {expected:?} in {:?}",
            report.active_services
        );
    }

    assert_eq!(report.projects.len(), 3);
    assert!(report.projects.iter().all(|p| p.state == "ACTIVE"));
    let merak_fiber = report
        .projects
        .iter()
        .find(|p| p.project_id == "proj-merak")
        .expect("proj-merak mounted");
    assert_eq!(merak_fiber.git_fibers.len(), 1);
    assert_eq!(merak_fiber.git_fibers[0].state, "ACTIVE");

    core.shutdown().await;
}

#[test]
fn handle_end_to_end_project_git_fiber_chat_ruling_schedule_and_cleanup() {
    let repo_dir = init_temp_git_repo("cordis-e2e");
    let repo_path = repo_dir.to_string_lossy().to_string();

    let handle = MerakCoreHandle::boot_default();
    let base_report = handle.runtime_report();
    assert_eq!(base_report.active_services.len(), 8);

    // 1. Create a project bound to a real temporary Git repository -> mounts Project + child Git Fiber.
    let created = handle
        .create_project(CreateProjectInput {
            name: "Cordis Integration Demo".into(),
            summary: String::new(),
            color_hex: PROJECT_COLORS[0],
            bot_id: "bot-arch".into(),
            repo_path: Some(repo_path.clone()),
        })
        .expect("project created");
    assert!(created.git_bound);
    assert!(created.fiber_uid > 0);

    let report_after_create = handle.runtime_report();
    let proj_info = report_after_create
        .projects
        .iter()
        .find(|p| p.project_id == created.project_id)
        .expect("new project fiber visible");
    assert_eq!(proj_info.state, "ACTIVE");
    assert_eq!(proj_info.git_fibers.len(), 1);
    assert!(proj_info.git_fibers[0].is_git);
    assert_eq!(proj_info.git_fibers[0].branch.as_deref(), Some("main"));

    // 2. Sending a chat message on the project's session automatically pulls live Git summary!
    let snap = handle.snapshot();
    let ses = snap
        .sessions
        .iter()
        .find(|s| s.project_id == created.project_id)
        .expect("starter session created");
    let reply = handle
        .send_chat_message(&ses.id, "帮我看下当前 Git 状态和架构风险", None)
        .expect("bot reply returned");
    assert!(!reply.is_empty());
    let updated_ses = handle
        .snapshot()
        .sessions
        .into_iter()
        .find(|s| s.id == ses.id)
        .unwrap();
    let bot_msg = updated_ses.messages.last().unwrap();
    assert!(
        bot_msg
            .tool_calls
            .iter()
            .any(|tc| tc.detail.contains("@ main")),
        "expected live Git branch '@ main' in bot tool call detail, got: {:?}",
        bot_msg.tool_calls
    );

    // 3. Dispute a ruling -> Cordis event bus notifies InboxService to enqueue dispute card.
    let snap = handle.snapshot();
    let (tid, rid) = snap
        .tasks
        .iter()
        .find_map(|t| t.rulings.first().map(|r| (t.id.clone(), r.id.clone())))
        .expect("seeded ruling exists");
    let inbox_before = snap.inbox.len();
    assert!(handle.dispute_ruling(&tid, &rid).is_some());
    assert_eq!(handle.snapshot().inbox.len(), inbox_before + 1);

    // 4. Schedule run honors SilentOnPass waterfall funnel on all-green vs gaps.
    let sid = handle.snapshot().schedules[0].id.clone();
    // Ensure policy starts as SilentOnPass so turn 0 (AllGreen) stays silent.
    let mut job_policy = handle.snapshot().schedules[0].notify_policy;
    if job_policy != ScheduleNotifyPolicy::SilentOnPass {
        handle.toggle_schedule_policy(&sid);
        job_policy = ScheduleNotifyPolicy::SilentOnPass;
    }
    assert_eq!(job_policy, ScheduleNotifyPolicy::SilentOnPass);
    let inbox_before_green = handle.snapshot().inbox.len();
    assert!(handle.run_schedule_now(&sid).is_some());
    assert_eq!(handle.snapshot().inbox.len(), inbox_before_green);

    // Second run alternates to HasGaps -> passes waterfall funnel into Inbox.
    assert!(handle.run_schedule_now(&sid).is_some());
    assert_eq!(handle.snapshot().inbox.len(), inbox_before_green + 1);
    let newest_inbox = handle.snapshot().inbox[0].id.clone();
    assert!(
        handle
            .decide_inbox(&newest_inbox, InboxStatus::Approved, Some("收到".into()))
            .is_some()
    );

    // 5. Start session & promote to artifact smoke check.
    let ses_out = handle
        .start_session(StartSessionInput {
            project_id: created.project_id.clone(),
            bot_id: "bot-arch".into(),
            deliverable: SessionDeliverableKind::DecisionCanvas,
            prompt: "重构路由白板".into(),
        })
        .expect("canvas session starts");
    assert!(
        handle
            .promote_session_to_artifact(&ses.id, ArtifactKind::SpecDoc)
            .is_some()
    );
    assert!(!ses_out.primary_id.is_empty());

    // 6. Unbind repo disposes child Git Fiber; dispose_project cascades parent cleanup!
    let cleanups_before_unbind = handle.runtime_report().cleanup_count;
    assert!(handle.unbind_project_repo(&created.project_id, &repo_path).unwrap());
    let report_after_unbind = handle.runtime_report();
    assert!(report_after_unbind.cleanup_count > cleanups_before_unbind);
    let proj_after_unbind = report_after_unbind
        .projects
        .iter()
        .find(|p| p.project_id == created.project_id)
        .unwrap();
    assert!(proj_after_unbind.git_fibers.is_empty());
    assert_eq!(proj_after_unbind.state, "ACTIVE");

    // Re-bind and then dispose the whole project to verify cascading cleanup.
    assert!(
        handle
            .bind_project_repo(&created.project_id, repo_path.clone())
            .unwrap()
    );
    let cleanups_before_dispose = handle.runtime_report().cleanup_count;
    assert!(handle.dispose_project(&created.project_id).unwrap());
    let report_after_dispose = handle.runtime_report();
    assert!(
        report_after_dispose.cleanup_count >= cleanups_before_dispose + 2,
        "expected both git child and project parent cleanups"
    );
    assert!(
        !report_after_dispose
            .projects
            .iter()
            .any(|p| p.project_id == created.project_id)
    );

    let _ = std::fs::remove_dir_all(&repo_dir);
}
