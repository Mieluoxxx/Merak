use super::components;
use super::MerakWorkspace;
use crate::theme::{self, craft, Theme};
use crate::ui;
use gpui::{prelude::FluentBuilder, *};
use merak_contracts::{Artifact, ClaimStatus, DecisionPaneTab, DiffLineKind, VerifyJudge};
use std::time::Duration;

pub fn render_decision_pane(
    ws: &mut MerakWorkspace,
    window: &mut Window,
    cx: &mut Context<MerakWorkspace>,
) -> Div {
    let artifact_id = ws.state.selected_artifact_id.clone();
    let Some(art) = ws.state.artifact(&artifact_id).cloned() else {
        return div()
            .flex_1()
            .h_full()
            .flex()
            .items_center()
            .justify_center()
            .child(div().text_size(px(13.)).text_color(components::text_secondary()).child("选择一个产物开始"));
    };

    let active_tab = ws.state.decision_tab;
    let main_surface: AnyElement = match active_tab {
        DecisionPaneTab::Canvas => render_canvas_surface(ws, &art, window, cx),
        DecisionPaneTab::Verify => render_verify_surface(ws, &art, cx),
        DecisionPaneTab::SpecDoc => {
            let editor = ws.ensure_artifact_editor(&artifact_id, window, cx);
            div().size_full().min_h_0().flex().child(editor).into_any_element()
        }
        DecisionPaneTab::Table => {
            let table = ws.ensure_tasks_table(window, cx);
            div().size_full().min_h_0().flex().child(table).into_any_element()
        }
        DecisionPaneTab::Diff => render_diff_surface(ws),
        DecisionPaneTab::Comments => render_comments_list_body(ws, &art, cx),
    };

    let drawer = components::sliding_right_drawer(
        ws.comments_drawer_anim.value(),
        320.,
        render_comments_drawer(ws, &art, cx),
    );

    div()
        .flex_1()
        .min_w_0()
        .h_full()
        .flex()
        .child(div().flex_1().min_w_0().h_full().relative().child(main_surface))
        .children(drawer)
}

