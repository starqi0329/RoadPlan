import type {
  Id,
  LocalDate,
  PlanFields,
  PlanSaveResult,
  PlanView,
  RescheduleResult,
  Result,
} from "./types.ts";
import type { Timestamp } from "./types.ts";

/**
 * 计划命令端口，对应契约 §3.2。
 * 同一组用例打在对照驱动和真实命令上。真实命令还没接入时返回 null。
 */
export interface PlanDriver {
  now(): Timestamp;
  setNow(now: Timestamp): void;
  listPlans(date: LocalDate): Promise<Result<PlanView[]>>;
  createPlan(date: LocalDate, fields: PlanFields): Promise<Result<PlanSaveResult>>;
  updatePlan(id: Id, fields: PlanFields): Promise<Result<PlanSaveResult>>;
  reschedulePlan(
    id: Id,
    date: LocalDate,
    fields: PlanFields,
  ): Promise<Result<RescheduleResult>>;
  copyPlans(planIds: Id[], toDate: LocalDate): Promise<Result<PlanView[]>>;
  completePlan(id: Id): Promise<Result<PlanView>>;
  reopenPlan(id: Id): Promise<Result<PlanView>>;
  skipPlan(id: Id, reason: string | null): Promise<Result<PlanView>>;
  setPlanNote(id: Id, note: string | null): Promise<Result<PlanView>>;
  deletePlan(id: Id): Promise<Result<void>>;
}

/**
 * 真实桌面命令。
 * 切片 1 的后端还没有合并；契约第 6 节写明除 get_now、periods_of 外命令返回「未实现」。
 * 本环境也不是 Windows，打不开要验收的桌面程序。这里保持 null，用例标成被挡住，
 * 不用产品代码里的规则函数冒充命令结果。
 */
export function connectRealDriver(): (() => PlanDriver) | null {
  return null;
}
