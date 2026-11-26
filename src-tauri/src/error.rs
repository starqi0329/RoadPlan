use serde::{Deserialize, Serialize};
use specta::Type;

use crate::domain::HierarchyLevel;

/// 前后端共用的错误。序列化后的 `code` 与契约文档一致。
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum AppError {
    NotFound {
        entity: String,
        id: String,
    },
    Validation {
        field: String,
        message: String,
    },
    TooEarly {
        #[serde(rename = "startsAt")]
        starts_at: String,
    },
    Locked {
        reason: LockReason,
    },
    ParentRequired {
        level: HierarchyLevel,
    },
    InvalidParent {
        expected: HierarchyLevel,
    },
    Internal {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum LockReason {
    Ended,
    Finished,
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}

impl std::error::Error for AppError {}
