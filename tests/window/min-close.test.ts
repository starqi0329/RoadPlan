import assert from "node:assert/strict";
import { test } from "node:test";

import { connectRealDriver } from "./min-close-driver.ts";
import { createMinCloseMock, type MinCloseDriver } from "./min-close-mock.ts";
import type { WindowLayout } from "./types.ts";

const REAL_SKIP =
  "最小化尚未写入契约，关闭进托盘的重复恢复也还不能在这台没有 Windows 桌面的环境里点。";

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }, label: string): T {
  if (!result.ok) assert.fail(`${label} 应成功，实际 ${JSON.stringify(result.error)}`);
  return result.value;
}

async function shell(driver: MinCloseDriver): Promise<WindowLayout> {
  return unwrap(await driver.getWindowLayout(), "读取布局");
}

function assertFullShell(layout: WindowLayout, before: WindowLayout): void {
  assert.equal(layout.mainCollapsed, false);
  assert.equal(layout.pinVisible, false);
  assert.equal(layout.capsuleVisible, false);
  assert.deepEqual(layout.main, before.main);
}

const cases: Array<{ name: string; run: (driver: MinCloseDriver) => Promise<void> }> = [
  {
    name: "最小化不是进托盘，也不是折叠；从任务栏恢复后主窗还是完整的",
    async run(driver) {
      const before = await shell(driver);
      assert.equal(driver.isMainVisible(), true);
      assert.equal(driver.isMinimized(), false);
      assert.equal(driver.isInTray(), false);

      unwrap(await driver.minimizeMain(), "最小化");
      assert.equal(driver.isRunning(), true);
      assert.equal(driver.isMainVisible(), false);
      assert.equal(driver.isMinimized(), true);
      assert.equal(driver.isInTray(), false);
      assertFullShell(await shell(driver), before);

      unwrap(await driver.restoreMainFromTaskbar(), "从任务栏恢复");
      assert.equal(driver.isRunning(), true);
      assert.equal(driver.isMainVisible(), true);
      assert.equal(driver.isMinimized(), false);
      assert.equal(driver.isInTray(), false);
      assertFullShell(await shell(driver), before);
    },
  },
  {
    name: "关闭进托盘可以重复，退出才结束进程",
    async run(driver) {
      const before = await shell(driver);

      unwrap(await driver.hideMainToTray(), "第一次关闭");
      assert.equal(driver.isRunning(), true);
      assert.equal(driver.isMainVisible(), false);
      assert.equal(driver.isInTray(), true);
      assert.equal(driver.isMinimized(), false);
      assertFullShell(await shell(driver), before);

      unwrap(await driver.hideMainToTray(), "已经在托盘时再关一次");
      assert.equal(driver.isRunning(), true);
      assert.equal(driver.isInTray(), true);
      assert.equal(driver.isMinimized(), false);

      unwrap(await driver.showMain(), "从托盘打开");
      assert.equal(driver.isMainVisible(), true);
      assert.equal(driver.isInTray(), false);
      assert.equal(driver.isMinimized(), false);
      assertFullShell(await shell(driver), before);

      unwrap(await driver.hideMainToTray(), "第二次关闭");
      assert.equal(driver.isRunning(), true);
      assert.equal(driver.isMainVisible(), false);
      assert.equal(driver.isInTray(), true);
      assert.equal(driver.isMinimized(), false);

      unwrap(await driver.showMain(), "再次打开");
      unwrap(await driver.quitApp(), "托盘退出");
      assert.equal(driver.isRunning(), false);
      assert.equal(driver.isMainVisible(), false);
      assert.equal(driver.isInTray(), false);
      assert.equal(driver.isMinimized(), false);
    },
  },
  {
    name: "最小化之后从托盘打开，主窗恢复，关闭仍然有效",
    async run(driver) {
      const before = await shell(driver);
      unwrap(await driver.minimizeMain(), "最小化");
      unwrap(await driver.showMain(), "托盘打开");
      assert.equal(driver.isRunning(), true);
      assert.equal(driver.isMainVisible(), true);
      assert.equal(driver.isMinimized(), false);
      assert.equal(driver.isInTray(), false);
      assertFullShell(await shell(driver), before);

      unwrap(await driver.hideMainToTray(), "打开后再关闭");
      assert.equal(driver.isRunning(), true);
      assert.equal(driver.isMainVisible(), false);
      assert.equal(driver.isInTray(), true);
      assert.equal(driver.isMinimized(), false);
      assertFullShell(await shell(driver), before);
    },
  },
];

for (const item of cases) {
  test(`对照：${item.name}`, async () => {
    await item.run(createMinCloseMock());
  });

  test(`真实命令：${item.name}`, { skip: connectRealDriver() ? false : REAL_SKIP }, async () => {
    const open = connectRealDriver();
    assert.ok(open);
    await item.run(await open());
  });
}