fn render_canvas_surface(
    ws: &mut MerakWorkspace,
    art: &Artifact,
    window: &mut Window,
    cx: &mut Context<MerakWorkspace>,
) -> AnyElement {
    let aid = art.id.clone();
    let board = ws.ensure_artifact_board(&aid, window, cx);

    let floating_dock = (!art.options.is_empty()).then(|| {
        let staged_id = ws.state.staged_option_for(&aid);
        let already_settled = art
            .options
            .iter()
            .any(|o| o.chosen && Some(o.id.as_str()) == staged_id.as_deref());

        let mut opt_row = div().flex().items_center().gap(px(4.));
        for opt in &art.options {
            let oid = opt.id.clone();
            let aid_o = aid.clone();
            let is_staged = staged_id.as_deref() == Some(oid.as_str());
            opt_row = opt_row.child(
                div()
                    .id(SharedString::from(format!("dopt-{aid_o}-{oid}")))
                    .h(px(30.))
                    .px(px(10.))
                    .rounded(px(9.))
                    .cursor_pointer()
                    .when(is_staged, |d| d.bg(theme::ca(craft::N1000, 0.08)))
                    .when(!is_staged, |d| d.hover(|s| s.bg(Theme::fill_hover())))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.state.stage_canvas_option(&aid_o, &oid);
                        cx.notify();
                    }))
                    .flex()
                    .items_center()
                    .gap(px(7.))
                    .child(
                        div()
                            .size(px(12.))
                            .rounded_full()
                            .border_1()
                            .border_color(if is_staged {
                                Theme::primary()
                            } else {
                                Theme::line_sheet()
                            })
                            .flex()
                            .items_center()
                            .justify_center()
                            .when(is_staged, |d| {
                                d.child(div().size(px(6.)).rounded_full().bg(Theme::primary()))
                            }),
                    )
                    .child(
                        div()
                            .text_size(px(12.5))
                            .font_weight(if is_staged { FontWeight::MEDIUM } else { FontWeight::NORMAL })
                            .text_color(if is_staged { Theme::text() } else { components::text_secondary() })
                            .whitespace_nowrap()
                            .child(opt.label.clone()),
                    )
                    .when(opt.recommended, |d| {
                        d.child(
                            div()
                                .text_size(px(10.5))
                                .text_color(components::text_muted())
                                .child("推荐"),
                        )
                    }),
            );
        }

        let aid_commit = aid.clone();
        let staged_commit = staged_id.clone();
        let submit_el: AnyElement = if already_settled {
            div()
                .h(px(30.))
                .px(px(10.))
                .flex()
                .items_center()
                .gap(px(6.))
                .child(components::status_dot(components::positive_color()))
                .child(
                    div()
                        .text_size(px(12.))
                        .text_color(components::text_secondary())
                        .whitespace_nowrap()
                        .child("已定案"),
                )
                .into_any_element()
        } else {
            div()
                .id("ryugi-submit-decision")
                .h(px(30.))
                .px(px(14.))
                .rounded(px(9.))
                .bg(Theme::primary())
                .hover(|s| s.opacity(0.92))
                .cursor_pointer()
                .flex()
                .items_center()
                .text_size(px(12.5))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(gpui::white())
                .whitespace_nowrap()
                .on_click(cx.listener(move |this, _, window, cx| {
                    if let Some(oid) = &staged_commit
                        && let Some(msg) = this.state.choose_canvas_option(&aid_commit, oid)
                    {
                        this.show_toast(ui::ToastKind::Success, msg, window, cx);
                    }
                }))
                .child("拍板定案")
                .into_any_element()
        };

        let aid_dock = aid.clone();
        let dock_wrap = div()
            .absolute()
            .bottom(px(16.))
            .left_0()
            .right_0()
            .flex()
            .justify_center()
            .child(
                div()
                    .id("ryugi-decision-dock")
                    .occlude()
                    .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                    .on_mouse_down(MouseButton::Right, |_, _, cx| cx.stop_propagation())
                    .on_scroll(|_, _, cx| cx.stop_propagation())
                    .px(px(10.))
                    .py(px(6.))
                    .rounded(px(14.))
                    .bg(theme::raised(Theme::bg_body()))
                    .border_1()
                    .border_color(Theme::line_border())
                    .shadow(theme::shadow_menu())
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .child(opt_row)
                    .child(div().w(px(1.)).h(px(18.)).bg(Theme::line_divider()))
                    .child(submit_el),
            );
        if cx.reduce_motion() {
            dock_wrap.into_any_element()
        } else {
            dock_wrap
                .with_animation(
                    SharedString::from(format!("dock-enter-{aid_dock}")),
                    Animation::new(Duration::from_millis(200)).with_easing(ease_out_quint()),
                    |el, t| el.bottom(px(6. + 10. * t)).opacity(t),
                )
                .into_any_element()
        }
    });

    div()
        .size_full()
        .relative()
        .child(board)
        .children(floating_dock)
        .into_any_element()
}

