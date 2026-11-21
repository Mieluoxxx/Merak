use super::components;
use super::state::{InboxFilter, PrimaryNav, SessionDeliverable, SettingsSection};
use super::MerakWorkspace;
use crate::store::Store;
use crate::theme::{self, Theme};
use crate::ui;
use gpui::{prelude::FluentBuilder, *};
use merak_contracts::ScheduleNotifyPolicy;
use std::time::Duration;

fn off_track_bg() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0xff, 0xff, 0xff, 0.16)
    } else {
        theme::rgbaf(0x00, 0x00, 0x00, 0.14)
    }
}

fn keycap_bg() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0xff, 0xff, 0xff, 0.06)
    } else {
        theme::rgbaf(0x00, 0x00, 0x00, 0.045)
    }
}

fn flat_section(title: &'static str, rows: Vec<AnyElement>) -> Div {
    let mut sec = div()
        .flex()
        .flex_col()
        .child(
            div()
                .pb(px(6.))
                .text_size(px(13.))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(Theme::text())
                .child(title),
        );
    for row in rows {
        sec = sec.child(
            div()
                .py(px(15.))
                .border_b_1()
                .border_color(Theme::line_divider())
                .child(row),
        );
    }
    sec
}

fn flat_row(
    title: impl Into<SharedString>,
    desc: impl Into<SharedString>,
    control: AnyElement,
) -> AnyElement {
    div()
        .flex()
        .items_center()
        .justify_between()
        .gap(px(24.))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(3.))
                .child(
                    div()
                        .text_size(px(13.5))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(Theme::text())
                        .child(title.into()),
                )
                .child(
                    div()
                        .text_size(px(12.5))
                        .line_height(px(18.5))
                        .text_color(components::text_secondary())
                        .child(ui::ui_para(desc.into())),
                ),
        )
        .child(div().flex_none().child(control))
        .into_any_element()
}

fn toggle_switch(id: &'static str, checked: bool) -> Stateful<Div> {
    div()
        .id(id)
        .w(px(38.))
        .h(px(22.))
        .p(px(2.))
        .rounded_full()
        .bg(if checked { Theme::primary() } else { off_track_bg() })
        .cursor_pointer()
        .flex()
        .items_center()
        .when(checked, |d| d.justify_end())
        .when(!checked, |d| d.justify_start())
        .child(
            div()
                .size(px(18.))
                .rounded_full()
                .bg(gpui::white())
                .shadow(theme::shadow_button()),
        )
}

fn outlined_action_btn(id: &'static str, label: &'static str) -> Stateful<Div> {
    div()
        .id(id)
        .h(px(28.))
        .px(px(11.))
        .rounded(px(7.))
        .border_1()
        .border_color(Theme::line_border())
        .bg(Theme::bg_body())
        .flex()
        .items_center()
        .justify_center()
        .cursor_pointer()
        .text_size(px(12.5))
        .font_weight(FontWeight::MEDIUM)
        .text_color(Theme::text())
        .hover(|s| s.bg(Theme::fill_hover()))
        .child(label)
}

fn dropdown_menu(items: Vec<AnyElement>) -> AnyElement {
    div()
        .min_w(px(176.))
        .p(px(5.))
        .rounded(px(12.))
        .bg(theme::raised(Theme::bg_body()))
        .border_1()
        .border_color(Theme::line_border())
        .shadow(theme::shadow_menu())
        .occlude()
        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
        .flex()
        .flex_col()
        .gap(px(2.))
        .children(items)
        .into_any_element()
}

fn dropdown_item(
    id: SharedString,
    label: impl Into<SharedString>,
    active: bool,
) -> Stateful<Div> {
    div()
        .id(id)
        .px(px(10.))
        .py(px(7.))
        .rounded(px(8.))
        .cursor_pointer()
        .flex()
        .items_center()
        .justify_between()
        .gap(px(10.))
        .when(active, |d| d.bg(Theme::fill_hover_strong()))
        .when(!active, |d| d.hover(|s| s.bg(Theme::fill_hover())))
        .child(
            div()
                .text_size(px(12.5))
                .font_weight(if active { FontWeight::MEDIUM } else { FontWeight::NORMAL })
                .text_color(Theme::text())
                .whitespace_nowrap()
                .child(label.into()),
        )
        .when(active, |d| d.child(ui::icon("check", 13., Theme::primary())))
}

