use rusqlite::{Connection, OptionalExtension, params};

use crate::db::db_error;
use crate::domain::{
    AuditAction, AuditEntity, AuditEvent, AuditPage, GoalLevel, OverlapRef, Plan, PlanKind,
    PlanOutcome,
};
use crate::error::AppError;

pub fn list_by_date(conn: &Connection, date: &str) -> Result<Vec<Plan>, AppError> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, date, start, end, title, acceptance, kind, week_goal_id, note,
                   outcome_json, rescheduled_from, created_at, updated_at
            FROM plans
            WHERE date = ?1
            ORDER BY start ASC, created_at ASC
            "#,
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([date], map_plan)
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(rows)
}

pub fn get_plan(conn: &Connection, id: &str) -> Result<Plan, AppError> {
    conn.query_row(
        r#"
        SELECT id, date, start, end, title, acceptance, kind, week_goal_id, note,
               outcome_json, rescheduled_from, created_at, updated_at
        FROM plans
        WHERE id = ?1
        "#,
        [id],
        map_plan,
    )
    .optional()
    .map_err(db_error)?
    .ok_or_else(|| AppError::NotFound {
        entity: "plan".into(),
        id: id.to_owned(),
    })
}

pub fn insert_plan(conn: &Connection, plan: &Plan) -> Result<(), AppError> {
    conn.execute(
        r#"
        INSERT INTO plans (
            id, date, start, end, title, acceptance, kind, week_goal_id, note,
            outcome_json, rescheduled_from, created_at, updated_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
        )
        "#,
        params![
            plan.id,
            plan.date,
            plan.start as i64,
            plan.end as i64,
            plan.title,
            plan.acceptance,
            kind_to_str(plan.kind),
            plan.week_goal_id,
            plan.note,
            outcome_to_json(&plan.outcome)?,
            plan.rescheduled_from,
            plan.created_at,
            plan.updated_at,
        ],
    )
    .map_err(db_error)?;
    Ok(())
}

pub fn update_plan_row(conn: &Connection, plan: &Plan) -> Result<(), AppError> {
    let changed = conn
        .execute(
            r#"
            UPDATE plans SET
                date = ?2,
                start = ?3,
                end = ?4,
                title = ?5,
                acceptance = ?6,
                kind = ?7,
                week_goal_id = ?8,
                note = ?9,
                outcome_json = ?10,
                rescheduled_from = ?11,
                updated_at = ?12
            WHERE id = ?1
            "#,
            params![
                plan.id,
                plan.date,
                plan.start as i64,
                plan.end as i64,
                plan.title,
                plan.acceptance,
                kind_to_str(plan.kind),
                plan.week_goal_id,
                plan.note,
                outcome_to_json(&plan.outcome)?,
                plan.rescheduled_from,
                plan.updated_at,
            ],
        )
        .map_err(db_error)?;
    if changed == 0 {
        return Err(AppError::NotFound {
            entity: "plan".into(),
            id: plan.id.clone(),
        });
    }
    Ok(())
}

pub fn delete_plan_row(conn: &Connection, id: &str) -> Result<(), AppError> {
    let changed = conn
        .execute("DELETE FROM plans WHERE id = ?1", [id])
        .map_err(db_error)?;
    if changed == 0 {
        return Err(AppError::NotFound {
            entity: "plan".into(),
            id: id.to_owned(),
        });
    }
    Ok(())
}

pub fn list_overlap_candidates(
    conn: &Connection,
    date: &str,
    exclude_id: Option<&str>,
) -> Result<Vec<OverlapRef>, AppError> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, title, start, end, outcome_json
            FROM plans
            WHERE date = ?1
            "#,
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([date], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(db_error)?;

    let mut out = Vec::new();
    for row in rows {
        let (id, title, start, end, outcome_json) = row.map_err(db_error)?;
        if exclude_id.is_some_and(|excluded| excluded == id) {
            continue;
        }
        let outcome = parse_outcome(outcome_json.as_deref())?;
        if matches!(outcome, Some(PlanOutcome::Skipped { .. })) {
            continue;
        }
        out.push(OverlapRef {
            id,
            title,
            start: start as u16,
            end: end as u16,
        });
    }
    Ok(out)
}