fn render_verify_surface(
    ws: &MerakWorkspace,
    art: &Artifact,
    cx: &mut Context<MerakWorkspace>,
) -> AnyElement {
    let target_aid = if art.verify_report.is_some() {
        Some(art.id.clone())
    } else {
        ws.state
            .task(&ws.state.selected_task_id)
            .and_then(|t| t.verify_artifact_id.clone())
            .or_else(|| {
                ws.state
                    .snapshot
                    .artifacts
                    .iter()
                    .find(|a| a.project_id == art.project_id && a.verify_report.is_some())
                    .map(|a| a.id.clone())
            })
    };

    let target_art = target_aid.as_deref().and_then(|id| ws.state.artifact(id)).cloned();
    let Some(vart) = target_art else {
        return div()
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .child(div().text_size(px(13.)).text_color(components::text_secondary()).child("暂无验收报告"))
            .into_any_element();
    };
    let Some(rep) = vart.verify_report else {
        return div()
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .child(div().text_size(px(13.)).text_color(components::text_secondary()).child("暂无验收报告"))
            .into_any_element();
    };

    let vid = vart.id.clone();

    let mut agent_list = div().flex().flex_col();
    for clm in rep.claims.iter().filter(|c| c.judge == VerifyJudge::Agent) {
        let cid = clm.id.clone();
        let expanded = ws.state.expanded_claim_ids.contains(&cid);
        let dot_col = components::claim_dot_color(clm.status);
        agent_list = agent_list.child(
            div()
                .id(SharedString::from(format!("aclm-{cid}")))
                .py(px(12.))
                .border_b_1()
                .border_color(Theme::line_divider())
                .cursor_pointer()
                .hover(|s| s.bg(Theme::fill_hover()))
                .on_click(cx.listener(move |this, _, _, cx| {
                    if !this.state.expanded_claim_ids.remove(&cid) {
                        this.state.expanded_claim_ids.insert(cid.clone());
                    }
                    cx.notify();
                }))
                .px(px(10.))
                .rounded(px(8.))
                .flex()
                .flex_col()
                .gap(px(6.))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(10.))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .flex()
                                .items_center()
                                .gap(px(8.))
                                .child(components::status_dot(dot_col))
                                .child(
                                    div()
                                        .text_size(px(13.5))
                                        .font_weight(FontWeight::MEDIUM)
                                        .text_color(Theme::text())
                                        .child(ui::ui_para(clm.title.clone())),
                                ),
                        )
                        .child(
                            div()
                                .flex_none()
                                .text_size(px(11.5))
                                .text_color(components::text_muted())
                                .child(if expanded { "收起输出" } else { "查看输出" }),
                        ),
                )
                .child(
                    div()
                        .pl(px(14.))
                        .text_size(px(11.5))
                        .text_color(components::text_secondary())
                        .child(clm.provenance.clone()),
                )
                .when(expanded, |d| {
                    d.when_some(clm.command.clone(), |d, cmd| {
                        d.child(
                            div()
                                .ml(px(14.))
                                .px(px(10.))
                                .py(px(6.))
                                .rounded(px(6.))
                                .bg(Theme::code_bg())
                                .font_family(theme::MONO_FONT)
                                .text_size(px(11.5))
                                .text_color(Theme::code_text())
                                .child(cmd),
                        )
                    })
                    .child(
                        div()
                            .ml(px(14.))
                            .p(px(10.))
                            .rounded(px(6.))
                            .bg(Theme::code_bg())
                            .border_1()
                            .border_color(Theme::code_border())
                            .font_family(theme::MONO_FONT)
                            .text_size(px(11.5))
                            .text_color(Theme::code_text())
                            .child(clm.evidence_output.clone()),
                    )
                }),
        );
    }

    let mut human_list = div().flex().flex_col().gap(px(10.));
    for clm in rep.claims.iter().filter(|c| c.judge == VerifyJudge::Human) {
        let cid = clm.id.clone();
        let vid_h = vid.clone();
        let dot_col = components::claim_dot_color(clm.status);
        let linked = clm.linked_canvas_id.clone();
        let pending = clm.status == ClaimStatus::PendingHuman;
        human_list = human_list.child(
            div()
                .p(px(14.))
                .rounded(px(10.))
                .border_1()
                .border_color(Theme::line_border())
                .bg(theme::raised(Theme::bg_body()))
                .flex()
                .flex_col()
                .gap(px(8.))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(10.))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .flex()
                                .items_center()
                                .gap(px(8.))
                                .child(components::status_dot(dot_col))
                                .child(
                                    div()
                                        .text_size(px(13.5))
                                        .font_weight(FontWeight::MEDIUM)
                                        .text_color(Theme::text())
                                        .child(ui::ui_para(clm.title.clone())),
                                ),
                        )
                        .when(!pending, |d| {
                            d.child(
                                div()
                                    .flex_none()
                                    .text_size(px(11.5))
                                    .text_color(components::text_muted())
                                    .child(clm.status.label()),
                            )
                        }),
                )
                .child(
                    div()
                        .pl(px(14.))
                        .text_size(px(12.5))
                        .line_height(px(18.))
                        .text_color(components::text_secondary())
                        .child(ui::ui_para(clm.evidence_output.clone())),
                )
                .child(
                    div()
                        .pl(px(14.))
                        .flex()
                        .items_center()
                        .justify_between()
                        .pt(px(2.))
                        .child(div().when_some(linked, |d, l_aid| {
                            d.child(
                                div()
                                    .id(SharedString::from(format!("jump-canvas-{cid}")))
                                    .cursor_pointer()
                                    .text_size(px(12.))
                                    .text_color(components::accent_text())
                                    .hover(|s| s.underline())
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        this.open_artifact_in_decision_pane(&l_aid, window, cx);
                                    }))
                                    .child("对照关联白板 →"),
                            )
                        }))
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(8.))
                                .child(
                                    div()
                                        .id(SharedString::from(format!("reject-hclm-{cid}")))
                                        .h(px(26.))
                                        .px(px(10.))
                                        .rounded(px(6.))
                                        .border_1()
                                        .border_color(Theme::line_border())
                                        .flex()
                                        .items_center()
                                        .cursor_pointer()
                                        .text_size(px(12.))
                                        .text_color(components::text_secondary())
                                        .hover(|s| s.bg(Theme::fill_hover()))
                                        .on_click(cx.listener({
                                            let cid = cid.clone();
                                            let vid_h = vid_h.clone();
                                            move |this, _, window, cx| {
                                                if let Some(msg) = this.state.verdict_human_claim(&vid_h, &cid, false) {
                                                    this.show_toast(ui::ToastKind::Error, msg, window, cx);
                                                }
                                            }
                                        }))
                                        .child("退回"),
                                )
                                .child(
                                    div()
                                        .id(SharedString::from(format!("pass-hclm-{cid}")))
                                        .h(px(26.))
                                        .px(px(12.))
                                        .rounded(px(6.))
                                        .bg(Theme::primary())
                                        .flex()
                                        .items_center()
                                        .cursor_pointer()
                                        .text_size(px(12.))
                                        .font_weight(FontWeight::MEDIUM)
                                        .text_color(gpui::white())
                                        .hover(|s| s.opacity(0.92))
                                        .on_click(cx.listener(move |this, _, window, cx| {
                                            if let Some(msg) = this.state.verdict_human_claim(&vid_h, &cid, true) {
                                                this.show_toast(ui::ToastKind::Success, msg, window, cx);
                                            }
                                        }))
                                        .child("通过"),
                                ),
                        ),
                ),
        );
    }

    let mut gap_list = div().flex().flex_col();
    for gap in &rep.gaps {
        let gid = gap.id.clone();
        let vid_g = vid.clone();
        let dot_col = if gap.waived {
            components::text_muted()
        } else {
            components::attention_color()
        };
        gap_list = gap_list.child(
            div()
                .px(px(10.))
                .py(px(12.))
                .border_b_1()
                .border_color(Theme::line_divider())
                .flex()
                .items_start()
                .justify_between()
                .gap(px(14.))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .gap(px(4.))
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(8.))
                                .child(components::status_dot(dot_col))
                                .child(
                                    div()
                                        .text_size(px(13.))
                                        .font_weight(FontWeight::MEDIUM)
                                        .text_color(if gap.waived { components::text_secondary() } else { Theme::text() })
                                        .child(gap.title.clone()),
                                ),
                        )
                        .child(
                            div()
                                .pl(px(14.))
                                .text_size(px(12.))
                                .text_color(components::text_secondary())
                                .child(format!("{} · 需 {}", gap.why, gap.needs)),
                        ),
                )
                .child(
                    div()
                        .flex_none()
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .child(
                            div()
                                .id(SharedString::from(format!("waive-{gid}")))
                                .h(px(24.))
                                .px(px(8.))
                                .rounded(px(6.))
                                .flex()
                                .items_center()
                                .cursor_pointer()
                                .text_size(px(11.5))
                                .text_color(components::text_secondary())
                                .hover(|s| s.bg(Theme::fill_hover()).text_color(Theme::text()))
                                .on_click(cx.listener({
                                    let gid = gid.clone();
                                    let vid_g = vid_g.clone();
                                    move |this, _, window, cx| {
                                        if let Some(msg) = this.state.waive_verify_gap(&vid_g, &gid) {
                                            this.show_toast(ui::ToastKind::Info, msg, window, cx);
                                        }
                                    }
                                }))
                                .child(if gap.waived { "恢复" } else { "豁免" }),
                        )
                        .when(!gap.waived, |d| {
                            d.child(
                                div()
                                    .id(SharedString::from(format!("spawn-gap-{gid}")))
                                    .h(px(24.))
                                    .px(px(9.))
                                    .rounded(px(6.))
                                    .border_1()
                                    .border_color(Theme::line_border())
                                    .flex()
                                    .items_center()
                                    .cursor_pointer()
                                    .text_size(px(11.5))
                                    .text_color(components::accent_text())
                                    .hover(|s| s.bg(Theme::fill_hover()))
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        if let Some(msg) = this.state.spawn_task_from_gap(&vid_g, &gid) {
                                            this.show_toast(ui::ToastKind::Success, msg, window, cx);
                                        }
                                    }))
                                    .child("转补测任务"),
                            )
                        }),
                ),
        );
    }

    let inner = div()
        .max_w(px(840.))
        .w_full()
        .mx_auto()
        .px(px(32.))
        .py(px(28.))
        .flex()
        .flex_col()
        .gap(px(26.))
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
                        .gap(px(12.))
                        .child(
                            div()
                                .text_size(px(19.))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(Theme::text())
                                .child(vart.title),
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.))
                                .text_size(px(12.))
                                .text_color(components::text_secondary())
                                .child(components::status_dot(components::verdict_dot_color(vart.verdict)))
                                .child(vart.verdict.label()),
                        ),
                )
                .child(
                    div()
                        .text_size(px(13.))
                        .line_height(px(20.))
                        .text_color(components::text_secondary())
                        .child(ui::ui_para(rep.summary)),
                ),
        )
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(8.))
                .child(
                    div()
                        .px(px(10.))
                        .text_size(px(11.5))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(components::text_muted())
                        .child("机器自证"),
                )
                .child(agent_list),
        )
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(10.))
                .child(
                    div()
                        .text_size(px(11.5))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(components::text_muted())
                        .child("人类裁决"),
                )
                .child(human_list),
        )
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(8.))
                .child(
                    div()
                        .px(px(10.))
                        .text_size(px(11.5))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(components::text_muted())
                        .child("未覆盖盲区"),
                )
                .child(gap_list),
        );

    div()
        .id("verify-scroll")
        .size_full()
        .min_h_0()
        .overflow_y_scroll()
        .child(inner)
        .into_any_element()
}

