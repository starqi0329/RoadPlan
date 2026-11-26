import assert from "node:assert/strict";
import { test } from "node:test";

import type { ReviewDriver } from "./driver.ts";
import { connectRealDriver } from "./driver.ts";
import { createReviewMock } from "./mock-driver.ts";
import type { ReviewStats } from "./types.ts";
import { minutes, shiftSeconds } from "../plan/time.ts";
import type { PlanFields, Result } from "../plan/types.ts";

/** 契约示例时刻。上午已经开始，下午 12:00、晚间 18:00 都还没到。 */
const NOW = "2026-11-26T10:42:00+08:00";
const NOON = "2026-11-26T12:00:00+08:00";
const EVENING = "2026-11-26T19:00:00+08:00";
const NIGHT = "2026-11-26T20:00:00+08:00";
const TODAY = "2026-11-26";
const TOMORROW = "2026-11-27";
const YESTERDAY = "2026-11-25";

const REAL_BLOCKED =
  "复盘命令尚未合并。当前环境也打不开 Windows 桌面程序，所以真实命令先跳过。";

const ZERO: ReviewStats = {
  planned: 0,
  done: 0,
  skipped: 0,
  overdue: 0,
  focusMinutes: 0,
};

type Scenario = {
  name: string;
  run: (driver: ReviewDriver) => Promise<void>;
};

function openMock(): ReviewDriver {
  const driver = createReviewMock();
  driver.setNow(NOW);
  return driver;
}

function unwrap<T>(result: Result<T>, label: string): T {
  if (!result.ok) assert.fail(`${label} 应成功，实际 ${JSON.stringify(result.error)}`);
  return result.data;
}

function unwrapError(result: Result<unknown>, label: string): { code: string; startsAt?: string } {
  if (result.ok) assert.fail(`${label} 应失败`);
  return result.error;
}

function work(title: string, start: number, end: number, weekGoalId: string | null = null): PlanFields {
  return {
    start,
    end,
    title,
    acceptance: "",
    kind: weekGoalId ? "core" : "work",
    weekGoalId,
    note: null,
  };
}

async function chain(driver: ReviewDriver, name: string) {
  const year = unwrap(
    await driver.createGoal({ level: "year", parentId: null, period: "2026", title: `${name}年` }),
    "建年",
  );
  const month = unwrap(
    await driver.createGoal({
      level: "month",
      parentId: year.id,
      period: "2026-11",
      title: `${name}月`,
    }),
    "建月",
  );
  const week = unwrap(
    await driver.createGoal({
      level: "week",
      parentId: month.id,
      period: "2026-11-W4",
      title: `${name}周`,
    }),
    "建周",
  );
  return { year, month, week };
}

