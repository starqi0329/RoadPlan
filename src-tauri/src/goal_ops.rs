use chrono::NaiveDate;
use rusqlite::Connection;
use uuid::Uuid;

use crate::domain::{
    AuditAction, AuditEntity, ChainTarget, CreateGoalInput, DeleteGoalImpact, Goal, GoalLevel,
    GoalMeasure, GoalProgress, GoalState, GoalView, HierarchyLevel, Milestone, MilestoneState,
    PlanOutcome, RuleError, UpdateGoalInput, accumulated_count, count_progress, deleted_with_goal,
    derive_status, milestone_progress, validate_goal_parent, validate_period_belongs,
    validate_period_format,
};
use crate::error::AppError;
use crate::goal_store;
use crate::plan_ops::Clock;
use crate::plan_store;

pub fn list_goals(
    conn: &Connection,
    level: Option<GoalLevel>,
    period: Option<&str>,
    clock: Clock<'_>,
) -> Result<Vec<GoalView>, AppError> {
    let goals = goal_store::list_goals(conn, level, period, false)?;
    goals
        .into_iter()
        .map(|goal| to_view(conn, goal, clock))
        .collect()
}

pub fn list_deleted_goals(conn: &Connection, clock: Clock<'_>) -> Result<Vec<GoalView>, AppError> {
    let goals = goal_store::list_goals(conn, None, None, true)?;
    goals
        .into_iter()
        .map(|goal| to_view(conn, goal, clock))
        .collect()
}

pub fn get_goal(conn: &Connection, id: &str, clock: Clock<'_>) -> Result<GoalView, AppError> {
    let goal = goal_store::get_goal(conn, id)?;
    to_view(conn, goal, clock)
}

pub fn get_goal_chain(
    conn: &Connection,
    target: ChainTarget,
    clock: Clock<'_>,
) -> Result<Vec<GoalView>, AppError> {
    let start_id = match target {
        ChainTarget::Goal { id } => id,
        ChainTarget::Plan { id } => {
            let plan = plan_store::get_plan(conn, &id)?;
            match plan.week_goal_id {
                Some(goal_id) => goal_id,
                None => return Ok(Vec::new()),
            }
        }
    };

    let mut chain = Vec::new();
    let mut current = goal_store::get_goal(conn, &start_id)?;
    loop {
        chain.push(current.clone());
        match current.parent_id.clone() {
            Some(parent_id) => current = goal_store::get_goal(conn, &parent_id)?,
            None => break,
        }
    }
    chain.reverse();
    chain
        .into_iter()
        .map(|goal| to_view(conn, goal, clock))
        .collect()
}

pub fn create_goal(
    conn: &mut Connection,
    input: CreateGoalInput,
    clock: Clock<'_>,
) -> Result<GoalView, AppError> {
    let title = require_title(input.title)?;
    validate_period_format(input.level, &input.period).map_err(rule_to_app)?;
    let parent_level = match (&input.level, &input.parent_id) {
        (GoalLevel::Year, None) => None,
        (GoalLevel::Year, Some(_)) => {
            return Err(AppError::InvalidParent {
                expected: HierarchyLevel::Year,
            });
        }
        (_, None) => {
            return Err(AppError::ParentRequired {
                level: hierarchy_of(input.level),
            });
        }
        (_, Some(parent_id)) => {
            let parent = goal_store::get_goal(conn, parent_id)?;
            if parent.deleted_at.is_some() {
                return Err(AppError::InvalidParent {
                    expected: expected_parent(input.level),
                });
            }
            validate_goal_parent(input.level, Some(parent.level))
                .map_err(|error| map_parent_error(error, input.level))?;
            validate_period_belongs(input.level, &input.period, &parent.period)
                .map_err(rule_to_app)?;
            Some(parent.level)
        }
    };
    let _ = parent_level;
    validate_goal_parent(input.level, parent_level)
        .map_err(|error| map_parent_error(error, input.level))?;

    let goal = Goal {
        id: new_id(),
        level: input.level,
        parent_id: input.parent_id,
        period: input.period,
        title: title.clone(),
        acceptance: input.acceptance,
        measure: input.measure,
        milestones: Vec::new(),
        state: GoalState::Active,
        deleted_at: None,
        created_at: clock.stamp.to_owned(),
        updated_at: clock.stamp.to_owned(),
    };

    let tx = conn.transaction().map_err(crate::db::db_error)?;
    goal_store::insert_goal(&tx, &goal)?;
    goal_store::insert_audit(
        &tx,
        &goal_store::audit_event(
            clock.stamp,
            AuditAction::Create,
            AuditEntity::Goal,
            &goal.id,
            &goal.title,
            format!("新建目标「{}」", goal.title),
        ),
    )?;
    tx.commit().map_err(crate::db::db_error)?;
    to_view(conn, goal, clock)
}

