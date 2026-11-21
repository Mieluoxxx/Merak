//! Bot session & chat Cordis service (`"botChat"`).

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use cordis::{Context, CordisError, Inject, Service};
use merak_contracts::{
    Artifact, ArtifactKind, ArtifactVerdict, BotSession, ChatMessage, ChatRole, ChatToolCall,
    ClaimStatus, DecisionOption, MerakSnapshot, Project, ScheduleNotifyPolicy, ScheduleRunOutcome,
    ScheduleTriggerKind, ScheduledJob, SessionStatus, VerifyClaim, VerifyJudge, VerifyReportData,
};
use serde_json::{Value, json};

use crate::store::StoreService;
use crate::types::{SessionDeliverableKind, StartSessionInput, StartSessionOutput};

const CANVAS_INDEX_DIGITS: &[u8] =
    b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/// Cordis service managing bot chat sessions, deliverable creation, and artifact promotion.
pub struct BotChatService {
    store: Arc<StoreService>,
    bot_active_sessions: RwLock<HashMap<String, String>>,
}

impl BotChatService {
    /// Start a new deliverable or free-chat session from the New Session sheet.
    pub fn start_session(&self, input: StartSessionInput) -> Option<StartSessionOutput> {
        let title = input.prompt.trim().to_string();
        if title.is_empty() {
            return None;
        }

        let (proj, bot_name) = self.store.read(|snap| {
            let proj = snap
                .projects
                .iter()
                .find(|p| p.id == input.project_id)
                .cloned()?;
            let bot_name = snap
                .bots
                .iter()
                .find(|b| b.id == input.bot_id)
                .map(|b| b.name.clone())
                .unwrap_or_else(|| "Bot".into());
            Some((proj, bot_name))
        })?;

        match input.deliverable {
            SessionDeliverableKind::FreeChat => {
                let sid = self.create_session_record(
                    &input.bot_id,
                    &input.project_id,
                    Some(&title),
                    false,
                );
                self.send_chat_message(&sid, &title, None);
                Some(StartSessionOutput {
                    kind: SessionDeliverableKind::FreeChat,
                    primary_id: sid,
                    extra_id: None,
                })
            }
            SessionDeliverableKind::DecisionCanvas => {
                let aid = self.store.next_id("art-ses");
                self.store.write("bot_chat.start_decision_canvas", |snap| {
                    let scene_json =
                        resolve_project_canvas_scene(snap, &proj, &title, &bot_name);
                    snap.artifacts.insert(
                        0,
                        Artifact {
                            id: aid.clone(),
                            project_id: input.project_id.clone(),
                            task_id: None,
                            bot_id: input.bot_id.clone(),
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
                            canvas_scene_json: Some(scene_json),
                            verify_report: None,
                            doc_markdown: None,
                            comments: vec![],
                        },
                    );
                });
                Some(StartSessionOutput {
                    kind: SessionDeliverableKind::DecisionCanvas,
                    primary_id: aid,
                    extra_id: None,
                })
            }
            SessionDeliverableKind::VerifyReport => {
                let aid = self.store.next_id("art-ses");
                let clm_prefix = self.store.next_id("clm");
                self.store.write("bot_chat.start_verify_report", |snap| {
                    snap.artifacts.insert(
                        0,
                        Artifact {
                            id: aid.clone(),
                            project_id: input.project_id.clone(),
                            task_id: None,
                            bot_id: input.bot_id.clone(),
                            kind: ArtifactKind::VerifyReport,
                            title: title.clone(),
                            question: format!("{bot_name} 发起的双轨验收：{title}"),
                            updated_at: "刚刚".into(),
                            verdict: ArtifactVerdict::PendingHuman,
                            options: vec![],
                            canvas_scene_json: None,
                            verify_report: Some(VerifyReportData {
                                summary: format!(
                                    "围绕「{title}」整理的机器自证与人类裁决清单"
                                ),
                                claims: vec![
                                    VerifyClaim {
                                        id: format!("{clm_prefix}-1"),
                                        title: "核心路径构建与离线检查通过".into(),
                                        judge: VerifyJudge::Agent,
                                        status: ClaimStatus::Verified,
                                        provenance: format!("{bot_name} · 自动化验证"),
                                        command: Some("cargo check --all-targets".into()),
                                        evidence_output: "0 warnings, all checks green".into(),
                                        linked_canvas_id: None,
                                    },
                                    VerifyClaim {
                                        id: format!("{clm_prefix}-2"),
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
                });
                Some(StartSessionOutput {
                    kind: SessionDeliverableKind::VerifyReport,
                    primary_id: aid,
                    extra_id: None,
                })
            }
            SessionDeliverableKind::SpecDoc => {
                let aid = self.store.next_id("art-ses");
                self.store.write("bot_chat.start_spec_doc", |snap| {
                    snap.artifacts.insert(
                        0,
                        Artifact {
                            id: aid.clone(),
                            project_id: input.project_id.clone(),
                            task_id: None,
                            bot_id: input.bot_id.clone(),
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
                });
                Some(StartSessionOutput {
                    kind: SessionDeliverableKind::SpecDoc,
                    primary_id: aid,
                    extra_id: None,
                })
            }
            SessionDeliverableKind::Schedule => {
                let sch_id = self.store.next_id("sch");
                self.store.write("bot_chat.start_schedule", |snap| {
                    snap.schedules.insert(
                        0,
                        ScheduledJob {
                            id: sch_id.clone(),
                            project_id: input.project_id.clone(),
                            bot_id: input.bot_id.clone(),
                            name: title.clone(),
                            description: format!(
                                "由 {bot_name} 负责的自动巡检任务，默认全绿静默、发现异常时推入 Inbox。"
                            ),
                            trigger_kind: ScheduleTriggerKind::Cron,
                            schedule_expr: "0 9 * * *".into(),
                            schedule_label: "每天 09:00".into(),
                            enabled: true,
                            notify_policy: ScheduleNotifyPolicy::SilentOnPass,
                            last_run_at: "尚未运行".into(),
                            next_run_at: "明天 09:00".into(),
                            last_outcome: ScheduleRunOutcome::AllGreen,
                            runs: vec![],
                        },
                    );
                });
                Some(StartSessionOutput {
                    kind: SessionDeliverableKind::Schedule,
                    primary_id: sch_id,
                    extra_id: None,
                })
            }
        }
    }

    /// Return the active session ID for `bot_id`, creating a greeted session if none exists.
    pub fn ensure_bot_session(&self, bot_id: &str) -> String {
        if let Some(sid) = self.active_session_id_for_bot(bot_id) {
            self.bot_active_sessions
                .write()
                .unwrap()
                .insert(bot_id.to_string(), sid.clone());
            return sid;
        }

        let pid = self.store.read(|snap| {
            snap.bots
                .iter()
                .find(|b| b.id == bot_id)
                .map(|b| b.project_id.clone())
                .filter(|pid| snap.projects.iter().any(|p| p.id == *pid))
                .or_else(|| snap.projects.first().map(|p| p.id.clone()))
                .unwrap_or_default()
        });
        self.create_session_record(bot_id, &pid, None, true)
    }

    /// Create a new greeted chat session for `bot_id` bound to `project_id`.
    pub fn create_bot_session(
        &self,
        bot_id: &str,
        project_id: &str,
        title: Option<&str>,
    ) -> String {
        self.create_session_record(bot_id, project_id, title, true)
    }

    /// Return the currently tracked active session ID for `bot_id`, if any exists in the store.
    pub fn active_session_id_for_bot(&self, bot_id: &str) -> Option<String> {
        let cached = self
            .bot_active_sessions
            .read()
            .unwrap()
            .get(bot_id)
            .cloned();
        self.store.read(|snap| {
            if let Some(sid) = cached
                && snap
                    .sessions
                    .iter()
                    .any(|s| s.id == sid && s.bot_id == bot_id)
            {
                return Some(sid);
            }
            snap.sessions
                .iter()
                .find(|s| s.bot_id == bot_id)
                .map(|s| s.id.clone())
        })
    }

    /// Mark `sid` as the active session for its owning bot if `sid` exists.
    pub fn select_session(&self, sid: &str) {
        if let Some(bot_id) = self.store.read(|snap| {
            snap.sessions
                .iter()
                .find(|s| s.id == sid)
                .map(|s| s.bot_id.clone())
        }) {
            self.bot_active_sessions
                .write()
                .unwrap()
                .insert(bot_id, sid.to_string());
        }
    }

    /// Look up the project ID bound to session `sid`.
    pub fn session_project_id(&self, sid: &str) -> Option<String> {
        self.store.read(|snap| {
            snap.sessions
                .iter()
                .find(|s| s.id == sid)
                .map(|s| s.project_id.clone())
        })
    }

    /// Append a user message and a contextual bot reply (with optional live `git_summary`).
    pub fn send_chat_message(
        &self,
        sid: &str,
        raw: &str,
        git_summary: Option<String>,
    ) -> Option<String> {
        let body = raw.trim().to_string();
        if body.is_empty() {
            return None;
        }
        if !self
            .store
            .read(|snap| snap.sessions.iter().any(|s| s.id == sid))
        {
            return None;
        }

        let msg_prefix = self.store.next_id("msg");
        let tc_id = self.store.next_id("tc");

        let result = self.store.write("bot_chat.send_message", |snap| {
            let idx = snap.sessions.iter().position(|s| s.id == sid)?;
            let (bot_id, project_id) = {
                let s = &snap.sessions[idx];
                (s.bot_id.clone(), s.project_id.clone())
            };
            let bot = snap.bots.iter().find(|b| b.id == bot_id).cloned();
            let proj = snap.projects.iter().find(|p| p.id == project_id).cloned();
            let bot_name = bot
                .as_ref()
                .map(|b| b.name.clone())
                .unwrap_or_else(|| "Bot".into());
            let bot_role = bot
                .as_ref()
                .map(|b| b.role.clone())
                .unwrap_or_else(|| "协作助手".into());
            let proj_name = proj
                .as_ref()
                .map(|p| p.name.clone())
                .unwrap_or_else(|| "当前项目".into());
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
                .filter(|aid| snap.artifacts.iter().any(|a| a.id == *aid));

            let reply_body = if let Some(ref aid) = linked_art_id {
                let art_title = snap
                    .artifacts
                    .iter()
                    .find(|a| a.id == *aid)
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

            let ses = &mut snap.sessions[idx];
            ses.messages.push(ChatMessage {
                id: format!("{msg_prefix}-u"),
                role: ChatRole::User,
                author: "主人".into(),
                body: body.clone(),
                timestamp: "刚刚".into(),
                tool_calls: vec![],
                linked_artifact_id: None,
            });
            ses.messages.push(ChatMessage {
                id: format!("{msg_prefix}-b"),
                role: ChatRole::Bot,
                author: bot_name.clone(),
                body: reply_body,
                timestamp: "刚刚".into(),
                tool_calls: vec![ChatToolCall {
                    id: tc_id,
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
                let updated = snap.sessions.remove(idx);
                snap.sessions.insert(0, updated);
            }
            Some((bot_id, bot_name))
        });

        if let Some((bot_id, bot_name)) = result {
            self.bot_active_sessions
                .write()
                .unwrap()
                .insert(bot_id, sid.to_string());
            Some(bot_name)
        } else {
            None
        }
    }

    /// Promote session `sid` into a standalone `DecisionCanvas` or `SpecDoc` artifact and link it back.
    pub fn promote_session_to_artifact(
        &self,
        sid: &str,
        kind: ArtifactKind,
    ) -> Option<(String, String)> {
        let valid = self.store.read(|snap| {
            let ses = snap.sessions.iter().find(|s| s.id == sid)?;
            snap.projects
                .iter()
                .any(|p| p.id == ses.project_id)
                .then_some(())
        });
        valid?;

        let aid = self.store.next_id("art-ses");
        let opt_prefix = self.store.next_id("opt");
        let msg_prefix = self.store.next_id("msg");

        self.store.write("bot_chat.promote_to_artifact", |snap| {
            let ses = snap.sessions.iter().find(|s| s.id == sid)?.clone();
            let proj = snap
                .projects
                .iter()
                .find(|p| p.id == ses.project_id)?
                .clone();
            let bot_name = snap
                .bots
                .iter()
                .find(|b| b.id == ses.bot_id)
                .map(|b| b.name.clone())
                .unwrap_or_else(|| "Bot".into());

            let last_user_text = ses
                .messages
                .iter()
                .rev()
                .find(|m| m.role == ChatRole::User)
                .map(|m| m.body.clone())
                .unwrap_or_else(|| ses.title.clone());

            let (toast_msg, artifact) = match kind {
                ArtifactKind::DecisionCanvas => {
                    let scene_json =
                        resolve_project_canvas_scene(snap, &proj, &ses.title, &bot_name);
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
                                    id: format!("{opt_prefix}-a"),
                                    key: "A".into(),
                                    label: "方案 A · 会话推荐方案".into(),
                                    summary: "延续会话已对齐的模块边界与增量验证路径".into(),
                                    recommended: true,
                                    chosen: false,
                                },
                                DecisionOption {
                                    id: format!("{opt_prefix}-b"),
                                    key: "B".into(),
                                    label: "方案 B · 最小改动试点".into(),
                                    summary: "先在单模块验证可行性再扩大范围".into(),
                                    recommended: false,
                                    chosen: false,
                                },
                            ],
                            canvas_scene_json: Some(scene_json),
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

            snap.artifacts.insert(0, artifact);
            if let Some(s) = snap.sessions.iter_mut().find(|s| s.id == sid) {
                s.pinned_artifact_id = Some(aid.clone());
                s.status = SessionStatus::WaitingVerdict;
                s.updated_at = "刚刚".into();
                s.messages.push(ChatMessage {
                    id: format!("{msg_prefix}-p"),
                    role: ChatRole::Bot,
                    author: bot_name,
                    body: "已将本次讨论整理为独立产物，主人可直接点击下方卡片打开决策面查看与批注。"
                        .into(),
                    timestamp: "刚刚".into(),
                    tool_calls: vec![],
                    linked_artifact_id: Some(aid.clone()),
                });
            }
            Some((aid, toast_msg))
        })
    }

    fn create_session_record(
        &self,
        bot_id: &str,
        project_id: &str,
        title: Option<&str>,
        with_greeting: bool,
    ) -> String {
        let sid = self.store.next_id("ses");
        let msg_prefix = self.store.next_id("msg");
        let seq_label = sid.strip_prefix("ses-").unwrap_or(&sid).to_string();

        self.store.write("bot_chat.create_session", |snap| {
            let bot = snap.bots.iter().find(|b| b.id == bot_id).cloned();
            let proj = snap.projects.iter().find(|p| p.id == project_id).cloned();
            let bot_name = bot
                .as_ref()
                .map(|b| b.name.clone())
                .unwrap_or_else(|| "Bot".into());
            let bot_role = bot
                .as_ref()
                .map(|b| b.role.clone())
                .unwrap_or_else(|| "协作者".into());
            let proj_name = proj
                .as_ref()
                .map(|p| p.name.clone())
                .unwrap_or_else(|| "默认项目".into());
            let title_str = title
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .map(|t| t.chars().take(28).collect::<String>())
                .unwrap_or_else(|| format!("与 {bot_name} 的新对话 #{seq_label}"));

            let messages = if with_greeting {
                vec![ChatMessage {
                    id: format!("{msg_prefix}-0"),
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

            snap.sessions.insert(
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
        });

        self.bot_active_sessions
            .write()
            .unwrap()
            .insert(bot_id.to_string(), sid.clone());
        sid
    }
}

impl Service for BotChatService {
    type Config = ();

    fn service_name() -> &'static str {
        "botChat"
    }

    fn inject() -> Inject {
        Inject::new(["store"])
    }

    fn create(ctx: &Context, _config: Self::Config) -> Result<Arc<Self>, CordisError> {
        let store = ctx.service::<StoreService>("store")?;
        let bot_active_sessions = store.read(|snap| {
            let mut map = HashMap::new();
            for ses in &snap.sessions {
                map.entry(ses.bot_id.clone())
                    .or_insert_with(|| ses.id.clone());
            }
            map
        });
        Ok(Arc::new(Self {
            store,
            bot_active_sessions: RwLock::new(bot_active_sessions),
        }))
    }
}

/// Reuse an existing project scene when available, or generate a valid Excalidraw scene for blank projects.
fn resolve_project_canvas_scene(
    snap: &MerakSnapshot,
    proj: &Project,
    title: &str,
    bot_name: &str,
) -> String {
    snap.artifacts
        .iter()
        .find(|a| a.id == proj.active_artifact_id)
        .and_then(|a| a.canvas_scene_json.clone())
        .or_else(|| {
            snap.artifacts
                .iter()
                .find(|a| a.project_id == proj.id && a.canvas_scene_json.is_some())
                .and_then(|a| a.canvas_scene_json.clone())
        })
        .unwrap_or_else(|| build_decision_canvas_scene(title, &proj.name, bot_name))
}

fn canvas_idx(n: usize) -> String {
    let a = CANVAS_INDEX_DIGITS[(n / CANVAS_INDEX_DIGITS.len()) % CANVAS_INDEX_DIGITS.len()] as char;
    let b = CANVAS_INDEX_DIGITS[n % CANVAS_INDEX_DIGITS.len()] as char;
    format!("a{a}{b}")
}

fn push_labeled_rect(
    els: &mut Vec<Value>,
    order: &mut usize,
    id: &str,
    frame_id: Option<&str>,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    stroke: &str,
    fill: &str,
    label: &str,
) {
    let tid = format!("{id}_t");
    let s_idx = canvas_idx(*order);
    *order += 1;
    let t_idx = canvas_idx(*order);
    *order += 1;

    els.push(json!({
        "id": id,
        "type": "rectangle",
        "x": x,
        "y": y,
        "width": w,
        "height": h,
        "angle": 0,
        "strokeColor": stroke,
        "backgroundColor": fill,
        "fillStyle": "hachure",
        "strokeWidth": 2,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "groupIds": [],
        "frameId": frame_id,
        "index": s_idx,
        "roundness": { "type": 3 },
        "seed": 200 + *order as u64,
        "version": 2,
        "versionNonce": 2000 + *order as u64,
        "isDeleted": false,
        "boundElements": [{ "id": tid, "type": "text" }],
        "updated": 1731576000000_i64,
        "created": 1731575000000_i64,
        "link": null,
        "locked": false
    }));

    let line_count = label.lines().count().max(1) as f64;
    let th = line_count * 22.0;
    let tw = (w - 24.0).max(80.0);
    els.push(json!({
        "id": tid,
        "type": "text",
        "x": x + 12.0,
        "y": y + (h - th) * 0.5,
        "width": tw,
        "height": th,
        "angle": 0,
        "strokeColor": "#1e1e1e",
        "backgroundColor": "transparent",
        "fillStyle": "solid",
        "strokeWidth": 2,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "groupIds": [],
        "frameId": frame_id,
        "index": t_idx,
        "roundness": null,
        "seed": 300 + *order as u64,
        "version": 2,
        "versionNonce": 3000 + *order as u64,
        "isDeleted": false,
        "boundElements": null,
        "updated": 1731576000000_i64,
        "created": 1731575000000_i64,
        "link": null,
        "locked": false,
        "text": label,
        "fontSize": 16,
        "fontFamily": 5,
        "textAlign": "center",
        "verticalAlign": "middle",
        "containerId": id,
        "originalText": label,
        "autoResize": true,
        "lineHeight": 1.25,
        "baseFontSize": null,
        "labelPosition": null
    }));
}

fn build_decision_canvas_scene(title: &str, project_name: &str, bot_name: &str) -> String {
    let mut els = Vec::new();
    let mut order = 0;

    els.push(json!({
        "id": "fa",
        "type": "frame",
        "x": 40.0,
        "y": 40.0,
        "width": 360.0,
        "height": 280.0,
        "angle": 0,
        "strokeColor": "#868e96",
        "backgroundColor": "transparent",
        "fillStyle": "solid",
        "strokeWidth": 2,
        "strokeStyle": "dashed",
        "roughness": 0,
        "opacity": 100,
        "groupIds": [],
        "frameId": null,
        "index": canvas_idx(order),
        "roundness": null,
        "seed": 100,
        "version": 1,
        "versionNonce": 1000,
        "isDeleted": false,
        "boundElements": [],
        "updated": 1731576000000_i64,
        "created": 1731575000000_i64,
        "link": null,
        "locked": false,
        "name": format!("方案 A · 推荐路径 ({bot_name})")
    }));
    order += 1;

    push_labeled_rect(
        &mut els,
        &mut order,
        "opt_a_box",
        Some("fa"),
        70.0,
        90.0,
        300.0,
        140.0,
        "#2f9e44",
        "#d3f9d8",
        &format!("{title}\n[{project_name}]\n清晰拆解边界与增量验证路径"),
    );

    els.push(json!({
        "id": "fb",
        "type": "frame",
        "x": 440.0,
        "y": 40.0,
        "width": 360.0,
        "height": 280.0,
        "angle": 0,
        "strokeColor": "#868e96",
        "backgroundColor": "transparent",
        "fillStyle": "solid",
        "strokeWidth": 2,
        "strokeStyle": "dashed",
        "roughness": 0,
        "opacity": 100,
        "groupIds": [],
        "frameId": null,
        "index": canvas_idx(order),
        "roundness": null,
        "seed": 101,
        "version": 1,
        "versionNonce": 1001,
        "isDeleted": false,
        "boundElements": [],
        "updated": 1731576000000_i64,
        "created": 1731575000000_i64,
        "link": null,
        "locked": false,
        "name": "方案 B · 保守路径"
    }));
    order += 1;

    push_labeled_rect(
        &mut els,
        &mut order,
        "opt_b_box",
        Some("fb"),
        470.0,
        90.0,
        300.0,
        140.0,
        "#1971c2",
        "#a5d8ff",
        "最小改动渐进演进\n保持现有模块结构并支持回滚",
    );

    json!({
        "elements": els,
        "files": {}
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::StoreConfig;
    use merak_contracts::{ArtifactKind, seed_snapshot};

    async fn setup_bot_chat(snap: MerakSnapshot) -> (Context, Arc<BotChatService>, Arc<StoreService>) {
        let ctx = Context::new();
        ctx.plugin(StoreService::plugin(), StoreService::with_seed(snap))
            .await
            .expect("store mounted");
        ctx.plugin(BotChatService::plugin(), ())
            .await
            .expect("botChat mounted");
        let bot_chat = ctx.get::<BotChatService>("botChat").expect("botChat service");
        let store = ctx.get::<StoreService>("store").expect("store service");
        (ctx, bot_chat, store)
    }

    fn assert_valid_excalidraw_scene(json_str: &str) {
        let val: Value = serde_json::from_str(json_str).expect("scene is valid JSON");
        assert!(val.is_object(), "scene root must be JSON object");
        assert!(val["files"].is_object(), "scene must contain files object");
        let elements = val["elements"]
            .as_array()
            .expect("scene must contain elements array");
        assert!(!elements.is_empty(), "scene elements must be non-empty");
        for el in elements {
            assert!(el["id"].as_str().is_some_and(|s| !s.is_empty()));
            assert!(el["type"].as_str().is_some_and(|s| !s.is_empty()));
            assert!(el["x"].is_number() && el["y"].is_number());
            assert!(el["width"].is_number() && el["height"].is_number());
            assert_eq!(el["isDeleted"], Value::Bool(false));
        }
    }

    #[tokio::test]
    async fn start_session_handles_all_five_deliverables_and_blank_canvas() {
        let mut snap = seed_snapshot();
        snap.projects.push(Project {
            id: "proj-blank".into(),
            name: "Blank Project".into(),
            slug: "blank".into(),
            summary: "No prior canvas".into(),
            color_hex: 0x3b82f6,
            repo_paths: vec![],
            default_bot_id: "bot-arch".into(),
            skills: vec![],
            active_artifact_id: "missing-art".into(),
        });

        let (_ctx, bot_chat, store) = setup_bot_chat(snap).await;

        // Blank prompt returns None without mutating store.
        let rev_before = store.revision();
        assert!(
            bot_chat
                .start_session(StartSessionInput {
                    project_id: "proj-merak".into(),
                    bot_id: "bot-arch".into(),
                    deliverable: SessionDeliverableKind::FreeChat,
                    prompt: "   ".into(),
                })
                .is_none()
        );
        assert_eq!(store.revision(), rev_before);

        // 1. FreeChat
        let free = bot_chat
            .start_session(StartSessionInput {
                project_id: "proj-merak".into(),
                bot_id: "bot-arch".into(),
                deliverable: SessionDeliverableKind::FreeChat,
                prompt: "梳理架构与白板对齐".into(),
            })
            .expect("FreeChat created");
        assert_eq!(free.kind, SessionDeliverableKind::FreeChat);
        store.read(|s| {
            let ses = s
                .sessions
                .iter()
                .find(|x| x.id == free.primary_id)
                .expect("session stored");
            assert_eq!(ses.messages.len(), 2);
            assert_eq!(ses.messages[0].role, ChatRole::User);
            assert_eq!(ses.messages[1].role, ChatRole::Bot);
            assert!(ses.pinned_artifact_id.is_some());
        });

        // 2. DecisionCanvas (both seeded project and blank project produce valid Excalidraw JSON)
        let canvas_seeded = bot_chat
            .start_session(StartSessionInput {
                project_id: "proj-merak".into(),
                bot_id: "bot-arch".into(),
                deliverable: SessionDeliverableKind::DecisionCanvas,
                prompt: "插件内核选型画板".into(),
            })
            .expect("DecisionCanvas seeded created");
        let canvas_blank = bot_chat
            .start_session(StartSessionInput {
                project_id: "proj-blank".into(),
                bot_id: "bot-arch".into(),
                deliverable: SessionDeliverableKind::DecisionCanvas,
                prompt: "空白项目决策白板".into(),
            })
            .expect("DecisionCanvas blank created");
        assert_eq!(canvas_seeded.kind, SessionDeliverableKind::DecisionCanvas);
        assert_eq!(canvas_blank.kind, SessionDeliverableKind::DecisionCanvas);
        store.read(|s| {
            for aid in [&canvas_seeded.primary_id, &canvas_blank.primary_id] {
                let art = s.artifacts.iter().find(|a| a.id == *aid).expect("artifact exists");
                assert_eq!(art.kind, ArtifactKind::DecisionCanvas);
                assert_eq!(art.options.len(), 2);
                let json = art
                    .canvas_scene_json
                    .as_deref()
                    .expect("canvas_scene_json must be Some");
                assert_valid_excalidraw_scene(json);
            }
        });

        // 3. VerifyReport
        let verify = bot_chat
            .start_session(StartSessionInput {
                project_id: "proj-merak".into(),
                bot_id: "bot-review".into(),
                deliverable: SessionDeliverableKind::VerifyReport,
                prompt: "Cordis 迁移验收".into(),
            })
            .expect("VerifyReport created");
        assert_eq!(verify.kind, SessionDeliverableKind::VerifyReport);
        store.read(|s| {
            let art = s
                .artifacts
                .iter()
                .find(|a| a.id == verify.primary_id)
                .expect("verify artifact");
            assert_eq!(art.kind, ArtifactKind::VerifyReport);
            let rep = art.verify_report.as_ref().expect("verify payload");
            assert_eq!(rep.claims.len(), 2);
            assert_eq!(rep.claims[0].judge, VerifyJudge::Agent);
            assert_eq!(rep.claims[1].judge, VerifyJudge::Human);
        });

        // 4. SpecDoc
        let spec = bot_chat
            .start_session(StartSessionInput {
                project_id: "proj-merak".into(),
                bot_id: "bot-arch".into(),
                deliverable: SessionDeliverableKind::SpecDoc,
                prompt: "Cordis 迁移规格".into(),
            })
            .expect("SpecDoc created");
        assert_eq!(spec.kind, SessionDeliverableKind::SpecDoc);
        store.read(|s| {
            let art = s
                .artifacts
                .iter()
                .find(|a| a.id == spec.primary_id)
                .expect("spec artifact");
            assert_eq!(art.kind, ArtifactKind::SpecDoc);
            assert!(art.doc_markdown.as_deref().is_some_and(|m| m.contains("Cordis 迁移规格")));
        });

        // 5. Schedule
        let sched = bot_chat
            .start_session(StartSessionInput {
                project_id: "proj-merak".into(),
                bot_id: "bot-review".into(),
                deliverable: SessionDeliverableKind::Schedule,
                prompt: "每日回归巡检".into(),
            })
            .expect("Schedule created");
        assert_eq!(sched.kind, SessionDeliverableKind::Schedule);
        store.read(|s| {
            let job = s
                .schedules
                .iter()
                .find(|j| j.id == sched.primary_id)
                .expect("schedule created");
            assert!(job.enabled);
            assert_eq!(job.notify_policy, ScheduleNotifyPolicy::SilentOnPass);
        });
    }

    #[tokio::test]
    async fn ensure_create_send_and_promote_session_flow() {
        let (_ctx, bot_chat, store) = setup_bot_chat(StoreConfig::default().initial_snapshot).await;

        // ensure_bot_session reuses existing active session for seeded bot, creates one for new bot.
        let existing_sid = bot_chat.ensure_bot_session("bot-arch");
        assert_eq!(bot_chat.ensure_bot_session("bot-arch"), existing_sid);

        let brand_new_sid = bot_chat.ensure_bot_session("bot-brand-new");
        assert_eq!(bot_chat.ensure_bot_session("bot-brand-new"), brand_new_sid);
        store.read(|s| {
            let ses = s.sessions.iter().find(|x| x.id == brand_new_sid).unwrap();
            assert_eq!(ses.messages.len(), 1);
            assert_eq!(ses.messages[0].role, ChatRole::Bot);
        });

        // create_bot_session creates a distinct greeted session and switches active session to it.
        let created_sid = bot_chat.create_bot_session("bot-arch", "proj-merak", Some("新架构对话"));
        let untitled_sid = bot_chat.create_bot_session("bot-review", "proj-merak", None);
        assert_ne!(created_sid, existing_sid);
        assert_eq!(bot_chat.ensure_bot_session("bot-arch"), created_sid);
        assert_eq!(
            bot_chat.session_project_id(&created_sid).as_deref(),
            Some("proj-merak")
        );

        // Selecting and messaging a non-top session moves it to index 0 and updates active session.
        assert!(bot_chat.send_chat_message(&created_sid, "   ", None).is_none());
        assert!(bot_chat.send_chat_message("nonexistent-ses", "hello", None).is_none());

        // Fallback repo path when git_summary is None.
        let _ = bot_chat
            .send_chat_message(&untitled_sid, "日常同步", None)
            .expect("untitled message sent");

        // send_chat_message injects live git_summary into reply and tool call detail.
        let bot_name = bot_chat
            .send_chat_message(
                &created_sid,
                "检查当前分支代码仓状态",
                Some("branch work/bot-schedule-plugins · 3 dirty".into()),
            )
            .expect("message sent");
        assert_eq!(bot_name, "Arch-Bot");
        store.read(|s| {
            assert_eq!(s.sessions[0].id, created_sid);
            let ses = &s.sessions[0];
            let last_bot = ses.messages.last().unwrap();
            assert!(last_bot.body.contains("branch work/bot-schedule-plugins · 3 dirty"));
            assert!(last_bot.tool_calls[0]
                .detail
                .contains("branch work/bot-schedule-plugins · 3 dirty"));
        });

        // promote_session_to_artifact works for both DecisionCanvas and SpecDoc and links back.
        let (canvas_aid, canvas_toast) = bot_chat
            .promote_session_to_artifact(&created_sid, ArtifactKind::DecisionCanvas)
            .expect("promoted to canvas");
        assert!(canvas_toast.contains("决策白板"));

        let (spec_aid, spec_toast) = bot_chat
            .promote_session_to_artifact(&created_sid, ArtifactKind::SpecDoc)
            .expect("promoted to spec");
        assert!(spec_toast.contains("规格文档"));

        store.read(|s| {
            let canvas_art = s.artifacts.iter().find(|a| a.id == canvas_aid).unwrap();
            assert_eq!(canvas_art.kind, ArtifactKind::DecisionCanvas);
            assert_valid_excalidraw_scene(canvas_art.canvas_scene_json.as_deref().unwrap());

            let spec_art = s.artifacts.iter().find(|a| a.id == spec_aid).unwrap();
            assert_eq!(spec_art.kind, ArtifactKind::SpecDoc);
            assert!(spec_art
                .doc_markdown
                .as_deref()
                .is_some_and(|md| md.contains("检查当前分支代码仓状态")));

            let ses = s.sessions.iter().find(|x| x.id == created_sid).unwrap();
            assert_eq!(ses.status, SessionStatus::WaitingVerdict);
            assert_eq!(ses.pinned_artifact_id.as_deref(), Some(spec_aid.as_str()));
            assert_eq!(
                ses.messages.last().and_then(|m| m.linked_artifact_id.as_deref()),
                Some(spec_aid.as_str())
            );
        });
    }
}
