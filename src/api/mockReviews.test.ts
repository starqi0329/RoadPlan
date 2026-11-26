import { beforeEach, describe, expect, it } from "vitest";
import { createPlan, resetMockPlans } from "./mock";
import { createGoal } from "./mockGoals";
import { getSegmentReview, listGoalReviews, saveReview, updateReview } from "./mockReviews";
import { nowInfoFromClock } from "./mockStore";

describe("mock 复盘", () => {
  beforeEach(() => {
    resetMockPlans();
  });

  it("未到点的时段保存抛 too_early", async () => {
    const futureDate = "2099-06-01";
    await expect(
      saveReview({ type: "segment", date: futureDate, segment: "morning" }, "还早"),
    ).rejects.toMatchObject({ code: "too_early" });
    expect(await getSegmentReview(futureDate, "morning")).toBeNull();
  });

  it("已过时段可保存并冻结统计", async () => {
    const clock = nowInfoFromClock();
    const date = clock.date;
    await createPlan(date, {
      start: 60,
      end: 120,
      title: "早课",
      acceptance: "",
      kind: "work",
      weekGoalId: null,
      note: null,
    });
    const saved = await saveReview({ type: "segment", date, segment: "morning" }, "上午还行");
    expect(saved.note).toBe("上午还行");
    expect(saved.stats.planned).toBe(1);
    const again = await getSegmentReview(date, "morning");
    expect(again?.stats.planned).toBe(1);

    const updated = await updateReview(saved.id, "改了笔记");
    expect(updated.note).toBe("改了笔记");
    expect(updated.stats.planned).toBe(1);
  });

  it("目标复盘可多份且新的在前", async () => {
    const year = await createGoal({
      level: "year",
      parentId: null,
      title: "年目标",
      period: "2099",
      acceptance: "",
      measure: { type: "count", target: 10, unit: "次" },
    });
    const first = await saveReview({ type: "goal", goal_id: year.id }, "第一篇");
    const second = await saveReview({ type: "goal", goal_id: year.id }, "第二篇");
    const listed = await listGoalReviews(year.id);
    expect(listed.map((item) => item.id)).toEqual([second.id, first.id]);
  });
});
