import { beforeEach, describe, expect, it } from "vitest";
import { completePlan, createPlan, listPlans, resetMockPlans, skipPlan } from "./mock";

describe("mock 计划", () => {
  beforeEach(() => {
    resetMockPlans();
  });

  it("新建后能在列表里看到，并用返回字段带状态", async () => {
    const date = "2099-01-01";
    const saved = await createPlan(date, {
      start: 600,
      end: 660,
      title: "未来计划",
      acceptance: "",
      kind: "work",
      weekGoalId: null,
      note: null,
    });
    expect(saved.plan.title).toBe("未来计划");
    expect(saved.plan.status).toBe("upcoming");
    expect(saved.plan.canComplete).toBe(false);

    const listed = await listPlans(date);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.canComplete).toBe(false);
  });

  it("重叠只提示不阻止保存", async () => {
    const date = "2099-01-02";
    await createPlan(date, {
      start: 600,
      end: 700,
      title: "甲",
      acceptance: "",
      kind: "routine",
      weekGoalId: null,
      note: null,
    });
    const second = await createPlan(date, {
      start: 650,
      end: 720,
      title: "乙",
      acceptance: "",
      kind: "work",
      weekGoalId: null,
      note: null,
    });
    expect(second.overlaps).toHaveLength(1);
    expect(second.overlaps[0]?.title).toBe("甲");
  });

  it("未开始不能完成；未处理可以跳过", async () => {
    const date = "2099-01-03";
    const saved = await createPlan(date, {
      start: 600,
      end: 660,
      title: "稍后",
      acceptance: "",
      kind: "work",
      weekGoalId: null,
      note: null,
    });

    await expect(completePlan(saved.plan.id)).rejects.toMatchObject({
      code: "too_early",
    });

    const skipped = await skipPlan({ id: saved.plan.id, reason: null });
    expect(skipped.status).toBe("skipped");
  });
});
