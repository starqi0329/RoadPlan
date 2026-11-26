use rusqlite::{Connection, OptionalExtension, params};

use crate::db::db_error;
use crate::domain::{
    AuditAction, AuditEntity, AuditEvent, Goal, GoalLevel, GoalMeasure, GoalState, Milestone, Plan,
    PlanOutcome,
};
use crate::error::AppError;
use crate::plan_store;

pub fn list_goals(
    conn: &Connection,
    level: Option<GoalLevel>,
    period: Option<&str>,
    include_deleted: bool,
) -> Result<Vec<Goal>, AppError> {
    let mut sql = String::from(
        r#"
        SELECT id, level, parent_id, period, title, acceptance, measure_json, milestones_json,
               state, deleted_at, created_at, updated_at
        FROM goals
        WHERE 1 = 1
        "#,
    );
    if !include_deleted {
        sql.push_str(" AND deleted_at IS NULL");
    } else {
        sql.push_str(" AND deleted_at IS NOT NULL");
    }
    if level.is_some() {
        sql.push_str(" AND level = ?1");
    }
    if period.is_some() {
        if level.is_some() {
            sql.push_str(" AND period = ?2");
        } else {
            sql.push_str(" AND period = ?1");
        }
    }
    sql.push_str(" ORDER BY period ASC, created_at ASC");

    let mut stmt = conn.prepare(&sql).map_err(db_error)?;
    let rows = match (level, period) {
        (Some(level), Some(period)) => stmt
            .query_map(params![level_to_str(level), period], map_goal)
            .map_err(db_error)?,
        (Some(level), None) => stmt
            .query_map(params![level_to_str(level)], map_goal)
            .map_err(db_error)?,
        (None, Some(period)) => stmt
            .query_map(params![period], map_goal)
            .map_err(db_error)?,
        (None, None) => stmt.query_map([], map_goal).map_err(db_error)?,
    };
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub fn get_goal(conn: &Connection, id: &str) -> Result<Goal, AppError> {
    conn.query_row(
        r#"
        SELECT id, level, parent_id, period, title, acceptance, measure_json, milestones_json,
               state, deleted_at, created_at, updated_at
        FROM goals
        WHERE id = ?1
        "#,
        [id],
        map_goal,
    )
    .optional()
    .map_err(db_error)?
    .ok_or_else(|| AppError::NotFound {
        entity: "goal".into(),
        id: id.to_owned(),
    })
}

pub fn insert_goal(conn: &Connection, goal: &Goal) -> Result<(), AppError> {
    conn.execute(
        r#"
        INSERT INTO goals (
            id, level, parent_id, period, title, acceptance, measure_json, milestones_json,
            state, deleted_at, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        "#,
        params![
            goal.id,
            level_to_str(goal.level),
            goal.parent_id,
            goal.period,
            goal.title,
            goal.acceptance,
            measure_to_json(&goal.measure)?,
            milestones_to_json(&goal.milestones)?,
            state_to_str(goal.state),
            goal.deleted_at,
            goal.created_at,
            goal.updated_at,
        ],
    )
    .map_err(db_error)?;
    Ok(())
}

pub fn update_goal_row(conn: &Connection, goal: &Goal) -> Result<(), AppError> {
    let changed = conn
        .execute(
            r#"
            UPDATE goals SET
                level = ?2,
                parent_id = ?3,
                period = ?4,
                title = ?5,
                acceptance = ?6,
                measure_json = ?7,
                milestones_json = ?8,
                state = ?9,
                deleted_at = ?10,
                updated_at = ?11
            WHERE id = ?1
            "#,
            params![
                goal.id,
                level_to_str(goal.level),
                goal.parent_id,
                goal.period,
                goal.title,
                goal.acceptance,
                measure_to_json(&goal.measure)?,
                milestones_to_json(&goal.milestones)?,
                state_to_str(goal.state),
                goal.deleted_at,
                goal.updated_at,
            ],
        )
        .map_err(db_error)?;
    if changed == 0 {
        return Err(AppError::NotFound {
            entity: "goal".into(),
            id: goal.id.clone(),
        });
    }
    Ok(())
}

pub fn list_children(
    conn: &Connection,
    parent_id: &str,
    only_alive: bool,
) -> Result<Vec<Goal>, AppError> {
    let sql = if only_alive {
        r#"
        SELECT id, level, parent_id, period, title, acceptance, measure_json, milestones_json,
               state, deleted_at, created_at, updated_at
        FROM goals
        WHERE parent_id = ?1 AND deleted_at IS NULL
        ORDER BY period ASC, created_at ASC
        "#
    } else {
        r#"
        SELECT id, level, parent_id, period, title, acceptance, measure_json, milestones_json,
               state, deleted_at, created_at, updated_at
        FROM goals
        WHERE parent_id = ?1
        ORDER BY period ASC, created_at ASC
        "#
    };
    let mut stmt = conn.prepare(sql).map_err(db_error)?;
    let rows = stmt
        .query_map([parent_id], map_goal)
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(rows)
}

pub fn list_descendants_alive(conn: &Connection, root_id: &str) -> Result<Vec<Goal>, AppError> {
    let mut out = Vec::new();
    let mut stack = list_children(conn, root_id, true)?;
    while let Some(child) = stack.pop() {
        let nested = list_children(conn, &child.id, true)?;
        stack.extend(nested);
        out.push(child);
    }
    Ok(out)
}

pub fn list_subtree_including_deleted(
    conn: &Connection,
    root_id: &str,
) -> Result<Vec<Goal>, AppError> {
    let root = get_goal(conn, root_id)?;
    let mut out = vec![root];
    let mut index = 0;
    while index < out.len() {
        let id = out[index].id.clone();
        let children = list_children(conn, &id, false)?;
        out.extend(children);
        index += 1;
    }
    Ok(out)
}

pub fn child_count_alive(conn: &Connection, parent_id: &str) -> Result<u32, AppError> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM goals WHERE parent_id = ?1 AND deleted_at IS NULL",
            [parent_id],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    u32::try_from(count).map_err(|_| AppError::Internal {
        message: "子目标数量溢出".into(),
    })
}

pub fn list_plans_for_goal_ids(
    conn: &Connection,
    goal_ids: &[String],
) -> Result<Vec<Plan>, AppError> {
    if goal_ids.is_empty() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for id in goal_ids {
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, date, start, end, title, acceptance, kind, week_goal_id, note,
                       outcome_json, rescheduled_from, created_at, updated_at
                FROM plans
                WHERE week_goal_id = ?1
                "#,
            )
            .map_err(db_error)?;
        let rows = stmt
            .query_map([id], |row| {
                // reuse plan_store mapping via get would be N+1; inline via get_plan on ids later
                let id: String = row.get(0)?;
                Ok(id)
            })
            .map_err(db_error)?;
        for row in rows {
            let plan_id = row.map_err(db_error)?;
            out.push(plan_store::get_plan(conn, &plan_id)?);
        }
    }
    Ok(out)
}

