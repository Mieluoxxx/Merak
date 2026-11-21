use merak_contracts::{
    Artifact, ArtifactKind, Bot, BotSession, BotStatus, DecisionPaneTab, InboxItem, InboxStatus,
    MerakSnapshot, Project, ScheduleNotifyPolicy, ScheduledJob, Task, TaskStatus,
};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RailSection {
    Home,
    Projects,
    Bots,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PrimaryNav {
    NewSession,
    Settings,
    Project(String),
    Bot(String),
    Inbox,
    Tasks,
    Schedules,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProjectTab {
    Artifacts,
    Tasks,
    Schedules,
    Repos,
}

impl ProjectTab {
    pub const ALL: [ProjectTab; 4] = [
        ProjectTab::Artifacts,
        ProjectTab::Tasks,
        ProjectTab::Schedules,
        ProjectTab::Repos,
    ];

    pub fn label(self) -> &'static str {
        match self {
            ProjectTab::Artifacts => "产物",
            ProjectTab::Tasks => "任务",
            ProjectTab::Schedules => "定时",
            ProjectTab::Repos => "代码仓",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ArtifactFilter {
    All,
    Canvas,
    Verify,
    Spec,
    Table,
}

impl ArtifactFilter {
    pub const ALL: [ArtifactFilter; 5] = [
        ArtifactFilter::All,
        ArtifactFilter::Canvas,
        ArtifactFilter::Verify,
        ArtifactFilter::Spec,
        ArtifactFilter::Table,
    ];

    pub fn label(self) -> &'static str {
        match self {
            ArtifactFilter::All => "全部",
            ArtifactFilter::Canvas => "白板",
            ArtifactFilter::Verify => "验收",
            ArtifactFilter::Spec => "文档",
            ArtifactFilter::Table => "数据表",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InboxFilter {
    Pending,
    Archived,
    All,
}

impl InboxFilter {
    pub const ALL: [InboxFilter; 3] = [
        InboxFilter::Pending,
        InboxFilter::Archived,
        InboxFilter::All,
    ];

    pub fn label(self) -> &'static str {
        match self {
            InboxFilter::Pending => "待裁决",
            InboxFilter::Archived => "已归档",
            InboxFilter::All => "全部",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaskViewMode {
    List,
    Board,
    Table,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BotViewTab {
    Chat,
    Profile,
}

impl BotViewTab {
    pub const ALL: [BotViewTab; 2] = [BotViewTab::Chat, BotViewTab::Profile];

    pub fn label(self) -> &'static str {
        match self {
            BotViewTab::Chat => "对话",
            BotViewTab::Profile => "档案与巡检",
        }
    }
}

pub const PROJECT_COLORS: [u32; 6] = [
    0x3b66f5,
    0x10b981,
    0xf59e0b,
    0x8b5cf6,
    0xef4444,
    0x06b6d4,
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NewProjectMode {
    Blank,
    FromGitRepo,
}

impl NewProjectMode {
    pub const ALL: [NewProjectMode; 2] = [NewProjectMode::Blank, NewProjectMode::FromGitRepo];

    pub fn label(self) -> &'static str {
        match self {
            NewProjectMode::Blank => "空白项目",
            NewProjectMode::FromGitRepo => "从 Git 仓库创建",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionDeliverable {
    FreeChat,
    DecisionCanvas,
    VerifyReport,
    SpecDoc,
    Schedule,
}

impl From<SessionDeliverable> for merak_core::SessionDeliverableKind {
    fn from(d: SessionDeliverable) -> Self {
        match d {
            SessionDeliverable::FreeChat => Self::FreeChat,
            SessionDeliverable::DecisionCanvas => Self::DecisionCanvas,
            SessionDeliverable::VerifyReport => Self::VerifyReport,
            SessionDeliverable::SpecDoc => Self::SpecDoc,
            SessionDeliverable::Schedule => Self::Schedule,
        }
    }
}

impl SessionDeliverable {
    pub const ALL: [SessionDeliverable; 5] = [
        SessionDeliverable::FreeChat,
        SessionDeliverable::DecisionCanvas,
        SessionDeliverable::VerifyReport,
        SessionDeliverable::SpecDoc,
        SessionDeliverable::Schedule,
    ];

    pub fn label(self) -> &'static str {
        match self {
            SessionDeliverable::FreeChat => "自由对话",
            SessionDeliverable::DecisionCanvas => "决策白板",
            SessionDeliverable::VerifyReport => "双轨验收",
            SessionDeliverable::SpecDoc => "规格文档",
            SessionDeliverable::Schedule => "定时巡检",
        }
    }

    pub fn icon(self) -> &'static str {
        match self {
            SessionDeliverable::FreeChat => "chat",
            SessionDeliverable::DecisionCanvas => "whiteboard",
            SessionDeliverable::VerifyReport => "todo-check",
            SessionDeliverable::SpecDoc => "file-text",
            SessionDeliverable::Schedule => "history",
        }
    }

    pub fn description(self) -> &'static str {
        match self {
            SessionDeliverable::FreeChat => "直接与选定 Bot 开启实时对话线程，随时沉淀为白板或文档",
            SessionDeliverable::DecisionCanvas => "在 Excalidraw 白板呈现多方案对比与拍板栏",
            SessionDeliverable::VerifyReport => "汇总机器自检证据与人类裁决项",
            SessionDeliverable::SpecDoc => "生成可编辑规格说明文档",
            SessionDeliverable::Schedule => "配置周期性自动巡检与异常上报",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionPicker {
    Project,
    Bot,
    Deliverable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SettingsSection {
    General,
    Appearance,
    Mailbox,
    Shortcuts,
    Permissions,
    CanvasVerify,
    Storage,
    Daemon,
    GitWorktree,
}

impl SettingsSection {
    pub const CORE: [SettingsSection; 4] = [
        SettingsSection::General,
        SettingsSection::Appearance,
        SettingsSection::Mailbox,
        SettingsSection::Shortcuts,
    ];

    pub const WORKBENCH: [SettingsSection; 3] = [
        SettingsSection::Permissions,
        SettingsSection::CanvasVerify,
        SettingsSection::Storage,
    ];

    pub const RUNTIME: [SettingsSection; 2] = [
        SettingsSection::Daemon,
        SettingsSection::GitWorktree,
    ];

    pub fn label(self) -> &'static str {
        match self {
            SettingsSection::General => "常规",
            SettingsSection::Appearance => "外观",
            SettingsSection::Mailbox => "通知与邮箱",
            SettingsSection::Shortcuts => "键盘快捷键",
            SettingsSection::Permissions => "权限",
            SettingsSection::CanvasVerify => "画板与验收",
            SettingsSection::Storage => "数据与存储",
            SettingsSection::Daemon => "守护进程",
            SettingsSection::GitWorktree => "Git 与 Worktrees",
        }
    }

    pub fn subtitle(self) -> &'static str {
        match self {
            SettingsSection::General => "设置工作空间、默认打开方式与常规偏好",
            SettingsSection::Appearance => "调整深浅配色、macOS 毛玻璃材质与界面字号",
            SettingsSection::Mailbox => "配置 Linus 式应用内 Mailbox 过滤与红线推送策略",
            SettingsSection::Shortcuts => "全局效率快捷键一览",
            SettingsSection::Permissions => "管理默认读写边界与破坏性操作红线审批",
            SettingsSection::CanvasVerify => "设置 Excalidraw 决策白板与双轨验收放行口径",
            SettingsSection::Storage => "查看本地库路径与已归档的邮件决策记录",
            SettingsSection::Daemon => "查看 Cordis 微内核服务状态、Project Fiber 树与 merak-core 运行时信息",
            SettingsSection::GitWorktree => "管理并发 Bot 分支隔离与默认代码对比工具",
        }
    }

    pub fn icon(self) -> &'static str {
        match self {
            SettingsSection::General => "settings",
            SettingsSection::Appearance => "palette",
            SettingsSection::Mailbox => "alarm-clock",
            SettingsSection::Shortcuts => "keyboard",
            SettingsSection::Permissions => "ft-lock",
            SettingsSection::CanvasVerify => "whiteboard",
            SettingsSection::Storage => "storage",
            SettingsSection::Daemon => "bot",
            SettingsSection::GitWorktree => "list-tree",
        }
    }

    pub fn matches_query(self, q: &str) -> bool {
        let q = q.trim().to_lowercase();
        if q.is_empty() {
            return true;
        }
        let hay = match self {
            SettingsSection::General => "常规 general 权限 默认 打开 编辑器 语言 窗口 菜单栏",
            SettingsSection::Appearance => "外观 appearance 主题 浅色 深色 系统 毛玻璃 纯色 字号 font theme",
            SettingsSection::Mailbox => "通知 邮箱 mailbox inbox 绿灯 静默 红线 未读 蓝点",
            SettingsSection::Shortcuts => "键盘 快捷键 shortcuts keybindings ⌘n ⌘k ⌘,",
            SettingsSection::Permissions => "权限 permissions 工作空间 完全访问 审批 护栏",
            SettingsSection::CanvasVerify => "画板 验收 canvas verify excalidraw 自证 pass reject",
            SettingsSection::Storage => "数据 存储 storage 归档 archived 路径 本地库",
            SettingsSection::Daemon => "守护进程 daemon cordis fiber 微内核 merak-core merak-contracts 协议 运行模式",
            SettingsSection::GitWorktree => "git worktree 分支 隔离 并发 bot 对比 diff",
        };
        self.label().to_lowercase().contains(&q)
            || self.subtitle().to_lowercase().contains(&q)
            || hay.contains(&q)
    }
}

#[derive(Clone)]
pub struct WorkbenchState {
    pub core: merak_core::MerakCoreHandle,
    pub runtime_report: merak_core::CordisRuntimeReport,
    pub snapshot: MerakSnapshot,
    pub rail: RailSection,
    pub last_home_nav: PrimaryNav,
    pub nav: PrimaryNav,
    pub last_non_session_nav: PrimaryNav,
    pub project_tab: ProjectTab,
    pub artifact_filter: ArtifactFilter,
    pub inbox_filter: InboxFilter,
    pub task_view: TaskViewMode,
    pub bot_tab: BotViewTab,
    pub schedule_project_filter: Option<String>,
    pub selected_project_id: String,
    pub selected_bot_id: String,
    pub selected_artifact_id: String,
    pub selected_task_id: String,
    pub selected_inbox_id: String,
    pub selected_schedule_id: String,
    pub selected_session_id: String,
    pub bot_active_sessions: HashMap<String, String>,
    pub expanded_tool_call_ids: HashSet<String>,
    pub session_project_id: String,
    pub session_bot_id: String,
    pub session_deliverable: SessionDeliverable,
    pub session_picker: Option<SessionPicker>,
    pub new_project_open: bool,
    pub new_project_mode: NewProjectMode,
    pub new_project_color: u32,
    pub new_project_bot_id: String,
    pub default_schedule_notify: ScheduleNotifyPolicy,
    pub settings_section: SettingsSection,
    pub settings_dropdown: Option<&'static str>,
    pub perm_workspace_rw: bool,
    pub perm_full_access: bool,
    pub confirm_close_window: &'static str,
    pub default_open_editor: &'static str,
    pub show_in_menubar: bool,
    pub canvas_auto_fit: bool,
    pub verify_require_human_pass: bool,
    pub mailbox_guardrail_gate: bool,
    pub mailbox_badge_dot: bool,
    pub worktree_isolate_bots: bool,
    pub decision_tab: DecisionPaneTab,
    pub decision_pane_open: bool,
    pub decision_pane_expanded: bool,
    pub comments_drawer_open: bool,
    pub task_inspector_open: bool,
    pub schedule_inspector_open: bool,
    pub staged_options: HashMap<String, String>,
    pub expanded_claim_ids: HashSet<String>,
    pub sidebar_open: bool,
    pub sidebar_width: f32,
    pub palette_open: bool,
    pub palette_selected: usize,
}

impl WorkbenchState {
    pub fn new() -> Self {
        let core = merak_core::MerakCoreHandle::boot_default();
        let snapshot = core.snapshot();
        let runtime_report = core.runtime_report();
        let selected_project_id = snapshot.projects.first().map(|p| p.id.clone()).unwrap_or_default();
        let selected_bot_id = snapshot.bots.first().map(|b| b.id.clone()).unwrap_or_default();
        let session_bot_id = snapshot
            .projects
            .first()
            .map(|p| p.default_bot_id.clone())
            .unwrap_or_else(|| selected_bot_id.clone());
        let selected_artifact_id = snapshot
            .projects
            .first()
            .map(|p| p.active_artifact_id.clone())
            .unwrap_or_default();
        let selected_task_id = snapshot.tasks.first().map(|t| t.id.clone()).unwrap_or_default();
        let selected_inbox_id = snapshot.inbox.first().map(|i| i.id.clone()).unwrap_or_default();
        let selected_schedule_id = snapshot.schedules.first().map(|s| s.id.clone()).unwrap_or_default();
        let selected_session_id = snapshot.sessions.first().map(|s| s.id.clone()).unwrap_or_default();
        let mut bot_active_sessions = HashMap::new();
        for ses in &snapshot.sessions {
            bot_active_sessions
                .entry(ses.bot_id.clone())
                .or_insert_with(|| ses.id.clone());
        }
        let initial_nav = PrimaryNav::Project(selected_project_id.clone());

        Self {
            core,
            runtime_report,
            snapshot,
            rail: RailSection::Projects,
            last_home_nav: PrimaryNav::Inbox,
            nav: initial_nav.clone(),
            last_non_session_nav: initial_nav,
            project_tab: ProjectTab::Artifacts,
            artifact_filter: ArtifactFilter::All,
            inbox_filter: InboxFilter::Pending,
            task_view: TaskViewMode::List,
            bot_tab: BotViewTab::Chat,
            schedule_project_filter: None,
            selected_project_id: selected_project_id.clone(),
            selected_bot_id: selected_bot_id.clone(),
            selected_artifact_id,
            selected_task_id,
            selected_inbox_id,
            selected_schedule_id,
            selected_session_id,
            bot_active_sessions,
            expanded_tool_call_ids: HashSet::new(),
            session_project_id: selected_project_id,
            session_bot_id,
            session_deliverable: SessionDeliverable::FreeChat,
            session_picker: None,
            new_project_open: false,
            new_project_mode: NewProjectMode::Blank,
            new_project_color: PROJECT_COLORS[0],
            new_project_bot_id: selected_bot_id,
            default_schedule_notify: ScheduleNotifyPolicy::SilentOnPass,
            settings_section: SettingsSection::General,
            settings_dropdown: None,
            perm_workspace_rw: true,
            perm_full_access: false,
            confirm_close_window: "仅在使用“关闭”快捷键时",
            default_open_editor: "Zed",
            show_in_menubar: true,
            canvas_auto_fit: true,
            verify_require_human_pass: true,
            mailbox_guardrail_gate: true,
            mailbox_badge_dot: true,
            worktree_isolate_bots: true,
            decision_tab: DecisionPaneTab::Canvas,
            decision_pane_open: false,
            decision_pane_expanded: true,
            comments_drawer_open: false,
            task_inspector_open: false,
            schedule_inspector_open: false,
            staged_options: HashMap::new(),
            expanded_claim_ids: HashSet::new(),
            sidebar_open: true,
            sidebar_width: 284.0,
            palette_open: false,
            palette_selected: 0,
        }
    }

    pub fn sync_from_core(&mut self) {
        self.snapshot = self.core.snapshot();
        self.runtime_report = self.core.runtime_report();
    }

    pub fn pending_inbox_count(&self) -> usize {
        self.snapshot.inbox.iter().filter(|i| i.status.is_pending()).count()
    }

    pub fn project(&self, id: &str) -> Option<&Project> {
        self.snapshot.projects.iter().find(|p| p.id == id)
    }

    pub fn bot(&self, id: &str) -> Option<&Bot> {
        self.snapshot.bots.iter().find(|b| b.id == id)
    }

    pub fn artifact(&self, id: &str) -> Option<&Artifact> {
        self.snapshot.artifacts.iter().find(|a| a.id == id)
    }

    pub fn task(&self, id: &str) -> Option<&Task> {
        self.snapshot.tasks.iter().find(|t| t.id == id)
    }

    pub fn project_artifacts(&self, pid: &str) -> Vec<&Artifact> {
        self.snapshot
            .artifacts
            .iter()
            .filter(|a| {
                a.project_id == pid
                    && match self.artifact_filter {
                        ArtifactFilter::All => true,
                        ArtifactFilter::Canvas => a.kind == ArtifactKind::DecisionCanvas,
                        ArtifactFilter::Verify => a.kind == ArtifactKind::VerifyReport,
                        ArtifactFilter::Spec => a.kind == ArtifactKind::SpecDoc,
                        ArtifactFilter::Table => a.kind == ArtifactKind::DataTable,
                    }
            })
            .collect()
    }

    pub fn project_tasks(&self, pid: &str) -> Vec<&Task> {
        self.snapshot.tasks.iter().filter(|t| t.project_id == pid).collect()
    }

    pub fn project_schedules(&self, pid: &str) -> Vec<&ScheduledJob> {
        self.snapshot.schedules.iter().filter(|s| s.project_id == pid).collect()
    }

    pub fn bot_artifacts(&self, bid: &str) -> Vec<&Artifact> {
        self.snapshot
            .artifacts
            .iter()
            .filter(|a| a.bot_id == bid)
            .collect()
    }

    pub fn bot_schedules(&self, bid: &str) -> Vec<&ScheduledJob> {
        self.snapshot
            .schedules
            .iter()
            .filter(|s| s.bot_id == bid)
            .collect()
    }

    pub fn has_waiting_bot(&self) -> bool {
        self.snapshot
            .bots
            .iter()
            .any(|b| b.status == BotStatus::WaitingVerdict)
    }

    pub fn switch_rail(&mut self, rail: RailSection) {
        self.rail = rail;
        self.decision_pane_open = false;
        self.comments_drawer_open = false;
        self.task_inspector_open = false;
        self.schedule_inspector_open = false;
        self.nav = match rail {
            RailSection::Home => self.last_home_nav.clone(),
            RailSection::Projects => PrimaryNav::Project(self.selected_project_id.clone()),
            RailSection::Bots => PrimaryNav::Bot(self.selected_bot_id.clone()),
        };
        if self.nav == PrimaryNav::Inbox {
            self.ensure_valid_inbox_selection();
        }
    }

    pub fn open_bot(&mut self, bid: &str) {
        self.selected_bot_id = bid.to_string();
        self.rail = RailSection::Bots;
        self.nav = PrimaryNav::Bot(bid.to_string());
        self.decision_pane_open = false;
        self.comments_drawer_open = false;
        self.task_inspector_open = false;
        self.schedule_inspector_open = false;
        let sid = self.ensure_bot_session(bid);
        self.selected_session_id = sid;
    }

    pub fn filtered_schedules(&self) -> Vec<&ScheduledJob> {
        self.snapshot
            .schedules
            .iter()
            .filter(|s| {
                self.schedule_project_filter
                    .as_ref()
                    .is_none_or(|pf| &s.project_id == pf)
            })
            .collect()
    }

    pub fn filtered_inbox(&self) -> Vec<&InboxItem> {
        self.snapshot
            .inbox
            .iter()
            .filter(|item| match self.inbox_filter {
                InboxFilter::Pending => item.status.is_pending(),
                InboxFilter::Archived => !item.status.is_pending(),
                InboxFilter::All => true,
            })
            .collect()
    }

    pub fn default_tab_for_artifact(kind: ArtifactKind) -> DecisionPaneTab {
        match kind {
            ArtifactKind::DecisionCanvas => DecisionPaneTab::Canvas,
            ArtifactKind::VerifyReport => DecisionPaneTab::Verify,
            ArtifactKind::SpecDoc => DecisionPaneTab::SpecDoc,
            ArtifactKind::DataTable => DecisionPaneTab::Table,
        }
    }

    pub fn open_project(&mut self, pid: &str) {
        self.selected_project_id = pid.to_string();
        self.rail = RailSection::Projects;
        self.nav = PrimaryNav::Project(pid.to_string());
        self.decision_pane_open = false;
        self.comments_drawer_open = false;
        self.task_inspector_open = false;
        self.schedule_inspector_open = false;
        if let Some(proj) = self.project(pid).cloned() {
            self.selected_artifact_id = proj.active_artifact_id;
        }
    }

    pub fn select_artifact(&mut self, aid: &str) {
        self.selected_artifact_id = aid.to_string();
        if let Some(art) = self.artifact(aid).cloned() {
            self.selected_project_id = art.project_id.clone();
            if let Some(tid) = art.task_id {
                self.selected_task_id = tid;
            }
            self.decision_tab = Self::default_tab_for_artifact(art.kind);
            self.decision_pane_open = true;
            self.decision_pane_expanded = true;
            self.comments_drawer_open = false;
            if !self.staged_options.contains_key(aid)
                && let Some(opt_id) = art
                    .options
                    .iter()
                    .find(|o| o.chosen)
                    .or_else(|| art.options.iter().find(|o| o.recommended))
                    .or_else(|| art.options.first())
                    .map(|o| o.id.clone())
            {
                self.stage_canvas_option(aid, &opt_id);
            }
        }
    }

    pub fn staged_option_for(&self, aid: &str) -> Option<String> {
        self.staged_options
            .get(aid)
            .cloned()
            .or_else(|| self.core.staged_option_for(aid))
    }

    pub fn stage_canvas_option(&mut self, aid: &str, oid: &str) {
        self.staged_options.insert(aid.to_string(), oid.to_string());
        self.core.stage_canvas_option(aid, oid);
    }

    pub fn select_task(&mut self, tid: &str) {
        self.selected_task_id = tid.to_string();
        self.task_inspector_open = true;
        if let Some(task) = self.task(tid).cloned() {
            self.selected_project_id = task.project_id;
            self.selected_artifact_id = task.primary_artifact_id;
        }
    }

    pub fn select_schedule(&mut self, sid: &str) {
        self.selected_schedule_id = sid.to_string();
        self.schedule_inspector_open = true;
    }

    pub fn select_inbox(&mut self, iid: &str) {
        self.selected_inbox_id = iid.to_string();
        if let Some(item) = self.snapshot.inbox.iter().find(|i| i.id == iid).cloned() {
            self.selected_project_id = item.project_id;
            if let Some(sid) = item.schedule_id {
                self.selected_schedule_id = sid;
            }
            if let Some(tid) = item.task_id {
                self.selected_task_id = tid;
            }
            if let Some(aid) = item.artifact_id {
                self.selected_artifact_id = aid;
            }
        }
    }

    pub fn ensure_valid_inbox_selection(&mut self) {
        let visible_ids: Vec<String> = self.filtered_inbox().into_iter().map(|i| i.id.clone()).collect();
        if !visible_ids.iter().any(|id| id == &self.selected_inbox_id) {
            if let Some(first) = visible_ids.first().cloned() {
                self.select_inbox(&first);
            } else {
                self.selected_inbox_id.clear();
            }
        }
    }

    pub fn step_inbox_selection(&mut self, delta: isize) -> bool {
        let ids: Vec<String> = self.filtered_inbox().into_iter().map(|i| i.id.clone()).collect();
        if ids.is_empty() {
            return false;
        }
        let cur = ids
            .iter()
            .position(|id| id == &self.selected_inbox_id)
            .unwrap_or(0) as isize;
        let next = (cur + delta).clamp(0, ids.len() as isize - 1) as usize;
        if ids[next] != self.selected_inbox_id {
            self.select_inbox(&ids[next]);
            true
        } else {
            false
        }
    }

    pub fn choose_canvas_option(&mut self, artifact_id: &str, option_id: &str) -> Option<String> {
        let msg = self.core.choose_canvas_option(artifact_id, option_id)?;
        self.staged_options
            .insert(artifact_id.to_string(), option_id.to_string());
        self.sync_from_core();
        Some(msg)
    }

    pub fn verdict_human_claim(&mut self, artifact_id: &str, claim_id: &str, pass: bool) -> Option<String> {
        let msg = self.core.verdict_human_claim(artifact_id, claim_id, pass)?;
        self.sync_from_core();
        Some(msg)
    }

    pub fn waive_verify_gap(&mut self, artifact_id: &str, gap_id: &str) -> Option<String> {
        let msg = self.core.waive_verify_gap(artifact_id, gap_id)?;
        self.sync_from_core();
        Some(msg)
    }

    pub fn spawn_task_from_gap(&mut self, artifact_id: &str, gap_id: &str) -> Option<String> {
        let task_id = self.core.spawn_task_from_gap(artifact_id, gap_id)?;
        self.sync_from_core();
        let key = self
            .task(&task_id)
            .map(|t| t.key.clone())
            .unwrap_or_else(|| task_id.clone());
        self.selected_task_id = task_id;
        Some(format!("已转成补测任务 {key}"))
    }

    pub fn dispute_ruling(&mut self, task_id: &str, ruling_id: &str) -> Option<String> {
        let msg = self.core.dispute_ruling(task_id, ruling_id)?;
        self.sync_from_core();
        Some(msg)
    }

    pub fn pin_artifact_comment(&mut self, artifact_id: &str, anchor: &str, body: &str) -> bool {
        let ok = self.core.pin_artifact_comment(artifact_id, anchor, body);
        if ok {
            self.sync_from_core();
        }
        ok
    }

    pub fn ack_artifact_comment(&mut self, artifact_id: &str, comment_id: &str) -> Option<String> {
        let msg = self.core.ack_artifact_comment(artifact_id, comment_id)?;
        self.sync_from_core();
        Some(msg)
    }

    pub fn toggle_schedule_enabled(&mut self, schedule_id: &str) -> Option<String> {
        let msg = self.core.toggle_schedule_enabled(schedule_id)?;
        self.sync_from_core();
        Some(msg)
    }

    pub fn toggle_schedule_policy(&mut self, schedule_id: &str) -> Option<String> {
        let msg = self.core.toggle_schedule_policy(schedule_id)?;
        self.sync_from_core();
        Some(msg)
    }

    pub fn run_schedule_now(&mut self, schedule_id: &str) -> Option<String> {
        let msg = self.core.run_schedule_now(schedule_id)?;
        self.sync_from_core();
        Some(msg)
    }

    pub fn decide_inbox(&mut self, id: &str, status: InboxStatus, reply: Option<String>) -> Option<String> {
        let msg = self.core.decide_inbox(id, status, reply)?;
        self.sync_from_core();
        if self.inbox_filter == InboxFilter::Pending {
            self.ensure_valid_inbox_selection();
        }
        Some(msg)
    }

    pub fn settle_inbox_canvas_decision(&mut self, inbox_id: &str, reply: Option<String>) -> Option<String> {
        if let Some(aid) = self
            .snapshot
            .inbox
            .iter()
            .find(|i| i.id == inbox_id)
            .and_then(|i| i.artifact_id.as_deref())
            && let Some(oid) = self.staged_options.get(aid)
        {
            self.core.stage_canvas_option(aid, oid);
        }
        let msg = self.core.settle_inbox_canvas_decision(inbox_id, reply)?;
        self.sync_from_core();
        if let Some(aid) = self
            .snapshot
            .inbox
            .iter()
            .find(|i| i.id == inbox_id)
            .and_then(|i| i.artifact_id.clone())
            && let Some(oid) = self.core.staged_option_for(&aid)
        {
            self.staged_options.insert(aid, oid);
        }
        if self.inbox_filter == InboxFilter::Pending {
            self.ensure_valid_inbox_selection();
        }
        Some(msg)
    }

    pub fn reply_to_inbox(&mut self, inbox_id: &str, raw: &str) -> bool {
        let ok = self.core.reply_to_inbox(inbox_id, raw);
        if ok {
            self.sync_from_core();
        }
        ok
    }

    pub fn toggle_checklist(&mut self, task_id: &str, check_id: &str) {
        self.core.toggle_checklist(task_id, check_id);
        self.sync_from_core();
    }

    pub fn cycle_task_status(&mut self, task_id: &str) -> Option<TaskStatus> {
        let status = self.core.cycle_task_status(task_id)?;
        self.sync_from_core();
        Some(status)
    }

    pub fn open_new_session(&mut self) {
        if !matches!(self.nav, PrimaryNav::NewSession | PrimaryNav::Settings) {
            self.last_non_session_nav = self.nav.clone();
        }
        self.session_project_id = self.selected_project_id.clone();
        self.session_bot_id = self
            .project(&self.selected_project_id)
            .map(|p| p.default_bot_id.clone())
            .unwrap_or_else(|| self.selected_bot_id.clone());
        self.session_picker = None;
        self.decision_pane_open = false;
        self.comments_drawer_open = false;
        self.task_inspector_open = false;
        self.schedule_inspector_open = false;
        self.nav = PrimaryNav::NewSession;
    }

    pub fn open_settings(&mut self) {
        if !matches!(self.nav, PrimaryNav::NewSession | PrimaryNav::Settings) {
            self.last_non_session_nav = self.nav.clone();
        }
        self.session_picker = None;
        self.settings_dropdown = None;
        self.decision_pane_open = false;
        self.comments_drawer_open = false;
        self.task_inspector_open = false;
        self.schedule_inspector_open = false;
        self.nav = PrimaryNav::Settings;
    }

    pub fn start_session(&mut self, raw: &str) -> Option<(String, Option<String>)> {
        let title = raw.trim().to_string();
        if title.is_empty() {
            return None;
        }
        let pid = self.session_project_id.clone();
        let bot_id = self.session_bot_id.clone();
        let bot_name = self
            .bot(&bot_id)
            .map(|b| b.name.clone())
            .unwrap_or_else(|| "Bot".into());

        let out = self.core.start_session(merak_core::StartSessionInput {
            project_id: pid.clone(),
            bot_id: bot_id.clone(),
            deliverable: self.session_deliverable.into(),
            prompt: title.clone(),
        })?;

        if out.kind == merak_core::SessionDeliverableKind::Schedule
            && self.default_schedule_notify != ScheduleNotifyPolicy::SilentOnPass
        {
            let _ = self.core.toggle_schedule_policy(&out.primary_id);
        }

        self.session_picker = None;
        self.sync_from_core();

        match out.kind {
            merak_core::SessionDeliverableKind::FreeChat => {
                self.selected_session_id = out.primary_id.clone();
                self.bot_active_sessions
                    .insert(bot_id.clone(), out.primary_id);
                self.rail = RailSection::Bots;
                self.selected_bot_id = bot_id.clone();
                self.nav = PrimaryNav::Bot(bot_id);
                self.bot_tab = BotViewTab::Chat;
                self.decision_pane_open = false;
                self.comments_drawer_open = false;
                Some((format!("已与 {bot_name} 开启会话：{title}"), None))
            }
            merak_core::SessionDeliverableKind::DecisionCanvas => {
                self.rail = RailSection::Projects;
                self.selected_project_id = pid.clone();
                self.nav = PrimaryNav::Project(pid);
                self.project_tab = ProjectTab::Artifacts;
                self.select_artifact(&out.primary_id);
                Some((
                    format!("已由 {bot_name} 创建决策白板：{title}"),
                    Some(out.primary_id),
                ))
            }
            merak_core::SessionDeliverableKind::VerifyReport => {
                self.rail = RailSection::Projects;
                self.selected_project_id = pid.clone();
                self.nav = PrimaryNav::Project(pid);
                self.project_tab = ProjectTab::Artifacts;
                self.select_artifact(&out.primary_id);
                self.decision_tab = DecisionPaneTab::Verify;
                Some((
                    format!("已由 {bot_name} 发起双轨验收：{title}"),
                    Some(out.primary_id),
                ))
            }
            merak_core::SessionDeliverableKind::SpecDoc => {
                self.rail = RailSection::Projects;
                self.selected_project_id = pid.clone();
                self.nav = PrimaryNav::Project(pid);
                self.project_tab = ProjectTab::Artifacts;
                self.select_artifact(&out.primary_id);
                self.decision_tab = DecisionPaneTab::SpecDoc;
                Some((
                    format!("已由 {bot_name} 创建规格文档：{title}"),
                    Some(out.primary_id),
                ))
            }
            merak_core::SessionDeliverableKind::Schedule => {
                self.rail = RailSection::Projects;
                self.selected_project_id = pid.clone();
                self.nav = PrimaryNav::Project(pid);
                self.project_tab = ProjectTab::Schedules;
                self.select_schedule(&out.primary_id);
                Some((format!("已配置定时巡检：{title}"), None))
            }
        }
    }

    pub fn session(&self, id: &str) -> Option<&BotSession> {
        self.snapshot.sessions.iter().find(|s| s.id == id)
    }

    pub fn bot_sessions(&self, bot_id: &str) -> Vec<&BotSession> {
        self.snapshot
            .sessions
            .iter()
            .filter(|s| s.bot_id == bot_id)
            .collect()
    }

    pub fn active_session_id_for_bot(&self, bot_id: &str) -> Option<String> {
        if let Some(sid) = self.bot_active_sessions.get(bot_id)
            && self
                .snapshot
                .sessions
                .iter()
                .any(|s| s.id == *sid && s.bot_id == bot_id)
        {
            return Some(sid.clone());
        }
        self.core
            .active_session_id_for_bot(bot_id)
            .or_else(|| {
                self.snapshot
                    .sessions
                    .iter()
                    .find(|s| s.bot_id == bot_id)
                    .map(|s| s.id.clone())
            })
    }

    pub fn ensure_bot_session(&mut self, bot_id: &str) -> String {
        let sid = self.core.ensure_bot_session(bot_id);
        let existed = self.snapshot.sessions.iter().any(|s| s.id == sid);
        self.sync_from_core();
        if !existed {
            self.selected_session_id = sid.clone();
        }
        self.bot_active_sessions
            .insert(bot_id.to_string(), sid.clone());
        sid
    }

    pub fn create_bot_session(
        &mut self,
        bot_id: &str,
        project_id: &str,
        title: Option<&str>,
    ) -> String {
        let sid = self.core.create_bot_session(bot_id, project_id, title);
        self.sync_from_core();
        self.selected_session_id = sid.clone();
        self.bot_active_sessions
            .insert(bot_id.to_string(), sid.clone());
        sid
    }

    pub fn select_session(&mut self, sid: &str) {
        self.core.select_session(sid);
        self.sync_from_core();
        if let Some(ses) = self.session(sid).cloned() {
            self.selected_session_id = ses.id.clone();
            self.bot_active_sessions.insert(ses.bot_id, ses.id);
        }
    }

    pub fn send_chat_message(
        &mut self,
        sid: &str,
        raw: &str,
        git_summary: Option<String>,
    ) -> Option<String> {
        let bot_name = self.core.send_chat_message(sid, raw, git_summary)?;
        self.sync_from_core();
        if let Some(ses) = self.session(sid).cloned() {
            self.selected_session_id = ses.id.clone();
            self.bot_active_sessions.insert(ses.bot_id, ses.id);
        }
        Some(bot_name)
    }

    pub fn promote_session_to_artifact(
        &mut self,
        sid: &str,
        kind: ArtifactKind,
    ) -> Option<(String, String)> {
        let res = self.core.promote_session_to_artifact(sid, kind)?;
        self.sync_from_core();
        Some(res)
    }

    pub fn bind_project_repo(&mut self, pid: &str, normalized_path: String) -> Result<bool, String> {
        let inserted = self.core.bind_project_repo(pid, normalized_path)?;
        self.sync_from_core();
        Ok(inserted)
    }

    pub fn unbind_project_repo(&mut self, pid: &str, path: &str) -> bool {
        match self.core.unbind_project_repo(pid, path) {
            Ok(removed) => {
                if removed {
                    self.sync_from_core();
                }
                removed
            }
            Err(_) => false,
        }
    }

    pub fn set_primary_project_repo(&mut self, pid: &str, path: &str) -> bool {
        let changed = self.core.set_primary_project_repo(pid, path);
        if changed {
            self.sync_from_core();
        }
        changed
    }

    pub fn create_project(
        &mut self,
        name: &str,
        summary: &str,
        color_hex: u32,
        default_bot_id: &str,
        repo_path: Option<String>,
    ) -> Option<String> {
        let out = self
            .core
            .create_project(merak_core::CreateProjectInput {
                name: name.to_string(),
                summary: summary.to_string(),
                color_hex,
                bot_id: default_bot_id.to_string(),
                repo_path,
            })
            .ok()?;
        let pid = out.project_id;
        self.sync_from_core();
        if let Some(ses) = self
            .snapshot
            .sessions
            .iter()
            .find(|s| s.project_id == pid)
            .cloned()
        {
            self.selected_session_id = ses.id.clone();
            self.bot_active_sessions
                .insert(ses.bot_id.clone(), ses.id.clone());
            self.core.select_session(&ses.id);
        }
        self.open_project(&pid);
        self.project_tab = ProjectTab::Artifacts;
        self.new_project_open = false;
        Some(pid)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_project_blank_initializes_clean_state() {
        let mut st = WorkbenchState::new();
        let pid = st
            .create_project("Q4 产品规划", "", PROJECT_COLORS[1], "bot-arch", None)
            .expect("project created");
        let proj = st.project(&pid).expect("project exists");
        assert!(proj.repo_paths.is_empty());
        assert_eq!(proj.color_hex, PROJECT_COLORS[1]);
        assert_eq!(st.nav, PrimaryNav::Project(pid.clone()));
        assert!(st.artifact(&proj.active_artifact_id).is_some());
        assert!(st.snapshot.sessions.iter().any(|s| s.project_id == pid));
    }

    #[test]
    fn create_project_from_git_binds_repo_path() {
        let mut st = WorkbenchState::new();
        let pid = st
            .create_project(
                "demo-repo",
                "本地仓库项目",
                PROJECT_COLORS[0],
                "bot-rust",
                Some("/tmp/demo-repo".into()),
            )
            .expect("git project created");
        let proj = st.project(&pid).expect("project exists");
        assert_eq!(proj.repo_paths, vec!["/tmp/demo-repo".to_string()]);
        assert_eq!(proj.default_bot_id, "bot-rust");
        assert_eq!(st.nav, PrimaryNav::Project(pid));
    }

    #[test]
    fn cordis_runtime_boots_eight_services_and_mounts_seeded_fibers() {
        let st = WorkbenchState::new();
        assert_eq!(st.runtime_report.active_services.len(), 8);
        for expected in [
            "store",
            "projects",
            "artifacts",
            "inbox",
            "tasks",
            "botChat",
            "schedules",
            "runtimeInspect",
        ] {
            assert!(
                st.runtime_report
                    .active_services
                    .iter()
                    .any(|s| s == expected),
                "missing active Cordis service: {expected}"
            );
        }
        assert!(st.runtime_report.active_fibers >= 8);
        assert_eq!(st.runtime_report.projects.len(), 3);
        assert!(
            st.runtime_report
                .projects
                .iter()
                .all(|p| p.state == "ACTIVE")
        );
    }

    #[test]
    fn create_project_mounts_project_and_git_fibers_in_runtime_report() {
        let mut st = WorkbenchState::new();

        let blank_pid = st
            .create_project("空白研究项目", "", PROJECT_COLORS[2], "bot-arch", None)
            .expect("blank project created");
        let blank_fiber = st
            .runtime_report
            .projects
            .iter()
            .find(|p| p.project_id == blank_pid)
            .expect("blank project fiber mounted");
        assert_eq!(blank_fiber.state, "ACTIVE");
        assert!(blank_fiber.git_fibers.is_empty());
        assert!(st.runtime_report.fibers.iter().any(|f| {
            f.name == format!("project:{blank_pid}") && f.kind == "project" && f.state == "Active"
        }));

        let repo_dir = env!("CARGO_MANIFEST_DIR").to_string();
        let git_pid = st
            .create_project(
                "merak-git-proj",
                "",
                PROJECT_COLORS[0],
                "bot-rust",
                Some(repo_dir.clone()),
            )
            .expect("git project created");
        let git_proj_fiber = st
            .runtime_report
            .projects
            .iter()
            .find(|p| p.project_id == git_pid)
            .expect("git project fiber mounted");
        assert_eq!(git_proj_fiber.state, "ACTIVE");
        assert_eq!(git_proj_fiber.git_fibers.len(), 1);
        assert!(git_proj_fiber.git_fibers[0].is_git);

        let parent_uid = git_proj_fiber.fiber_uid;
        assert!(st.runtime_report.fibers.iter().any(|f| {
            f.kind == "git" && f.name.starts_with("git:") && f.parent_uid == Some(parent_uid)
        }));

        assert!(st.unbind_project_repo(&git_pid, &repo_dir));
        assert!(st.runtime_report.cleanup_count >= 1);
    }
}
