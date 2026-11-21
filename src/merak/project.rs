use super::components;
use super::git_repo;
use super::schedules;
use super::state::{ArtifactFilter, ProjectTab};
use super::tasks;
use super::MerakWorkspace;
use crate::theme::{self, craft, Theme};
use crate::ui;
use gpui::{prelude::FluentBuilder, *};
use merak_contracts::{Artifact, ArtifactKind, ArtifactVerdict, ClaimStatus, Project, VerifyJudge};

pub fn render_project(
    ws: &MerakWorkspace,
    project_id: &str,
    viewport_w: f32,
    cx: &mut Context<MerakWorkspace>,
) -> Div {
    let Some(proj) = ws.state.project(project_id).cloned() else {
        return div().size_full().items_center().justify_center().child("未找到项目");
    };

    let dot = theme::c(proj.color_hex);

    let mut tab_bar = div().flex().items_center().gap(px(22.));
    for tab in ProjectTab::ALL {
        let on = ws.state.project_tab == tab;
        tab_bar = tab_bar.child(
            components::text_tab(
                SharedString::from(format!("ptab-{}", tab.label())),
                tab.label(),
                on,
            )
            .on_click(cx.listener(move |this, _, _, cx| {
                this.state.project_tab = tab;
                this.state.task_inspector_open = false;
                this.state.schedule_inspector_open = false;
                cx.notify();
            })),
        );
    }

    let mut filter_bar = div().flex().items_center().flex_wrap().gap(px(4.));
    for flt in ArtifactFilter::ALL {
        let on = ws.state.artifact_filter == flt;
        filter_bar = filter_bar.child(
            components::text_filter(
                SharedString::from(format!("art-flt-{}", flt.label())),
                flt.label(),
                on,
            )
            .on_click(cx.listener(move |this, _, _, cx| {
                this.state.artifact_filter = flt;
                cx.notify();
            })),
        );
    }

    let header = div()
        .border_b_1()
        .border_color(Theme::line_divider())
        .child(
            div()
                .max_w(px(1160.))
                .w_full()
                .mx_auto()
                .px(px(32.))
                .pt(px(24.))
                .pb(px(0.))
                .flex()
                .flex_col()
                .gap(px(14.))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(12.))
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(10.))
                                .child(div().size(px(9.)).rounded_full().bg(dot).flex_none())
                                .child(
                                    div()
                                        .text_size(px(22.))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(Theme::text())
                                        .child(proj.name.clone()),
                                ),
                        )
                        .child(render_header_git_pill(ws, &proj, cx)),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(16.))
                        .child(tab_bar)
                        .when(ws.state.project_tab == ProjectTab::Artifacts, |d| {
                            d.child(div().pb(px(6.)).child(filter_bar))
                        }),
                ),
        );

    let body: AnyElement = match ws.state.project_tab {
        ProjectTab::Artifacts => {
            let arts = ws.state.project_artifacts(project_id);
            let cols = if viewport_w < 1040. { 2 } else { 3 };
            let mut grid = div()
                .max_w(px(1160.))
                .w_full()
                .mx_auto()
                .px(px(32.))
                .py(px(24.))
                .flex()
                .flex_col()
                .gap(px(20.));

            if arts.is_empty() {
                grid = grid.child(
                    div()
                        .w_full()
                        .rounded(px(12.))
                        .border_1()
                        .border_color(Theme::line_divider())
                        .py(px(48.))
                        .px(px(24.))
                        .flex()
                        .flex_col()
                        .items_center()
                        .gap(px(8.))
                        .child(ui::icon("whiteboard", 22., components::text_muted()))
                        .child(
                            div()
                                .text_size(px(14.))
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(Theme::text())
                                .child("当前筛选下暂无产物"),
                        )
                        .child(
                            div()
                                .text_size(px(12.5))
                                .text_color(components::text_secondary())
                                .child("点击左上角新建或切换上方筛选查看全部内容"),
                        ),
                );
            } else {
                for chunk in arts.chunks(cols) {
                    let mut row = div().w_full().flex().gap(px(20.));
                    for art in chunk {
                        row = row.child(render_artifact_card(ws, art, cx));
                    }
                    for _ in chunk.len()..cols {
                        row = row.child(div().flex_1().min_w_0());
                    }
                    grid = grid.child(row);
                }
            }

            div()
                .id("proj-artifacts-scroll")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .child(grid)
                .into_any_element()
        }
        ProjectTab::Tasks => {
            let tlist = ws.state.project_tasks(project_id);
            tasks::render_task_cards(ws, tlist, false, 1160., cx).into_any_element()
        }
        ProjectTab::Schedules => {
            let slist = ws.state.project_schedules(project_id);
            schedules::render_schedule_list(ws, slist, false, 1160., cx).into_any_element()
        }
        ProjectTab::Repos => render_project_repos(ws, &proj, cx).into_any_element(),
    };

    div().size_full().flex().flex_col().child(header).child(body)
}

