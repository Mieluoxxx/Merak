use super::components;
use super::state::TaskViewMode;
use super::MerakWorkspace;
use crate::theme::{self, craft, Theme};
use crate::ui;
use gpui::{prelude::FluentBuilder, *};
use merak_contracts::{Task, TaskStatus};

pub fn render_task_cards(
    ws: &MerakWorkspace,
    tasks: Vec<&Task>,
    show_project_tag: bool,
    max_width: f32,
    cx: &mut Context<MerakWorkspace>,
) -> Div {
    let selected_id = ws.state.selected_task_id.clone();
    let mut rows = div()
        .max_w(px(max_width))
        .w_full()
        .mx_auto()
        .px(px(20.))
        .py(px(12.))
        .flex()
        .flex_col();

    for task in tasks {
        let tid = task.id.clone();
        let selected = ws.state.task_inspector_open && tid == selected_id;
        let dot_col = components::task_status_dot_color(task.status);
        let proj = ws.state.project(&task.project_id);

        rows = rows.child(
            div()
                .id(SharedString::from(format!("task-row-{tid}")))
                .h(px(46.))
                .px(px(12.))
                .rounded(px(8.))
                .border_b_1()
                .border_color(if selected { transparent_black() } else { Theme::line_divider() })
                .bg(if selected { theme::ca(craft::N1000, 0.055) } else { transparent_black() })
                .cursor_pointer()
                .hover(|s| s.bg(Theme::fill_hover()))
                .on_click(cx.listener({
                    let tid = tid.clone();
                    move |this, _, window, cx| {
                        this.open_task_in_decision_pane(&tid, window, cx);
                    }
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
                        .child(
                            div()
                                .id(SharedString::from(format!("cycle-st-{tid}")))
                                .size(px(20.))
                                .rounded_full()
                                .flex()
                                .items_center()
                                .justify_center()
                                .hover(|s| s.bg(Theme::fill_hover_strong()))
                                .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                                .on_click(cx.listener({
                                    let tid = tid.clone();
                                    move |this, _, window, cx| {
                                        if let Some(next) = this.state.cycle_task_status(&tid) {
                                            this.show_toast(ui::ToastKind::Info, format!("状态：{}", next.label()), window, cx);
                                        }
                                    }
                                }))
                                .child(components::status_dot(dot_col)),
                        )
                        .child(
                            div()
                                .w(px(68.))
                                .flex_none()
                                .font_family(theme::MONO_FONT)
                                .text_size(px(11.5))
                                .text_color(components::text_muted())
                                .child(task.key.clone()),
                        )
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
                                .child(task.title.clone()),
                        ),
                )
                .child(
                    div()
                        .flex_none()
                        .flex()
                        .items_center()
                        .gap(px(14.))
                        .text_size(px(11.5))
                        .text_color(components::text_secondary())
                        .child(task.stage.label())
                        .when(show_project_tag, |d| {
                            d.when_some(proj, |d, p| {
                                d.child(
                                    div()
                                        .flex()
                                        .items_center()
                                        .gap(px(5.))
                                        .child(div().size(px(6.)).rounded_full().bg(theme::c(p.color_hex)))
                                        .child(p.name.clone()),
                                )
                            })
                        }),
                ),
        );
    }

    let list_scroll = div()
        .id("tasks-list-scroll")
        .flex_1()
        .min_w_0()
        .h_full()
        .overflow_y_scroll()
        .child(rows);

    let inspector = components::sliding_right_drawer(
        ws.task_drawer_anim.value(),
        380.,
        render_task_inspector(ws, &selected_id, cx),
    );

    div()
        .size_full()
        .min_h_0()
        .flex()
        .child(list_scroll)
        .children(inspector)
}

pub fn render_task_inspector(
    ws: &MerakWorkspace,
    task_id: &str,
    cx: &mut Context<MerakWorkspace>,
) -> Div {
    let Some(task) = ws.state.task(task_id).cloned() else {
        return div().w(px(0.));
    };
    let tid = task.id.clone();
    let bot = ws.state.bot(&task.linked_bot_id);
    let done_cnt = task.checklist.iter().filter(|c| c.done).count();
    let total_cnt = task.checklist.len();
    let aid = task.primary_artifact_id.clone();

    let mut checklist_el = div().flex().flex_col().gap(px(6.));
    for chk in &task.checklist {
        let cid = chk.id.clone();
        let tid_chk = tid.clone();
        let done = chk.done;
        checklist_el = checklist_el.child(
            div()
                .id(SharedString::from(format!("chk-{tid}-{cid}")))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state.toggle_checklist(&tid_chk, &cid);
                    cx.notify();
                }))
                .flex()
                .items_center()
                .gap(px(8.))
                .py(px(2.))
                .cursor_pointer()
                .child(
                    div()
                        .size(px(15.))
                        .flex_none()
                        .rounded(px(4.))
                        .flex()
                        .items_center()
                        .justify_center()
                        .when(done, |d| d.bg(Theme::primary()).child(ui::icon("check", 10., gpui::white())))
                        .when(!done, |d| d.border_1().border_color(Theme::todo_box()).bg(Theme::bg_body())),
                )
                .child(
                    div()
                        .text_size(px(12.5))
                        .text_color(if done { components::text_secondary() } else { Theme::text() })
                        .when(done, |d| d.line_through())
                        .child(chk.label.clone()),
                ),
        );
    }

    let mut rulings_el = div().flex().flex_col().gap(px(8.));
    for ruling in &task.rulings {
        let rid = ruling.id.clone();
        let tid_r = tid.clone();
        let disputed = ruling.disputed;
        rulings_el = rulings_el.child(
            div()
                .p(px(10.))
                .rounded(px(8.))
                .border_1()
                .border_color(if disputed { components::attention_color() } else { Theme::line_border() })
                .flex()
                .flex_col()
                .gap(px(6.))
                .child(
                    div()
                        .text_size(px(12.5))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(Theme::text())
                        .child(ui::ui_para(ruling.decision.clone())),
                )
                .child(
                    div()
                        .text_size(px(11.5))
                        .line_height(px(17.))
                        .text_color(components::text_secondary())
                        .child(ui::ui_para(format!("依据：{} · 代价：{}", ruling.reason, ruling.cost_if_wrong))),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(div().text_size(px(11.)).text_color(components::text_muted()).child(ruling.timestamp.clone()))
                        .child(
                            div()
                                .id(SharedString::from(format!("dispute-{tid}-{rid}")))
                                .h(px(22.))
                                .px(px(8.))
                                .rounded(px(5.))
                                .border_1()
                                .border_color(Theme::line_border())
                                .flex()
                                .items_center()
                                .cursor_pointer()
                                .text_size(px(11.))
                                .text_color(if disputed { components::attention_color() } else { components::text_secondary() })
                                .hover(|s| s.bg(Theme::fill_hover()))
                                .on_click(cx.listener(move |this, _, window, cx| {
                                    if let Some(msg) = this.state.dispute_ruling(&tid_r, &rid) {
                                        this.show_toast(ui::ToastKind::Info, msg, window, cx);
                                    }
                                }))
                                .child(if disputed { "已发起纠偏" } else { "异议纠偏" }),
                        ),
                ),
        );
    }

    div()
        .w(px(380.))
        .flex_none()
        .h_full()
        .border_l_1()
        .border_color(Theme::line_divider())
        .bg(Theme::bg_body())
        .flex()
        .flex_col()
        .child(
            div()
                .h(px(46.))
                .px(px(18.))
                .border_b_1()
                .border_color(Theme::line_divider())
                .flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .child(components::status_dot(components::task_status_dot_color(task.status)))
                        .child(
                            div()
                                .font_family(theme::MONO_FONT)
                                .text_size(px(12.))
                                .text_color(components::text_secondary())
                                .child(task.key),
                        )
                        .child(
                            div()
                                .text_size(px(12.))
                                .text_color(components::text_muted())
                                .child(task.status.label()),
                        ),
                )
                .child(ui::close_button("close-task-inspector").on_click(cx.listener(|this, _, _, cx| {
                    this.state.task_inspector_open = false;
                    cx.notify();
                }))),
        )
        .child(
            div()
                .id("task-inspector-scroll")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .p(px(18.))
                .flex()
                .flex_col()
                .gap(px(18.))
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(6.))
                        .child(
                            div()
                                .text_size(px(15.))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(Theme::text())
                                .child(ui::ui_para(task.title)),
                        )
                        .child(
                            div()
                                .text_size(px(11.5))
                                .text_color(components::text_muted())
                                .child(format!(
                                    "{} · {} · {}",
                                    task.stage.label(),
                                    bot.map(|b| b.name.as_str()).unwrap_or("Bot"),
                                    task.updated_at
                                )),
                        )
                        .child(
                            div()
                                .text_size(px(12.5))
                                .line_height(px(19.))
                                .text_color(components::text_secondary())
                                .child(ui::ui_para(task.description)),
                        )
                        .child(
                            div().pt(px(4.)).child(
                                ui::secondary_button("task-open-artifact", "打开关联决策面 →").on_click(
                                    cx.listener(move |this, _, window, cx| {
                                        this.open_artifact_in_decision_pane(&aid, window, cx);
                                    }),
                                ),
                            ),
                        ),
                )
                .when(total_cnt > 0, |d| {
                    d.child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(8.))
                            .child(
                                div()
                                    .text_size(px(11.5))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(components::text_muted())
                                    .child(format!("检查项 ({done_cnt}/{total_cnt})")),
                            )
                            .child(checklist_el),
                    )
                })
                .when(!task.rulings.is_empty(), |d| {
                    d.child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(8.))
                            .child(
                                div()
                                    .text_size(px(11.5))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(components::text_muted())
                                    .child(format!("Bot 自主裁量账本 ({})", task.rulings.len())),
                            )
                            .child(rulings_el),
                    )
                }),
        )
}