pub fn delete_plans_by_ids(conn: &Connection, ids: &[String]) -> Result<(), AppError> {
    for id in ids {
        plan_store::delete_plan_row(conn, id)?;
    }
    Ok(())
}

pub fn insert_audit(conn: &Connection, event: &AuditEvent) -> Result<(), AppError> {
    plan_store::insert_audit(conn, event)
}

pub fn audit_event(
    at: &str,
    action: AuditAction,
    entity: AuditEntity,
    entity_id: &str,
    entity_title: &str,
    summary: String,
) -> AuditEvent {
    AuditEvent {
        id: uuid::Uuid::now_v7().to_string(),
        at: at.to_owned(),
        action,
        entity,
        entity_id: entity_id.to_owned(),
        entity_title: entity_title.to_owned(),
        summary,
    }
}

fn map_goal(row: &rusqlite::Row<'_>) -> Result<Goal, rusqlite::Error> {
    let level = str_to_level(&row.get::<_, String>(1)?).map_err(sql_conv(1))?;
    let measure = parse_measure(&row.get::<_, String>(6)?).map_err(sql_conv(6))?;
    let milestones = parse_milestones(&row.get::<_, String>(7)?).map_err(sql_conv(7))?;
    let state = str_to_state(&row.get::<_, String>(8)?).map_err(sql_conv(8))?;
    Ok(Goal {
        id: row.get(0)?,
        level,
        parent_id: row.get(2)?,
        period: row.get(3)?,
        title: row.get(4)?,
        acceptance: row.get(5)?,
        measure,
        milestones,
        state,
        deleted_at: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn sql_conv(index: usize) -> impl Fn(String) -> rusqlite::Error {
    move |message| {
        rusqlite::Error::FromSqlConversionFailure(
            index,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                message,
            )),
        )
    }
}

fn parse_measure(raw: &str) -> Result<GoalMeasure, String> {
    serde_json::from_str(raw).map_err(|error| format!("解析目标度量失败: {error}"))
}

fn measure_to_json(measure: &GoalMeasure) -> Result<String, AppError> {
    serde_json::to_string(measure).map_err(|error| AppError::Internal {
        message: format!("序列化目标度量失败: {error}"),
    })
}

fn parse_milestones(raw: &str) -> Result<Vec<Milestone>, String> {
    serde_json::from_str(raw).map_err(|error| format!("解析里程碑失败: {error}"))
}

fn milestones_to_json(milestones: &[Milestone]) -> Result<String, AppError> {
    serde_json::to_string(milestones).map_err(|error| AppError::Internal {
        message: format!("序列化里程碑失败: {error}"),
    })
}

pub fn level_to_str(level: GoalLevel) -> &'static str {
    match level {
        GoalLevel::Year => "year",
        GoalLevel::Month => "month",
        GoalLevel::Week => "week",
    }
}

fn str_to_level(raw: &str) -> Result<GoalLevel, String> {
    match raw {
        "year" => Ok(GoalLevel::Year),
        "month" => Ok(GoalLevel::Month),
        "week" => Ok(GoalLevel::Week),
        other => Err(format!("未知目标层级: {other}")),
    }
}

fn state_to_str(state: GoalState) -> &'static str {
    match state {
        GoalState::Active => "active",
        GoalState::Achieved => "achieved",
        GoalState::Dropped => "dropped",
    }
}

fn str_to_state(raw: &str) -> Result<GoalState, String> {
    match raw {
        "active" => Ok(GoalState::Active),
        "achieved" => Ok(GoalState::Achieved),
        "dropped" => Ok(GoalState::Dropped),
        other => Err(format!("未知目标状态: {other}")),
    }
}

#[allow(dead_code)]
pub fn outcome_is_done(outcome: &Option<PlanOutcome>) -> bool {
    matches!(outcome, Some(PlanOutcome::Done { .. }))
}
