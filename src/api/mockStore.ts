import type { GoalView, Milestone, NowInfo, PlanView } from "../bindings";

export type StoredPlan = Omit<PlanView, "status" | "canComplete" | "editable" | "late">;

export type StoredGoal = Omit<GoalView, "progress" | "childCount">;

export const planStore = new Map<string, StoredPlan>();
export const goalStore = new Map<string, StoredGoal>();

let planSeed = 0;
let goalSeed = 0;
let milestoneSeed = 0;

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

export function nowInfoFromClock(date = new Date()): NowInfo {
  const localDate = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const minute = date.getHours() * 60 + date.getMinutes();
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const tz = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  const stamp = `${localDate}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}${tz}`;
  const week = Math.floor((date.getDate() - 1) / 7) + 1;
  return {
    now: stamp,
    date: localDate,
    minute,
    periods: {
      year: String(date.getFullYear()),
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      week: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-W${week}`,
    },
  };
}

export function resetMockStore(): void {
  planStore.clear();
  goalStore.clear();
  planSeed = 0;
  goalSeed = 0;
  milestoneSeed = 0;
}

export function cloneMilestones(items: Milestone[]): Milestone[] {
  return items.map((item) => ({ ...item }));
}
