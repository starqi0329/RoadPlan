import { defineConfig } from "@playwright/test";

/**
 * 切片 1 的计划规则用例在 tests/plan/acceptance.test.ts，用固定时间，不操作窗口。
 * 仓库还没有安装 Playwright，桌面程序也还没有一天的计划时间轴。
 * 现在先跑：
 *   node --experimental-strip-types --test tests/plan/acceptance.test.ts
 * 界面接上、并且安装了 Playwright 之后，再把点窗口的用例放进 tests 里的 *.spec.ts，然后跑：
 *   pnpm exec playwright test
 * 置顶、透明、拖动不放进自动化，留在真机验收清单。
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    locale: "zh-CN",
  },
});
