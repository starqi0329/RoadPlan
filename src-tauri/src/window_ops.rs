use std::sync::Mutex;

use serde::Serialize;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder,
};

use crate::domain::{WindowFrame, WindowLayout};
use crate::error::AppError;
use crate::window_layout::{
    self, CAPSULE_LABEL, MAIN_LABEL, PIN_LABEL, default_layout, load_layout, save_layout,
};

#[derive(Debug)]
pub struct WindowUiState {
    pub layout: Mutex<WindowLayout>,
    pub dragging: Mutex<bool>,
}

impl WindowUiState {
    pub fn from_disk(app: &AppHandle) -> Self {
        let layout = match load_layout(app) {
            Ok(layout) => layout,
            Err(_) => default_layout(),
        };
        Self {
            layout: Mutex::new(layout),
            dragging: Mutex::new(false),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DraggingChanged {
    dragging: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MainCollapsedChanged {
    collapsed: bool,
}

pub fn get_window_layout(state: &WindowUiState) -> Result<WindowLayout, AppError> {
    lock_layout(state).map(|guard| guard.clone())
}

pub fn save_window_layout(
    app: &AppHandle,
    state: &WindowUiState,
    layout: WindowLayout,
) -> Result<(), AppError> {
    // 过小 / 屏外 / 非有限值一律拒绝，避免折叠壳或隐藏后的废几何覆盖展开尺寸。
    window_layout::validate_layout(&layout)?;
    save_layout(app, &layout)?;
    let mut guard = lock_layout(state)?;
    *guard = layout;
    Ok(())
}

pub fn set_main_collapsed(
    app: &AppHandle,
    state: &WindowUiState,
    collapsed: bool,
) -> Result<(), AppError> {
    {
        let mut guard = lock_layout(state)?;
        // 只改折叠标志，保留上次合法的展开几何。
        guard.main_collapsed = collapsed;
        save_layout(app, &guard)?;
    }
    app.emit("main-collapsed-changed", MainCollapsedChanged { collapsed })
        .map_err(|error| AppError::Internal {
            message: format!("发送折叠状态失败: {error}"),
        })?;
    Ok(())
}

pub fn hide_main_to_tray(app: &AppHandle) -> Result<(), AppError> {
    // 只隐藏，不把系统在隐藏后给出的坐标/尺寸写回布局。
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        main.hide().map_err(|error| AppError::Internal {
            message: format!("隐藏主窗失败: {error}"),
        })?;
    }
    Ok(())
}

pub fn show_main(app: &AppHandle) -> Result<(), AppError> {
    let main = app
        .get_webview_window(MAIN_LABEL)
        .ok_or_else(|| AppError::Internal {
            message: "主窗不存在".into(),
        })?;
    main.show().map_err(|error| AppError::Internal {
        message: format!("显示主窗失败: {error}"),
    })?;
    main.set_focus().map_err(|error| AppError::Internal {
        message: format!("聚焦主窗失败: {error}"),
    })?;
    Ok(())
}

pub fn show_pin(app: &AppHandle, state: &WindowUiState) -> Result<(), AppError> {
    ensure_secondary_window(app, state, PIN_LABEL)?;
    if let Some(win) = app.get_webview_window(PIN_LABEL) {
        win.set_always_on_top(true)
            .map_err(|error| AppError::Internal {
                message: format!("设置置顶失败: {error}"),
            })?;
        win.show().map_err(|error| AppError::Internal {
            message: format!("显示置顶窗失败: {error}"),
        })?;
        win.set_focus().map_err(|error| AppError::Internal {
            message: format!("聚焦置顶窗失败: {error}"),
        })?;
    }
    update_visibility(app, state, |layout| layout.pin_visible = true)
}

pub fn hide_pin(app: &AppHandle, state: &WindowUiState) -> Result<(), AppError> {
    if let Some(win) = app.get_webview_window(PIN_LABEL) {
        win.hide().map_err(|error| AppError::Internal {
            message: format!("隐藏置顶窗失败: {error}"),
        })?;
    }
    update_visibility(app, state, |layout| layout.pin_visible = false)
}

pub fn show_capsule(app: &AppHandle, state: &WindowUiState) -> Result<(), AppError> {
    ensure_secondary_window(app, state, CAPSULE_LABEL)?;
    if let Some(win) = app.get_webview_window(CAPSULE_LABEL) {
        win.set_always_on_top(true)
            .map_err(|error| AppError::Internal {
                message: format!("设置胶囊置顶失败: {error}"),
            })?;
        win.show().map_err(|error| AppError::Internal {
            message: format!("显示胶囊失败: {error}"),
        })?;
    }
    update_visibility(app, state, |layout| layout.capsule_visible = true)
}

pub fn hide_capsule(app: &AppHandle, state: &WindowUiState) -> Result<(), AppError> {
    if let Some(win) = app.get_webview_window(CAPSULE_LABEL) {
        win.hide().map_err(|error| AppError::Internal {
            message: format!("隐藏胶囊失败: {error}"),
        })?;
    }
    update_visibility(app, state, |layout| layout.capsule_visible = false)
}

pub fn set_dragging(
    app: &AppHandle,
    state: &WindowUiState,
    dragging: bool,
) -> Result<(), AppError> {
    {
        let mut guard = state.dragging.lock().map_err(|_| AppError::Internal {
            message: "拖动态锁已损坏".into(),
        })?;
        *guard = dragging;
    }
    // 当前未启用亚克力/系统模糊；发出事件供前端减弱大面积透明（R32 钩子）。
    app.emit("dragging-changed", DraggingChanged { dragging })
        .map_err(|error| AppError::Internal {
            message: format!("发送拖动态失败: {error}"),
        })?;
    Ok(())
}

pub fn quit_app(app: &AppHandle) -> Result<(), AppError> {
    app.exit(0);
    Ok(())
}

pub fn apply_startup_layout(app: &AppHandle, state: &WindowUiState) -> Result<(), AppError> {
    let layout = get_window_layout(state)?;
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        main.set_decorations(false)
            .map_err(|error| AppError::Internal {
                message: format!("设置主窗无边框失败: {error}"),
            })?;
        apply_frame(&main, &layout.main)?;
    }
    if layout.pin_visible {
        show_pin(app, state)?;
    }
    if layout.capsule_visible {
        show_capsule(app, state)?;
    }
    Ok(())
}

fn lock_layout(state: &WindowUiState) -> Result<std::sync::MutexGuard<'_, WindowLayout>, AppError> {
    state.layout.lock().map_err(|_| AppError::Internal {
        message: "窗口状态锁已损坏".into(),
    })
}

fn update_visibility(
    app: &AppHandle,
    state: &WindowUiState,
    mutate: impl FnOnce(&mut WindowLayout),
) -> Result<(), AppError> {
    let mut guard = lock_layout(state)?;
    mutate(&mut guard);
    save_layout(app, &guard)?;
    Ok(())
}

fn ensure_secondary_window(
    app: &AppHandle,
    state: &WindowUiState,
    label: &str,
) -> Result<(), AppError> {
    if app.get_webview_window(label).is_some() {
        return Ok(());
    }
    let layout = get_window_layout(state)?;
    let (title, frame, skip_taskbar) = match label {
        PIN_LABEL => (
            "时序 · 置顶",
            layout.pin.unwrap_or(WindowFrame {
                x: 80.0,
                y: 120.0,
                width: 320.0,
                height: 480.0,
            }),
            false,
        ),
        CAPSULE_LABEL => (
            "时序 · 胶囊",
            layout.capsule.unwrap_or(WindowFrame {
                x: 0.0,
                y: 240.0,
                width: 56.0,
                height: 160.0,
            }),
            true,
        ),
        other => {
            return Err(AppError::Internal {
                message: format!("未知窗口标签: {other}"),
            });
        }
    };

    // 主窗 / 置顶 / 胶囊均为无系统边框（S5）；拖动由前端 startDragging。
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title(title)
        .inner_size(frame.width, frame.height)
        .position(frame.x, frame.y)
        .always_on_top(true)
        .visible(false)
        .decorations(false);

    if skip_taskbar {
        builder = builder.skip_taskbar(true);
    }

    builder.build().map_err(|error| AppError::Internal {
        message: format!("创建窗口 {label} 失败: {error}"),
    })?;
    Ok(())
}

fn apply_frame(window: &tauri::WebviewWindow, frame: &WindowFrame) -> Result<(), AppError> {
    window
        .set_size(LogicalSize::new(frame.width, frame.height))
        .map_err(|error| AppError::Internal {
            message: format!("设置窗口大小失败: {error}"),
        })?;
    window
        .set_position(LogicalPosition::new(frame.x, frame.y))
        .map_err(|error| AppError::Internal {
            message: format!("设置窗口位置失败: {error}"),
        })?;
    Ok(())
}