pub fn update_goal(
    conn: &mut Connection,
    id: &str,
    input: UpdateGoalInput,
    clock: Clock<'_>,
) -> Result<GoalView, AppError> {
    let mut goal = goal_store::get_goal(conn, id)?;
    ensure_editable(&goal)?;
    goal.title = require_title(input.title)?;
    goal.acceptance = input.acceptance;
    goal.measure = input.measure;
    goal.updated_at = clock.stamp.to_owned();

    let tx = conn.transaction().map_err(crate::db::db_error)?;
    goal_store::update_goal_row(&tx, &goal)?;
    goal_store::insert_audit(
        &tx,
        &goal_store::audit_event(
            clock.stamp,
            AuditAction::Update,
            AuditEntity::Goal,
            &goal.id,
            &goal.title,
            format!("更新目标「{}」", goal.title),
        ),
    )?;
    tx.commit().map_err(crate::db::db_error)?;
    to_view(conn, goal, clock)
}

pub fn set_goal_state(
    conn: &mut Connection,
    id: &str,
    state: GoalState,
    clock: Clock<'_>,
) -> Result<GoalView, AppError> {
    let mut goal = goal_store::get_goal(conn, id)?;
    ensure_editable(&goal)?;
    goal.state = state;
    goal.updated_at = clock.stamp.to_owned();

    let tx = conn.transaction().map_err(crate::db::db_error)?;
    goal_store::update_goal_row(&tx, &goal)?;
    goal_store::insert_audit(
        &tx,
        &goal_store::audit_event(
            clock.stamp,
            AuditAction::State,
            AuditEntity::Goal,
            &goal.id,
            &goal.title,
            format!("将目标「{}」设为{}", goal.title, state_label(state)),
        ),
    )?;
    tx.commit().map_err(crate::db::db_error)?;
    to_view(conn, goal, clock)
}

pub fn preview_delete_goal(
    conn: &Connection,
    id: &str,
    clock: Clock<'_>,
) -> Result<DeleteGoalImpact, AppError> {
    let root = goal_store::get_goal(conn, id)?;
    if root.deleted_at.is_some() {
        return Err(AppError::Validation {
            field: "deletedAt".into(),
            message: "已删除的目标不能再删除".into(),
        });
    }
    compute_delete_impact(conn, &root, clock)
}

pub fn delete_goal(
    conn: &mut Connection,
    id: &str,
    clock: Clock<'_>,
) -> Result<DeleteGoalImpact, AppError> {
    let root = goal_store::get_goal(conn, id)?;
    if root.deleted_at.is_some() {
        return Err(AppError::Validation {
            field: "deletedAt".into(),
            message: "已删除的目标不能再删除".into(),
        });
    }
    let impact = compute_delete_impact(conn, &root, clock)?;
    let mut archive = vec![root.clone()];
    archive.extend(goal_store::list_descendants_alive(conn, id)?);
    let archive_ids: Vec<String> = archive.iter().map(|goal| goal.id.clone()).collect();
    let plans = goal_store::list_plans_for_goal_ids(conn, &archive_ids)?;
    let mut to_delete = Vec::new();
    for plan in &plans {
        if should_delete_plan(plan, clock) {
            to_delete.push(plan.id.clone());
        }
    }

    let tx = conn.transaction().map_err(crate::db::db_error)?;
    for mut goal in archive {
        goal.deleted_at = Some(clock.stamp.to_owned());
        goal.updated_at = clock.stamp.to_owned();
        goal_store::update_goal_row(&tx, &goal)?;
    }
    goal_store::delete_plans_by_ids(&tx, &to_delete)?;
    goal_store::insert_audit(
        &tx,
        &goal_store::audit_event(
            clock.stamp,
            AuditAction::Delete,
            AuditEntity::Goal,
            &root.id,
            &root.title,
            format!(
                "删除目标「{}」：归档 {} 个目标，删除 {} 条计划，保留 {} 条",
                root.title, impact.goals_archived, impact.plans_deleted, impact.plans_kept
            ),
        ),
    )?;
    tx.commit().map_err(crate::db::db_error)?;
    Ok(impact)
}

