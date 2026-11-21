use super::components;
use super::state::InboxFilter;
use super::MerakWorkspace;
use crate::theme::{self, craft, Theme};
use crate::ui;
use gpui::{prelude::FluentBuilder, *};
use merak_contracts::{Artifact, ArtifactKind, ClaimStatus, InboxItem, InboxKind, InboxStatus, VerifyJudge};
use std::time::Duration;

fn seg_track_bg() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0xff, 0xff, 0xff, 0.06)
    } else {
        theme::ca(craft::N1000, 0.045)
    }
}

fn active_card_bg() -> Hsla {
    if theme::dark() {
        theme::raised(Theme::bg_body())
    } else {
        theme::c(craft::N00)
    }
}

fn active_card_border() -> Hsla {
    if theme::dark() {
        theme::ca(craft::B400, 0.68)
    } else {
        theme::ca(craft::B500, 0.52)
    }
}

fn kind_icon(kind: InboxKind) -> &'static str {
    match kind {
        InboxKind::DecisionChoice | InboxKind::InlineComment => "whiteboard",
        InboxKind::VerifyVerdict | InboxKind::GapWaiver => "todo-check",
        InboxKind::GuardrailApproval => "alarm-clock",
        InboxKind::Capture => "file-text",
    }
}

fn gap_action_btn(id: SharedString, label: &'static str) -> Stateful<Div> {
    div()
        .id(id)
        .h(px(26.))
        .px(px(10.))
        .rounded(px(7.))
        .border_1()
        .border_color(Theme::line_border())
        .bg(Theme::bg_body())
        .flex()
        .items_center()
        .justify_center()
        .cursor_pointer()
        .text_size(px(12.))
        .text_color(Theme::text())
        .hover(|s| s.bg(Theme::fill_hover()))
        .child(label)
}

fn primary_verdict_label(item: &InboxItem, art: Option<&Artifact>) -> &'static str {
    if let Some(a) = art
        && a.kind == ArtifactKind::DecisionCanvas
        && !a.options.is_empty()
    {
        return "拍板定案";
    }
    if item.kind == InboxKind::VerifyVerdict {
        "验收通过"
    } else {
        "批准 · Ack"
    }
}

