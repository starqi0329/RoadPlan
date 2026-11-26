use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::error::AppError;

pub struct Db {
    pub conn: Mutex<Connection>,
    /// 库文件路径；内存库为 `:memory:`。开发期可用 `SHIXU_DB_PATH` 覆盖。
    #[allow(dead_code)]
    pub path: PathBuf,
}

impl Db {
    pub fn open(path: PathBuf) -> Result<Self, AppError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| AppError::Internal {
                message: format!("创建数据目录失败: {error}"),
            })?;
        }
        let conn = Connection::open(&path).map_err(|error| AppError::Internal {
            message: format!("打开数据库失败: {error}"),
        })?;
        migrate(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            path,
        })
    }

    #[cfg(test)]
    pub fn open_memory() -> Result<Self, AppError> {
        let conn = Connection::open_in_memory().map_err(|error| AppError::Internal {
            message: format!("打开内存数据库失败: {error}"),
        })?;
        migrate(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            path: PathBuf::from(":memory:"),
        })
    }
}

pub fn default_db_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Internal {
            message: format!("解析应用数据目录失败: {error}"),
        })?;
    Ok(dir.join("shixu.sqlite3"))
}

pub fn resolve_db_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    if let Ok(raw) = std::env::var("SHIXU_DB_PATH")
        && !raw.trim().is_empty()
    {
        return Ok(PathBuf::from(raw));
    }
    default_db_path(app)
}

fn migrate(conn: &Connection) -> Result<(), AppError> {
    let version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(db_error)?;
    if version < 1 {
        conn.execute_batch(
            r#"
            CREATE TABLE goals (
                id TEXT PRIMARY KEY NOT NULL,
                level TEXT NOT NULL,
                parent_id TEXT,
                period TEXT NOT NULL,
                title TEXT NOT NULL,
                acceptance TEXT NOT NULL,
                measure_json TEXT NOT NULL,
                state TEXT NOT NULL,
                deleted_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE plans (
                id TEXT PRIMARY KEY NOT NULL,
                date TEXT NOT NULL,
                start INTEGER NOT NULL,
                end INTEGER NOT NULL,
                title TEXT NOT NULL,
                acceptance TEXT NOT NULL,
                kind TEXT NOT NULL,
                week_goal_id TEXT,
                note TEXT,
                outcome_json TEXT,
                rescheduled_from TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX idx_plans_date_start_created
                ON plans(date, start, created_at);

            CREATE TABLE audit_events (
                id TEXT PRIMARY KEY NOT NULL,
                at TEXT NOT NULL,
                action TEXT NOT NULL,
                entity TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                entity_title TEXT NOT NULL,
                summary TEXT NOT NULL
            );

            CREATE INDEX idx_audit_at_id ON audit_events(at DESC, id DESC);

            PRAGMA user_version = 1;
            "#,
        )
        .map_err(db_error)?;
    }
    if version < 2 {
        conn.execute_batch(
            r#"
            ALTER TABLE goals ADD COLUMN milestones_json TEXT NOT NULL DEFAULT '[]';
            CREATE INDEX IF NOT EXISTS idx_goals_level_period ON goals(level, period);
            CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_id);
            CREATE INDEX IF NOT EXISTS idx_plans_week_goal ON plans(week_goal_id);
            PRAGMA user_version = 2;
            "#,
        )
        .map_err(db_error)?;
    }
    if version < 3 {
        conn.execute_batch(
            r#"
            CREATE TABLE reviews (
                id TEXT PRIMARY KEY NOT NULL,
                target_type TEXT NOT NULL,
                date TEXT,
                segment TEXT,
                goal_id TEXT,
                note TEXT NOT NULL,
                stats_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE UNIQUE INDEX idx_reviews_segment_unique
                ON reviews(date, segment)
                WHERE target_type = 'segment';

            CREATE INDEX idx_reviews_goal_created
                ON reviews(goal_id, created_at DESC, id DESC)
                WHERE target_type = 'goal';

            PRAGMA user_version = 3;
            "#,
        )
        .map_err(db_error)?;
    }
    Ok(())
}

pub fn db_error(error: rusqlite::Error) -> AppError {
    AppError::Internal {
        message: format!("数据库错误: {error}"),
    }
}

pub fn lock_conn(db: &Db) -> Result<std::sync::MutexGuard<'_, Connection>, AppError> {
    db.conn.lock().map_err(|_| AppError::Internal {
        message: "数据库锁已损坏".into(),
    })
}