pub fn restore_goal(
    conn: &mut Connection,
    id: &str,
    clock: Clock<'_>,
) -> Result<GoalView, AppError> {
    let goal = goal_store::get_goal(conn, id)?;
    let deleted_at = goal
        .deleted_at
        .clone()
        .ok_or_else(|| AppError::Validation {
            field: "deletedAt".into(),
            message: "只能恢复已删除的目标".into(),
        })?;
    if let Some(parent_id) = &goal.parent_id {
        let parent = goal_store::get_goal(conn, parent_id)?;
        if parent.deleted_at.is_some() {
            return Err(AppError::Validation {
                field: "parentId".into(),
                message: "上级目标仍处于删除状态，不能恢复".into(),
            });
        }
    }

    let subtree = goal_store::list_subtree_including_deleted(conn, id)?;
    let mut restore_ids = Vec::new();
    for item in &subtree {
        if item.id == goal.id
            || item
                .deleted_at
                .as_ref()
                .is_some_and(|stamp| stamp == &deleted_at)
        {
            restore_ids.push(item.id.clone());
        }
    }

    let tx = conn.transaction().map_err(crate::db::db_error)?;
    for restore_id in &restore_ids {
        let mut item = goal_store::get_goal(&tx, restore_id)?;
        item.deleted_at = None;
        item.updated_at = clock.stamp.to_owned();
        goal_store::update_goal_row(&tx, &item)?;
    }
    goal_store::insert_audit(
        &tx,
        &goal_store::audit_event(
            clock.stamp,
            AuditAction::Restore,
            AuditEntity::Goal,
            &goal.id,
            &goal.title,
            format!("恢复目标「{}」及同批下级", goal.title),
        ),
    )?;
    tx.commit().map_err(crate::db::db_error)?;
    get_goal(conn, id, clock)
}

pub fn add_milestone(
    conn: &mut Connection,
    goal_id: &str,
    title: String,
    clock: Clock<'_>,
) -> Result<GoalView, AppError> {
    let mut goal = goal_store::get_goal(conn, goal_id)?;
    ensure_editable(&goal)?;
    let title = require_title(title)?;
    let order = goal
        .milestones
        .iter()
        .map(|item| item.order)
        .max()
        .map(|value| value.saturating_add(1))
        .unwrap_or(0);
    goal.milestones.push(Milestone {
        id: new_id(),
        title: title.clone(),
        state: MilestoneState::Todo,
        order,
    });
    goal.updated_at = clock.stamp.to_owned();
    write_milestone_change(
        conn,
        &goal,
        clock,
        format!("为目标「{}」添加里程碑「{title}」", goal.title),
    )?;
    to_view(conn, goal, clock)
}

pub fn update_milestone(
    conn: &mut Connection,
    goal_id: &str,
    milestone_id: &str,
    title: String,
    clock: Clock<'_>,
) -> Result<GoalView, AppError> {
    let mut goal = goal_store::get_goal(conn, goal_id)?;
    ensure_editable(&goal)?;
    let title = require_title(title)?;
    let milestone = goal
        .milestones
        .iter_mut()
        .find(|item| item.id == milestone_id)
        .ok_or_else(|| AppError::NotFound {
            entity: "milestone".into(),
            id: milestone_id.to_owned(),
        })?;
    milestone.title = title.clone();
    goal.updated_at = clock.stamp.to_owned();
    write_milestone_change(
        conn,
        &goal,
        clock,
        format!("更新目标「{}」的里程碑「{title}」", goal.title),
    )?;
    to_view(conn, goal, clock)
}

pub fn set_milestone_state(
    conn: &mut Connection,
    goal_id: &str,
    milestone_id: &str,
    state: MilestoneState,
    clock: Clock<'_>,
) -> Result<GoalView, AppError> {
    let mut goal = goal_store::get_goal(conn, goal_id)?;
    ensure_editable(&goal)?;
    let milestone = goal
        .milestones
        .iter_mut()
        .find(|item| item.id == milestone_id)
        .ok_or_else(|| AppError::NotFound {
            entity: "milestone".into(),
            id: milestone_id.to_owned(),
        })?;
    milestone.state = state;
    let milestone_title = milestone.title.clone();
    goal.updated_at = clock.stamp.to_owned();
    write_milestone_change(
        conn,
        &goal,
        clock,
        format!(
            "将目标「{}」的里程碑「{milestone_title}」设为{}",
            goal.title,
            milestone_state_label(state)
        ),
    )?;
    to_view(conn, goal, clock)
}

