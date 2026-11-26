import { randomBytes } from "node:crypto";

import type { PlanDriver } from "./driver.ts";
import { atMinute, formatClock, parseClock } from "./time.ts";
import type {
  AppError,
  Id,
  LocalDate,
  PlanFields,
  PlanOutcome,
  PlanStatus,
  PlanView,
  Result,
  Timestamp,
} from "./types.ts";

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

/**
 * 按契约 §4.1、§4.2 写的对照，不是产品实现。
 * 端点刚好相接的两段时间算不算重叠，契约没写，对照里不靠那种数据做断言。
 * 本切片没有建立周目标的命令，对照里也不预置周目标。
 */
export function createMockDriver(): PlanDriver {
  const plans = new Map<Id, StoredPlan>();
  let now = "2026-11-26T10:42:00+08:00";

  function clock() {
    return parseClock(now);
  }

  function fail<T>(error: AppError): Result<T> {
    return { ok: false, error };
  }

  function view(plan: StoredPlan): PlanView {
    const current = clock();
    const startAt = parseClock(atMinute(plan.date, plan.start, current.offset)).epochMs;
    const endAt = parseClock(atMinute(plan.date, plan.end, current.offset)).epochMs;
    const status = statusOf(plan, current.epochMs, startAt, endAt);
    const late =
      plan.outcome?.type === "done" &&
      parseClock(plan.outcome.at).epochMs > endAt;
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

  function overlapsOf(date: LocalDate, start: number, end: number, selfId: Id | null) {
    return [...plans.values()]
      .filter((plan) => plan.date === date && plan.id !== selfId)
      .filter((plan) => plan.outcome?.type !== "skipped")
      .filter((plan) => plan.start < end && start < plan.end)
      .map((plan) => ({
        id: plan.id,
        title: plan.title,
        start: plan.start,
        end: plan.end,
      }));
  }

  function checkFields(fields: PlanFields): AppError | null {
    if (!(fields.start >= 0 && fields.start < fields.end && fields.end <= 1440)) {
      return { code: "validation", field: "start", message: "结束必须晚于开始，且落在当天" };
    }
    if (fields.title.trim() === "") {
      return { code: "validation", field: "title", message: "标题不能为空" };
    }
    if (fields.kind === "core" && fields.weekGoalId === null) {
      return { code: "parent_required", level: "week" };
    }
    if (fields.weekGoalId !== null) {
      return { code: "invalid_parent", expected: "week" };
    }
    return null;
  }

  function normalizeNote(note: string | null): string | null {
    if (note === null) return null;
    return note.trim() === "" ? null : note;
  }

  function insert(date: LocalDate, fields: PlanFields, rescheduledFrom: Id | null): StoredPlan {
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
      note: normalizeNote(fields.note),
      outcome: null,
      rescheduledFrom,
      createdAt: stamp,
      updatedAt: stamp,
    };
    plans.set(plan.id, plan);
    return plan;
  }

  const driver: PlanDriver = {
    now: () => now,
    setNow(next) {
      now = parseClock(next).timestamp;
    },
    async listPlans(date) {
      const items = [...plans.values()]
        .filter((plan) => plan.date === date)
        .sort((left, right) => left.start - right.start || left.createdAt.localeCompare(right.createdAt))
        .map(view);
      return { ok: true, data: items };
    },
    async createPlan(date, fields) {
      const error = checkFields(fields);
      if (error) return fail(error);
      const overlaps = overlapsOf(date, fields.start, fields.end, null);
      const plan = insert(date, fields, null);
      return { ok: true, data: { plan: view(plan), overlaps } };
    },
    async updatePlan(id, fields) {
      const plan = plans.get(id);
      if (!plan) return fail({ code: "not_found", entity: "plan", id });
      const current = view(plan);
      if (current.status === "overdue") return fail({ code: "locked", reason: "ended" });
      if (current.status === "done" || current.status === "skipped") {
        return fail({ code: "locked", reason: "finished" });
      }
      const error = checkFields(fields);
      if (error) return fail(error);
      const overlaps = overlapsOf(plan.date, fields.start, fields.end, plan.id);
      plan.start = fields.start;
      plan.end = fields.end;
      plan.title = fields.title;
      plan.acceptance = fields.acceptance;
      plan.kind = fields.kind;
      plan.weekGoalId = fields.weekGoalId;
      plan.note = normalizeNote(fields.note);
      plan.updatedAt = clock().timestamp;
      return { ok: true, data: { plan: view(plan), overlaps } };
    },
    async reschedulePlan(id, date, fields) {
      const plan = plans.get(id);
      if (!plan) return fail({ code: "not_found", entity: "plan", id });
      const error = checkFields(fields);
      if (error) return fail(error);
      if (plan.outcome === null) {
        plan.outcome = {
          type: "skipped",
          at: clock().timestamp,
          reason: `已改期到 ${date}`,
        };
        plan.updatedAt = clock().timestamp;
      }
      const overlaps = overlapsOf(date, fields.start, fields.end, null);
      const created = insert(date, fields, plan.id);
      return {
        ok: true,
        data: { original: view(plan), created: view(created), overlaps },
      };
    },
    async copyPlans(planIds, toDate) {
      const sources: StoredPlan[] = [];
      for (const id of planIds) {
        const plan = plans.get(id);
        if (!plan) return fail({ code: "not_found", entity: "plan", id });
        sources.push(plan);
      }
      const copied: PlanView[] = [];
      for (const plan of sources) {
        const created = insert(
          toDate,
          {
            start: plan.start,
            end: plan.end,
            title: plan.title,
            acceptance: plan.acceptance,
            kind: plan.kind,
            weekGoalId: plan.weekGoalId,
            note: null,
          },
          null,
        );
        copied.push(view(created));
      }
      return { ok: true, data: copied };
    },
    async completePlan(id) {
      const plan = plans.get(id);
      if (!plan) return fail({ code: "not_found", entity: "plan", id });
      const current = view(plan);
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
      return { ok: true, data: view(plan) };
    },
    async reopenPlan(id) {
      const plan = plans.get(id);
      if (!plan) return fail({ code: "not_found", entity: "plan", id });
      if (plan.outcome === null) {
        return fail({ code: "validation", field: "outcome", message: "还没有处理结果" });
      }
      plan.outcome = null;
      plan.updatedAt = clock().timestamp;
      return { ok: true, data: view(plan) };
    },
    async skipPlan(id, reason) {
      const plan = plans.get(id);
      if (!plan) return fail({ code: "not_found", entity: "plan", id });
      if (plan.outcome !== null) return fail({ code: "locked", reason: "finished" });
      plan.outcome = { type: "skipped", at: clock().timestamp, reason };
      plan.updatedAt = clock().timestamp;
      return { ok: true, data: view(plan) };
    },
    async setPlanNote(id, note) {
      const plan = plans.get(id);
      if (!plan) return fail({ code: "not_found", entity: "plan", id });
      plan.note = normalizeNote(note);
      plan.updatedAt = clock().timestamp;
      return { ok: true, data: view(plan) };
    },
    async deletePlan(id) {
      const plan = plans.get(id);
      if (!plan) return fail({ code: "not_found", entity: "plan", id });
      if (plan.outcome !== null) return fail({ code: "locked", reason: "finished" });
      plans.delete(id);
      return { ok: true, data: undefined };
    },
  };

  return driver;
}

function statusOf(
  plan: StoredPlan,
  nowMs: number,
  startAt: number,
  endAt: number,
): PlanStatus {
  if (plan.outcome?.type === "done") return "done";
  if (plan.outcome?.type === "skipped") return "skipped";
  if (nowMs < startAt) return "upcoming";
  if (nowMs < endAt) return "active";
  return "overdue";
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