fn render_header_git_pill(
    ws: &MerakWorkspace,
    proj: &Project,
    cx: &mut Context<MerakWorkspace>,
) -> Stateful<Div> {
    if let Some(first_repo) = proj.repo_paths.first() {
        let short_name = git_repo::short_repo_name(first_repo);
        let st = ws.git_cache.get(first_repo);
        let (dot_col, branch_label, dirty) = match st {
            Some(s) if s.is_git_repo => (
                if s.dirty_count > 0 {
                    components::attention_color()
                } else {
                    components::positive_color()
                },
                s.branch.clone(),
                s.dirty_count,
            ),
            Some(_) => (components::negative_color(), "未初始化".into(), 0),
            None => (components::text_muted(), "检测中".into(), 0),
        };
        let extra = proj.repo_paths.len().saturating_sub(1);
        div()
            .id(SharedString::from(format!("proj-git-pill-{}", proj.id)))
            .h(px(28.))
            .px(px(10.))
            .rounded_full()
            .border_1()
            .border_color(Theme::line_border())
            .bg(theme::raised(Theme::bg_body()))
            .cursor_pointer()
            .hover(|s| s.border_color(Theme::line_sheet()).bg(Theme::fill_hover()))
            .on_click(cx.listener(|this, _, _, cx| {
                this.state.project_tab = ProjectTab::Repos;
                cx.notify();
            }))
            .flex()
            .items_center()
            .gap(px(6.))
            .child(ui::icon("git-branch", 12.5, components::text_secondary()))
            .child(
                div()
                    .text_size(px(12.))
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(Theme::text())
                    .child(short_name),
            )
            .child(components::status_dot(dot_col))
            .child(
                div()
                    .font_family(theme::MONO_FONT)
                    .text_size(px(11.5))
                    .text_color(components::text_secondary())
                    .child(branch_label),
            )
            .when(dirty > 0, |d| {
                d.child(
                    div()
                        .text_size(px(11.))
                        .text_color(components::attention_color())
                        .child(format!("{dirty} 变更")),
                )
            })
            .when(extra > 0, |d| {
                d.child(
                    div()
                        .text_size(px(11.))
                        .text_color(components::text_muted())
                        .child(format!("+{extra}")),
                )
            })
    } else {
        div()
            .id(SharedString::from(format!("proj-bind-git-pill-{}", proj.id)))
            .h(px(28.))
            .px(px(10.))
            .rounded_full()
            .border_1()
            .border_color(Theme::line_border())
            .cursor_pointer()
            .hover(|s| s.bg(Theme::fill_hover()))
            .on_click(cx.listener(|this, _, _, cx| {
                this.state.project_tab = ProjectTab::Repos;
                cx.notify();
            }))
            .flex()
            .items_center()
            .gap(px(5.))
            .child(ui::icon("git-branch", 12., components::text_muted()))
            .child(
                div()
                    .text_size(px(12.))
                    .text_color(components::text_secondary())
                    .child("+ 绑定 Git 仓库"),
            )
    }
}

