import { defineConfig } from "@playwright/test";

/**
 * 计划规则：tests/plan/acceptance.test.ts
 * 目标与累积：tests/goal/acceptance.test.ts
 * 复盘与明天：tests/review/acceptance.test.ts
 * 窗口布局与关闭进托盘：tests/window/acceptance.test.ts
 * 主窗坏档不再变成空壳：tests/window/layout-stability.test.ts
 * 操作记录翻页：tests/audit/acceptance.test.ts
 * 计划、目标、复盘、操作记录用固定时间。置顶、透明、拖动和无系统标题栏留在真机清单。
 * 现在先跑：
 *   node --experimental-strip-types --test tests/plan/acceptance.test.ts
 *   node --experimental-strip-types --test tests/goal/acceptance.test.ts
 *   node --experimental-strip-types --test tests/review/acceptance.test.ts
 *   node --experimental-strip-types --test tests/window/acceptance.test.ts
 *   node --experimental-strip-types --test tests/window/layout-stability.test.ts
 *   node --experimental-strip-types --test tests/audit/acceptance.test.ts
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
