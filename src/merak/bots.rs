use super::chat;
use super::components;
use super::state::BotViewTab;
use super::MerakWorkspace;
use crate::theme::{self, craft, Theme};
use crate::ui;
use gpui::{prelude::FluentBuilder, *};

fn seg_track_bg() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0xff, 0xff, 0xff, 0.06)
    } else {
        theme::ca(craft::N1000, 0.045)
    }
}

fn seg_active_bg() -> Hsla {
    if theme::dark() {
        theme::raised(Theme::bg_body())
    } else {
        theme::c(craft::N00)
    }
}

pub fn render_bot(
    ws: &MerakWorkspace,
    bot_id: &str,
    cx: &mut Context<MerakWorkspace>,
) -> Div {
    let Some(bot) = ws.state.bot(bot_id).cloned() else {
        return div().size_full().items_center().justify_center().child("未找到 Bot");
    };

    let dot_col = components::bot_status_dot_color(bot.status);
    let proj = ws.state.project(&bot.project_id).cloned();
    let git_meta = chat::project_git_summary(ws, &bot.project_id);

    let mut tab_switch = div()
        .p(px(3.))
        .rounded(px(9.))
        .bg(seg_track_bg())
        .flex()
        .items_center()
        .gap(px(2.));
    for tab in BotViewTab::ALL {
        let on = ws.state.bot_tab == tab;
        tab_switch = tab_switch.child(
            div()
                .id(SharedString::from(format!("bot-tab-{}", tab.label())))
                .h(px(26.))
                .px(px(12.))
                .rounded(px(7.))
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .text_size(px(12.))
                .font_weight(if on { FontWeight::SEMIBOLD } else { FontWeight::NORMAL })
                .when(on, |d| {
                    d.bg(seg_active_bg())
                        .text_color(Theme::text())
                        .shadow(theme::shadow_button())
                })
                .when(!on, |d| {
                    d.text_color(components::text_secondary())
                        .hover(|s| s.text_color(Theme::text()))
                })
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.state.bot_tab = tab;
                    if tab == BotViewTab::Chat {
                        this.chat_input.focus_handle(cx).focus(window, cx);
                    }
                    cx.notify();
                }))
                .child(tab.label()),
        );
    }

    let header = div()
        .border_b_1()
        .border_color(Theme::line_divider())
        .child(
            div()
                .max_w(px(960.))
                .w_full()
                .mx_auto()
                .px(px(28.))
                .pt(px(20.))
                .pb(px(14.))
                .flex()
                .items_center()
                .justify_between()
                .gap(px(16.))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .gap(px(5.))
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(10.))
                                .child(components::status_dot(dot_col))
                                .child(
                                    div()
                                        .text_size(px(20.))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(Theme::text())
                                        .child(bot.name.clone()),
                                )
                                .child(components::subtle_pill(bot.status.label()))
                                .child(
                                    div()
                                        .px(px(6.))
                                        .py(px(1.))
                                        .rounded(px(5.))
                                        .bg(seg_track_bg())
                                        .font_family(theme::MONO_FONT)
                                        .text_size(px(11.))
                                        .text_color(components::text_muted())
                                        .child(bot.model.clone()),
                                ),
                        )
                        .child(
                            div()
                                .pl(px(16.))
                                .flex()
                                .items_center()
                                .flex_wrap()
                                .gap(px(6.))
                                .text_size(px(12.5))
                                .text_color(components::text_secondary())
                                .child(bot.role.clone())
                                .when_some(proj.clone(), |d, p| {
                                    let pid = p.id.clone();
                                    d.child(div().text_color(components::text_muted()).child("·"))
                                        .child(
                                            div()
                                                .id(SharedString::from(format!("bot-jump-proj-{pid}")))
                                                .cursor_pointer()
                                                .text_color(components::accent_text())
                                                .hover(|s| s.underline())
                                                .on_click(cx.listener(move |this, _, window, cx| {
                                                    this.open_project_view(&pid, window, cx);
                                                }))
                                                .child(p.name),
                                        )
                                        .when_some(git_meta, |d, (rname, branch, dirty)| {
                                            let pid_git = p.id.clone();
                                            d.child(
                                                div()
                                                    .id(SharedString::from(format!("bot-head-git-{pid_git}")))
                                                    .h(px(20.))
                                                    .px(px(7.))
                                                    .rounded_full()
                                                    .bg(seg_track_bg())
                                                    .cursor_pointer()
                                                    .hover(|s| s.bg(Theme::fill_hover_strong()))
                                                    .on_click(cx.listener(move |this, _, window, cx| {
                                                        this.open_project_repos(&pid_git, window, cx);
                                                    }))
                                                    .flex()
                                                    .items_center()
                                                    .gap(px(5.))
                                                    .child(ui::icon("git-branch", 11., components::text_muted()))
                                                    .child(
                                                        div()
                                                            .font_family(theme::MONO_FONT)
                                                            .text_size(px(11.))
                                                            .text_color(components::text_secondary())
                                                            .child(format!("{rname}@{branch}")),
                                                    )
                                                    .when(dirty > 0, |d| {
                                                        d.child(
                                                            div()
                                                                .text_size(px(10.5))
                                                                .text_color(components::attention_color())
                                                                .child(format!("{dirty}M")),
                                                        )
                                                    }),
                                            )
                                        })
                                }),
                        ),
                )
                .child(div().flex_none().child(tab_switch)),
        );

    if ws.state.bot_tab == BotViewTab::Chat {
        let sessions = ws.state.bot_sessions(bot_id);
        let active_sid = ws
            .state
            .active_session_id_for_bot(bot_id)
            .or_else(|| sessions.first().map(|s| s.id.clone()));
        let active_session = active_sid
            .as_deref()
            .and_then(|sid| ws.state.session(sid))
            .cloned()
            .or_else(|| sessions.first().copied().cloned());

        let mut thread_pills = div().flex().items_center().flex_wrap().gap(px(6.));
        for ses in &sessions {
            let sid = ses.id.clone();
            let active = active_session.as_ref().is_some_and(|a| a.id == sid);
            let s_dot = chat::session_status_dot(ses.status);
            thread_pills = thread_pills.child(
                div()
                    .id(SharedString::from(format!("bot-ses-pill-{sid}")))
                    .h(px(28.))
                    .px(px(10.))
                    .rounded_full()
                    .border_1()
                    .border_color(if active {
                        Theme::line_sheet()
                    } else {
                        Theme::line_divider()
                    })
                    .when(active, |d| d.bg(seg_active_bg()).shadow(theme::shadow_button()))
                    .when(!active, |d| d.hover(|s| s.bg(Theme::fill_hover())))
                    .cursor_pointer()
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.state.select_session(&sid);
                        this.chat_input.focus_handle(cx).focus(window, cx);
                        cx.notify();
                    }))
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .child(components::status_dot(s_dot))
                    .child(
                        div()
                            .max_w(px(200.))
                            .text_size(px(12.))
                            .font_weight(if active { FontWeight::SEMIBOLD } else { FontWeight::NORMAL })
                            .text_color(if active { Theme::text() } else { components::text_secondary() })
                            .overflow_hidden()
                            .whitespace_nowrap()
                            .text_ellipsis()
                            .child(ses.title.clone()),
                    ),
            );
        }

        let bid_new = bot.id.clone();
        let thread_bar = div()
            .border_b_1()
            .border_color(Theme::line_divider())
            .child(
                div()
                    .max_w(px(760.))
                    .w_full()
                    .mx_auto()
                    .px(px(28.))
                    .py(px(8.))
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(10.))
                    .child(div().flex_1().min_w_0().child(thread_pills))
                    .child(
                        div()
                            .id(SharedString::from(format!("bot-new-chat-{bid_new}")))
                            .flex_none()
                            .h(px(28.))
                            .px(px(10.))
                            .rounded_full()
                            .border_1()
                            .border_color(Theme::line_border())
                            .bg(seg_active_bg())
                            .cursor_pointer()
                            .hover(|s| s.bg(Theme::fill_hover()))
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.new_chat_for_bot(&bid_new, window, cx);
                            }))
                            .flex()
                            .items_center()
                            .gap(px(4.))
                            .child(ui::icon("plus", 12., Theme::text()))
                            .child(
                                div()
                                    .text_size(px(12.))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(Theme::text())
                                    .child("新对话"),
                            ),
                    ),
            );

        let body: AnyElement = if let Some(ses) = active_session {
            chat::render_chat_thread(ws, &ses, cx).into_any_element()
        } else {
            let bid_empty = bot.id.clone();
            div()
                .flex_1()
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .gap(px(12.))
                .child(ui::icon("chat", 22., components::text_muted()))
                .child(
                    div()
                        .text_size(px(14.))
                        .text_color(components::text_secondary())
                        .child("还没有活跃会话，发起一段新对话吧"),
                )
                .child(
                    ui::primary_button("bot-empty-new-chat", "开启对话").on_click(cx.listener(
                        move |this, _, window, cx| {
                            this.new_chat_for_bot(&bid_empty, window, cx);
                        },
                    )),
                )
                .into_any_element()
        };

        return div()
            .size_full()
            .flex()
            .flex_col()
            .child(header)
            .child(thread_bar)
            .child(body);
    }

    let active_art = bot
        .active_artifact_id
        .as_deref()
        .and_then(|aid| ws.state.artifact(aid))
        .cloned();
    let arts = ws.state.bot_artifacts(bot_id);
    let scheds = ws.state.bot_schedules(bot_id);

    let mut content = div()
        .max_w(px(960.))
        .w_full()
        .mx_auto()
        .px(px(28.))
        .py(px(22.))
        .flex()
        .flex_col()
        .gap(px(26.))
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(12.))
                .child(
                    div()
                        .text_size(px(13.5))
                        .line_height(px(21.))
                        .text_color(components::text_secondary())
                        .child(ui::ui_para(bot.summary)),
                )
                .when_some(active_art, |d, art| {
                    let aid = art.id.clone();
                    d.child(
                        div()
                            .id(SharedString::from(format!("bot-active-art-{aid}")))
                            .p(px(14.))
                            .rounded(px(10.))
                            .border_1()
                            .border_color(Theme::line_border())
                            .bg(theme::raised(Theme::bg_body()))
                            .cursor_pointer()
                            .hover(|s| s.border_color(Theme::line_sheet()))
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.open_artifact_in_decision_pane(&aid, window, cx);
                            }))
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
                                    .gap(px(10.))
                                    .child(components::status_dot(components::verdict_dot_color(art.verdict)))
                                    .child(
                                        div()
                                            .flex_1()
                                            .min_w_0()
                                            .text_size(px(13.5))
                                            .font_weight(FontWeight::MEDIUM)
                                            .text_color(Theme::text())
                                            .overflow_hidden()
                                            .whitespace_nowrap()
                                            .text_ellipsis()
                                            .child(art.title),
                                    )
                                    .child(
                                        div()
                                            .flex_none()
                                            .text_size(px(12.))
                                            .text_color(components::text_muted())
                                            .child(art.kind.label()),
                                    ),
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
                }),
        );

    if !arts.is_empty() {
        let mut art_list = div().flex().flex_col();
        for art in arts {
            let aid = art.id.clone();
            art_list = art_list.child(
                div()
                    .id(SharedString::from(format!("bot-art-{aid}")))
                    .px(px(10.))
                    .py(px(11.))
                    .rounded(px(8.))
                    .border_b_1()
                    .border_color(Theme::line_divider())
                    .cursor_pointer()
                    .hover(|s| s.bg(Theme::fill_hover()))
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.open_artifact_in_decision_pane(&aid, window, cx);
                    }))
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
                            .child(components::status_dot(components::verdict_dot_color(art.verdict)))
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .text_size(px(13.5))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(Theme::text())
                                    .overflow_hidden()
                                    .whitespace_nowrap()
                                    .text_ellipsis()
                                    .child(art.title.clone()),
                            ),
                    )
                    .child(
                        div()
                            .flex_none()
                            .text_size(px(11.5))
                            .text_color(components::text_muted())
                            .child(format!("{} · {}", art.kind.label(), art.updated_at)),
                    ),
            );
        }

        content = content.child(
            div()
                .flex()
                .flex_col()
                .gap(px(6.))
                .child(
                    div()
                        .px(px(10.))
                        .text_size(px(11.5))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(components::text_muted())
                        .child("产物"),
                )
                .child(art_list),
        );
    }

    if !scheds.is_empty() {
        let mut sched_list = div().flex().flex_col();
        for job in scheds {
            let sid = job.id.clone();
            sched_list = sched_list.child(
                div()
                    .px(px(10.))
                    .py(px(11.))
                    .border_b_1()
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
                            .child(components::status_dot(components::schedule_dot_color(job.last_outcome)))
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .text_size(px(13.5))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(Theme::text())
                                    .overflow_hidden()
                                    .whitespace_nowrap()
                                    .text_ellipsis()
                                    .child(job.name.clone()),
                            ),
                    )
                    .child(
                        div()
                            .flex_none()
                            .flex()
                            .items_center()
                            .gap(px(10.))
                            .child(
                                div()
                                    .text_size(px(11.5))
                                    .text_color(components::text_muted())
                                    .child(job.schedule_label.clone()),
                            )
                            .child(
                                div()
                                    .id(SharedString::from(format!("bot-sched-run-{sid}")))
                                    .h(px(24.))
                                    .px(px(9.))
                                    .rounded(px(6.))
                                    .border_1()
                                    .border_color(Theme::line_border())
                                    .flex()
                                    .items_center()
                                    .cursor_pointer()
                                    .text_size(px(11.5))
                                    .text_color(Theme::text())
                                    .hover(|s| s.bg(Theme::fill_hover()))
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        if let Some(msg) = this.state.run_schedule_now(&sid) {
                                            this.show_toast(ui::ToastKind::Success, msg, window, cx);
                                        }
                                    }))
                                    .child("运行"),
                            ),
                    ),
            );
        }

        content = content.child(
            div()
                .flex()
                .flex_col()
                .gap(px(6.))
                .child(
                    div()
                        .px(px(10.))
                        .text_size(px(11.5))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(components::text_muted())
                        .child("定时任务"),
                )
                .child(sched_list),
        );
    }

    div()
        .size_full()
        .flex()
        .flex_col()
        .child(header)
        .child(
            div()
                .id("bot-scroll")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .child(content),
        )
}
