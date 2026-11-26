/** 契约 0.2.0 里和计划命令有关的形状。测试只依赖这份约定，不从产品源码推导。 */

export type Id = string;
export type LocalDate = string;
export type Minute = number;
export type Timestamp = string;

export type PlanKind = "core" | "work" | "routine" | "review";

export type PlanOutcome =
  | { type: "done"; at: Timestamp }
  | { type: "skipped"; at: Timestamp; reason: string | null };

export type PlanStatus = "upcoming" | "active" | "overdue" | "done" | "skipped";

export type PlanFields = {
  start: Minute;
  end: Minute;
  title: string;
  acceptance: string;
  kind: PlanKind;
  weekGoalId: Id | null;
  note: string | null;
};

export type PlanView = {
  id: Id;
  date: LocalDate;
  start: Minute;
  end: Minute;
  title: string;
  acceptance: string;
  kind: PlanKind;
  weekGoalId: Id | null;
  note: string | null;
  outcome: PlanOutcome | null;
  rescheduledFrom: Id | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  status: PlanStatus;
  canComplete: boolean;
  editable: boolean;
  late: boolean;
};

export type OverlapRef = { id: Id; title: string; start: Minute; end: Minute };

export type PlanSaveResult = { plan: PlanView; overlaps: OverlapRef[] };

export type RescheduleResult = {
  original: PlanView;
  created: PlanView;
  overlaps: OverlapRef[];
};

export type AppError =
  | { code: "not_found"; entity: string; id: Id }
  | { code: "validation"; field: string; message: string }
  | { code: "too_early"; startsAt: Timestamp }
  | { code: "locked"; reason: "ended" | "finished" }
  | { code: "parent_required"; level: "year" | "month" | "week" }
  | { code: "invalid_parent"; expected: "year" | "month" | "week" }
  | { code: "internal"; message: string };

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };
