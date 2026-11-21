use merak_contracts::{
    seed_snapshot, Artifact, ArtifactComment, ArtifactKind, ArtifactVerdict, Bot, BotSession,
    BotStatus, ChatMessage, ChatRole, ChatToolCall, ChecklistItem, ClaimStatus, DecisionOption,
    DecisionPaneTab, DiffLine, DiffLineKind, DiffPreview, InboxItem, InboxKind, InboxStatus,
    MerakSnapshot, Project, Ruling, ScheduleNotifyPolicy, ScheduleRun, ScheduleRunOutcome,
    ScheduleTriggerKind, ScheduledJob, SessionStatus, Task, TaskPriority, TaskStage, TaskStatus,
    VerifyClaim, VerifyJudge, VerifyReportData,
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
            SettingsSection::Daemon => "查看独立守护进程状态与纯 Rust 契约层信息",
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
            SettingsSection::Daemon => "守护进程 daemon merak-contracts 协议 运行模式 mock",
            SettingsSection::GitWorktree => "git worktree 分支 隔离 并发 bot 对比 diff",
        };
        self.label().to_lowercase().contains(&q)
            || self.subtitle().to_lowercase().contains(&q)
            || hay.contains(&q)
    }
}

#[derive(Clone)]
pub struct WorkbenchState {
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
    pub next_seq: usize,
}