fn render_diff_surface(ws: &MerakWorkspace) -> AnyElement {
    let Some(t) = ws.state.task(&ws.state.selected_task_id).cloned() else {
        return div()
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .child(div().text_size(px(13.)).text_color(components::text_secondary()).child("暂无代码 Diff"))
            .into_any_element();
    };

    let mut lines = div()
        .p(px(14.))
        .font_family(theme::MONO_FONT)
        .flex()
        .flex_col()
        .gap(px(2.));
    for line in &t.diff_preview.lines {
        let (bg, fg) = match line.kind {
            DiffLineKind::Add => (
                theme::ca(craft::old::G500, 0.12),
                components::positive_color(),
            ),
            DiffLineKind::Del => (
                theme::ca(craft::R500, 0.12),
                components::negative_color(),
            ),
            DiffLineKind::Context => (transparent_black(), Theme::code_text()),
        };
        lines = lines.child(
            div()
                .px(px(8.))
                .py(px(3.))
                .rounded(px(4.))
                .bg(bg)
                .text_size(px(12.))
                .text_color(fg)
                .child(line.text.clone()),
        );
    }

    let card = div()
        .max_w(px(880.))
        .w_full()
        .mx_auto()
        .rounded(px(10.))
        .border_1()
        .border_color(Theme::line_border())
        .bg(theme::raised(Theme::bg_body()))
        .overflow_hidden()
        .flex()
        .flex_col()
        .child(
            div()
                .px(px(16.))
                .py(px(10.))
                .border_b_1()
                .border_color(Theme::line_divider())
                .flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .font_family(theme::MONO_FONT)
                        .text_size(px(12.))
                        .text_color(Theme::text())
                        .child(t.diff_preview.file),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(10.))
                        .font_family(theme::MONO_FONT)
                        .text_size(px(11.5))
                        .child(
                            div()
                                .text_color(components::positive_color())
                                .child(format!("+{}", t.diff_preview.additions)),
                        )
                        .child(
                            div()
                                .text_color(components::negative_color())
                                .child(format!("-{}", t.diff_preview.deletions)),
                        ),
                ),
        )
        .child(lines);

    div()
        .id("diff-scroll")
        .size_full()
        .min_h_0()
        .overflow_y_scroll()
        .px(px(32.))
        .py(px(28.))
        .child(card)
        .into_any_element()
}

