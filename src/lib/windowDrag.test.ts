import { describe, expect, it } from "vitest";
import { pointerMoved } from "./windowDrag";

describe("pointerMoved", () => {
  it("没按下起点时不算移动", () => {
    expect(pointerMoved(null, { x: 10, y: 10 })).toBe(false);
  });

  it("轻微抖动仍算点击", () => {
    expect(pointerMoved({ x: 100, y: 100 }, { x: 104, y: 103 })).toBe(false);
  });

  it("拉开超过阈值算拖动", () => {
    expect(pointerMoved({ x: 100, y: 100 }, { x: 110, y: 100 })).toBe(true);
    expect(pointerMoved({ x: 100, y: 100 }, { x: 100, y: 90 })).toBe(true);
  });
});
