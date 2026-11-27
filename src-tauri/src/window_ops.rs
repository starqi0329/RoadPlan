use std::sync::Mutex;

use serde::Serialize;
use tauri::webview::Color;
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

/// 置顶卡在"整张卡片"和"只留当前计划迷你条"之间切换。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MiniMode {
    mini: bool,
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
    // 只隐藏主窗，不写布局；已隐藏再调仍 Ok。找不到主窗不假装成功。
    let main = require_main(app)?;
    // tao 在最小化几轮之后会把「已隐藏」标志和真实窗口弄反，hide() 变成空操作，× 就关不上。
    let _ = main.hide();
    native_hide(&main)?;
    // 胶囊流程会先 show_capsule 再藏主窗：个别环境下藏主窗后副窗会丢置顶/可见性，这里按标志补一次。
    reassert_visible_secondaries(app)?;
    Ok(())
}

pub fn show_main(app: &AppHandle) -> Result<(), AppError> {
    let main = require_main(app)?;
    // 托盘隐藏与系统最小化都能恢复。tao 的 unminimize/show 在标志脱节时不会真的把窗拉回来。
    let _ = main.unminimize();
    let _ = main.show();
    native_restore_show(&main)?;
    let _ = main.set_focus();
    Ok(())
}

/// 系统最小化：整窗进任务栏，不等于进托盘，也不改 `mainCollapsed`。
pub fn minimize_main(app: &AppHandle) -> Result<(), AppError> {
    let main = require_main(app)?;
    // 不走 window.minimize()。无边框窗几次之后会丢掉 WS_MINIMIZEBOX，
    // tao 还会在最小化后面再 ShowWindow(SW_SHOW)，于是只能成功两三次。
    native_minimize(&main)
}

fn require_main(app: &AppHandle) -> Result<tauri::WebviewWindow, AppError> {
    require_labeled(app, MAIN_LABEL)
}

fn require_labeled(app: &AppHandle, label: &str) -> Result<tauri::WebviewWindow, AppError> {
    app.get_webview_window(label)
        .ok_or_else(|| window_not_found(label))
}

fn window_not_found(label: &str) -> AppError {
    AppError::NotFound {
        entity: "window".into(),
        id: label.to_owned(),
    }
}

fn reassert_visible_secondaries(app: &AppHandle) -> Result<(), AppError> {
    let Some(state) = app.try_state::<WindowUiState>() else {
        return Ok(());
    };
    let (pin_visible, capsule_visible) = {
        let guard = lock_layout(&state)?;
        (guard.pin_visible, guard.capsule_visible)
    };
    if pin_visible && let Some(win) = app.get_webview_window(PIN_LABEL) {
        let _ = win.set_always_on_top(true);
        let _ = win.show();
        native_show_topmost(&win)?;
    }
    if capsule_visible && let Some(win) = app.get_webview_window(CAPSULE_LABEL) {
        let _ = win.set_always_on_top(true);
        let _ = win.show();
        native_show_topmost(&win)?;
    }
    Ok(())
}

pub fn show_pin(app: &AppHandle, state: &WindowUiState) -> Result<(), AppError> {
    ensure_secondary_window(app, state, PIN_LABEL)?;
    let win = require_labeled(app, PIN_LABEL)?;
    let layout = get_window_layout(state)?;
    let mut frame = window_layout::resolve_pin_frame(layout.pin.as_ref());
    // 卡片贴主屏右上角（原型 right:26 / top:96），别压在用户正在看的窗口中间。
    frame.width = frame.width.max(window_layout::PIN_MIN_WIDTH);
    frame.height = frame.height.max(window_layout::PIN_MIN_HEIGHT);
    let (x, y) = pin_on_screen(&win, &frame);
    frame.x = x;
    frame.y = y;
    apply_frame(&win, &frame)?;
    let _ = win.unminimize();
    let _ = win.set_always_on_top(true);
    present_secondary(&win, "置顶")?;
    // 从迷你条点出来也一定回到整张卡。
    let _ = app.emit("pin-mini-mode", MiniMode { mini: false });
    finish_pin_surface(&win, &frame);
    update_visibility(app, state, |layout| layout.pin_visible = true)
}

pub fn hide_pin(app: &AppHandle, state: &WindowUiState) -> Result<(), AppError> {
    if let Some(win) = app.get_webview_window(PIN_LABEL) {
        let _ = win.hide();
        native_hide(&win)?;
    }
    update_visibility(app, state, |layout| layout.pin_visible = false)
}

