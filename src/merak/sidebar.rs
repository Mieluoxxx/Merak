use super::components;
use super::state::{PrimaryNav, RailSection, SettingsSection};
use super::MerakWorkspace;
use crate::app::{OpenCommandPalette, OpenQuickCapture, OpenSettings, ToggleThemeMode, HEADER_H};
use crate::theme::{self, craft, Theme};
use crate::ui::{self, TipExt, TitleBarExt};
use gpui::{prelude::FluentBuilder, *};
use std::time::Duration;

pub const RAIL_STRIDE: f32 = 38.0;
pub const SUB_ROW_STRIDE: f32 = 42.0;

const ROW_H: f32 = 36.;
const ROW_R: f32 = 18.;
const RAIL_W: f32 = 58.;
const RAIL_BTN_SIZE: f32 = 36.;
const CAPSULE_ITEM_SIZE: f32 = 34.;

pub(super) fn floating_pill_bg() -> Hsla {
    if theme::dark() {
        theme::raised(Theme::bg_body())
    } else {
        theme::c(craft::N00)
    }
}

pub(super) fn floating_pill_border() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0xff, 0xff, 0xff, 0.11)
    } else {
        theme::ca(craft::N1000, 0.08)
    }
}

pub(super) fn floating_pill_hover() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0x36, 0x36, 0x39, 1.0)
    } else {
        theme::c(craft::N50)
    }
}

fn sub_row_idle_bg() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0xff, 0xff, 0xff, 0.04)
    } else {
        theme::rgbaf(0xff, 0xff, 0xff, 0.58)
    }
}

fn sub_row_hover_bg() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0xff, 0xff, 0xff, 0.075)
    } else {
        theme::rgbaf(0xff, 0xff, 0xff, 0.85)
    }
}

fn active_rail_disc_bg() -> Hsla {
    if theme::dark() {
        theme::ca(craft::B500, 0.22)
    } else {
        theme::ca(craft::B500, 0.12)
    }
}

fn active_sub_pill_border() -> Hsla {
    if theme::dark() {
        theme::ca(craft::B400, 0.72)
    } else {
        theme::ca(craft::B500, 0.58)
    }
}

fn floating_circle_btn(
    id: &'static str,
    icon_name: &'static str,
    icon_size: f32,
    tip: &'static str,
    shortcut: Option<&'static str>,
) -> Stateful<Div> {
    div()
        .id(id)
        .size(px(RAIL_BTN_SIZE))
        .rounded_full()
        .bg(floating_pill_bg())
        .border_1()
        .border_color(floating_pill_border())
        .shadow(theme::shadow_card())
        .flex()
        .items_center()
        .justify_center()
        .cursor_pointer()
        .hover(|s| s.bg(floating_pill_hover()))
        .tip_right(tip, shortcut)
        .child(ui::icon(icon_name, icon_size, Theme::icon()))
}

fn sub_pill(offset_y: f32) -> Div {
    div()
        .absolute()
        .top(px(offset_y))
        .left_0()
        .right_0()
        .h(px(ROW_H))
        .rounded(px(ROW_R))
        .bg(floating_pill_bg())
        .border(px(1.5))
        .border_color(active_sub_pill_border())
        .shadow(theme::shadow_button())
}

fn pill_row(id: impl Into<ElementId>, active: bool) -> Stateful<Div> {
    div()
        .id(id)
        .h(px(ROW_H))
        .px(px(13.))
        .rounded(px(ROW_R))
        .flex()
        .items_center()
        .gap(px(9.))
        .cursor_pointer()
        .when(!active, |d| {
            d.bg(sub_row_idle_bg())
                .hover(|s| s.bg(sub_row_hover_bg()))
        })
}

fn pill_row_label(text: impl Into<SharedString>, active: bool) -> Div {
    div()
        .flex_1()
        .min_w_0()
        .text_size(px(13.))
        .font_weight(if active { FontWeight::MEDIUM } else { FontWeight::NORMAL })
        .text_color(if active { Theme::text() } else { Theme::sidebar_text() })
        .overflow_hidden()
        .whitespace_nowrap()
        .text_ellipsis()
        .child(text.into())
}

