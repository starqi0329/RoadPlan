use chrono::NaiveDate;
use specta_typescript::Typescript;
use tauri_specta::{Builder, collect_commands, collect_events};

use crate::domain::{
    AuditPage, CONTRACT_VERSION, ChainTarget, CopyPlansInput, CreateGoalInput, DeleteGoalImpact,
    GoalLevel, GoalState, GoalView, MilestoneState, NowInfo, Periods, PlanFields, PlanSaveResult,
    PlanView, RescheduleResult, Review, SaveReviewInput, Segment, SetNoteInput, SkipPlanInput,
    UpdateGoalInput, now_info,
};
use crate::error::AppError;
use crate::events::{DataChanged, MinuteTick};

fn not_done<T>(command: &str) -> Result<T, AppError> {
    Err(AppError::not_done(command))
}

#[tauri::command]
#[specta::specta]
pub fn get_now() -> NowInfo {
    now_info(chrono::Local::now())
}

#[tauri::command]
#[specta::specta]
pub fn periods_of(date: String) -> Result<Periods, AppError> {
    let parsed =
        NaiveDate::parse_from_str(&date, "%Y-%m-%d").map_err(|_| AppError::Validation {
            field: "date".into(),
            message: "日期格式应为 YYYY-MM-DD".into(),
        })?;
    Ok(crate::domain::periods_of(parsed))
}

#[tauri::command]
#[specta::specta]
pub fn list_plans(date: String) -> Result<Vec<PlanView>, AppError> {
    let _ = date;
    not_done("list_plans")
}

#[tauri::command]
#[specta::specta]
pub fn create_plan(date: String, fields: PlanFields) -> Result<PlanSaveResult, AppError> {
    let _ = (date, fields);
    not_done("create_plan")
}

#[tauri::command]
#[specta::specta]
pub fn update_plan(id: String, fields: PlanFields) -> Result<PlanSaveResult, AppError> {
    let _ = (id, fields);
    not_done("update_plan")
}

#[tauri::command]
#[specta::specta]
pub fn reschedule_plan(
    id: String,
    date: String,
    fields: PlanFields,
) -> Result<RescheduleResult, AppError> {
    let _ = (id, date, fields);
    not_done("reschedule_plan")
}

#[tauri::command]
#[specta::specta]
pub fn copy_plans(input: CopyPlansInput) -> Result<Vec<PlanView>, AppError> {
    let _ = input;
    not_done("copy_plans")
}

#[tauri::command]
#[specta::specta]
pub fn complete_plan(id: String) -> Result<PlanView, AppError> {
    let _ = id;
    not_done("complete_plan")
}

#[tauri::command]
#[specta::specta]
pub fn reopen_plan(id: String) -> Result<PlanView, AppError> {
    let _ = id;
    not_done("reopen_plan")
}

#[tauri::command]
#[specta::specta]
pub fn skip_plan(input: SkipPlanInput) -> Result<PlanView, AppError> {
    let _ = input;
    not_done("skip_plan")
}

#[tauri::command]
#[specta::specta]
pub fn set_plan_note(input: SetNoteInput) -> Result<PlanView, AppError> {
    let _ = input;
    not_done("set_plan_note")
}

#[tauri::command]
#[specta::specta]
pub fn delete_plan(id: String) -> Result<(), AppError> {
    let _ = id;
    not_done("delete_plan")
}

#[tauri::command]
#[specta::specta]
pub fn list_goals(
    level: Option<GoalLevel>,
    period: Option<String>,
) -> Result<Vec<GoalView>, AppError> {
    let _ = (level, period);
    not_done("list_goals")
}

#[tauri::command]
#[specta::specta]
pub fn list_deleted_goals() -> Result<Vec<GoalView>, AppError> {
    not_done("list_deleted_goals")
}

#[tauri::command]
#[specta::specta]
pub fn get_goal(id: String) -> Result<GoalView, AppError> {
    let _ = id;
    not_done("get_goal")
}

#[tauri::command]
#[specta::specta]
pub fn get_goal_chain(target: ChainTarget) -> Result<Vec<GoalView>, AppError> {
    let _ = target;
    not_done("get_goal_chain")
}

#[tauri::command]
#[specta::specta]
pub fn create_goal(input: CreateGoalInput) -> Result<GoalView, AppError> {
    let _ = input;
    not_done("create_goal")
}

