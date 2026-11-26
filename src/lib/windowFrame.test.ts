import { describe, expect, it } from "vitest";
import { isCollapsedSized, isSaneExpandedFrame, TITLEBAR_HEIGHT } from "./windowFrame";

describe("windowFrame", () => {
  it("接受正常展开几何", () => {
    expect(isSaneExpandedFrame({ x: 120, y: 80, width: 1100, height: 760 })).toBe(true);
  });

  it("拒绝过小或屏外几何", () => {
    expect(isSaneExpandedFrame({ x: 0, y: 0, width: 200, height: 25 })).toBe(false);
    expect(isSaneExpandedFrame({ x: -16000, y: 0, width: 1100, height: 760 })).toBe(false);
  });

  it("识别折叠矮窗高度", () => {
    expect(isCollapsedSized({ x: 0, y: 0, width: 1100, height: TITLEBAR_HEIGHT })).toBe(true);
    expect(isCollapsedSized({ x: 0, y: 0, width: 1100, height: 760 })).toBe(false);
  });
});
