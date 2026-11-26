import assert from "node:assert/strict";
import { test } from "node:test";

import { connectRealDriver } from "./stability-driver.ts";
import { createStabilityMock, type StabilityDriver } from "./stability-mock.ts";
import type { WindowFrame, WindowLayout } from "./types.ts";
import { isUsableMainFrame, MIN_USABLE_EDGE, OFFSCREEN_ABS } from "./usable-layout.ts";

const REAL_SKIP = "窗口布局校验尚未合并。当前环境也没有 Windows 桌面，折叠、托盘和冷启动后的画面无法查看。";

const GOOD: WindowLayout = {
  main: { x: 320, y: 40, width: 1100, height: 720 },
  pin: null,
  capsule: null,
  mainCollapsed: false,
  pinVisible: false,
  capsuleVisible: false,
};

/** 真机事故档：高 25，坐标约 -16000，并且处于折叠。 */
const INCIDENT: WindowLayout = {
  main: { x: -16000, y: -16000, width: 400, height: 25 },
  pin: null,
  capsule: null,
  mainCollapsed: true,
  pinVisible: false,
  capsuleVisible: false,
};

function frame(partial: Partial<WindowFrame>): WindowFrame {
  return { x: 320, y: 40, width: 1100, height: 720, ...partial };
}

function withMain(main: WindowFrame, mainCollapsed = false): WindowLayout {
  return { ...GOOD, main, mainCollapsed };
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }, label: string): T {
  if (!result.ok) assert.fail(`${label} 应成功，实际 ${JSON.stringify(result.error)}`);
  return result.value;
}

async function layoutOf(driver: StabilityDriver): Promise<WindowLayout> {
  return unwrap(await driver.getWindowLayout(), "读取布局");
}

function assertNotIncident(layout: WindowLayout): void {
  assert.equal(isUsableMainFrame(layout.main), true);
  assert.notEqual(layout.main.height, 25);
  assert.notEqual(layout.main.x, -16000);
  assert.notEqual(layout.main.y, -16000);
  assert.notDeepEqual(layout.main, INCIDENT.main);
}

const cases: Array<{ name: string; run: (driver: StabilityDriver) => Promise<void> }> = [
  {
    name: "折叠再展开，主窗仍是原来那块能用的尺寸",
    async run(driver) {
      unwrap(await driver.saveWindowLayout(GOOD), "保存展开布局");
      unwrap(await driver.setMainCollapsed(true), "折叠");
      const collapsed = await layoutOf(driver);
      assert.equal(collapsed.mainCollapsed, true);
      assert.deepEqual(collapsed.main, GOOD.main);
      assert.equal(isUsableMainFrame(collapsed.main), true);

      unwrap(await driver.setMainCollapsed(false), "展开");
      const expanded = await layoutOf(driver);
      assert.equal(expanded.mainCollapsed, false);
      assert.deepEqual(expanded.main, GOOD.main);
    },
  },
  {
    name: "关进托盘再打开，不会把 25 像素或屏外坐标存成下次的主窗",
    async run(driver) {
      unwrap(await driver.saveWindowLayout(GOOD), "保存展开布局");
      unwrap(await driver.hideMainToTray(), "关闭进托盘");
      assert.equal(driver.isRunning(), true);
      assert.equal(driver.isMainVisible(), false);

      const rejected = await driver.saveWindowLayout(INCIDENT);
      const whileHidden = await layoutOf(driver);
      assertNotIncident(whileHidden);
      if (!rejected.ok) assert.deepEqual(whileHidden, GOOD);

      unwrap(await driver.showMain(), "从托盘打开");
      assert.equal(driver.isRunning(), true);
      assert.equal(driver.isMainVisible(), true);
      const restored = await layoutOf(driver);
      assertNotIncident(restored);
      if (!rejected.ok) assert.deepEqual(restored, GOOD);
    },
  },
  {
    name: "正常展开的布局退出再开还在；坏档启动时退回能用的展开窗",
    async run(driver) {
      unwrap(await driver.saveWindowLayout(GOOD), "保存展开布局");
      unwrap(await driver.quitApp(), "退出");
      assert.equal(driver.isRunning(), false);
      driver.restart();
      assert.equal(driver.isRunning(), true);
      assert.equal(driver.isMainVisible(), true);
      assert.deepEqual(await layoutOf(driver), GOOD);

      driver.plantSaved(INCIDENT);
      driver.restart();
      const recovered = await layoutOf(driver);
      assertNotIncident(recovered);
      assert.equal(recovered.mainCollapsed, false);
    },
  },
  {
    name: "过小、屏外或非有限的主窗不会被静默留下",
    async run(driver) {
      const badFrames = [
        frame({ height: 25 }),
        frame({ width: 25, height: 48 }),
        frame({ height: MIN_USABLE_EDGE - 1 }),
        frame({ x: -16000 }),
        frame({ y: -16000 }),
        frame({ x: OFFSCREEN_ABS, y: 40 }),
        frame({ x: Number.NaN }),
        frame({ height: Number.POSITIVE_INFINITY }),
      ];
      for (const main of badFrames) {
        unwrap(await driver.saveWindowLayout(GOOD), "恢复可用布局");
        assert.equal(isUsableMainFrame(main), false);
        const saved = await driver.saveWindowLayout(withMain(main, true));
        const got = await layoutOf(driver);
        assert.equal(isUsableMainFrame(got.main), true);
        if (saved.ok) assert.notDeepEqual(got.main, main);
        else assert.deepEqual(got, GOOD);
      }

      const edge = frame({ x: -8, width: MIN_USABLE_EDGE, height: MIN_USABLE_EDGE });
      assert.equal(isUsableMainFrame(edge), true);
      unwrap(await driver.saveWindowLayout(withMain(edge)), "保存贴边的小尺寸");
      assert.deepEqual((await layoutOf(driver)).main, edge);
    },
  },
];

for (const item of cases) {
  test(`对照：${item.name}`, async () => {
    await item.run(createStabilityMock());
  });

  test(`真实命令：${item.name}`, { skip: connectRealDriver() ? false : REAL_SKIP }, async () => {
    const open = connectRealDriver();
    assert.ok(open);
    await item.run(await open());
  });
}
