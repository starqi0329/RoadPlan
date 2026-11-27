import assert from "node:assert/strict";
import { test } from "node:test";

import { connectRealDriver } from "./pin-capsule-driver.ts";
import { createPinCapsuleMock, type PinCapsuleDriver } from "./pin-capsule-mock.ts";
import type { WindowLayout } from "./types.ts";

const REAL_SKIP = "置顶和胶囊的真机修复尚未合并。当前环境也没有 Windows 桌面，副窗无法查看。";

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }, label: string): T {
  if (!result.ok) assert.fail(`${label} 应成功，实际 ${JSON.stringify(result.error)}`);
  return result.value;
}

async function layoutOf(driver: PinCapsuleDriver): Promise<WindowLayout> {
  return unwrap(await driver.getWindowLayout(), "读取布局");
}

function assertShellUntouched(layout: WindowLayout, before: WindowLayout): void {
  assert.equal(layout.mainCollapsed, false);
  assert.deepEqual(layout.main, before.main);
}

const cases: Array<{ name: string; run: (driver: PinCapsuleDriver) => Promise<void> }> = [
  {
    name: "置顶能打开、关掉、再打开，并且不是胶囊或最小化",
    async run(driver) {
      const before = await layoutOf(driver);
      assert.equal(driver.isPinAlwaysOnTop(), false);

      unwrap(await driver.showPin(), "打开置顶");
      const opened = await layoutOf(driver);
      assert.equal(opened.pinVisible, true);
      assert.equal(opened.capsuleVisible, false);
      assert.equal(driver.isPinAlwaysOnTop(), true);
      assert.equal(driver.isMainVisible(), true);
      assert.equal(driver.isMinimized(), false);
      assert.equal(driver.isInTray(), false);
      assert.equal(driver.isRunning(), true);
      assertShellUntouched(opened, before);

      unwrap(await driver.hidePin(), "关闭置顶");
      assert.equal((await layoutOf(driver)).pinVisible, false);
      assert.equal(driver.isPinAlwaysOnTop(), false);
      assert.equal(driver.isMainVisible(), true);

      unwrap(await driver.showPin(), "再次打开置顶");
      assert.equal((await layoutOf(driver)).pinVisible, true);
      assert.equal(driver.isPinAlwaysOnTop(), true);
      assert.equal((await layoutOf(driver)).capsuleVisible, false);
    },
  },
  {
    name: "胶囊先显示成功再藏主窗；点胶囊后主窗回来",
    async run(driver) {
      const before = await layoutOf(driver);
      unwrap(await driver.hideMainBehindCapsule(), "收到边缘");
      const tucked = await layoutOf(driver);
      assert.equal(tucked.capsuleVisible, true);
      assert.equal(tucked.pinVisible, false);
      assert.equal(driver.isMainVisible(), false);
      assert.equal(driver.isInTray(), true);
      assert.equal(driver.isMinimized(), false);
      assert.equal(driver.isRunning(), true);
      assertShellUntouched(tucked, before);

      unwrap(await driver.showMain(), "点胶囊回到主窗");
      assert.equal(driver.isMainVisible(), true);
      assert.equal(driver.isInTray(), false);
      assert.equal(driver.isRunning(), true);
      assert.equal((await layoutOf(driver)).capsuleVisible, true);

      unwrap(await driver.hideCapsule(), "收起胶囊");
      assert.equal((await layoutOf(driver)).capsuleVisible, false);
      assert.equal(driver.isMainVisible(), true);
    },
  },
  {
    name: "置顶或胶囊打不开时返回错误，主窗还在",
    async run(driver) {
      driver.failNextShow("pin");
      const pinFailed = await driver.showPin();
      assert.equal(pinFailed.ok, false);
      if (!pinFailed.ok) assert.equal(pinFailed.error.code.length > 0, true);
      assert.equal((await layoutOf(driver)).pinVisible, false);
      assert.equal(driver.isPinAlwaysOnTop(), false);
      assert.equal(driver.isMainVisible(), true);
      assert.equal(driver.isRunning(), true);

      driver.failNextShow("capsule");
      const capsuleFailed = await driver.hideMainBehindCapsule();
      assert.equal(capsuleFailed.ok, false);
      if (!capsuleFailed.ok) assert.equal(capsuleFailed.error.code.length > 0, true);
      assert.equal((await layoutOf(driver)).capsuleVisible, false);
      assert.equal(driver.isMainVisible(), true);
      assert.equal(driver.isInTray(), false);
      assert.equal(driver.isRunning(), true);
    },
  },
];

for (const item of cases) {
  test(`对照：${item.name}`, async () => {
    await item.run(createPinCapsuleMock());
  });

  test(`真实命令：${item.name}`, { skip: connectRealDriver() ? false : REAL_SKIP }, async () => {
    const open = connectRealDriver();
    assert.ok(open);
    await item.run(await open());
  });
}