fn render_project_repos(
    ws: &MerakWorkspace,
    proj: &Project,
    cx: &mut Context<MerakWorkspace>,
) -> Stateful<Div> {
    let pid = proj.id.clone();
    let pid_bind = pid.clone();
    let pid_pick = pid.clone();
    let pid_refresh = pid.clone();

    let bind_card = div()
        .w_full()
        .rounded(px(12.))
        .border_1()
        .border_color(Theme::line_border())
        .bg(theme::raised(Theme::bg_body()))
        .p(px(18.))
        .flex()
        .flex_col()
        .gap(px(12.))
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .gap(px(12.))
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(3.))
                        .child(
                            div()
                                .text_size(px(14.5))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(Theme::text())
                                .child("绑定本地 Git 仓库"),
                        )
                        .child(
                            div()
                                .text_size(px(12.5))
                                .text_color(components::text_secondary())
                                .child("绑定后，项目下的 Bot 对话、决策白板与定时巡检会自动关联真实分支、未提交变更及独立 Worktree 状态。"),
                        ),
                )
                .child(
                    ui::secondary_button("repo-refresh-btn", "刷新状态").on_click(cx.listener(
                        move |this, _, window, cx| {
                            this.refresh_git_repos_for_project(&pid_refresh, window, cx);
                            this.show_toast(ui::ToastKind::Info, "正在重新检测 Git 仓库状态", window, cx);
                        },
                    )),
                ),
        )
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(8.))
                .child(
                    div()
                        .id("git-repo-input-box")
                        .flex_1()
                        .min_w_0()
                        .h(px(34.))
                        .px(px(11.))
                        .rounded(px(8.))
                        .border_1()
                        .border_color(Theme::line_sheet())
                        .bg(Theme::bg_body())
                        .flex()
                        .items_center()
                        .gap(px(7.))
                        .cursor_text()
                        .on_mouse_down(MouseButton::Left, cx.listener(|this, _, window, cx| {
                            this.git_repo_input.focus_handle(cx).focus(window, cx);
                            cx.notify();
                        }))
                        .child(ui::icon("folder", 14., components::text_muted()))
                        .child(div().flex_1().min_w_0().child(ws.git_repo_input.clone())),
                )
                .child(
                    ui::secondary_button("repo-bind-path-btn", "绑定路径").on_click(cx.listener(
                        move |this, _, window, cx| {
                            let raw = this.git_repo_input.read(cx).text.clone();
                            this.git_repo_input.update(cx, |f, cx| f.set_text("", cx));
                            this.bind_git_repo_path(&pid_bind, raw, window, cx);
                        },
                    )),
                )
                .child(
                    ui::primary_button("repo-pick-dir-btn", "选择文件夹...").on_click(cx.listener(
                        move |this, _, window, cx| {
                            this.pick_and_bind_git_repo(&pid_pick, window, cx);
                        },
                    )),
                ),
        );

    let mut content = div()
        .max_w(px(1160.))
        .w_full()
        .mx_auto()
        .px(px(32.))
        .py(px(24.))
        .flex()
        .flex_col()
        .gap(px(18.))
        .child(bind_card);

    if proj.repo_paths.is_empty() {
        content = content.child(
            div()
                .w_full()
                .rounded(px(12.))
                .border_1()
                .border_color(Theme::line_divider())
                .py(px(44.))
                .px(px(24.))
                .flex()
                .flex_col()
                .items_center()
                .gap(px(8.))
                .child(ui::icon("git-branch", 22., components::text_muted()))
                .child(
                    div()
                        .text_size(px(14.))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(Theme::text())
                        .child("当前项目还没有绑定 Git 仓库"),
                )
                .child(
                    div()
                        .text_size(px(12.5))
                        .text_color(components::text_secondary())
                        .child("点击上方「选择文件夹...」或直接粘贴本机代码仓路径（支持 ~ 开头）。"),
                ),
        );
    } else {
        let mut cards = div().flex().flex_col().gap(px(12.));
        for (idx, repo_path) in proj.repo_paths.iter().enumerate() {
            let short_name = git_repo::short_repo_name(repo_path);
            let status = ws.git_cache.get(repo_path).cloned();
            let path_copy = repo_path.clone();
            let path_primary = repo_path.clone();
            let path_unbind = repo_path.clone();
            let pid_primary = pid.clone();
            let pid_unbind = pid.clone();

            let (dot_col, state_text) = match status.as_ref() {
                Some(s) if s.is_git_repo && s.dirty_count == 0 => {
                    (components::positive_color(), "已连接 · 工作区干净".to_string())
                }
                Some(s) if s.is_git_repo => (
                    components::attention_color(),
                    format!("已连接 · {} 处未提交变更", s.dirty_count),
                ),
                Some(s) => (
                    if s.exists {
                        components::negative_color()
                    } else {
                        components::text_muted()
                    },
                    s.error.clone().unwrap_or_else(|| "无法读取 Git 状态".into()),
                ),
                None => (components::text_muted(), "正在后台检测...".into()),
            };

            let mut card = div()
                .id(SharedString::from(format!("repo-card-{idx}")))
                .w_full()
                .rounded(px(12.))
                .border_1()
                .border_color(Theme::line_border())
                .bg(theme::raised(Theme::bg_body()))
                .p(px(18.))
                .flex()
                .flex_col()
                .gap(px(12.))
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
                                .flex_wrap()
                                .gap(px(8.))
                                .child(ui::icon("git-branch", 15., Theme::text()))
                                .child(
                                    div()
                                        .text_size(px(15.))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(Theme::text())
                                        .child(short_name),
                                )
                                .when(idx == 0, |d| d.child(components::subtle_pill("主仓库")))
                                .child(
                                    div()
                                        .flex()
                                        .items_center()
                                        .gap(px(5.))
                                        .child(components::status_dot(dot_col))
                                        .child(
                                            div()
                                                .text_size(px(12.))
                                                .text_color(components::text_secondary())
                                                .child(state_text),
                                        ),
                                ),
                        )
                        .child(
                            div()
                                .flex_none()
                                .flex()
                                .items_center()
                                .gap(px(6.))
                                .when(idx > 0, |d| {
                                    d.child(
                                        repo_action_btn(
                                            SharedString::from(format!("repo-primary-{idx}")),
                                            "设为默认",
                                        )
                                        .on_click(cx.listener(
                                            move |this, _, window, cx| {
                                                if this.state.set_primary_project_repo(&pid_primary, &path_primary) {
                                                    this.show_toast(ui::ToastKind::Success, "已设为项目主仓库", window, cx);
                                                }
                                            },
                                        )),
                                    )
                                })
                                .child(
                                    repo_action_btn(
                                        SharedString::from(format!("repo-copy-{idx}")),
                                        "复制路径",
                                    )
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        cx.write_to_clipboard(ClipboardItem::new_string(path_copy.clone()));
                                        this.show_toast(ui::ToastKind::Info, "已复制仓库路径", window, cx);
                                    })),
                                )
                                .child(
                                    repo_action_btn(
                                        SharedString::from(format!("repo-unbind-{idx}")),
                                        "解绑",
                                    )
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        if this.state.unbind_project_repo(&pid_unbind, &path_unbind) {
                                            this.show_toast(ui::ToastKind::Info, "已从当前项目解绑仓库", window, cx);
                                        }
                                    })),
                                ),
                        ),
                )
                .child(
                    div()
                        .font_family(theme::MONO_FONT)
                        .text_size(px(12.))
                        .text_color(components::text_secondary())
                        .child(repo_path.clone()),
                );

            if let Some(s) = status.filter(|s| s.is_git_repo) {
                card = card.child(
                    div()
                        .pt(px(10.))
                        .border_t_1()
                        .border_color(Theme::line_divider())
                        .flex()
                        .flex_wrap()
                        .items_center()
                        .gap(px(14.))
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.))
                                .child(
                                    div()
                                        .text_size(px(11.5))
                                        .text_color(components::text_muted())
                                        .child("当前分支"),
                                )
                                .child(
                                    div()
                                        .px(px(7.))
                                        .py(px(2.))
                                        .rounded(px(6.))
                                        .bg(theme::ca(craft::N1000, 0.055))
                                        .font_family(theme::MONO_FONT)
                                        .text_size(px(12.))
                                        .text_color(Theme::text())
                                        .child(format!("{} ({})", s.branch, s.head_short)),
                                ),
                        )
                        .when_some(s.remote_url.clone(), |d, remote| {
                            d.child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(6.))
                                    .child(
                                        div()
                                            .text_size(px(11.5))
                                            .text_color(components::text_muted())
                                            .child("Origin"),
                                    )
                                    .child(
                                        div()
                                            .max_w(px(360.))
                                            .font_family(theme::MONO_FONT)
                                            .text_size(px(11.5))
                                            .text_color(components::text_secondary())
                                            .overflow_hidden()
                                            .whitespace_nowrap()
                                            .text_ellipsis()
                                            .child(remote),
                                    ),
                            )
                        })
                        .when_some(s.last_commit_subject.clone(), |d, subj| {
                            d.child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(6.))
                                    .child(
                                        div()
                                            .text_size(px(11.5))
                                            .text_color(components::text_muted())
                                            .child("最近提交"),
                                    )
                                    .child(
                                        div()
                                            .max_w(px(340.))
                                            .text_size(px(12.))
                                            .text_color(components::text_secondary())
                                            .overflow_hidden()
                                            .whitespace_nowrap()
                                            .text_ellipsis()
                                            .child(subj),
                                    ),
                            )
                        }),
                );

                if s.worktrees.len() > 1 {
                    let mut wt_list = div()
                        .pt(px(10.))
                        .border_t_1()
                        .border_color(Theme::line_divider())
                        .flex()
                        .flex_col()
                        .gap(px(6.))
                        .child(
                            div()
                                .text_size(px(11.5))
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(components::text_muted())
                                .child(format!("Git Worktrees ({})", s.worktrees.len())),
                        );
                    for wt in &s.worktrees {
                        wt_list = wt_list.child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(10.))
                                .child(components::subtle_pill(wt.branch.clone()))
                                .child(
                                    div()
                                        .font_family(theme::MONO_FONT)
                                        .text_size(px(11.5))
                                        .text_color(components::text_secondary())
                                        .child(wt.path.clone()),
                                ),
                        );
                    }
                    card = card.child(wt_list);
                } else {
                    card = card.child(
                        div()
                            .text_size(px(11.5))
                            .text_color(components::text_muted())
                            .child(format!(
                                "{} 个工作树 · {}",
                                s.worktrees.len().max(1),
                                if ws.state.worktree_isolate_bots {
                                    "已开启多 Bot 并发 Worktree 隔离"
                                } else {
                                    "多 Bot 并发共享当前工作树"
                                }
                            )),
                    );
                }
            }

            cards = cards.child(card);
        }
        content = content.child(cards);
    }

    div()
        .id("proj-repos-scroll")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .child(content)
}

