use gpui::*;
use std::collections::BTreeMap;
use crate::settings::tr;

pub struct Shortcuts { base: Vec<KeyBinding>, custom: BTreeMap<String, String> }
impl Global for Shortcuts {}
fn path() -> std::path::PathBuf { crate::store::Store::internal_dir().join("shortcuts.json") }
/// The system-wide quick note hotkey unless the user picked another.
pub const GLOBAL_DEFAULT: &str = "alt-space";
pub fn global_key() -> String { saved("global").unwrap_or_else(|| GLOBAL_DEFAULT.into()) }
/// 打开上次使用的文档 from anywhere: its id in the shortcuts file, and its default. Empty: off.
pub const LAST_ID: &str = "global-last";
pub const LAST_DEFAULT: &str = "cmd-alt-space";
pub fn last_key() -> String { saved(LAST_ID).unwrap_or_else(|| LAST_DEFAULT.into()) }
fn saved(id: &str) -> Option<String> {
    fdl_core::vfs::read(path()).ok().and_then(|b| serde_json::from_slice::<BTreeMap<String,String>>(&b).ok()).and_then(|m| m.get(id).cloned())
}
/// The system-wide hotkeys: one stroke, kept apart from the app's.
fn is_global(id: &str) -> bool { id == "global" || id == LAST_ID }
/// The host OS, the way GPUI spells keystrokes for it ("cmd-", "win-", "super-").
pub const HOST_OS: OperatingSystem = if cfg!(target_os = "macos") { OperatingSystem::Mac } else if cfg!(target_os = "windows") { OperatingSystem::Windows } else { OperatingSystem::Linux };
pub fn parse_key(stroke: &str) -> Result<Keystroke, InvalidKeystrokeError> { Keystroke::parse_with_os(stroke, HOST_OS) }
fn unparse(k: &impl AsKeystroke) -> String { k.as_keystroke().unparse(HOST_OS) }
/// Mac key conventions (⌘ bindings and hints): macOS, or the web build in a
/// Mac browser.
pub fn mac() -> bool {
    #[cfg(target_family = "wasm")] {
        static MAC: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
        *MAC.get_or_init(|| web_sys::window().map(|w| w.navigator()).is_some_and(|n| n.platform().is_ok_and(|p| p.starts_with("Mac")) || n.user_agent().is_ok_and(|a| a.contains("Mac OS X") && !a.contains("Mobile"))))
    }
    #[cfg(not(target_family = "wasm"))] { cfg!(target_os = "macos") }
}

