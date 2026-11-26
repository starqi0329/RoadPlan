import type {
  AppError,
  CreateGoalInput,
  DeleteGoalImpact,
  GoalLevel,
  GoalState,
  GoalView,
  MilestoneState,
  UpdateGoalInput,
} from "../bindings";
import {
  cloneMilestones,
  goalStore,
  nextGoalId,
  nextMilestoneId,
  nowInfoFromClock,
  planStore,
  pushAudit,
  type StoredGoal,
} from "./mockStore";

function requireGoal(id: string): StoredGoal {
  const goal = goalStore.get(id);
  if (!goal) {
    throw { code: "not_found", entity: "goal", id } satisfies AppError;
  }
  return goal;
}

function activeChildren(parentId: string): StoredGoal[] {
  return [...goalStore.values()].filter((goal) => goal.parentId === parentId && !goal.deletedAt);
}

function collectSubtree(rootId: string, includeDeleted: boolean): StoredGoal[] {
  const result: StoredGoal[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    const goal = goalStore.get(id);
    if (!goal) continue;
    if (!includeDeleted && goal.deletedAt) continue;
    result.push(goal);
    for (const child of goalStore.values()) {
      if (child.parentId === id && (includeDeleted || !child.deletedAt)) {
        queue.push(child.id);
      }
    }
  }
  return result;
}

function descendantIds(rootId: string): Set<string> {
  return new Set(collectSubtree(rootId, true).map((goal) => goal.id));
}

function progressFor(goal: StoredGoal): { done: number; total: number } {
  if (goal.measure.type === "milestones") {
    const total = goal.milestones.length;
    const done = goal.milestones.filter((item) => item.state === "done").length;
    return { done, total };
  }
  const ids = descendantIds(goal.id);
  let done = 0;
  for (const plan of planStore.values()) {
    if (!plan.weekGoalId || !ids.has(plan.weekGoalId)) continue;
    if (plan.outcome?.type === "done") done += 1;
  }
  return { done, total: goal.measure.target };
}

function toView(goal: StoredGoal): GoalView {
  return {
    ...goal,
    milestones: cloneMilestones(goal.milestones),
    progress: progressFor(goal),
    childCount: activeChildren(goal.id).length,
  };
}

function validateHierarchy(input: CreateGoalInput): void {
  if (input.level === "year") {
    if (input.parentId !== null) {
      throw {
        code: "validation",
        field: "parentId",
        message: "年目标不能有上级",
      } satisfies AppError;
    }
    return;
  }
  if (!input.parentId) {
    throw {
      code: "parent_required",
      level: input.level === "month" ? "year" : "month",
    } satisfies AppError;
  }
  const parent = goalStore.get(input.parentId);
  if (!parent || parent.deletedAt) {
    throw {
      code: "invalid_parent",
      expected: input.level === "month" ? "year" : "month",
    } satisfies AppError;
  }
  if (input.level === "month" && parent.level !== "year") {
    throw { code: "invalid_parent", expected: "year" } satisfies AppError;
  }
  if (input.level === "week" && parent.level !== "month") {
    throw { code: "invalid_parent", expected: "month" } satisfies AppError;
  }
}

function computeImpact(id: string): DeleteGoalImpact {
  const clock = nowInfoFromClock();
  const tree = collectSubtree(id, false);
  const ids = new Set(tree.map((goal) => goal.id));
  let plansDeleted = 0;
  let plansKept = 0;
  for (const plan of planStore.values()) {
    if (!plan.weekGoalId || !ids.has(plan.weekGoalId)) continue;
    const endStamp = `${plan.date}T${String(Math.floor(plan.end / 60)).padStart(2, "0")}:${String(plan.end % 60).padStart(2, "0")}:00+08:00`;
    const untreated = plan.outcome === null;
    const notEnded =
      plan.date > clock.date ||
      (plan.date === clock.date && clock.minute < plan.end) ||
      endStamp > clock.now;
    if (untreated && notEnded) {
      plansDeleted += 1;
    } else {
      plansKept += 1;
    }
  }
  return {
    goalsArchived: tree.length,
    plansDeleted,
    plansKept,
  };
}

export async function listGoals(
  level: GoalLevel | null,
  period: string | null,
): Promise<GoalView[]> {
  return [...goalStore.values()]
    .filter((goal) => !goal.deletedAt)
    .filter((goal) => (level ? goal.level === level : true))
    .filter((goal) => (period ? goal.period === period : true))
    .map(toView)
    .sort((a, b) => a.period.localeCompare(b.period) || a.createdAt.localeCompare(b.createdAt));
}

export async function listDeletedGoals(): Promise<GoalView[]> {
  return [...goalStore.values()]
    .filter((goal) => goal.deletedAt)
    .map(toView)
    .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
}

