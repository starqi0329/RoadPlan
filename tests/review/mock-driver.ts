import { randomBytes } from "node:crypto";

import type { ReviewDriver } from "./driver.ts";
import { atMinute, parseClock } from "../plan/time.ts";
import type { AppError, Id, PlanFields, PlanOutcome, PlanStatus, PlanView, Timestamp } from "../plan/types.ts";
import type { Result } from "../plan/types.ts";
import type { Review, ReviewStats, ReviewTarget, Segment } from "./types.ts";

type StoredGoal = {
  id: Id;
  parentId: Id | null;
  title: string;
};

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
  outcome: PlanOutcome | null;
  rescheduledFrom: Id | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

const SEGMENT_START: Record<Segment, number> = {
  morning: 0,
  afternoon: 720,
  evening: 1080,
};

/**
 * 按契约 R21–R25、R7、R8 写的对照。
 * 已删除下级的计划算不算进目标复盘，R25 没写，测试数据里不放这种目标。
 */
export function createReviewMock(): ReviewDriver {
  const goals = new Map<Id, StoredGoal>();
  const plans = new Map<Id, StoredPlan>();
  const reviews: Review[] = [];
  let now = "2026-11-26T10:42:00+08:00";

  function clock() {
    return parseClock(now);
  }

  function fail<T>(error: AppError): Result<T> {
    return { ok: false, error };
  }

  function segmentOf(start: number): Segment {
    if (start < 720) return "morning";
    if (start < 1080) return "afternoon";
    return "evening";
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
    const late = plan.outcome?.type === "done" && parseClock(plan.outcome.at).epochMs > endAt;
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

  function statsOf(selected: StoredPlan[]): ReviewStats {
    let done = 0;
    let skipped = 0;
    let overdue = 0;
    let focusMinutes = 0;
    for (const plan of selected) {
      if (plan.outcome?.type === "done") {
        done += 1;
        focusMinutes += plan.end - plan.start;
      } else if (plan.outcome?.type === "skipped") {
        skipped += 1;
      } else if (statusOf(plan) === "overdue") {
        overdue += 1;
      }
    }
    return { planned: selected.length, done, skipped, overdue, focusMinutes };
  }

  function subtree(id: Id): Set<Id> {
    const ids = new Set<Id>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const goal of goals.values()) {
        if (goal.parentId !== null && ids.has(goal.parentId) && !ids.has(goal.id)) {
          ids.add(goal.id);
          grew = true;
        }
      }
    }
    return ids;
  }

  function plansFor(target: ReviewTarget): StoredPlan[] {
    if (target.type === "segment") {
      return [...plans.values()].filter(
        (plan) => plan.date === target.date && segmentOf(plan.start) === target.segment,
      );
    }
    const ids = subtree(target.goalId);
    return [...plans.values()].filter(
      (plan) => plan.weekGoalId !== null && ids.has(plan.weekGoalId),
    );
  }

  function findSegment(date: string, segment: Segment): Review | undefined {
    return reviews.find(
      (review) =>
        review.target.type === "segment" &&
        review.target.date === date &&
        review.target.segment === segment,
    );
  }

  const driver: ReviewDriver = {
    now: () => now,
    setNow(next) {
      now = parseClock(next).timestamp;
    },
    async createGoal(input) {
      if (input.parentId !== null && !goals.has(input.parentId)) {
        return fail({ code: "invalid_parent", expected: input.level === "week" ? "month" : "year" });
      }
      const goal: StoredGoal = {
        id: uuidV7(clock().epochMs),
        parentId: input.parentId,
        title: input.title,
      };
      goals.set(goal.id, goal);
      return { ok: true, data: { id: goal.id, title: goal.title } };
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
        if (!goal) return fail({ code: "invalid_parent", expected: "week" });
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
        note: fields.note && fields.note.trim() !== "" ? fields.note : null,
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
      const status = statusOf(plan);
      if (status === "upcoming") {
        return fail({
          code: "too_early",
          startsAt: atMinute(plan.date, plan.start, clock().offset),
        });
      }
      if (status === "done" || status === "skipped") {
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
    async listPlans(date) {
      const items = [...plans.values()]
        .filter((plan) => plan.date === date)
        .sort((left, right) => left.start - right.start || left.createdAt.localeCompare(right.createdAt))
        .map(viewPlan);
      return { ok: true, data: items };
    },
    async reschedulePlan(id, date, fields) {
      const plan = plans.get(id);
      if (!plan) return fail({ code: "not_found", entity: "plan", id });
      if (!(fields.start >= 0 && fields.start < fields.end && fields.end <= 1440)) {
        return fail({ code: "validation", field: "start", message: "结束必须晚于开始，且落在当天" });
      }
      if (fields.title.trim() === "") {
        return fail({ code: "validation", field: "title", message: "标题不能为空" });
      }
      if (plan.outcome === null) {
        plan.outcome = { type: "skipped", at: clock().timestamp, reason: `已改期到 ${date}` };
        plan.updatedAt = clock().timestamp;
      }
      const stamp = clock().timestamp;
      const created: StoredPlan = {
        id: uuidV7(clock().epochMs + 1),
        date,
        start: fields.start,
        end: fields.end,
        title: fields.title,
        acceptance: fields.acceptance,
        kind: fields.kind,
        weekGoalId: fields.weekGoalId,
        note: fields.note && fields.note.trim() !== "" ? fields.note : null,
        outcome: null,
        rescheduledFrom: plan.id,
        createdAt: stamp,
        updatedAt: stamp,
      };
      plans.set(created.id, created);
      return {
        ok: true,
        data: { original: viewPlan(plan), created: viewPlan(created), overlaps: [] },
      };
    },
    async copyPlans(planIds, toDate) {
      const copied: PlanView[] = [];
      for (const id of planIds) {
        const plan = plans.get(id);
        if (!plan) return fail({ code: "not_found", entity: "plan", id });
        const stamp = clock().timestamp;
        const created: StoredPlan = {
          id: uuidV7(clock().epochMs + copied.length + 1),
          date: toDate,
          start: plan.start,
          end: plan.end,
          title: plan.title,
          acceptance: plan.acceptance,
          kind: plan.kind,
          weekGoalId: plan.weekGoalId,
          note: null,
          outcome: null,
          rescheduledFrom: null,
          createdAt: stamp,
          updatedAt: stamp,
        };
        plans.set(created.id, created);
        copied.push(viewPlan(created));
      }
      return { ok: true, data: copied };
    },
    async getSegmentReview(date, segment) {
      const found = findSegment(date, segment);
      return { ok: true, data: found ? cloneReview(found) : null };
    },
    async listGoalReviews(goalId) {
      const items = reviews
        .filter((review) => review.target.type === "goal" && review.target.goalId === goalId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(cloneReview);
      return { ok: true, data: items };
    },
    async saveReview(target, note) {
      if (target.type === "goal" && !goals.has(target.goalId)) {
        return fail({ code: "not_found", entity: "goal", id: target.goalId });
      }
      if (target.type === "segment") {
        const startMinute = SEGMENT_START[target.segment];
        const startsAt = atMinute(target.date, startMinute, clock().offset);
        if (parseClock(startsAt).epochMs > clock().epochMs) {
          return fail({ code: "too_early", startsAt });
        }
      }
      const stats = statsOf(plansFor(target));
      const stamp = clock().timestamp;
      if (target.type === "segment") {
        const existing = findSegment(target.date, target.segment);
        if (existing) {
          existing.note = note;
          existing.stats = stats;
          existing.updatedAt = stamp;
          return { ok: true, data: cloneReview(existing) };
        }
      }
      const review: Review = {
        id: uuidV7(clock().epochMs),
        target: target.type === "segment" ? { ...target } : { ...target },
        note,
        stats,
        createdAt: stamp,
        updatedAt: stamp,
      };
      reviews.push(review);
      return { ok: true, data: cloneReview(review) };
    },
    async updateReview(id, note) {
      const review = reviews.find((item) => item.id === id);
      if (!review) return fail({ code: "not_found", entity: "review", id });
      review.note = note;
      review.updatedAt = clock().timestamp;
      return { ok: true, data: cloneReview(review) };
    },
  };

  return driver;
}

function cloneReview(review: Review): Review {
  return {
    id: review.id,
    target: review.target.type === "segment" ? { ...review.target } : { ...review.target },
    note: review.note,
    stats: { ...review.stats },
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

function uuidV7(epochMs: number): string {
  const bytes = randomBytes(16);
  const timestamp = BigInt(Math.max(0, Math.floor(epochMs)));
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
