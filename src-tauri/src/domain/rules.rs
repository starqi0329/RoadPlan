#![cfg_attr(not(test), allow(dead_code))]

use chrono::{DateTime, Datelike, FixedOffset, NaiveDate, Timelike};

use super::{
    GoalLevel, GoalProgress, Milestone, MilestoneState, NowInfo, Periods, PlanKind, PlanOutcome,
    PlanStatus, Segment,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuleError {
    ParentRequired,
    InvalidParent,
    TimeOrder,
    TimeOutOfRange,
    PeriodFormat,
    PeriodMismatch,
}

pub fn periods_of(date: NaiveDate) -> Periods {
    Periods {
        year: date.format("%Y").to_string(),
        month: format!("{}-{:02}", date.year(), date.month()),
        week: week_period(date),
    }
}

pub fn now_info(now: DateTime<FixedOffset>) -> NowInfo {
    let date = now.date_naive();
    let minute =
        u16::try_from(now.hour()).unwrap_or(0) * 60 + u16::try_from(now.minute()).unwrap_or(0);
    NowInfo {
        now: now.to_rfc3339(),
        date: date.format("%Y-%m-%d").to_string(),
        minute,
        periods: periods_of(date),
    }
}

pub fn validate_interval(start: u16, end: u16) -> Result<(), RuleError> {
    if start >= 1440 || end > 1440 {
        return Err(RuleError::TimeOutOfRange);
    }
    if end <= start {
        return Err(RuleError::TimeOrder);
    }
    Ok(())
}

pub fn derive_status(
    plan_date: NaiveDate,
    start: u16,
    end: u16,
    outcome: Option<&PlanOutcome>,
    today: NaiveDate,
    minute: u16,
) -> PlanStatus {
    let _ = end;
    if let Some(outcome) = outcome {
        return match outcome {
            PlanOutcome::Done { .. } => PlanStatus::Done,
            PlanOutcome::Skipped { .. } => PlanStatus::Skipped,
        };
    }
    if plan_date > today {
        return PlanStatus::Upcoming;
    }
    if plan_date < today {
        return PlanStatus::Overdue;
    }
    if minute < start {
        PlanStatus::Upcoming
    } else if minute < end {
        PlanStatus::Active
    } else {
        PlanStatus::Overdue
    }
}

pub fn can_complete(status: PlanStatus) -> bool {
    matches!(status, PlanStatus::Active | PlanStatus::Overdue)
}

pub fn editable(status: PlanStatus) -> bool {
    matches!(status, PlanStatus::Upcoming | PlanStatus::Active)
}

pub fn deleted_with_goal(status: PlanStatus) -> bool {
    matches!(status, PlanStatus::Upcoming | PlanStatus::Active)
}

pub fn is_late(plan_date: NaiveDate, end: u16, done_at: DateTime<FixedOffset>) -> bool {
    let done_date = done_at.date_naive();
    if done_date > plan_date {
        return true;
    }
    if done_date < plan_date {
        return false;
    }
    let minute = u16::try_from(done_at.hour()).unwrap_or(0) * 60
        + u16::try_from(done_at.minute()).unwrap_or(0);
    minute >= end
}

/// 每月 1–7 日为第 1 周，依次到月末。一周不跨月。
pub fn week_period(date: NaiveDate) -> String {
    let day = date.day();
    let week = match day {
        1..=7 => 1,
        8..=14 => 2,
        15..=21 => 3,
        22..=28 => 4,
        _ => 5,
    };
    format!("{}-{:02}-W{week}", date.year(), date.month())
}

pub fn segment_of(start: u16) -> Segment {
    if start < 12 * 60 {
        Segment::Morning
    } else if start < 18 * 60 {
        Segment::Afternoon
    } else {
        Segment::Evening
    }
}

pub fn overlaps(start: u16, end: u16, others: &[(u16, u16, &str)]) -> Vec<String> {
    others
        .iter()
        .filter(|(other_start, other_end, _)| start < *other_end && *other_start < end)
        .map(|(_, _, title)| (*title).to_owned())
        .collect()
}

pub fn validate_plan_parent(kind: PlanKind, week_goal_id: Option<&str>) -> Result<(), RuleError> {
    let missing = week_goal_id.map(str::is_empty).unwrap_or(true);
    if kind == PlanKind::Core && missing {
        return Err(RuleError::ParentRequired);
    }
    Ok(())
}

pub fn validate_goal_parent(level: GoalLevel, parent: Option<GoalLevel>) -> Result<(), RuleError> {
    match (level, parent) {
        (GoalLevel::Year, None) => Ok(()),
        (GoalLevel::Year, Some(_)) => Err(RuleError::InvalidParent),
        (GoalLevel::Month, Some(GoalLevel::Year)) => Ok(()),
        (GoalLevel::Week, Some(GoalLevel::Month)) => Ok(()),
        (GoalLevel::Month | GoalLevel::Week, None) => Err(RuleError::ParentRequired),
        _ => Err(RuleError::InvalidParent),
    }
}

pub fn accumulated_count(goal_ids: &[&str], plan_goal_ids: &[Option<&str>]) -> u32 {
    let count = plan_goal_ids
        .iter()
        .filter(|id| matches!(id, Some(goal) if goal_ids.contains(goal)))
        .count();
    u32::try_from(count).unwrap_or(u32::MAX)
}

/// R14：period 格式必须与 level 对应。
pub fn validate_period_format(level: GoalLevel, period: &str) -> Result<(), RuleError> {
    match level {
        GoalLevel::Year => {
            if period.len() == 4 && period.chars().all(|c| c.is_ascii_digit()) {
                Ok(())
            } else {
                Err(RuleError::PeriodFormat)
            }
        }
        GoalLevel::Month => {
            if parse_year_month(period).is_some() {
                Ok(())
            } else {
                Err(RuleError::PeriodFormat)
            }
        }
        GoalLevel::Week => {
            if parse_week_period(period).is_some() {
                Ok(())
            } else {
                Err(RuleError::PeriodFormat)
            }
        }
    }
}

/// R14：下级 period 必须属于上级 period。
pub fn validate_period_belongs(
    level: GoalLevel,
    period: &str,
    parent_period: &str,
) -> Result<(), RuleError> {
    validate_period_format(level, period)?;
    let ok = match level {
        GoalLevel::Year => true,
        GoalLevel::Month => {
            period.starts_with(&format!("{parent_period}-"))
                && period.len() == parent_period.len() + 3
        }
        GoalLevel::Week => parse_week_period(period)
            .is_some_and(|(year, month, _)| parent_period == format!("{year}-{month:02}")),
    };
    if ok {
        Ok(())
    } else {
        Err(RuleError::PeriodMismatch)
    }
}

pub fn milestone_progress(milestones: &[Milestone]) -> GoalProgress {
    let total = u32::try_from(milestones.len()).unwrap_or(u32::MAX);
    let done = milestones
        .iter()
        .filter(|item| item.state == MilestoneState::Done)
        .count();
    GoalProgress {
        done: u32::try_from(done).unwrap_or(u32::MAX),
        total,
    }
}

pub fn count_progress(done: u32, target: u32) -> GoalProgress {
    GoalProgress {
        done,
        total: target,
    }
}

fn parse_year_month(period: &str) -> Option<(i32, u32)> {
    let (year_raw, month_raw) = period.split_once('-')?;
    if year_raw.len() != 4 || month_raw.len() != 2 {
        return None;
    }
    let year: i32 = year_raw.parse().ok()?;
    let month: u32 = month_raw.parse().ok()?;
    if (1..=12).contains(&month) {
        Some((year, month))
    } else {
        None
    }
}

fn parse_week_period(period: &str) -> Option<(i32, u32, u32)> {
    let (prefix, week_raw) = period.rsplit_once("-W")?;
    let (year, month) = parse_year_month(prefix)?;
    let week: u32 = week_raw.parse().ok()?;
    if (1..=5).contains(&week) {
        Some((year, month, week))
    } else {
        None
    }
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;

    fn date(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").expect("日期")
    }

    fn at(value: &str) -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339(value).expect("时间")
    }

    #[test]
    fn status_follows_time_and_never_auto_completes() {
        let today = date("2026-11-26");
        assert_eq!(
            derive_status(today, 11 * 60 + 30, 12 * 60, None, today, 10 * 60 + 42),
            PlanStatus::Upcoming
        );
        assert_eq!(
            derive_status(today, 10 * 60, 11 * 60 + 30, None, today, 10 * 60 + 42),
            PlanStatus::Active
        );
        assert_eq!(
            derive_status(today, 9 * 60, 10 * 60, None, today, 10 * 60 + 42),
            PlanStatus::Overdue
        );
        assert_eq!(
            derive_status(
                date("2026-11-25"),
                9 * 60,
                10 * 60,
                None,
                today,
                10 * 60 + 42
            ),
            PlanStatus::Overdue
        );
        assert_eq!(
            derive_status(
                date("2026-11-27"),
                9 * 60,
                10 * 60,
                None,
                today,
                10 * 60 + 42
            ),
            PlanStatus::Upcoming
        );
    }

    #[test]
    fn outcome_wins_over_the_clock() {
        let today = date("2026-11-26");
        let done = PlanOutcome::Done {
            at: "2026-11-26T10:50:00+08:00".to_owned(),
        };
        assert_eq!(
            derive_status(today, 10 * 60, 11 * 60, Some(&done), today, 10 * 60 + 42),
            PlanStatus::Done
        );
        assert!(!can_complete(PlanStatus::Done));
        assert!(can_complete(PlanStatus::Overdue));
        assert!(!can_complete(PlanStatus::Upcoming));
        assert!(editable(PlanStatus::Active));
        assert!(!editable(PlanStatus::Overdue));
    }

    #[test]
    fn late_means_completed_after_the_planned_end() {
        let day = date("2026-11-26");
        assert!(is_late(day, 10 * 60, at("2026-11-26T10:05:00+08:00")));
        assert!(!is_late(day, 10 * 60, at("2026-11-26T09:50:00+08:00")));
        assert!(is_late(day, 10 * 60, at("2026-11-27T08:00:00+08:00")));
    }

    #[test]
    fn weeks_are_counted_inside_the_month() {
        assert_eq!(week_period(date("2026-11-01")), "2026-11-W1");
        assert_eq!(week_period(date("2026-11-07")), "2026-11-W1");
        assert_eq!(week_period(date("2026-11-08")), "2026-11-W2");
        assert_eq!(week_period(date("2026-11-29")), "2026-11-W5");
        assert_eq!(week_period(date("2026-02-28")), "2026-02-W4");
    }

    #[test]
    fn early_morning_belongs_to_the_morning_segment() {
        assert_eq!(segment_of(0), Segment::Morning);
        assert_eq!(segment_of(11 * 60 + 59), Segment::Morning);
        assert_eq!(segment_of(12 * 60), Segment::Afternoon);
        assert_eq!(segment_of(18 * 60), Segment::Evening);
    }

    #[test]
    fn overlap_warns_without_forbidding_touching_edges() {
        let others = [(9 * 60, 10 * 60, "晨间"), (14 * 60, 15 * 60, "下午")];
        assert_eq!(
            overlaps(9 * 60 + 30, 10 * 60 + 30, &others),
            vec!["晨间".to_owned()]
        );
        assert!(overlaps(10 * 60, 11 * 60, &others).is_empty());
    }

    #[test]
    fn only_core_plans_require_a_week_goal() {
        assert_eq!(
            validate_plan_parent(PlanKind::Core, None),
            Err(RuleError::ParentRequired)
        );
        assert_eq!(validate_plan_parent(PlanKind::Routine, None), Ok(()));
        assert_eq!(validate_plan_parent(PlanKind::Core, Some("week-1")), Ok(()));
    }

    #[test]
    fn goal_parents_follow_the_chain() {
        assert_eq!(validate_goal_parent(GoalLevel::Year, None), Ok(()));
        assert_eq!(
            validate_goal_parent(GoalLevel::Month, None),
            Err(RuleError::ParentRequired)
        );
        assert_eq!(
            validate_goal_parent(GoalLevel::Week, Some(GoalLevel::Year)),
            Err(RuleError::InvalidParent)
        );
        assert_eq!(
            validate_goal_parent(GoalLevel::Week, Some(GoalLevel::Month)),
            Ok(())
        );
    }

    #[test]
    fn accumulated_count_uses_completed_plans_under_the_subtree() {
        let goals = ["week", "month"];
        let plans = [Some("week"), Some("other"), None, Some("month")];
        assert_eq!(accumulated_count(&goals, &plans), 2);
    }

    #[test]
    fn unfinished_future_plans_are_deleted_with_the_goal_and_history_is_kept() {
        assert!(deleted_with_goal(PlanStatus::Upcoming));
        assert!(deleted_with_goal(PlanStatus::Active));
        assert!(!deleted_with_goal(PlanStatus::Overdue));
        assert!(!deleted_with_goal(PlanStatus::Done));
        assert!(!deleted_with_goal(PlanStatus::Skipped));
    }

    #[test]
    fn intervals_cannot_cross_midnight() {
        assert_eq!(validate_interval(23 * 60, 60), Err(RuleError::TimeOrder));
        assert_eq!(validate_interval(9 * 60, 10 * 60), Ok(()));
        assert_eq!(validate_interval(23 * 60, 24 * 60), Ok(()));
    }

    #[test]
    fn period_formats_match_levels_and_parents() {
        assert_eq!(validate_period_format(GoalLevel::Year, "2026"), Ok(()));
        assert_eq!(validate_period_format(GoalLevel::Month, "2026-11"), Ok(()));
        assert_eq!(
            validate_period_format(GoalLevel::Week, "2026-11-W4"),
            Ok(())
        );
        assert_eq!(
            validate_period_format(GoalLevel::Week, "2026-11-W6"),
            Err(RuleError::PeriodFormat)
        );
        assert_eq!(
            validate_period_belongs(GoalLevel::Month, "2026-11", "2026"),
            Ok(())
        );
        assert_eq!(
            validate_period_belongs(GoalLevel::Month, "2025-11", "2026"),
            Err(RuleError::PeriodMismatch)
        );
        assert_eq!(
            validate_period_belongs(GoalLevel::Week, "2026-11-W4", "2026-11"),
            Ok(())
        );
        assert_eq!(
            validate_period_belongs(GoalLevel::Week, "2026-12-W1", "2026-11"),
            Err(RuleError::PeriodMismatch)
        );
    }

    #[test]
    fn milestone_progress_counts_done_items() {
        let milestones = [
            Milestone {
                id: "1".into(),
                title: "a".into(),
                state: MilestoneState::Done,
                order: 0,
            },
            Milestone {
                id: "2".into(),
                title: "b".into(),
                state: MilestoneState::Todo,
                order: 1,
            },
        ];
        assert_eq!(
            milestone_progress(&milestones),
            GoalProgress { done: 1, total: 2 }
        );
        assert_eq!(count_progress(3, 10), GoalProgress { done: 3, total: 10 });
    }
}