#[tauri::command]
#[specta::specta]
pub fn update_goal(id: String, input: UpdateGoalInput) -> Result<GoalView, AppError> {
    let _ = (id, input);
    not_done("update_goal")
}

#[tauri::command]
#[specta::specta]
pub fn set_goal_state(id: String, state: GoalState) -> Result<GoalView, AppError> {
    let _ = (id, state);
    not_done("set_goal_state")
}

#[tauri::command]
#[specta::specta]
pub fn preview_delete_goal(id: String) -> Result<DeleteGoalImpact, AppError> {
    let _ = id;
    not_done("preview_delete_goal")
}

#[tauri::command]
#[specta::specta]
pub fn delete_goal(id: String) -> Result<DeleteGoalImpact, AppError> {
    let _ = id;
    not_done("delete_goal")
}

#[tauri::command]
#[specta::specta]
pub fn restore_goal(id: String) -> Result<GoalView, AppError> {
    let _ = id;
    not_done("restore_goal")
}

#[tauri::command]
#[specta::specta]
pub fn add_milestone(goal_id: String, title: String) -> Result<GoalView, AppError> {
    let _ = (goal_id, title);
    not_done("add_milestone")
}

#[tauri::command]
#[specta::specta]
pub fn update_milestone(
    goal_id: String,
    milestone_id: String,
    title: String,
) -> Result<GoalView, AppError> {
    let _ = (goal_id, milestone_id, title);
    not_done("update_milestone")
}

#[tauri::command]
#[specta::specta]
pub fn set_milestone_state(
    goal_id: String,
    milestone_id: String,
    state: MilestoneState,
) -> Result<GoalView, AppError> {
    let _ = (goal_id, milestone_id, state);
    not_done("set_milestone_state")
}

#[tauri::command]
#[specta::specta]
pub fn remove_milestone(goal_id: String, milestone_id: String) -> Result<GoalView, AppError> {
    let _ = (goal_id, milestone_id);
    not_done("remove_milestone")
}

#[tauri::command]
#[specta::specta]
pub fn get_segment_review(date: String, segment: Segment) -> Result<Option<Review>, AppError> {
    let _ = (date, segment);
    not_done("get_segment_review")
}

#[tauri::command]
#[specta::specta]
pub fn list_goal_reviews(goal_id: String) -> Result<Vec<Review>, AppError> {
    let _ = goal_id;
    not_done("list_goal_reviews")
}

#[tauri::command]
#[specta::specta]
pub fn save_review(input: SaveReviewInput) -> Result<Review, AppError> {
    let _ = input;
    not_done("save_review")
}

#[tauri::command]
#[specta::specta]
pub fn update_review(id: String, note: String) -> Result<Review, AppError> {
    let _ = (id, note);
    not_done("update_review")
}

#[tauri::command]
#[specta::specta]
pub fn list_audit(limit: u32, before_id: Option<String>) -> Result<AuditPage, AppError> {
    let _ = (limit, before_id);
    not_done("list_audit")
}

pub fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            get_now,
            periods_of,
            list_plans,
            create_plan,
            update_plan,
            reschedule_plan,
            copy_plans,
            complete_plan,
            reopen_plan,
            skip_plan,
            set_plan_note,
            delete_plan,
            list_goals,
            list_deleted_goals,
            get_goal,
            get_goal_chain,
            create_goal,
            update_goal,
            set_goal_state,
            preview_delete_goal,
            delete_goal,
            restore_goal,
            add_milestone,
            update_milestone,
            set_milestone_state,
            remove_milestone,
            get_segment_review,
            list_goal_reviews,
            save_review,
            update_review,
            list_audit,
        ])
        .events(collect_events![DataChanged, MinuteTick])
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn export_bindings(path: &std::path::Path) -> Result<(), String> {
    builder()
        .export(Typescript::default(), path)
        .map_err(|error| format!("{error:?}"))?;
    let mut current = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    // 生成器总会导入 Channel。当前契约没有通道，留下它会让前端 noUnusedLocals 失败。
    current = current.replace("\n\tChannel as TAURI_CHANNEL,", "");
    if !current.contains("CONTRACT_VERSION") {
        let extra = format!("\nexport const CONTRACT_VERSION = \"{CONTRACT_VERSION}\" as const;\n");
        current.push_str(&extra);
    }
    std::fs::write(path, current).map_err(|error| error.to_string())?;
    Ok(())
}