pub fn show_capsule(app: &AppHandle, state: &WindowUiState) -> Result<(), AppError> {
    // 迷你条不是第二个窗口：就是置顶卡自己收起来，同一张卡、同一个 WebView，
    // 只留一条"当前正在执行"的迷你条，点它再展开回卡片。
    ensure_secondary_window(app, state, PIN_LABEL)?;
    let win = require_labeled(app, PIN_LABEL)?;
    let layout = get_window_layout(state)?;
    let card = window_layout::resolve_pin_frame(layout.pin.as_ref());
    // 迷你条贴着卡片右上角，右边缘保持不动，缩下去不会横跳。
    let now = current_frame(&win, &card);
    let pill = window_layout::default_capsule_frame();
    let mini = WindowFrame {
        x: now.x + now.width - pill.width,
        y: now.y,
        width: pill.width,
        height: pill.height,
    };
    apply_frame(&win, &mini)?;
    let _ = win.unminimize();
    let _ = win.set_always_on_top(true);
    present_secondary(&win, "迷你条")?;
    app.emit("pin-mini-mode", MiniMode { mini: true })
        .map_err(|error| AppError::Internal {
            message: format!("切换迷你条失败: {error}"),
        })?;
    update_visibility(app, state, |layout| {
        layout.pin_visible = true;
        layout.capsule_visible = true;
    })
}

pub fn hide_capsule(app: &AppHandle, state: &WindowUiState) -> Result<(), AppError> {
    if let Some(win) = app.get_webview_window(PIN_LABEL) {
        let layout = get_window_layout(state)?;
        let card = window_layout::resolve_pin_frame(layout.pin.as_ref());
        // 展开时右边缘对齐迷你条的右边缘，卡片就长回原来的位置。
        let now = current_frame(&win, &card);
        let frame = WindowFrame {
            x: now.x + now.width - card.width,
            y: now.y,
            width: card.width,
            height: card.height,
        };
        apply_frame(&win, &frame)?;
        let _ = win.set_always_on_top(true);
        let _ = win.show();
    }
    let _ = app.emit("pin-mini-mode", MiniMode { mini: false });
    update_visibility(app, state, |layout| {
        layout.pin_visible = true;
        layout.capsule_visible = false;
    })
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
            window_layout::resolve_pin_frame(layout.pin.as_ref()),
            false,
        ),
        CAPSULE_LABEL => (
            "时序 · 胶囊",
            window_layout::resolve_capsule_frame(layout.capsule.as_ref()),
            true,
        ),
        other => {
            return Err(AppError::Internal {
                message: format!("未知窗口标签: {other}"),
            });
        }
    };

    // 用干净的 index.html，避免 ?window= 在开发服务器里打不开页面。
    // 角色在页面脚本跑之前写入，前端首屏就能认 pin / capsule。
    let url = WebviewUrl::App("index.html".into());
    let mut builder = WebviewWindowBuilder::new(app, label, url)
        .title(title)
        .inner_size(frame.width, frame.height)
        .position(frame.x, frame.y)
        .always_on_top(true)
        // 先可见再建。visible(false) 再 show() 时，tao 的可见标志经常已经是 true，
        // ShowWindow 被跳过，置顶点了桌面上什么都没有。
        .visible(true)
        .focused(false)
        .decorations(false)
        .maximizable(false)
        // 圆角露出的底就是窗底色：置顶卡片和迷你条都是白底，边角才不脏。
        .background_color(Color(255, 255, 255, 255))
        .initialization_script(secondary_boot_script(label))
        .on_page_load(|window, payload| {
            if payload.event() != tauri::webview::PageLoadEvent::Finished {
                return;
            }
            let label = window.label();
            if label != PIN_LABEL && label != CAPSULE_LABEL {
                return;
            }
            if label == PIN_LABEL {
                let _ = window.eval(pin_fallback_script());
            }
        });

    if skip_taskbar {
        builder = builder.skip_taskbar(true);
    }

    builder.build().map_err(|error| AppError::Internal {
        message: format!("创建窗口 {label} 失败: {error}"),
    })?;

    if app.get_webview_window(label).is_none() {
        return Err(window_not_found(label));
    }
    Ok(())
}

fn secondary_boot_script(label: &str) -> String {
    let mut script = format!(
        r#"window.__ROADPLAN_ROLE__="{label}";
document.addEventListener("DOMContentLoaded",function(){{document.documentElement.dataset.windowRole="{label}";}});"#,
    );
    if label == PIN_LABEL {
        script.push_str(pin_fallback_script());
    }
    script
}

/// 页面还没把 React 画出来时，先放一条能看见的横条：左边拖，右边关闭。
fn pin_fallback_script() -> &'static str {
    r##"
