use chrono::{FixedOffset, NaiveDate, NaiveTime, TimeZone};
use rusqlite::Connection;
use uuid::Uuid;

use crate::domain::{
    AuditAction, PlanStatus, Review, ReviewTarget, Segment, compute_review_stats, derive_status,
    segment_of, segment_review_too_early, segment_start_minute,
};
use crate::error::AppError;
use crate::goal_store;
use crate::plan_ops::Clock;
use crate::plan_store;
use crate::review_store;

pub fn get_segment_review(
    conn: &Connection,
    date: &str,
    segment: Segment,
) -> Result<Option<Review>, AppError> {
    parse_date(date)?;
    review_store::get_segment_review(conn, date, segment)
}

pub fn list_goal_reviews(conn: &Connection, goal_id: &str) -> Result<Vec<Review>, AppError> {
    let _ = goal_store::get_goal(conn, goal_id)?;
    review_store::list_goal_reviews(conn, goal_id)
}

pub fn save_review(
    conn: &mut Connection,
    target: ReviewTarget,
    note: String,
    clock: Clock<'_>,
) -> Result<Review, AppError> {
    match target {
        ReviewTarget::Segment { date, segment } => {
            save_segment_review(conn, &date, segment, note, clock)
        }
        ReviewTarget::Goal { goal_id } => save_goal_review(conn, &goal_id, note, clock),
    }
}

pub fn update_review(
    conn: &mut Connection,
    id: &str,
    note: String,
    clock: Clock<'_>,
) -> Result<Review, AppError> {
    let mut review = review_store::get_review(conn, id)?;
    review.note = note;
    review.updated_at = clock.stamp.to_owned();

    let title = review_title(&review.target);
    let tx = conn.transaction().map_err(crate::db::db_error)?;
    review_store::update_review_row(&tx, &review)?;
    review_store::insert_audit(
        &tx,
        clock.stamp,
        AuditAction::Update,
        &review.id,
        &title,
        format!("更新复盘「{title}」的笔记"),
    )?;
    tx.commit().map_err(crate::db::db_error)?;
    Ok(review)
}

fn save_segment_review(
    conn: &mut Connection,
    date: &str,
    segment: Segment,
    note: String,
    clock: Clock<'_>,
) -> Result<Review, AppError> {
    let review_date = parse_date(date)?;
    if segment_review_too_early(review_date, segment, clock.date, clock.minute) {
        return Err(AppError::TooEarly {
            starts_at: segment_starts_at(review_date, segment, clock.now.offset())?,
        });
    }

    let stats = segment_stats(conn, date, segment, clock)?;
    let title = segment_title(segment);
    let existing = review_store::get_segment_review(conn, date, segment)?;

    let tx = conn.transaction().map_err(crate::db::db_error)?;
    let review = if let Some(mut current) = existing {
        current.note = note;
        current.stats = stats;
        current.updated_at = clock.stamp.to_owned();
        review_store::update_review_row(&tx, &current)?;
        review_store::insert_audit(
            &tx,
            clock.stamp,
            AuditAction::Review,
            &current.id,
            title,
            format!("覆盖保存{title}（{date}）"),
        )?;
        current
    } else {
        let created = Review {
            id: new_id(),
            target: ReviewTarget::Segment {
                date: date.to_owned(),
                segment,
            },
            note,
            stats,
            created_at: clock.stamp.to_owned(),
            updated_at: clock.stamp.to_owned(),
        };
        review_store::insert_review(&tx, &created)?;
        review_store::insert_audit(
            &tx,
            clock.stamp,
            AuditAction::Review,
            &created.id,
            title,
            format!("保存{title}（{date}）"),
        )?;
        created
    };
    tx.commit().map_err(crate::db::db_error)?;
    Ok(review)
}

fn save_goal_review(
    conn: &mut Connection,
    goal_id: &str,
    note: String,
    clock: Clock<'_>,
) -> Result<Review, AppError> {
    let goal = goal_store::get_goal(conn, goal_id)?;
    let stats = goal_stats(conn, goal_id, clock)?;
    let review = Review {
        id: new_id(),
        target: ReviewTarget::Goal {
            goal_id: goal_id.to_owned(),
        },
        note,
        stats,
        created_at: clock.stamp.to_owned(),
        updated_at: clock.stamp.to_owned(),
    };

    let tx = conn.transaction().map_err(crate::db::db_error)?;
    review_store::insert_review(&tx, &review)?;
    review_store::insert_audit(
        &tx,
        clock.stamp,
        AuditAction::Review,
        &review.id,
        &goal.title,
        format!("保存目标「{}」的复盘", goal.title),
    )?;
    tx.commit().map_err(crate::db::db_error)?;
    Ok(review)
}