pub fn render_sidebar(ws: &MerakWorkspace, cx: &mut Context<MerakWorkspace>) -> Div {
    let pending = ws.state.pending_inbox_count();
    let has_waiting_bot = ws.state.has_waiting_bot();
    let rail = ws.state.rail;
    let is_dark = theme::dark();
    let on_new_session = ws.state.nav == PrimaryNav::NewSession;
    let on_settings = ws.state.nav == PrimaryNav::Settings;
    let hide_sub_pill = on_new_session || on_settings;

    let rail_items: [(RailSection, &'static str, &'static str, &'static str, Option<Hsla>); 3] = [
        (
            RailSection::Home,
            "rail-home",
            "主页",
            "home",
            (pending > 0 && ws.state.mailbox_badge_dot && (rail != RailSection::Home || hide_sub_pill))
                .then(components::accent_text),
        ),
        (RailSection::Projects, "rail-projects", "项目", "folder", None),
        (
            RailSection::Bots,
            "rail-bots",
            "Bot",
            "bot",
            (has_waiting_bot && (rail != RailSection::Bots || hide_sub_pill))
                .then(components::attention_color),
        ),
    ];

    let mut rail_capsule = div()
        .relative()
        .flex()
        .flex_col()
        .items_center()
        .gap(px(4.))
        .when(!hide_sub_pill, |d| {
            d.child(
                div()
                    .absolute()
                    .top(px(ws.rail_pill_anim.value()))
                    .left_0()
                    .size(px(CAPSULE_ITEM_SIZE))
                    .rounded_full()
                    .bg(active_rail_disc_bg()),
            )
        });
    for (section, id, label, icon_name, dot_opt) in rail_items {
        let on = !hide_sub_pill && rail == section;
        rail_capsule = rail_capsule.child(
            div()
                .id(id)
                .relative()
                .size(px(CAPSULE_ITEM_SIZE))
                .rounded_full()
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .when(!on, |d| d.hover(|s| s.bg(Theme::sidebar_hover())))
                .tip_right(label, None)
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.switch_rail(section, window, cx);
                }))
                .child(ui::icon(
                    icon_name,
                    16.5,
                    if on { Theme::primary() } else { components::sidebar_muted() },
                ))
                .when_some(dot_opt, |d, col| {
                    d.child(
                        div()
                            .absolute()
                            .top(px(4.))
                            .right(px(4.))
                            .size(px(5.5))
                            .rounded_full()
                            .bg(col),
                    )
                }),
        );
    }

    let rail_top_stack = div()
        .flex()
        .flex_col()
        .items_center()
        .gap(px(10.))
        .child(
            div()
                .id("rail-new-session")
                .size(px(RAIL_BTN_SIZE))
                .rounded_full()
                .bg(Theme::primary())
                .when(on_new_session, |d| {
                    d.border(px(2.)).border_color(theme::ca(craft::B200, 0.9))
                })
                .shadow(theme::shadow_card())
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .hover(|s| s.opacity(0.9))
                .tip_right("新建会话", Some("⌘N"))
                .on_click(|_, window, cx| {
                    window.dispatch_action(Box::new(OpenQuickCapture), cx);
                })
                .child(ui::icon("square-pen", 16., gpui::white())),
        )
        .child(
            div()
                .p(px(4.))
                .rounded_full()
                .bg(floating_pill_bg())
                .border_1()
                .border_color(floating_pill_border())
                .shadow(theme::shadow_card())
                .child(rail_capsule),
        );

    let rail_bottom_stack = div()
        .flex()
        .flex_col()
        .items_center()
        .gap(px(8.))
        .child(
            floating_circle_btn("rail-search", "search", 15., "全局搜索", Some("⌘K")).on_click(
                |_, window, cx| {
                    window.dispatch_action(Box::new(OpenCommandPalette), cx);
                },
            ),
        )
        .child(
            floating_circle_btn(
                "sidebar-theme-toggle",
                if is_dark { "eye" } else { "eye-open" },
                15.,
                if is_dark { "浅色外观" } else { "深色外观" },
                Some("⌘⇧T"),
            )
            .on_click(|_, window, cx| {
                window.dispatch_action(Box::new(ToggleThemeMode), cx);
            }),
        )
        .child(
            div()
                .id("rail-settings")
                .size(px(RAIL_BTN_SIZE))
                .rounded_full()
                .bg(floating_pill_bg())
                .border(px(if on_settings { 1.5 } else { 1.0 }))
                .border_color(if on_settings {
                    active_sub_pill_border()
                } else {
                    floating_pill_border()
                })
                .shadow(theme::shadow_card())
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .hover(|s| s.bg(floating_pill_hover()))
                .tip_right("设置", Some("⌘,"))
                .on_click(|_, window, cx| {
                    window.dispatch_action(Box::new(OpenSettings), cx);
                })
                .child(ui::icon(
                    "settings",
                    15.5,
                    if on_settings { Theme::primary() } else { Theme::icon() },
                )),
        );

    let rail_col = div()
        .w(px(RAIL_W))
        .flex_none()
        .h_full()
        .border_r_1()
        .border_color(Theme::line_divider())
        .py(px(12.))
        .flex()
        .flex_col()
        .items_center()
        .justify_between()
        .child(rail_top_stack)
        .child(rail_bottom_stack);

    let sub_sidebar: Div = if on_settings {
        let query = ws.settings_search_input.read(cx).text.clone();
        let groups: [(Option<&'static str>, &[SettingsSection]); 3] = [
            (None, &SettingsSection::CORE),
            (Some("工作台与决策"), &SettingsSection::WORKBENCH),
            (Some("开发与运行时"), &SettingsSection::RUNTIME),
        ];
        let mut tree = div().flex().flex_col().gap(px(2.));
        let mut any_match = false;
        for (heading, items) in groups {
            let matched: Vec<SettingsSection> = items
                .iter()
                .copied()
                .filter(|sec| sec.matches_query(&query))
                .collect();
            if matched.is_empty() {
                continue;
            }
            any_match = true;
            if let Some(h) = heading {
                tree = tree.child(
                    div()
                        .px(px(10.))
                        .pt(px(12.))
                        .pb(px(4.))
                        .text_size(px(11.))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(components::sidebar_muted())
                        .child(h),
                );
            }
            for sec in matched {
                let active = ws.state.settings_section == sec;
                tree = tree.child(
                    div()
                        .id(SharedString::from(format!("settings-nav-{}", sec.label())))
                        .h(px(30.))
                        .px(px(10.))
                        .rounded(px(8.))
                        .flex()
                        .items_center()
                        .gap(px(9.))
                        .cursor_pointer()
                        .when(active, |d| d.bg(Theme::sidebar_selected()))
                        .when(!active, |d| d.hover(|s| s.bg(Theme::sidebar_hover())))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.state.settings_section = sec;
                            this.state.settings_dropdown = None;
                            cx.notify();
                        }))
                        .child(ui::icon(
                            sec.icon(),
                            14.5,
                            if active { Theme::text() } else { components::sidebar_muted() },
                        ))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .text_size(px(13.))
                                .font_weight(if active { FontWeight::MEDIUM } else { FontWeight::NORMAL })
                                .text_color(if active { Theme::text() } else { Theme::sidebar_text() })
                                .overflow_hidden()
                                .whitespace_nowrap()
                                .text_ellipsis()
                                .child(sec.label()),
                        ),
                );
            }
        }
        if !any_match {
            tree = tree.child(
                div()
                    .px(px(10.))
                    .py(px(14.))
                    .text_size(px(12.))
                    .text_color(components::sidebar_muted())
                    .child("无匹配设置项"),
            );
        }

        let nav_scroll = div()
            .id("settings-nav-scroll")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .child(tree);
        let animated_nav: AnyElement = if ws.rail_epoch > 0 && !cx.reduce_motion() {
            nav_scroll
                .with_animation(
                    ("rail-sub", ws.rail_epoch),
                    Animation::new(Duration::from_millis(160)).with_easing(ease_out_quint()),
                    |el, t| el.opacity(0.2 + 0.8 * t),
                )
                .into_any_element()
        } else {
            nav_scroll.into_any_element()
        };

        div()
            .flex_1()
            .min_w_0()
            .h_full()
            .px(px(10.))
            .py(px(10.))
            .flex()
            .flex_col()
            .gap(px(10.))
            .child(
                div()
                    .px(px(8.))
                    .text_size(px(16.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(Theme::text())
                    .child("设置"),
            )
            .child(
                div()
                    .id("settings-search-box")
                    .h(px(30.))
                    .px(px(10.))
                    .rounded_full()
                    .border_1()
                    .border_color(floating_pill_border())
                    .bg(floating_pill_bg())
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .cursor_text()
                    .on_mouse_down(MouseButton::Left, cx.listener(|this, _, window, cx| {
                        this.settings_search_input.focus_handle(cx).focus(window, cx);
                    }))
                    .child(ui::icon("search", 13., components::sidebar_muted()))
                    .child(div().flex_1().min_w_0().child(ws.settings_search_input.clone())),
            )
            .child(animated_nav)
    } else {
        let sub_pill_y = ws.sub_pill_anim.value();
        let (section_title, section_list) = match rail {
            RailSection::Home => {
                let home_rows: [(PrimaryNav, &'static str, &'static str, Option<usize>); 3] = [
                    (PrimaryNav::Inbox, "Inbox", "alarm-clock", (pending > 0).then_some(pending)),
                    (PrimaryNav::Tasks, "Tasks", "todo-check", None),
                    (PrimaryNav::Schedules, "Schedules", "history", None),
                ];
                let mut list = div()
                    .relative()
                    .flex()
                    .flex_col()
                    .gap(px(6.))
                    .when(!hide_sub_pill, |d| d.child(sub_pill(sub_pill_y)));
                for (nav, label, icon_name, count) in home_rows {
                    let active = ws.state.nav == nav;
                    let id = match &nav {
                        PrimaryNav::Inbox => "nav-inbox",
                        PrimaryNav::Tasks => "nav-tasks",
                        PrimaryNav::Schedules => "nav-schedules",
                        _ => unreachable!(),
                    };
                    list = list.child(
                        pill_row(id, active)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.switch_nav(nav.clone(), window, cx);
                            }))
                            .child(ui::icon(
                                icon_name,
                                15.,
                                if active { Theme::text() } else { components::sidebar_muted() },
                            ))
                            .child(pill_row_label(label, active))
                            .when_some(count, |d, n| d.child(components::sidebar_count(n, true))),
                    );
                }
                ("主页", list)
            }
            RailSection::Projects => {
                let mut list = div()
                    .relative()
                    .flex()
                    .flex_col()
                    .gap(px(6.))
                    .when(!hide_sub_pill, |d| d.child(sub_pill(sub_pill_y)));
                for proj in &ws.state.snapshot.projects {
                    let pid = proj.id.clone();
                    let active = ws.state.nav == PrimaryNav::Project(pid.clone());
                    let dot = theme::c(proj.color_hex);
                    list = list.child(
                        pill_row(SharedString::from(format!("proj-{pid}")), active)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.open_project_view(&pid, window, cx);
                            }))
                            .child(div().size(px(7.)).rounded_full().bg(dot).flex_none())
                            .child(pill_row_label(proj.name.clone(), active)),
                    );
                }
                ("项目", list)
            }
            RailSection::Bots => {
                let mut list = div()
                    .relative()
                    .flex()
                    .flex_col()
                    .gap(px(6.))
                    .when(!hide_sub_pill, |d| d.child(sub_pill(sub_pill_y)));
                for bot in &ws.state.snapshot.bots {
                    let bid = bot.id.clone();
                    let active = ws.state.nav == PrimaryNav::Bot(bid.clone());
                    let dot = components::bot_status_dot_color(bot.status);
                    list = list.child(
                        pill_row(SharedString::from(format!("bot-{bid}")), active)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.open_bot_view(&bid, window, cx);
                            }))
                            .child(components::status_dot(dot))
                            .child(pill_row_label(bot.name.clone(), active)),
                    );
                }
                ("Bot", list)
            }
        };

        let animated_section_list: AnyElement = if ws.rail_epoch > 0 && !cx.reduce_motion() {
            section_list
                .with_animation(
                    ("rail-sub", ws.rail_epoch),
                    Animation::new(Duration::from_millis(160)).with_easing(ease_out_quint()),
                    |el, t| el.opacity(0.2 + 0.8 * t),
                )
                .into_any_element()
        } else {
            section_list.into_any_element()
        };

        div()
            .flex_1()
            .min_w_0()
            .h_full()
            .px(px(12.))
            .py(px(12.))
            .flex()
            .flex_col()
            .gap(px(10.))
            .child(
                div()
                    .px(px(10.))
                    .text_size(px(11.5))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(components::sidebar_muted())
                    .child(section_title),
            )
            .child(animated_section_list)
            .when(rail == RailSection::Projects, |d| {
                d.child(
                    div()
                        .id("sidebar-new-project-btn")
                        .mt(px(4.))
                        .h(px(34.))
                        .px(px(12.))
                        .rounded_full()
                        .border_1()
                        .border_color(floating_pill_border())
                        .cursor_pointer()
                        .hover(|s| s.bg(floating_pill_hover()))
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.open_new_project_modal(window, cx);
                        }))
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .child(ui::icon("plus", 13., components::sidebar_muted()))
                        .child(
                            div()
                                .text_size(px(12.5))
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(components::sidebar_muted())
                                .child("新建项目"),
                        ),
                )
            })
    };

    let title_left = if cfg!(target_os = "macos") && !crate::theme::fullscreen() {
        128.
    } else {
        54.
    };

    div()
        .w(px(ws.state.sidebar_width))
        .flex_none()
        .h_full()
        .flex()
        .flex_col()
        .child(
            div()
                .h(px(HEADER_H))
                .pl(px(title_left))
                .pr(px(12.))
                .flex()
                .items_center()
                .title_bar()
                .child(
                    div()
                        .text_size(px(14.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(Theme::text())
                        .child("Merak"),
                ),
        )
        .child(
            div()
                .flex_1()
                .min_h_0()
                .flex()
                .child(rail_col)
                .child(sub_sidebar),
        )
}
