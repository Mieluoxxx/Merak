use super::components;
use super::git_repo;
use super::MerakWorkspace;
use crate::theme::{self, craft, Theme};
use crate::ui;
use gpui::{prelude::FluentBuilder, *};
use merak_contracts::{Artifact, ArtifactKind, BotSession, ChatRole, SessionStatus};

fn seg_track_bg() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0xff, 0xff, 0xff, 0.06)
    } else {
        theme::ca(craft::N1000, 0.045)
    }
}

fn card_bg() -> Hsla {
    if theme::dark() {
        theme::raised(Theme::bg_body())
    } else {
        theme::c(craft::N00)
    }
}

fn card_border() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0xff, 0xff, 0xff, 0.11)
    } else {
        theme::ca(craft::N1000, 0.10)
    }
}

fn user_bubble_bg() -> Hsla {
    if theme::dark() {
        theme::ca(craft::B400, 0.16)
    } else {
        theme::ca(craft::B500, 0.09)
    }
}

pub fn session_status_dot(status: SessionStatus) -> Hsla {
    match status {
        SessionStatus::Active => components::positive_color(),
        SessionStatus::WaitingVerdict => components::attention_color(),
        SessionStatus::Archived => components::text_muted(),
    }
}

pub fn project_git_summary(ws: &MerakWorkspace, project_id: &str) -> Option<(String, String, usize)> {
    let proj = ws.state.project(project_id)?;
    let path = proj.repo_paths.first()?;
    let name = git_repo::short_repo_name(path);
    if let Some(st) = ws.git_cache.get(path) {
        if st.is_git_repo {
            return Some((name, st.branch.clone(), st.dirty_count));
        }
        return Some((name, "非 Git 仓".into(), 0));
    }
    Some((name, "检测中".into(), 0))
}

fn render_embedded_artifact(
    ws: &MerakWorkspace,
    art: &Artifact,
    cx: &mut Context<MerakWorkspace>,
) -> Stateful<Div> {
    let aid = art.id.clone();
    let v_dot = components::verdict_dot_color(art.verdict);
    let board = (art.kind == ArtifactKind::DecisionCanvas)
        .then(|| ws.artifact_board_thumbs.get(&aid).cloned())
        .flatten();

    div()
        .id(SharedString::from(format!("chat-art-{aid}")))
        .w_full()
        .rounded(px(14.))
        .border_1()
        .border_color(Theme::line_border())
        .bg(card_bg())
        .overflow_hidden()
        .cursor_pointer()
        .hover(|s| s.border_color(Theme::line_sheet()))
        .on_click(cx.listener({
            let aid = aid.clone();
            move |this, _, window, cx| {
                this.open_artifact_in_decision_pane(&aid, window, cx);
            }
        }))
        .flex()
        .flex_col()
        .when_some(board, |d, b| {
            let bg = crate::board::render::canvas_color(&b);
            d.child(
                div()
                    .h(px(140.))
                    .w_full()
                    .border_b_1()
                    .border_color(Theme::line_divider())
                    .bg(bg)
                    .overflow_hidden()
                    .child(
                        canvas(
                            |_, _, _| {},
                            move |bounds, _, window, cx| {
                                crate::board::render::paint_card(&b, bounds, window, cx);
                            },
                        )
                        .size_full(),
                    ),
            )
        })
        .child(
            div()
                .px(px(14.))
                .py(px(10.))
                .flex()
                .items_center()
                .justify_between()
                .gap(px(12.))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .child(components::status_dot(v_dot))
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
                                .child(art.title.clone()),
                        )
                        .child(components::subtle_pill(art.kind.label())),
                )
                .child(
                    div()
                        .flex_none()
                        .text_size(px(12.))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(components::accent_text())
                        .child("进入决策面 →"),
                ),
        )
}

