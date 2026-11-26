import assert from "node:assert/strict";
import { test } from "node:test";

import type { GoalDriver } from "./driver.ts";
import { connectRealDriver } from "./driver.ts";
import { createGoalMock } from "./mock-driver.ts";
import type { GoalMeasure, GoalView } from "./types.ts";
import { minutes, shiftSeconds } from "../plan/time.ts";
import type { PlanFields } from "../plan/types.ts";
import type { Result } from "../plan/types.ts";

/** 契约示例时刻。2026-11-26 是该月第四周。 */
const NOW = "2026-11-26T10:42:00+08:00";
const TODAY = "2026-11-26";
const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REAL_BLOCKED =
  "目标命令尚未合并。当前环境也打不开 Windows 桌面程序，所以真实命令先跳过。";

type Scenario = {
  name: string;
  run: (driver: GoalDriver) => Promise<void>;
};

function openMock(): GoalDriver {
  const driver = createGoalMock();
  driver.setNow(NOW);
  return driver;
}

function count(target = 10): GoalMeasure {
  return { type: "count", target, unit: "次" };
}

function unwrap<T>(result: Result<T>, label: string): T {
  if (!result.ok) {
    assert.fail(`${label} 应成功，实际 ${JSON.stringify(result.error)}`);
  }
  return result.data;
}

function unwrapError(result: Result<unknown>, label: string): { code: string } {
  if (result.ok) assert.fail(`${label} 应失败`);
  return result.error;
}

function core(weekGoalId: string, title: string, start: number, end: number): PlanFields {
  return {
    start,
    end,
    title,
    acceptance: "",
    kind: "core",
    weekGoalId,
    note: null,
  };
}

async function makeYear(
  driver: GoalDriver,
  title: string,
  period = "2026",
  measure: GoalMeasure = count(),
): Promise<GoalView> {
  const goal = unwrap(
    await driver.createGoal({
      level: "year",
      parentId: null,
      period,
      title,
      acceptance: "",
      measure,
    }),
    `新建年目标 ${title}`,
  );
  assert.match(goal.id, UUID_V7);
  return goal;
}

async function makeMonth(
  driver: GoalDriver,
  parentId: string,
  title: string,
  period = "2026-11",
  measure: GoalMeasure = count(),
): Promise<GoalView> {
  return unwrap(
    await driver.createGoal({
      level: "month",
      parentId,
      period,
      title,
      acceptance: "",
      measure,
    }),
    `新建月目标 ${title}`,
  );
}

async function makeWeek(
  driver: GoalDriver,
  parentId: string,
  title: string,
  period = "2026-11-W4",
  measure: GoalMeasure = count(),
): Promise<GoalView> {
  return unwrap(
    await driver.createGoal({
      level: "week",
      parentId,
      period,
      title,
      acceptance: "",
      measure,
    }),
    `新建周目标 ${title}`,
  );
}

async function titles(driver: GoalDriver, level: GoalView["level"] | null = null): Promise<string[]> {
  const goals = unwrap(await driver.listGoals(level, null), "列出目标");
  return goals.map((goal) => goal.title);
}

