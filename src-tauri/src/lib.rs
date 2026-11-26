mod clock;
mod commands;
mod db;
mod domain;
mod error;
mod events;
mod goal_ops;
mod goal_store;
mod plan_ops;
mod plan_store;
mod review_ops;
mod review_store;
mod window_layout;
mod window_ops;

use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, RunEvent, WindowEvent};
use tauri_specta::Event;

use crate::domain::now_info;
use crate::events::MinuteTick;
use crate::window_layout::MAIN_LABEL;
use crate::window_ops::WindowUiState;

pub fn run() {
    let builder = commands::builder();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);

            let path = db::resolve_db_path(app.handle()).map_err(|error| error.to_string())?;
            let database = db::Db::open(path).map_err(|error| error.to_string())?;
            app.manage(database);

            let window_state = WindowUiState::from_disk(app.handle());
            app.manage(window_state);

            setup_tray(app.handle()).map_err(|error| error.to_string())?;

            if let Some(state) = app.try_state::<WindowUiState>() {
                let _ = window_ops::apply_startup_layout(app.handle(), &state);
            }

            start_minute_tick(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                match window.label() {
                    MAIN_LABEL => {
                        api.prevent_close();
                        let _ = window_ops::hide_main_to_tray(window.app_handle());
                    }
                    "pin" => {
                        api.prevent_close();
                        if let Some(state) = window.try_state::<WindowUiState>() {
                            let _ = window_ops::hide_pin(window.app_handle(), &state);
                        }
                    }
                    "capsule" => {
                        api.prevent_close();
                        if let Some(state) = window.try_state::<WindowUiState>() {
                            let _ = window_ops::hide_capsule(window.app_handle(), &state);
                        }
                    }
                    _ => {}
                }
            }
        })
        .build(tauri::generate_context!())
        .unwrap_or_else(|error| {
            eprintln!("启动失败: {error}");
            std::process::exit(1);
        })
        .run(|_app, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                // 托盘常驻：普通退出请求不拦截；quit_app 会直接 exit。
                let _ = api;
            }
        });
}

fn setup_tray(app: &tauri::AppHandle) -> Result<(), String> {
    let show_item = MenuItem::with_id(app, "show_main", "打开主窗", true, None::<&str>)
        .map_err(|error| format!("创建托盘菜单失败: {error}"))?;
    let quit_item = MenuItem::with_id(app, "quit_app", "退出", true, None::<&str>)
        .map_err(|error| format!("创建托盘菜单失败: {error}"))?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])
        .map_err(|error| format!("创建托盘菜单失败: {error}"))?;

    let icon = app
        .default_window_icon()
        .cloned()
        .or_else(|| tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png")).ok())
        .ok_or_else(|| "缺少托盘图标".to_owned())?;

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("时序")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show_main" => {
                let _ = window_ops::show_main(app);
            }
            "quit_app" => {
                let _ = window_ops::quit_app(app);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = window_ops::show_main(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|error| format!("创建托盘失败: {error}"))?;
    Ok(())
}

fn start_minute_tick(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last_minute: Option<u16> = None;
        loop {
            let info = now_info(clock::current_now());
            let changed = last_minute.is_none_or(|previous| previous != info.minute);
            if changed {
                last_minute = Some(info.minute);
                let tick = MinuteTick {
                    now: info.now,
                    date: info.date,
                    minute: info.minute,
                };
                let _ = tick.emit(&app);
            }
            std::thread::sleep(Duration::from_secs(1));
        }
    });
}

#[cfg(test)]
mod bindings_export {
    use std::path::PathBuf;

    #[test]
    fn writes_typescript_bindings() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/bindings.ts");
        if let Err(error) = crate::commands::export_bindings(&path) {
            panic!("生成 TypeScript 契约: {error}");
        }
    }
}
