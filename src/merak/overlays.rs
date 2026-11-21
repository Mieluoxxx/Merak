use super::components;
use super::state::{NewProjectMode, PrimaryNav, PROJECT_COLORS};
use super::MerakWorkspace;
use crate::theme::{self, craft, Theme};
use crate::ui;
use gpui::{prelude::FluentBuilder, *};
use merak_contracts::DecisionPaneTab;
use std::time::Duration;

#[derive(Clone)]
pub enum PaletteTarget {
    Project(String),
    Bot(String),
    Session(String),
    Nav(PrimaryNav),
    Artifact(String),
    Task(String),
    Schedule(String),
    VerifyTab,
    NewSession,
    NewProject,
    OpenSettings,
    ToggleTheme,
}

pub struct PaletteHit {
    pub title: String,
    pub subtitle: String,
    pub tag: &'static str,
    pub target: PaletteTarget,
}

pub fn matching_hits(ws: &MerakWorkspace, cx: &App) -> Vec<PaletteHit> {
    let q = ws.palette_input.read(cx).text.trim().to_lowercase();
    let mut hits = vec![
        PaletteHit {
            title: "新建会话".into(),
            subtitle: "发起新会话，选择项目、Bot 与交付产物".into(),
            tag: "会话",
            target: PaletteTarget::NewSession,
        },
        PaletteHit {
            title: "新建项目".into(),
            subtitle: "创建空白项目桌面，或从本地 Git 仓库建立项目".into(),
            tag: "项目",
            target: PaletteTarget::NewProject,
        },
        PaletteHit {
            title: "设置".into(),
            subtitle: "外观、侧栏材质、默认交付产物与快捷键".into(),
            tag: "设置",
            target: PaletteTarget::OpenSettings,
        },
        PaletteHit {
            title: "打开验收报告 (Verify)".into(),
            subtitle: "查看当前项目的机器自证、人类裁决与未验证盲区".into(),
            tag: "验收",
            target: PaletteTarget::VerifyTab,
        },
        PaletteHit {
            title: "Inbox".into(),
            subtitle: "跨项目待裁决队列".into(),
            tag: "导航",
            target: PaletteTarget::Nav(PrimaryNav::Inbox),
        },
        PaletteHit {
            title: "Schedules".into(),
            subtitle: "查看 Cron / Watcher 定时调度与最近运行".into(),
            tag: "导航",
            target: PaletteTarget::Nav(PrimaryNav::Schedules),
        },
        PaletteHit {
            title: "切换深浅色外观".into(),
            subtitle: "切换 Merak 与白板主题".into(),
            tag: "外观",
            target: PaletteTarget::ToggleTheme,
        },
    ];

    for proj in &ws.state.snapshot.projects {
        hits.push(PaletteHit {
            title: proj.name.clone(),
            subtitle: proj.summary.clone(),
            tag: "项目",
            target: PaletteTarget::Project(proj.id.clone()),
        });
    }
    for bot in &ws.state.snapshot.bots {
        hits.push(PaletteHit {
            title: bot.name.clone(),
            subtitle: format!("{} · {}", bot.role, bot.status.label()),
            tag: "Bot",
            target: PaletteTarget::Bot(bot.id.clone()),
        });
    }
    for ses in &ws.state.snapshot.sessions {
        let bot_name = ws
            .state
            .bot(&ses.bot_id)
            .map(|b| b.name.as_str())
            .unwrap_or("Bot");
        hits.push(PaletteHit {
            title: ses.title.clone(),
            subtitle: format!("{bot_name} · {}", ses.updated_at),
            tag: "对话",
            target: PaletteTarget::Session(ses.id.clone()),
        });
    }
    for art in &ws.state.snapshot.artifacts {
        hits.push(PaletteHit {
            title: art.title.clone(),
            subtitle: format!("{} · {}", art.kind.label(), art.verdict.label()),
            tag: "产物",
            target: PaletteTarget::Artifact(art.id.clone()),
        });
    }
    for task in &ws.state.snapshot.tasks {
        hits.push(PaletteHit {
            title: format!("{} · {}", task.key, task.title),
            subtitle: format!("{} · {}", task.stage.label(), task.status.label()),
            tag: "任务",
            target: PaletteTarget::Task(task.id.clone()),
        });
    }
    for sch in &ws.state.snapshot.schedules {
        hits.push(PaletteHit {
            title: sch.name.clone(),
            subtitle: format!("{} · {}", sch.schedule_expr, sch.last_outcome.label()),
            tag: "定时",
            target: PaletteTarget::Schedule(sch.id.clone()),
        });
    }

    if !q.is_empty() {
        hits.retain(|h| {
            h.title.to_lowercase().contains(&q)
                || h.subtitle.to_lowercase().contains(&q)
                || h.tag.to_lowercase().contains(&q)
        });
    }
    hits.truncate(12);
    hits
}

