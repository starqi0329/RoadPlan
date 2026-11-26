import { beforeEach, describe, expect, it } from "vitest";
import { createPlan, resetMockPlans } from "./mock";
import {
  createGoal,
  deleteGoal,
  listDeletedGoals,
  listGoals,
  previewDeleteGoal,
  restoreGoal,
} from "./mockGoals";

describe("mock 目标", () => {
  beforeEach(() => {
    resetMockPlans();
  });

  it("能建年/月/周目标并看到进度字段", async () => {
    const year = await createGoal({
      level: "year",
      parentId: null,
      period: "2099",
      title: "年目标",
      acceptance: "",
      measure: { type: "milestones" },
    });
    const month = await createGoal({
      level: "month",
      parentId: year.id,
      period: "2099-01",
      title: "月目标",
      acceptance: "",
      measure: { type: "count", target: 2, unit: "次" },
    });
    const week = await createGoal({
      level: "week",
      parentId: month.id,
      period: "2099-01-W1",
      title: "周目标",
      acceptance: "",
      measure: { type: "count", target: 2, unit: "次" },
    });

    expect(week.progress).toEqual({ done: 0, total: 2 });
    const listed = await listGoals(null, null);
    expect(listed).toHaveLength(3);
  });

  it("删除前返回三数，确认后可恢复", async () => {
    const year = await createGoal({
      level: "year",
      parentId: null,
      period: "2099",
      title: "年",
      acceptance: "",
      measure: { type: "milestones" },
    });
    const preview = await previewDeleteGoal(year.id);
    expect(preview.goalsArchived).toBe(1);

    await deleteGoal(year.id);
    expect(await listGoals(null, null)).toHaveLength(0);
    expect(await listDeletedGoals()).toHaveLength(1);

    await restoreGoal(year.id);
    expect(await listGoals(null, null)).toHaveLength(1);
  });

  it("核心计划必须挂未删除周目标", async () => {
    await expect(
      createPlan("2099-01-01", {
        start: 600,
        end: 660,
        title: "核心",
        acceptance: "",
        kind: "core",
        weekGoalId: null,
        note: null,
      }),
    ).rejects.toMatchObject({ code: "parent_required" });
  });
});
