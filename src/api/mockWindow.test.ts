import { beforeEach, describe, expect, it } from "vitest";
import {
  getMockWindowUi,
  getWindowLayout,
  hideMainToTray,
  minimizeMain,
  resetMockWindow,
  setMainCollapsed,
  showCapsule,
  showMain,
  showPin,
  unminimizeMain,
} from "./mockWindow";

describe("mock 窗口", () => {
  beforeEach(() => {
    resetMockWindow();
  });

  it("折叠会写入 layout.mainCollapsed", async () => {
    await setMainCollapsed(true);
    expect((await getWindowLayout()).mainCollapsed).toBe(true);
    expect(getMockWindowUi().collapsed).toBe(true);
  });

  it("最小化整窗消失，可恢复，且与托盘隐藏区分", async () => {
    await minimizeMain();
    expect(getMockWindowUi().minimized).toBe(true);
    expect(getMockWindowUi().mainVisible).toBe(true);
    await unminimizeMain();
    expect(getMockWindowUi().minimized).toBe(false);
  });

  it("隐藏主窗后可 showMain 恢复", async () => {
    await hideMainToTray();
    expect(getMockWindowUi().mainVisible).toBe(false);
    await showMain();
    expect(getMockWindowUi().mainVisible).toBe(true);
  });

  it("showPin / showCapsule 打开可见性", async () => {
    await showPin();
    await showCapsule();
    const ui = getMockWindowUi();
    expect(ui.pinVisible).toBe(true);
    expect(ui.capsuleVisible).toBe(true);
  });
});