fn render_canvas_attachment(
    ws: &MerakWorkspace,
    art: &Artifact,
    cx: &mut Context<MerakWorkspace>,
) -> Div {
    let aid = art.id.clone();
    let thumb = ws.artifact_board_thumbs.get(&aid).cloned();
    let staged_opt = ws.state.staged_option_for(&aid);

    let preview: AnyElement = if let Some(board) = thumb {
        div()
            .id(SharedString::from(format!("mail-canvas-prev-{aid}")))
            .h(px(230.))
            .w_full()
            .overflow_hidden()
            .bg(Theme::bg_overlay())
            .cursor_pointer()
            .on_click(cx.listener({
                let aid = aid.clone();
                move |this, _, window, cx| {
                    this.open_artifact_in_decision_pane(&aid, window, cx);
                }
            }))
            .child(
                canvas(
                    |_, _, _| {},
                    move |bounds, _, window, cx| {
                        crate::board::render::paint_card(&board, bounds, window, cx);
                    },
                )
                .size_full(),
            )
            .into_any_element()
    } else {
        div()
            .id(SharedString::from(format!("mail-canvas-empty-{aid}")))
            .h(px(120.))
            .w_full()
            .bg(Theme::bg_overlay())
            .cursor_pointer()
            .flex()
            .items_center()
            .justify_center()
            .gap(px(8.))
            .on_click(cx.listener({
                let aid = aid.clone();
                move |this, _, window, cx| {
                    this.open_artifact_in_decision_pane(&aid, window, cx);
                }
            }))
            .child(ui::icon("whiteboard", 16., components::text_muted()))
            .child(
                div()
                    .text_size(px(12.5))
                    .text_color(components::text_secondary())
                    .child("点击展开完整决策白板"),
            )
            .into_any_element()
    };

    let mut card = div()
        .w_full()
        .rounded(px(16.))
        .border_1()
        .border_color(Theme::line_border())
        .bg(active_card_bg())
        .overflow_hidden()
        .flex()
        .flex_col()
        .child(preview);

    if !art.options.is_empty() {
        let mut opts = div()
            .p(px(12.))
            .border_t_1()
            .border_color(Theme::line_divider())
            .flex()
            .flex_col()
            .gap(px(6.));
        for opt in &art.options {
            let oid = opt.id.clone();
            let aid_c = aid.clone();
            let active = staged_opt.as_deref() == Some(oid.as_str());
            opts = opts.child(
                div()
                    .id(SharedString::from(format!("mail-opt-{aid}-{oid}")))
                    .px(px(12.))
                    .py(px(9.))
                    .rounded(px(10.))
                    .cursor_pointer()
                    .border_1()
                    .border_color(if active { active_card_border() } else { Theme::line_divider() })
                    .when(active, |d| d.bg(theme::ca(craft::B500, 0.06)))
                    .when(!active, |d| d.hover(|s| s.bg(Theme::fill_hover())))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.state.stage_canvas_option(&aid_c, &oid);
                        cx.notify();
                    }))
                    .flex()
                    .items_start()
                    .gap(px(10.))
                    .child(
                        div()
                            .mt(px(3.))
                            .size(px(13.))
                            .rounded_full()
                            .border_1()
                            .border_color(if active { Theme::primary() } else { Theme::todo_box() })
                            .flex()
                            .items_center()
                            .justify_center()
                            .flex_none()
                            .when(active, |d| {
                                d.child(div().size(px(7.)).rounded_full().bg(Theme::primary()))
                            }),
                    )
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .flex()
                            .flex_col()
                            .gap(px(2.))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(6.))
                                    .child(
                                        div()
                                            .text_size(px(13.))
                                            .font_weight(if active { FontWeight::SEMIBOLD } else { FontWeight::MEDIUM })
                                            .text_color(Theme::text())
                                            .child(opt.label.clone()),
                                    )
                                    .when(opt.recommended, |d| {
                                        d.child(
                                            div()
                                                .px(px(6.))
                                                .py(px(1.))
                                                .rounded(px(5.))
                                                .bg(theme::ca(craft::B500, 0.12))
                                                .text_size(px(10.5))
                                                .font_weight(FontWeight::MEDIUM)
                                                .text_color(components::accent_text())
                                                .child("推荐"),
                                        )
                                    }),
                            )
                            .child(
                                div()
                                    .text_size(px(12.))
                                    .text_color(components::text_secondary())
                                    .child(ui::ui_para(opt.summary.clone())),
                            ),
                    ),
            );
        }
        card = card.child(opts);
    }
    card
}