pub fn week_goal_is_valid(conn: &Connection, id: &str) -> Result<bool, AppError> {
    let found: Option<String> = conn
        .query_row(
            r#"
            SELECT id FROM goals
            WHERE id = ?1 AND deleted_at IS NULL AND level = ?2
            "#,
            params![id, level_to_str(GoalLevel::Week)],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    Ok(found.is_some())
}

pub fn insert_audit(conn: &Connection, event: &AuditEvent) -> Result<(), AppError> {
    conn.execute(
        r#"
        INSERT INTO audit_events (id, at, action, entity, entity_id, entity_title, summary)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
        params![
            event.id,
            event.at,
            action_to_str(event.action),
            entity_to_str(event.entity),
            event.entity_id,
            event.entity_title,
            event.summary,
        ],
    )
    .map_err(db_error)?;
    Ok(())
}

/// R27：按 at 倒序，同时间按 id 倒序；`before_id` 取该条之后更早的记录。
pub fn list_audit(
    conn: &Connection,
    limit: u32,
    before_id: Option<&str>,
) -> Result<AuditPage, AppError> {
    let total = conn
        .query_row("SELECT COUNT(*) FROM audit_events", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(db_error)? as u32;

    if limit == 0 {
        return Ok(AuditPage {
            items: Vec::new(),
            total,
        });
    }

    let items = match before_id {
        None => {
            let mut stmt = conn
                .prepare(
                    r#"
                    SELECT id, at, action, entity, entity_id, entity_title, summary
                    FROM audit_events
                    ORDER BY at DESC, id DESC
                    LIMIT ?1
                    "#,
                )
                .map_err(db_error)?;
            stmt.query_map([limit], map_audit)
                .map_err(db_error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(db_error)?
        }
        Some(cursor_id) => {
            let cursor = conn
                .query_row(
                    "SELECT at, id FROM audit_events WHERE id = ?1",
                    [cursor_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .optional()
                .map_err(db_error)?
                .ok_or_else(|| AppError::NotFound {
                    entity: "audit".into(),
                    id: cursor_id.to_owned(),
                })?;
            let mut stmt = conn
                .prepare(
                    r#"
                    SELECT id, at, action, entity, entity_id, entity_title, summary
                    FROM audit_events
                    WHERE at < ?1 OR (at = ?1 AND id < ?2)
                    ORDER BY at DESC, id DESC
                    LIMIT ?3
                    "#,
                )
                .map_err(db_error)?;
            stmt.query_map(params![cursor.0, cursor.1, limit], map_audit)
                .map_err(db_error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(db_error)?
        }
    };

    Ok(AuditPage { items, total })
}

fn map_audit(row: &rusqlite::Row<'_>) -> Result<AuditEvent, rusqlite::Error> {
    let action_raw: String = row.get(2)?;
    let entity_raw: String = row.get(3)?;
    let action = str_to_action(&action_raw).map_err(|message| {
        rusqlite::Error::FromSqlConversionFailure(
            2,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                message,
            )),
        )
    })?;
    let entity = str_to_entity(&entity_raw).map_err(|message| {
        rusqlite::Error::FromSqlConversionFailure(
            3,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                message,
            )),
        )
    })?;
    Ok(AuditEvent {
        id: row.get(0)?,
        at: row.get(1)?,
        action,
        entity,
        entity_id: row.get(4)?,
        entity_title: row.get(5)?,
        summary: row.get(6)?,
    })
}

fn map_plan(row: &rusqlite::Row<'_>) -> Result<Plan, rusqlite::Error> {
    let kind_raw: String = row.get(6)?;
    let outcome_json: Option<String> = row.get(9)?;
    let kind = str_to_kind(&kind_raw).map_err(|message| {
        rusqlite::Error::FromSqlConversionFailure(
            6,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                message,
            )),
        )
    })?;
    let outcome = parse_outcome(outcome_json.as_deref()).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            9,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                error.to_string(),
            )),
        )
    })?;
    Ok(Plan {
        id: row.get(0)?,
        date: row.get(1)?,
        start: row.get::<_, i64>(2)? as u16,
        end: row.get::<_, i64>(3)? as u16,
        title: row.get(4)?,
        acceptance: row.get(5)?,
        kind,
        week_goal_id: row.get(7)?,
        note: row.get(8)?,
        outcome,
        rescheduled_from: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn parse_outcome(raw: Option<&str>) -> Result<Option<PlanOutcome>, AppError> {
    match raw {
        None | Some("") => Ok(None),
        Some(text) => serde_json::from_str(text).map_err(|error| AppError::Internal {
            message: format!("解析计划结果失败: {error}"),
        }),
    }
}

fn outcome_to_json(outcome: &Option<PlanOutcome>) -> Result<Option<String>, AppError> {
    match outcome {
        None => Ok(None),
        Some(value) => serde_json::to_string(value)
            .map(Some)
            .map_err(|error| AppError::Internal {
                message: format!("序列化计划结果失败: {error}"),
            }),
    }
}

fn kind_to_str(kind: PlanKind) -> &'static str {
    match kind {
        PlanKind::Core => "core",
        PlanKind::Work => "work",
        PlanKind::Routine => "routine",
        PlanKind::Review => "review",
    }
}

fn str_to_kind(raw: &str) -> Result<PlanKind, String> {
    match raw {
        "core" => Ok(PlanKind::Core),
        "work" => Ok(PlanKind::Work),
        "routine" => Ok(PlanKind::Routine),
        "review" => Ok(PlanKind::Review),
        other => Err(format!("未知计划类型: {other}")),
    }
}

fn level_to_str(level: GoalLevel) -> &'static str {
    match level {
        GoalLevel::Year => "year",
        GoalLevel::Month => "month",
        GoalLevel::Week => "week",
    }
}

