use super::components;
use super::state::{SessionDeliverable, SessionPicker};
use super::MerakWorkspace;
use crate::theme::{self, craft, Theme};
use crate::ui;
use gpui::{prelude::FluentBuilder, *};

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

fn chip_bg(open: bool) -> Hsla {
    if open {
        if theme::dark() {
            theme::rgbaf(0xff, 0xff, 0xff, 0.11)
        } else {
            theme::ca(craft::N1000, 0.08)
        }
    } else if theme::dark() {
        theme::rgbaf(0xff, 0xff, 0xff, 0.06)
    } else {
        theme::ca(craft::N1000, 0.045)
    }
}

fn chip_hover_bg() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0xff, 0xff, 0xff, 0.10)
    } else {
        theme::ca(craft::N1000, 0.08)
    }
}

fn starter_bg() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0xff, 0xff, 0xff, 0.035)
    } else {
        theme::c(craft::N50)
    }
}

fn popover_menu(content: Div) -> AnyElement {
    div()
        .absolute()
        .top_0()
        .left_0()
        .child(
            deferred(
                anchored()
                    .position_mode(AnchoredPositionMode::Local)
                    .position(point(px(0.), px(36.)))
                    .anchor(Anchor::TopLeft)
                    .snap_to_window_with_margin(px(12.))
                    .child(
                        div()
                            .w(px(268.))
                            .p(px(6.))
                            .rounded(px(14.))
                            .bg(theme::raised(Theme::bg_body()))
                            .border_1()
                            .border_color(Theme::line_border())
                            .shadow(theme::shadow_menu())
                            .occlude()
                            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                            .child(content),
                    ),
            )
            .with_priority(15),
        )
        .into_any_element()
}

fn selector_chip(
    id: &'static str,
    open: bool,
    leading: AnyElement,
    label: impl Into<SharedString>,
    on_toggle: impl Fn(&mut MerakWorkspace, &MouseDownEvent, &mut Window, &mut Context<MerakWorkspace>)
        + 'static,
    cx: &mut Context<MerakWorkspace>,
) -> Stateful<Div> {
    div()
        .id(id)
        .h(px(30.))
        .px(px(11.))
        .rounded_full()
        .bg(chip_bg(open))
        .border_1()
        .border_color(if open {
            Theme::line_sheet()
        } else {
            gpui::transparent_black()
        })
        .flex()
        .items_center()
        .gap(px(6.))
        .cursor_pointer()
        .hover(|s| s.bg(chip_hover_bg()))
        .on_mouse_down(MouseButton::Left, cx.listener(move |this, ev, window, cx| {
            cx.stop_propagation();
            on_toggle(this, ev, window, cx);
        }))
        .child(leading)
        .child(
            div()
                .text_size(px(12.5))
                .font_weight(FontWeight::MEDIUM)
                .text_color(Theme::text())
                .whitespace_nowrap()
                .child(label.into()),
        )
        .child(ui::icon("chevron-down", 12., components::text_muted()))
}

fn picker_item(
    id: SharedString,
    active: bool,
    leading: AnyElement,
    title: impl Into<SharedString>,
    subtitle: Option<SharedString>,
) -> Stateful<Div> {
    div()
        .id(id)
        .px(px(10.))
        .py(px(8.))
        .rounded(px(9.))
        .flex()
        .items_center()
        .gap(px(8.))
        .cursor_pointer()
        .when(active, |d| d.bg(Theme::fill_hover_strong()))
        .when(!active, |d| d.hover(|s| s.bg(Theme::fill_hover())))
        .child(leading)
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(1.))
                .child(
                    div()
                        .text_size(px(12.5))
                        .font_weight(if active { FontWeight::SEMIBOLD } else { FontWeight::MEDIUM })
                        .text_color(Theme::text())
                        .overflow_hidden()
                        .whitespace_nowrap()
                        .text_ellipsis()
                        .child(title.into()),
                )
                .when_some(subtitle, |d, sub| {
                    d.child(
                        div()
                            .text_size(px(11.))
                            .text_color(components::text_secondary())
                            .overflow_hidden()
                            .whitespace_nowrap()
                            .text_ellipsis()
                            .child(sub),
                    )
                }),
        )
        .when(active, |d| {
            d.child(ui::icon("check", 13., Theme::primary()))
        })
}

