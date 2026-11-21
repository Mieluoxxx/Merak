use super::components;
use super::MerakWorkspace;
use crate::theme::{self, craft, Theme};
use crate::ui;
use gpui::{prelude::FluentBuilder, *};
use merak_contracts::ScheduledJob;

pub fn render_schedule_list(
    ws: &MerakWorkspace,
    jobs: Vec<&ScheduledJob>,
    show_project_tag: bool,
    max_width: f32,
    cx: &mut Context<MerakWorkspace>,
) -> Div {
    let selected_id = ws.state.selected_schedule_id.clone();
    let mut rows = div()
        .max_w(px(max_width))
        .w_full()
        .mx_auto()
        .px(px(20.))
        .py(px(14.))
        .flex()
        .flex_col();

    if jobs.is_empty() {
        rows = rows.child(
            div()
                .py(px(56.))
                .flex()
                .flex_col()
                .items_center()
                .gap(px(6.))
                .child(div().text_size(px(13.5)).font_weight(FontWeight::MEDIUM).text_color(Theme::text()).child("暂无定时任务"))
                .child(div().text_size(px(12.)).text_color(components::text_secondary()).child("按 ⌘N 选择「定时任务」即可新建。")),
        );
    } else {
        for job in jobs {
            let sid = job.id.clone();
            let selected = ws.state.schedule_inspector_open && selected_id == sid;
            let dot_col = components::schedule_dot_color(job.last_outcome);
            let proj_name = ws.state.project(&job.project_id).map(|p| p.name.clone());

            rows = rows.child(
                div()
                    .id(SharedString::from(format!("sched-row-{sid}")))
                    .px(px(12.))
                    .py(px(14.))
                    .rounded(px(8.))
                    .border_b_1()
                    .border_color(if selected { transparent_black() } else { Theme::line_divider() })
                    .bg(if selected { theme::ca(craft::N1000, 0.055) } else { transparent_black() })
                    .cursor_pointer()
                    .hover(|s| s.bg(Theme::fill_hover()))
                    .on_click(cx.listener({
                        let sid = sid.clone();
                        move |this, _, _, cx| {
                            this.state.select_schedule(&sid);
                            cx.notify();
                        }
                    }))
                    .flex()
                    .flex_col()
                    .gap(px(5.))
                    .child(
                        div()
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
                                    .child(components::status_dot(dot_col))
                                    .child(
                                        div()
                                            .flex_1()
                                            .min_w_0()
                                            .text_size(px(13.5))
                                            .font_weight(FontWeight::MEDIUM)
                                            .text_color(if job.enabled { Theme::text() } else { components::text_secondary() })
                                            .overflow_hidden()
                                            .whitespace_nowrap()
                                            .text_ellipsis()
                                            .child(job.name.clone()),
                                    ),
                            )
                            .child(
                                div()
                                    .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                                    .flex_none()
                                    .flex()
                                    .items_center()
                                    .gap(px(10.))
                                    .child(
                                        div()
                                            .text_size(px(11.5))
                                            .text_color(components::text_muted())
                                            .child(if job.enabled { job.next_run_at.clone() } else { "已暂停".into() }),
                                    )
                                    .child(
                                        div()
                                            .id(SharedString::from(format!("sched-run-{sid}")))
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
                    )
                    .child(
                        div()
                            .pl(px(14.))
                            .text_size(px(12.))
                            .text_color(components::text_secondary())
                            .child(if show_project_tag {
                                match proj_name {
                                    Some(pname) => format!("{} · {pname}", job.schedule_label),
                                    None => job.schedule_label.clone(),
                                }
                            } else {
                                job.schedule_label.clone()
                            }),
                    ),
            );
        }
    }

    let list_scroll = div()
        .id("schedules-scroll")
        .flex_1()
        .min_w_0()
        .h_full()
        .overflow_y_scroll()
        .child(rows);

    let inspector = components::sliding_right_drawer(
        ws.schedule_drawer_anim.value(),
        360.,
        render_schedule_inspector(ws, &selected_id, cx),
    );

    div()
        .size_full()
        .min_h_0()
        .flex()
        .child(list_scroll)
        .children(inspector)
}

fn render_schedule_inspector(
    ws: &MerakWorkspace,
    schedule_id: &str,
    cx: &mut Context<MerakWorkspace>,
) -> Div {
    let Some(job) = ws
        .state
        .snapshot
        .schedules
        .iter()
        .find(|s| s.id == schedule_id)
        .cloned()
    else {
        return div().w(px(0.));
    };
    let sid = job.id.clone();
    let sid_pol = sid.clone();
    let sid_run = sid.clone();

    let mut runs_el = div().flex().flex_col().gap(px(8.));
    for run in &job.runs {
        let dot_col = components::schedule_dot_color(run.outcome);
        let aid_opt = run.verify_artifact_id.clone();
        let rid = run.id.clone();
        runs_el = runs_el.child(
            div()
                .id(SharedString::from(format!("srun-insp-{sid}-{rid}")))
                .p(px(10.))
                .rounded(px(8.))
                .border_1()
                .border_color(Theme::line_border())
                .when(aid_opt.is_some(), |d| {
                    d.cursor_pointer()
                        .hover(|s| s.border_color(Theme::line_sheet()))
                        .on_click(cx.listener(move |this, _, window, cx| {
                            if let Some(aid) = &aid_opt {
                                this.open_artifact_in_decision_pane(aid, window, cx);
                            }
                        }))
                })
                .flex()
                .flex_col()
                .gap(px(4.))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.))
                                .child(components::status_dot(dot_col))
                                .child(div().text_size(px(12.)).font_weight(FontWeight::MEDIUM).text_color(Theme::text()).child(run.outcome.label())),
                        )
                        .child(div().text_size(px(11.)).text_color(components::text_muted()).child(run.ran_at.clone())),
                )
                .child(div().text_size(px(12.)).text_color(components::text_secondary()).child(ui::ui_para(run.summary.clone())))
                .when(run.verify_artifact_id.is_some(), |d| {
                    d.child(div().text_size(px(11.5)).text_color(components::accent_text()).child("打开验收报告 →"))
                }),
        );
    }

    div()
        .w(px(360.))
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
                        .font_family(theme::MONO_FONT)
                        .text_size(px(12.))
                        .text_color(components::text_secondary())
                        .child(format!("{} · {}", job.trigger_kind.label(), job.schedule_expr)),
                )
                .child(ui::close_button("close-schedule-inspector").on_click(cx.listener(|this, _, _, cx| {
                    this.state.schedule_inspector_open = false;
                    cx.notify();
                }))),
        )
        .child(
            div()
                .id("schedule-inspector-scroll")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .p(px(18.))
                .flex()
                .flex_col()
                .gap(px(16.))
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(6.))
                        .child(div().text_size(px(15.)).font_weight(FontWeight::SEMIBOLD).text_color(Theme::text()).child(job.name))
                        .child(div().text_size(px(12.5)).line_height(px(19.)).text_color(components::text_secondary()).child(ui::ui_para(job.description))),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .flex_wrap()
                        .gap(px(8.))
                        .child(
                            ui::secondary_button(
                                "insp-sched-en",
                                if job.enabled { "暂停" } else { "启用" },
                            )
                            .on_click(cx.listener(move |this, _, window, cx| {
                                if let Some(msg) = this.state.toggle_schedule_enabled(&sid) {
                                    this.show_toast(ui::ToastKind::Info, msg, window, cx);
                                }
                            })),
                        )
                        .child(
                            ui::secondary_button("insp-sched-pol", "切换通知策略").on_click(cx.listener(
                                move |this, _, window, cx| {
                                    if let Some(msg) = this.state.toggle_schedule_policy(&sid_pol) {
                                        this.show_toast(ui::ToastKind::Info, msg, window, cx);
                                    }
                                },
                            )),
                        )
                        .child(
                            ui::primary_button("insp-sched-run", "立即运行").on_click(cx.listener(
                                move |this, _, window, cx| {
                                    if let Some(msg) = this.state.run_schedule_now(&sid_run) {
                                        this.show_toast(ui::ToastKind::Success, msg, window, cx);
                                    }
                                },
                            )),
                        ),
                )
                .child(
                    div()
                        .text_size(px(11.5))
                        .text_color(components::text_muted())
                        .child(format!("当前策略：{}", job.notify_policy.label())),
                )
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(8.))
                        .child(
                            div()
                                .text_size(px(11.5))
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(components::text_muted())
                                .child("运行记录"),
                        )
                        .child(runs_el),
                ),
        )
}

