use chrono::{DateTime, FixedOffset, NaiveDate, NaiveTime, TimeZone, Timelike};
use rusqlite::Connection;
use uuid::Uuid;

use crate::domain::{
    AuditAction, AuditEntity, AuditEvent, HierarchyLevel, OverlapRef, Plan, PlanFields, PlanKind,
    PlanOutcome, PlanSaveResult, PlanStatus, PlanView, RescheduleResult, RuleError, can_complete,
    derive_status, editable, is_late, validate_interval, validate_plan_parent,
};
use crate::error::{AppError, LockReason};
use crate::plan_store;

#[derive(Debug, Clone, Copy)]
pub struct Clock<'a> {
    pub now: DateTime<FixedOffset>,
    pub date: NaiveDate,
    pub minute: u16,
    pub stamp: &'a str,
}

impl<'a> Clock<'a> {
    pub fn from_now(now: DateTime<FixedOffset>, stamp: &'a str) -> Self {
        let date = now.date_naive();
        let minute =
            u16::try_from(now.hour()).unwrap_or(0) * 60 + u16::try_from(now.minute()).unwrap_or(0);
        Self {
            now,
            date,
            minute,
            stamp,
        }
    }
}

pub fn list_plans(
    conn: &Connection,
    date: &str,
    clock: Clock<'_>,
) -> Result<Vec<PlanView>, AppError> {
    parse_date(date)?;
    let plans = plan_store::list_by_date(conn, date)?;
    Ok(plans.into_iter().map(|plan| to_view(plan, clock)).collect())
}

pub fn create_plan(
    conn: &mut Connection,
    date: &str,
    fields: PlanFields,
    clock: Clock<'_>,
) -> Result<PlanSaveResult, AppError> {
    parse_date(date)?;
    let fields = normalize_fields(fields)?;
    ensure_week_goal(conn, fields.kind, fields.week_goal_id.as_deref())?;

    let id = new_id();
    let plan = Plan {
        id: id.clone(),
        date: date.to_owned(),
        start: fields.start,
        end: fields.end,
        title: fields.title.clone(),
        acceptance: fields.acceptance.clone(),
        kind: fields.kind,
        week_goal_id: fields.week_goal_id.clone(),
        note: fields.note.clone(),
        outcome: None,
        rescheduled_from: None,
        created_at: clock.stamp.to_owned(),
        updated_at: clock.stamp.to_owned(),
    };

    let tx = conn.transaction().map_err(crate::db::db_error)?;
    plan_store::insert_plan(&tx, &plan)?;
    plan_store::insert_audit(
        &tx,
        &audit_event(
            clock.stamp,
            AuditAction::Create,
            &plan.id,
            &plan.title,
            format!("新建计划「{}」", plan.title),
        ),
    )?;
    let overlaps = find_overlaps(&tx, date, fields.start, fields.end, None)?;
    tx.commit().map_err(crate::db::db_error)?;

    Ok(PlanSaveResult {
        plan: to_view(plan, clock),
        overlaps,
    })
}

pub fn update_plan(
    conn: &mut Connection,
    id: &str,
    fields: PlanFields,
    clock: Clock<'_>,
) -> Result<PlanSaveResult, AppError> {
    let fields = normalize_fields(fields)?;
    let mut plan = plan_store::get_plan(conn, id)?;
    let status = status_of(&plan, clock);
    ensure_editable(status)?;
    ensure_week_goal(conn, fields.kind, fields.week_goal_id.as_deref())?;

    plan.start = fields.start;
    plan.end = fields.end;
    plan.title = fields.title;
    plan.acceptance = fields.acceptance;
    plan.kind = fields.kind;
    plan.week_goal_id = fields.week_goal_id;
    plan.note = fields.note;
    plan.updated_at = clock.stamp.to_owned();

    let tx = conn.transaction().map_err(crate::db::db_error)?;
    plan_store::update_plan_row(&tx, &plan)?;
    plan_store::insert_audit(
        &tx,
        &audit_event(
            clock.stamp,
            AuditAction::Update,
            &plan.id,
            &plan.title,
            format!("更新计划「{}」", plan.title),
        ),
    )?;
    let overlaps = find_overlaps(&tx, &plan.date, plan.start, plan.end, Some(&plan.id))?;
    tx.commit().map_err(crate::db::db_error)?;

    Ok(PlanSaveResult {
        plan: to_view(plan, clock),
        overlaps,
    })
}

