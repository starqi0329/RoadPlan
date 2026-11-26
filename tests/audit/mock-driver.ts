import { atMinute, parseClock } from "../plan/time.ts";
import type { PlanFields, PlanView } from "../plan/types.ts";
import type {
  AuditDriver,
  AuditEvent,
  CreateGoalInput,
  DeleteGoalImpact,
  GoalView,
  Id,
} from "./types.ts";

type StoredPlan = {
  id: Id;
  date: string;
  start: number;
  end: number;
  title: string;
  acceptance: string;
  kind: PlanFields["kind"];
  weekGoalId: Id | null;
  note: string | null;
  outcome: { type: "done"; at: string } | null;
  rescheduledFrom: Id | null;
  createdAt: string;
  updatedAt: string;
};

type StoredGoal = GoalView & { deletedAt: string | null };

export function createAuditMock(): AuditDriver {
  let now = "2026-11-26T10:42:00+08:00";
  let seq = 0x1000;
  const plans: StoredPlan[] = [];
  const goals: StoredGoal[] = [];
  const audits: AuditEvent[] = [];

  function clock() {
    return parseClock(now);
  }

  function nextId(): Id {
    seq -= 1;
    if (seq < 0) throw new Error("对照里的 id 用完了");
    const timestamp = BigInt(clock().epochMs);
    const bytes = [
      Number((timestamp >> 40n) & 0xffn),
      Number((timestamp >> 32n) & 0xffn),
      Number((timestamp >> 24n) & 0xffn),
      Number((timestamp >> 16n) & 0xffn),
      Number((timestamp >> 8n) & 0xffn),
      Number(timestamp & 0xffn),
      0x70 | ((seq >> 8) & 0x0f),
      seq & 0xff,
      0x80,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];
    const hex = bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function record(
    action: AuditEvent["action"],
    entity: AuditEvent["entity"],
    entityId: Id,
    entityTitle: string,
    summary: string,
  ): void {
    audits.push({
      id: nextId(),
      at: now,
      action,
      entity,
      entityId,
      entityTitle,
      summary,
    });
  }

  function endMs(plan: StoredPlan): number {
    return parseClock(atMinute(plan.date, plan.end, clock().offset)).epochMs;
  }

  function view(plan: StoredPlan): PlanView {
    const current = clock().epochMs;
    const startAt = parseClock(atMinute(plan.date, plan.start, clock().offset)).epochMs;
    const endAt = endMs(plan);
    let status: PlanView["status"] = "upcoming";
    if (plan.outcome?.type === "done") status = "done";
    else if (current < startAt) status = "upcoming";
    else if (current < endAt) status = "active";
    else status = "overdue";
    return {
      ...plan,
      outcome: plan.outcome,
      status,
      canComplete: status === "active" || status === "overdue",
      editable: status === "upcoming" || status === "active",
      late: plan.outcome?.type === "done" && parseClock(plan.outcome.at).epochMs > endAt,
    };
  }

  function impactOf(rootId: Id): DeleteGoalImpact | null {
    const root = goals.find((goal) => goal.id === rootId);
    if (!root) return null;
    const archived = new Set<Id>();
    const pending = [rootId];
    while (pending.length > 0) {
      const id = pending.pop()!;
      const goal = goals.find((item) => item.id === id);
      if (!goal || goal.deletedAt) continue;
      archived.add(id);
      for (const child of goals) {
        if (child.parentId === id) pending.push(child.id);
      }
    }
    const attached = plans.filter((plan) => plan.weekGoalId !== null && archived.has(plan.weekGoalId));
    const current = clock().epochMs;
    const plansDeleted = attached.filter((plan) => plan.outcome === null && endMs(plan) > current).length;
    return {
      goalsArchived: archived.size,
      plansDeleted,
      plansKept: attached.length - plansDeleted,
    };
  }

  return {
    setNow(value) {
      now = value;
    },
    async createPlan(date, fields) {
      const title = fields.title.trim();
      if (title === "" || fields.start < 0 || fields.start >= fields.end || fields.end > 1440) {
        return { ok: false, error: { code: "validation", field: "title", message: "计划字段不合法" } };
      }
      const plan: StoredPlan = {
        id: nextId(),
        date,
        start: fields.start,
        end: fields.end,
        title,
        acceptance: fields.acceptance,
        kind: fields.kind,
        weekGoalId: fields.weekGoalId,
        note: fields.note,
        outcome: null,
        rescheduledFrom: null,
        createdAt: now,
        updatedAt: now,
      };
      plans.push(plan);
      record("create", "plan", plan.id, plan.title, `新建计划 ${plan.title}`);
      return { ok: true, data: view(plan) };
    },
    async listPlans(date) {
      return { ok: true, data: plans.filter((plan) => plan.date === date).map(view) };
    },
    async completePlan(id) {
      const plan = plans.find((item) => item.id === id);
      if (!plan) return { ok: false, error: { code: "not_found", entity: "plan", id } };
      const seen = view(plan);
      if (seen.status === "upcoming") {
        return {
          ok: false,
          error: { code: "too_early", startsAt: atMinute(plan.date, plan.start, clock().offset) },
        };
      }
      if (seen.status === "done") {
        return { ok: false, error: { code: "locked", reason: "finished" } };
      }
      plan.outcome = { type: "done", at: now };
      plan.updatedAt = now;
      record("complete", "plan", plan.id, plan.title, `完成计划 ${plan.title}`);
      return { ok: true, data: view(plan) };
    },
    async copyPlans(planIds, toDate) {
      const sources: StoredPlan[] = [];
      for (const id of planIds) {
        const source = plans.find((item) => item.id === id);
        if (!source) return { ok: false, error: { code: "not_found", entity: "plan", id } };
        sources.push(source);
      }
      const copied: PlanView[] = [];
      for (const source of sources) {
        const plan: StoredPlan = {
          ...source,
          id: nextId(),
          date: toDate,
          note: null,
          outcome: null,
          rescheduledFrom: null,
          createdAt: now,
          updatedAt: now,
        };
        plans.push(plan);
        copied.push(view(plan));
      }
      record("copy", "plan", copied[0]?.id ?? nextId(), "复制的计划", `复制 ${planIds.length} 条计划`);
      return { ok: true, data: copied };
    },
    async createGoal(input) {
      const title = input.title.trim();
      if (title === "") {
        return { ok: false, error: { code: "validation", field: "title", message: "目标标题为空" } };
      }
      const goal: StoredGoal = {
        id: nextId(),
        level: input.level,
        parentId: input.parentId,
        period: input.period,
        title,
        deletedAt: null,
      };
      goals.push(goal);
      record("create", "goal", goal.id, goal.title, `新建目标 ${goal.title}`);
      return { ok: true, data: { ...goal } };
    },
    async previewDeleteGoal(id) {
      const impact = impactOf(id);
      if (!impact) return { ok: false, error: { code: "not_found", entity: "goal", id } };
      return { ok: true, data: impact };
    },
    async deleteGoal(id) {
      const impact = impactOf(id);
      const goal = goals.find((item) => item.id === id);
      if (!impact || !goal) return { ok: false, error: { code: "not_found", entity: "goal", id } };
      const archived = new Set<Id>();
      const pending = [id];
      while (pending.length > 0) {
        const current = pending.pop()!;
        const item = goals.find((goalItem) => goalItem.id === current);
        if (!item || item.deletedAt) continue;
        archived.add(current);
        for (const child of goals) {
          if (child.parentId === current) pending.push(child.id);
        }
      }
      const current = clock().epochMs;
      for (let index = plans.length - 1; index >= 0; index -= 1) {
        const plan = plans[index];
        if (plan.weekGoalId && archived.has(plan.weekGoalId) && plan.outcome === null && endMs(plan) > current) {
          plans.splice(index, 1);
        }
      }
      for (const item of goals) {
        if (archived.has(item.id)) item.deletedAt = now;
      }
      record(
        "delete",
        "goal",
        goal.id,
        goal.title,
        `归档 ${impact.goalsArchived} 个目标，删除 ${impact.plansDeleted} 条计划，保留 ${impact.plansKept} 条计划`,
      );
      return { ok: true, data: impact };
    },
    async listAudit(limit, beforeId) {
      const sorted = [...audits].sort((left, right) => {
        if (left.at !== right.at) return left.at < right.at ? 1 : -1;
        if (left.id === right.id) return 0;
        return left.id < right.id ? 1 : -1;
      });
      let start = 0;
      if (beforeId !== null) {
        const index = sorted.findIndex((event) => event.id === beforeId);
        if (index < 0) return { ok: false, error: { code: "not_found", entity: "audit", id: beforeId } };
        start = index + 1;
      }
      return {
        ok: true,
        data: { items: sorted.slice(start, start + limit), total: sorted.length },
      };
    },
  };
}
