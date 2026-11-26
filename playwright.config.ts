import { defineConfig } from "@playwright/test";

/**
 * 计划规则：tests/plan/acceptance.test.ts
 * 目标与累积：tests/goal/acceptance.test.ts
 * 复盘与明天：tests/review/acceptance.test.ts
 * 都用固定时间，不操作窗口。置顶、透明、拖动留在真机清单。
 * 现在先跑：
 *   node --experimental-strip-types --test tests/plan/acceptance.test.ts
 *   node --experimental-strip-types --test tests/goal/acceptance.test.ts
 *   node --experimental-strip-types --test tests/review/acceptance.test.ts
 * 界面用例以后放进 tests 里的 *.spec.ts，再执行：
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