pub fn reschedule_plan(
    conn: &mut Connection,
    id: &str,
    date: &str,
    fields: PlanFields,
    clock: Clock<'_>,
) -> Result<RescheduleResult, AppError> {
    parse_date(date)?;
    let fields = normalize_fields(fields)?;
    ensure_week_goal(conn, fields.kind, fields.week_goal_id.as_deref())?;

    let mut original = plan_store::get_plan(conn, id)?;
    let created = Plan {
        id: new_id(),
        date: date.to_owned(),
        start: fields.start,
        end: fields.end,
        title: fields.title.clone(),
        acceptance: fields.acceptance.clone(),
        kind: fields.kind,
        week_goal_id: fields.week_goal_id.clone(),
        note: fields.note.clone(),
        outcome: None,
        rescheduled_from: Some(original.id.clone()),
        created_at: clock.stamp.to_owned(),
        updated_at: clock.stamp.to_owned(),
    };

    if original.outcome.is_none() {
        original.outcome = Some(PlanOutcome::Skipped {
            at: clock.stamp.to_owned(),
            reason: Some(format!("已改期到 {date}")),
        });
        original.updated_at = clock.stamp.to_owned();
    }

    let tx = conn.transaction().map_err(crate::db::db_error)?;
    plan_store::update_plan_row(&tx, &original)?;
    plan_store::insert_plan(&tx, &created)?;
    plan_store::insert_audit(
        &tx,
        &audit_event(
            clock.stamp,
            AuditAction::Reschedule,
            &created.id,
            &created.title,
            format!("将「{}」改期到 {date}", created.title),
        ),
    )?;
    let overlaps = find_overlaps(&tx, date, created.start, created.end, Some(&created.id))?;
    tx.commit().map_err(crate::db::db_error)?;

    Ok(RescheduleResult {
        original: to_view(original, clock),
        created: to_view(created, clock),
        overlaps,
    })
}

pub fn copy_plans(
    conn: &mut Connection,
    plan_ids: &[String],
    to_date: &str,
    clock: Clock<'_>,
) -> Result<Vec<PlanView>, AppError> {
    parse_date(to_date)?;
    if plan_ids.is_empty() {
        return Err(AppError::Validation {
            field: "planIds".into(),
            message: "至少选择一条计划".into(),
        });
    }

    let mut created = Vec::with_capacity(plan_ids.len());
    let tx = conn.transaction().map_err(crate::db::db_error)?;
    for id in plan_ids {
        let source = plan_store::get_plan(&tx, id)?;
        let plan = Plan {
            id: new_id(),
            date: to_date.to_owned(),
            start: source.start,
            end: source.end,
            title: source.title.clone(),
            acceptance: source.acceptance.clone(),
            kind: source.kind,
            week_goal_id: source.week_goal_id.clone(),
            note: None,
            outcome: None,
            rescheduled_from: None,
            created_at: clock.stamp.to_owned(),
            updated_at: clock.stamp.to_owned(),
        };
        plan_store::insert_plan(&tx, &plan)?;
        created.push(plan);
    }
    plan_store::insert_audit(
        &tx,
        &audit_event(
            clock.stamp,
            AuditAction::Copy,
            &created[0].id,
            &created[0].title,
            format!("复制 {} 条计划到 {to_date}", created.len()),
        ),
    )?;
    tx.commit().map_err(crate::db::db_error)?;

    Ok(created
        .into_iter()
        .map(|plan| to_view(plan, clock))
        .collect())
}

