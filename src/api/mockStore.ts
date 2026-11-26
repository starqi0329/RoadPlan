import type {
  AuditAction,
  AuditEntity,
  AuditEvent,
  GoalView,
  Milestone,
  NowInfo,
  PlanView,
  Review,
} from "../bindings";

export type StoredPlan = Omit<PlanView, "status" | "canComplete" | "editable" | "late">;

export type StoredGoal = Omit<GoalView, "progress" | "childCount">;

export const planStore = new Map<string, StoredPlan>();
export const goalStore = new Map<string, StoredGoal>();
export const reviewStore = new Map<string, Review>();
export const auditStore: AuditEvent[] = [];

let planSeed = 0;
let goalSeed = 0;
let milestoneSeed = 0;
let reviewSeed = 0;
let auditSeed = 0;

const auditListeners = new Set<() => void>();

export function subscribeAudit(listener: () => void): () => void {
  auditListeners.add(listener);
  return () => auditListeners.delete(listener);
}

function emitAudit() {
  for (const listener of auditListeners) listener();
}

export function nextAuditId(): string {
  auditSeed += 1;
  return `mock-audit-${String(auditSeed).padStart(4, "0")}`;
}

export function pushAudit(input: {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityTitle: string;
  summary: string;
}): AuditEvent {
  const clock = nowInfoFromClock();
  const event: AuditEvent = {
    id: nextAuditId(),
    at: clock.now,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    entityTitle: input.entityTitle,
    summary: input.summary,
  };
  auditStore.push(event);
  emitAudit();
  return event;
}

export function nextPlanId(): string {
  planSeed += 1;
  return `mock-plan-${String(planSeed).padStart(4, "0")}`;
}

export function nextGoalId(): string {
  goalSeed += 1;
  return `mock-goal-${String(goalSeed).padStart(4, "0")}`;
}

export function nextMilestoneId(): string {
  milestoneSeed += 1;
  return `mock-ms-${String(milestoneSeed).padStart(4, "0")}`;
}

export function nextReviewId(): string {
  reviewSeed += 1;
  return `mock-review-${String(reviewSeed).padStart(4, "0")}`;
}

/** 浏览器截图/演示可写入 sessionStorage「roadplan-mock-now」(ISO 字符串) 固定时钟。 */
function resolveClock(date?: Date): Date {
  if (date) return date;
  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem("roadplan-mock-now");
      if (raw) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }
    } catch {
      // 忽略不可用的 storage
    }
  }
  return new Date();
}

export function nowInfoFromClock(date?: Date): NowInfo {
  const clock = resolveClock(date);
  const localDate = [
    clock.getFullYear(),
    String(clock.getMonth() + 1).padStart(2, "0"),
    String(clock.getDate()).padStart(2, "0"),
  ].join("-");
  const minute = clock.getHours() * 60 + clock.getMinutes();
  const offset = -clock.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const tz = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  const stamp = `${localDate}T${String(clock.getHours()).padStart(2, "0")}:${String(clock.getMinutes()).padStart(2, "0")}:${String(clock.getSeconds()).padStart(2, "0")}${tz}`;
  const week = Math.floor((clock.getDate() - 1) / 7) + 1;
  return {
    now: stamp,
    date: localDate,
    minute,
    periods: {
      year: String(clock.getFullYear()),
      month: `${clock.getFullYear()}-${String(clock.getMonth() + 1).padStart(2, "0")}`,
      week: `${clock.getFullYear()}-${String(clock.getMonth() + 1).padStart(2, "0")}-W${week}`,
    },
  };
}

export function resetMockStore(): void {
  planStore.clear();
  goalStore.clear();
  reviewStore.clear();
  auditStore.length = 0;
  planSeed = 0;
  goalSeed = 0;
  milestoneSeed = 0;
  reviewSeed = 0;
  auditSeed = 0;
  emitAudit();
}

export function cloneMilestones(items: Milestone[]): Milestone[] {
  return items.map((item) => ({ ...item }));
}
