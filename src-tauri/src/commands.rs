use chrono::NaiveDate;
use specta_typescript::Typescript;
use tauri::{AppHandle, State};
use tauri_specta::{Builder, Event, collect_commands, collect_events};

use crate::clock;
use crate::db::{self, Db};
use crate::domain::{
    AuditPage, CONTRACT_VERSION, ChainTarget, CopyPlansInput, CreateGoalInput, DeleteGoalImpact,
    GoalLevel, GoalState, GoalView, MilestoneState, NowInfo, Periods, PlanFields, PlanSaveResult,
    PlanView, RescheduleResult, Review, SaveReviewInput, Segment, SetNoteInput, SkipPlanInput,
    UpdateGoalInput, WindowLayout, now_info,
};
use crate::error::AppError;
use crate::events::{DataChanged, MinuteTick};
use crate::goal_ops;
use crate::plan_ops::{self, Clock};
use crate::review_ops;
use crate::window_ops::{self, WindowUiState};

fn with_clock<T>(f: impl FnOnce(Clock<'_>) -> Result<T, AppError>) -> Result<T, AppError> {
    let now = clock::current_now();
    let stamp = now.to_rfc3339();
    f(Clock::from_now(now, &stamp))
}

fn emit_changed(app: &AppHandle, entities: &[&str]) -> Result<(), AppError> {
    DataChanged {
        entities: entities.iter().map(|item| (*item).to_owned()).collect(),
    }
    .emit(app)
    .map_err(|error| AppError::Internal {
        message: format!("发送 data-changed 失败: {error}"),
    })
}

fn emit_plan_changed(app: &AppHandle) -> Result<(), AppError> {
    emit_changed(app, &["plan", "audit"])
}

fn emit_goal_changed(app: &AppHandle, with_plan: bool) -> Result<(), AppError> {
    if with_plan {
        emit_changed(app, &["goal", "plan", "audit"])
    } else {
        emit_changed(app, &["goal", "audit"])
    }
}

fn emit_review_changed(app: &AppHandle) -> Result<(), AppError> {
    emit_changed(app, &["review", "audit"])
}

#[tauri::command]
#[specta::specta]
pub fn get_now() -> NowInfo {
    now_info(clock::current_now())
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
pub fn list_plans(db: State<'_, Db>, date: String) -> Result<Vec<PlanView>, AppError> {
    let conn = db::lock_conn(&db)?;
    with_clock(|clock| plan_ops::list_plans(&conn, &date, clock))
}

#[tauri::command]
#[specta::specta]
pub fn create_plan(
    app: AppHandle,
    db: State<'_, Db>,
    date: String,
    fields: PlanFields,
) -> Result<PlanSaveResult, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result = with_clock(|clock| plan_ops::create_plan(&mut conn, &date, fields, clock))?;
    emit_plan_changed(&app)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn update_plan(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    fields: PlanFields,
) -> Result<PlanSaveResult, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result = with_clock(|clock| plan_ops::update_plan(&mut conn, &id, fields, clock))?;
    emit_plan_changed(&app)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn reschedule_plan(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    date: String,
    fields: PlanFields,
) -> Result<RescheduleResult, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result =
        with_clock(|clock| plan_ops::reschedule_plan(&mut conn, &id, &date, fields, clock))?;
    emit_plan_changed(&app)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn copy_plans(
    app: AppHandle,
    db: State<'_, Db>,
    input: CopyPlansInput,
) -> Result<Vec<PlanView>, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result = with_clock(|clock| {
        plan_ops::copy_plans(&mut conn, &input.plan_ids, &input.to_date, clock)
    })?;
    emit_plan_changed(&app)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn complete_plan(app: AppHandle, db: State<'_, Db>, id: String) -> Result<PlanView, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result = with_clock(|clock| plan_ops::complete_plan(&mut conn, &id, clock))?;
    emit_plan_changed(&app)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn reopen_plan(app: AppHandle, db: State<'_, Db>, id: String) -> Result<PlanView, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result = with_clock(|clock| plan_ops::reopen_plan(&mut conn, &id, clock))?;
    emit_plan_changed(&app)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn skip_plan(
    app: AppHandle,
    db: State<'_, Db>,
    input: SkipPlanInput,
) -> Result<PlanView, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result =
        with_clock(|clock| plan_ops::skip_plan(&mut conn, &input.id, input.reason, clock))?;
    emit_plan_changed(&app)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn set_plan_note(
    app: AppHandle,
    db: State<'_, Db>,
    input: SetNoteInput,
) -> Result<PlanView, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result =
        with_clock(|clock| plan_ops::set_plan_note(&mut conn, &input.id, input.note, clock))?;
    emit_plan_changed(&app)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn delete_plan(app: AppHandle, db: State<'_, Db>, id: String) -> Result<(), AppError> {
    let mut conn = db::lock_conn(&db)?;
    with_clock(|clock| plan_ops::delete_plan(&mut conn, &id, clock))?;
    emit_plan_changed(&app)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn list_goals(
    db: State<'_, Db>,
    level: Option<GoalLevel>,
    period: Option<String>,
) -> Result<Vec<GoalView>, AppError> {
    let conn = db::lock_conn(&db)?;
    with_clock(|clock| goal_ops::list_goals(&conn, level, period.as_deref(), clock))
}

#[tauri::command]
#[specta::specta]
pub fn list_deleted_goals(db: State<'_, Db>) -> Result<Vec<GoalView>, AppError> {
    let conn = db::lock_conn(&db)?;
    with_clock(|clock| goal_ops::list_deleted_goals(&conn, clock))
}

#[tauri::command]
#[specta::specta]
pub fn get_goal(db: State<'_, Db>, id: String) -> Result<GoalView, AppError> {
    let conn = db::lock_conn(&db)?;
    with_clock(|clock| goal_ops::get_goal(&conn, &id, clock))
}

#[tauri::command]
#[specta::specta]
pub fn get_goal_chain(db: State<'_, Db>, target: ChainTarget) -> Result<Vec<GoalView>, AppError> {
    let conn = db::lock_conn(&db)?;
    with_clock(|clock| goal_ops::get_goal_chain(&conn, target, clock))
}

#[tauri::command]
#[specta::specta]
pub fn create_goal(
    app: AppHandle,
    db: State<'_, Db>,
    input: CreateGoalInput,
) -> Result<GoalView, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result = with_clock(|clock| goal_ops::create_goal(&mut conn, input, clock))?;
    emit_goal_changed(&app, false)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn update_goal(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    input: UpdateGoalInput,
) -> Result<GoalView, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result = with_clock(|clock| goal_ops::update_goal(&mut conn, &id, input, clock))?;
    emit_goal_changed(&app, false)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn set_goal_state(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    state: GoalState,
) -> Result<GoalView, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result = with_clock(|clock| goal_ops::set_goal_state(&mut conn, &id, state, clock))?;
    emit_goal_changed(&app, false)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn preview_delete_goal(db: State<'_, Db>, id: String) -> Result<DeleteGoalImpact, AppError> {
    let conn = db::lock_conn(&db)?;
    with_clock(|clock| goal_ops::preview_delete_goal(&conn, &id, clock))
}

#[tauri::command]
#[specta::specta]
pub fn delete_goal(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
) -> Result<DeleteGoalImpact, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result = with_clock(|clock| goal_ops::delete_goal(&mut conn, &id, clock))?;
    emit_goal_changed(&app, true)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn restore_goal(app: AppHandle, db: State<'_, Db>, id: String) -> Result<GoalView, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result = with_clock(|clock| goal_ops::restore_goal(&mut conn, &id, clock))?;
    emit_goal_changed(&app, false)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn add_milestone(
    app: AppHandle,
    db: State<'_, Db>,
    goal_id: String,
    title: String,
) -> Result<GoalView, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result = with_clock(|clock| goal_ops::add_milestone(&mut conn, &goal_id, title, clock))?;
    emit_goal_changed(&app, false)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn update_milestone(
    app: AppHandle,
    db: State<'_, Db>,
    goal_id: String,
    milestone_id: String,
    title: String,
) -> Result<GoalView, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result = with_clock(|clock| {
        goal_ops::update_milestone(&mut conn, &goal_id, &milestone_id, title, clock)
    })?;
    emit_goal_changed(&app, false)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn set_milestone_state(
    app: AppHandle,
    db: State<'_, Db>,
    goal_id: String,
    milestone_id: String,
    state: MilestoneState,
) -> Result<GoalView, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result = with_clock(|clock| {
        goal_ops::set_milestone_state(&mut conn, &goal_id, &milestone_id, state, clock)
    })?;
    emit_goal_changed(&app, false)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn remove_milestone(
    app: AppHandle,
    db: State<'_, Db>,
    goal_id: String,
    milestone_id: String,
) -> Result<GoalView, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result =
        with_clock(|clock| goal_ops::remove_milestone(&mut conn, &goal_id, &milestone_id, clock))?;
    emit_goal_changed(&app, false)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn get_segment_review(
    db: State<'_, Db>,
    date: String,
    segment: Segment,
) -> Result<Option<Review>, AppError> {
    let conn = db::lock_conn(&db)?;
    review_ops::get_segment_review(&conn, &date, segment)
}

#[tauri::command]
#[specta::specta]
pub fn list_goal_reviews(db: State<'_, Db>, goal_id: String) -> Result<Vec<Review>, AppError> {
    let conn = db::lock_conn(&db)?;
    review_ops::list_goal_reviews(&conn, &goal_id)
}

#[tauri::command]
#[specta::specta]
pub fn save_review(
    app: AppHandle,
    db: State<'_, Db>,
    input: SaveReviewInput,
) -> Result<Review, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result =
        with_clock(|clock| review_ops::save_review(&mut conn, input.target, input.note, clock))?;
    emit_review_changed(&app)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn update_review(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    note: String,
) -> Result<Review, AppError> {
    let mut conn = db::lock_conn(&db)?;
    let result = with_clock(|clock| review_ops::update_review(&mut conn, &id, note, clock))?;
    emit_review_changed(&app)?;
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn list_audit(
    db: State<'_, Db>,
    limit: u32,
    before_id: Option<String>,
) -> Result<AuditPage, AppError> {
    let conn = db::lock_conn(&db)?;
    crate::plan_store::list_audit(&conn, limit, before_id.as_deref())
}

#[tauri::command]
#[specta::specta]
pub fn get_window_layout(state: State<'_, WindowUiState>) -> Result<WindowLayout, AppError> {
    window_ops::get_window_layout(&state)
}

#[tauri::command]
#[specta::specta]
pub fn save_window_layout(
    app: AppHandle,
    state: State<'_, WindowUiState>,
    layout: WindowLayout,
) -> Result<(), AppError> {
    window_ops::save_window_layout(&app, &state, layout)
}

#[tauri::command]
#[specta::specta]
pub fn set_main_collapsed(
    app: AppHandle,
    state: State<'_, WindowUiState>,
    collapsed: bool,
) -> Result<(), AppError> {
    window_ops::set_main_collapsed(&app, &state, collapsed)
}

#[tauri::command]
#[specta::specta]
pub fn hide_main_to_tray(app: AppHandle) -> Result<(), AppError> {
    window_ops::hide_main_to_tray(&app)
}

#[tauri::command]
#[specta::specta]
pub fn show_main(app: AppHandle) -> Result<(), AppError> {
    window_ops::show_main(&app)
}

#[tauri::command]
#[specta::specta]
pub fn minimize_main(app: AppHandle) -> Result<(), AppError> {
    window_ops::minimize_main(&app)
}

#[tauri::command]
#[specta::specta]
pub async fn show_pin(app: AppHandle, state: State<'_, WindowUiState>) -> Result<(), AppError> {
    window_ops::show_pin(&app, &state)
}

#[tauri::command]
#[specta::specta]
pub fn hide_pin(app: AppHandle, state: State<'_, WindowUiState>) -> Result<(), AppError> {
    window_ops::hide_pin(&app, &state)
}

#[tauri::command]
#[specta::specta]
pub async fn show_capsule(app: AppHandle, state: State<'_, WindowUiState>) -> Result<(), AppError> {
    window_ops::show_capsule(&app, &state)
}

#[tauri::command]
#[specta::specta]
pub fn hide_capsule(app: AppHandle, state: State<'_, WindowUiState>) -> Result<(), AppError> {
    window_ops::hide_capsule(&app, &state)
}

#[tauri::command]
#[specta::specta]
pub fn set_dragging(
    app: AppHandle,
    state: State<'_, WindowUiState>,
    dragging: bool,
) -> Result<(), AppError> {
    window_ops::set_dragging(&app, &state, dragging)
}

#[tauri::command]
#[specta::specta]
pub fn quit_app(app: AppHandle) -> Result<(), AppError> {
    window_ops::quit_app(&app)
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
            get_window_layout,
            save_window_layout,
            set_main_collapsed,
            hide_main_to_tray,
            show_main,
            minimize_main,
            show_pin,
            hide_pin,
            show_capsule,
            hide_capsule,
            set_dragging,
            quit_app,
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
