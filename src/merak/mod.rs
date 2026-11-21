pub mod bots;
pub mod chat;
pub mod components;
pub mod decision_pane;
pub mod git_repo;
pub mod inbox;
pub mod motion;
pub mod overlays;
pub mod project;
pub mod schedules;
pub mod session;
pub mod settings_view;
pub mod sidebar;
pub mod state;
pub mod tasks;

use crate::app::{
    CloseWindow, FocusBots, FocusInbox, FocusProject1, FocusProject2, FocusSchedules, FocusTasks,
    FocusVerifyTab, NewProject, OpenCommandPalette, OpenQuickCapture, OpenSettings, Quit,
    ToggleExpandDecisionPane, ToggleSidebar, ToggleThemeMode, HEADER_H,
};
use crate::board::BoardView;
use crate::editor::view::Editor;
use crate::input::{TextField, TextFieldEvent};
use crate::native_header::NativeSidebar;
use crate::store::{PageWidth, Store};
use crate::table::{BaseState, TableRef, TableView};
use crate::theme::{self, craft, Theme};
use crate::ui::{self, TipExt, TitleBarExt, ToastKind};
use crate::whiteboard::Board;
use gpui::{prelude::FluentBuilder, *};
use git_repo::GitRepoStatus;
use merak_contracts::{ArtifactKind, DecisionPaneTab, InboxStatus};
use motion::{MotionTrack, DRAWER_SPRING, PILL_SPRING, SIDEBAR_SPRING};
use overlays::PaletteTarget;
use state::{
    BotViewTab, NewProjectMode, PrimaryNav, ProjectTab, RailSection, SettingsSection,
    WorkbenchState, PROJECT_COLORS,
};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use web_time::Instant;

#[derive(Clone, PartialEq)]
struct ViewKey {
    decision_open: bool,
    nav: PrimaryNav,
    project_tab: ProjectTab,
    artifact_id: String,
    decision_tab: DecisionPaneTab,
}

pub struct MerakWorkspace {
    pub state: WorkbenchState,
    pub focus: FocusHandle,
    pub native_sidebar: NativeSidebar,
    pub sidebar_anim: MotionTrack,
    pub rail_pill_anim: MotionTrack,
    pub sub_pill_anim: MotionTrack,
    pub comments_drawer_anim: MotionTrack,
    pub task_drawer_anim: MotionTrack,
    pub schedule_drawer_anim: MotionTrack,
    last_anim_frame: Option<Instant>,
    last_rail: RailSection,
    last_view_key: ViewKey,
    last_palette_open: bool,
    last_new_project_open: bool,
    last_inbox_id: String,
    last_in_settings: bool,
    last_settings_section: SettingsSection,
    pub view_epoch: u64,
    pub rail_epoch: u64,
    pub palette_epoch: u64,
    pub new_project_epoch: u64,
    pub mail_epoch: u64,
    pub settings_epoch: u64,
    pub artifact_editors: HashMap<String, Entity<Editor>>,
    pub artifact_boards: HashMap<String, Entity<BoardView>>,
    pub artifact_board_thumbs: HashMap<String, Arc<Board>>,
    pub tasks_table: Option<Entity<TableView>>,
    pub comment_input: Entity<TextField>,
    pub palette_input: Entity<TextField>,
    pub session_input: Entity<TextField>,
    pub chat_input: Entity<TextField>,
    pub git_repo_input: Entity<TextField>,
    pub new_project_name_input: Entity<TextField>,
    pub new_project_summary_input: Entity<TextField>,
    pub new_project_repo_input: Entity<TextField>,
    pub new_project_repo_probe: Option<GitRepoStatus>,
    pub new_project_repo_probing: bool,
    pub mail_reply_input: Entity<TextField>,
    pub settings_search_input: Entity<TextField>,
    pub git_cache: HashMap<String, GitRepoStatus>,
    pub toast: Option<(ToastKind, SharedString, Instant)>,
    toast_task: Option<Task<()>>,
    _subs: Vec<Subscription>,
}

impl MerakWorkspace {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let state = WorkbenchState::new();
        let comment_input = cx.new(|cx| TextField::new("写下批注 (Enter 提交)...", cx));
        let palette_input = cx.new(|cx| TextField::new("搜索项目、产物、任务或定时调度...", cx));
        let session_input = cx.new(|cx| {
            let mut f = TextField::new("描述目标、贴入问题，或交给 Bot 画出决策方案...", cx);
            f.size = 15.;
            f.line_height = 23.;
            f.wrap = true;
            f
        });
        let mail_reply_input = cx.new(|cx| TextField::new("写一句行内批注或修订意见 (Enter 发送回执)...", cx));
        let settings_search_input = cx.new(|cx| TextField::new("搜索", cx));
        let chat_input = cx.new(|cx| {
            let mut f = TextField::new("发一条消息给 Bot，直接追问、纠偏或贴入任务目标 (Enter 发送)...", cx);
            f.size = 14.;
            f.line_height = 22.;
            f.wrap = true;
            f
        });
        let git_repo_input = cx.new(|cx| TextField::new("输入本机 Git 仓库路径，例如 ~/workspace/my-repo (Enter 绑定)...", cx));
        let new_project_name_input = cx.new(|cx| TextField::new("例如：Q4 产品规划、论文调研、新应用原型...", cx));
        let new_project_summary_input = cx.new(|cx| TextField::new("一句话说明项目目标，帮助 Bot 更快进入上下文（可留空）", cx));
        let new_project_repo_input = cx.new(|cx| TextField::new("输入或选择本地 Git 仓库路径，如 ~/workspace/repo", cx));

        let subs = vec![
            cx.subscribe_in(&comment_input, window, |this, _, ev: &TextFieldEvent, window, cx| {
                if matches!(ev, TextFieldEvent::Submit) {
                    this.submit_artifact_comment("产物批注", window, cx);
                }
            }),
            cx.subscribe_in(&palette_input, window, |this, _, ev: &TextFieldEvent, window, cx| {
                match ev {
                    TextFieldEvent::Changed => {
                        this.state.palette_selected = 0;
                        cx.notify();
                    }
                    TextFieldEvent::Down => {
                        let len = overlays::matching_hits(this, cx).len();
                        if len > 0 {
                            this.state.palette_selected = (this.state.palette_selected + 1) % len;
                            cx.notify();
                        }
                    }
                    TextFieldEvent::Up => {
                        let len = overlays::matching_hits(this, cx).len();
                        if len > 0 {
                            this.state.palette_selected = (this.state.palette_selected + len - 1) % len;
                            cx.notify();
                        }
                    }
                    TextFieldEvent::Submit => {
                        let hits = overlays::matching_hits(this, cx);
                        if let Some(hit) = hits.get(this.state.palette_selected) {
                            let target = hit.target.clone();
                            this.apply_palette_target(target, window, cx);
                        }
                    }
                    TextFieldEvent::Cancel => {
                        this.state.palette_open = false;
                        window.focus(&this.focus, cx);
                        cx.notify();
                    }
                    _ => {}
                }
            }),
            cx.subscribe_in(&session_input, window, |this, _, ev: &TextFieldEvent, window, cx| {
                match ev {
                    TextFieldEvent::Changed => cx.notify(),
                    TextFieldEvent::Submit => this.submit_new_session(window, cx),
                    TextFieldEvent::Cancel => {
                        if this.state.session_picker.take().is_some() {
                            cx.notify();
                        } else {
                            this.state.nav = this.state.last_non_session_nav.clone();
                            window.focus(&this.focus, cx);
                            cx.notify();
                        }
                    }
                    _ => {}
                }
            }),
            cx.subscribe_in(&mail_reply_input, window, |this, _, ev: &TextFieldEvent, window, cx| {
                match ev {
                    TextFieldEvent::Changed => cx.notify(),
                    TextFieldEvent::Submit => this.submit_inbox_reply_only(window, cx),
                    TextFieldEvent::Cancel => {
                        window.focus(&this.focus, cx);
                        cx.notify();
                    }
                    _ => {}
                }
            }),
            cx.subscribe_in(&settings_search_input, window, |this, _, ev: &TextFieldEvent, window, cx| {
                match ev {
                    TextFieldEvent::Changed => cx.notify(),
                    TextFieldEvent::Cancel => {
                        this.settings_search_input.update(cx, |f, cx| f.set_text("", cx));
                        window.focus(&this.focus, cx);
                        cx.notify();
                    }
                    _ => {}
                }
            }),
            cx.subscribe_in(&chat_input, window, |this, _, ev: &TextFieldEvent, window, cx| {
                match ev {
                    TextFieldEvent::Changed => cx.notify(),
                    TextFieldEvent::Submit => this.submit_chat_message(window, cx),
                    TextFieldEvent::Cancel => {
                        window.focus(&this.focus, cx);
                        cx.notify();
                    }
                    _ => {}
                }
            }),
            cx.subscribe_in(&git_repo_input, window, |this, _, ev: &TextFieldEvent, window, cx| {
                if matches!(ev, TextFieldEvent::Submit) {
                    this.bind_git_repo_from_input(window, cx);
                }
            }),
            cx.subscribe_in(&new_project_name_input, window, |this, _, ev: &TextFieldEvent, window, cx| {
                match ev {
                    TextFieldEvent::Changed => cx.notify(),
                    TextFieldEvent::Submit => this.submit_new_project(window, cx),
                    TextFieldEvent::Cancel => this.close_new_project_modal(window, cx),
                    _ => {}
                }
            }),
            cx.subscribe_in(&new_project_summary_input, window, |this, _, ev: &TextFieldEvent, window, cx| {
                match ev {
                    TextFieldEvent::Changed => cx.notify(),
                    TextFieldEvent::Submit => this.submit_new_project(window, cx),
                    TextFieldEvent::Cancel => this.close_new_project_modal(window, cx),
                    _ => {}
                }
            }),
            cx.subscribe_in(&new_project_repo_input, window, |this, _, ev: &TextFieldEvent, window, cx| {
                match ev {
                    TextFieldEvent::Changed => {
                        this.new_project_repo_probe = None;
                        cx.notify();
                    }
                    TextFieldEvent::Submit => this.probe_new_project_repo(window, cx),
                    TextFieldEvent::Cancel => this.close_new_project_modal(window, cx),
                    _ => {}
                }
            }),
        ];