fn dropdown_select(
    id: &'static str,
    dropdown_key: &'static str,
    current: impl Into<SharedString>,
    open_key: Option<&'static str>,
    menu: Option<AnyElement>,
    cx: &mut Context<MerakWorkspace>,
) -> Div {
    let open = open_key == Some(dropdown_key);
    div()
        .relative()
        .child(
            div()
                .id(id)
                .h(px(30.))
                .px(px(11.))
                .rounded(px(8.))
                .border_1()
                .border_color(if open { Theme::line_sheet() } else { Theme::line_border() })
                .bg(Theme::bg_body())
                .flex()
                .items_center()
                .gap(px(8.))
                .cursor_pointer()
                .hover(|s| s.bg(Theme::fill_hover()))
                .on_mouse_down(MouseButton::Left, cx.listener(move |this, _, _, cx| {
                    cx.stop_propagation();
                    this.state.settings_dropdown =
                        if this.state.settings_dropdown == Some(dropdown_key) {
                            None
                        } else {
                            Some(dropdown_key)
                        };
                    cx.notify();
                }))
                .child(
                    div()
                        .text_size(px(12.5))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(Theme::text())
                        .whitespace_nowrap()
                        .child(current.into()),
                )
                .child(ui::icon("chevron-down", 12., components::text_muted())),
        )
        .when_some(menu, |d, m| {
            d.child(
                div()
                    .absolute()
                    .top_0()
                    .right_0()
                    .child(
                        deferred(
                            anchored()
                                .position_mode(AnchoredPositionMode::Local)
                                .position(point(px(0.), px(34.)))
                                .anchor(Anchor::TopRight)
                                .snap_to_window_with_margin(px(12.))
                                .child(m),
                        )
                        .with_priority(15),
                    ),
            )
        })
}

fn compact_path(p: &std::path::Path) -> String {
    let s = p.to_string_lossy().to_string();
    if let Some(home) = dirs::home_dir() {
        let hs = home.to_string_lossy();
        if let Some(rest) = s.strip_prefix(hs.as_ref()) {
            return format!("~{rest}");
        }
    }
    s
}

