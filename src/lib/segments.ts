import type { PlanView, Segment } from "../bindings";

export type DaySegment = {
  key: Segment;
  name: string;
  range: string;
  from: number;
  to: number;
};

export const DAY_SEGMENTS: DaySegment[] = [
  { key: "morning", name: "上午", range: "00:00 – 12:00", from: 0, to: 720 },
  {
    key: "afternoon",
    name: "下午",
    range: "12:00 – 18:00",
    from: 720,
    to: 1080,
  },
  { key: "evening", name: "晚间", range: "18:00 – 24:00", from: 1080, to: 1440 },
];

export function segmentOfStart(start: number): Segment {
  if (start < 720) return "morning";
  if (start < 1080) return "afternoon";
  return "evening";
}

export function groupPlansBySegment(
  plans: PlanView[],
): { segment: DaySegment; plans: PlanView[] }[] {
  return DAY_SEGMENTS.map((segment) => ({
    segment,
    plans: plans.filter((plan) => plan.start >= segment.from && plan.start < segment.to),
  })).filter((group) => group.plans.length > 0);
}