pub fn render_chat_thread(
    ws: &MerakWorkspace,
    session: &BotSession,
    cx: &mut Context<MerakWorkspace>,
) -> Div {
    let bot = ws.state.bot(&session.bot_id).cloned();
    let proj = ws.state.project(&session.project_id).cloned();
    let bot_dot = bot
        .as_ref()
        .map(|b| components::bot_status_dot_color(b.status))
        .unwrap_or_else(components::positive_color);
    let model_name = bot.as_ref().map(|b| b.model.clone()).unwrap_or_default();

    let mut stream_inner = div()
        .max_w(px(760.))
        .w_full()
        .mx_auto()
        .px(px(28.))
        .py(px(22.))
        .flex()
        .flex_col()
        .gap(px(20.));

    for msg in &session.messages {
        let linked_art = msg
            .linked_artifact_id
            .as_deref()
            .and_then(|aid| ws.state.artifact(aid))
            .cloned();

        match msg.role {
            ChatRole::User => {
                stream_inner = stream_inner.child(
                    div()
                        .w_full()
                        .flex()
                        .justify_end()
                        .child(
                            div()
                                .max_w(px(560.))
                                .rounded(px(16.))
                                .px(px(16.))
                                .py(px(11.))
                                .bg(user_bubble_bg())
                                .border_1()
                                .border_color(Theme::line_divider())
                                .flex()
                                .flex_col()
                                .gap(px(4.))
                                .child(
                                    div()
                                        .text_size(px(14.))
                                        .line_height(px(22.))
                                        .text_color(Theme::text())
                                        .child(ui::ui_para(msg.body.clone())),
                                )
                                .child(
                                    div()
                                        .flex()
                                        .justify_end()
                                        .text_size(px(11.))
                                        .text_color(components::text_muted())
                                        .child(msg.timestamp.clone()),
                                ),
                        ),
                );
            }
            ChatRole::Bot | ChatRole::System => {
                let mut block = div()
                    .w_full()
                    .flex()
                    .flex_col()
                    .gap(px(9.))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(8.))
                            .child(components::status_dot(bot_dot))
                            .child(
                                div()
                                    .text_size(px(13.))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(Theme::text())
                                    .child(msg.author.clone()),
                            )
                            .when(!model_name.is_empty(), |d| {
                                d.child(
                                    div()
                                        .px(px(6.))
                                        .py(px(1.))
                                        .rounded(px(5.))
                                        .bg(seg_track_bg())
                                        .font_family(theme::MONO_FONT)
                                        .text_size(px(10.5))
                                        .text_color(components::text_muted())
                                        .child(model_name.clone()),
                                )
                            })
                            .child(
                                div()
                                    .text_size(px(11.5))
                                    .text_color(components::text_muted())
                                    .child(msg.timestamp.clone()),
                            ),
                    );

                if !msg.tool_calls.is_empty() {
                    let mut tc_col = div().flex().flex_col().gap(px(5.));
                    for tc in &msg.tool_calls {
                        let tcid = tc.id.clone();
                        let expanded = ws.state.expanded_tool_call_ids.contains(&tcid);
                        let dot_col = if tc.passed {
                            components::positive_color()
                        } else {
                            components::negative_color()
                        };
                        tc_col = tc_col.child(
                            div()
                                .flex()
                                .flex_col()
                                .gap(px(4.))
                                .child(
                                    div()
                                        .id(SharedString::from(format!("chat-tc-{tcid}")))
                                        .px(px(10.))
                                        .py(px(5.))
                                        .rounded(px(8.))
                                        .border_1()
                                        .border_color(Theme::line_divider())
                                        .bg(seg_track_bg())
                                        .cursor_pointer()
                                        .hover(|s| s.border_color(Theme::line_border()))
                                        .on_click(cx.listener(move |this, _, _, cx| {
                                            if !this.state.expanded_tool_call_ids.insert(tcid.clone()) {
                                                this.state.expanded_tool_call_ids.remove(&tcid);
                                            }
                                            cx.notify();
                                        }))
                                        .flex()
                                        .items_center()
                                        .justify_between()
                                        .gap(px(8.))
                                        .child(
                                            div()
                                                .flex_1()
                                                .min_w_0()
                                                .flex()
                                                .items_center()
                                                .gap(px(7.))
                                                .child(components::status_dot(dot_col))
                                                .child(
                                                    div()
                                                        .font_family(theme::MONO_FONT)
                                                        .text_size(px(11.5))
                                                        .text_color(Theme::text())
                                                        .overflow_hidden()
                                                        .whitespace_nowrap()
                                                        .text_ellipsis()
                                                        .child(tc.label.clone()),
                                                ),
                                        )
                                        .child(ui::icon(
                                            if expanded { "chevron-down" } else { "chevron-right" },
                                            12.,
                                            components::text_muted(),
                                        )),
                                )
                                .when(expanded, |d| {
                                    d.child(
                                        div()
                                            .px(px(11.))
                                            .py(px(8.))
                                            .rounded(px(8.))
                                            .bg(Theme::code_bg())
                                            .border_1()
                                            .border_color(Theme::code_border())
                                            .font_family(theme::MONO_FONT)
                                            .text_size(px(11.5))
                                            .text_color(Theme::code_text())
                                            .child(tc.detail.clone()),
                                    )
                                }),
                        );
                    }
                    block = block.child(tc_col);
                }

                block = block
                    .child(
                        div()
                            .text_size(px(14.))
                            .line_height(px(22.5))
                            .text_color(Theme::text())
                            .child(ui::ui_para(msg.body.clone())),
                    )
                    .when_some(linked_art, |d, art| d.child(render_embedded_artifact(ws, &art, cx)));

                stream_inner = stream_inner.child(block);
            }
        }
    }

    let can_send = !ws.chat_input.read(cx).text.trim().is_empty();
    let git_meta = project_git_summary(ws, &session.project_id);

    let composer = div()
        .max_w(px(760.))
        .w_full()
        .mx_auto()
        .px(px(28.))
        .pb(px(18.))
        .pt(px(8.))
        .child(
            div()
                .w_full()
                .rounded(px(18.))
                .bg(card_bg())
                .border_1()
                .border_color(card_border())
                .shadow(theme::shadow_panel())
                .flex()
                .flex_col()
                .child(
                    div()
                        .id("chat-input-area")
                        .px(px(16.))
                        .pt(px(13.))
                        .pb(px(8.))
                        .min_h(px(48.))
                        .cursor_text()
                        .on_mouse_down(MouseButton::Left, cx.listener(|this, _, window, cx| {
                            this.chat_input.focus_handle(cx).focus(window, cx);
                            cx.notify();
                        }))
                        .child(ws.chat_input.clone()),
                )
                .child(
                    div()
                        .px(px(12.))
                        .pb(px(10.))
                        .pt(px(2.))
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(8.))
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .flex_wrap()
                                .gap(px(6.))
                                .when_some(proj, |d, p| {
                                    let pid = p.id.clone();
                                    let p_dot = theme::c(p.color_hex);
                                    d.child(
                                        div()
                                            .id(SharedString::from(format!("chat-proj-chip-{pid}")))
                                            .h(px(26.))
                                            .px(px(9.))
                                            .rounded_full()
                                            .bg(seg_track_bg())
                                            .cursor_pointer()
                                            .hover(|s| s.bg(Theme::fill_hover_strong()))
                                            .flex()
                                            .items_center()
                                            .gap(px(6.))
                                            .on_click(cx.listener(move |this, _, window, cx| {
                                                this.open_project_repos(&pid, window, cx);
                                            }))
                                            .child(div().size(px(6.5)).rounded_full().bg(p_dot))
                                            .child(
                                                div()
                                                    .text_size(px(12.))
                                                    .text_color(Theme::text())
                                                    .child(p.name),
                                            )
                                            .when_some(git_meta, |d, (rname, branch, dirty)| {
                                                d.child(div().text_size(px(11.)).text_color(components::text_muted()).child("·"))
                                                    .child(ui::icon("git-branch", 11., components::text_secondary()))
                                                    .child(
                                                        div()
                                                            .font_family(theme::MONO_FONT)
                                                            .text_size(px(11.))
                                                            .text_color(components::text_secondary())
                                                            .child(format!("{rname}:{branch}")),
                                                    )
                                                    .when(dirty > 0, |d| {
                                                        d.child(
                                                            div()
                                                                .text_size(px(10.5))
                                                                .text_color(components::attention_color())
                                                                .child(format!("{dirty}M")),
                                                        )
                                                    })
                                            }),
                                    )
                                })
                                .child(
                                    div()
                                        .id("chat-promote-canvas")
                                        .h(px(26.))
                                        .px(px(9.))
                                        .rounded_full()
                                        .border_1()
                                        .border_color(Theme::line_divider())
                                        .cursor_pointer()
                                        .hover(|s| s.bg(Theme::fill_hover()))
                                        .on_click(cx.listener(|this, _, window, cx| {
                                            this.promote_active_session(ArtifactKind::DecisionCanvas, window, cx);
                                        }))
                                        .flex()
                                        .items_center()
                                        .gap(px(5.))
                                        .child(ui::icon("whiteboard", 12., components::accent_text()))
                                        .child(
                                            div()
                                                .text_size(px(12.))
                                                .text_color(components::text_secondary())
                                                .child("沉淀为白板"),
                                        ),
                                )
                                .child(
                                    div()
                                        .id("chat-promote-spec")
                                        .h(px(26.))
                                        .px(px(9.))
                                        .rounded_full()
                                        .border_1()
                                        .border_color(Theme::line_divider())
                                        .cursor_pointer()
                                        .hover(|s| s.bg(Theme::fill_hover()))
                                        .on_click(cx.listener(|this, _, window, cx| {
                                            this.promote_active_session(ArtifactKind::SpecDoc, window, cx);
                                        }))
                                        .flex()
                                        .items_center()
                                        .gap(px(5.))
                                        .child(ui::icon("file-text", 12., components::text_secondary()))
                                        .child(
                                            div()
                                                .text_size(px(12.))
                                                .text_color(components::text_secondary())
                                                .child("生成规格"),
                                        ),
                                ),
                        )
                        .child(
                            div()
                                .id("chat-send-btn")
                                .size(px(30.))
                                .rounded_full()
                                .flex()
                                .items_center()
                                .justify_center()
                                .when(can_send, |d| {
                                    d.bg(Theme::primary())
                                        .cursor_pointer()
                                        .hover(|s| s.opacity(0.9))
                                        .on_click(cx.listener(|this, _, window, cx| {
                                            this.submit_chat_message(window, cx);
                                        }))
                                })
                                .when(!can_send, |d| d.bg(Theme::fill_hover_strong()))
                                .child(ui::icon(
                                    "chevron-right",
                                    15.,
                                    if can_send { gpui::white() } else { components::text_muted() },
                                )),
                        ),
                ),
        );

    div()
        .flex_1()
        .min_h_0()
        .min_w_0()
        .flex()
        .flex_col()
        .child(
            div()
                .id(SharedString::from(format!("chat-scroll-{}", session.id)))
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .child(stream_inner),
        )
        .child(composer)
}