        // Parse seeded Excalidraw thumbnails once so Gallery cards paint without per-frame JSON work.
        let mut artifact_board_thumbs = HashMap::new();
        for art in &state.snapshot.artifacts {
            if let Some(json) = art.canvas_scene_json.as_deref()
                && let Some(board) = Board::from_scene(json, 480.)
            {
                artifact_board_thumbs.insert(art.id.clone(), Arc::new(board));
            }
        }

        let init_rail = state.rail;
        let init_view_key = Self::view_key_for(&state);
        let init_sidebar_w = if state.sidebar_open { state.sidebar_width } else { 0.0 };
        let init_rail_y = Self::rail_index(state.rail) as f32 * sidebar::RAIL_STRIDE;
        let init_sub_y = Self::sub_index_for(&state) as f32 * sidebar::SUB_ROW_STRIDE;
        let init_comments_w = if state.comments_drawer_open { 320.0 } else { 0.0 };
        let init_task_w = if state.task_inspector_open { 380.0 } else { 0.0 };
        let init_sched_w = if state.schedule_inspector_open { 360.0 } else { 0.0 };
        let init_palette_open = state.palette_open;
        let init_new_project_open = state.new_project_open;
        let init_inbox_id = state.selected_inbox_id.clone();
        let init_in_settings = state.nav == PrimaryNav::Settings;
        let init_settings_section = state.settings_section;

