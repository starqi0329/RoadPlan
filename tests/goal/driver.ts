import type { PlanFields, PlanSaveResult, PlanView } from "../plan/types.ts";
import type { Timestamp } from "../plan/types.ts";
import type {
  ChainTarget,
  CreateGoalInput,
  DeleteGoalImpact,
  GoalLevel,
  GoalState,
  GoalView,
  Id,
  MilestoneState,
  Period,
  Result,
  UpdateGoalInput,
} from "./types.ts";

/**
 * 目标命令端口，对应契约 §3.3，外加挂周目标和累积计数要用的计划命令。
 * 同一组用例打在对照和真实命令上。真实命令还没接入时返回 null。
 */
export interface GoalDriver {
  now(): Timestamp;
  setNow(now: Timestamp): void;
  listGoals(level: GoalLevel | null, period: Period | null): Promise<Result<GoalView[]>>;
  listDeletedGoals(): Promise<Result<GoalView[]>>;
  getGoal(id: Id): Promise<Result<GoalView>>;
  getGoalChain(target: ChainTarget): Promise<Result<GoalView[]>>;
  createGoal(input: CreateGoalInput): Promise<Result<GoalView>>;
  updateGoal(id: Id, input: UpdateGoalInput): Promise<Result<GoalView>>;
  setGoalState(id: Id, state: GoalState): Promise<Result<GoalView>>;
  previewDeleteGoal(id: Id): Promise<Result<DeleteGoalImpact>>;
  deleteGoal(id: Id): Promise<Result<DeleteGoalImpact>>;
  restoreGoal(id: Id): Promise<Result<GoalView>>;
  addMilestone(goalId: Id, title: string): Promise<Result<GoalView>>;
  updateMilestone(goalId: Id, milestoneId: Id, title: string): Promise<Result<GoalView>>;
  setMilestoneState(
    goalId: Id,
    milestoneId: Id,
    state: MilestoneState,
  ): Promise<Result<GoalView>>;
  removeMilestone(goalId: Id, milestoneId: Id): Promise<Result<GoalView>>;
  listPlans(date: string): Promise<Result<PlanView[]>>;
  createPlan(date: string, fields: PlanFields): Promise<Result<PlanSaveResult>>;
  completePlan(id: Id): Promise<Result<PlanView>>;
  skipPlan(id: Id, reason: string | null): Promise<Result<PlanView>>;
}

/**
 * 真实桌面命令。
 * 切片 2 的目标命令还没有合并。本环境也不是 Windows，不能打开桌面程序。
 * 保持 null，让真实命令用例跳过，不用产品源码冒充结果。
 */
export function connectRealDriver(): (() => GoalDriver) | null {
  return null;
}
