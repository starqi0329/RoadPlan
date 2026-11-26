import { describe, expect, it } from "vitest";
import { segmentHasStarted } from "./segments";

describe("segmentHasStarted", () => {
  it("当天未到时段开始则为 false", () => {
    expect(segmentHasStarted("2026-11-26", 700, "2026-11-26", "afternoon")).toBe(false);
    expect(segmentHasStarted("2026-11-26", 700, "2026-11-26", "morning")).toBe(true);
  });

  it("日期晚于复盘日则已开始", () => {
    expect(segmentHasStarted("2026-11-27", 0, "2026-11-26", "evening")).toBe(true);
  });

  it("日期早于复盘日则未开始", () => {
    expect(segmentHasStarted("2026-11-25", 1400, "2026-11-26", "morning")).toBe(false);
  });
});
