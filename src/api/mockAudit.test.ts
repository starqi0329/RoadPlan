import { beforeEach, describe, expect, it } from "vitest";
import { createPlan, resetMockPlans } from "./mock";
import { listAudit } from "./mockAudit";

describe("mock 操作记录", () => {
  beforeEach(() => {
    resetMockPlans();
  });

  it("新建计划会写入操作记录，并可按 beforeId 翻页", async () => {
    for (let i = 0; i < 3; i += 1) {
      await createPlan("2099-01-01", {
        start: 600 + i * 30,
        end: 630 + i * 30,
        title: `计划${i}`,
        acceptance: "",
        kind: "work",
        weekGoalId: null,
        note: null,
      });
    }
    const first = await listAudit(2, null);
    expect(first.total).toBe(3);
    expect(first.items).toHaveLength(2);
    const more = await listAudit(2, first.items[1]!.id);
    expect(more.items).toHaveLength(1);
    expect(more.items[0]?.entityTitle).toBe("计划0");
  });
});