impl WorkbenchState {
    pub fn new() -> Self {
        let snapshot = seed_snapshot();
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
            next_seq: 300,
        }
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
                self.staged_options.insert(aid.to_string(), opt_id);
            }
        }
    }

    pub fn staged_option_for(&self, aid: &str) -> Option<String> {
        if let Some(id) = self.staged_options.get(aid) {
            return Some(id.clone());
        }
        let art = self.artifact(aid)?;
        art.options
            .iter()
            .find(|o| o.chosen)
            .or_else(|| art.options.iter().find(|o| o.recommended))
            .or_else(|| art.options.first())
            .map(|o| o.id.clone())
    }

    pub fn stage_canvas_option(&mut self, aid: &str, oid: &str) {
        self.staged_options.insert(aid.to_string(), oid.to_string());
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
        let idx = self.snapshot.artifacts.iter().position(|a| a.id == artifact_id)?;
        let mut chosen_label = String::new();
        for opt in &mut self.snapshot.artifacts[idx].options {
            opt.chosen = opt.id == option_id;
            if opt.chosen {
                chosen_label = opt.label.clone();
            }
        }
        if chosen_label.is_empty() {
            return None;
        }
        self.staged_options.insert(artifact_id.to_string(), option_id.to_string());
        self.snapshot.artifacts[idx].verdict = ArtifactVerdict::Settled;
        self.snapshot.artifacts[idx].updated_at = "刚刚".into();

        let seq = self.next_seq;
        self.next_seq += 1;
        let task_id = self.snapshot.artifacts[idx].task_id.clone();
        let bot_id = self.snapshot.artifacts[idx].bot_id.clone();

        self.snapshot.artifacts[idx].comments.push(ArtifactComment {
            id: format!("cm-{seq}"),
            author: "主人".into(),
            is_bot: false,
            anchor: "决策栏拍板".into(),
            body: format!("已拍板选定：{chosen_label}"),
            timestamp: "刚刚".into(),
            receipt_ack: true,
        });

        if let Some(bot) = self.snapshot.bots.iter_mut().find(|b| b.id == bot_id) {
            bot.status = BotStatus::Running;
            bot.summary = format!("收到画板拍板「{chosen_label}」，继续推进执行。");
        }

        if let Some(tid) = task_id
            && let Some(task) = self.snapshot.tasks.iter_mut().find(|t| t.id == tid)
        {
            task.stage = TaskStage::SpecApproved;
            task.status = TaskStatus::InProgress;
            task.updated_at = "刚刚".into();
            for c in &mut task.checklist {
                if c.label.contains("拍板") || c.label.contains("策略") {
                    c.done = true;
                }
            }
            task.rulings.insert(
                0,
                Ruling {
                    id: format!("rul-{seq}"),
                    decision: format!("采用 {chosen_label}"),
                    reason: "人类在 Excalidraw 决策白板上完成选型拍板".into(),
                    cost_if_wrong: "架构边界变更需重新调整实现".into(),
                    timestamp: "刚刚".into(),
                    disputed: false,
                },
            );
        }

        for item in &mut self.snapshot.inbox {
            if item.artifact_id.as_deref() == Some(artifact_id) && item.status.is_pending() {
                item.status = InboxStatus::Settled;
                item.receipt_settled = true;
                item.reply_text = Some(format!("已拍板：{chosen_label}"));
            }
        }

        Some(format!("已拍板定案：{chosen_label}"))
    }

    fn recompute_verify_verdict(&mut self, artifact_id: &str) {
        let Some(art) = self.snapshot.artifacts.iter_mut().find(|a| a.id == artifact_id) else {
            return;
        };
        let Some(rep) = &art.verify_report else {
            return;
        };
        let any_rejected = rep
            .claims
            .iter()
            .any(|c| matches!(c.status, ClaimStatus::Rejected | ClaimStatus::Failed));
        let any_pending_human = rep
            .claims
            .iter()
            .any(|c| c.judge == VerifyJudge::Human && c.status == ClaimStatus::PendingHuman);
        let any_open_gap = rep.gaps.iter().any(|g| !g.waived);

        let new_verdict = if any_rejected {
            ArtifactVerdict::Rejected
        } else if any_pending_human || any_open_gap {
            ArtifactVerdict::PendingHuman
        } else {
            ArtifactVerdict::Passed
        };
        art.verdict = new_verdict;
        art.updated_at = "刚刚".into();

        let task_id = art.task_id.clone();
        if new_verdict != ArtifactVerdict::PendingHuman {
            for item in &mut self.snapshot.inbox {
                if item.artifact_id.as_deref() == Some(artifact_id) && item.status.is_pending() {
                    item.status = if new_verdict == ArtifactVerdict::Rejected {
                        InboxStatus::Rejected
                    } else {
                        InboxStatus::Approved
                    };
                    item.receipt_settled = true;
                }
            }
            if let Some(tid) = task_id
                && let Some(task) = self.snapshot.tasks.iter_mut().find(|t| t.id == tid)
            {
                if new_verdict == ArtifactVerdict::Passed {
                    task.stage = TaskStage::Done;
                    task.status = TaskStatus::Done;
                } else {
                    task.status = TaskStatus::InProgress;
                }
                task.updated_at = "刚刚".into();
            }
        }
    }

    pub fn verdict_human_claim(&mut self, artifact_id: &str, claim_id: &str, pass: bool) -> Option<String> {
        let art = self.snapshot.artifacts.iter_mut().find(|a| a.id == artifact_id)?;
        let rep = art.verify_report.as_mut()?;
        let clm = rep.claims.iter_mut().find(|c| c.id == claim_id)?;
        clm.status = if pass { ClaimStatus::Passed } else { ClaimStatus::Rejected };
        let title = clm.title.clone();
        self.recompute_verify_verdict(artifact_id);
        Some(if pass {
            format!("Pass：{title}")
        } else {
            format!("已退回 Reject：{title}")
        })
    }

    pub fn waive_verify_gap(&mut self, artifact_id: &str, gap_id: &str) -> Option<String> {
        let art = self.snapshot.artifacts.iter_mut().find(|a| a.id == artifact_id)?;
        let rep = art.verify_report.as_mut()?;
        let gap = rep.gaps.iter_mut().find(|g| g.id == gap_id)?;
        gap.waived = !gap.waived;
        let waived = gap.waived;
        let title = gap.title.clone();
        self.recompute_verify_verdict(artifact_id);
        Some(if waived {
            format!("已豁免 Gap：{title}")
        } else {
            format!("已恢复待覆盖 Gap：{title}")
        })
    }

    pub fn spawn_task_from_gap(&mut self, artifact_id: &str, gap_id: &str) -> Option<String> {
        let art = self.artifact(artifact_id)?.clone();
        let rep = art.verify_report.as_ref()?;
        let gap = rep.gaps.iter().find(|g| g.id == gap_id)?.clone();

        let seq = self.next_seq;
        self.next_seq += 1;
        let task_id = format!("task-{seq}");
        let key = format!("GAP-{seq}");

        let task = Task {
            id: task_id.clone(),
            key: key.clone(),
            title: format!("补测 Gap：{}", gap.title),
            description: format!("来源报告：{}\n未覆盖原因：{}\n补齐条件：{}", art.title, gap.why, gap.needs),
            stage: TaskStage::SpecApproved,
            status: TaskStatus::Todo,
            priority: TaskPriority::High,
            project_id: art.project_id,
            linked_bot_id: art.bot_id,
            primary_artifact_id: artifact_id.to_string(),
            verify_artifact_id: Some(artifact_id.to_string()),
            updated_at: "刚刚".into(),
            tags: vec!["Verify-Gap".into()],
            checklist: vec![ChecklistItem {
                id: format!("chk-{seq}"),
                label: gap.needs,
                done: false,
            }],
            rulings: vec![],
            diff_preview: DiffPreview {
                file: "pending".into(),
                additions: 0,
                deletions: 0,
                lines: vec![DiffLine {
                    kind: DiffLineKind::Context,
                    text: "// 待 Bot 补齐测试与证据".into(),
                }],
            },
        };
        self.snapshot.tasks.insert(0, task);
        let _ = self.waive_verify_gap(artifact_id, gap_id);
        self.selected_task_id = task_id;
        Some(format!("已转成补测任务 {key}"))
    }

    pub fn dispute_ruling(&mut self, task_id: &str, ruling_id: &str) -> Option<String> {
        let task = self.snapshot.tasks.iter_mut().find(|t| t.id == task_id)?;
        let r = task.rulings.iter_mut().find(|r| r.id == ruling_id)?;
        r.disputed = !r.disputed;
        let disputed = r.disputed;
        let dec = r.decision.clone();
        let project_id = task.project_id.clone();
        let bot_id = task.linked_bot_id.clone();
        let art_id = task.primary_artifact_id.clone();

        if disputed {
            let seq = self.next_seq;
            self.next_seq += 1;
            if let Some(art) = self.snapshot.artifacts.iter_mut().find(|a| a.id == art_id) {
                art.comments.push(ArtifactComment {
                    id: format!("cm-{seq}"),
                    author: "主人".into(),
                    is_bot: false,
                    anchor: format!("Ruling 纠偏 · {dec}"),
                    body: format!("主人对此自主裁决提出异议，请重新评估替代方案。"),
                    timestamp: "刚刚".into(),
                    receipt_ack: false,
                });
            }
            self.snapshot.inbox.insert(
                0,
                InboxItem {
                    id: format!("inb-{seq}"),
                    kind: InboxKind::InlineComment,
                    status: InboxStatus::Settled,
                    title: format!("已对 Ruling「{dec}」发起纠偏批注"),
                    summary: "已写入产物批注流并标记等待 Bot 消费回执。".into(),
                    source_label: format!("{} · 账本纠偏", task.key),
                    timestamp: "刚刚".into(),
                    project_id,
                    task_id: Some(task_id.to_string()),
                    artifact_id: Some(art_id),
                    schedule_id: None,
                    bot_id,
                    command_preview: None,
                    reply_text: None,
                    receipt_settled: false,
                },
            );
        }
        Some(if disputed {
            format!("已标记 Ruling 异议并发送批注")
        } else {
            "已取消 Ruling 异议".into()
        })
    }

    pub fn pin_artifact_comment(&mut self, artifact_id: &str, anchor: &str, body: &str) -> bool {
        let clean = body.trim();
        if clean.is_empty() {
            return false;
        }
        let seq = self.next_seq;
        self.next_seq += 1;
        if let Some(art) = self.snapshot.artifacts.iter_mut().find(|a| a.id == artifact_id) {
            art.comments.push(ArtifactComment {
                id: format!("cm-{seq}"),
                author: "主人".into(),
                is_bot: false,
                anchor: anchor.to_string(),
                body: clean.to_string(),
                timestamp: "刚刚".into(),
                receipt_ack: false,
            });
            art.updated_at = "刚刚".into();
            return true;
        }
        false
    }

    pub fn ack_artifact_comment(&mut self, artifact_id: &str, comment_id: &str) -> Option<String> {
        let bot_id = {
            let art = self.snapshot.artifacts.iter_mut().find(|a| a.id == artifact_id)?;
            let cm = art.comments.iter_mut().find(|c| c.id == comment_id)?;
            cm.receipt_ack = true;
            art.bot_id.clone()
        };
        let bot_name = self
            .bot(&bot_id)
            .map(|b| b.name.clone())
            .unwrap_or_else(|| "Bot".into());
        Some(format!("{bot_name} 已确认消费批注回执（ack）"))
    }

    pub fn toggle_schedule_enabled(&mut self, schedule_id: &str) -> Option<String> {
        let job = self.snapshot.schedules.iter_mut().find(|s| s.id == schedule_id)?;
        job.enabled = !job.enabled;
        job.next_run_at = if job.enabled { "按 Cron 队列".into() } else { "已暂停".into() };
        Some(format!("{}：{}", if job.enabled { "已启用定时任务" } else { "已暂停定时任务" }, job.name))
    }

    pub fn toggle_schedule_policy(&mut self, schedule_id: &str) -> Option<String> {
        let job = self.snapshot.schedules.iter_mut().find(|s| s.id == schedule_id)?;
        job.notify_policy = job.notify_policy.toggle();
        Some(format!("通知策略切为：{}", job.notify_policy.label()))
    }

    pub fn run_schedule_now(&mut self, schedule_id: &str) -> Option<String> {
        let seq = self.next_seq;
        self.next_seq += 1;

        let job = self.snapshot.schedules.iter_mut().find(|s| s.id == schedule_id)?;
        let next_outcome = if seq % 2 == 0 {
            ScheduleRunOutcome::AllGreen
        } else {
            ScheduleRunOutcome::HasGaps
        };
        let verify_aid = job.runs.iter().find_map(|r| r.verify_artifact_id.clone());
        let summary: String = match (next_outcome, job.notify_policy) {
            (ScheduleRunOutcome::AllGreen, ScheduleNotifyPolicy::SilentOnPass) => {
                "手动执行全绿通过（绿灯静默策略生效：未打扰 Inbox）".into()
            }
            (ScheduleRunOutcome::AllGreen, ScheduleNotifyPolicy::AlwaysInbox) => {
                "手动执行全绿通过（已按策略推送 Inbox 简报）".into()
            }
            _ => "手动执行发现 1 项需关注 Gap，已推送 Inbox 裁决卡".into(),
        };

        job.last_run_at = "刚刚".into();
        job.last_outcome = next_outcome;
        job.runs.insert(
            0,
            ScheduleRun {
                id: format!("run-{seq}"),
                ran_at: "刚刚".into(),
                duration_ms: 1420,
                outcome: next_outcome,
                summary: summary.clone(),
                verify_artifact_id: verify_aid.clone(),
            },
        );

        let should_push_inbox =
            next_outcome != ScheduleRunOutcome::AllGreen || job.notify_policy == ScheduleNotifyPolicy::AlwaysInbox;
        let project_id = job.project_id.clone();
        let bot_id = job.bot_id.clone();
        let job_name = job.name.clone();

        if should_push_inbox {
            self.snapshot.inbox.insert(
                0,
                InboxItem {
                    id: format!("inb-{seq}"),
                    kind: if next_outcome == ScheduleRunOutcome::AllGreen {
                        InboxKind::VerifyVerdict
                    } else {
                        InboxKind::GapWaiver
                    },
                    status: InboxStatus::Pending,
                    title: format!("定时任务运行结果：{job_name}"),
                    summary: summary.clone(),
                    source_label: format!("{} · 立即执行", job.schedule_label),
                    timestamp: "刚刚".into(),
                    project_id,
                    task_id: None,
                    artifact_id: verify_aid,
                    schedule_id: Some(schedule_id.to_string()),
                    bot_id,
                    command_preview: Some(job.schedule_expr.clone()),
                    reply_text: None,
                    receipt_settled: false,
                },
            );
        }
        Some(summary)
    }

    pub fn decide_inbox(&mut self, id: &str, status: InboxStatus, reply: Option<String>) -> Option<String> {
        let idx = self.snapshot.inbox.iter().position(|i| i.id == id)?;
        self.snapshot.inbox[idx].status = status;
        self.snapshot.inbox[idx].receipt_settled = true;
        let clean_reply = reply.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        if let Some(r) = clean_reply.clone() {
            self.snapshot.inbox[idx].reply_text = Some(r);
        }
        let title = self.snapshot.inbox[idx].title.clone();
        let aid = self.snapshot.inbox[idx].artifact_id.clone();

        if let Some(aid_ref) = aid.as_deref()
            && let Some(r) = clean_reply
        {
            self.pin_artifact_comment(aid_ref, "Mailbox 回执", &r);
        }

        if status == InboxStatus::Approved
            && let Some(aid) = aid
            && let Some(art) = self.snapshot.artifacts.iter_mut().find(|a| a.id == aid)
            && art.kind == ArtifactKind::VerifyReport
        {
            art.verdict = ArtifactVerdict::Passed;
        }

        if self.inbox_filter == InboxFilter::Pending {
            self.ensure_valid_inbox_selection();
        }
        Some(format!("{}：{}", status.label(), title))
    }

    pub fn settle_inbox_canvas_decision(&mut self, inbox_id: &str, reply: Option<String>) -> Option<String> {
        let aid = self
            .snapshot
            .inbox
            .iter()
            .find(|i| i.id == inbox_id)
            .and_then(|i| i.artifact_id.clone())?;
        let art = self.artifact(&aid)?.clone();
        if art.kind != ArtifactKind::DecisionCanvas || art.options.is_empty() {
            return None;
        }
        let oid = self.staged_option_for(&aid)?;
        let _ = self.choose_canvas_option(&aid, &oid)?;
        self.decide_inbox(inbox_id, InboxStatus::Settled, reply)
    }

    pub fn reply_to_inbox(&mut self, inbox_id: &str, raw: &str) -> bool {
        let clean = raw.trim().to_string();
        if clean.is_empty() {
            return false;
        }
        let Some(idx) = self.snapshot.inbox.iter().position(|i| i.id == inbox_id) else {
            return false;
        };
        self.snapshot.inbox[idx].reply_text = Some(clean.clone());
        self.snapshot.inbox[idx].receipt_settled = true;
        if let Some(aid) = self.snapshot.inbox[idx].artifact_id.clone() {
            self.pin_artifact_comment(&aid, "Mailbox 回执", &clean);
        }
        true
    }

    pub fn toggle_checklist(&mut self, task_id: &str, check_id: &str) {
        if let Some(task) = self.snapshot.tasks.iter_mut().find(|t| t.id == task_id)
            && let Some(item) = task.checklist.iter_mut().find(|c| c.id == check_id)
        {
            item.done = !item.done;
            task.updated_at = "刚刚".into();
        }
    }

    pub fn cycle_task_status(&mut self, task_id: &str) -> Option<TaskStatus> {
        let task = self.snapshot.tasks.iter_mut().find(|t| t.id == task_id)?;
        task.status = task.status.next();
        task.updated_at = "刚刚".into();
        Some(task.status)
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
        let proj = self.project(&pid)?.clone();
        let bot_id = self.session_bot_id.clone();
        let bot_name = self
            .bot(&bot_id)
            .map(|b| b.name.clone())
            .unwrap_or_else(|| "Bot".into());
        let seq = self.next_seq;
        self.next_seq += 1;
        self.session_picker = None;

        match self.session_deliverable {
            SessionDeliverable::FreeChat => {
                let sid = self.create_session_record(&bot_id, &pid, Some(&title), false);
                self.send_chat_message(&sid, &title, None);
                self.rail = RailSection::Bots;
                self.selected_bot_id = bot_id.clone();
                self.nav = PrimaryNav::Bot(bot_id);
                self.bot_tab = BotViewTab::Chat;
                self.decision_pane_open = false;
                self.comments_drawer_open = false;
                Some((format!("已与 {bot_name} 开启会话：{title}"), None))
            }
            SessionDeliverable::DecisionCanvas => {
                let aid = format!("art-ses-{seq}");
                let seed_scene = self
                    .artifact(&proj.active_artifact_id)
                    .and_then(|a| a.canvas_scene_json.clone())
                    .or_else(|| {
                        self.snapshot
                            .artifacts
                            .iter()
                            .find(|a| a.project_id == pid && a.canvas_scene_json.is_some())
                            .and_then(|a| a.canvas_scene_json.clone())
                    });
                self.snapshot.artifacts.insert(
                    0,
                    Artifact {
                        id: aid.clone(),
                        project_id: pid.clone(),
                        task_id: None,
                        bot_id,
                        kind: ArtifactKind::DecisionCanvas,
                        title: title.clone(),
                        question: format!("{bot_name} 为「{}」整理的方案对比白板", proj.name),
                        updated_at: "刚刚".into(),
                        verdict: ArtifactVerdict::PendingHuman,
                        options: vec![
                            DecisionOption {
                                id: "opt-a".into(),
                                key: "A".into(),
                                label: "方案 A · 推荐路径".into(),
                                summary: "清晰拆解边界与验证路径，风险可控".into(),
                                recommended: true,
                                chosen: false,
                            },
                            DecisionOption {
                                id: "opt-b".into(),
                                key: "B".into(),
                                label: "方案 B · 保守路径".into(),
                                summary: "最小改动渐进演进，便于回滚".into(),
                                recommended: false,
                                chosen: false,
                            },
                        ],
                        canvas_scene_json: seed_scene,
                        verify_report: None,
                        doc_markdown: None,
                        comments: vec![],
                    },
                );
                self.rail = RailSection::Projects;
                self.selected_project_id = pid.clone();
                self.nav = PrimaryNav::Project(pid);
                self.project_tab = ProjectTab::Artifacts;
                self.select_artifact(&aid);
                Some((format!("已由 {bot_name} 创建决策白板：{title}"), Some(aid)))
            }
            SessionDeliverable::VerifyReport => {
                let aid = format!("art-ses-{seq}");
                self.snapshot.artifacts.insert(
                    0,
                    Artifact {
                        id: aid.clone(),
                        project_id: pid.clone(),
                        task_id: None,
                        bot_id,
                        kind: ArtifactKind::VerifyReport,
                        title: title.clone(),
                        question: format!("{bot_name} 发起的双轨验收：{title}"),
                        updated_at: "刚刚".into(),
                        verdict: ArtifactVerdict::PendingHuman,
                        options: vec![],
                        canvas_scene_json: None,
                        verify_report: Some(VerifyReportData {
                            summary: format!("围绕「{title}」整理的机器自证与人类裁决清单"),
                            claims: vec![
                                VerifyClaim {
                                    id: format!("clm-{seq}-1"),
                                    title: "核心路径构建与离线检查通过".into(),
                                    judge: VerifyJudge::Agent,
                                    status: ClaimStatus::Verified,
                                    provenance: format!("{bot_name} · 自动化验证"),
                                    command: Some("cargo check --all-targets".into()),
                                    evidence_output: "0 warnings, all checks green".into(),
                                    linked_canvas_id: None,
                                },
                                VerifyClaim {
                                    id: format!("clm-{seq}-2"),
                                    title: format!("确认验收标准：{title}"),
                                    judge: VerifyJudge::Human,
                                    status: ClaimStatus::PendingHuman,
                                    provenance: "等待主人给出 Pass / Reject 裁决".into(),
                                    command: None,
                                    evidence_output: "已附上关联产物上下文".into(),
                                    linked_canvas_id: Some(proj.active_artifact_id.clone()),
                                },
                            ],
                            gaps: vec![],
                        }),
                        doc_markdown: None,
                        comments: vec![],
                    },
                );
                self.rail = RailSection::Projects;
                self.selected_project_id = pid.clone();
                self.nav = PrimaryNav::Project(pid);
                self.project_tab = ProjectTab::Artifacts;
                self.select_artifact(&aid);
                self.decision_tab = DecisionPaneTab::Verify;
                Some((format!("已由 {bot_name} 发起双轨验收：{title}"), Some(aid)))
            }
            SessionDeliverable::SpecDoc => {
                let aid = format!("art-ses-{seq}");
                self.snapshot.artifacts.insert(
                    0,
                    Artifact {
                        id: aid.clone(),
                        project_id: pid.clone(),
                        task_id: None,
                        bot_id,
                        kind: ArtifactKind::SpecDoc,
                        title: title.clone(),
                        question: format!("{bot_name} 起草的规格说明"),
                        updated_at: "刚刚".into(),
                        verdict: ArtifactVerdict::PendingHuman,
                        options: vec![],
                        canvas_scene_json: None,
                        verify_report: None,
                        doc_markdown: Some(format!(
                            "# {title}\n\n- 归属项目：{}\n- 负责 Bot：{bot_name}\n\n## 目标与边界\n\n在此补充约束与验收口径。\n",
                            proj.name
                        )),
                        comments: vec![],
                    },
                );
                self.rail = RailSection::Projects;
                self.selected_project_id = pid.clone();
                self.nav = PrimaryNav::Project(pid);
                self.project_tab = ProjectTab::Artifacts;
                self.select_artifact(&aid);
                self.decision_tab = DecisionPaneTab::SpecDoc;
                Some((format!("已由 {bot_name} 创建规格文档：{title}"), Some(aid)))
            }
            SessionDeliverable::Schedule => {
                let sid = format!("sch-{seq}");
                self.snapshot.schedules.insert(
                    0,
                    ScheduledJob {
                        id: sid.clone(),
                        project_id: pid.clone(),
                        bot_id,
                        name: title.clone(),
                        description: format!("由 {bot_name} 负责的自动巡检任务，默认全绿静默、发现异常时推入 Inbox。"),
                        trigger_kind: ScheduleTriggerKind::Cron,
                        schedule_expr: "0 9 * * *".into(),
                        schedule_label: "每天 09:00".into(),
                        enabled: true,
                        notify_policy: self.default_schedule_notify,
                        last_run_at: "尚未运行".into(),
                        next_run_at: "明天 09:00".into(),
                        last_outcome: ScheduleRunOutcome::AllGreen,
                        runs: vec![],
                    },
                );
                self.rail = RailSection::Projects;
                self.selected_project_id = pid.clone();
                self.nav = PrimaryNav::Project(pid);
                self.project_tab = ProjectTab::Schedules;
                self.select_schedule(&sid);
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
            && self.snapshot.sessions.iter().any(|s| s.id == *sid && s.bot_id == bot_id)
        {
            return Some(sid.clone());
        }
        self.snapshot
            .sessions
            .iter()
            .find(|s| s.bot_id == bot_id)
            .map(|s| s.id.clone())
    }

    fn create_session_record(
        &mut self,
        bot_id: &str,
        project_id: &str,
        title: Option<&str>,
        with_greeting: bool,
    ) -> String {
        let seq = self.next_seq;
        self.next_seq += 1;
        let sid = format!("ses-{seq}");
        let bot = self.bot(bot_id).cloned();
        let proj = self.project(project_id).cloned();
        let bot_name = bot.as_ref().map(|b| b.name.clone()).unwrap_or_else(|| "Bot".into());
        let bot_role = bot.as_ref().map(|b| b.role.clone()).unwrap_or_else(|| "协作者".into());
        let proj_name = proj.as_ref().map(|p| p.name.clone()).unwrap_or_else(|| "默认项目".into());
        let title_str = title
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .map(|t| t.chars().take(28).collect::<String>())
            .unwrap_or_else(|| format!("与 {bot_name} 的新对话 #{seq}"));

        let messages = if with_greeting {
            vec![ChatMessage {
                id: format!("msg-{seq}-0"),
                role: ChatRole::Bot,
                author: bot_name.clone(),
                body: format!(
                    "主人好，我是 {bot_name}（{bot_role}），当前绑定项目为「{proj_name}」。直接告诉我目标或需要核对的代码/方案，随时可以把讨论一键沉淀为决策白板或规格文档。"
                ),
                timestamp: "刚刚".into(),
                tool_calls: vec![],
                linked_artifact_id: None,
            }]
        } else {
            vec![]
        };

        self.snapshot.sessions.insert(
            0,
            BotSession {
                id: sid.clone(),
                title: title_str,
                bot_id: bot_id.to_string(),
                project_id: project_id.to_string(),
                status: SessionStatus::Active,
                updated_at: "刚刚".into(),
                summary: format!("在「{proj_name}」下与 {bot_name} 实时协作中。"),
                pinned_artifact_id: None,
                messages,
            },
        );
        self.selected_session_id = sid.clone();
        self.bot_active_sessions.insert(bot_id.to_string(), sid.clone());
        sid
    }

    pub fn ensure_bot_session(&mut self, bot_id: &str) -> String {
        if let Some(sid) = self.active_session_id_for_bot(bot_id) {
            self.bot_active_sessions.insert(bot_id.to_string(), sid.clone());
            return sid;
        }
        let pid = self
            .bot(bot_id)
            .map(|b| b.project_id.clone())
            .filter(|pid| self.project(pid).is_some())
            .or_else(|| self.snapshot.projects.first().map(|p| p.id.clone()))
            .unwrap_or_default();
        self.create_session_record(bot_id, &pid, None, true)
    }

    pub fn create_bot_session(&mut self, bot_id: &str, project_id: &str, title: Option<&str>) -> String {
        self.create_session_record(bot_id, project_id, title, true)
    }

    pub fn select_session(&mut self, sid: &str) {
        if let Some(ses) = self.session(sid).cloned() {
            self.selected_session_id = ses.id.clone();
            self.bot_active_sessions.insert(ses.bot_id, ses.id);
        }
    }

    pub fn send_chat_message(&mut self, sid: &str, raw: &str, git_summary: Option<String>) -> Option<String> {
        let body = raw.trim().to_string();
        if body.is_empty() {
            return None;
        }
        let seq = self.next_seq;
        self.next_seq += 1;

        let idx = self.snapshot.sessions.iter().position(|s| s.id == sid)?;
        let (bot_id, project_id) = {
            let s = &self.snapshot.sessions[idx];
            (s.bot_id.clone(), s.project_id.clone())
        };
        let bot = self.bot(&bot_id).cloned();
        let proj = self.project(&project_id).cloned();
        let bot_name = bot.as_ref().map(|b| b.name.clone()).unwrap_or_else(|| "Bot".into());
        let bot_role = bot.as_ref().map(|b| b.role.clone()).unwrap_or_else(|| "协作助手".into());
        let proj_name = proj.as_ref().map(|p| p.name.clone()).unwrap_or_else(|| "当前项目".into());
        let fallback_repo = proj
            .as_ref()
            .and_then(|p| p.repo_paths.first())
            .cloned()
            .unwrap_or_else(|| "未绑定代码仓".into());
        let repo_note = git_summary.unwrap_or(fallback_repo);

        let lower = body.to_lowercase();
        let wants_artifact = lower.contains("白板")
            || lower.contains("架构")
            || lower.contains("方案")
            || lower.contains("验收")
            || lower.contains("verify")
            || lower.contains("图");
        let linked_art_id = wants_artifact
            .then(|| proj.as_ref().map(|p| p.active_artifact_id.clone()))
            .flatten()
            .filter(|aid| self.artifact(aid).is_some());

        let reply_body = if let Some(ref aid) = linked_art_id {
            let art_title = self
                .artifact(aid)
                .map(|a| a.title.clone())
                .unwrap_or_else(|| "关联产物".into());
            format!(
                "收到！我已基于「{proj_name}」上下文（代码仓：{repo_note}）结合「{bot_role}」视角完成梳理。\n\n相关结论已挂载至「{art_title}」，主人可直接点击下方产物卡片进入决策面裁决，或点底部「沉淀为白板」单开一版新对照图。"
            )
        } else {
            format!(
                "明白，已收到你的指令：\n「{body}」\n\n我已同步核对项目「{proj_name}」（{repo_note}）。接下来会沿着「{bot_role}」上下文推进；如果想直接视觉定案，可随时点击下方「沉淀为白板」或「生成规格」。"
            )
        };

        let ses = &mut self.snapshot.sessions[idx];
        ses.messages.push(ChatMessage {
            id: format!("msg-{seq}-u"),
            role: ChatRole::User,
            author: "主人".into(),
            body: body.clone(),
            timestamp: "刚刚".into(),
            tool_calls: vec![],
            linked_artifact_id: None,
        });
        ses.messages.push(ChatMessage {
            id: format!("msg-{seq}-b"),
            role: ChatRole::Bot,
            author: bot_name.clone(),
            body: reply_body,
            timestamp: "刚刚".into(),
            tool_calls: vec![ChatToolCall {
                id: format!("tc-{seq}"),
                label: "inspect_project_context".into(),
                detail: format!("project={proj_name} · repo={repo_note}"),
                passed: true,
            }],
            linked_artifact_id: linked_art_id.clone(),
        });
        if linked_art_id.is_some() {
            ses.pinned_artifact_id = linked_art_id;
        }
        ses.status = SessionStatus::Active;
        ses.updated_at = "刚刚".into();
        ses.summary = format!("主人：{body}");

        if idx > 0 {
            let updated = self.snapshot.sessions.remove(idx);
            self.snapshot.sessions.insert(0, updated);
        }
        self.selected_session_id = sid.to_string();
        self.bot_active_sessions.insert(bot_id, sid.to_string());
        Some(bot_name)
    }

    pub fn promote_session_to_artifact(&mut self, sid: &str, kind: ArtifactKind) -> Option<(String, String)> {
        let ses = self.session(sid)?.clone();
        let proj = self.project(&ses.project_id)?.clone();
        let bot_name = self
            .bot(&ses.bot_id)
            .map(|b| b.name.clone())
            .unwrap_or_else(|| "Bot".into());
        let seq = self.next_seq;
        self.next_seq += 1;
        let aid = format!("art-ses-{seq}");
        let last_user_text = ses
            .messages
            .iter()
            .rev()
            .find(|m| m.role == ChatRole::User)
            .map(|m| m.body.clone())
            .unwrap_or_else(|| ses.title.clone());

        let (toast_msg, artifact) = match kind {
            ArtifactKind::DecisionCanvas => {
                let seed_scene = self
                    .artifact(&proj.active_artifact_id)
                    .and_then(|a| a.canvas_scene_json.clone())
                    .or_else(|| {
                        self.snapshot
                            .artifacts
                            .iter()
                            .find(|a| a.project_id == proj.id && a.canvas_scene_json.is_some())
                            .and_then(|a| a.canvas_scene_json.clone())
                    });
                (
                    format!("已将对话沉淀为决策白板：{}", ses.title),
                    Artifact {
                        id: aid.clone(),
                        project_id: proj.id.clone(),
                        task_id: None,
                        bot_id: ses.bot_id.clone(),
                        kind: ArtifactKind::DecisionCanvas,
                        title: ses.title.clone(),
                        question: format!("由 {bot_name} 根据会话讨论沉淀：{last_user_text}"),
                        updated_at: "刚刚".into(),
                        verdict: ArtifactVerdict::PendingHuman,
                        options: vec![
                            DecisionOption {
                                id: format!("opt-{seq}-a"),
                                key: "A".into(),
                                label: "方案 A · 会话推荐方案".into(),
                                summary: "延续会话已对齐的模块边界与增量验证路径".into(),
                                recommended: true,
                                chosen: false,
                            },
                            DecisionOption {
                                id: format!("opt-{seq}-b"),
                                key: "B".into(),
                                label: "方案 B · 最小改动试点".into(),
                                summary: "先在单模块验证可行性再扩大范围".into(),
                                recommended: false,
                                chosen: false,
                            },
                        ],
                        canvas_scene_json: seed_scene,
                        verify_report: None,
                        doc_markdown: None,
                        comments: vec![],
                    },
                )
            }
            _ => {
                let transcript_md = ses
                    .messages
                    .iter()
                    .map(|m| format!("### {}\n\n{}\n", m.author, m.body))
                    .collect::<Vec<_>>()
                    .join("\n");
                (
                    format!("已由对话生成规格文档：{}", ses.title),
                    Artifact {
                        id: aid.clone(),
                        project_id: proj.id.clone(),
                        task_id: None,
                        bot_id: ses.bot_id.clone(),
                        kind: ArtifactKind::SpecDoc,
                        title: ses.title.clone(),
                        question: format!("{bot_name} 从会话沉淀的规格文档"),
                        updated_at: "刚刚".into(),
                        verdict: ArtifactVerdict::PendingHuman,
                        options: vec![],
                        canvas_scene_json: None,
                        verify_report: None,
                        doc_markdown: Some(format!(
                            "# {}\n\n- 归属项目：{}\n- 负责 Bot：{bot_name}\n\n## 会话纪要\n\n{transcript_md}",
                            ses.title, proj.name
                        )),
                        comments: vec![],
                    },
                )
            }
        };

        self.snapshot.artifacts.insert(0, artifact);
        if let Some(s) = self.snapshot.sessions.iter_mut().find(|s| s.id == sid) {
            s.pinned_artifact_id = Some(aid.clone());
            s.status = SessionStatus::WaitingVerdict;
            s.updated_at = "刚刚".into();
            s.messages.push(ChatMessage {
                id: format!("msg-{seq}-p"),
                role: ChatRole::Bot,
                author: bot_name,
                body: "已将本次讨论整理为独立产物，主人可直接点击下方卡片打开决策面查看与批注。".into(),
                timestamp: "刚刚".into(),
                tool_calls: vec![],
                linked_artifact_id: Some(aid.clone()),
            });
        }
        Some((aid, toast_msg))
    }

    pub fn bind_project_repo(&mut self, pid: &str, normalized_path: String) -> Result<bool, String> {
        let clean = normalized_path.trim().to_string();
        if clean.is_empty() {
            return Err("仓库路径不能为空".into());
        }
        let proj = self
            .snapshot
            .projects
            .iter_mut()
            .find(|p| p.id == pid)
            .ok_or_else(|| "未找到目标项目".to_string())?;
        if proj.repo_paths.iter().any(|p| p == &clean) {
            return Ok(false);
        }
        proj.repo_paths.push(clean);
        Ok(true)
    }

    pub fn unbind_project_repo(&mut self, pid: &str, path: &str) -> bool {
        let Some(proj) = self.snapshot.projects.iter_mut().find(|p| p.id == pid) else {
            return false;
        };
        let before = proj.repo_paths.len();
        proj.repo_paths.retain(|p| p != path);
        proj.repo_paths.len() != before
    }

    pub fn set_primary_project_repo(&mut self, pid: &str, path: &str) -> bool {
        let Some(proj) = self.snapshot.projects.iter_mut().find(|p| p.id == pid) else {
            return false;
        };
        let Some(pos) = proj.repo_paths.iter().position(|p| p == path) else {
            return false;
        };
        if pos > 0 {
            let moved = proj.repo_paths.remove(pos);
            proj.repo_paths.insert(0, moved);
        }
        true
    }

    pub fn create_project(
        &mut self,
        name: &str,
        summary: &str,
        color_hex: u32,
        default_bot_id: &str,
        repo_path: Option<String>,
    ) -> Option<String> {
        let clean_name = name.trim().to_string();
        if clean_name.is_empty() {
            return None;
        }
        let seq = self.next_seq;
        self.next_seq += 1;
        let pid = format!("proj-{seq}");
        let aid = format!("art-proj-{seq}");

        let bot_id = self
            .bot(default_bot_id)
            .map(|b| b.id.clone())
            .or_else(|| self.snapshot.bots.first().map(|b| b.id.clone()))
            .unwrap_or_default();
        let bot_name = self
            .bot(&bot_id)
            .map(|b| b.name.clone())
            .unwrap_or_else(|| "Bot".into());

        let clean_repo = repo_path
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty());
        let slug: String = clean_name
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .collect::<String>()
            .to_lowercase();
        let slug = if slug.is_empty() { pid.clone() } else { slug };

        let clean_summary = summary.trim().to_string();
        let summary = if !clean_summary.is_empty() {
            clean_summary
        } else if let Some(ref repo) = clean_repo {
            format!("关联本地代码仓 {}，由 {bot_name} 协作推进。", repo)
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

        self.snapshot.artifacts.insert(
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

        let repo_paths = clean_repo.into_iter().collect();
        self.snapshot.projects.push(Project {
            id: pid.clone(),
            name: clean_name.clone(),
            slug,
            summary,
            color_hex,
            repo_paths,
            default_bot_id: bot_id.clone(),
            skills: vec![],
            active_artifact_id: aid,
        });

        self.create_session_record(&bot_id, &pid, Some(&clean_name), true);
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
}