pub fn render_global_schedules(ws: &MerakWorkspace, cx: &mut Context<MerakWorkspace>) -> Div {
    let jobs = ws.state.filtered_schedules();

    let mut filters = div().flex().items_center().flex_wrap().gap(px(4.)).child(
        components::text_filter("sch-proj-all", "全部", ws.state.schedule_project_filter.is_none()).on_click(
            cx.listener(|this, _, _, cx| {
                this.state.schedule_project_filter = None;
                cx.notify();
            }),
        ),
    );
    for proj in &ws.state.snapshot.projects {
        let pid = proj.id.clone();
        let active = ws.state.schedule_project_filter.as_deref() == Some(pid.as_str());
        filters = filters.child(
            components::text_filter(
                SharedString::from(format!("sch-proj-{pid}")),
                proj.name.clone(),
                active,
            )
            .on_click(cx.listener(move |this, _, _, cx| {
                this.state.schedule_project_filter = Some(pid.clone());
                cx.notify();
            })),
        );
    }

    div()
        .size_full()
        .flex()
        .flex_col()
        .child(
            div()
                .border_b_1()
                .border_color(Theme::line_divider())
                .child(
                    div()
                        .max_w(px(920.))
                        .w_full()
                        .mx_auto()
                        .px(px(32.))
                        .pt(px(24.))
                        .pb(px(12.))
                        .flex()
                        .flex_col()
                        .gap(px(10.))
                        .child(
                            div()
                                .text_size(px(20.))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(Theme::text())
                                .child("Schedules"),
                        )
                        .child(filters),
                ),
        )
        .child(render_schedule_list(ws, jobs, true, 920., cx))
}