pub fn complete_plan(
    conn: &mut Connection,
    id: &str,
    clock: Clock<'_>,
) -> Result<PlanView, AppError> {
    let mut plan = plan_store::get_plan(conn, id)?;
    let status = status_of(&plan, clock);
    match status {
        PlanStatus::Active | PlanStatus::Overdue => {}
        PlanStatus::Upcoming => {
            return Err(AppError::TooEarly {
                starts_at: plan_instant(&plan.date, plan.start, clock.now.offset())?,
            });
        }
        PlanStatus::Done | PlanStatus::Skipped => {
            return Err(AppError::Locked {
                reason: LockReason::Finished,
            });
        }
    }

    plan.outcome = Some(PlanOutcome::Done {
        at: clock.stamp.to_owned(),
    });
    plan.updated_at = clock.stamp.to_owned();

    let tx = conn.transaction().map_err(crate::db::db_error)?;
    plan_store::update_plan_row(&tx, &plan)?;
    plan_store::insert_audit(
        &tx,
        &audit_event(
            clock.stamp,
            AuditAction::Complete,
            &plan.id,
            &plan.title,
            format!("完成计划「{}」", plan.title),
        ),
    )?;
    tx.commit().map_err(crate::db::db_error)?;
    Ok(to_view(plan, clock))
}

pub fn reopen_plan(
    conn: &mut Connection,
    id: &str,
    clock: Clock<'_>,
) -> Result<PlanView, AppError> {
    let mut plan = plan_store::get_plan(conn, id)?;
    if plan.outcome.is_none() {
        return Err(AppError::Validation {
            field: "outcome".into(),
            message: "未处理的计划不能撤销".into(),
        });
    }
    plan.outcome = None;
    plan.updated_at = clock.stamp.to_owned();

    let tx = conn.transaction().map_err(crate::db::db_error)?;
    plan_store::update_plan_row(&tx, &plan)?;
    plan_store::insert_audit(
        &tx,
        &audit_event(
            clock.stamp,
            AuditAction::Reopen,
            &plan.id,
            &plan.title,
            format!("撤销计划「{}」的处理结果", plan.title),
        ),
    )?;
    tx.commit().map_err(crate::db::db_error)?;
    Ok(to_view(plan, clock))
}

pub fn skip_plan(
    conn: &mut Connection,
    id: &str,
    reason: Option<String>,
    clock: Clock<'_>,
) -> Result<PlanView, AppError> {
    let mut plan = plan_store::get_plan(conn, id)?;
    if plan.outcome.is_some() {
        return Err(AppError::Locked {
            reason: LockReason::Finished,
        });
    }
    let reason = normalize_optional_text(reason);
    plan.outcome = Some(PlanOutcome::Skipped {
        at: clock.stamp.to_owned(),
        reason,
    });
    plan.updated_at = clock.stamp.to_owned();

    let tx = conn.transaction().map_err(crate::db::db_error)?;
    plan_store::update_plan_row(&tx, &plan)?;
    plan_store::insert_audit(
        &tx,
        &audit_event(
            clock.stamp,
            AuditAction::Skip,
            &plan.id,
            &plan.title,
            format!("跳过计划「{}」", plan.title),
        ),
    )?;
    tx.commit().map_err(crate::db::db_error)?;
    Ok(to_view(plan, clock))
}

pub fn set_plan_note(
    conn: &mut Connection,
    id: &str,
    note: Option<String>,
    clock: Clock<'_>,
) -> Result<PlanView, AppError> {
    let mut plan = plan_store::get_plan(conn, id)?;
    plan.note = normalize_optional_text(note);
    plan.updated_at = clock.stamp.to_owned();

    let tx = conn.transaction().map_err(crate::db::db_error)?;
    plan_store::update_plan_row(&tx, &plan)?;
    plan_store::insert_audit(
        &tx,
        &audit_event(
            clock.stamp,
            AuditAction::Note,
            &plan.id,
            &plan.title,
            format!("更新计划「{}」的备注", plan.title),
        ),
    )?;
    tx.commit().map_err(crate::db::db_error)?;
    Ok(to_view(plan, clock))
}

pub fn delete_plan(conn: &mut Connection, id: &str, clock: Clock<'_>) -> Result<(), AppError> {
    let plan = plan_store::get_plan(conn, id)?;
    if plan.outcome.is_some() {
        return Err(AppError::Locked {
            reason: LockReason::Finished,
        });
    }

    let tx = conn.transaction().map_err(crate::db::db_error)?;
    plan_store::delete_plan_row(&tx, id)?;
    plan_store::insert_audit(
        &tx,
        &audit_event(
            clock.stamp,
            AuditAction::Delete,
            &plan.id,
            &plan.title,
            format!("删除计划「{}」", plan.title),
        ),
    )?;
    tx.commit().map_err(crate::db::db_error)?;
    Ok(())
}

