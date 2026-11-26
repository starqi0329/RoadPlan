use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::domain::{WindowFrame, WindowLayout};
use crate::error::AppError;

pub const MAIN_LABEL: &str = "main";
pub const PIN_LABEL: &str = "pin";
pub const CAPSULE_LABEL: &str = "capsule";

pub fn default_layout() -> WindowLayout {
    WindowLayout {
        main: WindowFrame {
            x: 120.0,
            y: 80.0,
            width: 1100.0,
            height: 760.0,
        },
        pin: Some(WindowFrame {
            x: 80.0,
            y: 120.0,
            width: 320.0,
            height: 480.0,
        }),
        capsule: Some(WindowFrame {
            x: 0.0,
            y: 240.0,
            width: 56.0,
            height: 160.0,
        }),
        main_collapsed: false,
        pin_visible: false,
        capsule_visible: false,
    }
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
    let raw = std::fs::read_to_string(&path).map_err(|error| AppError::Internal {
        message: format!("读取窗口布局失败: {error}"),
    })?;
    let layout: WindowLayout = serde_json::from_str(&raw).map_err(|error| AppError::Internal {
        message: format!("解析窗口布局失败: {error}"),
    })?;
    validate_layout(&layout)?;
    Ok(layout)
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
    validate_frame("main", &layout.main)?;
    if let Some(frame) = &layout.pin {
        validate_frame("pin", frame)?;
    }
    if let Some(frame) = &layout.capsule {
        validate_frame("capsule", frame)?;
    }
    Ok(())
}

fn validate_frame(name: &str, frame: &WindowFrame) -> Result<(), AppError> {
    if frame.width <= 0.0 || frame.height <= 0.0 {
        return Err(AppError::Validation {
            field: name.into(),
            message: "窗口宽高必须大于 0".into(),
        });
    }
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
    fn rejects_non_positive_size() {
        let mut layout = default_layout();
        layout.main.width = 0.0;
        assert!(matches!(
            validate_layout(&layout),
            Err(AppError::Validation { .. })
        ));
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
}