pub fn render_settings(ws: &MerakWorkspace, cx: &mut Context<MerakWorkspace>) -> Stateful<Div> {
    let sec = ws.state.settings_section;
    let prefs = crate::settings::prefs();
    let open_key = ws.state.settings_dropdown;
    let workspace_path = Store::internal_dir();
    let workspace_display = compact_path(&workspace_path);
    let workspace_full = workspace_path.to_string_lossy().to_string();

    let body_sections: Vec<Div> = match sec {
        SettingsSection::General => {
            let editor_opts = ["Zed", "VS Code", "Cursor", "Finder"];
            let editor_menu = (open_key == Some("editor")).then(|| {
                let items = editor_opts
                    .into_iter()
                    .map(|opt| {
                        let active = ws.state.default_open_editor == opt;
                        dropdown_item(SharedString::from(format!("ed-{opt}")), opt, active)
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.state.default_open_editor = opt;
                                this.state.settings_dropdown = None;
                                cx.notify();
                            }))
                            .into_any_element()
                    })
                    .collect();
                dropdown_menu(items)
            });

            let deliv_menu = (open_key == Some("deliv")).then(|| {
                let items = SessionDeliverable::ALL
                    .into_iter()
                    .map(|d| {
                        let active = ws.state.session_deliverable == d;
                        dropdown_item(SharedString::from(format!("dlv-{}", d.label())), d.label(), active)
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.state.session_deliverable = d;
                                this.state.settings_dropdown = None;
                                cx.notify();
                            }))
                            .into_any_element()
                    })
                    .collect();
                dropdown_menu(items)
            });

            let lang_label = match prefs.language.as_str() {
                "zh" => "简体中文",
                "en" => "English",
                _ => "自动检测",
            };
            let lang_opts = [("", "自动检测"), ("zh", "简体中文"), ("en", "English")];
            let lang_menu = (open_key == Some("lang")).then(|| {
                let items = lang_opts
                    .into_iter()
                    .map(|(code, label)| {
                        let active = prefs.language.as_str() == code;
                        dropdown_item(SharedString::from(format!("lang-{code}")), label, active)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.state.settings_dropdown = None;
                                this.set_language(code, window, cx);
                            }))
                            .into_any_element()
                    })
                    .collect();
                dropdown_menu(items)
            });

            let close_opts = ["仅在使用“关闭”快捷键时", "始终询问", "从不"];
            let close_menu = (open_key == Some("close")).then(|| {
                let items = close_opts
                    .into_iter()
                    .map(|opt| {
                        let active = ws.state.confirm_close_window == opt;
                        dropdown_item(SharedString::from(format!("cls-{opt}")), opt, active)
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.state.confirm_close_window = opt;
                                this.state.settings_dropdown = None;
                                cx.notify();
                            }))
                            .into_any_element()
                    })
                    .collect();
                dropdown_menu(items)
            });

            let ws_full_copy = workspace_full.clone();
            vec![
                flat_section(
                    "权限",
                    vec![
                        flat_row(
                            "默认权限",
                            "默认情况下，Bot 可以读取和编辑所在项目工作空间中的产物与白板。需要跨仓库修改时可发起审批。",
                            toggle_switch("set-perm-rw", ws.state.perm_workspace_rw)
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.state.perm_workspace_rw = !this.state.perm_workspace_rw;
                                    cx.notify();
                                }))
                                .into_any_element(),
                        ),
                        flat_row(
                            "完整访问权限",
                            "开启后，允许 Bot 直接执行本地测试与访问网络的命令，跳过常规白名单确认。",
                            toggle_switch("set-perm-full", ws.state.perm_full_access)
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.state.perm_full_access = !this.state.perm_full_access;
                                    cx.notify();
                                }))
                                .into_any_element(),
                        ),
                    ],
                ),
                flat_section(
                    "常规",
                    vec![
                        flat_row(
                            "默认工作空间目录",
                            "会话、本地白板缓存与 SQLite 数据表的默认存储位置。",
                            div()
                                .flex()
                                .items_center()
                                .gap(px(10.))
                                .child(
                                    div()
                                        .max_w(px(220.))
                                        .font_family(theme::MONO_FONT)
                                        .text_size(px(12.))
                                        .text_color(components::text_secondary())
                                        .overflow_hidden()
                                        .whitespace_nowrap()
                                        .text_ellipsis()
                                        .child(workspace_display.clone()),
                                )
                                .child(
                                    outlined_action_btn("set-copy-ws", "复制").on_click(cx.listener(
                                        move |this, _, window, cx| {
                                            cx.write_to_clipboard(ClipboardItem::new_string(ws_full_copy.clone()));
                                            this.show_toast(ui::ToastKind::Info, "已复制工作空间路径", window, cx);
                                        },
                                    )),
                                )
                                .into_any_element(),
                        ),
                        flat_row(
                            "默认文件打开位置",
                            "从任务、Diff 或规格文档跳出时默认使用的外部编辑器。",
                            dropdown_select(
                                "set-dd-editor",
                                "editor",
                                ws.state.default_open_editor,
                                open_key,
                                editor_menu,
                                cx,
                            )
                            .into_any_element(),
                        ),
                        flat_row(
                            "新建会话默认产物",
                            "点击左侧新建会话按钮时默认选中的交付类型。",
                            dropdown_select(
                                "set-dd-deliv",
                                "deliv",
                                ws.state.session_deliverable.label(),
                                open_key,
                                deliv_menu,
                                cx,
                            )
                            .into_any_element(),
                        ),
                        flat_row(
                            "语言",
                            "应用界面首选语言。",
                            dropdown_select("set-dd-lang", "lang", lang_label, open_key, lang_menu, cx)
                                .into_any_element(),
                        ),
                        flat_row(
                            "在菜单栏中显示",
                            "关闭主窗口后，仍在 macOS 菜单栏保留 Merak 状态与后台定时巡检。",
                            toggle_switch("set-menubar", ws.state.show_in_menubar)
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.state.show_in_menubar = !this.state.show_in_menubar;
                                    cx.notify();
                                }))
                                .into_any_element(),
                        ),
                        flat_row(
                            "关闭窗口前确认",
                            "使用关闭快捷键会导致窗口或未保存白板退出时显示提示。",
                            dropdown_select(
                                "set-dd-close",
                                "close",
                                ws.state.confirm_close_window,
                                open_key,
                                close_menu,
                                cx,
                            )
                            .into_any_element(),
                        ),
                    ],
                ),
            ]
        }
        SettingsSection::Appearance => {
            let app_label = match prefs.appearance.as_str() {
                "light" => "浅色",
                "dark" => "深色",
                _ => "跟随系统",
            };
            let app_opts = [("light", "浅色"), ("dark", "深色"), ("", "跟随系统")];
            let app_menu = (open_key == Some("appearance")).then(|| {
                let items = app_opts
                    .into_iter()
                    .map(|(val, label)| {
                        let active = prefs.appearance.as_str() == val;
                        dropdown_item(SharedString::from(format!("app-{val}")), label, active)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.state.settings_dropdown = None;
                                this.set_appearance(val, window, cx);
                            }))
                            .into_any_element()
                    })
                    .collect();
                dropdown_menu(items)
            });

            let font_label = match prefs.ui_font.as_str() {
                "small" => "紧凑 (12pt)",
                "large" => "宽松 (15pt)",
                _ => "标准 (13pt)",
            };
            let font_opts = [("small", "紧凑 (12pt)"), ("", "标准 (13pt)"), ("large", "宽松 (15pt)")];
            let font_menu = (open_key == Some("uifont")).then(|| {
                let items = font_opts
                    .into_iter()
                    .map(|(val, label)| {
                        let active = prefs.ui_font.as_str() == val;
                        dropdown_item(SharedString::from(format!("fnt-{val}")), label, active)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.state.settings_dropdown = None;
                                this.set_ui_font(val, window, cx);
                            }))
                            .into_any_element()
                    })
                    .collect();
                dropdown_menu(items)
            });

            vec![flat_section(
                "主题与材质",
                vec![
                    flat_row(
                        "主题外观",
                        "切换浅色、深色，或跟随系统实时同步窗口与 Excalidraw 白板配色。",
                        dropdown_select("set-dd-app", "appearance", app_label, open_key, app_menu, cx)
                            .into_any_element(),
                    ),
                    flat_row(
                        "侧栏毛玻璃通透",
                        "在 macOS 上启用原生 NSGlassEffectView 透色材质；关闭则切换为纯色底板。",
                        toggle_switch("set-glass-toggle", !prefs.opaque_window)
                            .on_click(cx.listener(|this, _, window, cx| {
                                let cur = crate::settings::prefs().opaque_window;
                                this.set_opaque_window(!cur, window, cx);
                            }))
                            .into_any_element(),
                    ),
                    flat_row(
                        "界面字号",
                        "调整导航、列表与正文的基准字号密度。",
                        dropdown_select("set-dd-font", "uifont", font_label, open_key, font_menu, cx)
                            .into_any_element(),
                    ),
                ],
            )]
        }
        SettingsSection::Mailbox => vec![flat_section(
            "林纳斯式异步收件箱",
            vec![
                flat_row(
                    "绿灯静默巡检",
                    "默认全绿通过的 Cron 检查仅留在项目记录里；只有存在未覆盖 Gap 或失败时才寄信进 Mailbox。",
                    toggle_switch(
                        "set-mail-silent",
                        ws.state.default_schedule_notify == ScheduleNotifyPolicy::SilentOnPass,
                    )
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.state.default_schedule_notify = this.state.default_schedule_notify.toggle();
                        cx.notify();
                    }))
                    .into_any_element(),
                ),
                flat_row(
                    "红线操作强制进 Mailbox",
                    "当 Bot 请求构建发布、外部命令执行或高风险写操作时，必须挂起并寄出审批信。",
                    toggle_switch("set-mail-guardrail", ws.state.mailbox_guardrail_gate)
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.state.mailbox_guardrail_gate = !this.state.mailbox_guardrail_gate;
                            cx.notify();
                        }))
                        .into_any_element(),
                ),
                flat_row(
                    "侧栏未读蓝点提醒",
                    "在最左侧 Rail 的主页图标右上角以克制的小圆点提示待裁决邮件。",
                    toggle_switch("set-mail-dot", ws.state.mailbox_badge_dot)
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.state.mailbox_badge_dot = !this.state.mailbox_badge_dot;
                            cx.notify();
                        }))
                        .into_any_element(),
                ),
            ],
        )],
        SettingsSection::Shortcuts => {
            let pairs = [
                ("新建会话", "打开居中空白会话卡片，发起自由对话或指定交付产物", "⌘N"),
                ("新建项目", "创建空白资料项目，或直接从本地 Git 仓库建立项目", "⌘⇧N"),
                ("命令面板", "搜索项目、会话、产物、任务、Bot 或快速跳转", "⌘K"),
                ("切换侧边栏", "平滑收起或展开左侧 Rail 与二级导航栏", "⌘\\"),
                ("Inbox 队列", "切到全局待裁决邮箱", "⌘1"),
                ("切换决策面", "在项目列表与全屏 Excalidraw 决策面间切换", "⌘E"),
                ("切换深浅外观", "在浅色与深色模式之间即时切换", "⌘⇧T"),
                ("打开设置", "随时打开当前设置工作区", "⌘,"),
                ("Mailbox 翻信", "在 Mailbox 中向下或向上浏览下一封待裁决信件", "J / K"),
                ("Mailbox 归档", "快速归档当前已批阅或低优先级通知信", "E"),
            ];
            let rows = pairs
                .into_iter()
                .map(|(title, desc, key)| {
                    flat_row(
                        title,
                        desc,
                        div()
                            .px(px(9.))
                            .py(px(3.))
                            .rounded(px(6.))
                            .bg(keycap_bg())
                            .border_1()
                            .border_color(Theme::line_border())
                            .font_family(theme::MONO_FONT)
                            .text_size(px(12.))
                            .text_color(components::text_secondary())
                            .child(key)
                            .into_any_element(),
                    )
                })
                .collect();
            vec![flat_section("工作台快捷键", rows)]
        }
        SettingsSection::Permissions => vec![flat_section(
            "执行权限与护栏",
            vec![
                flat_row(
                    "默认工作空间读写",
                    "允许 Bot 在项目绑定目录内读取代码与更新白板/规格文件。",
                    toggle_switch("set-p-rw", ws.state.perm_workspace_rw)
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.state.perm_workspace_rw = !this.state.perm_workspace_rw;
                            cx.notify();
                        }))
                        .into_any_element(),
                ),
                flat_row(
                    "完整访问权限",
                    "允许 Bot 跨工作空间写文件与执行带网络权限的脚本。",
                    toggle_switch("set-p-full", ws.state.perm_full_access)
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.state.perm_full_access = !this.state.perm_full_access;
                            cx.notify();
                        }))
                        .into_any_element(),
                ),
                flat_row(
                    "红线操作强制审批",
                    "敏感命令始终先投递 Mailbox 审批信，需人类点击批准后才继续。",
                    toggle_switch("set-p-gate", ws.state.mailbox_guardrail_gate)
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.state.mailbox_guardrail_gate = !this.state.mailbox_guardrail_gate;
                            cx.notify();
                        }))
                        .into_any_element(),
                ),
            ],
        )],
        SettingsSection::CanvasVerify => vec![flat_section(
            "决策面与自证",
            vec![
                flat_row(
                    "打开白板自动居中适配",
                    "进入 Excalidraw 决策白板时自动缩放到完整架构图视野。",
                    toggle_switch("set-cv-fit", ws.state.canvas_auto_fit)
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.state.canvas_auto_fit = !this.state.canvas_auto_fit;
                            cx.notify();
                        }))
                        .into_any_element(),
                ),
                flat_row(
                    "双轨验收需人类 Pass 放行",
                    "即使机器自证全部通过，仍保留人类裁决项与未覆盖 Gap 等待最终确认。",
                    toggle_switch("set-cv-pass", ws.state.verify_require_human_pass)
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.state.verify_require_human_pass = !this.state.verify_require_human_pass;
                            cx.notify();
                        }))
                        .into_any_element(),
                ),
            ],
        )],
        SettingsSection::Storage => {
            let archived_cnt = ws
                .state
                .snapshot
                .inbox
                .iter()
                .filter(|i| !i.status.is_pending())
                .count();
            let ws_full_copy = workspace_full.clone();
            vec![flat_section(
                "数据与归档",
                vec![
                    flat_row(
                        "本地库目录",
                        workspace_display.clone(),
                        outlined_action_btn("set-st-copy", "复制路径")
                            .on_click(cx.listener(move |this, _, window, cx| {
                                cx.write_to_clipboard(ClipboardItem::new_string(ws_full_copy.clone()));
                                this.show_toast(ui::ToastKind::Info, "已复制本地库路径", window, cx);
                            }))
                            .into_any_element(),
                    ),
                    flat_row(
                        "已归档裁决记录",
                        format!("当前共保存 {archived_cnt} 封已归档或已定案的历史信件。"),
                        outlined_action_btn("set-st-archived", "查看已归档")
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.state.inbox_filter = InboxFilter::Archived;
                                this.switch_nav(PrimaryNav::Inbox, window, cx);
                            }))
                            .into_any_element(),
                    ),
                ],
            )]
        }
        SettingsSection::Daemon => {
            let r = &ws.state.runtime_report;
            let service_pills = if r.active_services.is_empty() {
                vec![components::subtle_pill("暂无在线服务").into_any_element()]
            } else {
                r.active_services
                    .iter()
                    .map(|svc| components::subtle_pill(svc.clone()).into_any_element())
                    .collect()
            };

            let project_rows: Vec<AnyElement> = if r.projects.is_empty() {
                vec![flat_row(
                    "暂无项目 Fiber",
                    "创建项目后会自动热挂载独立的 Project Fiber 及其子 Git 插件。",
                    components::subtle_pill("空闲").into_any_element(),
                )]
            } else {
                r.projects
                    .iter()
                    .map(|proj| {
                        let mut pills = div()
                            .max_w(px(320.))
                            .flex()
                            .flex_wrap()
                            .justify_end()
                            .gap(px(6.))
                            .child(components::subtle_pill(proj.state.clone()));
                        if proj.git_fibers.is_empty() {
                            pills = pills.child(components::subtle_pill("无 Git 子插件"));
                        } else {
                            for gf in &proj.git_fibers {
                                let branch = gf
                                    .branch
                                    .as_deref()
                                    .unwrap_or(if gf.is_git { "HEAD" } else { "非Git" });
                                pills = pills.child(components::subtle_pill(format!(
                                    "git:{} ({branch})",
                                    gf.repo_name
                                )));
                            }
                        }
                        flat_row(
                            proj.project_name.clone(),
                            format!(
                                "Fiber #{} · project:{} · {} 个子插件",
                                proj.fiber_uid,
                                proj.project_id,
                                proj.git_fibers.len()
                            ),
                            pills.into_any_element(),
                        )
                    })
                    .collect()
            };

            vec![
                flat_section(
                    "Cordis 微内核运行时",
                    vec![
                        flat_row(
                            "运行模式",
                            "领域服务与 Project/Git Fiber 树由隔离的 Cordis 微内核驱动，与 GPUI 主线程零锁隔离。",
                            components::subtle_pill("Cordis 微内核 · merak-core").into_any_element(),
                        ),
                        flat_row(
                            "在线服务与 Fiber 总览",
                            "实时统计已挂载就绪的领域服务数量与 Fiber 树活跃节点比例。",
                            components::subtle_pill(format!(
                                "{} 服务 · {}/{} 活跃 Fiber",
                                r.active_services.len(),
                                r.active_fibers,
                                r.total_fibers
                            ))
                            .into_any_element(),
                        ),
                        flat_row(
                            "逆序清理计数 (Cleanup)",
                            "解绑仓库或销毁项目 Fiber 时由 Cordis 按挂载逆序自动触发的 Cleanup 累计次数。",
                            components::subtle_pill(format!("{} 次", r.cleanup_count))
                                .into_any_element(),
                        ),
                        flat_row(
                            "在线服务列表",
                            "当前已在 Cordis Context 中完成依赖注入并处于活跃状态的领域服务。",
                            div()
                                .max_w(px(320.))
                                .flex()
                                .flex_wrap()
                                .justify_end()
                                .gap(px(6.))
                                .children(service_pills)
                                .into_any_element(),
                        ),
                    ],
                ),
                flat_section("Project Fiber 树（热挂载 / 级联卸载）", project_rows),
            ]
        }
        SettingsSection::GitWorktree => vec![flat_section(
            "分支与隔离",
            vec![
                flat_row(
                    "为并发 Bot 自动创建独立 Worktree",
                    "多 Bot 并行修改不同模块时各自持有隔离 Git Worktree，避免工作区冲突。",
                    toggle_switch("set-wt-iso", ws.state.worktree_isolate_bots)
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.state.worktree_isolate_bots = !this.state.worktree_isolate_bots;
                            cx.notify();
                        }))
                        .into_any_element(),
                ),
                flat_row(
                    "默认对比与跳转编辑器",
                    "在代码审查与 Diff 视图点击外部打开时调用的程序。",
                    components::subtle_pill(ws.state.default_open_editor).into_any_element(),
                ),
            ],
        )],
    };

    let mut page_inner = div()
        .max_w(px(680.))
        .w_full()
        .mx_auto()
        .px(px(44.))
        .pt(px(34.))
        .pb(px(64.))
        .flex()
        .flex_col()
        .gap(px(28.))
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(4.))
                .child(
                    div()
                        .text_size(px(24.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(Theme::text())
                        .child(sec.label()),
                )
                .child(
                    div()
                        .text_size(px(13.))
                        .text_color(components::text_secondary())
                        .child(sec.subtitle()),
                ),
        );
    for section in body_sections {
        page_inner = page_inner.child(section);
    }

    let animated_inner: AnyElement = if ws.settings_epoch > 0 && !cx.reduce_motion() {
        page_inner
            .relative()
            .with_animation(
                ("settings-sec", ws.settings_epoch),
                Animation::new(Duration::from_millis(150)).with_easing(ease_out_quint()),
                |el, t| el.top(px((1.0 - t) * 4.0)).opacity(0.3 + 0.7 * t),
            )
            .into_any_element()
    } else {
        page_inner.into_any_element()
    };

    div()
        .id("settings-backdrop")
        .size_full()
        .min_h_0()
        .flex()
        .on_mouse_down(MouseButton::Left, cx.listener(|this, _, _, cx| {
            if this.state.settings_dropdown.take().is_some() {
                cx.notify();
            }
        }))
        .child(
            div()
                .id("settings-scroll")
                .flex_1()
                .h_full()
                .overflow_y_scroll()
                .child(animated_inner),
        )
}
