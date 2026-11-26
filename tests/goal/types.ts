/** 契约 0.2.1 里目标命令用到的形状。不从产品源码推导。 */

import type { Result } from "../plan/types.ts";

export type { Result };

export type Id = string;
export type Period = string;
export type Timestamp = string;

export type GoalLevel = "year" | "month" | "week";
export type GoalState = "active" | "achieved" | "dropped";
export type MilestoneState = "todo" | "doing" | "done";

export type GoalMeasure =
  | { type: "milestones" }
  | { type: "count"; target: number; unit: string };

export type Milestone = {
  id: Id;
  title: string;
  state: MilestoneState;
  order: number;
};

export type GoalView = {
  id: Id;
  level: GoalLevel;
  parentId: Id | null;
  period: Period;
  title: string;
  acceptance: string;
  measure: GoalMeasure;
  milestones: Milestone[];
  state: GoalState;
  deletedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  progress: { done: number; total: number };
  childCount: number;
};

export type CreateGoalInput = {
  level: GoalLevel;
  parentId: Id | null;
  period: Period;
  title: string;
  acceptance: string;
  measure: GoalMeasure;
};

export type UpdateGoalInput = {
  title: string;
  acceptance: string;
  measure: GoalMeasure;
};

export type DeleteGoalImpact = {
  goalsArchived: number;
  plansDeleted: number;
  plansKept: number;
};

export type ChainTarget = { type: "plan"; id: Id } | { type: "goal"; id: Id };
