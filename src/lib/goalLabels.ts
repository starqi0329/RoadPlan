import type { GoalLevel, GoalState, MilestoneState } from "../bindings";

export function levelLabel(level: GoalLevel): string {
  if (level === "year") return "年";
  if (level === "month") return "月";
  return "周";
}

export function goalStateLabel(state: GoalState): string {
  if (state === "active") return "进行中";
  if (state === "achieved") return "已达成";
  return "已放弃";
}

export function milestoneStateLabel(state: MilestoneState): string {
  if (state === "todo") return "待办";
  if (state === "doing") return "进行中";
  return "完成";
}
