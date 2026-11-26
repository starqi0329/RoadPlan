import { randomBytes } from "node:crypto";

import type { GoalDriver } from "./driver.ts";
import { atMinute, parseClock } from "../plan/time.ts";
import type { PlanFields, PlanOutcome, PlanStatus, PlanView } from "../plan/types.ts";
import type { AppError, Id, LocalDate, Timestamp } from "../plan/types.ts";
import type {
  CreateGoalInput,
  GoalLevel,
  GoalMeasure,
  GoalState,
  GoalView,
  Milestone,
  Result,
} from "./types.ts";

type StoredGoal = {
  id: Id;
  level: GoalLevel;
  parentId: Id | null;
  period: string;
  title: string;
  acceptance: string;
  measure: GoalMeasure;
  milestones: Milestone[];
  state: GoalState;
  deletedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type StoredPlan = {
  id: Id;
  date: LocalDate;
  start: number;
  end: number;
  title: string;
  acceptance: string;
  kind: PlanFields["kind"];
  weekGoalId: Id | null;
  note: string | null;
  outcome: PlanOutcome | null;
  rescheduledFrom: Id | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

const YEAR_PERIOD = /^(\d{4})$/;
const MONTH_PERIOD = /^(\d{4})-(\d{2})$/;
const WEEK_PERIOD = /^(\d{4})-(\d{2})-W([1-5])$/;

/**
 * 按契约 R13–R19 和 R11 写的对照。
 * 年目标若带了上级，契约只说必须失败，没有指定错误码，对照用 validation。
 * 周期不一致时契约也没指定错误码，对照用 validation。
 * 核心计划只要求周目标存在且未删除，不额外要求周期等于计划当天。
 */
export function createGoalMock(): GoalDriver {
  const goals = new Map<Id, StoredGoal>();
  const plans = new Map<Id, StoredPlan>();
  let now = "2026-11-26T10:42:00+08:00";

  function clock() {
    return parseClock(now);
  }

  function fail<T>(error: AppError): Result<T> {
    return { ok: false, error };
  }

  function descendantsOf(id: Id): StoredGoal[] {
    const found: StoredGoal[] = [];
    const walk = (parentId: Id) => {
      for (const goal of goals.values()) {
        if (goal.parentId === parentId) {
          found.push(goal);
          walk(goal.id);
        }
      }
    };
    walk(id);
    return found;
  }

  function archiveSet(id: Id): StoredGoal[] {
    const self = goals.get(id);
    if (!self) return [];
    return [self, ...descendantsOf(id).filter((goal) => goal.deletedAt === null)];
  }

  function plansOn(goalIds: Set<Id>): StoredPlan[] {
    return [...plans.values()].filter(
      (plan) => plan.weekGoalId !== null && goalIds.has(plan.weekGoalId),
    );
  }

  function unfinished(plan: StoredPlan): boolean {
    if (plan.outcome !== null) return false;
    const endAt = parseClock(atMinute(plan.date, plan.end, clock().offset)).epochMs;
    return endAt > clock().epochMs;
  }

  function impactOf(id: Id) {
    const archived = archiveSet(id);
    const ids = new Set(archived.map((goal) => goal.id));
    const attached = plansOn(ids);
    const plansDeleted = attached.filter(unfinished).length;
    return {
      goalsArchived: archived.length,
      plansDeleted,
      plansKept: attached.length - plansDeleted,
    };
  }

  function subtreeIds(id: Id): Set<Id> {
    return new Set([id, ...descendantsOf(id).map((goal) => goal.id)]);
  }

  function progressOf(goal: StoredGoal): { done: number; total: number } {
    if (goal.measure.type === "milestones") {
      return {
        done: goal.milestones.filter((item) => item.state === "done").length,
        total: goal.milestones.length,
      };
    }
    const ids = subtreeIds(goal.id);
    const done = [...plans.values()].filter(
      (plan) =>
        plan.weekGoalId !== null && ids.has(plan.weekGoalId) && plan.outcome?.type === "done",
    ).length;
    return { done, total: goal.measure.target };
  }

  function viewGoal(goal: StoredGoal): GoalView {
    const childCount = [...goals.values()].filter(
      (item) => item.parentId === goal.id && item.deletedAt === null,
    ).length;
    return {
      id: goal.id,
      level: goal.level,
      parentId: goal.parentId,
      period: goal.period,
      title: goal.title,
      acceptance: goal.acceptance,
      measure:
        goal.measure.type === "milestones"
          ? { type: "milestones" }
          : { type: "count", target: goal.measure.target, unit: goal.measure.unit },
      milestones: goal.milestones.map((item) => ({ ...item })),
      state: goal.state,
      deletedAt: goal.deletedAt,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
      progress: progressOf(goal),
      childCount,
    };
  }

  function statusOf(plan: StoredPlan): PlanStatus {
    if (plan.outcome?.type === "done") return "done";
    if (plan.outcome?.type === "skipped") return "skipped";
    const current = clock();
    const startAt = parseClock(atMinute(plan.date, plan.start, current.offset)).epochMs;
    const endAt = parseClock(atMinute(plan.date, plan.end, current.offset)).epochMs;
    if (current.epochMs < startAt) return "upcoming";
    if (current.epochMs < endAt) return "active";
    return "overdue";
  }

  function viewPlan(plan: StoredPlan): PlanView {
    const current = clock();
    const endAt = parseClock(atMinute(plan.date, plan.end, current.offset)).epochMs;
    const status = statusOf(plan);
    const late =
      plan.outcome?.type === "done" && parseClock(plan.outcome.at).epochMs > endAt;
    return {
      id: plan.id,
      date: plan.date,
      start: plan.start,
      end: plan.end,
      title: plan.title,
      acceptance: plan.acceptance,
      kind: plan.kind,
      weekGoalId: plan.weekGoalId,
      note: plan.note,
      outcome: plan.outcome ? { ...plan.outcome } : null,
      rescheduledFrom: plan.rescheduledFrom,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      status,
      canComplete: status === "active" || status === "overdue",
      editable: status === "upcoming" || status === "active",
      late,
    };
  }

  function periodError(input: CreateGoalInput, parent: StoredGoal | null): AppError | null {
    if (input.level === "year") {
      if (!YEAR_PERIOD.test(input.period)) {
        return { code: "validation", field: "period", message: "年周期应为 YYYY" };
      }
      return null;
    }
    if (input.level === "month") {
      const matched = MONTH_PERIOD.exec(input.period);
      const month = matched ? Number(matched[2]) : 0;
      if (!matched || month < 1 || month > 12) {
        return { code: "validation", field: "period", message: "月周期应为 YYYY-MM" };
      }
      if (!parent || matched[1] !== parent.period) {
        return { code: "validation", field: "period", message: "月必须落在上级那一年" };
      }
      return null;
    }
    const matched = WEEK_PERIOD.exec(input.period);
    if (!matched || !parent) {
      return { code: "validation", field: "period", message: "周周期应为 YYYY-MM-Wn" };
    }
    const year = Number(matched[1]);
    const month = Number(matched[2]);
    const week = Number(matched[3]);
    const monthPeriod = `${matched[1]}-${matched[2]}`;
    if (monthPeriod !== parent.period) {
      return { code: "validation", field: "period", message: "周必须落在上级那一月" };
    }
    if (week > weeksInMonth(year, month)) {
      return { code: "validation", field: "period", message: "这个月没有这一周" };
    }
    return null;
  }

  function requireEditable(goal: StoredGoal | undefined, id: Id): AppError | null {
    if (!goal) return { code: "not_found", entity: "goal", id };
    if (goal.deletedAt !== null) {
      return { code: "validation", field: "deletedAt", message: "已删除的目标不能编辑" };
    }
    return null;
  }

  const driver: GoalDriver = {
    now: () => now,
    setNow(next) {
      now = parseClock(next).timestamp;
    },
    async listGoals(level, period) {
      const items = [...goals.values()]
        .filter((goal) => goal.deletedAt === null)
        .filter((goal) => level === null || goal.level === level)
        .filter((goal) => period === null || goal.period === period)
        .map(viewGoal);
      return { ok: true, data: items };
    },
    async listDeletedGoals() {
      return {
        ok: true,
        data: [...goals.values()].filter((goal) => goal.deletedAt !== null).map(viewGoal),
      };
    },
    async getGoal(id) {
      const goal = goals.get(id);
      if (!goal) return fail({ code: "not_found", entity: "goal", id });
      return { ok: true, data: viewGoal(goal) };
    },
    async getGoalChain(target) {
      let currentId: Id | null;
      if (target.type === "goal") {
        currentId = target.id;
      } else {
        const plan = plans.get(target.id);
        if (!plan) return fail({ code: "not_found", entity: "plan", id: target.id });
        currentId = plan.weekGoalId;
      }
      const chain: StoredGoal[] = [];
      while (currentId) {
        const goal = goals.get(currentId);
        if (!goal) return fail({ code: "not_found", entity: "goal", id: currentId });
        chain.push(goal);
        currentId = goal.parentId;
      }
      chain.reverse();
      return { ok: true, data: chain.map(viewGoal) };
    },
    async createGoal(input) {
      if (input.level === "year" && input.parentId !== null) {
        return fail({ code: "validation", field: "parentId", message: "年目标不能有上级" });
      }
      const expectedParent: GoalLevel | null = input.level === "month" ? "year" : input.level === "week" ? "month" : null;
      let parent: StoredGoal | null = null;
      if (expectedParent) {
        if (input.parentId === null) {
          return fail({ code: "parent_required", level: expectedParent });
        }
        parent = goals.get(input.parentId) ?? null;
        if (!parent || parent.deletedAt !== null || parent.level !== expectedParent) {
          return fail({ code: "invalid_parent", expected: expectedParent });
        }
      }
      const period = periodError(input, parent);
      if (period) return fail(period);
      const stamp = clock().timestamp;
      const goal: StoredGoal = {
        id: uuidV7(clock().epochMs),
        level: input.level,
        parentId: input.parentId,
        period: input.period,
        title: input.title,
        acceptance: input.acceptance,
        measure:
          input.measure.type === "milestones"
            ? { type: "milestones" }
            : { type: "count", target: input.measure.target, unit: input.measure.unit },
        milestones: [],
        state: "active",
        deletedAt: null,
        createdAt: stamp,
        updatedAt: stamp,
      };
      goals.set(goal.id, goal);
      return { ok: true, data: viewGoal(goal) };
    },
    async updateGoal(id, input) {
      const goal = goals.get(id);
      const error = requireEditable(goal, id);
      if (error || !goal) return fail(error ?? { code: "not_found", entity: "goal", id });
      goal.title = input.title;
      goal.acceptance = input.acceptance;
      goal.measure =
        input.measure.type === "milestones"
          ? { type: "milestones" }
          : { type: "count", target: input.measure.target, unit: input.measure.unit };
      goal.updatedAt = clock().timestamp;
      return { ok: true, data: viewGoal(goal) };
    },
    async setGoalState(id, state) {
      const goal = goals.get(id);
      const error = requireEditable(goal, id);
      if (error || !goal) return fail(error ?? { code: "not_found", entity: "goal", id });
      goal.state = state;
      goal.updatedAt = clock().timestamp;
      return { ok: true, data: viewGoal(goal) };
    },
    async previewDeleteGoal(id) {
      const goal = goals.get(id);
      if (!goal) return fail({ code: "not_found", entity: "goal", id });
      if (goal.deletedAt !== null) {
        return fail({ code: "validation", field: "deletedAt", message: "已经归档" });
      }
      return { ok: true, data: impactOf(id) };
    },
    async deleteGoal(id) {
      const goal = goals.get(id);
      if (!goal) return fail({ code: "not_found", entity: "goal", id });
      if (goal.deletedAt !== null) {
        return fail({ code: "validation", field: "deletedAt", message: "已经归档" });
      }
      const impact = impactOf(id);
      const archived = archiveSet(id);
      const ids = new Set(archived.map((item) => item.id));
      const stamp = clock().timestamp;
      for (const item of archived) item.deletedAt = stamp;
      for (const plan of plansOn(ids)) {
        if (unfinished(plan)) plans.delete(plan.id);
      }
      return { ok: true, data: impact };
    },
    async restoreGoal(id) {
      const goal = goals.get(id);
      if (!goal) return fail({ code: "not_found", entity: "goal", id });
      if (goal.deletedAt === null) {
        return fail({ code: "validation", field: "deletedAt", message: "目标没有被归档" });
      }
      if (goal.parentId !== null) {
        const parent = goals.get(goal.parentId);
        if (!parent || parent.deletedAt !== null) {
          return fail({ code: "validation", field: "parentId", message: "上级还在归档里" });
        }
      }
      const stamp = goal.deletedAt;
      goal.deletedAt = null;
      for (const child of descendantsOf(id)) {
        if (child.deletedAt === stamp) child.deletedAt = null;
      }
      return { ok: true, data: viewGoal(goal) };
    },
    async addMilestone(goalId, title) {
      const goal = goals.get(goalId);
      const error = requireEditable(goal, goalId);
      if (error || !goal) return fail(error ?? { code: "not_found", entity: "goal", id: goalId });
      const order = goal.milestones.reduce((max, item) => Math.max(max, item.order), -1) + 1;
      goal.milestones.push({
        id: uuidV7(clock().epochMs),
        title,
        state: "todo",
        order,
      });
      goal.updatedAt = clock().timestamp;
      return { ok: true, data: viewGoal(goal) };
    },
    async updateMilestone(goalId, milestoneId, title) {
      const goal = goals.get(goalId);
      const error = requireEditable(goal, goalId);
      if (error || !goal) return fail(error ?? { code: "not_found", entity: "goal", id: goalId });
      const milestone = goal.milestones.find((item) => item.id === milestoneId);
      if (!milestone) return fail({ code: "not_found", entity: "milestone", id: milestoneId });
      milestone.title = title;
      goal.updatedAt = clock().timestamp;
      return { ok: true, data: viewGoal(goal) };
    },
    async setMilestoneState(goalId, milestoneId, state) {
      const goal = goals.get(goalId);
      const error = requireEditable(goal, goalId);
      if (error || !goal) return fail(error ?? { code: "not_found", entity: "goal", id: goalId });
      const milestone = goal.milestones.find((item) => item.id === milestoneId);
      if (!milestone) return fail({ code: "not_found", entity: "milestone", id: milestoneId });
      milestone.state = state;
      goal.updatedAt = clock().timestamp;
      return { ok: true, data: viewGoal(goal) };
    },
    async removeMilestone(goalId, milestoneId) {
      const goal = goals.get(goalId);
      const error = requireEditable(goal, goalId);
      if (error || !goal) return fail(error ?? { code: "not_found", entity: "goal", id: goalId });
      const index = goal.milestones.findIndex((item) => item.id === milestoneId);
      if (index < 0) return fail({ code: "not_found", entity: "milestone", id: milestoneId });
      goal.milestones.splice(index, 1);
      goal.updatedAt = clock().timestamp;
      return { ok: true, data: viewGoal(goal) };
    },
    async listPlans(date) {
      const items = [...plans.values()]
        .filter((plan) => plan.date === date)
        .sort((left, right) => left.start - right.start || left.createdAt.localeCompare(right.createdAt))
        .map(viewPlan);
      return { ok: true, data: items };
    },
    async createPlan(date, fields) {
      if (!(fields.start >= 0 && fields.start < fields.end && fields.end <= 1440)) {
        return fail({ code: "validation", field: "start", message: "结束必须晚于开始，且落在当天" });
      }
      if (fields.title.trim() === "") {
        return fail({ code: "validation", field: "title", message: "标题不能为空" });
      }
      if (fields.kind === "core" && fields.weekGoalId === null) {
        return fail({ code: "parent_required", level: "week" });
      }
      if (fields.weekGoalId !== null) {
        const goal = goals.get(fields.weekGoalId);
        if (!goal || goal.level !== "week" || goal.deletedAt !== null) {
          return fail({ code: "invalid_parent", expected: "week" });
        }
      }
      const stamp = clock().timestamp;
      const plan: StoredPlan = {
        id: uuidV7(clock().epochMs),
        date,
        start: fields.start,
        end: fields.end,
        title: fields.title,
        acceptance: fields.acceptance,
        kind: fields.kind,
        weekGoalId: fields.weekGoalId,
        note: fields.note,
        outcome: null,
        rescheduledFrom: null,
        createdAt: stamp,
        updatedAt: stamp,
      };
      plans.set(plan.id, plan);
      return { ok: true, data: { plan: viewPlan(plan), overlaps: [] } };
    },
    async completePlan(id) {
      const plan = plans.get(id);
      if (!plan) return fail({ code: "not_found", entity: "plan", id });
      const current = viewPlan(plan);
      if (current.status === "upcoming") {
        return fail({
          code: "too_early",
          startsAt: atMinute(plan.date, plan.start, clock().offset),
        });
      }
      if (current.status === "done" || current.status === "skipped") {
        return fail({ code: "locked", reason: "finished" });
      }
      plan.outcome = { type: "done", at: clock().timestamp };
      plan.updatedAt = clock().timestamp;
      return { ok: true, data: viewPlan(plan) };
    },
    async skipPlan(id, reason) {
      const plan = plans.get(id);
      if (!plan) return fail({ code: "not_found", entity: "plan", id });
      if (plan.outcome !== null) return fail({ code: "locked", reason: "finished" });
      plan.outcome = { type: "skipped", at: clock().timestamp, reason };
      plan.updatedAt = clock().timestamp;
      return { ok: true, data: viewPlan(plan) };
    },
  };

  return driver;
}

function weeksInMonth(year: number, month: number): number {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.floor((days - 1) / 7) + 1;
}

function uuidV7(epochMs: number): string {
  const bytes = randomBytes(16);
  const timestamp = BigInt(epochMs);
  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