pub fn render_global_tasks(
    ws: &mut MerakWorkspace,
    window: &mut Window,
    cx: &mut Context<MerakWorkspace>,
) -> Div {
    let tasks: Vec<_> = ws.state.snapshot.tasks.iter().cloned().collect();
    let task_refs: Vec<_> = tasks.iter().collect();
    let selected_id = ws.state.selected_task_id.clone();

    let header = div()
        .border_b_1()
        .border_color(Theme::line_divider())
        .child(
            div()
                .max_w(px(960.))
                .w_full()
                .mx_auto()
                .px(px(32.))
                .pt(px(24.))
                .pb(px(12.))
                .flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .text_size(px(20.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(Theme::text())
                        .child("Tasks"),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(4.))
                        .child(
                            components::text_filter("task-mode-list", "列表", ws.state.task_view == TaskViewMode::List)
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.state.task_view = TaskViewMode::List;
                                    cx.notify();
                                })),
                        )
                        .child(
                            components::text_filter("task-mode-board", "看板", ws.state.task_view == TaskViewMode::Board)
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.state.task_view = TaskViewMode::Board;
                                    cx.notify();
                                })),
                        )
                        .child(
                            components::text_filter("task-mode-table", "数据表", ws.state.task_view == TaskViewMode::Table)
                                .on_click(cx.listener(|this, _, window, cx| {
                                    this.state.task_view = TaskViewMode::Table;
                                    let _ = this.ensure_tasks_table(window, cx);
                                    cx.notify();
                                })),
                        ),
                ),
        );

    let body: AnyElement = match ws.state.task_view {
        TaskViewMode::List => render_task_cards(ws, task_refs, true, 960., cx).into_any_element(),
        TaskViewMode::Board => {
            let mut cols = div()
                .id("tasks-board-scroll")
                .flex_1()
                .min_w_0()
                .min_h_0()
                .overflow_x_scroll()
                .px(px(28.))
                .py(px(20.))
                .flex()
                .gap(px(14.));

            for status in TaskStatus::ALL {
                let col_tasks: Vec<_> = tasks.iter().filter(|t| t.status == status).collect();
                let mut col = div()
                    .w(px(236.))
                    .flex_none()
                    .h_full()
                    .p(px(10.))
                    .rounded(px(10.))
                    .bg(theme::ca(craft::N1000, 0.024))
                    .flex()
                    .flex_col()
                    .gap(px(8.))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .px(px(4.))
                            .py(px(2.))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(7.))
                                    .child(components::status_dot(components::task_status_dot_color(status)))
                                    .child(
                                        div()
                                            .text_size(px(12.5))
                                            .font_weight(FontWeight::MEDIUM)
                                            .text_color(Theme::text())
                                            .child(status.label()),
                                    ),
                            )
                            .child(components::quiet_count(col_tasks.len(), false)),
                    );

                for task in col_tasks {
                    let tid = task.id.clone();
                    let selected = ws.state.task_inspector_open && tid == selected_id;
                    let bot = ws.state.bot(&task.linked_bot_id);
                    col = col.child(
                        div()
                            .id(SharedString::from(format!("kanban-{tid}")))
                            .p(px(12.))
                            .rounded(px(9.))
                            .border_1()
                            .border_color(if selected { Theme::primary() } else { Theme::line_border() })
                            .bg(theme::raised(Theme::bg_body()))
                            .cursor_pointer()
                            .hover(|s| s.border_color(Theme::line_sheet()))
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.open_task_in_decision_pane(&tid, window, cx);
                            }))
                            .flex()
                            .flex_col()
                            .gap(px(6.))
                            .child(
                                div()
                                    .font_family(theme::MONO_FONT)
                                    .text_size(px(11.))
                                    .text_color(components::text_muted())
                                    .child(task.key.clone()),
                            )
                            .child(
                                div()
                                    .text_size(px(12.5))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(Theme::text())
                                    .child(ui::ui_para(task.title.clone())),
                            )
                            .when_some(bot, |d, b| {
                                d.child(
                                    div()
                                        .text_size(px(11.))
                                        .text_color(components::text_secondary())
                                        .child(b.name.clone()),
                                )
                            }),
                    );
                }
                cols = cols.child(col);
            }

            let inspector = ws
                .state
                .task_inspector_open
                .then(|| render_task_inspector(ws, &selected_id, cx));
            div().flex_1().min_h_0().flex().child(cols).children(inspector).into_any_element()
        }
        TaskViewMode::Table => {
            let tv = ws.ensure_tasks_table(window, cx);
            div().flex_1().min_h_0().w_full().flex().child(tv).into_any_element()
        }
    };

    div().size_full().flex().flex_col().child(header).child(body)
}