export async function createGoal(input: CreateGoalInput): Promise<GoalView> {
  if (!input.title.trim()) {
    throw {
      code: "validation",
      field: "title",
      message: "标题不能为空",
    } satisfies AppError;
  }
  validateHierarchy(input);
  const clock = nowInfoFromClock();
  const stored: StoredGoal = {
    id: nextGoalId(),
    level: input.level,
    parentId: input.parentId,
    period: input.period,
    title: input.title.trim(),
    acceptance: input.acceptance,
    measure: input.measure,
    milestones: [],
    state: "active",
    deletedAt: null,
    createdAt: clock.now,
    updatedAt: clock.now,
  };
  goalStore.set(stored.id, stored);
  pushAudit({
    action: "create",
    entity: "goal",
    entityId: stored.id,
    entityTitle: stored.title,
    summary: `新建${stored.level === "year" ? "年" : stored.level === "month" ? "月" : "周"}目标「${stored.title}」`,
  });
  return toView(stored);
}

export async function updateGoal(id: string, input: UpdateGoalInput): Promise<GoalView> {
  const goal = requireGoal(id);
  if (goal.deletedAt) {
    throw {
      code: "validation",
      field: "id",
      message: "已删除的目标不能编辑",
    } satisfies AppError;
  }
  if (!input.title.trim()) {
    throw {
      code: "validation",
      field: "title",
      message: "标题不能为空",
    } satisfies AppError;
  }
  goal.title = input.title.trim();
  goal.acceptance = input.acceptance;
  goal.measure = input.measure;
  goal.updatedAt = nowInfoFromClock().now;
  return toView(goal);
}

export async function setGoalState(id: string, state: GoalState): Promise<GoalView> {
  const goal = requireGoal(id);
  if (goal.deletedAt) {
    throw {
      code: "validation",
      field: "id",
      message: "已删除的目标不能改状态",
    } satisfies AppError;
  }
  goal.state = state;
  goal.updatedAt = nowInfoFromClock().now;
  return toView(goal);
}

export async function previewDeleteGoal(id: string): Promise<DeleteGoalImpact> {
  requireGoal(id);
  return computeImpact(id);
}

export async function deleteGoal(id: string): Promise<DeleteGoalImpact> {
  const goal = requireGoal(id);
  if (goal.deletedAt) {
    throw {
      code: "validation",
      field: "id",
      message: "目标已删除",
    } satisfies AppError;
  }
  const impact = computeImpact(id);
  const clock = nowInfoFromClock();
  const tree = collectSubtree(id, false);
  const ids = new Set(tree.map((item) => item.id));
  for (const item of tree) {
    item.deletedAt = clock.now;
    item.updatedAt = clock.now;
  }
  for (const [planId, plan] of [...planStore.entries()]) {
    if (!plan.weekGoalId || !ids.has(plan.weekGoalId)) continue;
    const untreated = plan.outcome === null;
    const notEnded =
      plan.date > clock.date || (plan.date === clock.date && clock.minute < plan.end);
    if (untreated && notEnded) {
      planStore.delete(planId);
    }
  }
  return impact;
}

export async function restoreGoal(id: string): Promise<GoalView> {
  const goal = requireGoal(id);
  if (!goal.deletedAt) {
    throw {
      code: "validation",
      field: "id",
      message: "目标未删除",
    } satisfies AppError;
  }
  if (goal.parentId) {
    const parent = goalStore.get(goal.parentId);
    if (!parent || parent.deletedAt) {
      throw {
        code: "validation",
        field: "parentId",
        message: "上级仍是删除状态，不能恢复",
      } satisfies AppError;
    }
  }
  const stamp = goal.deletedAt;
  for (const item of goalStore.values()) {
    if (item.deletedAt === stamp) {
      item.deletedAt = null;
      item.updatedAt = nowInfoFromClock().now;
    }
  }
  return toView(requireGoal(id));
}

export async function addMilestone(goalId: string, title: string): Promise<GoalView> {
  const goal = requireGoal(goalId);
  if (goal.deletedAt) {
    throw {
      code: "validation",
      field: "id",
      message: "已删除的目标不能改里程碑",
    } satisfies AppError;
  }
  if (goal.measure.type !== "milestones") {
    throw {
      code: "validation",
      field: "measure",
      message: "只有里程碑型目标能加里程碑",
    } satisfies AppError;
  }
  if (!title.trim()) {
    throw {
      code: "validation",
      field: "title",
      message: "里程碑标题不能为空",
    } satisfies AppError;
  }
  goal.milestones.push({
    id: nextMilestoneId(),
    title: title.trim(),
    state: "todo",
    order: goal.milestones.length,
  });
  goal.updatedAt = nowInfoFromClock().now;
  return toView(goal);
}

export async function setMilestoneState(
  goalId: string,
  milestoneId: string,
  state: MilestoneState,
): Promise<GoalView> {
  const goal = requireGoal(goalId);
  if (goal.deletedAt) {
    throw {
      code: "validation",
      field: "id",
      message: "已删除的目标不能改里程碑",
    } satisfies AppError;
  }
  const milestone = goal.milestones.find((item) => item.id === milestoneId);
  if (!milestone) {
    throw {
      code: "not_found",
      entity: "milestone",
      id: milestoneId,
    } satisfies AppError;
  }
  milestone.state = state;
  goal.updatedAt = nowInfoFromClock().now;
  return toView(goal);
}