pub fn render_new_session(
    ws: &MerakWorkspace,
    cx: &mut Context<MerakWorkspace>,
) -> Stateful<Div> {
    let active_proj = ws
        .state
        .project(&ws.state.session_project_id)
        .cloned()
        .or_else(|| ws.state.snapshot.projects.first().cloned());
    let active_bot = ws
        .state
        .bot(&ws.state.session_bot_id)
        .cloned()
        .or_else(|| ws.state.snapshot.bots.first().cloned());
    let deliv = ws.state.session_deliverable;
    let picker = ws.state.session_picker;
    let can_submit = !ws.session_input.read(cx).text.trim().is_empty();

    let proj_dot = active_proj
        .as_ref()
        .map(|p| theme::c(p.color_hex))
        .unwrap_or_else(Theme::primary);
    let proj_name = active_proj
        .as_ref()
        .map(|p| p.name.clone())
        .unwrap_or_else(|| "选择项目".into());
    let bot_name = active_bot
        .as_ref()
        .map(|b| b.name.clone())
        .unwrap_or_else(|| "选择 Bot".into());

    let proj_menu = (picker == Some(SessionPicker::Project)).then(|| {
        let mut list = div().flex().flex_col().gap(px(2.));
        for p in &ws.state.snapshot.projects {
            let pid = p.id.clone();
            let active = pid == ws.state.session_project_id;
            let dot = theme::c(p.color_hex);
            list = list.child(
                picker_item(
                    SharedString::from(format!("pick-proj-{pid}")),
                    active,
                    div().size(px(7.)).rounded_full().bg(dot).flex_none().into_any_element(),
                    p.name.clone(),
                    None,
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state.session_project_id = pid.clone();
                    if let Some(proj) = this.state.project(&pid) {
                        this.state.session_bot_id = proj.default_bot_id.clone();
                    }
                    this.state.session_picker = None;
                    cx.notify();
                })),
            );
        }
        popover_menu(list)
    });

    let bot_menu = (picker == Some(SessionPicker::Bot)).then(|| {
        let mut list = div().flex().flex_col().gap(px(2.));
        for b in &ws.state.snapshot.bots {
            let bid = b.id.clone();
            let active = bid == ws.state.session_bot_id;
            let dot = components::bot_status_dot_color(b.status);
            list = list.child(
                picker_item(
                    SharedString::from(format!("pick-bot-{bid}")),
                    active,
                    components::status_dot(dot).into_any_element(),
                    b.name.clone(),
                    Some(b.role.clone().into()),
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state.session_bot_id = bid.clone();
                    this.state.session_picker = None;
                    cx.notify();
                })),
            );
        }
        popover_menu(list)
    });

    let deliv_menu = (picker == Some(SessionPicker::Deliverable)).then(|| {
        let mut list = div().flex().flex_col().gap(px(2.));
        for d in SessionDeliverable::ALL {
            let active = d == deliv;
            list = list.child(
                picker_item(
                    SharedString::from(format!("pick-deliv-{}", d.label())),
                    active,
                    ui::icon(
                        d.icon(),
                        14.,
                        if active { Theme::primary() } else { components::text_secondary() },
                    )
                    .into_any_element(),
                    d.label(),
                    Some(d.description().into()),
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state.session_deliverable = d;
                    this.state.session_picker = None;
                    cx.notify();
                })),
            );
        }
        popover_menu(list)
    });

    let starters: [(&'static str, &'static str, SessionDeliverable, &'static str); 4] = [
        (
            "与 Bot 开启自由对话",
            "chat",
            SessionDeliverable::FreeChat,
            "先对齐当前项目的实现边界与约束，聊清再决定是否出方案白板",
        ),
        (
            "画一份架构选型白板",
            "whiteboard",
            SessionDeliverable::DecisionCanvas,
            "为当前项目梳理两套核心实现方案，画在决策白板上对比权衡",
        ),
        (
            "发起本轮双轨验收",
            "todo-check",
            SessionDeliverable::VerifyReport,
            "汇总本轮机器自检结果与待人类裁决项，生成验收报告",
        ),
        (
            "配置每日自动巡检",
            "history",
            SessionDeliverable::Schedule,
            "每天 09:00 自动巡检核心测试与构建状态，异常时推入 Inbox",
        ),
    ];

    let mut starter_row = div()
        .mt(px(18.))
        .flex()
        .items_center()
        .justify_center()
        .flex_wrap()
        .gap(px(8.));
    for (idx, (label, icon_name, target_deliv, prompt)) in starters.into_iter().enumerate() {
        starter_row = starter_row.child(
            div()
                .id(SharedString::from(format!("session-starter-{idx}")))
                .h(px(32.))
                .px(px(14.))
                .rounded_full()
                .border_1()
                .border_color(Theme::line_border())
                .bg(starter_bg())
                .flex()
                .items_center()
                .gap(px(6.))
                .cursor_pointer()
                .text_size(px(12.5))
                .text_color(components::text_secondary())
                .hover(|s| {
                    s.bg(Theme::fill_hover())
                        .border_color(Theme::line_sheet())
                        .text_color(Theme::text())
                })
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.state.session_deliverable = target_deliv;
                    this.state.session_picker = None;
                    this.session_input.update(cx, |f, cx| f.set_text(prompt, cx));
                    this.session_input.focus_handle(cx).focus(window, cx);
                    cx.notify();
                }))
                .child(ui::icon(icon_name, 13., components::text_muted()))
                .child(label),
        );
    }

    let composer = div()
        .w_full()
        .rounded(px(22.))
        .bg(card_bg())
        .border_1()
        .border_color(card_border())
        .shadow(theme::shadow_panel())
        .flex()
        .flex_col()
        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
        .child(
            div()
                .id("session-input-area")
                .px(px(22.))
                .pt(px(20.))
                .pb(px(14.))
                .min_h(px(88.))
                .cursor_text()
                .on_mouse_down(MouseButton::Left, cx.listener(|this, _, window, cx| {
                    this.state.session_picker = None;
                    this.session_input.focus_handle(cx).focus(window, cx);
                    cx.notify();
                }))
                .child(ws.session_input.clone()),
        )
        .child(
            div()
                .px(px(14.))
                .pb(px(12.))
                .pt(px(4.))
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
                        .child(
                            div()
                                .relative()
                                .child(selector_chip(
                                    "session-chip-project",
                                    picker == Some(SessionPicker::Project),
                                    div().size(px(7.)).rounded_full().bg(proj_dot).flex_none().into_any_element(),
                                    proj_name,
                                    |this, _, _, cx| {
                                        this.state.session_picker =
                                            (this.state.session_picker != Some(SessionPicker::Project))
                                                .then_some(SessionPicker::Project);
                                        cx.notify();
                                    },
                                    cx,
                                ))
                                .children(proj_menu),
                        )
                        .child(
                            div()
                                .relative()
                                .child(selector_chip(
                                    "session-chip-bot",
                                    picker == Some(SessionPicker::Bot),
                                    ui::icon("bot", 13., components::text_secondary()).into_any_element(),
                                    bot_name,
                                    |this, _, _, cx| {
                                        this.state.session_picker =
                                            (this.state.session_picker != Some(SessionPicker::Bot))
                                                .then_some(SessionPicker::Bot);
                                        cx.notify();
                                    },
                                    cx,
                                ))
                                .children(bot_menu),
                        )
                        .child(
                            div()
                                .relative()
                                .child(selector_chip(
                                    "session-chip-deliverable",
                                    picker == Some(SessionPicker::Deliverable),
                                    ui::icon(deliv.icon(), 13., components::accent_text()).into_any_element(),
                                    deliv.label(),
                                    |this, _, _, cx| {
                                        this.state.session_picker =
                                            (this.state.session_picker != Some(SessionPicker::Deliverable))
                                                .then_some(SessionPicker::Deliverable);
                                        cx.notify();
                                    },
                                    cx,
                                ))
                                .children(deliv_menu),
                        ),
                )
                .child(
                    div()
                        .id("session-submit-btn")
                        .size(px(32.))
                        .rounded_full()
                        .flex()
                        .items_center()
                        .justify_center()
                        .when(can_submit, |d| {
                            d.bg(Theme::primary())
                                .cursor_pointer()
                                .hover(|s| s.opacity(0.9))
                                .on_click(cx.listener(|this, _, window, cx| {
                                    this.submit_new_session(window, cx);
                                }))
                        })
                        .when(!can_submit, |d| d.bg(Theme::fill_hover_strong()))
                        .child(ui::icon(
                            "chevron-right",
                            16.,
                            if can_submit { gpui::white() } else { components::text_muted() },
                        )),
                ),
        );

    div()
        .id("new-session-view")
        .size_full()
        .flex()
        .flex_col()
        .items_center()
        .justify_center()
        .px(px(32.))
        .pb(px(72.))
        .on_mouse_down(MouseButton::Left, cx.listener(|this, _, _, cx| {
            if this.state.session_picker.take().is_some() {
                cx.notify();
            }
        }))
        .child(
            div()
                .max_w(px(680.))
                .w_full()
                .flex()
                .flex_col()
                .items_center()
                .child(
                    div()
                        .mb(px(26.))
                        .text_size(px(26.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(Theme::text())
                        .child("今天想推进什么？"),
                )
                .child(composer)
                .child(starter_row),
        )
}