(function () {
  function run() {
    var root = document.documentElement;
    if (!root) { setTimeout(run, 30); return; }
    root.dataset.windowRole = "pin";
    if (document.getElementById("pin-fallback")) return;
    var bar = document.createElement("div");
    bar.id = "pin-fallback";
    bar.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;display:flex;align-items:center;gap:10px;padding:10px 12px;background:#ffffff;color:#1d1d1f;font:13px/1.4 Segoe UI,Microsoft YaHei,sans-serif;box-sizing:border-box;";
    bar.style.setProperty("-webkit-app-region", "drag");
    bar.style.setProperty("app-region", "drag");
    var label = document.createElement("div");
    label.style.flex = "1";
    label.style.minWidth = "0";
    var kicker = document.createElement("div");
    kicker.textContent = "置顶时刻表";
    kicker.style.fontSize = "11px";
    kicker.style.color = "#8a8a8e";
    var title = document.createElement("div");
    title.textContent = "按住这里拖动";
    title.style.fontWeight = "600";
    label.appendChild(kicker);
    label.appendChild(title);
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = "关闭";
    button.style.cssText = "flex:0 0 auto;border:1px solid rgba(0,0,0,.18);background:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;";
    button.style.setProperty("-webkit-app-region", "no-drag");
    button.style.setProperty("app-region", "no-drag");
    button.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      event.stopPropagation();
      var internals = window.__TAURI_INTERNALS__;
      if (internals && internals.invoke) internals.invoke("hide_pin", {});
    });
    bar.appendChild(label);
    bar.appendChild(button);
    root.appendChild(bar);
    function retire() {
      var closeBtn = document.querySelector("[data-pin-bar] button");
      if (!closeBtn) return;
      var box = closeBtn.getBoundingClientRect();
      if (box.width > 8 && box.height > 8) {
        bar.remove();
        watch.disconnect();
      }
    }
    var watch = new MutationObserver(retire);
    watch.observe(root, { childList: true, subtree: true });
    retire();
  }
  run();
})();
"##
}

/// 窗口现在的逻辑坐标和大小，用来保证缩/展开时右边缘不跳。
fn current_frame(window: &tauri::WebviewWindow, fallback: &WindowFrame) -> WindowFrame {
    let scale = window.scale_factor().unwrap_or(1.0);
    match (window.outer_position(), window.outer_size()) {
        (Ok(position), Ok(size)) => WindowFrame {
            x: position.x as f64 / scale,
            y: position.y as f64 / scale,
            width: size.width as f64 / scale,
            height: size.height as f64 / scale,
        },
        _ => fallback.clone(),
    }
}

fn pin_on_screen(window: &tauri::WebviewWindow, frame: &WindowFrame) -> (f64, f64) {
    let Ok(Some(monitor)) = window.primary_monitor() else {
        return (160.0, 96.0);
    };
    // 显示器报的缩放和窗口自己的缩放可能不一致（这台机 200% 下报成 1.0），
    // 统一按窗口 scale_factor 把物理像素换成逻辑坐标，否则会算到屏幕外。
    let scale = window.scale_factor().unwrap_or(1.0).max(1.0);
    let origin_x = monitor.position().x as f64 / scale;
    let origin_y = monitor.position().y as f64 / scale;
    let screen_w = monitor.size().width as f64 / scale;
    let screen_h = monitor.size().height as f64 / scale;
    // 原型是 right:26px / top:96px
    let x = origin_x + (screen_w - frame.width - 26.0).max(16.0);
    let y = origin_y + (screen_h - frame.height - 26.0).clamp(16.0, 96.0);
    (x, y)
}

fn finish_pin_surface(window: &tauri::WebviewWindow, frame: &WindowFrame) {
    #[cfg(windows)]
    if let (Ok(hwnd), Ok(scale)) = (native_hwnd(window), window.scale_factor()) {
        let x = (frame.x * scale).round() as i32;
        let y = (frame.y * scale).round() as i32;
        let width = (frame.width * scale).round().max(1.0) as i32;
        let height = (frame.height * scale).round().max(1.0) as i32;
        unsafe {
            ShowWindow(hwnd, SW_SHOW);
            SetWindowPos(hwnd, HWND_TOPMOST, x, y, width, height, SWP_SHOWWINDOW);
            let _ = SetForegroundWindow(hwnd);
        }
    }
    let _ = window.eval(pin_fallback_script());
}

fn present_secondary(window: &tauri::WebviewWindow, name: &str) -> Result<(), AppError> {
    let _ = window.show();
    native_show_topmost(window).map_err(|error| match error {
        AppError::Internal { message } => AppError::Internal {
            message: format!("显示{name}失败: {message}"),
        },
        other => other,
    })
}