pub fn init(cx: &mut App) {
    // First launch runs this twice (its pages, then `main::start`): by then the
    // bound keys are PC-mapped and customized, and mapping ctrl-a again would
    // drop 全选 as Cocoa's line start. Keep the built-in keys read the first time.
    #[cfg(not(target_os = "macos"))]
    let again = cx.has_global::<Shortcuts>();
    let base = match cx.try_global::<Shortcuts>() { Some(s) => s.base.clone(), None => cx.key_bindings().borrow().bindings().cloned().collect::<Vec<_>>() };
    #[cfg(not(target_os = "macos"))]
    let base = if mac() || again { base } else { base.into_iter().filter_map(pc_binding).collect() };
    let custom = fdl_core::vfs::read(path()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    cx.set_global(Shortcuts { base, custom });
    rebuild(cx);
}

#[cfg(any(test, not(target_os = "macos")))]
fn pc_binding(binding: KeyBinding) -> Option<KeyBinding> {
    let keys = binding.keystrokes().iter().map(|k| unparse(k).replace("win-", "cmd-").replace("super-", "cmd-")).collect::<Vec<_>>().join(" ");
    // Cocoa's control-key navigation conflicts with PC editing shortcuts.
    if matches!(keys.as_str(), "ctrl-a" | "ctrl-b" | "ctrl-d" | "ctrl-e" | "ctrl-f" | "ctrl-h" | "ctrl-n" | "ctrl-p" | "ctrl-backspace") { return None; }
    // Ctrl+Backspace deletes a word on PC platforms; do not override it with macOS line deletion.
    if keys == "cmd-backspace" { return None; }
    // Ctrl+Shift+C is 行内代码 there, so 复制为 Markdown takes Alt as well.
    let keys = if binding.action().name().ends_with("::InlineCode") { "ctrl-shift-c".to_string() } else if binding.action().name().ends_with("::CopyMarkdown") { "ctrl-alt-shift-c".to_string() } else { keys.split(' ').map(|key| match key {
        "cmd-left" => "home".into(), "cmd-right" => "end".into(),
        "cmd-shift-left" => "shift-home".into(), "cmd-shift-right" => "shift-end".into(),
        "cmd-up" => "ctrl-home".into(), "cmd-down" => "ctrl-end".into(),
        "cmd-shift-up" => "ctrl-shift-home".into(), "cmd-shift-down" => "ctrl-shift-end".into(),
        "alt-left" | "alt-right" | "alt-shift-left" | "alt-shift-right" | "alt-backspace" | "alt-delete" => key.replacen("alt-", "ctrl-", 1),
        _ => key.replace("cmd-", "ctrl-"),
    }).collect::<Vec<String>>().join(" ") };
    load(&keys, &binding)
}

/// `keys` for `like`'s action and context, parsed as written: no keyboard
/// layout mapping.
fn load(keys: &str, like: &KeyBinding) -> Option<KeyBinding> {
    KeyBinding::load_unmapped(keys, like.action().boxed_clone(), like.predicate(), like.action_input(), HOST_OS).ok()
}

#[cfg(test)]
mod tests {
    use super::{pc_binding, unparse};
    use gpui::KeyBinding;
    #[test]
    fn pc_word_deletion_has_no_line_deletion_collision() {
        use crate::editor::keymap::{DeleteWordBack, DeleteWordForward, DeleteToLineStart, Backspace};
        for (binding, expected) in [
            (KeyBinding::new("alt-backspace", DeleteWordBack, Some("Editor")), "ctrl-backspace"),
            (KeyBinding::new("alt-delete", DeleteWordForward, Some("Editor")), "ctrl-delete"),
        ] {
            let mapped = pc_binding(binding).unwrap();
            assert_eq!(unparse(&mapped.keystrokes()[0]), expected);
        }
        assert!(pc_binding(KeyBinding::new("cmd-backspace", DeleteToLineStart, Some("Editor"))).is_none());
        assert!(pc_binding(KeyBinding::new("ctrl-backspace", Backspace, Some("Editor"))).is_none());
    }
    #[test]
    fn copy_and_inline_code_keep_distinct_pc_shortcuts() {
        use crate::editor::keymap::{Copy, InlineCode};
        let copy = pc_binding(KeyBinding::new("cmd-c", Copy, Some("Editor"))).unwrap();
        let code = pc_binding(KeyBinding::new("cmd-ctrl-c", InlineCode, Some("Editor"))).unwrap();
        assert_eq!(copy.keystrokes().iter().map(unparse).collect::<Vec<_>>(), ["ctrl-c"]);
        assert_eq!(code.keystrokes().iter().map(unparse).collect::<Vec<_>>(), ["ctrl-shift-c"]);
        assert_ne!(copy.keystrokes(), code.keystrokes());
    }
}
/// Mac key notation (⌘ ⌥ ⇧ ⌃, "⌘ + Shift + 7") as Windows writes it, the way
/// `pc_binding` maps the keys: ⌘ is Ctrl, ⌘ ⌃ C (inline code) is
/// Ctrl+Shift+C, ⌘ with an arrow is Home / End. "⌘ + B" stays spaced
/// ("Ctrl + B"), "⌘ B" becomes "Ctrl+B". A combination Windows has no twin
/// for (⌘ ⌃ ⇧ 4, the macOS screenshot) is left as written.
pub fn windows_keys(s: &str) -> String {
    const SYMBOLS: [(&str, usize); 4] = [("⌘", 0), ("⌃", 1), ("⌥", 2), ("⇧", 3)];
    let modifier = |t: &str, first: bool| -> Option<(usize, usize)> {
        SYMBOLS.iter().find(|(m, _)| t.starts_with(m)).map(|(m, i)| (*i, m.len()))
            .or_else(|| if first { None } else { [("Control", 1), ("Shift", 3)].iter().find(|(w, _)| t.starts_with(w) && !t[w.len()..].starts_with(|c: char| c.is_ascii_alphanumeric())).map(|(w, i)| (*i, w.len())) })
    };
    let mut out = String::new();
    let mut i = 0;
    while i < s.len() {
        let Some(_) = modifier(&s[i..], true) else {
            let c = s[i..].chars().next().unwrap();
            out.push(c);
            i += c.len_utf8();
            continue;
        };
        let (start, mut j, mut held, mut spaced) = (i, i, [false; 4], false);
        while let Some((m, n)) = modifier(&s[j..], j == start) {
            held[m] = true;
            j += n;
            let rest = &s[j..];
            let gap = rest.len() - rest.trim_start_matches(' ').len();
            // "⌘ + B" separates with " + "; in "⌘ +" the plus is the key.
            if rest[gap..].starts_with("+ ") { spaced = true; j += gap + 1; j += s[j..].len() - s[j..].trim_start_matches(' ').len(); } else { j += gap; }
        }
        let rest = &s[j..];
        let key_len = if rest.starts_with('&') { rest.find(';').map_or(0, |e| e + 1) } else {
            rest.chars().next().filter(|c| !c.is_whitespace() && *c != '<').map_or(0, |c| c.len_utf8() + rest[c.len_utf8()..].chars().take_while(|c| c.is_ascii_alphanumeric()).map(char::len_utf8).sum::<usize>())
        };
        let mut key = rest[..key_len].to_string();
        let [cmd, mut ctrl, alt, mut shift] = held;
        if key.is_empty() || cmd && ctrl && !(key.eq_ignore_ascii_case("c") && !alt && !shift) {
            out.push_str(&s[start..j + key_len]);
            i = j + key_len;
            continue;
        }
        if cmd && ctrl { shift = true; }
        else if cmd { match key.as_str() {
            "←" => key = "Home".into(), "→" => key = "End".into(),
            "↑" => { key = "Home".into(); ctrl = true; } "↓" => { key = "End".into(); ctrl = true; }
            _ => ctrl = true,
        } }
        let parts: Vec<&str> = [(ctrl, "Ctrl"), (alt, "Alt"), (shift, "Shift")].into_iter().filter(|(on, _)| *on).map(|(_, n)| n).chain(Some(key.as_str())).collect();
        out.push_str(&parts.join(if spaced { " + " } else { "+" }));
        i = j + key_len;
    }
    out
}

fn first_group_hint() -> &'static str {
    if cfg!(not(target_os = "macos")) { tr("第一组请包含 Ctrl 或 Alt", "Start with Ctrl or Alt") } else { tr("第一组请包含 ⌘、⌃ 或 ⌥", "Start with ⌘, ⌃ or ⌥") }
}

