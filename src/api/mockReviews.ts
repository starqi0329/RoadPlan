import type { AppError, NowInfo, Review, ReviewStats, ReviewTarget, Segment } from "../bindings";
import { segmentHasStarted, segmentMeta } from "../lib/segments";
import { deriveView } from "./mock";
import {
  goalStore,
  nextReviewId,
  nowInfoFromClock,
  planStore,
  pushAudit,
  reviewStore,
} from "./mockStore";

function segmentKey(date: string, segment: Segment): string {
  return `segment:${date}:${segment}`;
}

function collectDescendantGoalIds(rootId: string): Set<string> {
  const ids = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || ids.has(id)) continue;
    ids.add(id);
    for (const goal of goalStore.values()) {
      if (goal.parentId === id) queue.push(goal.id);
    }
  }
  return ids;
}

function statsForSegment(date: string, segment: Segment, clock: NowInfo): ReviewStats {
  const meta = segmentMeta(segment);
  const plans = [...planStore.values()]
    .filter((plan) => plan.date === date && plan.start >= meta.from && plan.start < meta.to)
    .map((plan) => deriveView(plan, clock));
  return summarize(plans);
}

function statsForGoal(goalId: string, clock: NowInfo): ReviewStats {
  const ids = collectDescendantGoalIds(goalId);
  const plans = [...planStore.values()]
    .filter((plan) => plan.weekGoalId && ids.has(plan.weekGoalId))
    .map((plan) => deriveView(plan, clock));
  return summarize(plans);
}

function summarize(plans: ReturnType<typeof deriveView>[]): ReviewStats {
  let done = 0;
  let skipped = 0;
  let overdue = 0;
  let focusMinutes = 0;
  for (const plan of plans) {
    if (plan.status === "done") {
      done += 1;
      focusMinutes += plan.end - plan.start;
    } else if (plan.status === "skipped") {
      skipped += 1;
    } else if (plan.status === "overdue") {
      overdue += 1;
    }
  }
  return {
    planned: plans.length,
    done,
    skipped,
    overdue,
    focusMinutes,
  };
}

function assertSegmentStarted(date: string, segment: Segment, clock: NowInfo) {
  if (segmentHasStarted(clock.date, clock.minute, date, segment)) return;
  const start = segmentMeta(segment).from;
  const hours = String(Math.floor(start / 60)).padStart(2, "0");
  const mins = String(start % 60).padStart(2, "0");
  throw {
    code: "too_early",
    startsAt: `${date}T${hours}:${mins}:00+08:00`,
  } satisfies AppError;
}

export async function getSegmentReview(date: string, segment: Segment): Promise<Review | null> {
  return reviewStore.get(segmentKey(date, segment)) ?? null;
}

export async function listGoalReviews(goalId: string): Promise<Review[]> {
  return [...reviewStore.values()]
    .filter((review) => review.target.type === "goal" && review.target.goal_id === goalId)
    .sort((a, b) => {
      const byTime = b.createdAt.localeCompare(a.createdAt);
      if (byTime !== 0) return byTime;
      return b.id.localeCompare(a.id);
    });
}

export async function saveReview(target: ReviewTarget, note: string): Promise<Review> {
  const clock = nowInfoFromClock();
  if (target.type === "segment") {
    assertSegmentStarted(target.date, target.segment, clock);
    const key = segmentKey(target.date, target.segment);
    const existing = reviewStore.get(key);
    const stats = statsForSegment(target.date, target.segment, clock);
    if (existing) {
      const updated: Review = {
        ...existing,
        note,
        stats,
        updatedAt: clock.now,
      };
      reviewStore.set(key, updated);
      return updated;
    }
    const created: Review = {
      id: nextReviewId(),
      target,
      note,
      stats,
      createdAt: clock.now,
      updatedAt: clock.now,
    };
    reviewStore.set(key, created);
    pushAudit({
      action: "review",
      entity: "review",
      entityId: created.id,
      entityTitle: `${target.segment} 复盘`,
      summary: `保存时段复盘（${target.date} ${target.segment}）`,
    });
    return created;
  }

  const goal = goalStore.get(target.goal_id);
  if (!goal || goal.deletedAt) {
    throw {
      code: "not_found",
      entity: "goal",
      id: target.goal_id,
    } satisfies AppError;
  }
  const created: Review = {
    id: nextReviewId(),
    target,
    note,
    stats: statsForGoal(target.goal_id, clock),
    createdAt: clock.now,
    updatedAt: clock.now,
  };
  reviewStore.set(created.id, created);
  pushAudit({
    action: "review",
    entity: "review",
    entityId: created.id,
    entityTitle: goal.title,
    summary: `保存目标复盘「${goal.title}」`,
  });
  return created;
}

export async function updateReview(id: string, note: string): Promise<Review> {
  for (const [key, review] of reviewStore.entries()) {
    if (review.id !== id) continue;
    const updated: Review = {
      ...review,
      note,
      updatedAt: nowInfoFromClock().now,
    };
    reviewStore.set(key, updated);
    return updated;
  }
  throw { code: "not_found", entity: "review", id } satisfies AppError;
}
