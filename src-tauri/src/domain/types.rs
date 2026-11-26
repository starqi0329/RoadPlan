use serde::{Deserialize, Serialize};
use specta::Type;

#[cfg_attr(not(test), allow(dead_code))]
pub const CONTRACT_VERSION: &str = "0.3.0";

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Periods {
    pub year: String,
    pub month: String,
    pub week: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NowInfo {
    pub now: String,
    pub date: String,
    pub minute: u16,
    pub periods: Periods,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum HierarchyLevel {
    Year,
    Month,
    Week,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PlanKind {
    Core,
    Work,
    Routine,
    Review,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PlanStatus {
    Upcoming,
    Active,
    Overdue,
    Done,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PlanOutcome {
    Done { at: String },
    Skipped { at: String, reason: Option<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub id: String,
    pub date: String,
    pub start: u16,
    pub end: u16,
    pub title: String,
    pub acceptance: String,
    pub kind: PlanKind,
    pub week_goal_id: Option<String>,
    pub note: Option<String>,
    pub outcome: Option<PlanOutcome>,
    pub rescheduled_from: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlanView {
    #[serde(flatten)]
    pub plan: Plan,
    pub status: PlanStatus,
    pub can_complete: bool,
    pub editable: bool,
    pub late: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlanFields {
    pub start: u16,
    pub end: u16,
    pub title: String,
    pub acceptance: String,
    pub kind: PlanKind,
    pub week_goal_id: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OverlapRef {
    pub id: String,
    pub title: String,
    pub start: u16,
    pub end: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlanSaveResult {
    pub plan: PlanView,
    pub overlaps: Vec<OverlapRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RescheduleResult {
    pub original: PlanView,
    pub created: PlanView,
    pub overlaps: Vec<OverlapRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CopyPlansInput {
    pub plan_ids: Vec<String>,
    pub to_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SkipPlanInput {
    pub id: String,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SetNoteInput {
    pub id: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum GoalLevel {
    Year,
    Month,
    Week,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum GoalState {
    Active,
    Achieved,
    Dropped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum MilestoneState {
    Todo,
    Doing,
    Done,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum GoalMeasure {
    Milestones,
    Count { target: u32, unit: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Milestone {
    pub id: String,
    pub title: String,
    pub state: MilestoneState,
    pub order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Goal {
    pub id: String,
    pub level: GoalLevel,
    pub parent_id: Option<String>,
    pub period: String,
    pub title: String,
    pub acceptance: String,
    pub measure: GoalMeasure,
    pub milestones: Vec<Milestone>,
    pub state: GoalState,
    pub deleted_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GoalProgress {
    pub done: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GoalView {
    #[serde(flatten)]
    pub goal: Goal,
    pub progress: GoalProgress,
    pub child_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateGoalInput {
    pub level: GoalLevel,
    pub parent_id: Option<String>,
    pub period: String,
    pub title: String,
    pub acceptance: String,
    pub measure: GoalMeasure,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGoalInput {
    pub title: String,
    pub acceptance: String,
    pub measure: GoalMeasure,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SetGoalStateInput {
    pub id: String,
    pub state: GoalState,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DeleteGoalImpact {
    pub goals_archived: u32,
    pub plans_deleted: u32,
    pub plans_kept: u32,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneInput {
    pub goal_id: String,
    pub title: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMilestoneInput {
    pub goal_id: String,
    pub milestone_id: String,
    pub title: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SetMilestoneStateInput {
    pub goal_id: String,
    pub milestone_id: String,
    pub state: MilestoneState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Segment {
    Morning,
    Afternoon,
    Evening,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ReviewTarget {
    Segment { date: String, segment: Segment },
    Goal { goal_id: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewStats {
    pub planned: u32,
    pub done: u32,
    pub skipped: u32,
    pub overdue: u32,
    pub focus_minutes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub id: String,
    pub target: ReviewTarget,
    pub note: String,
    pub stats: ReviewStats,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveReviewInput {
    pub target: ReviewTarget,
    pub note: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum AuditAction {
    Create,
    Update,
    Complete,
    Reopen,
    Skip,
    Reschedule,
    Copy,
    Delete,
    Restore,
    Note,
    Review,
    State,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum AuditEntity {
    Plan,
    Goal,
    Milestone,
    Review,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    pub id: String,
    pub at: String,
    pub action: AuditAction,
    pub entity: AuditEntity,
    pub entity_id: String,
    pub entity_title: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AuditPage {
    pub items: Vec<AuditEvent>,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ChainTarget {
    Plan { id: String },
    Goal { id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WindowFrame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WindowLayout {
    pub main: WindowFrame,
    pub pin: Option<WindowFrame>,
    pub capsule: Option<WindowFrame>,
    pub main_collapsed: bool,
    pub pin_visible: bool,
    pub capsule_visible: bool,
}
