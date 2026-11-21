#![recursion_limit = "512"]
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

pub(crate) const APP_ID: &str = "com.merak.workbench";

mod app;
#[allow(dead_code, unused_imports)]
mod assets;
#[cfg(unix)]
#[allow(dead_code)]
mod big_alloc;
#[cfg(unix)]
#[global_allocator]
static ALLOC: big_alloc::Alloc = big_alloc::Alloc;
#[allow(dead_code, unused_imports)]
mod board;
#[allow(dead_code, unused_imports)]
mod clipboard;
#[cfg(feature = "devtools")]
#[allow(dead_code, unused_imports)]
mod devtools;
#[cfg(not(feature = "devtools"))]
#[allow(dead_code, unused_imports)]
mod devtools {
    pub static RENDER_NS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    pub fn scripted() -> bool { false }
    pub fn start(_: &mut gpui::Window, _: &mut gpui::App) {}
    pub fn take_pick() -> Option<Vec<std::path::PathBuf>> { None }
    pub fn file_drag() -> bool { false }
}
#[allow(dead_code, unused_imports)]
mod docinfo;
#[allow(dead_code, unused_imports)]
mod editor;
#[allow(dead_code, unused_imports)]
mod editor_theme;
#[allow(dead_code, unused_imports)]
mod editor_ui;
#[allow(dead_code, unused_imports)]
mod feishu_theme;
#[allow(dead_code, unused_imports)]
mod highlight;
#[allow(dead_code, unused_imports)]
mod input;
#[allow(dead_code, unused_imports)]
mod l10n;
#[allow(dead_code, unused_imports)]
mod logging;
mod merak;
#[cfg(target_os = "macos")]
#[allow(dead_code, unused_imports)]
mod native_header;
#[cfg(not(target_os = "macos"))]
#[allow(dead_code, unused_imports)]
#[path = "native_header_fallback.rs"]
mod native_header;
#[allow(dead_code, unused_imports)]
mod quick_note;
#[allow(dead_code, unused_imports)]
mod settings;
#[allow(dead_code, unused_imports)]
mod shared_store;
#[allow(dead_code, unused_imports)]
mod shortcuts;
#[allow(dead_code, unused_imports)]
mod table;
#[allow(dead_code, unused_imports)]
mod theme;
#[allow(dead_code, unused_imports)]
mod themes;
#[allow(dead_code, unused_imports)]
mod transfer;
#[allow(dead_code, unused_imports)]
mod ui;

use fdl_core::{docxml, lang, markdown, model, palette, paste, store, time, whiteboard};
use gpui::*;

pub(crate) fn init_app(cx: &mut App) {
    cx.set_cursor_hide_mode(CursorHideMode::Never);
    #[cfg(any(target_os = "linux", target_os = "freebsd"))]
    editor::emoji::load_font(cx);
    editor::math::load_fonts(cx);
    board::fonts::load(cx);
    editor::image::init_pictures(cx);
    input::bind_keys(cx);
    editor::keymap::bind_keys(cx);
    editor::image::bind_keys(cx);
    board::bind_keys(cx);
    app::bind_keys(cx);
    settings::load();
    settings::apply_appearance(&settings::prefs().appearance);
    settings::sync_dark(cx);
    themes::load(&settings::prefs().theme_id(), false, || cx.text_system().all_font_names());
    shortcuts::init(cx);
}

fn open_main_window(scripted: bool, cx: &mut App) {
    let bounds = Bounds::centered(None, size(px(1440.), px(900.)), cx);
    let options = WindowOptions {
        window_bounds: Some(WindowBounds::Windowed(bounds)),
        window_background: theme::window_background(),
        app_id: Some(APP_ID.into()),
        window_decorations: if cfg!(target_os = "linux") { Some(WindowDecorations::Client) } else { None },
        titlebar: Some(TitlebarOptions {
            title: Some("Merak".into()),
            appears_transparent: cfg!(any(target_os = "macos", target_os = "windows")),
            traffic_light_position: Some(point(px(20.), px(app::HEADER_H / 2. - 7.))),
        }),
        window_min_size: Some(size(px(960.), px(600.))),
        app_owns_titlebar_drag: true,
        focus: !scripted,
        ..Default::default()
    };
    cx.open_window(options, |window, cx| {
        devtools::start(window, cx);
        cx.new(|cx| merak::MerakWorkspace::new(window, cx))
    })
    .expect("open Merak window");
}

fn main() {
    logging::init();
    let scripted = devtools::scripted();
    let root = store::Store::root_dir();
    let _ = fdl_core::vfs::create_dir_all(&root);
    logging::write(&format!("merak library {}", root.display()));

    let app = gpui_platform::application().with_assets(assets::Assets);
    app.on_reopen(|cx| {
        if cx.windows().is_empty() {
            open_main_window(false, cx);
        }
    });
    app.run(move |cx: &mut App| {
        init_app(cx);
        match shared_store::SharedStore::open() {
            Ok(s) => cx.set_global(s),
            Err(err) => logging::fatal("Could not open Merak library", &err),
        }
        app::set_menus(cx);
        open_main_window(scripted, cx);
        cx.on_window_closed(move |cx, _| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();
        if !scripted {
            cx.activate(true);
        }
    });
}