fn render_verify_attachment(
    art: &Artifact,
    cx: &mut Context<MerakWorkspace>,
) -> Option<Div> {
    let rep = art.verify_report.as_ref()?;
    let aid = art.id.clone();
    let agent_ok = rep
        .claims
        .iter()
        .filter(|c| c.judge == VerifyJudge::Agent && c.status == ClaimStatus::Verified)
        .count();
    let agent_total = rep.claims.iter().filter(|c| c.judge == VerifyJudge::Agent).count();
    let human_claims: Vec<_> = rep
        .claims
        .iter()
        .filter(|c| c.judge == VerifyJudge::Human)
        .cloned()
        .collect();
    let open_gaps: Vec<_> = rep.gaps.iter().filter(|g| !g.waived).cloned().collect();

    let ratio = if agent_total > 0 {
        (agent_ok as f32 / agent_total as f32).clamp(0.1, 1.0)
    } else {
        1.0
    };

    let mut card = div()
        .w_full()
        .rounded(px(16.))
        .border_1()
        .border_color(Theme::line_border())
        .bg(active_card_bg())
        .p(px(16.))
        .flex()
        .flex_col()
        .gap(px(12.))
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(6.))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(7.))
                                .child(components::status_dot(components::positive_color()))
                                .child(
                                    div()
                                        .text_size(px(12.5))
                                        .font_weight(FontWeight::MEDIUM)
                                        .text_color(Theme::text())
                                        .child(format!("机器自证 {agent_ok}/{agent_total} 通过")),
                                ),
                        )
                        .child(
                            div()
                                .text_size(px(11.5))
                                .text_color(components::text_muted())
                                .child(format!("人类裁决 {} 项 · 未覆盖 {} 项", human_claims.len(), open_gaps.len())),
                        ),
                )
                .child(
                    div()
                        .h(px(4.))
                        .w_full()
                        .rounded_full()
                        .bg(Theme::fill_hover_strong())
                        .overflow_hidden()
                        .child(
                            div()
                                .h_full()
                                .w(relative(ratio))
                                .rounded_full()
                                .bg(components::positive_color()),
                        ),
                ),
        );

    for claim in human_claims {
        let cid = claim.id.clone();
        let aid_p = aid.clone();
        let aid_r = aid.clone();
        let passed = claim.status == ClaimStatus::Passed;
        let rejected = claim.status == ClaimStatus::Rejected;
        card = card.child(
            div()
                .pt(px(10.))
                .border_t_1()
                .border_color(Theme::line_divider())
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
                        .child(components::status_dot(components::claim_dot_color(claim.status)))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .text_size(px(13.))
                                .text_color(Theme::text())
                                .child(ui::ui_para(claim.title)),
                        ),
                )
                .child(
                    div()
                        .flex_none()
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .child(
                            components::text_filter(
                                SharedString::from(format!("mail-rej-{cid}")),
                                "Reject",
                                rejected,
                            )
                            .on_click(cx.listener({
                                let cid = cid.clone();
                                move |this, _, window, cx| {
                                    if let Some(msg) = this.state.verdict_human_claim(&aid_r, &cid, false) {
                                        this.show_toast(ui::ToastKind::Info, msg, window, cx);
                                    }
                                }
                            })),
                        )
                        .child(
                            components::text_filter(
                                SharedString::from(format!("mail-pass-{cid}")),
                                "Pass",
                                passed,
                            )
                            .on_click(cx.listener(move |this, _, window, cx| {
                                if let Some(msg) = this.state.verdict_human_claim(&aid_p, &cid, true) {
                                    this.show_toast(ui::ToastKind::Success, msg, window, cx);
                                }
                            })),
                        ),
                ),
        );
    }

    for gap in open_gaps {
        let gid = gap.id.clone();
        let aid_w = aid.clone();
        let aid_t = aid.clone();
        card = card.child(
            div()
                .pt(px(10.))
                .border_t_1()
                .border_color(Theme::line_divider())
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
                        .child(components::status_dot(components::attention_color()))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .text_size(px(12.5))
                                .text_color(components::text_secondary())
                                .child(ui::ui_para(format!("Gap：{}", gap.title))),
                        ),
                )
                .child(
                    div()
                        .flex_none()
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .child(
                            gap_action_btn(
                                SharedString::from(format!("mail-waive-{gid}")),
                                "豁免",
                            )
                            .on_click(cx.listener({
                                let gid = gid.clone();
                                move |this, _, window, cx| {
                                    if let Some(msg) = this.state.waive_verify_gap(&aid_w, &gid) {
                                        this.show_toast(ui::ToastKind::Info, msg, window, cx);
                                    }
                                }
                            })),
                        )
                        .child(
                            gap_action_btn(
                                SharedString::from(format!("mail-gap-task-{gid}")),
                                "转补测 Task",
                            )
                            .on_click(cx.listener(move |this, _, window, cx| {
                                if let Some(msg) = this.state.spawn_task_from_gap(&aid_t, &gid) {
                                    this.show_toast(ui::ToastKind::Success, msg, window, cx);
                                }
                            })),
                        ),
                ),
        );
    }

    Some(card)
}