fn segment_stats(
    conn: &Connection,
    date: &str,
    segment: Segment,
    clock: Clock<'_>,
) -> Result<crate::domain::ReviewStats, AppError> {
    let plans = plan_store::list_by_date(conn, date)?;
    let items: Vec<(u16, u16, PlanStatus)> = plans
        .into_iter()
        .filter(|plan| segment_of(plan.start) == segment)
        .map(|plan| {
            let status = status_of(
                &plan.date,
                plan.start,
                plan.end,
                plan.outcome.as_ref(),
                clock,
            );
            (plan.start, plan.end, status)
        })
        .collect();
    Ok(compute_review_stats(&items))
}

fn goal_stats(
    conn: &Connection,
    goal_id: &str,
    clock: Clock<'_>,
) -> Result<crate::domain::ReviewStats, AppError> {
    let subtree = goal_store::list_subtree_including_deleted(conn, goal_id)?;
    let ids: Vec<String> = subtree.into_iter().map(|goal| goal.id).collect();
    let plans = goal_store::list_plans_for_goal_ids(conn, &ids)?;
    let items: Vec<(u16, u16, PlanStatus)> = plans
        .into_iter()
        .map(|plan| {
            let status = status_of(
                &plan.date,
                plan.start,
                plan.end,
                plan.outcome.as_ref(),
                clock,
            );
            (plan.start, plan.end, status)
        })
        .collect();
    Ok(compute_review_stats(&items))
}

fn status_of(
    date: &str,
    start: u16,
    end: u16,
    outcome: Option<&crate::domain::PlanOutcome>,
    clock: Clock<'_>,
) -> PlanStatus {
    match NaiveDate::parse_from_str(date, "%Y-%m-%d") {
        Ok(plan_date) => derive_status(plan_date, start, end, outcome, clock.date, clock.minute),
        Err(_) => PlanStatus::Overdue,
    }
}

fn segment_starts_at(
    date: NaiveDate,
    segment: Segment,
    offset: &FixedOffset,
) -> Result<String, AppError> {
    let start = segment_start_minute(segment);
    let time = NaiveTime::from_hms_opt(u32::from(start / 60), u32::from(start % 60), 0)
        .ok_or_else(|| AppError::Internal {
            message: "无法构造时段开始时间".into(),
        })?;
    offset
        .from_local_datetime(&date.and_time(time))
        .single()
        .map(|dt| dt.to_rfc3339())
        .ok_or_else(|| AppError::Internal {
            message: "无法构造时段开始时间".into(),
        })
}

fn parse_date(value: &str) -> Result<NaiveDate, AppError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| AppError::Validation {
        field: "date".into(),
        message: "日期格式应为 YYYY-MM-DD".into(),
    })
}

fn new_id() -> String {
    Uuid::now_v7().to_string()
}

fn segment_title(segment: Segment) -> &'static str {
    match segment {
        Segment::Morning => "上午复盘",
        Segment::Afternoon => "下午复盘",
        Segment::Evening => "晚间复盘",
    }
}