fn animate_modal(key: &'static str, epoch: u64, card: Stateful<Div>, cx: &App) -> AnyElement {
    if epoch > 0 && !cx.reduce_motion() {
        card.with_animation(
            (key, epoch),
            Animation::new(Duration::from_millis(160)).with_easing(ease_out_quint()),
            |el, t| el.mt(px((1.0 - t) * 10.0)).opacity(t),
        )
        .into_any_element()
    } else {
        card.into_any_element()
    }
}

pub fn render_overlays(ws: &MerakWorkspace, cx: &mut Context<MerakWorkspace>) -> Vec<AnyElement> {
    let mut out = vec![];

    if ws.state.palette_open {
        let hits = matching_hits(ws, cx);
        let sel = ws.state.palette_selected.min(hits.len().saturating_sub(1));
        let mut rows = div()
            .id("palette-hits")
            .flex()
            .flex_col()
            .gap(px(2.))
            .max_h(px(360.))
            .overflow_y_scroll();

        if hits.is_empty() {
            rows = rows.child(
                div()
                    .py(px(20.))
                    .flex()
                    .justify_center()
                    .text_size(px(12.5))
                    .text_color(components::text_secondary())
                    .child("没有匹配结果"),
            );
        } else {
            for (idx, hit) in hits.into_iter().enumerate() {
                let target = hit.target;
                let active = idx == sel;
                rows = rows.child(
                    div()
                        .id(SharedString::from(format!("pal-row-{idx}")))
                        .px(px(12.))
                        .py(px(8.))
                        .rounded(px(8.))
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(10.))
                        .cursor_pointer()
                        .when(active, |d| d.bg(theme::ca(craft::N1000, 0.07)))
                        .when(!active, |d| d.hover(|s| s.bg(Theme::fill_hover())))
                        .on_click(cx.listener(move |this, _, window, cx| {
                            this.apply_palette_target(target.clone(), window, cx);
                        }))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .flex()
                                .flex_col()
                                .gap(px(2.))
                                .child(
                                    div()
                                        .text_size(px(13.))
                                        .font_weight(FontWeight::MEDIUM)
                                        .text_color(Theme::text())
                                        .overflow_hidden()
                                        .whitespace_nowrap()
                                        .text_ellipsis()
                                        .child(hit.title),
                                )
                                .child(
                                    div()
                                        .text_size(px(11.5))
                                        .text_color(components::text_secondary())
                                        .overflow_hidden()
                                        .whitespace_nowrap()
                                        .text_ellipsis()
                                        .child(hit.subtitle),
                                ),
                        )
                        .child(components::subtle_pill(hit.tag)),
                );
            }
        }

        let card = ui::dialog("command-palette")
            .w(px(580.))
            .p(px(12.))
            .bg(theme::raised(Theme::bg_body()))
            .border_1()
            .border_color(Theme::line_border())
            .rounded(px(14.))
            .shadow(theme::shadow_dialog())
            .flex()
            .flex_col()
            .gap(px(10.))
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .child(
                div()
                    .h(px(38.))
                    .px(px(12.))
                    .rounded(px(9.))
                    .border_1()
                    .border_color(Theme::line_sheet())
                    .bg(theme::raised(Theme::bg_overlay()))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .child(ui::icon("search", 15., components::text_secondary()))
                    .child(div().flex_1().min_w_0().child(ws.palette_input.clone()))
                    .child(div().text_size(px(11.)).text_color(components::text_muted()).child("ESC")),
            )
            .child(rows);
        let animated_card = animate_modal("pal-anim", ws.palette_epoch, card, cx);
        let modal = div()
            .id("palette-backdrop")
            .absolute()
            .inset_0()
            .bg(ui::scrim())
            .flex()
            .justify_center()
            .items_start()
            .pt(px(90.))
            .on_mouse_down(MouseButton::Left, cx.listener(|this, _, _, cx| {
                this.state.palette_open = false;
                cx.notify();
            }))
            .child(animated_card);
        out.push(modal.into_any_element());
    }

    if ws.state.new_project_open {
        let mode = ws.state.new_project_mode;
        let is_git = mode == NewProjectMode::FromGitRepo;

        let seg_bg = if theme::dark() {
            theme::rgbaf(0xff, 0xff, 0xff, 0.06)
        } else {
            theme::ca(craft::N1000, 0.045)
        };
        let active_bg = if theme::dark() {
            theme::raised(Theme::bg_body())
        } else {
            theme::c(craft::N00)
        };
        let field_bg = if theme::dark() {
            theme::rgbaf(0xff, 0xff, 0xff, 0.03)
        } else {
            Theme::bg_body()
        };

        let mut mode_track = div()
            .p(px(3.))
            .rounded(px(9.))
            .bg(seg_bg)
            .flex()
            .items_center()
            .gap(px(2.));
        for m in NewProjectMode::ALL {
            let on = mode == m;
            mode_track = mode_track.child(
                div()
                    .id(SharedString::from(format!("new-proj-mode-{}", m.label())))
                    .flex_1()
                    .h(px(28.))
                    .rounded(px(7.))
                    .flex()
                    .items_center()
                    .justify_center()
                    .cursor_pointer()
                    .text_size(px(12.5))
                    .font_weight(if on { FontWeight::SEMIBOLD } else { FontWeight::NORMAL })
                    .when(on, |d| {
                        d.bg(active_bg)
                            .text_color(Theme::text())
                            .shadow(theme::shadow_button())
                    })
                    .when(!on, |d| {
                        d.text_color(components::text_secondary())
                            .hover(|s| s.text_color(Theme::text()))
                    })
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.state.new_project_mode = m;
                        if m == NewProjectMode::FromGitRepo {
                            this.new_project_repo_input.focus_handle(cx).focus(window, cx);
                        } else {
                            this.new_project_name_input.focus_handle(cx).focus(window, cx);
                        }
                        cx.notify();
                    }))
                    .child(m.label()),
            );
        }

        let mode_hint = if is_git {
            "从本机 Git 仓库建立项目，自动识别分支、未提交变更与 Worktree 隔离。"
        } else {
            "无需选择文件夹，先创建项目桌面；随后可直接整理资料并与 Bot 对话。"
        };

        let mut swatch_row = div().flex().items_center().gap(px(8.));
        for hex in PROJECT_COLORS {
            let picked = ws.state.new_project_color == hex;
            swatch_row = swatch_row.child(
                div()
                    .id(SharedString::from(format!("new-proj-col-{hex:x}")))
                    .size(px(22.))
                    .rounded_full()
                    .cursor_pointer()
                    .border(px(if picked { 2. } else { 1. }))
                    .border_color(if picked {
                        Theme::text()
                    } else {
                        transparent_black()
                    })
                    .flex()
                    .items_center()
                    .justify_center()
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.state.new_project_color = hex;
                        cx.notify();
                    }))
                    .child(div().size(px(14.)).rounded_full().bg(theme::c(hex))),
            );
        }

        let mut bot_row = div().flex().items_center().flex_wrap().gap(px(6.));
        for bot in &ws.state.snapshot.bots {
            let bid = bot.id.clone();
            let active = ws.state.new_project_bot_id == bid;
            let dot = components::bot_status_dot_color(bot.status);
            bot_row = bot_row.child(
                div()
                    .id(SharedString::from(format!("new-proj-bot-{bid}")))
                    .h(px(28.))
                    .px(px(10.))
                    .rounded_full()
                    .border_1()
                    .border_color(if active {
                        Theme::line_sheet()
                    } else {
                        Theme::line_divider()
                    })
                    .when(active, |d| d.bg(seg_bg))
                    .when(!active, |d| d.hover(|s| s.bg(Theme::fill_hover())))
                    .cursor_pointer()
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.state.new_project_bot_id = bid.clone();
                        cx.notify();
                    }))
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .child(components::status_dot(dot))
                    .child(
                        div()
                            .text_size(px(12.))
                            .font_weight(if active { FontWeight::SEMIBOLD } else { FontWeight::NORMAL })
                            .text_color(if active { Theme::text() } else { components::text_secondary() })
                            .child(bot.name.clone()),
                    ),
            );
        }

        let probe_line: Option<AnyElement> = if is_git {
            if ws.new_project_repo_probing {
                Some(
                    div()
                        .text_size(px(11.5))
                        .text_color(components::text_muted())
                        .child("正在检测本地 Git 仓库...")
                        .into_any_element(),
                )
            } else {
                ws.new_project_repo_probe.as_ref().map(|st| {
                    if st.is_git_repo {
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .child(components::status_dot(components::positive_color()))
                            .child(
                                div()
                                    .text_size(px(11.5))
                                    .text_color(components::text_secondary())
                                    .overflow_hidden()
                                    .whitespace_nowrap()
                                    .text_ellipsis()
                                    .child(format!(
                                        "已识别 Git 仓库 · 分支 {} ({})",
                                        st.branch, st.head_short
                                    )),
                            )
                            .into_any_element()
                    } else {
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .child(components::status_dot(components::negative_color()))
                            .child(
                                div()
                                    .text_size(px(11.5))
                                    .text_color(components::negative_color())
                                    .child(st.error.clone().unwrap_or_else(|| "无效目录".into())),
                            )
                            .into_any_element()
                    }
                })
            }
        } else {
            None
        };

        let card = ui::dialog("new-project-modal")
            .w(px(520.))
            .p(px(20.))
            .bg(theme::raised(Theme::bg_body()))
            .border_1()
            .border_color(Theme::line_border())
            .rounded(px(16.))
            .shadow(theme::shadow_dialog())
            .flex()
            .flex_col()
            .gap(px(14.))
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div()
                            .text_size(px(16.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(Theme::text())
                            .child("新建项目"),
                    )
                    .child(
                        div()
                            .id("new-proj-close")
                            .size(px(26.))
                            .rounded(px(7.))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .hover(|s| s.bg(Theme::fill_hover()))
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.close_new_project_modal(window, cx);
                            }))
                            .child(ui::icon("x", 14., components::text_muted())),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(6.))
                    .child(mode_track)
                    .child(
                        div()
                            .text_size(px(12.))
                            .text_color(components::text_secondary())
                            .child(mode_hint),
                    ),
            )
            .when(is_git, |d| {
                d.child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(6.))
                        .child(
                            div()
                                .text_size(px(12.))
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(Theme::text())
                                .child("本地 Git 仓库"),
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.))
                                .child(
                                    div()
                                        .id("new-proj-repo-box")
                                        .flex_1()
                                        .min_w_0()
                                        .h(px(34.))
                                        .px(px(10.))
                                        .rounded(px(8.))
                                        .border_1()
                                        .border_color(Theme::line_sheet())
                                        .bg(field_bg)
                                        .flex()
                                        .items_center()
                                        .gap(px(6.))
                                        .cursor_text()
                                        .on_mouse_down(MouseButton::Left, cx.listener(|this, _, window, cx| {
                                            this.new_project_repo_input.focus_handle(cx).focus(window, cx);
                                            cx.notify();
                                        }))
                                        .child(ui::icon("git-branch", 13., components::text_muted()))
                                        .child(div().flex_1().min_w_0().child(ws.new_project_repo_input.clone())),
                                )
                                .child(
                                    ui::secondary_button("new-proj-probe", "检测").on_click(cx.listener(
                                        |this, _, window, cx| {
                                            this.probe_new_project_repo(window, cx);
                                        },
                                    )),
                                )
                                .child(
                                    ui::secondary_button("new-proj-pick-dir", "选择文件夹...").on_click(
                                        cx.listener(|this, _, window, cx| {
                                            this.pick_new_project_git_dir(window, cx);
                                        }),
                                    ),
                                ),
                        )
                        .children(probe_line),
                )
            })
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(6.))
                    .child(
                        div()
                            .text_size(px(12.))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(Theme::text())
                            .child("项目名称"),
                    )
                    .child(
                        div()
                            .id("new-proj-name-box")
                            .h(px(36.))
                            .px(px(11.))
                            .rounded(px(8.))
                            .border_1()
                            .border_color(Theme::line_sheet())
                            .bg(field_bg)
                            .flex()
                            .items_center()
                            .cursor_text()
                            .on_mouse_down(MouseButton::Left, cx.listener(|this, _, window, cx| {
                                this.new_project_name_input.focus_handle(cx).focus(window, cx);
                                cx.notify();
                            }))
                            .child(div().flex_1().min_w_0().child(ws.new_project_name_input.clone())),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(6.))
                    .child(
                        div()
                            .text_size(px(12.))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(Theme::text())
                            .child("简介（可选）"),
                    )
                    .child(
                        div()
                            .id("new-proj-summary-box")
                            .h(px(36.))
                            .px(px(11.))
                            .rounded(px(8.))
                            .border_1()
                            .border_color(Theme::line_divider())
                            .bg(field_bg)
                            .flex()
                            .items_center()
                            .cursor_text()
                            .on_mouse_down(MouseButton::Left, cx.listener(|this, _, window, cx| {
                                this.new_project_summary_input.focus_handle(cx).focus(window, cx);
                                cx.notify();
                            }))
                            .child(div().flex_1().min_w_0().child(ws.new_project_summary_input.clone())),
                    ),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(12.))
                    .child(
                        div()
                            .text_size(px(12.))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(Theme::text())
                            .child("标识颜色"),
                    )
                    .child(swatch_row),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(7.))
                    .child(
                        div()
                            .text_size(px(12.))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(Theme::text())
                            .child("默认负责 Bot"),
                    )
                    .child(bot_row),
            )
            .child(
                div()
                    .pt(px(6.))
                    .border_t_1()
                    .border_color(Theme::line_divider())
                    .flex()
                    .items_center()
                    .justify_end()
                    .gap(px(8.))
                    .child(
                        ui::secondary_button("new-proj-cancel", "取消").on_click(cx.listener(
                            |this, _, window, cx| {
                                this.close_new_project_modal(window, cx);
                            },
                        )),
                    )
                    .child(
                        ui::primary_button("new-proj-submit", "创建项目").on_click(cx.listener(
                            |this, _, window, cx| {
                                this.submit_new_project(window, cx);
                            },
                        )),
                    ),
            );

        let animated_card = animate_modal("new-proj-anim", ws.new_project_epoch, card, cx);
        let modal = div()
            .id("new-project-backdrop")
            .absolute()
            .inset_0()
            .bg(ui::scrim())
            .flex()
            .justify_center()
            .items_start()
            .pt(px(84.))
            .on_mouse_down(MouseButton::Left, cx.listener(|this, _, window, cx| {
                this.close_new_project_modal(window, cx);
            }))
            .child(animated_card);
        out.push(modal.into_any_element());
    }

    let _ = DecisionPaneTab::Verify;
    out
}
