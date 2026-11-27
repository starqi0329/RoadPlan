use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::domain::{WindowFrame, WindowLayout};
use crate::error::AppError;

pub const MAIN_LABEL: &str = "main";
pub const PIN_LABEL: &str = "pin";
pub const CAPSULE_LABEL: &str = "capsule";

/// 主窗可用区下限：低于此视为折叠壳 / 坏档，不能当作下次正常几何。
pub const MAIN_MIN_WIDTH: f64 = 640.0;
pub const MAIN_MIN_HEIGHT: f64 = 480.0;

/// 置顶窗：一张竖版时刻表卡片，不是横条。
pub const PIN_MIN_WIDTH: f64 = 260.0;
pub const PIN_MIN_HEIGHT: f64 = 240.0; // 卡片至少能放下头部 + 两条计划

/// 旧版卡片默认宽度，存档里等于它的按新默认宽迁一次。
const PIN_LEGACY_WIDTH: f64 = 320.0;
const PIN_WIDTH: f64 = 288.0;

pub const CAPSULE_MIN_WIDTH: f64 = 150.0;
pub const CAPSULE_MIN_HEIGHT: f64 = 36.0;

/// 明显屏外：真机曾出现约 -16000；超出此范围视为废坐标。
const COORD_ABS_LIMIT: f64 = 10_000.0;

pub fn default_pin_frame() -> WindowFrame {
    WindowFrame {
        x: 80.0,
        y: 96.0,
        width: PIN_WIDTH,
        height: 288.0,
    }
}

/// 折叠胶囊：横向蓝色药丸。
pub fn default_capsule_frame() -> WindowFrame {
    WindowFrame {
        x: 40.0,
        y: 640.0,
        width: 236.0,
        height: 44.0,
    }
}

pub fn default_layout() -> WindowLayout {
    WindowLayout {
        main: WindowFrame {
            x: 120.0,
            y: 80.0,
            width: 1100.0,
            height: 760.0,
        },
        pin: Some(default_pin_frame()),
        capsule: Some(default_capsule_frame()),
        main_collapsed: false,
        pin_visible: false,
        capsule_visible: false,
    }
}

/// 置顶：旧版横条几何（太矮）→ 换成卡片尺寸，保留坐标；
/// 旧版默认宽（320）→ 迁到更窄的新默认宽；其余合法卡片保留。
pub fn resolve_pin_frame(stored: Option<&WindowFrame>) -> WindowFrame {
    let default = default_pin_frame();
    match stored {
        Some(frame) if validate_frame("pin", frame, PIN_MIN_WIDTH, PIN_MIN_HEIGHT).is_ok() => {
            let mut resolved = frame.clone();
            if (resolved.width - PIN_LEGACY_WIDTH).abs() < 1.0 {
                resolved.width = default.width;
                resolved.height = resolved.height.max(default.height);
            }
            resolved
        }
        Some(frame) if coords_ok(frame) => WindowFrame {
            x: frame.x,
            y: frame.y,
            width: default.width,
            height: default.height,
        },
        _ => default,
    }
}

/// 胶囊：旧版竖条几何（太窄）→ 换成药丸尺寸，保留坐标；合法药丸保留。
pub fn resolve_capsule_frame(stored: Option<&WindowFrame>) -> WindowFrame {
    let default = default_capsule_frame();
    match stored {
        Some(frame)
            if validate_frame("capsule", frame, CAPSULE_MIN_WIDTH, CAPSULE_MIN_HEIGHT).is_ok() =>
        {
            frame.clone()
        }
        Some(frame) if coords_ok(frame) => WindowFrame {
            x: frame.x,
            y: frame.y,
            width: default.width,
            height: default.height,
        },
        _ => default,
    }
}

fn coords_ok(frame: &WindowFrame) -> bool {
    frame.x.is_finite()
        && frame.y.is_finite()
        && frame.x.abs() <= COORD_ABS_LIMIT
        && frame.y.abs() <= COORD_ABS_LIMIT
}

pub fn layout_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Internal {
            message: format!("解析应用数据目录失败: {error}"),
        })?;
    Ok(dir.join("window-layout.json"))
}

