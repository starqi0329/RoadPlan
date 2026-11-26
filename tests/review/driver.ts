import type { PlanFields, PlanSaveResult, PlanView, RescheduleResult, Result } from "../plan/types.ts";
import type { Timestamp } from "../plan/types.ts";
import type { Id, LocalDate, Review, Segment } from "./types.ts";

export type GoalLevel = "year" | "month" | "week";

export type CreateGoalInput = {
  level: GoalLevel;
  parentId: Id | null;
  period: string;
  title: string;
};

/**
 * 复盘命令端口，对应契约 §3.4。
 * 排明天要用的计划命令和建目标，是同一组用例在真实命令上也能准备数据。
 * 真实命令还没接入时返回 null。
 */
export interface ReviewDriver {
  now(): Timestamp;
  setNow(now: Timestamp): void;
  createGoal(input: CreateGoalInput): Promise<Result<{ id: Id; title: string }>>;
  createPlan(date: LocalDate, fields: PlanFields): Promise<Result<PlanSaveResult>>;
  completePlan(id: Id): Promise<Result<PlanView>>;
  skipPlan(id: Id, reason: string | null): Promise<Result<PlanView>>;
  listPlans(date: LocalDate): Promise<Result<PlanView[]>>;
  reschedulePlan(id: Id, date: LocalDate, fields: PlanFields): Promise<Result<RescheduleResult>>;
  copyPlans(planIds: Id[], toDate: LocalDate): Promise<Result<PlanView[]>>;
  getSegmentReview(date: LocalDate, segment: Segment): Promise<Result<Review | null>>;
  listGoalReviews(goalId: Id): Promise<Result<Review[]>>;
  saveReview(target: Review["target"], note: string): Promise<Result<Review>>;
  updateReview(id: Id, note: string): Promise<Result<Review>>;
}

/**
 * 真实桌面命令。
 * 切片 3 的复盘命令还没有合并。本环境也不是 Windows。
 * 保持 null，真实命令用例跳过，不用产品源码冒充结果。
 */
export function connectRealDriver(): (() => ReviewDriver) | null {
  return null;
}