pub fn render_inbox(ws: &MerakWorkspace, cx: &mut Context<MerakWorkspace>) -> Div {
    let items = ws.state.filtered_inbox();
    let selected_item = items
        .iter()
        .find(|i| i.id == ws.state.selected_inbox_id)
        .or_else(|| items.first())
        .copied()
        .cloned();
    let active_id = selected_item.as_ref().map(|i| i.id.clone()).unwrap_or_default();

    let mut filter_track = div()
        .p(px(3.))
        .rounded(px(10.))
        .bg(seg_track_bg())
        .flex()
        .items_center()
        .gap(px(2.));
    for filter in InboxFilter::ALL {
        let active = ws.state.inbox_filter == filter;
        filter_track = filter_track.child(
            div()
                .id(SharedString::from(format!("inb-filter-{}", filter.label())))
                .flex_1()
                .h(px(26.))
                .rounded(px(7.5))
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .text_size(px(12.))
                .font_weight(if active { FontWeight::MEDIUM } else { FontWeight::NORMAL })
                .when(active, |d| {
                    d.bg(active_card_bg())
                        .shadow(theme::shadow_button())
                        .text_color(Theme::text())
                })
                .when(!active, |d| {
                    d.text_color(components::text_secondary())
                        .hover(|s| s.text_color(Theme::text()))
                })
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state.inbox_filter = filter;
                    this.state.ensure_valid_inbox_selection();
                    cx.notify();
                }))
                .child(filter.label()),
        );
    }

    let mut list_body = div()
        .px(px(10.))
        .py(px(10.))
        .flex()
        .flex_col()
        .gap(px(4.));

    if items.is_empty() {
        list_body = list_body.child(
            div()
                .px(px(16.))
                .py(px(56.))
                .flex()
                .flex_col()
                .items_center()
                .gap(px(8.))
                .child(ui::icon("check", 18., components::text_muted()))
                .child(
                    div()
                        .text_size(px(13.))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(Theme::text())
                        .child("全部已批阅"),
                )
                .child(
                    div()
                        .text_size(px(12.))
                        .text_color(components::text_secondary())
                        .child(ui::ui_para("绿灯自证与静默巡检留在各自项目中，需要拍板时才会寄来新信。")),
                ),
        );
    } else {
        for item in items {
            let item_id = item.id.clone();
            let selected = item_id == active_id;
            let pending = item.status.is_pending();
            let dot_col = components::inbox_status_dot_color(item.status);
            let sender = ws
                .state
                .bot(&item.bot_id)
                .map(|b| b.name.clone())
                .unwrap_or_else(|| item.source_label.clone());
            let proj_dot = ws
                .state
                .project(&item.project_id)
                .map(|p| theme::c(p.color_hex))
                .unwrap_or_else(components::text_muted);

            list_body = list_body.child(
                div()
                    .id(SharedString::from(format!("inbox-row-{item_id}")))
                    .rounded(px(12.))
                    .px(px(12.))
                    .py(px(11.))
                    .cursor_pointer()
                    .border(px(1.5))
                    .border_color(if selected {
                        active_card_border()
                    } else {
                        transparent_black()
                    })
                    .when(selected, |d| {
                        d.bg(active_card_bg()).shadow(theme::shadow_button())
                    })
                    .when(!selected, |d| d.hover(|s| s.bg(Theme::fill_hover())))
                    .on_click(cx.listener({
                        let item_id = item_id.clone();
                        move |this, _, window, cx| {
                            this.select_inbox_item(&item_id, window, cx);
                        }
                    }))
                    .flex()
                    .flex_col()
                    .gap(px(4.))
                    .child(
                        div()
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
                                            .flex_1()
                                            .min_w_0()
                                            .text_size(px(12.5))
                                            .font_weight(if pending { FontWeight::SEMIBOLD } else { FontWeight::MEDIUM })
                                            .text_color(if pending { Theme::text() } else { components::text_secondary() })
                                            .overflow_hidden()
                                            .whitespace_nowrap()
                                            .text_ellipsis()
                                            .child(sender),
                                    ),
                            )
                            .child(
                                div()
                                    .flex_none()
                                    .text_size(px(11.))
                                    .text_color(components::text_muted())
                                    .child(item.timestamp.clone()),
                            ),
                    )
                    .child(
                        div()
                            .pl(px(13.))
                            .text_size(px(13.))
                            .font_weight(if pending { FontWeight::SEMIBOLD } else { FontWeight::NORMAL })
                            .text_color(Theme::text())
                            .overflow_hidden()
                            .whitespace_nowrap()
                            .text_ellipsis()
                            .child(item.title.clone()),
                    )
                    .child(
                        div()
                            .pl(px(13.))
                            .flex()
                            .items_center()
                            .justify_between()
                            .gap(px(10.))
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .text_size(px(12.))
                                    .text_color(components::text_secondary())
                                    .overflow_hidden()
                                    .whitespace_nowrap()
                                    .text_ellipsis()
                                    .child(item.summary.clone()),
                            )
                            .child(
                                div()
                                    .flex_none()
                                    .flex()
                                    .items_center()
                                    .gap(px(6.))
                                    .child(div().size(px(6.)).rounded_full().bg(proj_dot))
                                    .child(ui::icon(kind_icon(item.kind), 12., components::text_muted())),
                            ),
                    ),
            );
        }
    }

    let left_col = div()
        .w(px(336.))
        .flex_none()
        .h_full()
        .border_r_1()
        .border_color(Theme::line_divider())
        .flex()
        .flex_col()
        .child(
            div()
                .px(px(16.))
                .pt(px(18.))
                .pb(px(12.))
                .border_b_1()
                .border_color(Theme::line_divider())
                .flex()
                .flex_col()
                .gap(px(10.))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(
                            div()
                                .text_size(px(18.))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(Theme::text())
                                .child("Inbox"),
                        )
                        .child(
                            div()
                                .font_family(theme::MONO_FONT)
                                .text_size(px(11.))
                                .text_color(components::text_muted())
                                .child("J / K"),
                        ),
                )
                .child(filter_track),
        )
        .child(
            div()
                .id("inbox-list-scroll")
                .flex_1()
                .min_h_0()
                .h_full()
                .overflow_y_scroll()
                .child(list_body),
        );

    let right_pane: AnyElement = if let Some(item) = selected_item {
        let item_id = item.id.clone();
        let pending = item.status.is_pending();
        let proj = ws.state.project(&item.project_id).cloned();
        let bot = ws.state.bot(&item.bot_id).cloned();
        let linked_art = item
            .artifact_id
            .as_deref()
            .and_then(|aid| ws.state.artifact(aid))
            .cloned();

        let primary_label = primary_verdict_label(&item, linked_art.as_ref());
        let reply_non_empty = !ws.mail_reply_input.read(cx).text.trim().is_empty();

        let toolbar = div()
            .h(px(48.))
            .flex_none()
            .px(px(24.))
            .border_b_1()
            .border_color(Theme::line_divider())
            .flex()
            .items_center()
            .justify_between()
            .gap(px(12.))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .when_some(proj.clone(), |d, p| {
                        let pid = p.id.clone();
                        let dot = theme::c(p.color_hex);
                        d.child(
                            div()
                                .id(SharedString::from(format!("mail-proj-pill-{pid}")))
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
                                    this.open_project_view(&pid, window, cx);
                                }))
                                .child(div().size(px(6.5)).rounded_full().bg(dot))
                                .child(
                                    div()
                                        .text_size(px(12.))
                                        .font_weight(FontWeight::MEDIUM)
                                        .text_color(Theme::text())
                                        .child(p.name),
                                ),
                        )
                    })
                    .child(
                        div()
                            .text_size(px(12.))
                            .text_color(components::text_muted())
                            .child(item.kind.label()),
                    ),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .when(item.artifact_id.is_some(), |d| {
                        let iid = item_id.clone();
                        d.child(
                            ui::secondary_button("mail-open-focus", "全屏决策面").on_click(cx.listener(
                                move |this, _, window, cx| {
                                    this.open_inbox_decision(&iid, window, cx);
                                },
                            )),
                        )
                    })
                    .when(pending, |d| {
                        let iid = item_id.clone();
                        d.child(
                            ui::secondary_button("mail-archive", "归档").on_click(cx.listener(
                                move |this, _, window, cx| {
                                    this.decide_inbox(&iid, InboxStatus::Archived, None, window, cx);
                                },
                            )),
                        )
                    }),
            );

        let from_name = bot
            .as_ref()
            .map(|b| b.name.clone())
            .unwrap_or_else(|| item.source_label.clone());
        let from_meta = if let Some(b) = &bot {
            format!("{} · {}", b.role, item.timestamp)
        } else {
            item.timestamp.clone()
        };
        let from_dot = bot
            .as_ref()
            .map(|b| components::bot_status_dot_color(b.status))
            .unwrap_or_else(|| components::inbox_status_dot_color(item.status));

        let attachment_card: Option<Div> = linked_art.as_ref().and_then(|art| match art.kind {
            ArtifactKind::DecisionCanvas => Some(render_canvas_attachment(ws, art, cx)),
            ArtifactKind::VerifyReport => render_verify_attachment(art, cx),
            _ => None,
        });

        let letter_inner = div()
            .max_w(px(740.))
            .w_full()
            .mx_auto()
            .px(px(32.))
            .py(px(26.))
            .flex()
            .flex_col()
            .gap(px(20.))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(8.))
                    .child(
                        div()
                            .text_size(px(20.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .line_height(px(28.))
                            .text_color(Theme::text())
                            .child(ui::ui_para(item.title.clone())),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .gap(px(10.))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(7.))
                                    .child(components::status_dot(from_dot))
                                    .child(
                                        div()
                                            .text_size(px(12.5))
                                            .font_weight(FontWeight::MEDIUM)
                                            .text_color(Theme::text())
                                            .child(from_name),
                                    )
                                    .child(
                                        div()
                                            .text_size(px(12.))
                                            .text_color(components::text_secondary())
                                            .child(from_meta),
                                    ),
                            )
                            .when(!pending, |d| {
                                d.child(components::subtle_pill(item.status.label()))
                            }),
                    ),
            )
            .child(
                div()
                    .text_size(px(14.))
                    .line_height(px(22.))
                    .text_color(Theme::text())
                    .child(ui::ui_para(item.summary.clone())),
            )
            .children(attachment_card)
            .when_some(item.command_preview.clone(), |d, cmd| {
                d.child(
                    div()
                        .p(px(12.))
                        .rounded(px(10.))
                        .bg(Theme::code_bg())
                        .border_1()
                        .border_color(Theme::code_border())
                        .font_family(theme::MONO_FONT)
                        .text_size(px(12.))
                        .text_color(Theme::code_text())
                        .child(cmd),
                )
            })
            .when_some(item.reply_text.clone(), |d, reply| {
                d.child(
                    div()
                        .p(px(14.))
                        .rounded(px(12.))
                        .border_1()
                        .border_color(Theme::line_border())
                        .bg(seg_track_bg())
                        .flex()
                        .flex_col()
                        .gap(px(4.))
                        .child(
                            div()
                                .text_size(px(11.5))
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(components::text_secondary())
                                .child("批注回执"),
                        )
                        .child(
                            div()
                                .text_size(px(13.))
                                .line_height(px(20.))
                                .text_color(Theme::text())
                                .child(ui::ui_para(reply)),
                        ),
                )
            });

        let reply_bar = div()
            .flex_none()
            .px(px(24.))
            .py(px(14.))
            .border_t_1()
            .border_color(Theme::line_divider())
            .bg(Theme::bg_body())
            .child(
                div()
                    .max_w(px(740.))
                    .w_full()
                    .mx_auto()
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .child(
                        div()
                            .id("mail-reply-box")
                            .flex_1()
                            .min_w_0()
                            .h(px(36.))
                            .px(px(14.))
                            .rounded_full()
                            .border_1()
                            .border_color(Theme::line_sheet())
                            .bg(Theme::bg_body())
                            .flex()
                            .items_center()
                            .on_mouse_down(MouseButton::Left, cx.listener(|this, _, window, cx| {
                                this.mail_reply_input.focus_handle(cx).focus(window, cx);
                            }))
                            .child(ws.mail_reply_input.clone()),
                    )
                    .when(pending, |d| {
                        let iid_rej = item_id.clone();
                        let iid_ok = item_id.clone();
                        d.child(
                            ui::secondary_button("mail-reject", "退回").on_click(cx.listener(
                                move |this, _, window, cx| {
                                    this.submit_inbox_verdict(&iid_rej, false, window, cx);
                                },
                            )),
                        )
                        .child(
                            ui::primary_button("mail-approve", primary_label).on_click(cx.listener(
                                move |this, _, window, cx| {
                                    this.submit_inbox_verdict(&iid_ok, true, window, cx);
                                },
                            )),
                        )
                    })
                    .when(!pending, |d| {
                        d.child(
                            ui::secondary_button("mail-send-reply", "补充回执")
                                .when(reply_non_empty, |b| {
                                    b.on_click(cx.listener(|this, _, window, cx| {
                                        this.submit_inbox_reply_only(window, cx);
                                    }))
                                }),
                        )
                    }),
            );

        let letter_col = div()
            .relative()
            .flex_1()
            .min_w_0()
            .h_full()
            .flex()
            .flex_col()
            .child(toolbar)
            .child(
                div()
                    .id("inbox-letter-scroll")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .child(letter_inner),
            )
            .child(reply_bar);

        if ws.mail_epoch > 0 && !cx.reduce_motion() {
            letter_col
                .with_animation(
                    ("mail-letter", ws.mail_epoch),
                    Animation::new(Duration::from_millis(160)).with_easing(ease_out_quint()),
                    |el, t| el.top(px((1.0 - t) * 4.0)).opacity(0.3 + 0.7 * t),
                )
                .into_any_element()
        } else {
            letter_col.into_any_element()
        }
    } else {
        div()
            .flex_1()
            .min_w_0()
            .h_full()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap(px(12.))
            .child(
                div()
                    .size(px(44.))
                    .rounded_full()
                    .bg(seg_track_bg())
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(ui::icon("check", 20., components::positive_color())),
            )
            .child(
                div()
                    .text_size(px(16.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(Theme::text())
                    .child("收件箱已清空"),
            )
            .child(
                div()
                    .text_size(px(13.))
                    .text_color(components::text_secondary())
                    .child("没有待裁决的新信，Bot 们正在安静推进中。"),
            )
            .into_any_element()
    };

    div()
        .size_full()
        .min_h_0()
        .flex()
        .child(left_col)
        .child(right_pane)
}