pub fn load_layout(app: &AppHandle) -> Result<WindowLayout, AppError> {
    let path = layout_path(app)?;
    if !path.exists() {
        return Ok(default_layout());
    }
    let raw = match std::fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(_) => return Ok(default_layout()),
    };
    Ok(layout_from_json(&raw))
}

/// 解析存档；坏档 / 校验失败时回退默认（不 panic、不开出废几何）。
pub fn layout_from_json(raw: &str) -> WindowLayout {
    match serde_json::from_str::<WindowLayout>(raw) {
        Ok(layout) if validate_layout(&layout).is_ok() => layout,
        _ => default_layout(),
    }
}

pub fn save_layout(app: &AppHandle, layout: &WindowLayout) -> Result<(), AppError> {
    validate_layout(layout)?;
    let path = layout_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| AppError::Internal {
            message: format!("创建布局目录失败: {error}"),
        })?;
    }
    let raw = serde_json::to_string_pretty(layout).map_err(|error| AppError::Internal {
        message: format!("序列化窗口布局失败: {error}"),
    })?;
    std::fs::write(&path, raw).map_err(|error| AppError::Internal {
        message: format!("写入窗口布局失败: {error}"),
    })?;
    Ok(())
}

pub fn validate_layout(layout: &WindowLayout) -> Result<(), AppError> {
    validate_frame("main", &layout.main, MAIN_MIN_WIDTH, MAIN_MIN_HEIGHT)?;
    if let Some(frame) = &layout.pin {
        validate_frame("pin", frame, PIN_MIN_WIDTH, PIN_MIN_HEIGHT)?;
    }
    if let Some(frame) = &layout.capsule {
        validate_frame("capsule", frame, CAPSULE_MIN_WIDTH, CAPSULE_MIN_HEIGHT)?;
    }
    Ok(())
}

/// 折叠只改标志时，主窗几何仍须满足可用区；废尺寸不得借折叠写入。
pub fn validate_frame(
    name: &str,
    frame: &WindowFrame,
    min_width: f64,
    min_height: f64,
) -> Result<(), AppError> {
    if !(frame.x.is_finite()
        && frame.y.is_finite()
        && frame.width.is_finite()
        && frame.height.is_finite())
    {
        return Err(AppError::Validation {
            field: name.into(),
            message: "窗口几何必须为有限数值".into(),
        });
    }
    if frame.width < min_width || frame.height < min_height {
        return Err(AppError::Validation {
            field: name.into(),
            message: format!("窗口宽高至少为 {min_width}×{min_height}"),
        });
    }
    if frame.x.abs() > COORD_ABS_LIMIT || frame.y.abs() > COORD_ABS_LIMIT {
        return Err(AppError::Validation {
            field: name.into(),
            message: format!("窗口坐标超出可用范围（±{COORD_ABS_LIMIT}）"),
        });
    }
    Ok(())
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn default_layout_is_valid() {
        validate_layout(&default_layout()).expect("default ok");
    }

    #[test]
    fn rejects_main_smaller_than_usable_area() {
        let mut layout = default_layout();
        layout.main.width = 25.0;
        layout.main.height = 25.0;
        assert!(matches!(
            validate_layout(&layout),
            Err(AppError::Validation { field, .. }) if field == "main"
        ));
    }

    #[test]
    fn rejects_main_below_min_even_when_collapsed_flag_set() {
        let mut layout = default_layout();
        layout.main_collapsed = true;
        layout.main.height = 48.0;
        assert!(validate_layout(&layout).is_err(), "折叠标志不能放过废高度");
    }

    #[test]
    fn accepts_collapsed_flag_with_expanded_geometry() {
        let mut layout = default_layout();
        layout.main_collapsed = true;
        validate_layout(&layout).expect("展开几何 + 折叠标志应可同时保留");
        assert!(layout.main.width >= MAIN_MIN_WIDTH);
        assert!(layout.main.height >= MAIN_MIN_HEIGHT);
        assert!(layout.main_collapsed);
    }

    #[test]
    fn rejects_obviously_off_screen_coords() {
        let mut layout = default_layout();
        layout.main.x = -16_000.0;
        layout.main.y = -16_000.0;
        assert!(matches!(
            validate_layout(&layout),
            Err(AppError::Validation { field, .. }) if field == "main"
        ));
    }

    #[test]
    fn rejects_non_finite_geometry() {
        let mut layout = default_layout();
        layout.main.width = f64::NAN;
        assert!(matches!(
            validate_layout(&layout),
            Err(AppError::Validation { .. })
        ));
    }

    #[test]
    fn bad_archive_falls_back_to_default_without_clamping() {
        let tiny = r#"{
            "main":{"x":120.0,"y":80.0,"width":25.0,"height":25.0},
            "pin":null,"capsule":null,
            "mainCollapsed":true,"pinVisible":false,"capsuleVisible":false
        }"#;
        let loaded = layout_from_json(tiny);
        let default = default_layout();
        assert_eq!(loaded.main.width, default.main.width);
        assert_eq!(loaded.main.height, default.main.height);
        assert!(!loaded.main_collapsed);
    }

    #[test]
    fn off_screen_archive_falls_back_to_default() {
        let raw = r#"{
            "main":{"x":-16000.0,"y":-16000.0,"width":1100.0,"height":760.0},
            "pin":null,"capsule":null,
            "mainCollapsed":false,"pinVisible":false,"capsuleVisible":false
        }"#;
        let loaded = layout_from_json(raw);
        assert_eq!(loaded.main.x, default_layout().main.x);
    }

    #[test]
    fn round_trip_layout_json() {
        let layout = default_layout();
        let raw = serde_json::to_string(&layout).expect("ser");
        let back: WindowLayout = serde_json::from_str(&raw).expect("de");
        assert_eq!(back.main.width, layout.main.width);
        assert_eq!(back.main_collapsed, layout.main_collapsed);
        assert!(!back.pin_visible);
    }

    #[test]
    fn default_pin_is_card_within_usable_range() {
        let pin = default_pin_frame();
        assert!(pin.width >= 260.0 && pin.width <= 300.0);
        assert!(pin.height >= 280.0 && pin.height <= 400.0);
        validate_frame("pin", &pin, PIN_MIN_WIDTH, PIN_MIN_HEIGHT).expect("pin ok");
    }

    #[test]
    fn resolve_pin_migrates_legacy_default_width_to_narrower_card() {
        let card = WindowFrame {
            x: 900.0,
            y: 120.0,
            width: PIN_LEGACY_WIDTH,
            height: 300.0,
        };
        let resolved = resolve_pin_frame(Some(&card));
        assert_eq!(resolved.x, 900.0);
        assert_eq!(resolved.width, PIN_WIDTH);
        assert!(resolved.height >= 280.0);
    }

    #[test]
    fn resolve_pin_replaces_legacy_bar_geometry_keeps_origin() {
        let bar = WindowFrame {
            x: 100.0,
            y: 200.0,
            width: 320.0,
            height: 96.0,
        };
        let resolved = resolve_pin_frame(Some(&bar));
        assert_eq!(resolved.x, 100.0);
        assert_eq!(resolved.y, 200.0);
        assert_eq!(resolved.width, default_pin_frame().width);
        assert!(resolved.height >= PIN_MIN_HEIGHT);
    }

    #[test]
    fn resolve_pin_keeps_valid_card() {
        let card = WindowFrame {
            x: 40.0,
            y: 60.0,
            width: 330.0,
            height: 400.0,
        };
        let resolved = resolve_pin_frame(Some(&card));
        assert_eq!(resolved.width, 330.0);
        assert_eq!(resolved.height, 400.0);
    }

    #[test]
    fn resolve_capsule_replaces_legacy_strip_keeps_origin() {
        let strip = WindowFrame {
            x: 12.0,
            y: 300.0,
            width: 56.0,
            height: 160.0,
        };
        let resolved = resolve_capsule_frame(Some(&strip));
        assert_eq!(resolved.x, 12.0);
        assert_eq!(resolved.y, 300.0);
        assert_eq!(resolved.width, default_capsule_frame().width);
        assert_eq!(resolved.height, default_capsule_frame().height);
    }

    #[test]
    fn default_capsule_is_horizontal_pill() {
        let capsule = default_capsule_frame();
        assert!(capsule.width >= 220.0);
        assert!(capsule.height <= 60.0);
        assert!(capsule.width > capsule.height);
        validate_frame("capsule", &capsule, CAPSULE_MIN_WIDTH, CAPSULE_MIN_HEIGHT)
            .expect("capsule ok");
    }
}
