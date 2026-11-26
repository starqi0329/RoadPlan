import type { PlanFields, PlanView } from "../bindings";

export function fieldsFromPlan(plan: PlanView): PlanFields {
  return {
    start: plan.start,
    end: plan.end,
    title: plan.title,
    acceptance: plan.acceptance,
    kind: plan.kind,
    weekGoalId: plan.weekGoalId,
    note: plan.note,
  };
}
