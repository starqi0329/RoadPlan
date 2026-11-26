import type { PlanKind, PlanStatus } from "../bindings";

export function formatMinute(minute: number): string {
  const clamped = Math.max(0, Math.min(1440, minute));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function parseTimeInput(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(mins)) return null;
  if (hours < 0 || hours > 24 || mins < 0 || mins > 59) return null;
  if (hours === 24 && mins !== 0) return null;
  return hours * 60 + mins;
}

export function statusLabel(status: PlanStatus): string {
  switch (status) {
    case "upcoming":
      return "未开始";
    case "active":
      return "进行中";
    case "overdue":
      return "已过期";
    case "done":
      return "已完成";
    case "skipped":
      return "已跳过";
  }
}

export function kindLabel(kind: PlanKind): string {
  switch (kind) {
    case "core":
      return "核心";
    case "work":
      return "工作";
    case "routine":
      return "日常";
    case "review":
      return "复盘";
  }
}

export function formatDateHeading(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;
  return `${match[1]}.${match[2]}.${match[3]}`;
}