fn render_comments_list_body(
    ws: &MerakWorkspace,
    art: &Artifact,
    cx: &mut Context<MerakWorkspace>,
) -> AnyElement {
    let mut list = div()
        .id("comments-scroll")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .p(px(16.))
        .flex()
        .flex_col()
        .gap(px(10.));

    if art.comments.is_empty() {
        list = list.child(
            div()
                .py(px(32.))
                .text_size(px(12.5))
                .text_color(components::text_secondary())
                .child("暂无批注。提交后将投递给对应 Bot 并等待回执。"),
        );
    } else {
        for cm in &art.comments {
            let cid = cm.id.clone();
            let aid_c = art.id.clone();
            let acked = cm.receipt_ack;
            list = list.child(
                div()
                    .pb(px(12.))
                    .border_b_1()
                    .border_color(Theme::line_divider())
                    .flex()
                    .flex_col()
                    .gap(px(5.))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .gap(px(8.))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(6.))
                                    .child(
                                        div()
                                            .text_size(px(12.5))
                                            .font_weight(FontWeight::MEDIUM)
                                            .text_color(Theme::text())
                                            .child(cm.author.clone()),
                                    )
                                    .child(
                                        div()
                                            .text_size(px(11.))
                                            .text_color(components::text_muted())
                                            .child(cm.anchor.clone()),
                                    ),
                            )
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(6.))
                                    .when(acked, |d| {
                                        d.child(
                                            div()
                                                .text_size(px(11.))
                                                .text_color(components::text_muted())
                                                .child("已回执"),
                                        )
                                    })
                                    .when(!acked, |d| {
                                        d.child(
                                            div()
                                                .id(SharedString::from(format!("ack-{cid}")))
                                                .cursor_pointer()
                                                .text_size(px(11.))
                                                .text_color(components::accent_text())
                                                .on_click(cx.listener(move |this, _, window, cx| {
                                                    if let Some(msg) = this.state.ack_artifact_comment(&aid_c, &cid) {
                                                        this.show_toast(ui::ToastKind::Success, msg, window, cx);
                                                    }
                                                }))
                                                .child("待回执 · 模拟 Ack"),
                                        )
                                    }),
                            ),
                    )
                    .child(
                        div()
                            .text_size(px(12.5))
                            .line_height(px(18.))
                            .text_color(components::text_secondary())
                            .child(ui::ui_para(cm.body.clone())),
                    ),
            );
        }
    }

    div()
        .size_full()
        .flex()
        .flex_col()
        .child(list)
        .child(
            div()
                .p(px(14.))
                .border_t_1()
                .border_color(Theme::line_divider())
                .flex()
                .items_center()
                .gap(px(8.))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .h(px(32.))
                        .px(px(10.))
                        .rounded(px(8.))
                        .border_1()
                        .border_color(Theme::line_sheet())
                        .bg(Theme::bg_body())
                        .flex()
                        .items_center()
                        .child(ws.comment_input.clone()),
                )
                .child(
                    ui::primary_button("send-art-comment", "发送").on_click(cx.listener(|this, _, window, cx| {
                        this.submit_artifact_comment("产物批注", window, cx);
                    })),
                ),
        )
        .into_any_element()
}

fn render_comments_drawer(
    ws: &MerakWorkspace,
    art: &Artifact,
    cx: &mut Context<MerakWorkspace>,
) -> Div {
    div()
        .w(px(320.))
        .flex_none()
        .h_full()
        .border_l_1()
        .border_color(Theme::line_divider())
        .bg(Theme::bg_body())
        .flex()
        .flex_col()
        .child(
            div()
                .h(px(44.))
                .px(px(16.))
                .border_b_1()
                .border_color(Theme::line_divider())
                .flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .text_size(px(12.5))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(Theme::text())
                        .child("批注"),
                )
                .child(ui::close_button("close-comments-drawer").on_click(cx.listener(|this, _, _, cx| {
                    this.state.comments_drawer_open = false;
                    cx.notify();
                }))),
        )
        .child(div().flex_1().min_h_0().flex().child(render_comments_list_body(ws, art, cx)))
}
