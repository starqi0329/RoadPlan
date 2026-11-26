import assert from "node:assert/strict";
import { test } from "node:test";
import { connectRealDriver } from "./driver.ts";
import { isWindowLayout } from "./layout.ts";
import { createMockDriver } from "./mock-driver.ts";
import type { WindowDriver, WindowLayout } from "./types.ts";

const REAL_SKIP = "窗口命令未合入，且当前环境没有 Windows 桌面，托盘、置顶、胶囊和拖动无法调用";

const MOVED: WindowLayout = {
  main: { x: 320, y: 40, width: 1100, height: 720 },
  pin: { x: 8, y: 8, width: 280, height: 120 },
  capsule: { x: 1400, y: 200, width: 48, height: 160 },
  mainCollapsed: false,
  pinVisible: false,
  capsuleVisible: false,
};

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  return result.value;
}

const cases: Array<{ name: string; run: (driver: WindowDriver) => Promise<void> }> = [
  {
    name: "布局是契约里的形状；存下来再读，位置原样回来",
    async run(driver) {
      const first = unwrap(await driver.getWindowLayout());
      assert.equal(isWindowLayout(first), true);
      assert.equal(first.main.width > 0, true);
      assert.equal(first.main.height > 0, true);
      assert.notDeepEqual(first, MOVED);

      unwrap(await driver.saveWindowLayout(MOVED));
      assert.deepEqual(unwrap(await driver.getWindowLayout()), MOVED);
    },
  },
  {
    name: "下次启动用上次保存的布局",
    async run(driver) {
      unwrap(await driver.saveWindowLayout(MOVED));
      driver.restart();
      assert.equal(driver.isRunning(), true);
      assert.equal(driver.isMainVisible(), true);
      assert.deepEqual(unwrap(await driver.getWindowLayout()), MOVED);
    },
  },
  {
    name: "关掉主窗进程还在，退出之后进程才结束",
    async run(driver) {
      assert.equal(driver.isRunning(), true);
      assert.equal(driver.isMainVisible(), true);
      const frame = unwrap(await driver.getWindowLayout()).main;

      unwrap(await driver.hideMainToTray());
      assert.equal(driver.isRunning(), true);
      assert.equal(driver.isMainVisible(), false);
      assert.deepEqual(unwrap(await driver.getWindowLayout()).main, frame);

      unwrap(await driver.showMain());
      assert.equal(driver.isRunning(), true);
      assert.equal(driver.isMainVisible(), true);

      unwrap(await driver.quitApp());
      assert.equal(driver.isRunning(), false);
      assert.equal(driver.isMainVisible(), false);
    },
  },
  {
    name: "折叠和展开只改折叠标记",
    async run(driver) {
      const before = unwrap(await driver.getWindowLayout());
      unwrap(await driver.setMainCollapsed(true));
      const collapsed = unwrap(await driver.getWindowLayout());
      assert.equal(collapsed.mainCollapsed, true);
      assert.deepEqual(collapsed.main, before.main);

      unwrap(await driver.setMainCollapsed(false));
      const expanded = unwrap(await driver.getWindowLayout());
      assert.equal(expanded.mainCollapsed, false);
      assert.deepEqual(expanded.main, before.main);
    },
  },
  {
    name: "置顶和胶囊能打开再关掉，拖动不改布局",
    async run(driver) {
      unwrap(await driver.showPin());
      assert.equal(unwrap(await driver.getWindowLayout()).pinVisible, true);
      unwrap(await driver.hidePin());
      assert.equal(unwrap(await driver.getWindowLayout()).pinVisible, false);

      unwrap(await driver.showCapsule());
      assert.equal(unwrap(await driver.getWindowLayout()).capsuleVisible, true);
      unwrap(await driver.hideCapsule());
      assert.equal(unwrap(await driver.getWindowLayout()).capsuleVisible, false);

      const before = unwrap(await driver.getWindowLayout());
      unwrap(await driver.setDragging(true));
      unwrap(await driver.setDragging(false));
      assert.deepEqual(unwrap(await driver.getWindowLayout()), before);
    },
  },
  {
    name: "三个窗口都开着时都会收到变更，关掉的窗口不再收到",
    async run(driver) {
      unwrap(await driver.showPin());
      unwrap(await driver.showCapsule());
      const got = { main: 0, pin: 0, capsule: 0 };
      driver.onDataChanged("main", (event) => {
        assert.equal(event.entities.includes("plan"), true);
        got.main += 1;
      });
      driver.onDataChanged("pin", (event) => {
        assert.equal(event.entities.includes("plan"), true);
        got.pin += 1;
      });
      driver.onDataChanged("capsule", (event) => {
        assert.equal(event.entities.includes("plan"), true);
        got.capsule += 1;
      });

      unwrap(await driver.createPlan("上午的安排"));
      assert.deepEqual(got, { main: 1, pin: 1, capsule: 1 });

      unwrap(await driver.hideCapsule());
      unwrap(await driver.createPlan("再记一条"));
      assert.deepEqual(got, { main: 2, pin: 2, capsule: 1 });
    },
  },
];

for (const item of cases) {
  test(`对照：${item.name}`, async () => {
    await item.run(createMockDriver());
  });

  test(`真实命令：${item.name}`, { skip: connectRealDriver() ? false : REAL_SKIP }, async () => {
    const open = connectRealDriver();
    assert.ok(open);
    await item.run(await open());
  });
}