fn repo_action_btn(id: SharedString, label: &'static str) -> Stateful<Div> {
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

fn render_artifact_card(
    ws: &MerakWorkspace,
    art: &Artifact,
    cx: &mut Context<MerakWorkspace>,
) -> Stateful<Div> {
    let aid = art.id.clone();
    let pending_human = art.verdict == ArtifactVerdict::PendingHuman;
    let preview: AnyElement = match art.kind {
        ArtifactKind::DecisionCanvas => {
            if let Some(board) = ws.artifact_board_thumbs.get(&aid).cloned() {
                let bg = crate::board::render::canvas_color(&board);
                div()
                    .size_full()
                    .bg(bg)
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
                    .size_full()
                    .bg(theme::ca(craft::N1000, 0.03))
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(ui::icon("whiteboard", 22., components::text_muted()))
                    .into_any_element()
            }
        }
        ArtifactKind::VerifyReport => {
            let (agent_ok, agent_total, human_pending, open_gaps) = if let Some(rep) = &art.verify_report {
                (
                    rep.claims
                        .iter()
                        .filter(|c| c.judge == VerifyJudge::Agent && c.status == ClaimStatus::Verified)
                        .count(),
                    rep.claims.iter().filter(|c| c.judge == VerifyJudge::Agent).count(),
                    rep.claims
                        .iter()
                        .filter(|c| c.judge == VerifyJudge::Human && c.status == ClaimStatus::PendingHuman)
                        .count(),
                    rep.gaps.iter().filter(|g| !g.waived).count(),
                )
            } else {
                (0, 0, 0, 0)
            };
            div()
                .size_full()
                .bg(theme::ca(craft::N1000, 0.025))
                .p(px(18.))
                .flex()
                .flex_col()
                .justify_between()
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(9.))
                        .child(preview_stat_row(
                            components::positive_color(),
                            "机器自证",
                            format!("{agent_ok}/{agent_total}"),
                        ))
                        .child(preview_stat_row(
                            if human_pending > 0 {
                                components::attention_color()
                            } else {
                                components::positive_color()
                            },
                            "人类裁决",
                            if human_pending > 0 {
                                format!("{human_pending}")
                            } else {
                                "完成".into()
                            },
                        ))
                        .child(preview_stat_row(
                            if open_gaps > 0 {
                                components::attention_color()
                            } else {
                                components::text_muted()
                            },
                            "未覆盖盲区",
                            format!("{open_gaps}"),
                        )),
                )
                .child(
                    div()
                        .h(px(4.))
                        .w_full()
                        .rounded_full()
                        .bg(theme::ca(craft::N1000, 0.08))
                        .overflow_hidden()
                        .child(
                            div()
                                .h_full()
                                .w(relative(if agent_total > 0 { 0.65 } else { 0.25 }))
                                .rounded_full()
                                .bg(components::positive_color()),
                        ),
                )
                .into_any_element()
        }
        ArtifactKind::SpecDoc => {
            let lines: Vec<String> = art
                .doc_markdown
                .as_deref()
                .unwrap_or("")
                .lines()
                .map(|l| l.trim().trim_start_matches('#').trim())
                .filter(|l| !l.is_empty())
                .take(4)
                .map(str::to_string)
                .collect();
            let mut sheet = div()
                .size_full()
                .rounded(px(6.))
                .bg(Theme::bg_body())
                .border_1()
                .border_color(Theme::line_divider())
                .p(px(12.))
                .overflow_hidden()
                .flex()
                .flex_col()
                .gap(px(5.));
            for (idx, line) in lines.into_iter().enumerate() {
                sheet = sheet.child(
                    div()
                        .text_size(px(if idx == 0 { 12. } else { 10.5 }))
                        .font_weight(if idx == 0 { FontWeight::SEMIBOLD } else { FontWeight::NORMAL })
                        .text_color(if idx == 0 { Theme::text() } else { components::text_secondary() })
                        .overflow_hidden()
                        .whitespace_nowrap()
                        .text_ellipsis()
                        .child(line),
                );
            }
            div()
                .size_full()
                .bg(theme::ca(craft::N1000, 0.03))
                .p(px(14.))
                .child(sheet)
                .into_any_element()
        }
        ArtifactKind::DataTable => {
            let rows_preview = [
                ("MRK-101", "方案定稿", "待裁决"),
                ("MRK-102", "TDD 执行", "进行中"),
                ("MRK-103", "双轨验收", "已完成"),
            ];
            let mut tbl = div()
                .size_full()
                .rounded(px(6.))
                .bg(Theme::bg_body())
                .border_1()
                .border_color(Theme::line_divider())
                .overflow_hidden()
                .flex()
                .flex_col();
            for (i, (c1, c2, c3)) in rows_preview.iter().enumerate() {
                tbl = tbl.child(
                    div()
                        .flex_1()
                        .px(px(10.))
                        .border_b_1()
                        .border_color(if i < 2 { Theme::line_divider() } else { transparent_black() })
                        .flex()
                        .items_center()
                        .justify_between()
                        .text_size(px(10.5))
                        .text_color(components::text_secondary())
                        .child(
                            div()
                                .font_family(theme::MONO_FONT)
                                .text_color(Theme::text())
                                .child(*c1),
                        )
                        .child(*c2)
                        .child(*c3),
                );
            }
            div()
                .size_full()
                .bg(theme::ca(craft::N1000, 0.03))
                .p(px(16.))
                .child(tbl)
                .into_any_element()
        }
    };

    div()
        .id(SharedString::from(format!("art-card-{aid}")))
        .flex_1()
        .min_w_0()
        .rounded(px(12.))
        .border_1()
        .border_color(Theme::line_border())
        .bg(theme::raised(Theme::bg_body()))
        .overflow_hidden()
        .cursor_pointer()
        .hover(|s| s.border_color(Theme::line_sheet()))
        .on_click(cx.listener(move |this, _, window, cx| {
            this.open_artifact_in_decision_pane(&aid, window, cx);
        }))
        .flex()
        .flex_col()
        .child(
            div()
                .w_full()
                .h(px(172.))
                .border_b_1()
                .border_color(Theme::line_divider())
                .overflow_hidden()
                .child(preview),
        )
        .child(
            div()
                .px(px(14.))
                .py(px(12.))
                .flex()
                .flex_col()
                .gap(px(4.))
                .child(
                    div()
                        .text_size(px(13.5))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(Theme::text())
                        .overflow_hidden()
                        .whitespace_nowrap()
                        .text_ellipsis()
                        .child(art.title.clone()),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(8.))
                        .text_size(px(11.5))
                        .text_color(components::text_secondary())
                        .child(art.kind.label())
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(5.))
                                .when(pending_human, |d| {
                                    d.child(components::status_dot(components::attention_color()))
                                        .child(
                                            div()
                                                .text_color(Theme::text())
                                                .child("待裁决"),
                                        )
                                })
                                .when(!pending_human, |d| {
                                    d.child(
                                        div()
                                            .text_color(components::text_muted())
                                            .child(art.updated_at.clone()),
                                    )
                                }),
                        ),
                ),
        )
}

fn preview_stat_row(dot_color: Hsla, label: &'static str, value: String) -> Div {
    div()
        .flex()
        .items_center()
        .justify_between()
        .text_size(px(11.5))
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(7.))
                .text_color(components::text_secondary())
                .child(components::status_dot(dot_color))
                .child(label),
        )
        .child(
            div()
                .font_family(theme::MONO_FONT)
                .text_color(Theme::text())
                .child(value),
        )
}