const scenarios: Scenario[] = [
  {
    name: "年没有上级；月必须挂未删除的年；周必须挂未删除的月",
    async run(driver) {
      const stray = unwrapError(
        await driver.createGoal({
          level: "year",
          parentId: "018f0000-0000-7000-8000-000000000001",
          period: "2026",
          title: "不该有上级的年",
          acceptance: "",
          measure: count(),
        }),
        "年目标带上级",
      );
      assert.ok(stray.code);
      assert.equal((await titles(driver)).includes("不该有上级的年"), false);

      const year = await makeYear(driver, "2026 年");
      assert.equal(year.parentId, null);
      assert.equal(year.childCount, 0);

      assert.equal(
        unwrapError(
          await driver.createGoal({
            level: "month",
            parentId: null,
            period: "2026-11",
            title: "没有年的月",
            acceptance: "",
            measure: count(),
          }),
          "月没有上级",
        ).code,
        "parent_required",
      );

      const month = await makeMonth(driver, year.id, "11 月");
      assert.equal(
        unwrapError(
          await driver.createGoal({
            level: "month",
            parentId: month.id,
            period: "2026-12",
            title: "挂在月下面的月",
            acceptance: "",
            measure: count(),
          }),
          "月的上级不是年",
        ).code,
        "invalid_parent",
      );

      assert.equal(
        unwrapError(
          await driver.createGoal({
            level: "week",
            parentId: null,
            period: "2026-11-W4",
            title: "没有月的周",
            acceptance: "",
            measure: count(),
          }),
          "周没有上级",
        ).code,
        "parent_required",
      );
      assert.equal(
        unwrapError(
          await driver.createGoal({
            level: "week",
            parentId: year.id,
            period: "2026-11-W4",
            title: "直接挂年的周",
            acceptance: "",
            measure: count(),
          }),
          "周的上级不是月",
        ).code,
        "invalid_parent",
      );

      const week = await makeWeek(driver, month.id, "第四周");
      assert.equal(week.parentId, month.id);

      unwrap(await driver.deleteGoal(year.id), "归档整年");
      assert.equal(
        unwrapError(
          await driver.createGoal({
            level: "month",
            parentId: year.id,
            period: "2026-12",
            title: "挂到已删除的年",
            acceptance: "",
            measure: count(),
          }),
          "月挂已删除的年",
        ).code,
        "invalid_parent",
      );
      assert.equal(
        unwrapError(
          await driver.createGoal({
            level: "week",
            parentId: month.id,
            period: "2026-11-W1",
            title: "挂到已删除的月",
            acceptance: "",
            measure: count(),
          }),
          "周挂已删除的月",
        ).code,
        "invalid_parent",
      );
    },
  },
  {
    name: "周期要和层级一致，月属于上级年，周属于上级月",
    async run(driver) {
      const year = await makeYear(driver, "2026 年");
      assert.equal(
        unwrapError(
          await driver.createGoal({
            level: "year",
            parentId: null,
            period: "2026-11",
            title: "年写成了月",
            acceptance: "",
            measure: count(),
          }),
          "年的周期格式不对",
        ).code,
        "validation",
      );
      const month = await makeMonth(driver, year.id, "11 月");
      assert.equal(
        unwrapError(
          await driver.createGoal({
            level: "month",
            parentId: year.id,
            period: "2025-11",
            title: "跑到别的年",
            acceptance: "",
            measure: count(),
          }),
          "月不属于上级年",
        ).code,
        "validation",
      );
      assert.equal(
        unwrapError(
          await driver.createGoal({
            level: "month",
            parentId: year.id,
            period: "2026",
            title: "月写成了年",
            acceptance: "",
            measure: count(),
          }),
          "月的周期格式不对",
        ).code,
        "validation",
      );
      assert.equal(
        unwrapError(
          await driver.createGoal({
            level: "week",
            parentId: month.id,
            period: "2026-12-W1",
            title: "跑到十二月",
            acceptance: "",
            measure: count(),
          }),
          "周不属于上级月",
        ).code,
        "validation",
      );
      assert.equal(
        unwrapError(
          await driver.createGoal({
            level: "week",
            parentId: month.id,
            period: "2026-11-W6",
            title: "第六周",
            acceptance: "",
            measure: count(),
          }),
          "周序号超过 5",
        ).code,
        "validation",
      );
      const week = await makeWeek(driver, month.id, "第四周", "2026-11-W4");
      assert.equal(week.period, "2026-11-W4");
      assert.equal((await titles(driver)).includes("跑到别的年"), false);
    },
  },
  {
    name: "平年二月没有第五周，闰年二月有第五周",
    async run(driver) {
      const common = await makeYear(driver, "2026 年", "2026");
      const february = await makeMonth(driver, common.id, "2026 年 2 月", "2026-02");
      assert.equal(
        unwrapError(
          await driver.createGoal({
            level: "week",
            parentId: february.id,
            period: "2026-02-W5",
            title: "平年第五周",
            acceptance: "",
            measure: count(),
          }),
          "平年二月第五周",
        ).code,
        "validation",
      );
      const fourth = await makeWeek(driver, february.id, "平年第四周", "2026-02-W4");
      assert.equal(fourth.period, "2026-02-W4");

      const leap = await makeYear(driver, "2024 年", "2024");
      const leapFebruary = await makeMonth(driver, leap.id, "2024 年 2 月", "2024-02");
      const fifth = await makeWeek(driver, leapFebruary.id, "闰年第五周", "2024-02-W5");
      assert.equal(fifth.period, "2024-02-W5");
    },
  },
  {
    name: "里程碑进度是完成数除以总数",
    async run(driver) {
      const year = await makeYear(driver, "用里程碑的年", "2026", { type: "milestones" });
      assert.deepEqual(year.progress, { done: 0, total: 0 });
      const added = unwrap(await driver.addMilestone(year.id, "写出提纲"), "添加里程碑");
      assert.deepEqual(added.progress, { done: 0, total: 1 });
      const milestone = added.milestones.find((item) => item.title === "写出提纲");
      assert.ok(milestone);
      assert.notEqual(milestone.state, "done");

      const second = unwrap(await driver.addMilestone(year.id, "交给别人看"), "再添加一个");
      const review = second.milestones.find((item) => item.title === "交给别人看");
      assert.ok(review);
      const doing = unwrap(
        await driver.setMilestoneState(year.id, review.id, "doing"),
        "标成进行中",
      );
      assert.deepEqual(doing.progress, { done: 0, total: 2 });
      const done = unwrap(
        await driver.setMilestoneState(year.id, milestone.id, "done"),
        "完成第一个",
      );
      assert.deepEqual(done.progress, { done: 1, total: 2 });
      const renamed = unwrap(
        await driver.updateMilestone(year.id, milestone.id, "提纲已经写完"),
        "改里程碑标题",
      );
      assert.equal(
        renamed.milestones.find((item) => item.id === milestone.id)?.title,
        "提纲已经写完",
      );
      assert.deepEqual(renamed.progress, { done: 1, total: 2 });
      const removed = unwrap(await driver.removeMilestone(year.id, milestone.id), "删掉已完成的");
      assert.deepEqual(removed.progress, { done: 0, total: 1 });
    },
  },
  {
    name: "累积进度算本目标和下级里已完成的计划，已删除的下级也算",
    async run(driver) {
      const year = await makeYear(driver, "年", "2026", count(8));
      const month = await makeMonth(driver, year.id, "月", "2026-11", count(8));
      const kept = await makeWeek(driver, month.id, "留下的周", "2026-11-W4", count(8));
      const gone = await makeWeek(driver, month.id, "稍后归档的周", "2026-11-W3", count(8));
      const onKept = unwrap(
        await driver.createPlan(TODAY, core(kept.id, "这周完成的", minutes(10, 0), minutes(11, 0))),
        "在留下的周上新建",
      );
      unwrap(await driver.completePlan(onKept.plan.id), "完成留下的周上的计划");
      const onGone = unwrap(
        await driver.createPlan(TODAY, core(gone.id, "归档周上完成的", minutes(8, 0), minutes(9, 0))),
        "在将归档的周上新建",
      );
      unwrap(await driver.completePlan(onGone.plan.id), "完成归档周上的计划");
      unwrap(await driver.deleteGoal(gone.id), "归档其中一周");

      const yearNow = unwrap(await driver.getGoal(year.id), "读取年");
      const monthNow = unwrap(await driver.getGoal(month.id), "读取月");
      const keptNow = unwrap(await driver.getGoal(kept.id), "读取留下的周");
      const goneNow = unwrap(await driver.getGoal(gone.id), "读取已归档的周");
      assert.deepEqual(yearNow.progress, { done: 2, total: 8 });
      assert.deepEqual(monthNow.progress, { done: 2, total: 8 });
      assert.deepEqual(keptNow.progress, { done: 1, total: 8 });
      assert.deepEqual(goneNow.progress, { done: 1, total: 8 });
      assert.equal((await titles(driver, "week")).includes("稍后归档的周"), false);
    },
  },
  {
    name: "没完成和已跳过的计划不计入累积",
    async run(driver) {
      const year = await makeYear(driver, "年");
      const month = await makeMonth(driver, year.id, "月");
      const week = await makeWeek(driver, month.id, "周");
      const skipped = unwrap(
        await driver.createPlan(TODAY, core(week.id, "跳过的", minutes(9, 0), minutes(10, 0))),
        "新建将跳过的计划",
      );
      unwrap(await driver.skipPlan(skipped.plan.id, "今天不做"), "跳过");
      unwrap(
        await driver.createPlan(TODAY, core(week.id, "还没做的", minutes(11, 30), minutes(12, 0))),
        "新建未完成的计划",
      );
      const goal = unwrap(await driver.getGoal(week.id), "读取周");
      assert.deepEqual(goal.progress, { done: 0, total: 10 });
    },
  },
  {
    name: "删除前三个数和执行一致；未结束的计划删掉，历史计划仍挂原目标",
    async run(driver) {
      const year = await makeYear(driver, "年");
      const month = await makeMonth(driver, year.id, "月");
      const week = await makeWeek(driver, month.id, "这一周");
      unwrap(
        await driver.createPlan(TODAY, core(week.id, "还没开始", minutes(11, 30), minutes(12, 0))),
        "未开始，应删除",
      );
      unwrap(
        await driver.createPlan(TODAY, core(week.id, "正在做", minutes(10, 0), minutes(10, 43))),
        "进行中，结束时间还在后面，应删除",
      );
      unwrap(
        await driver.createPlan(TODAY, core(week.id, "已经过点", minutes(9, 0), minutes(10, 0))),
        "已过期未处理，应保留",
      );
      const done = unwrap(
        await driver.createPlan(TODAY, core(week.id, "已经做完", minutes(8, 0), minutes(8, 30))),
        "新建后补完成",
      );
      unwrap(await driver.completePlan(done.plan.id), "补完成");
      const skipped = unwrap(
        await driver.createPlan(TODAY, core(week.id, "已经跳过", minutes(7, 0), minutes(7, 30))),
        "新建后跳过",
      );
      unwrap(await driver.skipPlan(skipped.plan.id, null), "跳过");

      const preview = unwrap(await driver.previewDeleteGoal(week.id), "预览删除");
      assert.deepEqual(preview, { goalsArchived: 1, plansDeleted: 2, plansKept: 3 });
      const executed = unwrap(await driver.deleteGoal(week.id), "执行删除");
      assert.deepEqual(executed, preview);

      const left = unwrap(await driver.listPlans(TODAY), "列出留下的计划");
      assert.deepEqual(
        left.map((plan) => plan.title),
        ["已经跳过", "已经做完", "已经过点"],
      );
      assert.ok(left.every((plan) => plan.weekGoalId === week.id));
      const archived = unwrap(await driver.getGoal(week.id), "读取已归档的周");
      assert.equal(archived.deletedAt, NOW);
      assert.equal((await titles(driver)).includes("这一周"), false);
      const deleted = unwrap(await driver.listDeletedGoals(), "已删除列表");
      assert.equal(
        deleted.some((goal) => goal.id === week.id),
        true,
      );
    },
  },
  {
    name: "结束时间刚好等于现在的未处理计划留下来",
    async run(driver) {
      const year = await makeYear(driver, "年");
      const month = await makeMonth(driver, year.id, "月");
      const week = await makeWeek(driver, month.id, "周");
      unwrap(
        await driver.createPlan(TODAY, core(week.id, "刚好到点", minutes(10, 0), minutes(10, 42))),
        "新建结束时间等于现在的计划",
      );
      const preview = unwrap(await driver.previewDeleteGoal(week.id), "预览");
      assert.deepEqual(preview, { goalsArchived: 1, plansDeleted: 0, plansKept: 1 });
      unwrap(await driver.deleteGoal(week.id), "删除");
      const left = unwrap(await driver.listPlans(TODAY), "列出计划");
      assert.deepEqual(
        left.map((plan) => plan.title),
        ["刚好到点"],
      );
    },
  },
  {
    name: "只预览不会把目标和计划删掉",
    async run(driver) {
      const year = await makeYear(driver, "年");
      const month = await makeMonth(driver, year.id, "月");
      const week = await makeWeek(driver, month.id, "周");
      unwrap(
        await driver.createPlan(TODAY, core(week.id, "还在", minutes(11, 0), minutes(12, 0))),
        "新建",
      );
      unwrap(await driver.previewDeleteGoal(week.id), "预览");
      assert.equal((await titles(driver, "week")).includes("周"), true);
      assert.equal((await unwrap(await driver.listPlans(TODAY), "列出")).length, 1);
    },
  },
  {
    name: "同一批归档用同一个时间；恢复时只带回这一批",
    async run(driver) {
      const year = await makeYear(driver, "年");
      const month = await makeMonth(driver, year.id, "月");
      const early = await makeWeek(driver, month.id, "先归档的周", "2026-11-W3");
      const later = await makeWeek(driver, month.id, "还在的周", "2026-11-W4");
      unwrap(await driver.deleteGoal(early.id), "先归档一周");
      driver.setNow(shiftSeconds(NOW, 1));
      unwrap(await driver.deleteGoal(month.id), "再归档月");

      const earlyGoal = unwrap(await driver.getGoal(early.id), "读取先归档的周");
      const monthGoal = unwrap(await driver.getGoal(month.id), "读取月");
      const laterGoal = unwrap(await driver.getGoal(later.id), "读取后一批的周");
      assert.equal(earlyGoal.deletedAt, NOW);
      assert.equal(monthGoal.deletedAt, shiftSeconds(NOW, 1));
      assert.equal(laterGoal.deletedAt, shiftSeconds(NOW, 1));
      assert.notEqual(earlyGoal.deletedAt, monthGoal.deletedAt);

      const restored = unwrap(await driver.restoreGoal(month.id), "恢复月");
      assert.equal(restored.deletedAt, null);
      assert.equal(unwrap(await driver.getGoal(later.id), "同批的周").deletedAt, null);
      assert.equal(unwrap(await driver.getGoal(early.id), "早一批的周").deletedAt, NOW);
      assert.equal((await titles(driver, "week")).includes("先归档的周"), false);
      assert.equal((await titles(driver, "week")).includes("还在的周"), true);
    },
  },
  {
    name: "上级还在归档里时不能单独恢复下级",
    async run(driver) {
      const year = await makeYear(driver, "年");
      const month = await makeMonth(driver, year.id, "月");
      const week = await makeWeek(driver, month.id, "周");
      unwrap(await driver.deleteGoal(month.id), "连周一起归档");
      const stamp = unwrap(await driver.getGoal(month.id), "读取月").deletedAt;
      assert.equal(unwrap(await driver.getGoal(week.id), "读取周").deletedAt, stamp);
      assert.equal(unwrapError(await driver.restoreGoal(week.id), "上级仍归档时恢复周").code, "validation");
      assert.equal(unwrap(await driver.getGoal(week.id), "周仍归档").deletedAt, stamp);
      unwrap(await driver.restoreGoal(month.id), "恢复月");
      assert.equal(unwrap(await driver.getGoal(week.id), "同批的周一起回来").deletedAt, null);
    },
  },
  {
    name: "恢复目标后，删掉的计划不会回来",
    async run(driver) {
      const year = await makeYear(driver, "年", "2026", count(4));
      const month = await makeMonth(driver, year.id, "月", "2026-11", count(4));
      const week = await makeWeek(driver, month.id, "周", "2026-11-W4", count(4));
      unwrap(
        await driver.createPlan(TODAY, core(week.id, "会被删掉", minutes(11, 0), minutes(12, 0))),
        "未结束的计划",
      );
      const done = unwrap(
        await driver.createPlan(TODAY, core(week.id, "会留下来", minutes(8, 0), minutes(9, 0))),
        "已过期的计划",
      );
      unwrap(await driver.completePlan(done.plan.id), "完成");
      const preview = unwrap(await driver.previewDeleteGoal(week.id), "预览");
      assert.deepEqual(preview, { goalsArchived: 1, plansDeleted: 1, plansKept: 1 });
      unwrap(await driver.deleteGoal(week.id), "归档");
      unwrap(await driver.restoreGoal(week.id), "恢复");
      const left = unwrap(await driver.listPlans(TODAY), "恢复后的计划");
      assert.deepEqual(
        left.map((plan) => plan.title),
        ["会留下来"],
      );
      assert.equal(left[0]?.weekGoalId, week.id);
      assert.deepEqual(unwrap(await driver.getGoal(week.id), "恢复后的周").progress, {
        done: 1,
        total: 4,
      });
      assert.equal(unwrap(await driver.getGoal(week.id), "周").deletedAt, null);
    },
  },
  {
    name: "已删除的目标不在普通列表里，不能改，也不能当新计划的上级",
    async run(driver) {
      const year = await makeYear(driver, "年", "2026", { type: "milestones" });
      const month = await makeMonth(driver, year.id, "月");
      const week = await makeWeek(driver, month.id, "周");
      unwrap(await driver.deleteGoal(week.id), "归档周");
      assert.equal((await titles(driver)).includes("周"), false);
      assert.equal(
        unwrapError(
          await driver.updateGoal(week.id, { title: "想改名", acceptance: "", measure: count() }),
          "编辑已删除目标",
        ).code,
        "validation",
      );
      assert.equal(unwrap(await driver.getGoal(week.id), "仍能读到").title, "周");
      assert.equal(
        unwrapError(await driver.addMilestone(week.id, "新里程碑"), "给已删除目标加里程碑").code,
        "validation",
      );
      assert.equal(
        unwrapError(await driver.setGoalState(week.id, "dropped"), "给已删除目标改状态").code,
        "validation",
      );
      assert.deepEqual(
        unwrapError(
          await driver.createPlan(TODAY, core(week.id, "挂到已删除的周", minutes(10, 0), minutes(11, 0))),
          "核心计划挂已删除的周",
        ),
        { code: "invalid_parent", expected: "week" },
      );
    },
  },
  {
    name: "放弃目标不是删除，下面仍可以挂月目标",
    async run(driver) {
      const year = await makeYear(driver, "先放弃的年");
      const dropped = unwrap(await driver.setGoalState(year.id, "dropped"), "放弃");
      assert.equal(dropped.state, "dropped");
      assert.equal(dropped.deletedAt, null);
      const month = await makeMonth(driver, year.id, "放弃之后的月");
      assert.equal(month.parentId, year.id);
      assert.equal((await titles(driver)).includes("先放弃的年"), true);
      assert.equal(unwrap(await driver.getGoal(year.id), "读取年").childCount, 1);
    },
  },
  {
    name: "有真实周目标时核心计划可以保存，完成后年、月、周都加一",
    async run(driver) {
      const year = await makeYear(driver, "年", "2026", count(5));
      const month = await makeMonth(driver, year.id, "11 月", "2026-11", count(5));
      const week = await makeWeek(driver, month.id, "第四周", "2026-11-W4", count(5));
      assert.deepEqual(
        unwrapError(
          await driver.createPlan(TODAY, {
            start: minutes(10, 0),
            end: minutes(11, 0),
            title: "没选周目标",
            acceptance: "",
            kind: "core",
            weekGoalId: null,
            note: null,
          }),
          "核心计划不选周目标",
        ),
        { code: "parent_required", level: "week" },
      );
      const created = unwrap(
        await driver.createPlan(TODAY, {
          ...core(week.id, "推进年目标", minutes(10, 0), minutes(11, 0)),
          weekGoalId: week.id,
        }),
        "核心计划挂上第四周",
      );
      assert.equal(created.plan.kind, "core");
      assert.equal(created.plan.weekGoalId, week.id);
      assert.equal(created.plan.status, "active");
      unwrap(await driver.completePlan(created.plan.id), "完成");
      assert.deepEqual(unwrap(await driver.getGoal(week.id), "周").progress, { done: 1, total: 5 });
      assert.deepEqual(unwrap(await driver.getGoal(month.id), "月").progress, { done: 1, total: 5 });
      assert.deepEqual(unwrap(await driver.getGoal(year.id), "年").progress, { done: 1, total: 5 });
    },
  },
  {
    name: "从核心计划能串起年、月、周",
    async run(driver) {
      const year = await makeYear(driver, "年目标");
      const month = await makeMonth(driver, year.id, "月目标");
      const week = await makeWeek(driver, month.id, "周目标");
      const created = unwrap(
        await driver.createPlan(TODAY, core(week.id, "今天的核心", minutes(10, 0), minutes(11, 0))),
        "新建核心计划",
      );
      const fromPlan = unwrap(
        await driver.getGoalChain({ type: "plan", id: created.plan.id }),
        "从计划看链路",
      );
      const fromWeek = unwrap(await driver.getGoalChain({ type: "goal", id: week.id }), "从周看链路");
      assert.deepEqual(
        fromPlan.map((goal) => goal.title),
        ["年目标", "月目标", "周目标"],
      );
      assert.deepEqual(
        fromWeek.map((goal) => goal.id),
        [year.id, month.id, week.id],
      );
      const fromMonth = unwrap(await driver.getGoalChain({ type: "goal", id: month.id }), "从月看链路");
      assert.deepEqual(
        fromMonth.map((goal) => goal.title),
        ["年目标", "月目标"],
      );
    },
  },
  {
    name: "直接下级个数不含已删除，也不含孙子",
    async run(driver) {
      const year = await makeYear(driver, "年");
      assert.equal(year.childCount, 0);
      const month = await makeMonth(driver, year.id, "月");
      const week = await makeWeek(driver, month.id, "周");
      assert.equal(unwrap(await driver.getGoal(year.id), "年").childCount, 1);
      assert.equal(unwrap(await driver.getGoal(month.id), "月").childCount, 1);
      unwrap(await driver.deleteGoal(week.id), "归档周");
      assert.equal(unwrap(await driver.getGoal(month.id), "月").childCount, 0);
      assert.equal(unwrap(await driver.getGoal(year.id), "年").childCount, 1);
    },
  },
  {
    name: "可以按层级和周期筛选，已删除的不出现",
    async run(driver) {
      const year = await makeYear(driver, "2026 年");
      const month = await makeMonth(driver, year.id, "11 月");
      await makeWeek(driver, month.id, "第一周", "2026-11-W1");
      const fourth = await makeWeek(driver, month.id, "第四周", "2026-11-W4");
      unwrap(await driver.deleteGoal(fourth.id), "归档第四周");
      const weeks = unwrap(await driver.listGoals("week", null), "只看周");
      assert.deepEqual(
        weeks.map((goal) => goal.title),
        ["第一周"],
      );
      const november = unwrap(await driver.listGoals(null, "2026-11"), "只看 11 月这个周期");
      assert.deepEqual(
        november.map((goal) => goal.title),
        ["11 月"],
      );
      const one = unwrap(await driver.listGoals("week", "2026-11-W1"), "指定某一周");
      assert.deepEqual(
        one.map((goal) => goal.title),
        ["第一周"],
      );
    },
  },
];

const openReal = connectRealDriver();

for (const scenario of scenarios) {
  test(`对照 · ${scenario.name}`, async () => {
    await scenario.run(openMock());
  });

  test(`真实命令 · ${scenario.name}`, { skip: openReal ? false : REAL_BLOCKED }, async () => {
    if (!openReal) return;
    await scenario.run(openReal());
  });
}
