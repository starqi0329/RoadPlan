import { describe, expect, it } from "vitest";
import { formatMinute, parseTimeInput, statusLabel } from "./format";

describe("formatMinute", () => {
  it("把分钟格式化成 HH:MM", () => {
    expect(formatMinute(0)).toBe("00:00");
    expect(formatMinute(570)).toBe("09:30");
    expect(formatMinute(1440)).toBe("24:00");
  });
});

describe("parseTimeInput", () => {
  it("解析合法时间", () => {
    expect(parseTimeInput("9:30")).toBe(570);
    expect(parseTimeInput("18:00")).toBe(1080);
  });

  it("拒绝非法时间", () => {
    expect(parseTimeInput("25:00")).toBeNull();
    expect(parseTimeInput("10")).toBeNull();
  });
});

describe("statusLabel", () => {
  it("用中文显示后端状态", () => {
    expect(statusLabel("upcoming")).toBe("未开始");
    expect(statusLabel("active")).toBe("进行中");
    expect(statusLabel("overdue")).toBe("已过期");
  });
});
