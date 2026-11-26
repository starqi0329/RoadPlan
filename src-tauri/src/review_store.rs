use rusqlite::{Connection, OptionalExtension, params};

use crate::db::db_error;
use crate::domain::{AuditAction, AuditEntity, Review, ReviewStats, ReviewTarget, Segment};
use crate::error::AppError;
use crate::plan_store;

pub fn get_segment_review(
    conn: &Connection,
    date: &str,
    segment: Segment,
) -> Result<Option<Review>, AppError> {
    conn.query_row(
        r#"
        SELECT id, target_type, date, segment, goal_id, note, stats_json, created_at, updated_at
        FROM reviews
        WHERE target_type = 'segment' AND date = ?1 AND segment = ?2
        "#,
        params![date, segment_to_str(segment)],
        map_review,
    )
    .optional()
    .map_err(db_error)
}

pub fn list_goal_reviews(conn: &Connection, goal_id: &str) -> Result<Vec<Review>, AppError> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, target_type, date, segment, goal_id, note, stats_json, created_at, updated_at
            FROM reviews
            WHERE target_type = 'goal' AND goal_id = ?1
            ORDER BY created_at DESC, id DESC
            "#,
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([goal_id], map_review)
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(rows)
}

pub fn get_review(conn: &Connection, id: &str) -> Result<Review, AppError> {
    conn.query_row(
        r#"
        SELECT id, target_type, date, segment, goal_id, note, stats_json, created_at, updated_at
        FROM reviews
        WHERE id = ?1
        "#,
        [id],
        map_review,
    )
    .optional()
    .map_err(db_error)?
    .ok_or_else(|| AppError::NotFound {
        entity: "review".into(),
        id: id.to_owned(),
    })
}

pub fn insert_review(conn: &Connection, review: &Review) -> Result<(), AppError> {
    let (target_type, date, segment, goal_id) = target_columns(&review.target);
    conn.execute(
        r#"
        INSERT INTO reviews (
            id, target_type, date, segment, goal_id, note, stats_json, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        "#,
        params![
            review.id,
            target_type,
            date,
            segment,
            goal_id,
            review.note,
            stats_to_json(&review.stats)?,
            review.created_at,
            review.updated_at,
        ],
    )
    .map_err(db_error)?;
    Ok(())
}

pub fn update_review_row(conn: &Connection, review: &Review) -> Result<(), AppError> {
    let (target_type, date, segment, goal_id) = target_columns(&review.target);
    let changed = conn
        .execute(
            r#"
            UPDATE reviews SET
                target_type = ?2,
                date = ?3,
                segment = ?4,
                goal_id = ?5,
                note = ?6,
                stats_json = ?7,
                updated_at = ?8
            WHERE id = ?1
            "#,
            params![
                review.id,
                target_type,
                date,
                segment,
                goal_id,
                review.note,
                stats_to_json(&review.stats)?,
                review.updated_at,
            ],
        )
        .map_err(db_error)?;
    if changed == 0 {
        return Err(AppError::NotFound {
            entity: "review".into(),
            id: review.id.clone(),
        });
    }
    Ok(())
}

pub fn insert_audit(
    conn: &Connection,
    at: &str,
    action: AuditAction,
    entity_id: &str,
    entity_title: &str,
    summary: String,
) -> Result<(), AppError> {
    plan_store::insert_audit(
        conn,
        &crate::domain::AuditEvent {
            id: uuid::Uuid::now_v7().to_string(),
            at: at.to_owned(),
            action,
            entity: AuditEntity::Review,
            entity_id: entity_id.to_owned(),
            entity_title: entity_title.to_owned(),
            summary,
        },
    )
}

fn map_review(row: &rusqlite::Row<'_>) -> Result<Review, rusqlite::Error> {
    let target_type: String = row.get(1)?;
    let date: Option<String> = row.get(2)?;
    let segment_raw: Option<String> = row.get(3)?;
    let goal_id: Option<String> = row.get(4)?;
    let stats_json: String = row.get(6)?;
    let target = match target_type.as_str() {
        "segment" => {
            let date = date.ok_or_else(|| {
                rusqlite::Error::FromSqlConversionFailure(
                    2,
                    rusqlite::types::Type::Text,
                    Box::new(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        "时段复盘缺少日期",
                    )),
                )
            })?;
            let segment =
                str_to_segment(segment_raw.as_deref().unwrap_or("")).map_err(|message| {
                    rusqlite::Error::FromSqlConversionFailure(
                        3,
                        rusqlite::types::Type::Text,
                        Box::new(std::io::Error::new(
                            std::io::ErrorKind::InvalidData,
                            message,
                        )),
                    )
                })?;
            ReviewTarget::Segment { date, segment }
        }
        "goal" => {
            let goal_id = goal_id.ok_or_else(|| {
                rusqlite::Error::FromSqlConversionFailure(
                    4,
                    rusqlite::types::Type::Text,
                    Box::new(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        "目标复盘缺少 goal_id",
                    )),
                )
            })?;
            ReviewTarget::Goal { goal_id }
        }
        other => {
            return Err(rusqlite::Error::FromSqlConversionFailure(
                1,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("未知复盘类型: {other}"),
                )),
            ));
        }
    };
    let stats = serde_json::from_str(&stats_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            6,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("解析复盘统计失败: {error}"),
            )),
        )
    })?;
    Ok(Review {
        id: row.get(0)?,
        target,
        note: row.get(5)?,
        stats,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn target_columns(
    target: &ReviewTarget,
) -> (
    &'static str,
    Option<&str>,
    Option<&'static str>,
    Option<&str>,
) {
    match target {
        ReviewTarget::Segment { date, segment } => (
            "segment",
            Some(date.as_str()),
            Some(segment_to_str(*segment)),
            None,
        ),
        ReviewTarget::Goal { goal_id } => ("goal", None, None, Some(goal_id.as_str())),
    }
}

fn stats_to_json(stats: &ReviewStats) -> Result<String, AppError> {
    serde_json::to_string(stats).map_err(|error| AppError::Internal {
        message: format!("序列化复盘统计失败: {error}"),
    })
}

fn segment_to_str(segment: Segment) -> &'static str {
    match segment {
        Segment::Morning => "morning",
        Segment::Afternoon => "afternoon",
        Segment::Evening => "evening",
    }
}

fn str_to_segment(raw: &str) -> Result<Segment, String> {
    match raw {
        "morning" => Ok(Segment::Morning),
        "afternoon" => Ok(Segment::Afternoon),
        "evening" => Ok(Segment::Evening),
        other => Err(format!("未知时段: {other}")),
    }
}