/// 无边框窗口不能只靠 tao 的 minimize/hide/show。
/// 那条路径会对照内部标志，对了就什么都不做；最小化几次后标志和桌面上的窗对不上。
fn native_minimize(window: &tauri::WebviewWindow) -> Result<(), AppError> {
    #[cfg(windows)]
    {
        let hwnd = native_hwnd(window)?;
        unsafe {
            // 无边框样式刷新后 WS_MINIMIZEBOX 会丢，SW_MINIMIZE 从第三次起被系统忽略。
            let style = GetWindowLongW(hwnd, GWL_STYLE);
            SetWindowLongW(hwnd, GWL_STYLE, style | WS_MINIMIZEBOX | WS_SYSMENU);
            if IsIconic(hwnd) != 0 {
                ShowWindow(hwnd, SW_RESTORE);
            }
            ShowWindow(hwnd, SW_MINIMIZE);
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        window.minimize().map_err(|error| AppError::Internal {
            message: format!("最小化主窗失败: {error}"),
        })
    }
}

fn native_hide(window: &tauri::WebviewWindow) -> Result<(), AppError> {
    #[cfg(windows)]
    {
        let hwnd = native_hwnd(window)?;
        unsafe {
            ShowWindow(hwnd, SW_HIDE);
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        window.hide().map_err(|error| AppError::Internal {
            message: format!("隐藏窗口失败: {error}"),
        })
    }
}

fn native_restore_show(window: &tauri::WebviewWindow) -> Result<(), AppError> {
    #[cfg(windows)]
    {
        let hwnd = native_hwnd(window)?;
        unsafe {
            ShowWindow(hwnd, SW_RESTORE);
            ShowWindow(hwnd, SW_SHOW);
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        window.show().map_err(|error| AppError::Internal {
            message: format!("显示窗口失败: {error}"),
        })
    }
}

fn native_show_topmost(window: &tauri::WebviewWindow) -> Result<(), AppError> {
    #[cfg(windows)]
    {
        let hwnd = native_hwnd(window)?;
        unsafe {
            if IsIconic(hwnd) != 0 {
                ShowWindow(hwnd, SW_RESTORE);
            }
            ShowWindow(hwnd, SW_SHOW);
            // 标志已经是置顶时 tao 不会再 SetWindowPos，小窗就留在主窗后面。
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
            );
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        window.show().map_err(|error| AppError::Internal {
            message: format!("显示窗口失败: {error}"),
        })
    }
}

#[cfg(windows)]
fn native_hwnd(window: &tauri::WebviewWindow) -> Result<*mut std::ffi::c_void, AppError> {
    let hwnd = window.hwnd().map_err(|error| AppError::Internal {
        message: format!("读取窗口句柄失败: {error}"),
    })?;
    Ok(hwnd.0)
}

#[cfg(windows)]
const GWL_STYLE: i32 = -16;
#[cfg(windows)]
const WS_MINIMIZEBOX: i32 = 0x0002_0000;
#[cfg(windows)]
const WS_SYSMENU: i32 = 0x0008_0000;
#[cfg(windows)]
const SW_HIDE: i32 = 0;
#[cfg(windows)]
const SW_SHOW: i32 = 5;
#[cfg(windows)]
const SW_MINIMIZE: i32 = 6;
#[cfg(windows)]
const SW_RESTORE: i32 = 9;
#[cfg(windows)]
const SWP_NOSIZE: u32 = 0x0001;
#[cfg(windows)]
const SWP_NOMOVE: u32 = 0x0002;
#[cfg(windows)]
const SWP_SHOWWINDOW: u32 = 0x0040;
#[cfg(windows)]
const HWND_TOPMOST: *mut std::ffi::c_void = -1isize as *mut std::ffi::c_void;

#[cfg(windows)]
unsafe extern "system" {
    fn GetWindowLongW(hwnd: *mut std::ffi::c_void, index: i32) -> i32;
    fn SetWindowLongW(hwnd: *mut std::ffi::c_void, index: i32, new: i32) -> i32;
    fn ShowWindow(hwnd: *mut std::ffi::c_void, cmd: i32) -> i32;
    fn IsIconic(hwnd: *mut std::ffi::c_void) -> i32;
    fn SetWindowPos(
        hwnd: *mut std::ffi::c_void,
        insert_after: *mut std::ffi::c_void,
        x: i32,
        y: i32,
        cx: i32,
        cy: i32,
        flags: u32,
    ) -> i32;
    fn SetForegroundWindow(hwnd: *mut std::ffi::c_void) -> i32;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_main_is_not_found_not_ok() {
        let err = window_not_found(MAIN_LABEL);
        assert!(matches!(
            err,
            AppError::NotFound { entity, id }
                if entity == "window" && id == MAIN_LABEL
        ));
    }

    #[test]
    fn missing_secondary_is_not_found() {
        let err = window_not_found(PIN_LABEL);
        assert!(matches!(
            err,
            AppError::NotFound { entity, id }
                if entity == "window" && id == PIN_LABEL
        ));
    }

    #[test]
    fn minimize_path_does_not_touch_collapsed_flag() {
        // 回归：最小化权威路径独立于 set_main_collapsed；布局折叠标志默认仍为 false。
        let layout = default_layout();
        assert!(!layout.main_collapsed);
        assert!(window_layout::validate_layout(&layout).is_ok());
    }
}
