pub mod canvas_seed;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub summary: String,
    pub color_hex: u32,
    pub repo_paths: Vec<String>,
    pub default_bot_id: String,
    pub skills: Vec<String>,
    pub active_artifact_id: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum BotStatus {
    Idle,
    Running,
    WaitingVerdict,
}

impl BotStatus {
    pub fn label(self) -> &'static str {
        match self {
            BotStatus::Idle => "待命中",
            BotStatus::Running => "执行中",
            BotStatus::WaitingVerdict => "等人类裁决",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Bot {
    pub id: String,
    pub name: String,
    pub role: String,
    pub model: String,
    pub status: BotStatus,
    pub project_id: String,
    pub active_artifact_id: Option<String>,
    pub summary: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ArtifactKind {
    DecisionCanvas,
    VerifyReport,
    SpecDoc,
    DataTable,
}

impl ArtifactKind {
    pub fn label(self) -> &'static str {
        match self {
            ArtifactKind::DecisionCanvas => "决策白板",
            ArtifactKind::VerifyReport => "验收报告",
            ArtifactKind::SpecDoc => "规格文档",
            ArtifactKind::DataTable => "结构化表",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ArtifactVerdict {
    PendingHuman,
    Passed,
    Rejected,
    Settled,
}

impl ArtifactVerdict {
    pub fn label(self) -> &'static str {
        match self {
            ArtifactVerdict::PendingHuman => "待人类裁决",
            ArtifactVerdict::Passed => "已验收 Pass",
            ArtifactVerdict::Rejected => "已退回 Reject",
            ArtifactVerdict::Settled => "已拍板定案",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DecisionOption {
    pub id: String,
    pub key: String,
    pub label: String,
    pub summary: String,
    pub recommended: bool,
    pub chosen: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArtifactComment {
    pub id: String,
    pub author: String,
    pub is_bot: bool,
    pub anchor: String,
    pub body: String,
    pub timestamp: String,
    pub receipt_ack: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum VerifyJudge {
    Agent,
    Human,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ClaimStatus {
    Verified,
    Failed,
    PendingHuman,
    Passed,
    Rejected,
}

impl ClaimStatus {
    pub fn label(self) -> &'static str {
        match self {
            ClaimStatus::Verified => "机器自证通过",
            ClaimStatus::Failed => "机器验证失败",
            ClaimStatus::PendingHuman => "待人类拍板",
            ClaimStatus::Passed => "人类 Pass",
            ClaimStatus::Rejected => "人类 Reject",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerifyClaim {
    pub id: String,
    pub title: String,
    pub judge: VerifyJudge,
    pub status: ClaimStatus,
    pub provenance: String,
    pub command: Option<String>,
    pub evidence_output: String,
    pub linked_canvas_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerifyGap {
    pub id: String,
    pub title: String,
    pub why: String,
    pub needs: String,
    pub waived: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerifyReportData {
    pub summary: String,
    pub claims: Vec<VerifyClaim>,
    pub gaps: Vec<VerifyGap>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Artifact {
    pub id: String,
    pub project_id: String,
    pub task_id: Option<String>,
    pub bot_id: String,
    pub kind: ArtifactKind,
    pub title: String,
    pub question: String,
    pub updated_at: String,
    pub verdict: ArtifactVerdict,
    pub options: Vec<DecisionOption>,
    pub canvas_scene_json: Option<String>,
    pub verify_report: Option<VerifyReportData>,
    pub doc_markdown: Option<String>,
    pub comments: Vec<ArtifactComment>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskStage {
    Brainstorming,
    SpecApproved,
    Executing,
    Verifying,
    Done,
}

impl TaskStage {
    pub fn label(self) -> &'static str {
        match self {
            TaskStage::Brainstorming => "方案脑暴",
            TaskStage::SpecApproved => "Spec 已定稿",
            TaskStage::Executing => "TDD 执行中",
            TaskStage::Verifying => "双轨验收中",
            TaskStage::Done => "已完成",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskStatus {
    Todo,
    InProgress,
    Waiting,
    Review,
    Done,
}

impl TaskStatus {
    pub const ALL: [TaskStatus; 5] = [
        TaskStatus::Todo,
        TaskStatus::InProgress,
        TaskStatus::Waiting,
        TaskStatus::Review,
        TaskStatus::Done,
    ];

    pub fn label(self) -> &'static str {
        match self {
            TaskStatus::Todo => "待办",
            TaskStatus::InProgress => "进行中",
            TaskStatus::Waiting => "等待裁决",
            TaskStatus::Review => "待验收",
            TaskStatus::Done => "已完成",
        }
    }

    pub fn next(self) -> Self {
        match self {
            TaskStatus::Todo => TaskStatus::InProgress,
            TaskStatus::InProgress => TaskStatus::Waiting,
            TaskStatus::Waiting => TaskStatus::Review,
            TaskStatus::Review => TaskStatus::Done,
            TaskStatus::Done => TaskStatus::Todo,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskPriority {
    Urgent,
    High,
    Normal,
    Low,
}

impl TaskPriority {
    pub fn label(self) -> &'static str {
        match self {
            TaskPriority::Urgent => "P0 紧急",
            TaskPriority::High => "P1 高",
            TaskPriority::Normal => "P2 常规",
            TaskPriority::Low => "P3 低",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChecklistItem {
    pub id: String,
    pub label: String,
    pub done: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Ruling {
    pub id: String,
    pub decision: String,
    pub reason: String,
    pub cost_if_wrong: String,
    pub timestamp: String,
    pub disputed: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum DiffLineKind {
    Context,
    Add,
    Del,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffPreview {
    pub file: String,
    pub additions: usize,
    pub deletions: usize,
    pub lines: Vec<DiffLine>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub key: String,
    pub title: String,
    pub description: String,
    pub stage: TaskStage,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub project_id: String,
    pub linked_bot_id: String,
    pub primary_artifact_id: String,
    pub verify_artifact_id: Option<String>,
    pub updated_at: String,
    pub tags: Vec<String>,
    pub checklist: Vec<ChecklistItem>,
    pub rulings: Vec<Ruling>,
    pub diff_preview: DiffPreview,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ScheduleTriggerKind {
    Cron,
    Watcher,
    OneShot,
}

impl ScheduleTriggerKind {
    pub fn label(self) -> &'static str {
        match self {
            ScheduleTriggerKind::Cron => "Cron 周期",
            ScheduleTriggerKind::Watcher => "Watcher 监听",
            ScheduleTriggerKind::OneShot => "单次定时",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ScheduleNotifyPolicy {
    SilentOnPass,
    AlwaysInbox,
}

impl ScheduleNotifyPolicy {
    pub fn label(self) -> &'static str {
        match self {
            ScheduleNotifyPolicy::SilentOnPass => "绿灯静默 · 异常进 Inbox",
            ScheduleNotifyPolicy::AlwaysInbox => "每次均进 Inbox",
        }
    }

    pub fn toggle(self) -> Self {
        match self {
            ScheduleNotifyPolicy::SilentOnPass => ScheduleNotifyPolicy::AlwaysInbox,
            ScheduleNotifyPolicy::AlwaysInbox => ScheduleNotifyPolicy::SilentOnPass,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ScheduleRunOutcome {
    AllGreen,
    HasGaps,
    Failed,
    NeedsHuman,
}

impl ScheduleRunOutcome {
    pub fn label(self) -> &'static str {
        match self {
            ScheduleRunOutcome::AllGreen => "全绿通过",
            ScheduleRunOutcome::HasGaps => "存在未覆盖 Gap",
            ScheduleRunOutcome::Failed => "运行失败",
            ScheduleRunOutcome::NeedsHuman => "待人类裁决",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScheduleRun {
    pub id: String,
    pub ran_at: String,
    pub duration_ms: u64,
    pub outcome: ScheduleRunOutcome,
    pub summary: String,
    pub verify_artifact_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScheduledJob {
    pub id: String,
    pub project_id: String,
    pub bot_id: String,
    pub name: String,
    pub description: String,
    pub trigger_kind: ScheduleTriggerKind,
    pub schedule_expr: String,
    pub schedule_label: String,
    pub enabled: bool,
    pub notify_policy: ScheduleNotifyPolicy,
    pub last_run_at: String,
    pub next_run_at: String,
    pub last_outcome: ScheduleRunOutcome,
    pub runs: Vec<ScheduleRun>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum InboxKind {
    DecisionChoice,
    VerifyVerdict,
    GapWaiver,
    GuardrailApproval,
    InlineComment,
    Capture,
}

impl InboxKind {
    pub fn label(self) -> &'static str {
        match self {
            InboxKind::DecisionChoice => "画板方案抉择",
            InboxKind::VerifyVerdict => "验收裁决",
            InboxKind::GapWaiver => "盲区豁免/补测",
            InboxKind::GuardrailApproval => "红线审批",
            InboxKind::InlineComment => "批注回流",
            InboxKind::Capture => "快速捕捉",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum InboxStatus {
    Pending,
    Approved,
    Rejected,
    Settled,
    Archived,
}

impl InboxStatus {
    pub fn is_pending(self) -> bool {
        matches!(self, InboxStatus::Pending)
    }

    pub fn label(self) -> &'static str {
        match self {
            InboxStatus::Pending => "待人类裁决",
            InboxStatus::Approved => "已批准 Pass",
            InboxStatus::Rejected => "已拒绝/退回",
            InboxStatus::Settled => "已拍板定案",
            InboxStatus::Archived => "已归档",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct InboxItem {
    pub id: String,
    pub kind: InboxKind,
    pub status: InboxStatus,
    pub title: String,
    pub summary: String,
    pub source_label: String,
    pub timestamp: String,
    pub project_id: String,
    pub task_id: Option<String>,
    pub artifact_id: Option<String>,
    pub schedule_id: Option<String>,
    pub bot_id: String,
    pub command_preview: Option<String>,
    pub reply_text: Option<String>,
    pub receipt_settled: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DecisionPaneTab {
    Canvas,
    Verify,
    SpecDoc,
    Table,
    Diff,
    Comments,
}

impl DecisionPaneTab {
    pub const ALL: [DecisionPaneTab; 6] = [
        DecisionPaneTab::Canvas,
        DecisionPaneTab::Verify,
        DecisionPaneTab::SpecDoc,
        DecisionPaneTab::Table,
        DecisionPaneTab::Diff,
        DecisionPaneTab::Comments,
    ];

    pub fn label(self) -> &'static str {
        match self {
            DecisionPaneTab::Canvas => "决策白板",
            DecisionPaneTab::Verify => "自证与裁决",
            DecisionPaneTab::SpecDoc => "规格文档",
            DecisionPaneTab::Table => "数据表",
            DecisionPaneTab::Diff => "代码 Diff",
            DecisionPaneTab::Comments => "批注回执",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChatRole {
    User,
    Bot,
    System,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChatToolCall {
    pub id: String,
    pub label: String,
    pub detail: String,
    pub passed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: ChatRole,
    pub author: String,
    pub body: String,
    pub timestamp: String,
    pub tool_calls: Vec<ChatToolCall>,
    pub linked_artifact_id: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionStatus {
    Active,
    WaitingVerdict,
    Archived,
}

impl SessionStatus {
    pub fn label(self) -> &'static str {
        match self {
            SessionStatus::Active => "进行中",
            SessionStatus::WaitingVerdict => "待裁决",
            SessionStatus::Archived => "已归档",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BotSession {
    pub id: String,
    pub title: String,
    pub bot_id: String,
    pub project_id: String,
    pub status: SessionStatus,
    pub updated_at: String,
    pub summary: String,
    pub pinned_artifact_id: Option<String>,
    pub messages: Vec<ChatMessage>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MerakSnapshot {
    pub projects: Vec<Project>,
    pub bots: Vec<Bot>,
    pub artifacts: Vec<Artifact>,
    pub tasks: Vec<Task>,
    pub schedules: Vec<ScheduledJob>,
    pub inbox: Vec<InboxItem>,
    pub sessions: Vec<BotSession>,
}

pub fn seed_snapshot() -> MerakSnapshot {
    MerakSnapshot {
        projects: vec![
            Project {
                id: "proj-merak".into(),
                name: "Merak 工作台".into(),
                slug: "merak".into(),
                summary: "以 Project 为中心、Excalidraw 决策白板 + Ryugi 双轨验收为核心的纯 Rust GPUI 桌面平台。".into(),
                color_hex: 0x3b66f5,
                repo_paths: vec!["~/workspace/dsh-space/Merak".into()],
                default_bot_id: "bot-arch".into(),
                skills: vec!["gpui-visual".into(), "offscreen-qa".into(), "spec-tdd".into()],
                active_artifact_id: "art-merak-arch-canvas".into(),
            },
            Project {
                id: "proj-mizar".into(),
                name: "Mizar Rust 内核".into(),
                slug: "mizar".into(),
                summary: "31 个 Rust crate 构成的通用 Agent 微内核：rquickjs 沙箱、Cordis 挂起恢复与记忆召回。".into(),
                color_hex: 0x10b981,
                repo_paths: vec!["~/workspace/dsh-space/mizar".into()],
                default_bot_id: "bot-rust".into(),
                skills: vec!["rust-tdd".into(), "codemode-sandbox".into()],
                active_artifact_id: "art-mizar-suspend-canvas".into(),
            },
            Project {
                id: "proj-notes".into(),
                name: "调度与视觉架构研究".into(),
                slug: "research".into(),
                summary: "沉淀定时巡检降噪模型、Excalidraw 双向联动规范与跨端控制面研究。".into(),
                color_hex: 0xf59e0b,
                repo_paths: vec!["~/workspace/notes".into()],
                default_bot_id: "bot-ui".into(),
                skills: vec!["whiteboard-first".into(), "verify-discipline".into()],
                active_artifact_id: "art-schedule-funnel-canvas".into(),
            },
        ],
        bots: vec![
            Bot {
                id: "bot-arch".into(),
                name: "Arch-Bot".into(),
                role: "架构画板 & 规格拆解".into(),
                model: "claude-sonnet-4-6".into(),
                status: BotStatus::WaitingVerdict,
                project_id: "proj-merak".into(),
                active_artifact_id: Some("art-merak-arch-canvas".into()),
                summary: "已把 Daemon 运行时拓扑的两个方案画在决策白板上，等主人点选拍板。".into(),
            },
            Bot {
                id: "bot-review".into(),
                name: "Review-Bot".into(),
                role: "机器自证 & 视觉回归 QA".into(),
                model: "gemini-2.5-pro".into(),
                status: BotStatus::WaitingVerdict,
                project_id: "proj-merak".into(),
                active_artifact_id: Some("art-merak-verify-report".into()),
                summary: "已跑完测试、剪裁/图标合规与离屏截图，诚实列出 2 项跨平台 Gap 等主人裁决。".into(),
            },
            Bot {
                id: "bot-rust".into(),
                name: "Rust-Bot".into(),
                role: "Mizar 挂起恢复 & 守护调度".into(),
                model: "deepseek-reasoner".into(),
                status: BotStatus::WaitingVerdict,
                project_id: "proj-mizar".into(),
                active_artifact_id: Some("art-mizar-suspend-canvas".into()),
                summary: "绘制了 Suspend 24h 超时分支图，并按 Ruling 账本继续构建沙箱检查。".into(),
            },
            Bot {
                id: "bot-ui".into(),
                name: "UI-Bot".into(),
                role: "视觉交互 & 漏斗白板".into(),
                model: "gpt-5-codex".into(),
                status: BotStatus::Running,
                project_id: "proj-notes".into(),
                active_artifact_id: Some("art-schedule-funnel-canvas".into()),
                summary: "维护定时任务绿灯静默漏斗白板与项目产物索引。".into(),
            },
        ],
        artifacts: vec![
            Artifact {
                id: "art-merak-arch-canvas".into(),
                project_id: "proj-merak".into(),
                task_id: Some("task-101".into()),
                bot_id: "bot-arch".into(),
                kind: ArtifactKind::DecisionCanvas,
                title: "Daemon 与 GPUI 运行时耦合拓扑选型".into(),
                question: "未来接入 Mizar 内核时，Tokio 调度与 Agent 执行应该独立为常驻进程（方案 A），还是嵌在 GPUI 进程内（方案 B）？".into(),
                updated_at: "刚刚".into(),
                verdict: ArtifactVerdict::PendingHuman,
                options: vec![
                    DecisionOption {
                        id: "opt-arch-a".into(),
                        key: "A".into(),
                        label: "方案 A · 独立 Tokio Daemon + RPC".into(),
                        summary: "关闭 GPUI 窗口后定时任务与 Bot 仍保活；Tokio 与 GPUI 执行器零冲突。".into(),
                        recommended: true,
                        chosen: false,
                    },
                    DecisionOption {
                        id: "opt-arch-b".into(),
                        key: "B".into(),
                        label: "方案 B · 单进程内嵌后台 Tokio".into(),
                        summary: "少一个守护进程与序列化开销，但退出窗口即停全部 Cron 巡检。".into(),
                        recommended: false,
                        chosen: false,
                    },
                ],
                canvas_scene_json: Some(canvas_seed::scene_merak_arch_decision()),
                verify_report: None,
                doc_markdown: Some("# 决策背景\n\n- GPUI 使用单向响应循环与自有 `background_executor`。\n- 定时巡检与长程 Bot 任务需要跨窗口关闭保持存活，画板中方案 A 的进程边界最干净。".into()),
                comments: vec![
                    ArtifactComment {
                        id: "cm-1".into(),
                        author: "Arch-Bot".into(),
                        is_bot: true,
                        anchor: "Frame A / 定时保活".into(),
                        body: "已在右侧画板补全 RPC 通道与 Cron 保活对比，请主人直接点上方 A/B 按钮拍板。".into(),
                        timestamp: "21:48".into(),
                        receipt_ack: true,
                    },
                ],
            },
            Artifact {
                id: "art-merak-verify-report".into(),
                project_id: "proj-merak".into(),
                task_id: Some("task-103".into()),
                bot_id: "bot-review".into(),
                kind: ArtifactKind::VerifyReport,
                title: "Merak GPUI 视觉重构与离屏自检验收报告".into(),
                question: "请确认 UI 排版与视觉表现是否 Pass，并决定 2 项未覆盖跨平台项是豁免还是转补测。".into(),
                updated_at: "5 分钟前".into(),
                verdict: ArtifactVerdict::PendingHuman,
                options: vec![],
                canvas_scene_json: Some(canvas_seed::scene_visual_workbench_map()),
                verify_report: Some(VerifyReportData {
                    summary: "机器已完成编译零警告校验、契约测试与 5 视图 Metal 离屏截帧；剩余界面视觉质感与跨平台实机测试需主人裁决。".into(),
                    claims: vec![
                        VerifyClaim {
                            id: "clm-1".into(),
                            title: "merak-contracts 领域契约与 Excalidraw 场景反序列化全绿通过".into(),
                            judge: VerifyJudge::Agent,
                            status: ClaimStatus::Verified,
                            provenance: "macOS arm64 · local cargo test (rustc 1.99.0)".into(),
                            command: Some("cargo test -p merak-contracts && cargo test seeded_canvases".into()),
                            evidence_output: "running tests...\ntest tests::seed_snapshot_invariants_hold ... ok\ntest tests::seed_snapshot_serde_roundtrip ... ok\n0 failed".into(),
                            linked_canvas_id: None,
                        },
                        VerifyClaim {
                            id: "clm-2".into(),
                            title: "已彻底移除 Nucleo 商业图标与 Electron 依赖（仅余 4 个 MIT SVG + Excalidraw/Lucide）".into(),
                            judge: VerifyJudge::Agent,
                            status: ClaimStatus::Verified,
                            provenance: "workspace check · assets/icons/ & Cargo.toml".into(),
                            command: Some("ls -1 assets/icons/ && rg 'electron' Cargo.toml || echo clean".into()),
                            evidence_output: "disclosure.svg\nexcalidraw\nfolder.svg\nglobe.svg\nimport.svg\nclean".into(),
                            linked_canvas_id: None,
                        },
                        VerifyClaim {
                            id: "clm-3".into(),
                            title: "Canvas 决策白板的矢量排版、暗色反相与中文字体视觉质感是否达到要求？".into(),
                            judge: VerifyJudge::Human,
                            status: ClaimStatus::PendingHuman,
                            provenance: "Metal offscreen shot · Window::render_offscreen".into(),
                            command: None,
                            evidence_output: "请切到「决策白板」页签查看 Arch-Bot 实际绘制的 A/B 架构对比图后裁决。".into(),
                            linked_canvas_id: Some("art-merak-arch-canvas".into()),
                        },
                        VerifyClaim {
                            id: "clm-4".into(),
                            title: "Project 导向四栏节奏（侧栏 Projects → 产物卡片 → 决策白板 → Inbox 总闸）是否顺手？".into(),
                            judge: VerifyJudge::Human,
                            status: ClaimStatus::PendingHuman,
                            provenance: "GPUI 1440×900 workbench viewport".into(),
                            command: None,
                            evidence_output: "重点检查无聊天壁干扰下直接面对决策产物的阅读效率。".into(),
                            linked_canvas_id: Some("art-workbench-map-canvas".into()),
                        },
                    ],
                    gaps: vec![
                        VerifyGap {
                            id: "gap-1".into(),
                            title: "Windows x64 DirectWrite 与 D3D 设备丢失恢复实机运行".into(),
                            why: "当前仅在 Apple Silicon macOS 环境构建与离屏验证，无 Windows 真机。".into(),
                            needs: "在 Windows 机器跑 `cargo run --release` 或由主人点击豁免本轮跨平台验收。".into(),
                            waived: false,
                        },
                        VerifyGap {
                            id: "gap-2".into(),
                            title: "Mizar 真实 Daemon WebSocket 断线重放压测".into(),
                            why: "当前阶段显式遵循“不接真实 Agent，只打平台框架”，数据来自 Mock Seed。".into(),
                            needs: "Phase 1 接入 merak-daemon 后再跑真机重连测试。".into(),
                            waived: false,
                        },
                    ],
                }),
                doc_markdown: None,
                comments: vec![],
            },
            Artifact {
                id: "art-workbench-map-canvas".into(),
                project_id: "proj-merak".into(),
                task_id: Some("task-102".into()),
                bot_id: "bot-arch".into(),
                kind: ArtifactKind::DecisionCanvas,
                title: "Merak 视觉工作台全局拓扑：Project → 产物 → 裁决".into(),
                question: "确认 Project 如何串联决策白板、Verify Report、Rulings 账本与定时巡检。".into(),
                updated_at: "14 分钟前".into(),
                verdict: ArtifactVerdict::Settled,
                options: vec![
                    DecisionOption {
                        id: "opt-map-a".into(),
                        key: "A".into(),
                        label: "采用 Project 聚合 + 产物决策面模型".into(),
                        summary: "主视图即产物画板与自证报告，对话退居批注与澄清。".into(),
                        recommended: true,
                        chosen: true,
                    },
                ],
                canvas_scene_json: Some(canvas_seed::scene_visual_workbench_map()),
                verify_report: None,
                doc_markdown: None,
                comments: vec![],
            },
            Artifact {
                id: "art-merak-spec-doc".into(),
                project_id: "proj-merak".into(),
                task_id: Some("task-101".into()),
                bot_id: "bot-arch".into(),
                kind: ArtifactKind::SpecDoc,
                title: "Merak 平台框架规格说明书".into(),
                question: "记录 Project-First、Canvas 决策白板、Verify 双轨验收与 Schedules 边界约定。".into(),
                updated_at: "20 分钟前".into(),
                verdict: ArtifactVerdict::Settled,
                options: vec![],
                canvas_scene_json: None,
                verify_report: None,
                doc_markdown: Some("# Merak 平台框架 Spec\n\n## 1. 产物即决策面\n- 拒绝聊天长文，架构选型与状态流转先落 Excalidraw 白板。\n- 每个可抉择产物携带显式 Option A/B 拍板栏与批注锚点。\n\n## 2. 机器自证 vs 人类裁决\n- `VerifyReport` 严格区分 `judge=\"agent\"` 与 `judge=\"human\"`。\n- Agent 必须诚实声明 `Not Verified` 盲区（Gap），由人类选择 Waive 豁免或一键生成补测 Task。\n\n## 3. 定时任务降噪\n- Cron / Watcher 全绿通过默认静默归档，只把失败、Gap 或需要拍板的运行推送进 Inbox。".into()),
                comments: vec![],
            },
            Artifact {
                id: "art-mizar-suspend-canvas".into(),
                project_id: "proj-mizar".into(),
                task_id: Some("task-104".into()),
                bot_id: "bot-rust".into(),
                kind: ArtifactKind::DecisionCanvas,
                title: "Mizar AgentLoop 挂起 24h 超时策略状态机".into(),
                question: "后台 Agent 触发红线并挂起等待人类审批超过 24 小时时，应该选策略 A（永久保持挂起现场）还是策略 B（超时自动拒绝工具调用）？".into(),
                updated_at: "18 分钟前".into(),
                verdict: ArtifactVerdict::PendingHuman,
                options: vec![
                    DecisionOption {
                        id: "opt-sus-a".into(),
                        key: "A".into(),
                        label: "策略 A · 永久保活等待人类拍板".into(),
                        summary: "过夜任务不会被静默取消，人类随时点开 Inbox 接续现场。".into(),
                        recommended: true,
                        chosen: false,
                    },
                    DecisionOption {
                        id: "opt-sus-b".into(),
                        key: "B".into(),
                        label: "策略 B · 24h 超时自动取消并记 Ruling".into(),
                        summary: "防止挂起协程长期占锁，适合高频批量 CI Agent。".into(),
                        recommended: false,
                        chosen: false,
                    },
                ],
                canvas_scene_json: Some(canvas_seed::scene_mizar_suspend_decision()),
                verify_report: None,
                doc_markdown: Some("# Mizar Suspend / Resume 状态契约\n\n已将 24h 超时分支画在 Excalidraw 白板中，拍板后写入 `crates/mizar-agent-loop/src/suspend.rs`。".into()),
                comments: vec![
                    ArtifactComment {
                        id: "cm-m1".into(),
                        author: "Rust-Bot".into(),
                        is_bot: true,
                        anchor: "菱形判断节点 · 24h 超时?".into(),
                        body: "个人工作台夜间巡检常会跨夜等待批准，推荐使用策略 A 并配合 SQLite Checkpoint。".into(),
                        timestamp: "21:32".into(),
                        receipt_ack: true,
                    },
                ],
            },
            Artifact {
                id: "art-mizar-nightly-verify".into(),
                project_id: "proj-mizar".into(),
                task_id: Some("task-104".into()),
                bot_id: "bot-rust".into(),
                kind: ArtifactKind::VerifyReport,
                title: "Mizar Codemode (rquickjs) 安全沙箱巡检报告".into(),
                question: "昨晚定时巡检发现 1 项超内存边界尚未覆盖真实多并发 Mod 脚本，请裁决或转补测。".into(),
                updated_at: "2 小时前".into(),
                verdict: ArtifactVerdict::PendingHuman,
                options: vec![],
                canvas_scene_json: None,
                verify_report: Some(VerifyReportData {
                    summary: "rquickjs 0.14 单实例 256MiB 限制与 120s 中断器测试通过；多 Bot 并发 Mod 压测存在 1 个 Gap。".into(),
                    claims: vec![
                        VerifyClaim {
                            id: "mc-1".into(),
                            title: "rquickjs AsyncRuntime 死循环超时 interrupt_handler 准确中断".into(),
                            judge: VerifyJudge::Agent,
                            status: ClaimStatus::Verified,
                            provenance: "schedule run #sched-mizar-sec · 2026-11-21 03:00".into(),
                            command: Some("cargo test -p mizar-codemode timeout_interrupt".into()),
                            evidence_output: "test sandbox::tests::timeout_interrupt ... ok (120.4ms)".into(),
                            linked_canvas_id: None,
                        },
                        VerifyClaim {
                            id: "mc-2".into(),
                            title: "是否接受当前 256MiB / 1MiB 栈配额作为内置 Mod 默认上限？".into(),
                            judge: VerifyJudge::Human,
                            status: ClaimStatus::PendingHuman,
                            provenance: "mizar-codemode/src/sandbox.rs".into(),
                            command: None,
                            evidence_output: "复杂表格 Mod 可能需要较高堆上限，请确认是否先以此为基线。".into(),
                            linked_canvas_id: None,
                        },
                    ],
                    gaps: vec![
                        VerifyGap {
                            id: "mgap-1".into(),
                            title: "16 个并发 Mod 同时挂载时的 SQLite WAL 锁竞争压测".into(),
                            why: "当前沙箱单测为单实例顺序创建与销毁。".into(),
                            needs: "新增并行 Mod 压测用例，或先豁免等待 Phase 2 Mod 宿主落地。".into(),
                            waived: false,
                        },
                    ],
                }),
                doc_markdown: None,
                comments: vec![],
            },
            Artifact {
                id: "art-schedule-funnel-canvas".into(),
                project_id: "proj-notes".into(),
                task_id: Some("task-105".into()),
                bot_id: "bot-ui".into(),
                kind: ArtifactKind::DecisionCanvas,
                title: "定时任务「绿灯静默 · 异常进 Inbox」漏斗机制图".into(),
                question: "确认 Cron / Watcher 自动产出 Verify Report 后的 Inbox 准入边界。".into(),
                updated_at: "35 分钟前".into(),
                verdict: ArtifactVerdict::Settled,
                options: vec![
                    DecisionOption {
                        id: "opt-fn-a".into(),
                        key: "A".into(),
                        label: "默认绿灯静默归档，异常 / Gap / 晨报才进 Inbox".into(),
                        summary: "保证 Inbox 永远保持低噪音与高裁决密度。".into(),
                        recommended: true,
                        chosen: true,
                    },
                ],
                canvas_scene_json: Some(canvas_seed::scene_schedule_funnel()),
                verify_report: None,
                doc_markdown: None,
                comments: vec![],
            },
            Artifact {
                id: "art-merak-datatable".into(),
                project_id: "proj-merak".into(),
                task_id: Some("task-105".into()),
                bot_id: "bot-arch".into(),
                kind: ArtifactKind::DataTable,
                title: "项目产物、定时任务与风险追踪矩阵 (SQLite Table)".into(),
                question: "利用 fdl_core 原生 SQLite 多维表管理跨任务元数据与公式计算。".into(),
                updated_at: "1 小时前".into(),
                verdict: ArtifactVerdict::Settled,
                options: vec![],
                canvas_scene_json: None,
                verify_report: None,
                doc_markdown: None,
                comments: vec![],
            },
        ],
        tasks: vec![
            Task {
                id: "task-101".into(),
                key: "MRK-101".into(),
                title: "确定 Merak Daemon 与 GPUI 原生壳的运行时拓扑".into(),
                description: "先用 Excalidraw 白板对比进程模型并锁定平台框架边界，暂不耦合真实 Agent 运行时。".into(),
                stage: TaskStage::Brainstorming,
                status: TaskStatus::Waiting,
                priority: TaskPriority::Urgent,
                project_id: "proj-merak".into(),
                linked_bot_id: "bot-arch".into(),
                primary_artifact_id: "art-merak-arch-canvas".into(),
                verify_artifact_id: Some("art-merak-verify-report".into()),
                updated_at: "刚刚".into(),
                tags: vec!["Canvas-Decision".into(), "Architecture".into()],
                checklist: vec![
                    ChecklistItem { id: "c101-1".into(), label: "在 Excalidraw 白板绘制方案 A/B 架构拓扑对比图".into(), done: true },
                    ChecklistItem { id: "c101-2".into(), label: "等待主人在决策白板点选拍板".into(), done: false },
                ],
                rulings: vec![
                    Ruling {
                        id: "rul-101-1".into(),
                        decision: "先以纯本地 Mock Snapshot + 共享契约跑通 GPUI 工作台外壳".into(),
                        reason: "严格保持 UI 与 Core 边界正交，防止过早绑定 Daemon 协议返工。".into(),
                        cost_if_wrong: "若后续增删字段只需同步改 merak-contracts 即可。".into(),
                        timestamp: "21:40".into(),
                        disputed: false,
                    },
                ],
                diff_preview: DiffPreview {
                    file: "crates/merak-contracts/src/canvas_seed.rs".into(),
                    additions: 148,
                    deletions: 0,
                    lines: vec![
                        DiffLine { kind: DiffLineKind::Add, text: "+ pub fn scene_merak_arch_decision() -> String {".into() },
                        DiffLine { kind: DiffLineKind::Add, text: "+     // Frame A (独立 Tokio Daemon) vs Frame B (同进程线程)".into() },
                        DiffLine { kind: DiffLineKind::Add, text: "+ }".into() },
                    ],
                },
            },
            Task {
                id: "task-102".into(),
                key: "MRK-102".into(),
                title: "以 Project 为导向重构工作台信息架构（产物即决策面）".into(),
                description: "将聊天线程降级为批注回执，把 Project、决策白板、Verify Report 和 Schedules 设为一级主体。".into(),
                stage: TaskStage::Executing,
                status: TaskStatus::InProgress,
                priority: TaskPriority::Urgent,
                project_id: "proj-merak".into(),
                linked_bot_id: "bot-arch".into(),
                primary_artifact_id: "art-workbench-map-canvas".into(),
                verify_artifact_id: Some("art-merak-verify-report".into()),
                updated_at: "3 分钟前".into(),
                tags: vec!["Project-First".into(), "Ryugi".into(), "GPUI".into()],
                checklist: vec![
                    ChecklistItem { id: "c102-1".into(), label: "侧栏升级为全局总闸 + 一等 Projects 主列表".into(), done: true },
                    ChecklistItem { id: "c102-2".into(), label: "在右侧 DecisionPane 直接预加载真实 Excalidraw 决策图".into(), done: true },
                    ChecklistItem { id: "c102-3".into(), label: "支持批注钉入与显式 Ack 回执状态流转".into(), done: true },
                ],
                rulings: vec![
                    Ruling {
                        id: "rul-102-1".into(),
                        decision: "默认打开最后活跃 Project（Merak 工作台）并直出决策白板".into(),
                        reason: "打开应用第一秒直接看见画好的架构抉择图，体现视觉工作导向。".into(),
                        cost_if_wrong: "按 ⌘1 可一键切换全局 Inbox 总闸，零迁移成本。".into(),
                        timestamp: "21:45".into(),
                        disputed: false,
                    },
                ],
                diff_preview: DiffPreview {
                    file: "src/merak/decision_pane.rs".into(),
                    additions: 92,
                    deletions: 31,
                    lines: vec![
                        DiffLine { kind: DiffLineKind::Del, text: "- RightPaneTab::BotThread (chat-first composer)".into() },
                        DiffLine { kind: DiffLineKind::Add, text: "+ DecisionPaneTab::Canvas + Choice Bar + Pin Comment".into() },
                        DiffLine { kind: DiffLineKind::Add, text: "+ DecisionPaneTab::Verify (Agent Claims + Human Verdict + Gaps)".into() },
                    ],
                },
            },
            Task {
                id: "task-103".into(),
                key: "MRK-103".into(),
                title: "完成 Ryugi 风格「机器自证 + 人类裁决 + 盲区」验收视图".into(),
                description: "严格拆开命令能验证的客观证据与必须人类拍板的主观质感，并显式标出 Not Verified Gap。".into(),
                stage: TaskStage::Verifying,
                status: TaskStatus::Review,
                priority: TaskPriority::High,
                project_id: "proj-merak".into(),
                linked_bot_id: "bot-review".into(),
                primary_artifact_id: "art-merak-verify-report".into(),
                verify_artifact_id: Some("art-merak-verify-report".into()),
                updated_at: "6 分钟前".into(),
                tags: vec!["Verify".into(), "Offscreen-QA".into()],
                checklist: vec![
                    ChecklistItem { id: "c103-1".into(), label: "机器跑通 cargo test & Metal offscreen 截图".into(), done: true },
                    ChecklistItem { id: "c103-2".into(), label: "人类对 2 项视觉体验打 Pass 并处理 2 项 Gap".into(), done: false },
                ],
                rulings: vec![
                    Ruling {
                        id: "rul-103-1".into(),
                        decision: "所有 Agent 证明默认折叠原始终端输出，避免长日志淹没裁决区".into(),
                        reason: "遵照 Ryugi verify-report-design 规范，人类优先看结论、出处与 Gap。".into(),
                        cost_if_wrong: "点开任意自证卡片即可就地展开完整原始日志。".into(),
                        timestamp: "21:47".into(),
                        disputed: false,
                    },
                ],
                diff_preview: DiffPreview {
                    file: "src/merak/decision_pane.rs".into(),
                    additions: 64,
                    deletions: 0,
                    lines: vec![
                        DiffLine { kind: DiffLineKind::Add, text: "+ VerifyJudge::Agent -> provenance + collapsible output".into() },
                        DiffLine { kind: DiffLineKind::Add, text: "+ VerifyJudge::Human -> Pass / Reject verdict actions".into() },
                        DiffLine { kind: DiffLineKind::Add, text: "+ VerifyGap -> Waive / Spawn Follow-up Task".into() },
                    ],
                },
            },
            Task {
                id: "task-104".into(),
                key: "MZR-42".into(),
                title: "Mizar AgentLoop 挂起恢复超时策略与检查点落盘".into(),
                description: "结合白板决策确定 24h 超时行为，然后落盘 crates/mizar-agent-loop/src/suspend.rs。".into(),
                stage: TaskStage::SpecApproved,
                status: TaskStatus::Waiting,
                priority: TaskPriority::High,
                project_id: "proj-mizar".into(),
                linked_bot_id: "bot-rust".into(),
                primary_artifact_id: "art-mizar-suspend-canvas".into(),
                verify_artifact_id: Some("art-mizar-nightly-verify".into()),
                updated_at: "18 分钟前".into(),
                tags: vec!["Mizar".into(), "Suspend".into()],
                checklist: vec![
                    ChecklistItem { id: "c104-1".into(), label: "生成挂起超时决策流程图白板".into(), done: true },
                    ChecklistItem { id: "c104-2".into(), label: "待主人选择策略 A 或 B".into(), done: false },
                ],
                rulings: vec![
                    Ruling {
                        id: "rul-104-1".into(),
                        decision: "先复用 mizar-session-sqlite 事务落盘挂起元数据".into(),
                        reason: "避免在 Mizar 内核引入第二套持久化状态表。".into(),
                        cost_if_wrong: "仅限于 session 模块内部 schema 迁移。".into(),
                        timestamp: "21:20".into(),
                        disputed: false,
                    },
                ],
                diff_preview: DiffPreview {
                    file: "crates/mizar-agent-loop/src/suspend.rs".into(),
                    additions: 18,
                    deletions: 0,
                    lines: vec![
                        DiffLine { kind: DiffLineKind::Add, text: "+ pub enum SuspendTimeoutPolicy { KeepPending, AutoReject }".into() },
                    ],
                },
            },
            Task {
                id: "task-105".into(),
                key: "RES-08".into(),
                title: "梳理定时任务（Cron / Watcher）与 SQLite 多维任务表联动".into(),
                description: "验证绿灯静默策略，并用 fdl_core::table 管理长周期巡检数据。".into(),
                stage: TaskStage::Done,
                status: TaskStatus::Done,
                priority: TaskPriority::Normal,
                project_id: "proj-notes".into(),
                linked_bot_id: "bot-ui".into(),
                primary_artifact_id: "art-schedule-funnel-canvas".into(),
                verify_artifact_id: None,
                updated_at: "35 分钟前".into(),
                tags: vec!["Schedules".into(), "DataTable".into()],
                checklist: vec![
                    ChecklistItem { id: "c105-1".into(), label: "绘制 Cron 漏斗决策白板并定案".into(), done: true },
                    ChecklistItem { id: "c105-2".into(), label: "接入 SQLite 多维数据表视图".into(), done: true },
                ],
                rulings: vec![],
                diff_preview: DiffPreview {
                    file: "src/merak/schedules.rs".into(),
                    additions: 112,
                    deletions: 0,
                    lines: vec![
                        DiffLine { kind: DiffLineKind::Add, text: "+ ScheduleNotifyPolicy::SilentOnPass".into() },
                    ],
                },
            },
        ],
        schedules: vec![
            ScheduledJob {
                id: "sch-merak-qa".into(),
                project_id: "proj-merak".into(),
                bot_id: "bot-review".into(),
                name: "每晚 GPUI 离屏截帧 & 全量编译回归".into(),
                description: "每晚触发 cargo test + 5 视图 Metal offscreen 截帧，生成 Verify Report，绿灯静默归档，若发现 Gap 或失败则推送 Inbox。".into(),
                trigger_kind: ScheduleTriggerKind::Cron,
                schedule_expr: "0 2 * * *".into(),
                schedule_label: "每天 02:00".into(),
                enabled: true,
                notify_policy: ScheduleNotifyPolicy::SilentOnPass,
                last_run_at: "今天 02:00".into(),
                next_run_at: "明天 02:00".into(),
                last_outcome: ScheduleRunOutcome::HasGaps,
                runs: vec![
                    ScheduleRun {
                        id: "run-qa-2".into(),
                        ran_at: "今天 02:00".into(),
                        duration_ms: 14280,
                        outcome: ScheduleRunOutcome::HasGaps,
                        summary: "macOS 编译与 5 视图截帧通过，但标记了 Windows 实机未验证 Gap".into(),
                        verify_artifact_id: Some("art-merak-verify-report".into()),
                    },
                    ScheduleRun {
                        id: "run-qa-1".into(),
                        ran_at: "昨天 02:00".into(),
                        duration_ms: 12910,
                        outcome: ScheduleRunOutcome::AllGreen,
                        summary: "全绿通过（已静默归档）".into(),
                        verify_artifact_id: None,
                    },
                ],
            },
            ScheduledJob {
                id: "sch-merak-comments".into(),
                project_id: "proj-merak".into(),
                bot_id: "bot-arch".into(),
                name: "Artifact 批注回执监听 (Ryugi Watcher)".into(),
                description: "监听任意决策白板/Spec 文档上的新人工批注，自动投递给对应 Project Bot 处理并回写 receipt_ack。".into(),
                trigger_kind: ScheduleTriggerKind::Watcher,
                schedule_expr: "watch:artifacts/comments".into(),
                schedule_label: "实时事件监听".into(),
                enabled: true,
                notify_policy: ScheduleNotifyPolicy::SilentOnPass,
                last_run_at: "14 分钟前".into(),
                next_run_at: "事件触发".into(),
                last_outcome: ScheduleRunOutcome::AllGreen,
                runs: vec![
                    ScheduleRun {
                        id: "run-cm-1".into(),
                        ran_at: "14 分钟前".into(),
                        duration_ms: 340,
                        outcome: ScheduleRunOutcome::AllGreen,
                        summary: "成功投递 Arch-Bot 回执 cm-1".into(),
                        verify_artifact_id: Some("art-merak-arch-canvas".into()),
                    },
                ],
            },
            ScheduledJob {
                id: "sch-mizar-sandbox".into(),
                project_id: "proj-mizar".into(),
                bot_id: "bot-rust".into(),
                name: "rquickjs 沙箱安全边界 & 依赖漏洞巡检".into(),
                description: "定期检查 mizar-codemode 内存限制、超时中断与 RustSec 依赖告警，产出结构化 Verify Report。".into(),
                trigger_kind: ScheduleTriggerKind::Cron,
                schedule_expr: "0 3 * * *".into(),
                schedule_label: "每天 03:00".into(),
                enabled: true,
                notify_policy: ScheduleNotifyPolicy::SilentOnPass,
                last_run_at: "今天 03:00".into(),
                next_run_at: "明天 03:00".into(),
                last_outcome: ScheduleRunOutcome::NeedsHuman,
                runs: vec![
                    ScheduleRun {
                        id: "run-mz-1".into(),
                        ran_at: "今天 03:00".into(),
                        duration_ms: 8930,
                        outcome: ScheduleRunOutcome::NeedsHuman,
                        summary: "单核沙箱通过，待主人确认 256MiB 上限基线与 1 项并发 Gap".into(),
                        verify_artifact_id: Some("art-mizar-nightly-verify".into()),
                    },
                ],
            },
            ScheduledJob {
                id: "sch-notes-brief".into(),
                project_id: "proj-notes".into(),
                bot_id: "bot-ui".into(),
                name: "每日跨项目 Rulings & 阻塞汇总晨报".into(),
                description: "每天早间汇总各 Project 的 Bot 自主裁决账本，固定向 Inbox 发一条简报便于快速审阅。".into(),
                trigger_kind: ScheduleTriggerKind::Cron,
                schedule_expr: "30 9 * * 1-5".into(),
                schedule_label: "工作日 09:30".into(),
                enabled: false,
                notify_policy: ScheduleNotifyPolicy::AlwaysInbox,
                last_run_at: "昨天 09:30".into(),
                next_run_at: "已暂停".into(),
                last_outcome: ScheduleRunOutcome::AllGreen,
                runs: vec![],
            },
        ],
        inbox: vec![
            InboxItem {
                id: "inb-1".into(),
                kind: InboxKind::DecisionChoice,
                status: InboxStatus::Pending,
                title: "画板抉择：选定 Merak Daemon 运行时耦合拓扑（A / B）".into(),
                summary: "Arch-Bot 已在 Excalidraw 白板中画出方案 A（独立守护进程）与方案 B（单进程内嵌）对比，点卡右侧直接出图供拍板。".into(),
                source_label: "Arch-Bot · 决策白板".into(),
                timestamp: "刚刚".into(),
                project_id: "proj-merak".into(),
                task_id: Some("task-101".into()),
                artifact_id: Some("art-merak-arch-canvas".into()),
                schedule_id: None,
                bot_id: "bot-arch".into(),
                command_preview: None,
                reply_text: None,
                receipt_settled: false,
            },
            InboxItem {
                id: "inb-2".into(),
                kind: InboxKind::VerifyVerdict,
                status: InboxStatus::Pending,
                title: "Verify 验收：Merak GPUI 视觉框架与 2 项人类体验裁决".into(),
                summary: "机器自证 2/2 通过；剩余白板视觉质感、Project 节奏需主人给出 Pass/Reject，并处理 2 项跨平台 Gap。".into(),
                source_label: "Review-Bot · 夜间回归报告".into(),
                timestamp: "5 分钟前".into(),
                project_id: "proj-merak".into(),
                task_id: Some("task-103".into()),
                artifact_id: Some("art-merak-verify-report".into()),
                schedule_id: Some("sch-merak-qa".into()),
                bot_id: "bot-review".into(),
                command_preview: None,
                reply_text: None,
                receipt_settled: false,
            },
            InboxItem {
                id: "inb-3".into(),
                kind: InboxKind::DecisionChoice,
                status: InboxStatus::Pending,
                title: "画板抉择：Mizar AgentLoop 挂起超过 24h 如何处置？".into(),
                summary: "Rust-Bot 已在状态机白板中标明策略 A（保活等待）与策略 B（超时自动取消）的优缺点对比。".into(),
                source_label: "Rust-Bot · 状态机白板".into(),
                timestamp: "18 分钟前".into(),
                project_id: "proj-mizar".into(),
                task_id: Some("task-104".into()),
                artifact_id: Some("art-mizar-suspend-canvas".into()),
                schedule_id: None,
                bot_id: "bot-rust".into(),
                command_preview: None,
                reply_text: None,
                receipt_settled: false,
            },
            InboxItem {
                id: "inb-4".into(),
                kind: InboxKind::GapWaiver,
                status: InboxStatus::Pending,
                title: "定时巡检发现 Gap：Mizar 16 并发 Mod 压测尚未覆盖".into(),
                summary: "「rquickjs 沙箱安全边界巡检」凌晨 03:00 执行完毕，单核沙箱全绿，并发锁竞争需确认 Waive 豁免或转补测 Task。".into(),
                source_label: "Cron 巡检 · Mizar 安全".into(),
                timestamp: "2 小时前".into(),
                project_id: "proj-mizar".into(),
                task_id: Some("task-104".into()),
                artifact_id: Some("art-mizar-nightly-verify".into()),
                schedule_id: Some("sch-mizar-sandbox".into()),
                bot_id: "bot-rust".into(),
                command_preview: Some("cargo test -p mizar-codemode timeout_interrupt".into()),
                reply_text: None,
                receipt_settled: false,
            },
            InboxItem {
                id: "inb-5".into(),
                kind: InboxKind::GuardrailApproval,
                status: InboxStatus::Pending,
                title: "红线审批：允许 Review-Bot 跑 release 全量 LTO 打包校验".into(),
                summary: "将在临时隔离目录构建 release 目标，耗时约 40s 并清理临时构建产物。".into(),
                source_label: "Review-Bot · 红线门控".into(),
                timestamp: "28 分钟前".into(),
                project_id: "proj-merak".into(),
                task_id: Some("task-103".into()),
                artifact_id: Some("art-merak-verify-report".into()),
                schedule_id: None,
                bot_id: "bot-review".into(),
                command_preview: Some("MERAK_HOME=/tmp/merak-qa cargo build --release --features devtools".into()),
                reply_text: None,
                receipt_settled: false,
            },
            InboxItem {
                id: "inb-6".into(),
                kind: InboxKind::DecisionChoice,
                status: InboxStatus::Settled,
                title: "已拍板：采用 Project 主导 + 产物即决策面视觉工作台".into(),
                summary: "已通过方案 A 并在 Merak 主工作区生效。".into(),
                source_label: "Arch-Bot · 已回执".into(),
                timestamp: "35 分钟前".into(),
                project_id: "proj-notes".into(),
                task_id: Some("task-105".into()),
                artifact_id: Some("art-schedule-funnel-canvas".into()),
                schedule_id: None,
                bot_id: "bot-ui".into(),
                command_preview: None,
                reply_text: Some("选定方案 A：先建视觉平台框架，不接入真实 Agent。".into()),
                receipt_settled: true,
            },
        ],
        sessions: vec![
            BotSession {
                id: "ses-arch-daemon".into(),
                title: "Daemon 与 GPUI 进程解耦拓扑".into(),
                bot_id: "bot-arch".into(),
                project_id: "proj-merak".into(),
                status: SessionStatus::WaitingVerdict,
                updated_at: "2 分钟前".into(),
                summary: "已输出方案 A / B 架构白板与权衡摘要，等待主人点选拍板。".into(),
                pinned_artifact_id: Some("art-merak-arch-canvas".into()),
                messages: vec![
                    ChatMessage {
                        id: "msg-101".into(),
                        role: ChatRole::User,
                        author: "主人".into(),
                        body: "如果未来把 Mizar 微内核接进来，Tokio 调度放在独立守护进程好，还是直接挂在 GPUI 后台线程里？画一版对比图给我看。".into(),
                        timestamp: "10 分钟前".into(),
                        tool_calls: vec![],
                        linked_artifact_id: None,
                    },
                    ChatMessage {
                        id: "msg-102".into(),
                        role: ChatRole::Bot,
                        author: "Arch-Bot".into(),
                        body: "我已经检查了现有 workspace crate 边界与 GPUI 渲染调度模型，并把「方案 A · 独立 Tokio Daemon + Unix/RPC」和「方案 B · 单进程内嵌 Tokio」画到了决策白板上。\n\n核心差异在于关掉桌面窗口后的 Cron 巡检保活，以及避免 `tokio` 锁混入 120Hz 渲染线程；我建议选方案 A，主人可以直接点下方卡片进决策面或直接回复微调。".into(),
                        timestamp: "2 分钟前".into(),
                        tool_calls: vec![
                            ChatToolCall {
                                id: "tc-101".into(),
                                label: "inspect_workspace_topology".into(),
                                detail: "crates/core (fdl_core) · crates/merak-contracts · src/merak/* -> 已确认零 Tokio 阻塞依赖。".into(),
                                passed: true,
                            },
                            ChatToolCall {
                                id: "tc-102".into(),
                                label: "render_decision_canvas".into(),
                                detail: "已生成 Excalidraw 白板：Daemon 与 GPUI 运行时耦合拓扑选型 (2 个可选方案)。".into(),
                                passed: true,
                            },
                        ],
                        linked_artifact_id: Some("art-merak-arch-canvas".into()),
                    },
                ],
            },
            BotSession {
                id: "ses-arch-git-binding".into(),
                title: "项目绑定本地 Git 仓库与 Worktree 隔离".into(),
                bot_id: "bot-arch".into(),
                project_id: "proj-merak".into(),
                status: SessionStatus::Active,
                updated_at: "8 分钟前".into(),
                summary: "梳理项目与本地代码仓的一对多绑定策略及 worktree 并发边界。".into(),
                pinned_artifact_id: None,
                messages: vec![
                    ChatMessage {
                        id: "msg-201".into(),
                        role: ChatRole::User,
                        author: "主人".into(),
                        body: "每个 Project 应该能直接绑定本机 Git 仓库目录，并且实时看到分支、未提交变更和 worktree 状态。".into(),
                        timestamp: "12 分钟前".into(),
                        tool_calls: vec![],
                        linked_artifact_id: None,
                    },
                    ChatMessage {
                        id: "msg-202".into(),
                        role: ChatRole::Bot,
                        author: "Arch-Bot".into(),
                        body: "同意！把 Git 仓库绑定放在 Project 视图「代码仓」标签和顶栏徽章上最直观：\n1. 支持系统文件夹选择与手动输入路径，自动用 `git rev-parse --show-toplevel` 归一化仓库根目录；\n2. 兼容尚未有首个 commit 的新建仓库（通过 `git symbolic-ref --short HEAD` 读取默认分支）；\n3. 自动读取 `git worktree list --porcelain`，与设置里的多 Bot Worktree 隔离开关对齐。".into(),
                        timestamp: "8 分钟前".into(),
                        tool_calls: vec![ChatToolCall {
                            id: "tc-201".into(),
                            label: "git rev-parse --show-toplevel".into(),
                            detail: "~/workspace/dsh-space/Merak · branch main (ready)".into(),
                            passed: true,
                        }],
                        linked_artifact_id: None,
                    },
                ],
            },
            BotSession {
                id: "ses-review-verify".into(),
                title: "双轨验收自证：编译、图标合规与离屏截图".into(),
                bot_id: "bot-review".into(),
                project_id: "proj-merak".into(),
                status: SessionStatus::WaitingVerdict,
                updated_at: "6 分钟前".into(),
                summary: "机器自证项全部绿灯，列出了 2 项未覆盖盲区待主人决定 Pass 或豁免。".into(),
                pinned_artifact_id: Some("art-merak-verify-report".into()),
                messages: vec![
                    ChatMessage {
                        id: "msg-301".into(),
                        role: ChatRole::User,
                        author: "主人".into(),
                        body: "跑完当前轮次的静态检查和离屏截图回归，把诚实的自证与未覆盖盲区发给我确认。".into(),
                        timestamp: "18 分钟前".into(),
                        tool_calls: vec![],
                        linked_artifact_id: None,
                    },
                    ChatMessage {
                        id: "msg-302".into(),
                        role: ChatRole::Bot,
                        author: "Review-Bot".into(),
                        body: "机器自证已执行完毕，`merak-contracts` 契约校验、运动学单元测试、白板解析与离屏截图全部通过；同时在报告里保留了 Windows/Linux 实机渲染盲区，未自动跳过，请主人打开下方验收报告裁决。".into(),
                        timestamp: "6 分钟前".into(),
                        tool_calls: vec![ChatToolCall {
                            id: "tc-301".into(),
                            label: "cargo test && offscreen_qa".into(),
                            detail: "contracts ok · motion::tests ok · seeded_canvases ok · 0 warnings".into(),
                            passed: true,
                        }],
                        linked_artifact_id: Some("art-merak-verify-report".into()),
                    },
                ],
            },
            BotSession {
                id: "ses-rust-suspend".into(),
                title: "Mizar 工具审批 Suspend / Resume 状态机".into(),
                bot_id: "bot-rust".into(),
                project_id: "proj-mizar".into(),
                status: SessionStatus::Active,
                updated_at: "14 分钟前".into(),
                summary: "讨论高危工具挂起后 24h 超时回退与 SQLite 事务边界。".into(),
                pinned_artifact_id: Some("art-mizar-suspend-canvas".into()),
                messages: vec![
                    ChatMessage {
                        id: "msg-401".into(),
                        role: ChatRole::User,
                        author: "主人".into(),
                        body: "Suspend 挂起超过 24 小时还没收到人类 Inbox 回执时，状态机怎么收口？".into(),
                        timestamp: "20 分钟前".into(),
                        tool_calls: vec![],
                        linked_artifact_id: None,
                    },
                    ChatMessage {
                        id: "msg-402".into(),
                        role: ChatRole::Bot,
                        author: "Rust-Bot".into(),
                        body: "建议复用 `mizar-session-sqlite` 的 Outbox 事务表记录 `suspended_until`：到期后自动以 `TimedOut` 唤醒一次收尾消息，避免僵尸挂起，同时在白板上补了一张分支流转图。".into(),
                        timestamp: "14 分钟前".into(),
                        tool_calls: vec![ChatToolCall {
                            id: "tc-401".into(),
                            label: "trace_cordis_suspend".into(),
                            detail: "checked mizar-agent-spine suspend points & sqlite outbox schema".into(),
                            passed: true,
                        }],
                        linked_artifact_id: Some("art-mizar-suspend-canvas".into()),
                    },
                ],
            },
            BotSession {
                id: "ses-ui-funnel".into(),
                title: "定时巡检降噪漏斗（绿灯静默策略）".into(),
                bot_id: "bot-ui".into(),
                project_id: "proj-notes".into(),
                status: SessionStatus::Archived,
                updated_at: "1 小时前".into(),
                summary: "全绿静默记账、仅异常进 Inbox 的流转白板已定案归档。".into(),
                pinned_artifact_id: Some("art-schedule-funnel-canvas".into()),
                messages: vec![
                    ChatMessage {
                        id: "msg-501".into(),
                        role: ChatRole::Bot,
                        author: "UI-Bot".into(),
                        body: "已经将 Cron 巡检降噪漏斗定稿至白板：98% 全绿巡检静默归档到 Schedules 运行账本，仅当发现测试失败、红线审批或 Verify Gap 时才投递邮件至 Inbox。".into(),
                        timestamp: "1 小时前".into(),
                        tool_calls: vec![],
                        linked_artifact_id: Some("art-schedule-funnel-canvas".into()),
                    },
                ],
            },
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn seed_snapshot_invariants_hold() {
        let snap = seed_snapshot();
        assert!(!snap.projects.is_empty());
        assert!(!snap.bots.is_empty());
        assert!(!snap.artifacts.is_empty());
        assert!(!snap.tasks.is_empty());
        assert!(!snap.schedules.is_empty());
        assert!(!snap.inbox.is_empty());
        assert!(!snap.sessions.is_empty());

        let project_ids: HashSet<&str> = snap.projects.iter().map(|p| p.id.as_str()).collect();
        let bot_ids: HashSet<&str> = snap.bots.iter().map(|b| b.id.as_str()).collect();
        let artifact_ids: HashSet<&str> = snap.artifacts.iter().map(|a| a.id.as_str()).collect();
        let task_ids: HashSet<&str> = snap.tasks.iter().map(|t| t.id.as_str()).collect();
        let schedule_ids: HashSet<&str> = snap.schedules.iter().map(|s| s.id.as_str()).collect();
        let session_ids: HashSet<&str> = snap.sessions.iter().map(|s| s.id.as_str()).collect();

        assert_eq!(project_ids.len(), snap.projects.len());
        assert_eq!(bot_ids.len(), snap.bots.len());
        assert_eq!(artifact_ids.len(), snap.artifacts.len());
        assert_eq!(task_ids.len(), snap.tasks.len());
        assert_eq!(schedule_ids.len(), snap.schedules.len());
        assert_eq!(session_ids.len(), snap.sessions.len());

        for p in &snap.projects {
            assert!(bot_ids.contains(p.default_bot_id.as_str()));
            assert!(artifact_ids.contains(p.active_artifact_id.as_str()));
        }

        for a in &snap.artifacts {
            assert!(project_ids.contains(a.project_id.as_str()));
            assert!(bot_ids.contains(a.bot_id.as_str()));
            if let Some(tid) = &a.task_id {
                assert!(task_ids.contains(tid.as_str()));
            }
            match a.kind {
                ArtifactKind::DecisionCanvas => {
                    let json_str = a.canvas_scene_json.as_deref().expect("canvas JSON missing");
                    let val: serde_json::Value = serde_json::from_str(json_str).expect("valid JSON");
                    assert!(val["elements"].as_array().is_some_and(|arr| !arr.is_empty()));
                }
                ArtifactKind::VerifyReport => {
                    let rep = a.verify_report.as_ref().expect("verify report payload missing");
                    assert!(!rep.claims.is_empty());
                }
                _ => {}
            }
        }

        for t in &snap.tasks {
            assert!(project_ids.contains(t.project_id.as_str()));
            assert!(bot_ids.contains(t.linked_bot_id.as_str()));
            assert!(artifact_ids.contains(t.primary_artifact_id.as_str()));
            if let Some(vid) = &t.verify_artifact_id {
                assert!(artifact_ids.contains(vid.as_str()));
            }
        }

        for s in &snap.schedules {
            assert!(project_ids.contains(s.project_id.as_str()));
            assert!(bot_ids.contains(s.bot_id.as_str()));
            for r in &s.runs {
                if let Some(vid) = &r.verify_artifact_id {
                    assert!(artifact_ids.contains(vid.as_str()));
                }
            }
        }

        for i in &snap.inbox {
            assert!(project_ids.contains(i.project_id.as_str()));
            assert!(bot_ids.contains(i.bot_id.as_str()));
            if let Some(tid) = &i.task_id {
                assert!(task_ids.contains(tid.as_str()));
            }
            if let Some(aid) = &i.artifact_id {
                assert!(artifact_ids.contains(aid.as_str()));
            }
            if let Some(sid) = &i.schedule_id {
                assert!(schedule_ids.contains(sid.as_str()));
            }
        }

        for s in &snap.sessions {
            assert!(bot_ids.contains(s.bot_id.as_str()));
            assert!(project_ids.contains(s.project_id.as_str()));
            assert!(!s.messages.is_empty());
            if let Some(aid) = &s.pinned_artifact_id {
                assert!(artifact_ids.contains(aid.as_str()));
            }
            for m in &s.messages {
                if let Some(aid) = &m.linked_artifact_id {
                    assert!(artifact_ids.contains(aid.as_str()));
                }
            }
        }
    }

    #[test]
    fn seed_snapshot_serde_roundtrip() {
        let snap = seed_snapshot();
        let json = serde_json::to_string(&snap).expect("serialize");
        let back: MerakSnapshot = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(snap, back);
    }
}