        let ws = Self {
            state,
            focus: cx.focus_handle(),
            native_sidebar: NativeSidebar::default(),
            sidebar_anim: MotionTrack::new(SIDEBAR_SPRING, init_sidebar_w),
            rail_pill_anim: MotionTrack::new(PILL_SPRING, init_rail_y),
            sub_pill_anim: MotionTrack::new(PILL_SPRING, init_sub_y),
            comments_drawer_anim: MotionTrack::new(DRAWER_SPRING, init_comments_w),
            task_drawer_anim: MotionTrack::new(DRAWER_SPRING, init_task_w),
            schedule_drawer_anim: MotionTrack::new(DRAWER_SPRING, init_sched_w),
            last_anim_frame: None,
            last_rail: init_rail,
            last_view_key: init_view_key,
            last_palette_open: init_palette_open,
            last_new_project_open: init_new_project_open,
            last_inbox_id: init_inbox_id,
            last_in_settings: init_in_settings,
            last_settings_section: init_settings_section,
            view_epoch: 0,
            rail_epoch: 0,
            palette_epoch: 0,
            new_project_epoch: 0,
            mail_epoch: 0,
            settings_epoch: 0,
            artifact_editors: HashMap::new(),
            artifact_boards: HashMap::new(),
            artifact_board_thumbs,
            tasks_table: None,
            comment_input,
            palette_input,
            session_input,
            chat_input,
            git_repo_input,
            new_project_name_input,
            new_project_summary_input,
            new_project_repo_input,
            new_project_repo_probe: None,
            new_project_repo_probing: false,
            mail_reply_input,
            settings_search_input,
            git_cache: HashMap::new(),
            toast: None,
            toast_task: None,
            _subs: subs,
        };
        ws.refresh_all_project_git_repos(window, cx);
        ws.focus.focus(window, cx);
        ws
    }

    fn rail_index(rail: RailSection) -> usize {
        match rail {
            RailSection::Home => 0,
            RailSection::Projects => 1,
            RailSection::Bots => 2,
        }
    }

    fn sub_index_for(state: &WorkbenchState) -> usize {
        match state.rail {
            RailSection::Home => match state.nav {
                PrimaryNav::Inbox => 0,
                PrimaryNav::Tasks => 1,
                PrimaryNav::Schedules => 2,
                _ => 0,
            },
            RailSection::Projects => state
                .snapshot
                .projects
                .iter()
                .position(|p| PrimaryNav::Project(p.id.clone()) == state.nav)
                .unwrap_or(0),
            RailSection::Bots => state
                .snapshot
                .bots
                .iter()
                .position(|b| PrimaryNav::Bot(b.id.clone()) == state.nav)
                .unwrap_or(0),
        }
    }

    fn view_key_for(state: &WorkbenchState) -> ViewKey {
        ViewKey {
            decision_open: state.decision_pane_open,
            nav: state.nav.clone(),
            project_tab: state.project_tab,
            artifact_id: state.selected_artifact_id.clone(),
            decision_tab: state.decision_tab,
        }
    }

    fn sync_and_step_motion(&mut self, window: &mut Window, cx: &App) {
        let reduce_motion = cx.reduce_motion();

        if self.state.rail != self.last_rail {
            self.last_rail = self.state.rail;
            self.rail_epoch += 1;
            // Changing realms replaces the sub-sidebar list, so snap instead of sliding across lists.
            self.sub_pill_anim
                .snap(Self::sub_index_for(&self.state) as f32 * sidebar::SUB_ROW_STRIDE);
        }

        let vk = Self::view_key_for(&self.state);
        if vk != self.last_view_key {
            self.last_view_key = vk;
            self.view_epoch += 1;
        }

        if self.state.palette_open && !self.last_palette_open {
            self.palette_epoch += 1;
        }
        self.last_palette_open = self.state.palette_open;

        if self.state.new_project_open && !self.last_new_project_open {
            self.new_project_epoch += 1;
        }
        self.last_new_project_open = self.state.new_project_open;

        if self.state.selected_inbox_id != self.last_inbox_id {
            self.last_inbox_id = self.state.selected_inbox_id.clone();
            if self.state.nav == PrimaryNav::Inbox {
                self.mail_epoch += 1;
            }
        }

        let in_settings = self.state.nav == PrimaryNav::Settings;
        if in_settings != self.last_in_settings {
            self.last_in_settings = in_settings;
            self.rail_epoch += 1;
            self.sub_pill_anim
                .snap(Self::sub_index_for(&self.state) as f32 * sidebar::SUB_ROW_STRIDE);
        }

        if self.state.settings_section != self.last_settings_section {
            self.last_settings_section = self.state.settings_section;
            if in_settings {
                self.settings_epoch += 1;
            }
        }

        let in_focus = self.state.decision_pane_open;
        let in_tasks = !in_focus
            && (self.state.nav == PrimaryNav::Tasks
                || (matches!(self.state.nav, PrimaryNav::Project(_))
                    && self.state.project_tab == ProjectTab::Tasks));
        let in_schedules = !in_focus
            && (self.state.nav == PrimaryNav::Schedules
                || (matches!(self.state.nav, PrimaryNav::Project(_))
                    && self.state.project_tab == ProjectTab::Schedules));

        if !in_focus {
            self.comments_drawer_anim.snap(0.0);
        }
        if !in_tasks {
            self.task_drawer_anim.snap(0.0);
        }
        if !in_schedules {
            self.schedule_drawer_anim.snap(0.0);
        }

        let sidebar_target = if self.state.sidebar_open {
            self.state.sidebar_width
        } else {
            0.0
        };
        self.sidebar_anim.set_target(sidebar_target);
        self.rail_pill_anim
            .set_target(Self::rail_index(self.state.rail) as f32 * sidebar::RAIL_STRIDE);
        self.sub_pill_anim
            .set_target(Self::sub_index_for(&self.state) as f32 * sidebar::SUB_ROW_STRIDE);
        self.comments_drawer_anim.set_target(
            if in_focus && self.state.comments_drawer_open {
                320.0
            } else {
                0.0
            },
        );
        self.task_drawer_anim.set_target(
            if in_tasks && self.state.task_inspector_open {
                380.0
            } else {
                0.0
            },
        );
        self.schedule_drawer_anim.set_target(
            if in_schedules && self.state.schedule_inspector_open {
                360.0
            } else {
                0.0
            },
        );

        let now = Instant::now();
        let dt = self
            .last_anim_frame
            .map(|prev| now.saturating_duration_since(prev).as_secs_f32())
            .unwrap_or(1.0 / 120.0);

        let moving = self.sidebar_anim.step(dt, reduce_motion)
            | self.rail_pill_anim.step(dt, reduce_motion)
            | self.sub_pill_anim.step(dt, reduce_motion)
            | self.comments_drawer_anim.step(dt, reduce_motion)
            | self.task_drawer_anim.step(dt, reduce_motion)
            | self.schedule_drawer_anim.step(dt, reduce_motion);

        if moving {
            self.last_anim_frame = Some(now);
            window.request_animation_frame();
        } else {
            self.last_anim_frame = None;
        }
    }

    pub fn show_toast(
        &mut self,
        kind: ToastKind,
        msg: impl Into<SharedString>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.toast = Some((kind, msg.into(), Instant::now()));
        self.toast_task = Some(cx.spawn_in(window, async move |this, cx| {
            cx.background_executor().timer(Duration::from_millis(3100)).await;
            let _ = this.update(cx, |w, cx| {
                w.toast = None;
                cx.notify();
            });
        }));
        cx.notify();
    }

    pub fn switch_nav(&mut self, nav: PrimaryNav, window: &mut Window, cx: &mut Context<Self>) {
        let mut refresh_pid: Option<String> = None;
        match &nav {
            PrimaryNav::NewSession => {
                self.open_new_session(window, cx);
                return;
            }
            PrimaryNav::Settings => {
                self.open_settings(window, cx);
                return;
            }
            PrimaryNav::Inbox | PrimaryNav::Tasks | PrimaryNav::Schedules => {
                self.state.rail = RailSection::Home;
                self.state.last_home_nav = nav.clone();
            }
            PrimaryNav::Project(pid) => {
                self.state.rail = RailSection::Projects;
                self.state.selected_project_id = pid.clone();
                refresh_pid = Some(pid.clone());
            }
            PrimaryNav::Bot(bid) => {
                self.state.rail = RailSection::Bots;
                self.state.selected_bot_id = bid.clone();
                let sid = self.state.ensure_bot_session(bid);
                self.state.selected_session_id = sid;
            }
        }
        self.state.session_picker = None;
        self.state.nav = nav.clone();
        self.state.decision_pane_open = false;
        self.state.comments_drawer_open = false;
        self.state.task_inspector_open = false;
        self.state.schedule_inspector_open = false;
        if nav == PrimaryNav::Inbox {
            self.state.ensure_valid_inbox_selection();
        }
        if let Some(pid) = refresh_pid {
            self.refresh_git_repos_for_project(&pid, window, cx);
        }
        window.focus(&self.focus, cx);
        cx.notify();
    }

    pub fn switch_rail(&mut self, rail: RailSection, window: &mut Window, cx: &mut Context<Self>) {
        self.state.switch_rail(rail);
        match self.state.nav.clone() {
            PrimaryNav::Project(pid) => self.refresh_git_repos_for_project(&pid, window, cx),
            PrimaryNav::Bot(bid) => {
                let sid = self.state.ensure_bot_session(&bid);
                self.state.selected_session_id = sid;
            }
            _ => {}
        }
        window.focus(&self.focus, cx);
        cx.notify();
    }

    pub fn open_project_view(&mut self, pid: &str, window: &mut Window, cx: &mut Context<Self>) {
        self.state.open_project(pid);
        self.refresh_git_repos_for_project(pid, window, cx);
        window.focus(&self.focus, cx);
        cx.notify();
    }

    pub fn open_project_repos(&mut self, pid: &str, window: &mut Window, cx: &mut Context<Self>) {
        self.state.open_project(pid);
        self.state.project_tab = ProjectTab::Repos;
        self.refresh_git_repos_for_project(pid, window, cx);
        window.focus(&self.focus, cx);
        cx.notify();
    }

    pub fn open_bot_view(&mut self, bid: &str, window: &mut Window, cx: &mut Context<Self>) {
        self.state.open_bot(bid);
        window.focus(&self.focus, cx);
        cx.notify();
    }

    pub fn open_artifact_in_decision_pane(&mut self, aid: &str, window: &mut Window, cx: &mut Context<Self>) {
        self.state.select_artifact(aid);
        self.ensure_decision_pane_entities(window, cx);
        cx.notify();
    }

    pub fn open_task_in_decision_pane(&mut self, tid: &str, window: &mut Window, cx: &mut Context<Self>) {
        let same_open = self.state.task_inspector_open && self.state.selected_task_id == tid;
        if same_open {
            self.state.task_inspector_open = false;
        } else {
            self.state.select_task(tid);
        }
        window.focus(&self.focus, cx);
        cx.notify();
    }

    pub fn select_inbox_item(&mut self, id: &str, _window: &mut Window, cx: &mut Context<Self>) {
        if self.state.selected_inbox_id != id {
            self.mail_reply_input.update(cx, |f, cx| f.set_text("", cx));
        }
        self.state.select_inbox(id);
        cx.notify();
    }

    pub fn open_inbox_decision(&mut self, id: &str, window: &mut Window, cx: &mut Context<Self>) {
        self.state.select_inbox(id);
        let aid = self
            .state
            .snapshot
            .inbox
            .iter()
            .find(|i| i.id == id)
            .and_then(|i| i.artifact_id.clone());
        if let Some(aid) = aid {
            self.open_artifact_in_decision_pane(&aid, window, cx);
        } else {
            cx.notify();
        }
    }

    pub fn decide_inbox(
        &mut self,
        id: &str,
        status: InboxStatus,
        reply: Option<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if let Some(msg) = self.state.decide_inbox(id, status, reply) {
            self.show_toast(ToastKind::Success, msg, window, cx);
        }
    }

    pub fn submit_inbox_verdict(
        &mut self,
        item_id: &str,
        approve: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let raw = self.mail_reply_input.read(cx).text.clone();
        self.mail_reply_input.update(cx, |f, cx| f.set_text("", cx));
        let reply = (!raw.trim().is_empty()).then_some(raw);

        if !approve {
            self.decide_inbox(item_id, InboxStatus::Rejected, reply, window, cx);
        } else if let Some(msg) = self.state.settle_inbox_canvas_decision(item_id, reply.clone()) {
            self.show_toast(ToastKind::Success, msg, window, cx);
        } else {
            self.decide_inbox(item_id, InboxStatus::Approved, reply, window, cx);
        }
        window.focus(&self.focus, cx);
    }

    pub fn submit_inbox_reply_only(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let raw = self.mail_reply_input.read(cx).text.clone();
        let iid = self.state.selected_inbox_id.clone();
        if self.state.reply_to_inbox(&iid, &raw) {
            self.mail_reply_input.update(cx, |f, cx| f.set_text("", cx));
            window.focus(&self.focus, cx);
            self.show_toast(ToastKind::Success, "已发送邮件回执", window, cx);
        } else {
            self.show_toast(ToastKind::Info, "请先输入批注或回执内容", window, cx);
        }
    }

    pub fn submit_artifact_comment(&mut self, anchor: &str, window: &mut Window, cx: &mut Context<Self>) {
        let body = self.comment_input.read(cx).text.clone();
        let aid = self.state.selected_artifact_id.clone();
        if self.state.pin_artifact_comment(&aid, anchor, &body) {
            self.comment_input.update(cx, |f, cx| f.set_text("", cx));
            self.show_toast(ToastKind::Success, "批注已发送", window, cx);
        } else {
            self.show_toast(ToastKind::Info, "请先输入批注内容", window, cx);
        }
    }

    pub fn open_new_session(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.state.palette_open = false;
        self.state.open_new_session();
        self.session_input.focus_handle(cx).focus(window, cx);
        cx.notify();
    }

    pub fn open_settings(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.state.palette_open = false;
        self.settings_search_input.update(cx, |f, cx| f.set_text("", cx));
        self.state.open_settings();
        window.focus(&self.focus, cx);
        cx.notify();
    }

    pub fn submit_new_session(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let raw = self.session_input.read(cx).text.clone();
        if let Some((msg, opened_aid)) = self.state.start_session(&raw) {
            self.session_input.update(cx, |f, cx| f.set_text("", cx));
            if opened_aid.is_some() {
                self.ensure_decision_pane_entities(window, cx);
            }
            if matches!(self.state.nav, PrimaryNav::Bot(_)) {
                self.chat_input.focus_handle(cx).focus(window, cx);
            } else {
                window.focus(&self.focus, cx);
            }
            self.show_toast(ToastKind::Success, msg, window, cx);
        } else {
            self.show_toast(ToastKind::Info, "请先输入会话目标", window, cx);
        }
    }

    pub fn apply_palette_target(
        &mut self,
        target: PaletteTarget,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.state.palette_open = false;
        self.palette_input.update(cx, |f, cx| f.set_text("", cx));
        match target {
            PaletteTarget::Project(pid) => self.open_project_view(&pid, window, cx),
            PaletteTarget::Bot(bid) => self.open_bot_view(&bid, window, cx),
            PaletteTarget::Session(sid) => self.open_session_in_bot(&sid, window, cx),
            PaletteTarget::Nav(nav) => self.switch_nav(nav, window, cx),
            PaletteTarget::Artifact(aid) => self.open_artifact_in_decision_pane(&aid, window, cx),
            PaletteTarget::Task(tid) => {
                self.state.rail = RailSection::Home;
                self.state.last_home_nav = PrimaryNav::Tasks;
                self.state.nav = PrimaryNav::Tasks;
                self.state.decision_pane_open = false;
                self.state.select_task(&tid);
                window.focus(&self.focus, cx);
            }
            PaletteTarget::Schedule(sid) => {
                self.state.rail = RailSection::Home;
                self.state.last_home_nav = PrimaryNav::Schedules;
                self.state.nav = PrimaryNav::Schedules;
                self.state.decision_pane_open = false;
                self.state.select_schedule(&sid);
                window.focus(&self.focus, cx);
            }
            PaletteTarget::VerifyTab => {
                self.open_active_project_verify(window, cx);
            }
            PaletteTarget::NewSession => {
                self.open_new_session(window, cx);
            }
            PaletteTarget::NewProject => {
                self.open_new_project_modal(window, cx);
                return;
            }
            PaletteTarget::OpenSettings => {
                self.open_settings(window, cx);
            }
            PaletteTarget::ToggleTheme => {
                self.toggle_theme(window, cx);
            }
        }
        cx.notify();
    }

    fn open_active_project_verify(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let pid = self.state.selected_project_id.clone();
        let verify_aid = self
            .state
            .snapshot
            .artifacts
            .iter()
            .find(|a| a.project_id == pid && a.kind == ArtifactKind::VerifyReport)
            .map(|a| a.id.clone());
        if let Some(aid) = verify_aid {
            self.state.select_artifact(&aid);
        } else {
            self.state.decision_pane_open = true;
            self.state.decision_pane_expanded = true;
        }
        self.state.decision_tab = DecisionPaneTab::Verify;
        self.ensure_decision_pane_entities(window, cx);
        cx.notify();
    }

    fn refresh_input_theme_colors(&self, cx: &mut Context<Self>) {
        for field in [
            &self.session_input,
            &self.palette_input,
            &self.comment_input,
            &self.chat_input,
            &self.git_repo_input,
            &self.new_project_name_input,
            &self.new_project_summary_input,
            &self.new_project_repo_input,
            &self.mail_reply_input,
            &self.settings_search_input,
        ] {
            field.update(cx, |f, cx| {
                f.color = Theme::text();
                f.placeholder_color = Theme::text_placeholder();
                cx.notify();
            });
        }
    }

    pub fn open_new_project_modal(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.state.palette_open = false;
        self.state.new_project_mode = NewProjectMode::Blank;
        self.state.new_project_color =
            PROJECT_COLORS[self.state.snapshot.projects.len() % PROJECT_COLORS.len()];
        self.state.new_project_bot_id = self
            .state
            .project(&self.state.selected_project_id)
            .map(|p| p.default_bot_id.clone())
            .filter(|bid| self.state.bot(bid).is_some())
            .or_else(|| self.state.snapshot.bots.first().map(|b| b.id.clone()))
            .unwrap_or_default();
        self.new_project_repo_probe = None;
        self.new_project_repo_probing = false;
        self.new_project_name_input.update(cx, |f, cx| f.set_text("", cx));
        self.new_project_summary_input.update(cx, |f, cx| f.set_text("", cx));
        self.new_project_repo_input.update(cx, |f, cx| f.set_text("", cx));
        self.state.new_project_open = true;
        self.new_project_name_input.focus_handle(cx).focus(window, cx);
        cx.notify();
    }

    pub fn close_new_project_modal(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.state.new_project_open = false;
        self.new_project_repo_probing = false;
        window.focus(&self.focus, cx);
        cx.notify();
    }

    pub fn pick_new_project_git_dir(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let picked = crate::devtools::take_pick();
        let rx = picked.is_none().then(|| {
            cx.prompt_for_paths(PathPromptOptions {
                files: false,
                directories: true,
                multiple: false,
                prompt: Some("选择要创建项目的本地 Git 仓库".into()),
                extensions: None,
            })
        });
        cx.spawn_in(window, async move |this, cx| {
            let paths = match rx {
                Some(rx) => rx.await.ok().and_then(Result::ok).flatten(),
                None => picked,
            };
            if let Some(dir) = paths.and_then(|list| list.into_iter().next()) {
                let raw = dir.to_string_lossy().to_string();
                let _ = this.update_in(cx, |ws, window, cx| {
                    ws.new_project_repo_input.update(cx, |f, cx| f.set_text(&raw, cx));
                    ws.probe_new_project_repo(window, cx);
                });
            }
        })
        .detach();
    }

    pub fn probe_new_project_repo(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let raw = self.new_project_repo_input.read(cx).text.trim().to_string();
        if raw.is_empty() {
            self.new_project_repo_probe = None;
            self.new_project_repo_probing = false;
            cx.notify();
            return;
        }
        self.new_project_repo_probing = true;
        self.new_project_repo_probe = None;
        cx.notify();

        let task = cx
            .background_executor()
            .spawn(async move { git_repo::inspect_repo(&raw) });
        cx.spawn_in(window, async move |this, cx| {
            let status = task.await;
            let _ = this.update_in(cx, |ws, _, cx| {
                ws.new_project_repo_probing = false;
                if status.is_git_repo {
                    let root = status
                        .repo_root
                        .clone()
                        .unwrap_or_else(|| status.path.clone());
                    let short = git_repo::short_repo_name(&root);
                    ws.new_project_repo_input.update(cx, |f, cx| f.set_text(&root, cx));
                    if ws.new_project_name_input.read(cx).text.trim().is_empty() {
                        ws.new_project_name_input.update(cx, |f, cx| f.set_text(&short, cx));
                    }
                    ws.git_cache.insert(root, status.clone());
                }
                ws.new_project_repo_probe = Some(status);
                cx.notify();
            });
        })
        .detach();
    }

    pub fn submit_new_project(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let mode = self.state.new_project_mode;
        let raw_name = self.new_project_name_input.read(cx).text.trim().to_string();
        let summary = self.new_project_summary_input.read(cx).text.trim().to_string();
        let color = self.state.new_project_color;
        let bot_id = self.state.new_project_bot_id.clone();

        if mode == NewProjectMode::Blank {
            if raw_name.is_empty() {
                self.show_toast(ToastKind::Info, "请先输入项目名称", window, cx);
                self.new_project_name_input.focus_handle(cx).focus(window, cx);
                return;
            }
            if self
                .state
                .create_project(&raw_name, &summary, color, &bot_id, None)
                .is_some()
            {
                window.focus(&self.focus, cx);
                self.show_toast(
                    ToastKind::Success,
                    format!("已创建项目：{raw_name}"),
                    window,
                    cx,
                );
            }
            return;
        }

        let raw_repo = self.new_project_repo_input.read(cx).text.trim().to_string();
        if raw_repo.is_empty() {
            self.show_toast(ToastKind::Info, "请先选择或输入本地 Git 仓库路径", window, cx);
            self.new_project_repo_input.focus_handle(cx).focus(window, cx);
            return;
        }

        self.new_project_repo_probing = true;
        cx.notify();
        let task = cx
            .background_executor()
            .spawn(async move { git_repo::inspect_repo(&raw_repo) });
        cx.spawn_in(window, async move |this, cx| {
            let status = task.await;
            let _ = this.update_in(cx, |ws, window, cx| {
                ws.new_project_repo_probing = false;
                if !status.exists || !status.is_git_repo {
                    let err = status
                        .error
                        .clone()
                        .unwrap_or_else(|| "所选目录不是有效的 Git 仓库".into());
                    ws.new_project_repo_probe = Some(status);
                    ws.show_toast(ToastKind::Error, err, window, cx);
                    return;
                }
                let root = status
                    .repo_root
                    .clone()
                    .unwrap_or_else(|| status.path.clone());
                let derived_name = if raw_name.is_empty() {
                    git_repo::short_repo_name(&root)
                } else {
                    raw_name
                };
                let branch = status.branch.clone();
                ws.git_cache.insert(root.clone(), status.clone());
                ws.new_project_repo_probe = Some(status);
                if ws
                    .state
                    .create_project(&derived_name, &summary, color, &bot_id, Some(root))
                    .is_some()
                {
                    window.focus(&ws.focus, cx);
                    ws.show_toast(
                        ToastKind::Success,
                        format!("已从 Git 仓库创建项目：{derived_name}（分支 {branch}）"),
                        window,
                        cx,
                    );
                }
            });
        })
        .detach();
    }

    fn active_chat_session_id(&mut self) -> Option<String> {
        match self.state.nav.clone() {
            PrimaryNav::Bot(bid) => Some(self.state.ensure_bot_session(&bid)),
            _ => None,
        }
    }

    fn live_git_summary_for_project(&self, pid: &str) -> Option<String> {
        let path = self.state.project(pid)?.repo_paths.first()?;
        let name = git_repo::short_repo_name(path);
        match self.git_cache.get(path) {
            Some(st) if st.is_git_repo => {
                Some(format!("{name} · 分支 {} · {} 处未提交变更", st.branch, st.dirty_count))
            }
            _ => Some(path.clone()),
        }
    }

    pub fn submit_chat_message(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let raw = self.chat_input.read(cx).text.clone();
        if raw.trim().is_empty() {
            self.show_toast(ToastKind::Info, "请先输入消息内容", window, cx);
            return;
        }
        let Some(sid) = self.active_chat_session_id() else {
            return;
        };
        let git_summary = self
            .state
            .session(&sid)
            .and_then(|s| self.live_git_summary_for_project(&s.project_id));
        if self.state.send_chat_message(&sid, &raw, git_summary).is_some() {
            self.chat_input.update(cx, |f, cx| f.set_text("", cx));
            self.chat_input.focus_handle(cx).focus(window, cx);
            cx.notify();
        }
    }

    pub fn new_chat_for_bot(&mut self, bid: &str, window: &mut Window, cx: &mut Context<Self>) {
        let pid = self
            .state
            .bot(bid)
            .map(|b| b.project_id.clone())
            .filter(|p| self.state.project(p).is_some())
            .unwrap_or_else(|| self.state.selected_project_id.clone());
        self.state.create_bot_session(bid, &pid, None);
        self.state.bot_tab = BotViewTab::Chat;
        self.chat_input.focus_handle(cx).focus(window, cx);
        self.show_toast(ToastKind::Info, "已开启新的 Bot 对话线程", window, cx);
    }

    pub fn open_session_in_bot(&mut self, sid: &str, window: &mut Window, cx: &mut Context<Self>) {
        let Some(ses) = self.state.session(sid).cloned() else {
            return;
        };
        self.state.select_session(sid);
        self.state.bot_tab = BotViewTab::Chat;
        self.open_bot_view(&ses.bot_id, window, cx);
    }

    pub fn promote_active_session(
        &mut self,
        kind: ArtifactKind,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(sid) = self.active_chat_session_id() else {
            return;
        };
        if let Some((aid, msg)) = self.state.promote_session_to_artifact(&sid, kind) {
            if kind == ArtifactKind::DecisionCanvas
                && let Some(json) = self
                    .state
                    .artifact(&aid)
                    .and_then(|a| a.canvas_scene_json.as_deref())
                && let Some(board) = Board::from_scene(json, 480.)
            {
                self.artifact_board_thumbs.insert(aid, Arc::new(board));
            }
            self.show_toast(ToastKind::Success, msg, window, cx);
        }
    }

    fn refresh_repo_paths(&self, paths: Vec<String>, window: &mut Window, cx: &mut Context<Self>) {
        if paths.is_empty() {
            return;
        }
        let task = cx.background_executor().spawn(async move {
            paths
                .into_iter()
                .map(|p| {
                    let st = git_repo::inspect_repo(&p);
                    (p, st)
                })
                .collect::<Vec<_>>()
        });
        cx.spawn_in(window, async move |this, cx| {
            let results = task.await;
            let _ = this.update_in(cx, |ws, _, cx| {
                for (path, status) in results {
                    ws.git_cache.insert(path, status);
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub fn refresh_all_project_git_repos(&self, window: &mut Window, cx: &mut Context<Self>) {
        let mut paths = Vec::new();
        for proj in &self.state.snapshot.projects {
            for p in &proj.repo_paths {
                if !paths.iter().any(|x| x == p) {
                    paths.push(p.clone());
                }
            }
        }
        self.refresh_repo_paths(paths, window, cx);
    }

    pub fn refresh_git_repos_for_project(
        &self,
        pid: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(proj) = self.state.project(pid) else {
            return;
        };
        self.refresh_repo_paths(proj.repo_paths.clone(), window, cx);
    }

    pub fn bind_git_repo_from_input(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let raw = self.git_repo_input.read(cx).text.clone();
        if raw.trim().is_empty() {
            self.show_toast(ToastKind::Info, "请先输入或选择本地 Git 仓库目录", window, cx);
            return;
        }
        self.git_repo_input.update(cx, |f, cx| f.set_text("", cx));
        let pid = self.state.selected_project_id.clone();
        self.bind_git_repo_path(&pid, raw, window, cx);
    }

    pub fn bind_git_repo_path(
        &mut self,
        pid: &str,
        raw_path: String,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let clean = raw_path.trim().to_string();
        if clean.is_empty() {
            self.show_toast(ToastKind::Info, "请先输入本地目录路径", window, cx);
            return;
        }
        let pid = pid.to_string();
        let task = cx
            .background_executor()
            .spawn(async move { git_repo::inspect_repo(&clean) });
        cx.spawn_in(window, async move |this, cx| {
            let status = task.await;
            let _ = this.update_in(cx, |ws, window, cx| {
                if !status.exists {
                    ws.show_toast(ToastKind::Error, "目录不存在，请检查路径后重试", window, cx);
                    return;
                }
                if !status.is_git_repo {
                    ws.show_toast(
                        ToastKind::Error,
                        "所选目录不是 Git 仓库（未找到 .git）",
                        window,
                        cx,
                    );
                    return;
                }
                let root = status.repo_root.clone().unwrap_or_else(|| status.path.clone());
                let name = git_repo::short_repo_name(&root);
                let branch = status.branch.clone();
                match ws.state.bind_project_repo(&pid, root.clone()) {
                    Ok(true) => {
                        ws.git_cache.insert(root, status);
                        ws.show_toast(
                            ToastKind::Success,
                            format!("已绑定仓库 {name}（分支 {branch}）"),
                            window,
                            cx,
                        );
                    }
                    Ok(false) => {
                        ws.git_cache.insert(root, status);
                        ws.show_toast(
                            ToastKind::Info,
                            format!("仓库 {name} 已绑定，已刷新最新 Git 状态"),
                            window,
                            cx,
                        );
                    }
                    Err(err) => {
                        ws.show_toast(ToastKind::Error, err, window, cx);
                    }
                }
            });
        })
        .detach();
    }

    pub fn pick_and_bind_git_repo(
        &mut self,
        pid: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let pid = pid.to_string();
        let picked = crate::devtools::take_pick();
        let rx = picked.is_none().then(|| {
            cx.prompt_for_paths(PathPromptOptions {
                files: false,
                directories: true,
                multiple: false,
                prompt: Some("选择要绑定的本地 Git 仓库目录".into()),
                extensions: None,
            })
        });
        cx.spawn_in(window, async move |this, cx| {
            let paths = match rx {
                Some(rx) => rx.await.ok().and_then(Result::ok).flatten(),
                None => picked,
            };
            if let Some(dir) = paths.and_then(|list| list.into_iter().next()) {
                let raw = dir.to_string_lossy().to_string();
                let _ = this.update_in(cx, |ws, window, cx| {
                    ws.bind_git_repo_path(&pid, raw, window, cx);
                });
            }
        })
        .detach();
    }

    pub fn set_appearance(&mut self, appearance: &str, window: &mut Window, cx: &mut Context<Self>) {
        let mut p = crate::settings::prefs();
        p.appearance = appearance.to_string();
        let _ = crate::settings::save(&p);
        crate::settings::apply_appearance(&p.appearance);
        crate::settings::sync_dark(cx);
        self.refresh_input_theme_colors(cx);
        cx.refresh_windows();
        let msg = match appearance {
            "light" => "已切换为浅色外观",
            "dark" => "已切换为深色外观",
            _ => "已设为跟随系统外观",
        };
        self.show_toast(ToastKind::Info, msg, window, cx);
    }

    pub fn set_opaque_window(&mut self, opaque: bool, window: &mut Window, cx: &mut Context<Self>) {
        let mut p = crate::settings::prefs();
        p.opaque_window = opaque;
        let _ = crate::settings::save(&p);
        cx.refresh_windows();
        self.show_toast(
            ToastKind::Info,
            if opaque { "侧栏已设为纯色" } else { "侧栏已设为毛玻璃" },
            window,
            cx,
        );
    }

    pub fn set_ui_font(&mut self, size: &str, window: &mut Window, cx: &mut Context<Self>) {
        let mut p = crate::settings::prefs();
        p.ui_font = size.to_string();
        let _ = crate::settings::save(&p);
        cx.refresh_windows();
        let msg = match size {
            "small" => "界面字号已设为紧凑",
            "large" => "界面字号已设为宽松",
            _ => "界面字号已设为标准",
        };
        self.show_toast(ToastKind::Info, msg, window, cx);
    }

    pub fn set_language(&mut self, code: &str, window: &mut Window, cx: &mut Context<Self>) {
        let mut p = crate::settings::prefs();
        match code {
            "en" => p.set_lang(crate::settings::Lang::En),
            "zh" => p.set_lang(crate::settings::Lang::Zh),
            _ => {
                p.language.clear();
                p.english = false;
            }
        }
        let _ = crate::settings::save(&p);
        cx.refresh_windows();
        self.show_toast(ToastKind::Info, "界面语言偏好已更新", window, cx);
    }

    pub fn toggle_theme(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let next = if crate::theme::dark() { "light" } else { "dark" };
        self.set_appearance(next, window, cx);
    }

    pub fn ensure_decision_pane_entities(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let aid = self.state.selected_artifact_id.clone();
        match self.state.decision_tab {
            DecisionPaneTab::Canvas => {
                let _ = self.ensure_artifact_board(&aid, window, cx);
            }
            DecisionPaneTab::SpecDoc => {
                let _ = self.ensure_artifact_editor(&aid, window, cx);
            }
            DecisionPaneTab::Table => {
                let _ = self.ensure_tasks_table(window, cx);
            }
            _ => {}
        }
    }

    pub fn ensure_artifact_editor(
        &mut self,
        artifact_id: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Entity<Editor> {
        if let Some(ed) = self.artifact_editors.get(artifact_id) {
            return ed.clone();
        }
        let art = self.state.artifact(artifact_id).cloned();
        let title = art.as_ref().map(|a| a.title.clone()).unwrap_or_else(|| "规格文档".into());
        let fallback = format!("# {title}\n\n- 关联产物或任务规格。\n");
        let md = art
            .as_ref()
            .and_then(|a| a.doc_markdown.clone())
            .unwrap_or(fallback);
        let doc = crate::markdown::parse_file(&md, &title, None);
        let ed = cx.new(|cx| Editor::new(doc, 0, PageWidth::Standard, window, cx));
        self.artifact_editors.insert(artifact_id.to_string(), ed.clone());
        ed
    }

    pub fn ensure_artifact_board(
        &mut self,
        artifact_id: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Entity<BoardView> {
        if let Some(bd) = self.artifact_boards.get(artifact_id) {
            return bd.clone();
        }
        let board = if let Some(cached) = self.artifact_board_thumbs.get(artifact_id).cloned() {
            cached
        } else {
            let scene_json = self
                .state
                .artifact(artifact_id)
                .and_then(|a| a.canvas_scene_json.as_deref())
                .or_else(|| {
                    let pid = &self.state.selected_project_id;
                    self.state
                        .snapshot
                        .artifacts
                        .iter()
                        .find(|a| &a.project_id == pid && a.canvas_scene_json.is_some())
                        .and_then(|a| a.canvas_scene_json.as_deref())
                });
            let parsed = scene_json
                .and_then(|json| Board::from_scene(json, 480.))
                .unwrap_or_default();
            Arc::new(parsed)
        };
        let bd = cx.new(|cx| BoardView::new(board, window, cx));
        self.artifact_boards.insert(artifact_id.to_string(), bd.clone());
        bd
    }

    pub fn ensure_tasks_table(&mut self, window: &mut Window, cx: &mut Context<Self>) -> Entity<TableView> {
        if let Some(tv) = &self.tasks_table {
            return tv.clone();
        }
        let root = Store::internal_dir();
        let _ = fdl_core::vfs::create_dir_all(&root);
        let db_path = root.join("merak-tasks.sqlite");
        if !db_path.exists() {
            let base = fdl_core::table::sample::demo(fdl_core::table::field::now());
            let _ = fdl_core::table::sqlite::create(&db_path, &base);
        }
        let state = BaseState::open(&db_path, cx);
        let tref = TableRef::new("merak-tasks.sqlite");
        let tv = cx.new(|cx| TableView::new(state, &tref, true, true, window, cx));
        self.tasks_table = Some(tv.clone());
        tv
    }
}

impl Focusable for MerakWorkspace {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus.clone()
    }
}

impl Render for MerakWorkspace {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        crate::editor::image::frame_drawn(window, cx);
        crate::theme::set_fullscreen(window.is_fullscreen());
        self.sync_and_step_motion(window, cx);

        let sidebar_w = self.sidebar_anim.value().clamp(0.0, self.state.sidebar_width);
        self.native_sidebar.sync(
            if !crate::theme::fullscreen() && !crate::settings::prefs().opaque_window {
                sidebar_w
            } else {
                0.
            },
            window,
        );

        let full_sidebar_w = self.state.sidebar_width.max(1.0);
        let sidebar_el = (sidebar_w > 0.5).then(|| {
            let progress = (sidebar_w / full_sidebar_w).clamp(0.0, 1.0);
            let content_alpha = ((progress - 0.15) / 0.85).clamp(0.0, 1.0);
            div()
                .w(px(sidebar_w))
                .flex_none()
                .h_full()
                .overflow_hidden()
                .flex()
                .child(sidebar::render_sidebar(self, cx).opacity(content_alpha))
        });
        let in_focus = self.state.decision_pane_open;
        let viewport_w = f32::from(window.viewport_size().width) - sidebar_w;

        let active_art = self.state.artifact(&self.state.selected_artifact_id).cloned();
        let proj_name = active_art
            .as_ref()
            .and_then(|a| self.state.project(&a.project_id))
            .map(|p| p.name.clone())
            .unwrap_or_else(|| "项目".into());

        let left_header: AnyElement = if in_focus {
            let art_title = active_art.as_ref().map(|a| a.title.clone()).unwrap_or_default();
            div()
                .no_drag()
                .flex_1()
                .min_w_0()
                .flex()
                .items_center()
                .gap(px(8.))
                .child(
                    div()
                        .id("focus-back-btn")
                        .h(px(26.))
                        .px(px(8.))
                        .rounded(px(6.))
                        .flex()
                        .items_center()
                        .gap(px(4.))
                        .cursor_pointer()
                        .text_size(px(12.5))
                        .text_color(components::text_secondary())
                        .hover(|s| s.bg(Theme::fill_hover()).text_color(Theme::text()))
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.state.decision_pane_open = false;
                            this.state.comments_drawer_open = false;
                            window.focus(&this.focus, cx);
                            cx.notify();
                        }))
                        .child(ui::icon("chevron-left", 14., Theme::icon()))
                        .child("返回"),
                )
                .child(div().text_size(px(12.)).text_color(components::text_muted()).child("/"))
                .child(
                    div()
                        .text_size(px(12.5))
                        .text_color(components::text_secondary())
                        .whitespace_nowrap()
                        .child(proj_name),
                )
                .child(div().text_size(px(12.)).text_color(components::text_muted()).child("/"))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .text_size(px(13.))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(Theme::text())
                        .overflow_hidden()
                        .whitespace_nowrap()
                        .text_ellipsis()
                        .child(art_title),
                )
                .into_any_element()
        } else {
            div().flex_1().min_w_0().into_any_element()
        };

        let mut focus_controls = div().flex().items_center().gap(px(2.));
        if in_focus {
            let active_tab = self.state.decision_tab;
            let linked_task_has_diff = active_art
                .as_ref()
                .and_then(|a| a.task_id.as_deref())
                .or(Some(self.state.selected_task_id.as_str()))
                .and_then(|tid| self.state.task(tid))
                .is_some_and(|t| !t.diff_preview.lines.is_empty());
            let relevant_tabs: Vec<DecisionPaneTab> = if let Some(art) = active_art.as_ref() {
                [
                    (
                        DecisionPaneTab::Canvas,
                        art.canvas_scene_json.is_some() || active_tab == DecisionPaneTab::Canvas,
                    ),
                    (
                        DecisionPaneTab::Verify,
                        art.verify_report.is_some() || active_tab == DecisionPaneTab::Verify,
                    ),
                    (
                        DecisionPaneTab::SpecDoc,
                        art.doc_markdown.is_some() || active_tab == DecisionPaneTab::SpecDoc,
                    ),
                    (
                        DecisionPaneTab::Table,
                        art.kind == ArtifactKind::DataTable || active_tab == DecisionPaneTab::Table,
                    ),
                    (
                        DecisionPaneTab::Diff,
                        linked_task_has_diff || active_tab == DecisionPaneTab::Diff,
                    ),
                ]
                .into_iter()
                .filter_map(|(tab, keep)| keep.then_some(tab))
                .collect()
            } else {
                vec![active_tab]
            };

            let unread_comments = active_art
                .as_ref()
                .map(|a| a.comments.iter().filter(|c| !c.receipt_ack).count())
                .unwrap_or(0);
            if relevant_tabs.len() > 1 {
                for tab in relevant_tabs {
                    let on = active_tab == tab;
                    let short_label = match tab {
                        DecisionPaneTab::Canvas => "白板",
                        DecisionPaneTab::Verify => "验收",
                        DecisionPaneTab::SpecDoc => "文档",
                        DecisionPaneTab::Table => "数据表",
                        DecisionPaneTab::Diff => "Diff",
                        DecisionPaneTab::Comments => "批注",
                    };
                    focus_controls = focus_controls.child(
                        div()
                            .id(SharedString::from(format!("htab-{}", short_label)))
                            .h(px(26.))
                            .px(px(9.))
                            .rounded(px(6.))
                            .flex()
                            .items_center()
                            .cursor_pointer()
                            .text_size(px(12.))
                            .font_weight(if on { FontWeight::MEDIUM } else { FontWeight::NORMAL })
                            .when(on, |d| d.bg(theme::ca(craft::N1000, 0.075)).text_color(Theme::text()))
                            .when(!on, |d| {
                                d.text_color(components::text_secondary())
                                    .hover(|s| s.bg(Theme::fill_hover()).text_color(Theme::text()))
                            })
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.state.decision_tab = tab;
                                this.ensure_decision_pane_entities(window, cx);
                                cx.notify();
                            }))
                            .child(short_label),
                    );
                }
                focus_controls = focus_controls
                    .child(div().w(px(1.)).h(px(14.)).mx(px(4.)).bg(Theme::line_divider()));
            }
            let c_on = self.state.comments_drawer_open;
            focus_controls = focus_controls.child(
                div()
                    .id("toggle-comments-drawer")
                    .h(px(26.))
                    .px(px(9.))
                    .rounded(px(6.))
                    .flex()
                    .items_center()
                    .gap(px(5.))
                    .cursor_pointer()
                    .text_size(px(12.))
                    .when(c_on, |d| d.bg(theme::ca(craft::N1000, 0.075)).text_color(Theme::text()))
                    .when(!c_on, |d| {
                        d.text_color(components::text_secondary())
                            .hover(|s| s.bg(Theme::fill_hover()).text_color(Theme::text()))
                    })
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.state.comments_drawer_open = !this.state.comments_drawer_open;
                        cx.notify();
                    }))
                    .child("批注")
                    .when(unread_comments > 0, |d| {
                        d.child(components::status_dot(components::attention_color()))
                    }),
            );
        }

        let toggle_left = if cfg!(target_os = "macos") && !crate::theme::fullscreen() {
            88.0
        } else {
            14.0
        };
        let traffic_pad = (toggle_left + 24.0 - sidebar_w).max(0.0);

        let top_bar = div()
            .h(px(HEADER_H))
            .px(px(16.))
            .border_b_1()
            .border_color(Theme::line_divider())
            .flex()
            .items_center()
            .justify_between()
            .gap(px(12.))
            .title_bar()
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .when(traffic_pad > 0.1, |d| d.pl(px(traffic_pad)))
                    .child(left_header),
            )
            .child(
                div()
                    .no_drag()
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .pr(px(ui::header_right_inset()))
                    .when(in_focus, |d| d.child(focus_controls))
                    .when(!in_focus, |d| {
                        d.child(
                            div()
                                .id("topbar-search")
                                .size(px(28.))
                                .rounded(px(7.))
                                .flex()
                                .items_center()
                                .justify_center()
                                .cursor_pointer()
                                .hover(|s| s.bg(Theme::fill_hover()))
                                .on_click(|_, window, cx| {
                                    window.dispatch_action(Box::new(OpenCommandPalette), cx);
                                })
                                .child(ui::icon("search", 14., Theme::icon())),
                        )
                        .when(self.state.nav != PrimaryNav::NewSession, |d| {
                            d.child(
                                div()
                                    .id("topbar-capture")
                                    .size(px(28.))
                                    .rounded(px(7.))
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .cursor_pointer()
                                    .hover(|s| s.bg(Theme::fill_hover()))
                                    .on_click(|_, window, cx| {
                                        window.dispatch_action(Box::new(OpenQuickCapture), cx);
                                    })
                                    .child(ui::icon("plus", 15., Theme::icon())),
                            )
                        })
                    }),
            );

        let body: AnyElement = if self.state.decision_pane_open {
            decision_pane::render_decision_pane(self, window, cx).into_any_element()
        } else {
            match self.state.nav.clone() {
                PrimaryNav::NewSession => session::render_new_session(self, cx).into_any_element(),
                PrimaryNav::Settings => settings_view::render_settings(self, cx).into_any_element(),
                PrimaryNav::Project(pid) => project::render_project(self, &pid, viewport_w, cx).into_any_element(),
                PrimaryNav::Bot(bid) => bots::render_bot(self, &bid, cx).into_any_element(),
                PrimaryNav::Inbox => inbox::render_inbox(self, cx).into_any_element(),
                PrimaryNav::Tasks => tasks::render_global_tasks(self, window, cx).into_any_element(),
                PrimaryNav::Schedules => schedules::render_global_schedules(self, cx).into_any_element(),
            }
        };

        let body_wrap = div()
            .relative()
            .flex_1()
            .min_w_0()
            .min_h_0()
            .h_full()
            .flex()
            .child(body);
        let animated_body: AnyElement = if self.view_epoch == 0 || cx.reduce_motion() {
            body_wrap.into_any_element()
        } else {
            let anim = Animation::new(Duration::from_millis(180)).with_easing(ease_out_quint());
            if in_focus && self.state.decision_tab == DecisionPaneTab::Canvas {
                // Keep BoardView layout origin fixed so canvas hit-testing never shifts mid-entrance.
                body_wrap
                    .with_animation(("view-enter", self.view_epoch), anim, |el, t| {
                        el.opacity(0.35 + 0.65 * t)
                    })
                    .into_any_element()
            } else {
                body_wrap
                    .with_animation(("view-enter", self.view_epoch), anim, |el, t| {
                        el.top(px((1.0 - t) * 6.0)).opacity(0.25 + 0.75 * t)
                    })
                    .into_any_element()
            }
        };

        let surface = div()
            .id("merak-surface")
            .relative()
            .flex_1()
            .min_w_0()
            .h_full()
            .flex()
            .flex_col()
            .bg(Theme::bg_body())
            .shadow(theme::shadow_note())
            .child(top_bar)
            .child(div().flex_1().min_h_0().min_w_0().w_full().flex().child(animated_body));

        let toast_el = self
            .toast
            .as_ref()
            .and_then(|(k, msg, t0)| ui::toast_el(*k, msg, *t0, window));

        let overlays = overlays::render_overlays(self, cx);

        div()
            .id("workspace")
            .key_context("Workspace")
            .track_focus(&self.focus)
            .relative()
            .size_full()
            .flex()
            .bg(Theme::window())
            .font_family(theme::UI_FONT)
            .text_color(Theme::text())
            .on_key_down(cx.listener(|this, ev: &KeyDownEvent, window, cx| {
                if ev.keystroke.key == "escape" && !this.state.palette_open {
                    if this.state.new_project_open {
                        this.close_new_project_modal(window, cx);
                    } else if this.state.session_picker.take().is_some()
                        || this.state.settings_dropdown.take().is_some()
                    {
                        cx.notify();
                    } else if this.state.comments_drawer_open {
                        this.state.comments_drawer_open = false;
                        cx.notify();
                    } else if this.state.decision_pane_open {
                        this.state.decision_pane_open = false;
                        cx.notify();
                    } else if this.state.task_inspector_open || this.state.schedule_inspector_open {
                        this.state.task_inspector_open = false;
                        this.state.schedule_inspector_open = false;
                        cx.notify();
                    } else if matches!(this.state.nav, PrimaryNav::NewSession | PrimaryNav::Settings) {
                        this.state.nav = this.state.last_non_session_nav.clone();
                        cx.notify();
                    }
                    return;
                }

                if this.state.nav == PrimaryNav::Inbox
                    && !this.state.decision_pane_open
                    && !this.state.palette_open
                    && this.focus.is_focused(window)
                    && !ev.keystroke.modifiers.platform
                    && !ev.keystroke.modifiers.control
                    && !ev.keystroke.modifiers.alt
                {
                    match ev.keystroke.key.as_str() {
                        "j" | "down" => {
                            if this.state.step_inbox_selection(1) {
                                this.mail_reply_input.update(cx, |f, cx| f.set_text("", cx));
                                cx.notify();
                            }
                        }
                        "k" | "up" => {
                            if this.state.step_inbox_selection(-1) {
                                this.mail_reply_input.update(cx, |f, cx| f.set_text("", cx));
                                cx.notify();
                            }
                        }
                        "e" => {
                            let iid = this.state.selected_inbox_id.clone();
                            if this.state.snapshot.inbox.iter().any(|i| i.id == iid && i.status.is_pending()) {
                                this.decide_inbox(&iid, InboxStatus::Archived, None, window, cx);
                            }
                        }
                        _ => {}
                    }
                }
            }))
            .on_action(|_: &Quit, _, cx| cx.quit())
            .on_action(|_: &CloseWindow, window, _| window.remove_window())
            .on_action(cx.listener(|this, _: &ToggleSidebar, _, cx| {
                this.state.sidebar_open = !this.state.sidebar_open;
                cx.notify();
            }))
            .on_action(cx.listener(|this, _: &ToggleExpandDecisionPane, window, cx| {
                if !this.state.decision_pane_open {
                    let aid = this.state.selected_artifact_id.clone();
                    this.open_artifact_in_decision_pane(&aid, window, cx);
                } else {
                    this.state.decision_pane_open = false;
                    this.state.comments_drawer_open = false;
                    window.focus(&this.focus, cx);
                    cx.notify();
                }
            }))
            .on_action(cx.listener(|this, _: &OpenCommandPalette, window, cx| {
                this.state.palette_open = !this.state.palette_open;
                if this.state.palette_open {
                    this.state.palette_selected = 0;
                    this.palette_input.focus_handle(cx).focus(window, cx);
                } else {
                    window.focus(&this.focus, cx);
                }
                cx.notify();
            }))
            .on_action(cx.listener(|this, _: &OpenQuickCapture, window, cx| {
                this.open_new_session(window, cx);
            }))
            .on_action(cx.listener(|this, _: &NewProject, window, cx| {
                this.open_new_project_modal(window, cx);
            }))
            .on_action(cx.listener(|this, _: &FocusInbox, window, cx| {
                this.switch_nav(PrimaryNav::Inbox, window, cx);
            }))
            .on_action(cx.listener(|this, _: &FocusTasks, window, cx| {
                this.switch_nav(PrimaryNav::Tasks, window, cx);
            }))
            .on_action(cx.listener(|this, _: &FocusSchedules, window, cx| {
                this.switch_nav(PrimaryNav::Schedules, window, cx);
            }))
            .on_action(cx.listener(|this, _: &FocusProject1, window, cx| {
                if let Some(pid) = this.state.snapshot.projects.first().map(|p| p.id.clone()) {
                    this.open_project_view(&pid, window, cx);
                }
            }))
            .on_action(cx.listener(|this, _: &FocusProject2, window, cx| {
                if let Some(pid) = this.state.snapshot.projects.get(1).map(|p| p.id.clone()) {
                    this.open_project_view(&pid, window, cx);
                }
            }))
            .on_action(cx.listener(|this, _: &FocusBots, window, cx| {
                this.switch_rail(RailSection::Bots, window, cx);
            }))
            .on_action(cx.listener(|this, _: &FocusVerifyTab, window, cx| {
                this.open_active_project_verify(window, cx);
            }))
            .on_action(cx.listener(|this, _: &ToggleThemeMode, window, cx| {
                this.toggle_theme(window, cx);
            }))
            .on_action(cx.listener(|this, _: &OpenSettings, window, cx| {
                this.open_settings(window, cx);
            }))
            .children(sidebar_el)
            .child(surface)
            .child(
                div()
                    .id("toggle-sidebar-btn")
                    .absolute()
                    .top(px(8.))
                    .left(px(toggle_left))
                    .no_drag()
                    .occlude()
                    .size(px(28.))
                    .rounded_full()
                    .bg(sidebar::floating_pill_bg())
                    .border_1()
                    .border_color(sidebar::floating_pill_border())
                    .shadow(theme::shadow_button())
                    .flex()
                    .items_center()
                    .justify_center()
                    .cursor_pointer()
                    .hover(|s| s.bg(sidebar::floating_pill_hover()))
                    .tip(
                        if self.state.sidebar_open { "收起侧边栏" } else { "展开侧边栏" },
                        Some("⌘\\"),
                    )
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.state.sidebar_open = !this.state.sidebar_open;
                        cx.notify();
                    }))
                    .child(ui::icon(
                        if self.state.sidebar_open {
                            "panel-left-close"
                        } else {
                            "panel-left-open"
                        },
                        14.,
                        Theme::icon(),
                    )),
            )
            .children(overlays)
            .children(toast_el)
            .children(ui::window_controls(window))
    }
}

#[cfg(test)]
mod tests {
    use merak_contracts::{seed_snapshot, ArtifactKind};

    #[test]
    fn seeded_canvases_parse_in_board_engine() {
        let snap = seed_snapshot();
        let canvas_artifacts: Vec<_> = snap
            .artifacts
            .into_iter()
            .filter(|a| a.kind == ArtifactKind::DecisionCanvas)
            .collect();
        assert_eq!(canvas_artifacts.len(), 4);
        for art in canvas_artifacts {
            let json = art
                .canvas_scene_json
                .as_deref()
                .expect("decision canvas has JSON");
            let board = crate::whiteboard::Board::from_scene(json, 480.0)
                .unwrap_or_else(|| panic!("Board::from_scene failed for {}", art.id));
            assert!(
                board.elements.len() >= 4,
                "expected >= 4 elements in {}, got {}",
                art.id,
                board.elements.len()
            );
        }
    }
}