fn action_to_str(action: AuditAction) -> &'static str {
    match action {
        AuditAction::Create => "create",
        AuditAction::Update => "update",
        AuditAction::Complete => "complete",
        AuditAction::Reopen => "reopen",
        AuditAction::Skip => "skip",
        AuditAction::Reschedule => "reschedule",
        AuditAction::Copy => "copy",
        AuditAction::Delete => "delete",
        AuditAction::Restore => "restore",
        AuditAction::Note => "note",
        AuditAction::Review => "review",
        AuditAction::State => "state",
    }
}

fn entity_to_str(entity: AuditEntity) -> &'static str {
    match entity {
        AuditEntity::Plan => "plan",
        AuditEntity::Goal => "goal",
        AuditEntity::Milestone => "milestone",
        AuditEntity::Review => "review",
    }
}

fn str_to_action(raw: &str) -> Result<AuditAction, String> {
    match raw {
        "create" => Ok(AuditAction::Create),
        "update" => Ok(AuditAction::Update),
        "complete" => Ok(AuditAction::Complete),
        "reopen" => Ok(AuditAction::Reopen),
        "skip" => Ok(AuditAction::Skip),
        "reschedule" => Ok(AuditAction::Reschedule),
        "copy" => Ok(AuditAction::Copy),
        "delete" => Ok(AuditAction::Delete),
        "restore" => Ok(AuditAction::Restore),
        "note" => Ok(AuditAction::Note),
        "review" => Ok(AuditAction::Review),
        "state" => Ok(AuditAction::State),
        other => Err(format!("未知操作类型: {other}")),
    }
}

fn str_to_entity(raw: &str) -> Result<AuditEntity, String> {
    match raw {
        "plan" => Ok(AuditEntity::Plan),
        "goal" => Ok(AuditEntity::Goal),
        "milestone" => Ok(AuditEntity::Milestone),
        "review" => Ok(AuditEntity::Review),
        other => Err(format!("未知实体类型: {other}")),
    }
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;
    use crate::db::Db;

    fn seed_event(conn: &Connection, id: &str, at: &str, title: &str, summary: &str) -> AuditEvent {
        let event = AuditEvent {
            id: id.to_owned(),
            at: at.to_owned(),
            action: AuditAction::Create,
            entity: AuditEntity::Plan,
            entity_id: format!("plan-{id}"),
            entity_title: title.to_owned(),
            summary: summary.to_owned(),
        };
        insert_audit(conn, &event).expect("insert audit");
        event
    }

    #[test]
    fn list_audit_orders_by_at_then_id_desc_and_pages_with_before_id() {
        let db = Db::open_memory().expect("db");
        let conn = db.conn.lock().expect("lock");

        seed_event(&conn, "id-a", "2026-11-26T10:00:00+08:00", "早", "创建早");
        seed_event(
            &conn,
            "id-c",
            "2026-11-26T12:00:00+08:00",
            "同点后",
            "创建同点后",
        );
        seed_event(
            &conn,
            "id-b",
            "2026-11-26T12:00:00+08:00",
            "同点前",
            "创建同点前",
        );
        seed_event(
            &conn,
            "id-d",
            "2026-11-26T13:00:00+08:00",
            "最晚",
            "创建最晚",
        );

        let first = list_audit(&conn, 2, None).expect("page1");
        assert_eq!(first.total, 4);
        assert_eq!(
            first
                .items
                .iter()
                .map(|e| e.id.as_str())
                .collect::<Vec<_>>(),
            vec!["id-d", "id-c"]
        );

        let second = list_audit(&conn, 2, Some("id-c")).expect("page2");
        assert_eq!(second.total, 4);
        assert_eq!(
            second
                .items
                .iter()
                .map(|e| e.id.as_str())
                .collect::<Vec<_>>(),
            vec!["id-b", "id-a"]
        );

        let empty = list_audit(&conn, 2, Some("id-a")).expect("tail");
        assert!(empty.items.is_empty());
        assert_eq!(empty.total, 4);
    }

    #[test]
    fn list_audit_rejects_unknown_before_id() {
        let db = Db::open_memory().expect("db");
        let conn = db.conn.lock().expect("lock");
        let err = list_audit(&conn, 10, Some("missing")).expect_err("not found");
        assert!(matches!(
            err,
            AppError::NotFound {
                entity,
                id
            } if entity == "audit" && id == "missing"
        ));
    }
}