fn normalize_fields(fields: PlanFields) -> Result<PlanFields, AppError> {
    validate_interval(fields.start, fields.end).map_err(rule_to_app)?;
    let title = fields.title.trim().to_owned();
    if title.is_empty() {
        return Err(AppError::Validation {
            field: "title".into(),
            message: "标题不能为空".into(),
        });
    }
    let note = normalize_optional_text(fields.note);
    let week_goal_id = fields
        .week_goal_id
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    validate_plan_parent(fields.kind, week_goal_id.as_deref()).map_err(rule_to_app)?;
    Ok(PlanFields {
        start: fields.start,
        end: fields.end,
        title,
        acceptance: fields.acceptance,
        kind: fields.kind,
        week_goal_id,
        note,
    })
}

fn ensure_week_goal(
    conn: &Connection,
    kind: PlanKind,
    week_goal_id: Option<&str>,
) -> Result<(), AppError> {
    validate_plan_parent(kind, week_goal_id).map_err(rule_to_app)?;
    if let Some(goal_id) = week_goal_id
        && !plan_store::week_goal_is_valid(conn, goal_id)?
    {
        return Err(AppError::InvalidParent {
            expected: HierarchyLevel::Week,
        });
    }
    Ok(())
}

fn ensure_editable(status: PlanStatus) -> Result<(), AppError> {
    match status {
        PlanStatus::Upcoming | PlanStatus::Active => Ok(()),
        PlanStatus::Overdue => Err(AppError::Locked {
            reason: LockReason::Ended,
        }),
        PlanStatus::Done | PlanStatus::Skipped => Err(AppError::Locked {
            reason: LockReason::Finished,
        }),
    }
}

fn find_overlaps(
    conn: &Connection,
    date: &str,
    start: u16,
    end: u16,
    exclude_id: Option<&str>,
) -> Result<Vec<OverlapRef>, AppError> {
    let candidates = plan_store::list_overlap_candidates(conn, date, exclude_id)?;
    Ok(candidates
        .into_iter()
        .filter(|other| start < other.end && other.start < end)
        .collect())
}

fn to_view(plan: Plan, clock: Clock<'_>) -> PlanView {
    let status = status_of(&plan, clock);
    let late = match &plan.outcome {
        Some(PlanOutcome::Done { at }) => DateTime::parse_from_rfc3339(at)
            .map(|done_at| {
                parse_date(&plan.date)
                    .map(|date| is_late(date, plan.end, done_at))
                    .unwrap_or(false)
            })
            .unwrap_or(false),
        _ => false,
    };
    PlanView {
        plan,
        status,
        can_complete: can_complete(status),
        editable: editable(status),
        late,
    }
}

fn status_of(plan: &Plan, clock: Clock<'_>) -> PlanStatus {
    match parse_date(&plan.date) {
        Ok(plan_date) => derive_status(
            plan_date,
            plan.start,
            plan.end,
            plan.outcome.as_ref(),
            clock.date,
            clock.minute,
        ),
        Err(_) => PlanStatus::Overdue,
    }
}

fn audit_event(
    at: &str,
    action: AuditAction,
    entity_id: &str,
    entity_title: &str,
    summary: String,
) -> AuditEvent {
    AuditEvent {
        id: new_id(),
        at: at.to_owned(),
        action,
        entity: AuditEntity::Plan,
        entity_id: entity_id.to_owned(),
        entity_title: entity_title.to_owned(),
        summary,
    }
}

fn new_id() -> String {
    Uuid::now_v7().to_string()
}

fn parse_date(value: &str) -> Result<NaiveDate, AppError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| AppError::Validation {
        field: "date".into(),
        message: "日期格式应为 YYYY-MM-DD".into(),
    })
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
}