/// A UI label's keys for this platform: `windows_keys` on non-macOS platforms (cached,
/// labels are `'static`), the text itself elsewhere.
pub fn keys(s: &'static str) -> &'static str {
    if mac() { return s }
    static CACHE: std::sync::Mutex<BTreeMap<&'static str, &'static str>> = std::sync::Mutex::new(BTreeMap::new());
    let mut cache = CACHE.lock().unwrap();
    cache.entry(s).or_insert_with(|| Box::leak(windows_keys(s).into_boxed_str()))
}

/// The user's keys, for `hint` (which runs where no `App` is at hand).
static CUSTOM: std::sync::RwLock<BTreeMap<String, String>> = std::sync::RwLock::new(BTreeMap::new());
static HINTS: std::sync::Mutex<BTreeMap<String, &'static str>> = std::sync::Mutex::new(BTreeMap::new());

/// The key hint the UI shows for `action`: `default` (its built-in key,
/// written as the UI writes it) unless the user changed it in 设置.
pub fn hint(action: &str, default: &'static str) -> &'static str {
    let Some(key) = CUSTOM.read().unwrap().get(action).cloned() else { return keys(default) };
    let mut cache = HINTS.lock().unwrap();
    if let Some(h) = cache.get(&key) { return h }
    let text = key.split(' ').map(|stroke| {
        let Ok(k) = parse_key(stroke) else { return stroke.to_string() };
        let m = k.modifiers;
        let names = if !mac() { [(m.control, "Ctrl"), (m.alt, "Alt"), (m.shift, "Shift"), (m.platform, if cfg!(target_os = "windows") { "Win" } else { "Super" })] } else { [(m.platform, "⌘"), (m.alt, "⌥"), (m.shift, "Shift"), (m.control, "Control")] };
        let mut parts: Vec<String> = names.into_iter().filter(|(on, _)| *on).map(|(_, s)| s.to_string()).collect();
        parts.push(match k.key.as_str() { "space" => "Space".into(), "enter" => "Enter".into(), k if k.chars().count() == 1 => k.to_uppercase(), k => { let mut c = k.chars(); c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default() } });
        parts.join(" + ")
    }).collect::<Vec<_>>().join(", ");
    let leaked: &'static str = Box::leak(text.into_boxed_str());
    cache.insert(key, leaked);
    leaked
}

pub fn rebuild(cx: &mut App) {
    *CUSTOM.write().unwrap() = cx.global::<Shortcuts>().custom.clone();
    let s = cx.global::<Shortcuts>();
    let bindings: Vec<_> = s.base.iter().filter(|b| !s.custom.get(b.action().name()).is_some_and(|key| key.is_empty())).map(|b| {
        s.custom.get(b.action().name()).and_then(|key| load(key, b)).unwrap_or_else(|| b.clone())
    }).collect();
    cx.clear_key_bindings(); cx.bind_keys(bindings);
}

/// Settings groups, in order.
const GROUPS: [(&str, &str); 5] = [("应用与窗口", "App & windows"), ("文档", "Documents"), ("编辑", "Editing"), ("文字样式", "Text styles"), ("段落与块", "Paragraphs & blocks")];

/// (group, 中文, English) of the actions shown in Settings.
fn info(name: &str) -> Option<(usize, &'static str, &'static str)> {
    Some(match name.rsplit("::").next().unwrap_or(name) {
        "NewDoc" => (0, "新建文档", "New document"),
        "QuickNew" => (0, "新建笔记窗口", "New note window"),
        "CloseWindow" => (0, "关闭窗口", "Close window"),
        "HideApp" => (0, "隐藏 Merak", "Hide Merak"),
        "Minimize" => (0, "最小化窗口", "Minimize window"),
        "ToggleFullScreen" => (0, "进入 / 退出全屏", "Enter / exit full screen"),
        "OpenSettings" => (0, "打开设置", "Open Settings"),
        "GoHome" => (0, "返回主页", "Go to Home"),
        "ToggleSidebar" => (0, "展开 / 收起侧栏", "Show / hide sidebar"),
        "FocusSearch" => (0, "搜索文档", "Search documents"),
        "ToggleShortcuts" => (0, "查看快捷键", "Show shortcuts"),
        "OpenFile" => (1, "打开 Markdown 文件", "Open Markdown file"),
        "OpenFolder" => (1, "打开文件夹", "Open folder"),
        "ImportDoc" => (1, "导入文档", "Import documents"),
        "Save" => (1, "保存文档", "Save document"),
        "EditMode" => (1, "编辑模式", "Edit mode"),
        "ReadMode" => (1, "阅读模式", "Reading mode"),
        "FindInDoc" => (1, "文档内查找", "Find in document"),
        "ReplaceInDoc" => (1, "查找和替换", "Find and replace"),
        "Undo" => (2, "撤销", "Undo"),
        "Redo" => (2, "重做", "Redo"),
        "Copy" => (2, "复制", "Copy"),
        "CopyMarkdown" => (2, "复制为 Markdown", "Copy as Markdown"),
        "Cut" => (2, "剪切", "Cut"),
        "Paste" => (2, "粘贴", "Paste"),
        "SelectAll" => (2, "全选", "Select all"),
        "PastePlain" => (2, "粘贴为纯文本", "Paste as plain text"),
        "Link" => (2, "插入链接", "Insert link"),
        "InsertReminder" => (2, "插入提醒", "Insert reminder"),
        "MoveBlockUp" => (2, "上移当前块", "Move block up"),
        "MoveBlockDown" => (2, "下移当前块", "Move block down"),
        "ToggleTodo" => (2, "切换任务完成状态", "Check / uncheck to-do"),
        "Bold" => (3, "加粗", "Bold"),
        "Italic" => (3, "斜体", "Italic"),
        "Underline" => (3, "下划线", "Underline"),
        "Strike" => (3, "删除线", "Strikethrough"),
        "InlineCode" => (3, "行内代码", "Inline code"),
        "ApplyLastColor" => (3, "应用上次的文字色和背景色", "Apply last colors"),
        "TurnText" => (4, "正文", "Text"),
        "TurnH1" => (4, "1 级标题", "Heading 1"),
        "TurnH2" => (4, "2 级标题", "Heading 2"),
        "TurnH3" => (4, "3 级标题", "Heading 3"),
        "TurnH4" => (4, "4 级标题", "Heading 4"),
        "TurnH5" => (4, "5 级标题", "Heading 5"),
        "TurnH6" => (4, "6 级标题", "Heading 6"),
        "TurnH7" => (4, "7 级标题", "Heading 7"),
        "TurnH8" => (4, "8 级标题", "Heading 8"),
        "TurnH9" => (4, "9 级标题", "Heading 9"),
        "TurnOrdered" => (4, "有序列表", "Numbered list"),
        "TurnBullet" => (4, "无序列表", "Bulleted list"),
        "TurnTodo" => (4, "任务列表", "To-do list"),
        "TurnCode" => (4, "代码块", "Code block"),
        "TurnQuote" => (4, "引用", "Quote"),
        "InsertDivider" => (4, "分隔线", "Divider"),
        "InsertTable" => (4, "插入表格", "Insert table"),
        "AlignLeft" => (4, "左对齐", "Align left"),
        "AlignCenter" => (4, "居中对齐", "Align center"),
        "AlignRight" => (4, "右对齐", "Align right"),
        _ => return None,
    })
}
pub fn label(name: &str) -> Option<&'static str> { info(name).map(|(_, zh, en)| tr(zh, en)) }
fn default_key(s: &Shortcuts, id: &str) -> String {
    if id == "global" { return GLOBAL_DEFAULT.into(); }
    if id == LAST_ID { return LAST_DEFAULT.into(); }
    if id.ends_with("::NewDoc") { return if cfg!(not(target_os = "macos")) { "ctrl-n" } else { "cmd-n" }.into(); }
    s.base.iter().find(|b| b.action().name() == id).map(|b| b.keystrokes().iter().map(unparse).collect::<Vec<_>>().join(" ")).unwrap_or_default()
}
/// The key an action runs on now.
pub fn key_of(cx: &App, id: &str) -> String {
    cx.try_global::<Shortcuts>().map(|s| s.custom.get(id).cloned().unwrap_or_else(|| default_key(s, id))).unwrap_or_default()
}
/// (action, label, key) of the shortcuts the user can change, in settings order (the global one first).
pub fn rows(cx: &App) -> Vec<(String, String, String)> {
    let Some(s) = cx.try_global::<Shortcuts>() else { return vec![] };
    let mut rows: Vec<(usize, String, String, String)> = vec![];
    for b in &s.base {
        let name = b.action().name();
        if let Some(title) = label(name) {
            if rows.iter().any(|(_, id, _, _)| id == name) { continue; }
            rows.push((info(name).unwrap().0, name.into(), title.into(), key_of(cx, name)));
        }
    }
    rows.sort_by_key(|r| r.0);
    [("global".to_string(), tr("全局快速新建笔记窗口", "Quick note from anywhere").to_string(), global_key()), (LAST_ID.to_string(), tr("打开上次使用的文档", "Open last used document").to_string(), key_of(cx, LAST_ID))]
        .into_iter().filter(|_| cfg!(target_os = "macos"))
        .chain(rows.into_iter().map(|(_, id, t, k)| (id, t, k))).collect()
}
pub fn pretty(key: &str) -> String {
    if key.is_empty() { return tr("未设置", "Not set").into(); }
    key.split(' ').map(|stroke| {
        let Ok(ks) = parse_key(stroke) else { return stroke.to_string() };
        let m = ks.modifiers;
        let win = !mac();
        let names = if win { [(m.control, "Ctrl"), (m.alt, "Alt"), (m.shift, "Shift"), (m.platform, if cfg!(target_os = "windows") { "Win" } else { "Super" })] } else { [(m.control, "⌃"), (m.alt, "⌥"), (m.shift, "⇧"), (m.platform, "⌘")] };
        let mut out: Vec<String> = names.into_iter().filter(|(on, _)| *on).map(|(_, s)| s.to_string()).collect();
        out.push(match ks.key.as_str() {
            "space" => "Space".into(), "escape" => "Esc".into(),
            "enter" | "backspace" | "delete" | "tab" if win => { let k = ks.key.as_str(); k[..1].to_uppercase() + &k[1..] }
            "enter" => "↩".into(), "backspace" => "⌫".into(), "delete" => "⌦".into(), "tab" => "⇥".into(),
            "up" => "↑".into(), "down" => "↓".into(), "left" => "←".into(), "right" => "→".into(),
            k if k.chars().count() == 1 => k.to_uppercase(),
            k => { let mut c = k.chars(); c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default() }
        });
        out.join(if win { "+" } else { " " })
    }).collect::<Vec<_>>().join("  →  ")
}
fn sequence(key: &str) -> anyhow::Result<Vec<Keystroke>> {
    key.split_whitespace().map(|k| parse_key(k).map_err(Into::into)).collect()
}
fn overlaps(a: &[Keystroke], b: &[Keystroke]) -> bool {
    !a.is_empty() && !b.is_empty() && (a.starts_with(b) || b.starts_with(a))
}
/// Prefix conflicts also need replacing: a single key must not consume a chord.
fn conflicts(s: &Shortcuts, id: &str, key: &str) -> Vec<String> {
    let Ok(parsed) = sequence(key) else { return vec![] };
    let contexts: Vec<_> = s.base.iter().filter(|b| b.action().name() == id).map(|b| b.predicate().map(|p| p.to_string())).collect();
    let mut found = vec![];
    for b in &s.base {
        let name = b.action().name();
        if name == id || found.iter().any(|n| n == name) { continue; }
        let other = s.custom.get(name).cloned().unwrap_or_else(|| b.keystrokes().iter().map(unparse).collect::<Vec<_>>().join(" "));
        let same_context = contexts.contains(&b.predicate().map(|p| p.to_string()));
        if (label(name).is_some() || same_context || is_global(id)) && sequence(&other).is_ok_and(|other| overlaps(&parsed, &other)) {
            found.push(name.to_string());
        }
    }
    found
}
