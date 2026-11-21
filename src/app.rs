//! Minimal app compatibility & global menu/action module for Merak GPUI.

use gpui::*;

pub const HEADER_H: f32 = 44.;
pub const HEADER_ACTIONS_H: f32 = 32.;

actions!(
    merak,
    [
        CloseWindow,
        Quit,
        ToggleSidebar,
        OpenCommandPalette,
        OpenQuickCapture,
        NewProject,
        FocusInbox,
        FocusTasks,
        FocusSchedules,
        FocusProject1,
        FocusProject2,
        FocusBots,
        FocusVerifyTab,
        ToggleExpandDecisionPane,
        ToggleThemeMode,
        OpenSettings
    ]
);

#[allow(dead_code)]
pub type Workspace = crate::merak::MerakWorkspace;

pub fn set_menus(cx: &mut App) {
    cx.set_menus(vec![
        Menu {
            name: "Merak".into(),
            items: vec![
                MenuItem::action("设置...", OpenSettings),
                MenuItem::action("切换深浅色模式", ToggleThemeMode),
                MenuItem::separator(),
                MenuItem::action("退出 Merak", Quit),
            ],
            disabled: false,
        },
        Menu {
            name: "工作台".into(),
            items: vec![
                MenuItem::action("新建会话", OpenQuickCapture),
                MenuItem::action("新建项目...", NewProject),
                MenuItem::action("命令面板 (Command Palette)", OpenCommandPalette),
                MenuItem::separator(),
                MenuItem::action("Inbox 裁决队列", FocusInbox),
                MenuItem::action("Tasks 任务与账本", FocusTasks),
                MenuItem::action("定时任务 Schedules", FocusSchedules),
                MenuItem::action("项目 1 · Merak 工作台", FocusProject1),
                MenuItem::action("项目 2 · Mizar Rust 内核", FocusProject2),
                MenuItem::action("Bot 协作视图", FocusBots),
                MenuItem::separator(),
                MenuItem::action("切到自证与裁决视图", FocusVerifyTab),
                MenuItem::action("展开/恢复右侧决策面", ToggleExpandDecisionPane),
                MenuItem::action("切换侧边栏", ToggleSidebar),
                MenuItem::action("关闭窗口", CloseWindow),
            ],
            disabled: false,
        },
    ]);
}

pub fn bind_keys(cx: &mut App) {
    cx.bind_keys([
        KeyBinding::new("cmd-q", Quit, None),
        KeyBinding::new("cmd-w", CloseWindow, Some("Workspace")),
        KeyBinding::new("cmd-k", OpenCommandPalette, Some("Workspace")),
        KeyBinding::new("cmd-n", OpenQuickCapture, Some("Workspace")),
        KeyBinding::new("cmd-shift-n", NewProject, Some("Workspace")),
        KeyBinding::new("cmd-1", FocusInbox, Some("Workspace")),
        KeyBinding::new("cmd-2", FocusTasks, Some("Workspace")),
        KeyBinding::new("cmd-3", FocusSchedules, Some("Workspace")),
        KeyBinding::new("cmd-4", FocusProject1, Some("Workspace")),
        KeyBinding::new("cmd-5", FocusProject2, Some("Workspace")),
        KeyBinding::new("cmd-6", FocusBots, Some("Workspace")),
        KeyBinding::new("cmd-shift-v", FocusVerifyTab, Some("Workspace")),
        KeyBinding::new("cmd-e", ToggleExpandDecisionPane, Some("Workspace")),
        KeyBinding::new("cmd-\\", ToggleSidebar, Some("Workspace")),
        KeyBinding::new("cmd-shift-t", ToggleThemeMode, Some("Workspace")),
        KeyBinding::new("cmd-,", OpenSettings, Some("Workspace")),
    ]);
}