const scenarios: Scenario[] = [
  {
    name: "时段按开始时间划分，12:00 和 18:00 算下一段",
    async run(driver) {
      driver.setNow(NIGHT);
      const samples: Array<[string, number, number]> = [
        ["零点", minutes(0, 0), minutes(0, 30)],
        ["差一分到中午", minutes(11, 59), minutes(12, 30)],
        ["正中午", minutes(12, 0), minutes(12, 30)],
        ["差一分到傍晚", minutes(17, 59), minutes(18, 30)],
        ["傍晚整点", minutes(18, 0), minutes(18, 30)],
        ["夜里", minutes(23, 0), minutes(23, 30)],
      ];
      for (const [title, start, end] of samples) {
        unwrap(await driver.createPlan(TODAY, work(title, start, end)), `新建 ${title}`);
      }
      const morning = unwrap(
        await driver.saveReview({ type: "segment", date: TODAY, segment: "morning" }, "上午"),
        "保存上午",
      );
      const afternoon = unwrap(
        await driver.saveReview({ type: "segment", date: TODAY, segment: "afternoon" }, "下午"),
        "保存下午",
      );
      const evening = unwrap(
        await driver.saveReview({ type: "segment", date: TODAY, segment: "evening" }, "晚间"),
        "保存晚间",
      );
      assert.equal(morning.stats.planned, 2);
      assert.equal(afternoon.stats.planned, 2);
      assert.equal(evening.stats.planned, 2);
      assert.equal(
        morning.stats.planned + afternoon.stats.planned + evening.stats.planned,
        samples.length,
      );
    },
  },
  {
    name: "10:42 时下午和晚间还没开始，不能保存",
    async run(driver) {
      const afternoon = unwrapError(
        await driver.saveReview({ type: "segment", date: TODAY, segment: "afternoon" }, "下午"),
        "保存下午",
      );
      assert.deepEqual(afternoon, { code: "too_early", startsAt: "2026-11-26T12:00:00+08:00" });
      const evening = unwrapError(
        await driver.saveReview({ type: "segment", date: TODAY, segment: "evening" }, "晚间"),
        "保存晚间",
      );
      assert.deepEqual(evening, { code: "too_early", startsAt: "2026-11-26T18:00:00+08:00" });
      const tomorrowMorning = unwrapError(
        await driver.saveReview({ type: "segment", date: TOMORROW, segment: "morning" }, "明天上午"),
        "保存明天上午",
      );
      assert.deepEqual(tomorrowMorning, {
        code: "too_early",
        startsAt: "2026-11-27T00:00:00+08:00",
      });
      assert.equal(unwrap(await driver.getSegmentReview(TODAY, "afternoon"), "读取下午"), null);
      const morning = unwrap(
        await driver.saveReview({ type: "segment", date: TODAY, segment: "morning" }, "上午可以"),
        "保存今天上午",
      );
      assert.equal(morning.note, "上午可以");
      const yesterdayEvening = unwrap(
        await driver.saveReview(
          { type: "segment", date: YESTERDAY, segment: "evening" },
          "昨天晚上已经开始了",
        ),
        "保存昨天晚间",
      );
      assert.equal(yesterdayEvening.note, "昨天晚上已经开始了");
    },
  },
  {
    name: "刚好到 12:00 可以写下午，晚间仍然不行",
    async run(driver) {
      driver.setNow(NOON);
      const afternoon = unwrap(
        await driver.saveReview({ type: "segment", date: TODAY, segment: "afternoon" }, "刚到点"),
        "保存下午",
      );
      assert.equal(afternoon.note, "刚到点");
      assert.deepEqual(afternoon.stats, ZERO);
      assert.deepEqual(
        unwrapError(
          await driver.saveReview({ type: "segment", date: TODAY, segment: "evening" }, "晚间"),
          "保存晚间",
        ),
        { code: "too_early", startsAt: "2026-11-26T18:00:00+08:00" },
      );
      const morning = unwrap(
        await driver.saveReview({ type: "segment", date: TODAY, segment: "morning" }, "上午更早"),
        "保存上午",
      );
      assert.equal(morning.note, "上午更早");
    },
  },
  {
    name: "同一天同一时段再次保存还是一份，笔记更新，统计按当时重算",
    async run(driver) {
      const firstPlan = unwrap(
        await driver.createPlan(TODAY, work("先过点的", minutes(9, 0), minutes(10, 0))),
        "新建已过期计划",
      );
      const first = unwrap(
        await driver.saveReview({ type: "segment", date: TODAY, segment: "morning" }, "第一次"),
        "第一次保存",
      );
      assert.deepEqual(first.stats, {
        planned: 1,
        done: 0,
        skipped: 0,
        overdue: 1,
        focusMinutes: 0,
      });
      unwrap(await driver.completePlan(firstPlan.plan.id), "补完成第一条");
      unwrap(
        await driver.createPlan(TODAY, work("更早的半小时", minutes(8, 0), minutes(8, 30))),
        "再加一条",
      );
      const added = unwrap(await driver.listPlans(TODAY), "列出");
      const secondPlan = added.find((plan) => plan.title === "更早的半小时");
      assert.ok(secondPlan);
      unwrap(await driver.completePlan(secondPlan.id), "完成第二条");
      const second = unwrap(
        await driver.saveReview({ type: "segment", date: TODAY, segment: "morning" }, "第二次"),
        "第二次保存",
      );
      assert.equal(second.note, "第二次");
      assert.deepEqual(second.stats, {
        planned: 2,
        done: 2,
        skipped: 0,
        overdue: 0,
        focusMinutes: 90,
      });
      const loaded = unwrap(await driver.getSegmentReview(TODAY, "morning"), "读取上午");
      assert.ok(loaded);
      assert.equal(loaded.note, "第二次");
      assert.deepEqual(loaded.stats, second.stats);
    },
  },
  {
    name: "保存之后再改计划，统计不动；只改笔记也不改统计",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(TODAY, work("还没处理", minutes(9, 0), minutes(10, 0))),
        "新建",
      );
      const saved = unwrap(
        await driver.saveReview({ type: "segment", date: TODAY, segment: "morning" }, "先记一笔"),
        "保存",
      );
      assert.equal(saved.stats.overdue, 1);
      assert.equal(saved.stats.done, 0);
      unwrap(await driver.completePlan(created.plan.id), "保存之后才完成");
      const loaded = unwrap(await driver.getSegmentReview(TODAY, "morning"), "再读");
      assert.ok(loaded);
      assert.deepEqual(loaded.stats, saved.stats);
      const edited = unwrap(await driver.updateReview(saved.id, "只改措辞"), "改笔记");
      assert.equal(edited.note, "只改措辞");
      assert.deepEqual(edited.stats, saved.stats);
      assert.equal(edited.id, saved.id);
      const again = unwrap(await driver.getSegmentReview(TODAY, "morning"), "改完再读");
      assert.ok(again);
      assert.equal(again.note, "只改措辞");
      assert.deepEqual(again.stats, saved.stats);
    },
  },
  {
    name: "上午统计只算当天上午的计划，逾期和专注分钟按保存时的状态",
    async run(driver) {
      const done = unwrap(
        await driver.createPlan(TODAY, work("做完的半小时", minutes(8, 0), minutes(8, 30))),
        "新建将完成",
      );
      unwrap(await driver.completePlan(done.plan.id), "完成");
      unwrap(
        await driver.createPlan(TODAY, work("过了点没做", minutes(9, 0), minutes(10, 0))),
        "新建已过期",
      );
      const skipped = unwrap(
        await driver.createPlan(TODAY, work("决定不做", minutes(11, 0), minutes(11, 20))),
        "新建将跳过",
      );
      unwrap(await driver.skipPlan(skipped.plan.id, "先不做"), "跳过");
      unwrap(
        await driver.createPlan(TODAY, work("还没到", minutes(11, 30), minutes(12, 0))),
        "新建未开始",
      );
      unwrap(
        await driver.createPlan(TODAY, work("下午的事", minutes(12, 30), minutes(13, 30))),
        "新建下午",
      );
      unwrap(
        await driver.createPlan(YESTERDAY, work("昨天上午", minutes(9, 0), minutes(10, 0))),
        "新建昨天",
      );
      const saved = unwrap(
        await driver.saveReview({ type: "segment", date: TODAY, segment: "morning" }, "上午这一份"),
        "保存上午",
      );
      assert.deepEqual(saved.stats, {
        planned: 4,
        done: 1,
        skipped: 1,
        overdue: 1,
        focusMinutes: 30,
      });
    },
  },
  {
    name: "目标复盘每次都新加一份，新的在前；改笔记不改统计",
    async run(driver) {
      const { year, week } = await chain(driver, "主");
      const first = unwrap(await driver.saveReview({ type: "goal", goalId: year.id }, "第一份"), "第一份");
      assert.deepEqual(first.stats, ZERO);
      driver.setNow(shiftSeconds(NOW, 1));
      const plan = unwrap(
        await driver.createPlan(TODAY, work("挂在周上", minutes(10, 0), minutes(11, 0), week.id)),
        "新建计划",
      );
      unwrap(await driver.completePlan(plan.plan.id), "完成");
      const second = unwrap(
        await driver.saveReview({ type: "goal", goalId: year.id }, "第二份"),
        "第二份",
      );
      assert.deepEqual(second.stats, {
        planned: 1,
        done: 1,
        skipped: 0,
        overdue: 0,
        focusMinutes: 60,
      });
      assert.notEqual(second.id, first.id);
      const listed = unwrap(await driver.listGoalReviews(year.id), "列出目标复盘");
      assert.deepEqual(
        listed.map((review) => review.note),
        ["第二份", "第一份"],
      );
      assert.deepEqual(listed[1]?.stats, ZERO);
      const edited = unwrap(await driver.updateReview(second.id, "改过"), "改第二份笔记");
      assert.equal(edited.note, "改过");
      assert.deepEqual(edited.stats, second.stats);
      const again = unwrap(await driver.listGoalReviews(year.id), "再列出");
      assert.equal(again.length, 2);
      assert.equal(again[0]?.note, "改过");
      assert.deepEqual(again[0]?.stats, second.stats);
      assert.deepEqual(again[1]?.stats, ZERO);
    },
  },
  {
    name: "目标统计算自己和下级的计划，不算旁边的目标",
    async run(driver) {
      const { year, month, week } = await chain(driver, "甲");
      const other = unwrap(
        await driver.createGoal({
          level: "week",
          parentId: month.id,
          period: "2026-11-W3",
          title: "乙周",
        }),
        "建另一周",
      );
      const long = unwrap(
        await driver.createPlan(TODAY, work("一个半小时", minutes(10, 0), minutes(11, 30), week.id)),
        "甲周完成",
      );
      unwrap(await driver.completePlan(long.plan.id), "完成一个半小时");
      const skipped = unwrap(
        await driver.createPlan(TODAY, work("甲周跳过", minutes(9, 0), minutes(9, 30), week.id)),
        "甲周跳过",
      );
      unwrap(await driver.skipPlan(skipped.plan.id, null), "跳过");
      unwrap(
        await driver.createPlan(TODAY, work("甲周过点", minutes(8, 0), minutes(8, 20), week.id)),
        "甲周过期",
      );
      const otherDone = unwrap(
        await driver.createPlan(TODAY, work("乙周完成", minutes(7, 0), minutes(8, 0), other.id)),
        "乙周完成",
      );
      unwrap(await driver.completePlan(otherDone.plan.id), "完成乙周");
      unwrap(await driver.createPlan(TODAY, work("没挂目标", minutes(10, 0), minutes(11, 0))), "无关计划");

      const weekReview = unwrap(
        await driver.saveReview({ type: "goal", goalId: week.id }, "只看甲周"),
        "甲周复盘",
      );
      assert.deepEqual(weekReview.stats, {
        planned: 3,
        done: 1,
        skipped: 1,
        overdue: 1,
        focusMinutes: 90,
      });
      const monthReview = unwrap(
        await driver.saveReview({ type: "goal", goalId: month.id }, "看整月"),
        "月复盘",
      );
      assert.deepEqual(monthReview.stats, {
        planned: 4,
        done: 2,
        skipped: 1,
        overdue: 1,
        focusMinutes: 150,
      });
      const yearReview = unwrap(
        await driver.saveReview({ type: "goal", goalId: year.id }, "看整年"),
        "年复盘",
      );
      assert.deepEqual(yearReview.stats, monthReview.stats);
    },
  },
  {
    name: "晚间可以把没做完的改到明天，也可以复制到明天",
    async run(driver) {
      driver.setNow(EVENING);
      const done = unwrap(
        await driver.createPlan(TODAY, {
          ...work("今天做完的", minutes(18, 10), minutes(18, 40)),
          note: "只属于今天",
        }),
        "新建已结束的计划",
      );
      unwrap(await driver.completePlan(done.plan.id), "完成");
      const pending = unwrap(
        await driver.createPlan(TODAY, work("今晚还没做", minutes(20, 0), minutes(21, 0))),
        "新建未完成",
      );
      const saved = unwrap(
        await driver.saveReview({ type: "segment", date: TODAY, segment: "evening" }, "晚间复盘"),
        "保存晚间",
      );
      assert.deepEqual(saved.stats, {
        planned: 2,
        done: 1,
        skipped: 0,
        overdue: 0,
        focusMinutes: 30,
      });
      const moved = unwrap(
        await driver.reschedulePlan(
          pending.plan.id,
          TOMORROW,
          work("改到明天", minutes(9, 0), minutes(10, 0)),
        ),
        "改到明天",
      );
      assert.equal(moved.original.date, TODAY);
      assert.deepEqual(moved.original.outcome, {
        type: "skipped",
        at: EVENING,
        reason: "已改期到 2026-11-27",
      });
      assert.equal(moved.created.date, TOMORROW);
      assert.equal(moved.created.outcome, null);
      assert.equal(moved.created.rescheduledFrom, pending.plan.id);
      const copied = unwrap(await driver.copyPlans([done.plan.id], TOMORROW), "复制到明天");
      assert.equal(copied[0]?.date, TOMORROW);
      assert.equal(copied[0]?.outcome, null);
      assert.equal(copied[0]?.note, null);
      assert.equal(copied[0]?.rescheduledFrom, null);
      assert.equal(copied[0]?.title, "今天做完的");
      unwrap(
        await driver.createPlan(TOMORROW, work("新的明天", minutes(15, 0), minutes(16, 0))),
        "直接新建明天",
      );
      const tomorrow = unwrap(await driver.listPlans(TOMORROW), "列出明天");
      assert.deepEqual(
        tomorrow.map((plan) => plan.title),
        ["改到明天", "新的明天", "今天做完的"],
      );
      assert.ok(tomorrow.every((plan) => plan.outcome === null));
      const still = unwrap(await driver.getSegmentReview(TODAY, "evening"), "再读晚间复盘");
      assert.ok(still);
      assert.equal(still.note, "晚间复盘");
      assert.deepEqual(still.stats, saved.stats);
      const today = unwrap(await driver.listPlans(TODAY), "列出今天");
      const originalDone = today.find((plan) => plan.title === "今天做完的");
      assert.equal(originalDone?.outcome?.type, "done");
      assert.equal(originalDone?.note, "只属于今天");
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
