//! No-op quick note global hotkey stub kept so `shortcuts.rs` stays intact.

use gpui::App;

pub fn set_hotkey(_key: &str, _cx: &mut App) -> anyhow::Result<()> { Ok(()) }
pub fn set_last_hotkey(_key: &str, _cx: &mut App) -> anyhow::Result<()> { Ok(()) }
pub fn register(_cx: &mut App) {}
pub fn suspend_hotkey() {}
pub fn hotkey_error() -> Option<String> { None }