pub fn remove_milestone(
    conn: &mut Connection,
    goal_id: &str,
    milestone_id: &str,
    clock: Clock<'_>,
) -> Result<GoalView, AppError> {
    let mut goal = goal_store::get_goal(conn, goal_id)?;
    ensure_editable(&goal)?;
    let before = goal.milestones.len();
    goal.milestones.retain(|item| item.id != milestone_id);
    if goal.milestones.len() == before {
        return Err(AppError::NotFound {
            entity: "milestone".into(),
            id: milestone_id.to_owned(),
        });
    }
    goal.updated_at = clock.stamp.to_owned();
    write_milestone_change(
        conn,
        &goal,
        clock,
        format!("删除目标「{}」的一个里程碑", goal.title),
    )?;
    to_view(conn, goal, clock)
}

fn write_milestone_change(
    conn: &mut Connection,
    goal: &Goal,
    clock: Clock<'_>,
    summary: String,
) -> Result<(), AppError> {
    let tx = conn.transaction().map_err(crate::db::db_error)?;
    goal_store::update_goal_row(&tx, goal)?;
    goal_store::insert_audit(
        &tx,
        &goal_store::audit_event(
            clock.stamp,
            AuditAction::Update,
            AuditEntity::Milestone,
            &goal.id,
            &goal.title,
            summary,
        ),
    )?;
    tx.commit().map_err(crate::db::db_error)?;
    Ok(())
}

fn compute_delete_impact(
    conn: &Connection,
    root: &Goal,
    clock: Clock<'_>,
) -> Result<DeleteGoalImpact, AppError> {
    let mut archive = vec![root.clone()];
    archive.extend(goal_store::list_descendants_alive(conn, &root.id)?);
    let archive_ids: Vec<String> = archive.iter().map(|goal| goal.id.clone()).collect();
    let plans = goal_store::list_plans_for_goal_ids(conn, &archive_ids)?;
    let mut plans_deleted = 0u32;
    let mut plans_kept = 0u32;
    for plan in &plans {
        if should_delete_plan(plan, clock) {
            plans_deleted = plans_deleted.saturating_add(1);
        } else {
            plans_kept = plans_kept.saturating_add(1);
        }
    }
    Ok(DeleteGoalImpact {
        goals_archived: u32::try_from(archive.len()).unwrap_or(u32::MAX),
        plans_deleted,
        plans_kept,
    })
}

fn should_delete_plan(plan: &crate::domain::Plan, clock: Clock<'_>) -> bool {
    if plan.outcome.is_some() {
        return false;
    }
    let Ok(plan_date) = NaiveDate::parse_from_str(&plan.date, "%Y-%m-%d") else {
        return false;
    };
    let status = derive_status(
        plan_date,
        plan.start,
        plan.end,
        plan.outcome.as_ref(),
        clock.date,
        clock.minute,
    );
    deleted_with_goal(status)
}

fn to_view(conn: &Connection, goal: Goal, clock: Clock<'_>) -> Result<GoalView, AppError> {
    let progress = progress_of(conn, &goal)?;
    let child_count = if goal.deleted_at.is_some() {
        0
    } else {
        goal_store::child_count_alive(conn, &goal.id)?
    };
    let _ = clock;
    Ok(GoalView {
        goal,
        progress,
        child_count,
    })
}

fn progress_of(conn: &Connection, goal: &Goal) -> Result<GoalProgress, AppError> {
    match &goal.measure {
        GoalMeasure::Milestones => Ok(milestone_progress(&goal.milestones)),
        GoalMeasure::Count { target, .. } => {
            let subtree = goal_store::list_subtree_including_deleted(conn, &goal.id)?;
            let ids: Vec<String> = subtree.iter().map(|item| item.id.clone()).collect();
            let plans = goal_store::list_plans_for_goal_ids(conn, &ids)?;
            let done_ids: Vec<Option<&str>> = plans
                .iter()
                .filter(|plan| matches!(plan.outcome, Some(PlanOutcome::Done { .. })))
                .map(|plan| plan.week_goal_id.as_deref())
                .collect();
            let id_refs: Vec<&str> = ids.iter().map(String::as_str).collect();
            Ok(count_progress(
                accumulated_count(&id_refs, &done_ids),
                *target,
            ))
        }
    }
}