fn plan_instant(date: &str, start: u16, offset: &FixedOffset) -> Result<String, AppError> {
    let date = parse_date(date)?;
    let hour = u32::from(start / 60);
    let minute = u32::from(start % 60);
    let time = NaiveTime::from_hms_opt(hour, minute, 0).ok_or_else(|| AppError::Validation {
        field: "start".into(),
        message: "开始时间无效".into(),
    })?;
    let naive = date.and_time(time);
    offset
        .from_local_datetime(&naive)
        .single()
        .map(|dt| dt.to_rfc3339())
        .ok_or_else(|| AppError::Internal {
            message: "无法构造计划开始时间".into(),
        })
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
    }
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;
    use crate::db::Db;

    fn with_clock<'a>(now: DateTime<FixedOffset>, stamp: &'a str) -> Clock<'a> {
        Clock::from_now(now, stamp)
    }

    fn seed_week_goal(conn: &Connection, id: &str) {
        conn.execute(
            r#"
            INSERT INTO goals (
                id, level, parent_id, period, title, acceptance, measure_json,
                state, deleted_at, created_at, updated_at
            ) VALUES (?1, 'week', 'month-1', '2026-11-W4', '周目标', '', '{"type":"milestones"}',
                      'active', NULL, '2026-11-26T00:00:00+08:00', '2026-11-26T00:00:00+08:00')
            "#,
            [id],
        )
        .expect("插入周目标");
    }

    fn fields(kind: PlanKind, week_goal_id: Option<&str>) -> PlanFields {
        PlanFields {
            start: 10 * 60,
            end: 11 * 60,
            title: " 写日报 ".into(),
            acceptance: "".into(),
            kind,
            week_goal_id: week_goal_id.map(str::to_owned),
            note: Some("  ".into()),
        }
    }

    #[test]
    fn create_list_and_complete_respect_time_gate() {
        let db = Db::open_memory().expect("db");
        let mut conn = db.conn.lock().expect("lock");
        seed_week_goal(&conn, "week-1");

        let now = DateTime::parse_from_rfc3339("2026-11-26T10:42:00+08:00").expect("now");
        let stamp = now.to_rfc3339();
        let clock = with_clock(now, &stamp);

        let created = create_plan(
            &mut conn,
            "2026-11-26",
            fields(PlanKind::Routine, None),
            clock,
        )
        .expect("create");
        assert_eq!(created.plan.status, PlanStatus::Active);
        assert!(created.plan.can_complete);
        assert!(created.plan.plan.note.is_none());

        let listed = list_plans(&conn, "2026-11-26", clock).expect("list");
        assert_eq!(listed.len(), 1);

        let early_now = DateTime::parse_from_rfc3339("2026-11-26T09:00:00+08:00").expect("early");
        let early_stamp = early_now.to_rfc3339();
        let early = with_clock(early_now, &early_stamp);
        let err = complete_plan(&mut conn, &created.plan.plan.id, early).expect_err("too early");
        assert!(matches!(err, AppError::TooEarly { .. }));

        let done = complete_plan(&mut conn, &created.plan.plan.id, clock).expect("complete");
        assert_eq!(done.status, PlanStatus::Done);
        assert!(!done.late);
    }

    #[test]
    fn core_plan_requires_existing_week_goal() {
        let db = Db::open_memory().expect("db");
        let mut conn = db.conn.lock().expect("lock");
        let now = DateTime::parse_from_rfc3339("2026-11-26T10:42:00+08:00").expect("now");
        let stamp = now.to_rfc3339();
        let clock = with_clock(now, &stamp);

        let missing = create_plan(&mut conn, "2026-11-26", fields(PlanKind::Core, None), clock)
            .expect_err("parent");
        assert!(matches!(
            missing,
            AppError::ParentRequired {
                level: HierarchyLevel::Week
            }
        ));

        let invalid = create_plan(
            &mut conn,
            "2026-11-26",
            fields(PlanKind::Core, Some("missing")),
            clock,
        )
        .expect_err("invalid parent");
        assert!(matches!(
            invalid,
            AppError::InvalidParent {
                expected: HierarchyLevel::Week
            }
        ));

        seed_week_goal(&conn, "week-1");
        let ok = create_plan(
            &mut conn,
            "2026-11-26",
            fields(PlanKind::Core, Some("week-1")),
            clock,
        )
        .expect("core ok");
        assert_eq!(ok.plan.plan.kind, PlanKind::Core);
    }

    #[test]
    fn reschedule_skips_unfinished_original_and_overlap_is_reported() {
        let db = Db::open_memory().expect("db");
        let mut conn = db.conn.lock().expect("lock");
        let now = DateTime::parse_from_rfc3339("2026-11-26T10:42:00+08:00").expect("now");
        let stamp = now.to_rfc3339();
        let clock = with_clock(now, &stamp);

        let first = create_plan(&mut conn, "2026-11-26", fields(PlanKind::Work, None), clock)
            .expect("first");
        let mut other_fields = fields(PlanKind::Work, None);
        other_fields.start = 10 * 60 + 30;
        other_fields.end = 11 * 60 + 30;
        other_fields.title = "另一条".into();
        let _ =
            create_plan(&mut conn, "2026-11-27", other_fields.clone(), clock).expect("other day");

        let moved = reschedule_plan(
            &mut conn,
            &first.plan.plan.id,
            "2026-11-27",
            other_fields,
            clock,
        )
        .expect("reschedule");
        assert_eq!(moved.original.status, PlanStatus::Skipped);
        assert!(moved.original.plan.outcome.as_ref().is_some_and(|outcome| {
            matches!(
                outcome,
                PlanOutcome::Skipped {
                    reason: Some(reason),
                    ..
                } if reason == "已改期到 2026-11-27"
            )
        }));
        assert_eq!(moved.created.plan.date, "2026-11-27");
        assert_eq!(
            moved.created.plan.rescheduled_from.as_deref(),
            Some(first.plan.plan.id.as_str())
        );
        assert_eq!(moved.overlaps.len(), 1);
    }

    #[test]
    fn copy_clears_outcome_note_and_rescheduled_from() {
        let db = Db::open_memory().expect("db");
        let mut conn = db.conn.lock().expect("lock");
        let now = DateTime::parse_from_rfc3339("2026-11-26T12:00:00+08:00").expect("now");
        let stamp = now.to_rfc3339();
        let clock = with_clock(now, &stamp);

        let created = create_plan(
            &mut conn,
            "2026-11-26",
            fields(PlanKind::Routine, None),
            clock,
        )
        .expect("create");
        let done = complete_plan(&mut conn, &created.plan.plan.id, clock).expect("complete");
        let noted =
            set_plan_note(&mut conn, &done.plan.id, Some("留下备注".into()), clock).expect("note");

        let copied = copy_plans(
            &mut conn,
            std::slice::from_ref(&noted.plan.id),
            "2026-11-27",
            clock,
        )
        .expect("copy");
        assert_eq!(copied.len(), 1);
        assert!(copied[0].plan.outcome.is_none());
        assert!(copied[0].plan.note.is_none());
        assert!(copied[0].plan.rescheduled_from.is_none());
        assert_eq!(copied[0].plan.date, "2026-11-27");
    }

    #[test]
    fn overdue_cannot_be_edited_but_can_be_completed_as_late() {
        let db = Db::open_memory().expect("db");
        let mut conn = db.conn.lock().expect("lock");
        let create_now =
            DateTime::parse_from_rfc3339("2026-11-26T09:30:00+08:00").expect("create now");
        let create_stamp = create_now.to_rfc3339();
        let create_clock = with_clock(create_now, &create_stamp);
        let created = create_plan(
            &mut conn,
            "2026-11-26",
            fields(PlanKind::Routine, None),
            create_clock,
        )
        .expect("create");

        let later = DateTime::parse_from_rfc3339("2026-11-26T12:00:00+08:00").expect("later");
        let later_stamp = later.to_rfc3339();
        let later_clock = with_clock(later, &later_stamp);
        let edit_err = update_plan(
            &mut conn,
            &created.plan.plan.id,
            fields(PlanKind::Routine, None),
            later_clock,
        )
        .expect_err("locked ended");
        assert!(matches!(
            edit_err,
            AppError::Locked {
                reason: LockReason::Ended
            }
        ));

        let done =
            complete_plan(&mut conn, &created.plan.plan.id, later_clock).expect("complete late");
        assert!(done.late);
        assert_eq!(done.status, PlanStatus::Done);
    }
}
