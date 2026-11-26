import { isTauri } from "@tauri-apps/api/core";
import {
  commands,
  type CreateGoalInput,
  type DeleteGoalImpact,
  type GoalLevel,
  type GoalState,
  type GoalView,
  type MilestoneState,
  type UpdateGoalInput,
} from "../bindings";
import * as mockGoals from "./mockGoals";
import { unwrapResult } from "./result";

export async function listGoals(
  level: GoalLevel | null,
  period: string | null,
): Promise<GoalView[]> {
  if (!isTauri()) return mockGoals.listGoals(level, period);
  return unwrapResult(await commands.listGoals(level, period));
}

export async function listDeletedGoals(): Promise<GoalView[]> {
  if (!isTauri()) return mockGoals.listDeletedGoals();
  return unwrapResult(await commands.listDeletedGoals());
}

export async function createGoal(input: CreateGoalInput): Promise<GoalView> {
  if (!isTauri()) return mockGoals.createGoal(input);
  return unwrapResult(await commands.createGoal(input));
}

export async function updateGoal(id: string, input: UpdateGoalInput): Promise<GoalView> {
  if (!isTauri()) return mockGoals.updateGoal(id, input);
  return unwrapResult(await commands.updateGoal(id, input));
}

export async function setGoalState(id: string, state: GoalState): Promise<GoalView> {
  if (!isTauri()) return mockGoals.setGoalState(id, state);
  return unwrapResult(await commands.setGoalState(id, state));
}

export async function previewDeleteGoal(id: string): Promise<DeleteGoalImpact> {
  if (!isTauri()) return mockGoals.previewDeleteGoal(id);
  return unwrapResult(await commands.previewDeleteGoal(id));
}

export async function deleteGoal(id: string): Promise<DeleteGoalImpact> {
  if (!isTauri()) return mockGoals.deleteGoal(id);
  return unwrapResult(await commands.deleteGoal(id));
}

export async function restoreGoal(id: string): Promise<GoalView> {
  if (!isTauri()) return mockGoals.restoreGoal(id);
  return unwrapResult(await commands.restoreGoal(id));
}

export async function addMilestone(goalId: string, title: string): Promise<GoalView> {
  if (!isTauri()) return mockGoals.addMilestone(goalId, title);
  return unwrapResult(await commands.addMilestone(goalId, title));
}

export async function setMilestoneState(
  goalId: string,
  milestoneId: string,
  state: MilestoneState,
): Promise<GoalView> {
  if (!isTauri()) {
    return mockGoals.setMilestoneState(goalId, milestoneId, state);
  }
  return unwrapResult(await commands.setMilestoneState(goalId, milestoneId, state));
}
