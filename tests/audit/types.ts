import type { AppError, Id, PlanFields, PlanView, Result, Timestamp } from "../plan/types.ts";

export type { AppError, Id, PlanFields, PlanView, Result, Timestamp };

export type AuditAction =
  | "create"
  | "update"
  | "complete"
  | "reopen"
  | "skip"
  | "reschedule"
  | "copy"
  | "delete"
  | "restore"
  | "note"
  | "review"
  | "state";

export type AuditEntity = "plan" | "goal" | "milestone" | "review";

export type AuditEvent = {
  id: Id;
  at: Timestamp;
  action: AuditAction;
  entity: AuditEntity;
  entityId: Id;
  entityTitle: string;
  summary: string;
};

export type AuditPage = {
  items: AuditEvent[];
  total: number;
};

export type GoalLevel = "year" | "month" | "week";

export type CreateGoalInput = {
  level: GoalLevel;
  parentId: Id | null;
  period: string;
  title: string;
};

export type GoalView = {
  id: Id;
  level: GoalLevel;
  parentId: Id | null;
  period: string;
  title: string;
};

export type DeleteGoalImpact = {
  goalsArchived: number;
  plansDeleted: number;
  plansKept: number;
};

export type AuditDriver = {
  setNow(now: Timestamp): void;
  createPlan(date: string, fields: PlanFields): Promise<Result<PlanView>>;
  listPlans(date: string): Promise<Result<PlanView[]>>;
  completePlan(id: Id): Promise<Result<PlanView>>;
  copyPlans(planIds: Id[], toDate: string): Promise<Result<PlanView[]>>;
  createGoal(input: CreateGoalInput): Promise<Result<GoalView>>;
  previewDeleteGoal(id: Id): Promise<Result<DeleteGoalImpact>>;
  deleteGoal(id: Id): Promise<Result<DeleteGoalImpact>>;
  listAudit(limit: number, beforeId: Id | null): Promise<Result<AuditPage>>;
};