fn ensure_editable(goal: &Goal) -> Result<(), AppError> {
    if goal.deleted_at.is_some() {
        return Err(AppError::Validation {
            field: "deletedAt".into(),
            message: "已删除的目标不能编辑".into(),
        });
    }
    Ok(())
}

fn require_title(title: String) -> Result<String, AppError> {
    let title = title.trim().to_owned();
    if title.is_empty() {
        return Err(AppError::Validation {
            field: "title".into(),
            message: "标题不能为空".into(),
        });
    }
    Ok(title)
}

fn new_id() -> String {
    Uuid::now_v7().to_string()
}

fn hierarchy_of(level: GoalLevel) -> HierarchyLevel {
    match level {
        GoalLevel::Year => HierarchyLevel::Year,
        GoalLevel::Month => HierarchyLevel::Month,
        GoalLevel::Week => HierarchyLevel::Week,
    }
}

fn expected_parent(level: GoalLevel) -> HierarchyLevel {
    match level {
        GoalLevel::Year => HierarchyLevel::Year,
        GoalLevel::Month => HierarchyLevel::Year,
        GoalLevel::Week => HierarchyLevel::Month,
    }
}

fn map_parent_error(error: RuleError, level: GoalLevel) -> AppError {
    match (error, level) {
        // 年目标不能有上级：不是「缺上级」，也不是「上级级别不对」
        (RuleError::InvalidParent, GoalLevel::Year) => AppError::Validation {
            field: "parentId".into(),
            message: "年目标不能有上级".into(),
        },
        // parent_required.level = 所缺的上级层级（与计划 R11 的 week 同口径）
        (RuleError::ParentRequired, _) => AppError::ParentRequired {
            level: expected_parent(level),
        },
        (RuleError::InvalidParent, _) => AppError::InvalidParent {
            expected: expected_parent(level),
        },
        (other, _) => rule_to_app(other),
    }
}

fn rule_to_app(error: RuleError) -> AppError {
    match error {
        RuleError::ParentRequired => AppError::ParentRequired {
            level: HierarchyLevel::Week,
        },
        RuleError::InvalidParent => AppError::InvalidParent {
            expected: HierarchyLevel::Week,
        },
        RuleError::TimeOrder => AppError::Validation {
            field: "end".into(),
            message: "结束时间必须晚于开始时间".into(),
        },
        RuleError::TimeOutOfRange => AppError::Validation {
            field: "start".into(),
            message: "时间须在 0–1440 分钟内".into(),
        },
        RuleError::PeriodFormat => AppError::Validation {
            field: "period".into(),
            message: "周期格式与目标层级不匹配".into(),
        },
        RuleError::PeriodMismatch => AppError::Validation {
            field: "period".into(),
            message: "周期必须属于上级目标的周期".into(),
        },
    }
}

fn state_label(state: GoalState) -> &'static str {
    match state {
        GoalState::Active => "进行中",
        GoalState::Achieved => "已达成",
        GoalState::Dropped => "已放弃",
    }
}

fn milestone_state_label(state: MilestoneState) -> &'static str {
    match state {
        MilestoneState::Todo => "待办",
        MilestoneState::Doing => "进行中",
        MilestoneState::Done => "已完成",
    }
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::domain::{PlanFields, PlanKind};
    use crate::plan_ops;
    use chrono::DateTime;

    fn with_clock<'a>(now: DateTime<chrono::FixedOffset>, stamp: &'a str) -> Clock<'a> {
        Clock::from_now(now, stamp)
    }

    fn stamp_now() -> (DateTime<chrono::FixedOffset>, String) {
        let now = DateTime::parse_from_rfc3339("2026-11-26T10:42:00+08:00").expect("now");
        (now, now.to_rfc3339())
    }

    fn create_tree(conn: &mut Connection, clock: Clock<'_>) -> (GoalView, GoalView, GoalView) {
        let year = create_goal(
            conn,
            CreateGoalInput {
                level: GoalLevel::Year,
                parent_id: None,
                period: "2026".into(),
                title: "年目标".into(),
                acceptance: "".into(),
                measure: GoalMeasure::Count {
                    target: 10,
                    unit: "次".into(),
                },
            },
            clock,
        )
        .expect("year");
        let month = create_goal(
            conn,
            CreateGoalInput {
                level: GoalLevel::Month,
                parent_id: Some(year.goal.id.clone()),
                period: "2026-11".into(),
                title: "月目标".into(),
                acceptance: "".into(),
                measure: GoalMeasure::Milestones,
            },
            clock,
        )
        .expect("month");
        let week = create_goal(
            conn,
            CreateGoalInput {
                level: GoalLevel::Week,
                parent_id: Some(month.goal.id.clone()),
                period: "2026-11-W4".into(),
                title: "周目标".into(),
                acceptance: "".into(),
                measure: GoalMeasure::Count {
                    target: 5,
                    unit: "次".into(),
                },
            },
            clock,
        )
        .expect("week");
        (year, month, week)
    }

    #[test]
    fn create_list_progress_and_delete_restore() {
        let db = Db::open_memory().expect("db");
        let mut conn = db.conn.lock().expect("lock");
        let (now, stamp) = stamp_now();
        let clock = with_clock(now, &stamp);
        let (year, month, week) = create_tree(&mut conn, clock);

        let listed =
            list_goals(&conn, Some(GoalLevel::Week), Some("2026-11-W4"), clock).expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].goal.id, week.goal.id);

        let plan = plan_ops::create_plan(
            &mut conn,
            "2026-11-26",
            PlanFields {
                start: 10 * 60,
                end: 11 * 60,
                title: "核心".into(),
                acceptance: "".into(),
                kind: PlanKind::Core,
                week_goal_id: Some(week.goal.id.clone()),
                note: None,
            },
            clock,
        )
        .expect("plan");
        let _ = plan_ops::complete_plan(&mut conn, &plan.plan.plan.id, clock).expect("done");

        let year_view = get_goal(&conn, &year.goal.id, clock).expect("year view");
        assert_eq!(year_view.progress.done, 1);
        assert_eq!(year_view.progress.total, 10);

        let preview = preview_delete_goal(&conn, &month.goal.id, clock).expect("preview");
        assert_eq!(preview.goals_archived, 2);
        assert_eq!(preview.plans_kept, 1);
        assert_eq!(preview.plans_deleted, 0);

        let impact = delete_goal(&mut conn, &month.goal.id, clock).expect("delete");
        assert_eq!(impact.goals_archived, 2);
        assert!(
            list_goals(&conn, None, None, clock)
                .expect("alive")
                .iter()
                .all(|g| { g.goal.id == year.goal.id })
        );
        assert_eq!(list_deleted_goals(&conn, clock).expect("deleted").len(), 2);

        let restored = restore_goal(&mut conn, &month.goal.id, clock).expect("restore");
        assert!(restored.goal.deleted_at.is_none());
        let week_again = get_goal(&conn, &week.goal.id, clock).expect("week restored");
        assert!(week_again.goal.deleted_at.is_none());
    }

    #[test]
    fn milestones_drive_progress_and_deleted_goal_cannot_be_parent() {
        let db = Db::open_memory().expect("db");
        let mut conn = db.conn.lock().expect("lock");
        let (now, stamp) = stamp_now();
        let clock = with_clock(now, &stamp);
        let year = create_goal(
            &mut conn,
            CreateGoalInput {
                level: GoalLevel::Year,
                parent_id: None,
                period: "2026".into(),
                title: "年".into(),
                acceptance: "".into(),
                measure: GoalMeasure::Milestones,
            },
            clock,
        )
        .expect("year");
        let with_ms = add_milestone(&mut conn, &year.goal.id, "第一步".into(), clock).expect("ms");
        assert_eq!(with_ms.progress.total, 1);
        assert_eq!(with_ms.progress.done, 0);
        let ms_id = with_ms.goal.milestones[0].id.clone();
        let done = set_milestone_state(
            &mut conn,
            &year.goal.id,
            &ms_id,
            MilestoneState::Done,
            clock,
        )
        .expect("done ms");
        assert_eq!(done.progress.done, 1);

        let _ = delete_goal(&mut conn, &year.goal.id, clock).expect("delete year");
        let err = create_goal(
            &mut conn,
            CreateGoalInput {
                level: GoalLevel::Month,
                parent_id: Some(year.goal.id.clone()),
                period: "2026-11".into(),
                title: "月".into(),
                acceptance: "".into(),
                measure: GoalMeasure::Milestones,
            },
            clock,
        )
        .expect_err("deleted parent");
        assert!(matches!(err, AppError::InvalidParent { .. }));
    }
}