fn review_title(target: &ReviewTarget) -> String {
    match target {
        ReviewTarget::Segment { segment, date } => {
            format!("{}（{date}）", segment_title(*segment))
        }
        ReviewTarget::Goal { goal_id } => format!("目标复盘 {goal_id}"),
    }
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::domain::{
        CreateGoalInput, GoalLevel, GoalMeasure, PlanFields, PlanKind, ReviewStats,
    };
    use crate::goal_ops;
    use crate::plan_ops;
    use chrono::DateTime;

    fn with_clock<'a>(now: DateTime<FixedOffset>, stamp: &'a str) -> Clock<'a> {
        Clock::from_now(now, stamp)
    }

    #[test]
    fn segment_review_too_early_then_save_overwrite_and_goal_append() {
        let db = Db::open_memory().expect("db");
        let mut conn = db.conn.lock().expect("lock");

        let morning = DateTime::parse_from_rfc3339("2026-11-26T10:42:00+08:00").expect("now");
        let morning_stamp = morning.to_rfc3339();
        let morning_clock = with_clock(morning, &morning_stamp);

        let err = save_review(
            &mut conn,
            ReviewTarget::Segment {
                date: "2026-11-26".into(),
                segment: Segment::Afternoon,
            },
            "太早".into(),
            morning_clock,
        )
        .expect_err("too early");
        assert!(matches!(err, AppError::TooEarly { .. }));

        let _ = plan_ops::create_plan(
            &mut conn,
            "2026-11-26",
            PlanFields {
                start: 9 * 60,
                end: 10 * 60,
                title: "晨间".into(),
                acceptance: "".into(),
                kind: PlanKind::Routine,
                week_goal_id: None,
                note: None,
            },
            morning_clock,
        )
        .expect("plan");
        let done_plan = plan_ops::create_plan(
            &mut conn,
            "2026-11-26",
            PlanFields {
                start: 10 * 60,
                end: 11 * 60,
                title: "完成项".into(),
                acceptance: "".into(),
                kind: PlanKind::Work,
                week_goal_id: None,
                note: None,
            },
            morning_clock,
        )
        .expect("plan2");
        let _ = plan_ops::complete_plan(&mut conn, &done_plan.plan.plan.id, morning_clock)
            .expect("complete");

        let first = save_review(
            &mut conn,
            ReviewTarget::Segment {
                date: "2026-11-26".into(),
                segment: Segment::Morning,
            },
            "上午笔记".into(),
            morning_clock,
        )
        .expect("save morning");
        assert_eq!(first.note, "上午笔记");
        assert_eq!(
            first.stats,
            ReviewStats {
                planned: 2,
                done: 1,
                skipped: 0,
                overdue: 1,
                focus_minutes: 60,
            }
        );

        let second = save_review(
            &mut conn,
            ReviewTarget::Segment {
                date: "2026-11-26".into(),
                segment: Segment::Morning,
            },
            "覆盖笔记".into(),
            morning_clock,
        )
        .expect("overwrite");
        assert_eq!(second.id, first.id);
        assert_eq!(second.note, "覆盖笔记");
        assert_eq!(second.stats.planned, 2);

        let got = get_segment_review(&conn, "2026-11-26", Segment::Morning)
            .expect("get")
            .expect("some");
        assert_eq!(got.note, "覆盖笔记");

        let year = goal_ops::create_goal(
            &mut conn,
            CreateGoalInput {
                level: GoalLevel::Year,
                parent_id: None,
                period: "2026".into(),
                title: "年目标".into(),
                acceptance: "".into(),
                measure: GoalMeasure::Milestones,
            },
            morning_clock,
        )
        .expect("year");
        let month = goal_ops::create_goal(
            &mut conn,
            CreateGoalInput {
                level: GoalLevel::Month,
                parent_id: Some(year.goal.id.clone()),
                period: "2026-11".into(),
                title: "月目标".into(),
                acceptance: "".into(),
                measure: GoalMeasure::Milestones,
            },
            morning_clock,
        )
        .expect("month");
        let week = goal_ops::create_goal(
            &mut conn,
            CreateGoalInput {
                level: GoalLevel::Week,
                parent_id: Some(month.goal.id.clone()),
                period: "2026-11-W4".into(),
                title: "周目标".into(),
                acceptance: "".into(),
                measure: GoalMeasure::Count {
                    target: 3,
                    unit: "次".into(),
                },
            },
            morning_clock,
        )
        .expect("week");
        let linked = plan_ops::create_plan(
            &mut conn,
            "2026-11-26",
            PlanFields {
                start: 14 * 60,
                end: 15 * 60,
                title: "挂周目标".into(),
                acceptance: "".into(),
                kind: PlanKind::Core,
                week_goal_id: Some(week.goal.id.clone()),
                note: None,
            },
            morning_clock,
        )
        .expect("core plan");

        let evening = DateTime::parse_from_rfc3339("2026-11-26T19:00:00+08:00").expect("evening");
        let evening_stamp = evening.to_rfc3339();
        let evening_clock = with_clock(evening, &evening_stamp);
        let _ = plan_ops::complete_plan(&mut conn, &linked.plan.plan.id, evening_clock)
            .expect("complete core");

        let g1 = save_review(
            &mut conn,
            ReviewTarget::Goal {
                goal_id: year.goal.id.clone(),
            },
            "目标一".into(),
            evening_clock,
        )
        .expect("goal review 1");
        let g2 = save_review(
            &mut conn,
            ReviewTarget::Goal {
                goal_id: year.goal.id.clone(),
            },
            "目标二".into(),
            evening_clock,
        )
        .expect("goal review 2");
        assert_ne!(g1.id, g2.id);
        assert_eq!(g1.stats.done, 1);
        assert_eq!(g1.stats.focus_minutes, 60);

        let listed = list_goal_reviews(&conn, &year.goal.id).expect("list");
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0].id, g2.id);

        let old_stats = g1.stats.clone();
        let updated =
            update_review(&mut conn, &g1.id, "只改笔记".into(), evening_clock).expect("update");
        assert_eq!(updated.note, "只改笔记");
        assert_eq!(updated.stats, old_stats);
    }
}
