import assert from "node:assert/strict";
import { test } from "node:test";

import { connectRealDriver, type PlanDriver } from "./driver.ts";
import { createMockDriver } from "./mock-driver.ts";
import { atMinute, minutes, parseClock, shiftSeconds } from "./time.ts";
import type { AppError, PlanFields, PlanStatus, PlanView, Result } from "./types.ts";

/** 契约示例里的时刻。所有用例都用它，不等真实时间流逝。 */
const NOW = "2026-11-26T10:42:00+08:00";
const TODAY = "2026-11-26";
const TOMORROW = "2026-11-27";
const YESTERDAY = "2026-11-25";
const MISSING_ID = "018f0000-0000-7000-8000-000000000001";
const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REAL_BLOCKED =
  "后端计划命令尚未合并。契约写明这些命令仍返回未实现，当前环境也打不开 Windows 桌面程序。";

type Scenario = {
  name: string;
  run: (driver: PlanDriver) => Promise<void>;
};

function openMock(): PlanDriver {
  const driver = createMockDriver();
  driver.setNow(NOW);
  return driver;
}

function work(
  overrides: Partial<PlanFields> & Pick<PlanFields, "start" | "end" | "title">,
): PlanFields {
  return {
    acceptance: "",
    kind: "work",
    weekGoalId: null,
    note: null,
    ...overrides,
  };
}

function unwrap<T>(result: Result<T>, label: string): T {
  if (!result.ok) {
    assert.fail(`${label} 应成功，实际 ${JSON.stringify(result.error)}`);
  }
  return result.data;
}

function unwrapError(result: Result<unknown>, label: string): AppError {
  if (result.ok) {
    assert.fail(`${label} 应失败`);
  }
  return result.error;
}

function assertUuid(id: string): void {
  assert.match(id, UUID_V7);
}

function assertFlags(
  plan: PlanView,
  expected: { status: PlanStatus; canComplete: boolean; editable: boolean; late: boolean },
): void {
  assert.deepEqual(
    {
      status: plan.status,
      canComplete: plan.canComplete,
      editable: plan.editable,
      late: plan.late,
    },
    expected,
  );
}

async function listed(driver: PlanDriver, date: string): Promise<PlanView[]> {
  return unwrap(await driver.listPlans(date), `列出 ${date}`);
}

const scenarios: Scenario[] = [
  {
    name: "10:42 时 11:30 开始的计划不能完成",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(11, 30), end: minutes(12, 0), title: "写提纲" }),
        ),
        "新建未开始的计划",
      );
      assertUuid(created.plan.id);
      assert.deepEqual(created.overlaps, []);
      assertFlags(created.plan, {
        status: "upcoming",
        canComplete: false,
        editable: true,
        late: false,
      });

      const error = unwrapError(await driver.completePlan(created.plan.id), "完成未开始的计划");
      assert.deepEqual(error, {
        code: "too_early",
        startsAt: "2026-11-26T11:30:00+08:00",
      });

      const [plan] = await listed(driver, TODAY);
      assert.equal(plan.outcome, null);
      assert.equal(plan.status, "upcoming");
    },
  },
  {
    name: "10:42 时 10:00 到 11:00 的计划可以完成，且不算迟",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(10, 0), end: minutes(11, 0), title: "对进度" }),
        ),
        "新建进行中的计划",
      );
      assertFlags(created.plan, {
        status: "active",
        canComplete: true,
        editable: true,
        late: false,
      });

      const done = unwrap(await driver.completePlan(created.plan.id), "完成进行中的计划");
      assertFlags(done, { status: "done", canComplete: false, editable: false, late: false });
      assert.deepEqual(done.outcome, { type: "done", at: NOW });
    },
  },
  {
    name: "10:42 时已经结束的计划可以补完成，并标迟",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(9, 0), end: minutes(10, 0), title: "晨会" }),
        ),
        "新建已过期的计划",
      );
      assertFlags(created.plan, {
        status: "overdue",
        canComplete: true,
        editable: false,
        late: false,
      });
      assert.equal(created.plan.outcome, null);

      const done = unwrap(await driver.completePlan(created.plan.id), "补完成");
      assertFlags(done, { status: "done", canComplete: false, editable: false, late: true });
      assert.deepEqual(done.outcome, { type: "done", at: NOW });
    },
  },
  {
    name: "恰好在结束时间点完成，不算迟",
    async run(driver) {
      const atEnd = "2026-11-26T10:00:00+08:00";
      driver.setNow(atEnd);
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(9, 0), end: minutes(10, 0), title: "刚好结束" }),
        ),
        "新建刚好结束的计划",
      );
      assert.equal(created.plan.status, "overdue");
      const done = unwrap(await driver.completePlan(created.plan.id), "在结束点完成");
      assert.equal(done.status, "done");
      assert.equal(done.late, false);
      assert.deepEqual(done.outcome, { type: "done", at: atEnd });
    },
  },
  {
    name: "结束之后再完成，算迟",
    async run(driver) {
      const afterEnd = "2026-11-26T10:00:01+08:00";
      driver.setNow(afterEnd);
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(9, 0), end: minutes(10, 0), title: "已经结束" }),
        ),
        "新建结束后的计划",
      );
      const done = unwrap(await driver.completePlan(created.plan.id), "结束后完成");
      assert.equal(done.late, true);
    },
  },
  {
    name: "恰好在开始时间点算进行中，可以完成",
    async run(driver) {
      const atStart = "2026-11-26T10:00:00+08:00";
      driver.setNow(atStart);
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(10, 0), end: minutes(11, 0), title: "正要开始" }),
        ),
        "新建刚好开始的计划",
      );
      assertFlags(created.plan, {
        status: "active",
        canComplete: true,
        editable: true,
        late: false,
      });
      const done = unwrap(await driver.completePlan(created.plan.id), "在开始点完成");
      assert.equal(done.late, false);
    },
  },
  {
    name: "过了结束时间仍未处理，不会自动变成完成",
    async run(driver) {
      await driver.createPlan(
        TODAY,
        work({ start: minutes(9, 0), end: minutes(10, 0), title: "没人点完成" }),
      );
      const [plan] = await listed(driver, TODAY);
      assert.equal(plan.outcome, null);
      assert.equal(plan.status, "overdue");
      assert.equal(plan.late, false);
    },
  },
  {
    name: "昨天的计划算已过期，明天的计划算未开始",
    async run(driver) {
      unwrap(
        await driver.createPlan(
          YESTERDAY,
          work({ start: minutes(23, 0), end: minutes(23, 30), title: "昨天的事" }),
        ),
        "新建昨天的计划",
      );
      unwrap(
        await driver.createPlan(
          TOMORROW,
          work({ start: minutes(10, 0), end: minutes(11, 0), title: "明天的事" }),
        ),
        "新建明天的计划",
      );
      const [yesterday] = await listed(driver, YESTERDAY);
      const [tomorrow] = await listed(driver, TOMORROW);
      assertFlags(yesterday, {
        status: "overdue",
        canComplete: true,
        editable: false,
        late: false,
      });
      assertFlags(tomorrow, {
        status: "upcoming",
        canComplete: false,
        editable: true,
        late: false,
      });
      assert.equal((await listed(driver, TODAY)).length, 0);
    },
  },
  {
    name: "已完成的计划不能再完成",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(10, 0), end: minutes(11, 0), title: "只完成一次" }),
        ),
        "新建",
      );
      unwrap(await driver.completePlan(created.plan.id), "第一次完成");
      const error = unwrapError(await driver.completePlan(created.plan.id), "第二次完成");
      assert.deepEqual(error, { code: "locked", reason: "finished" });
    },
  },
  {
    name: "未处理的计划可以跳过",
    async run(driver) {
      const upcoming = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(11, 30), end: minutes(12, 0), title: "稍后的事" }),
        ),
        "新建未开始",
      );
      const active = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(10, 0), end: minutes(11, 0), title: "手头的事" }),
        ),
        "新建进行中",
      );
      const skippedUpcoming = unwrap(
        await driver.skipPlan(upcoming.plan.id, "临时有事"),
        "跳过未开始",
      );
      const skippedActive = unwrap(await driver.skipPlan(active.plan.id, null), "跳过进行中");
      assertFlags(skippedUpcoming, {
        status: "skipped",
        canComplete: false,
        editable: false,
        late: false,
      });
      assert.deepEqual(skippedUpcoming.outcome, {
        type: "skipped",
        at: NOW,
        reason: "临时有事",
      });
      assert.deepEqual(skippedActive.outcome, { type: "skipped", at: NOW, reason: null });
    },
  },
  {
    name: "已过期的计划可以跳过",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(9, 0), end: minutes(10, 0), title: "错过了" }),
        ),
        "新建已过期",
      );
      const skipped = unwrap(await driver.skipPlan(created.plan.id, "没赶上"), "跳过已过期");
      assert.equal(skipped.status, "skipped");
      assert.equal(skipped.late, false);
    },
  },
  {
    name: "已完成或已跳过的计划不能再跳过",
    async run(driver) {
      const donePlan = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(10, 0), end: minutes(11, 0), title: "已经做完" }),
        ),
        "新建将完成的计划",
      );
      unwrap(await driver.completePlan(donePlan.plan.id), "完成");
      assert.deepEqual(unwrapError(await driver.skipPlan(donePlan.plan.id, null), "跳过已完成"), {
        code: "locked",
        reason: "finished",
      });

      const skippedPlan = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(11, 0), end: minutes(12, 0), title: "已经跳过" }),
        ),
        "新建将跳过的计划",
      );
      unwrap(await driver.skipPlan(skippedPlan.plan.id, "一次就够"), "第一次跳过");
      assert.deepEqual(
        unwrapError(await driver.skipPlan(skippedPlan.plan.id, "再跳一次"), "第二次跳过"),
        { code: "locked", reason: "finished" },
      );
      const [stillDone, stillSkipped] = await listed(driver, TODAY);
      assert.equal(stillDone.outcome?.type, "done");
      assert.deepEqual(stillSkipped.outcome, { type: "skipped", at: NOW, reason: "一次就够" });
    },
  },
  {
    name: "还没处理的计划不能撤销",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(11, 30), end: minutes(12, 0), title: "还没动" }),
        ),
        "新建",
      );
      const error = unwrapError(await driver.reopenPlan(created.plan.id), "撤销未处理");
      assert.equal(error.code, "validation");
      const [plan] = await listed(driver, TODAY);
      assert.equal(plan.outcome, null);
      assert.equal(plan.status, "upcoming");
    },
  },
  {
    name: "完成后可以撤销，回到进行中",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(10, 0), end: minutes(11, 0), title: "先标完成" }),
        ),
        "新建",
      );
      unwrap(await driver.completePlan(created.plan.id), "完成");
      const reopened = unwrap(await driver.reopenPlan(created.plan.id), "撤销完成");
      assert.equal(reopened.outcome, null);
      assertFlags(reopened, {
        status: "active",
        canComplete: true,
        editable: true,
        late: false,
      });
    },
  },
  {
    name: "补完成后可以撤销，回到已过期",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(9, 0), end: minutes(10, 0), title: "补记之后反悔" }),
        ),
        "新建",
      );
      unwrap(await driver.completePlan(created.plan.id), "补完成");
      const reopened = unwrap(await driver.reopenPlan(created.plan.id), "撤销补完成");
      assert.equal(reopened.outcome, null);
      assert.equal(reopened.status, "overdue");
      assert.equal(reopened.late, false);
    },
  },
  {
    name: "跳过之后可以撤销",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(11, 30), end: minutes(12, 0), title: "先跳过" }),
        ),
        "新建",
      );
      unwrap(await driver.skipPlan(created.plan.id, "等一下"), "跳过");
      const reopened = unwrap(await driver.reopenPlan(created.plan.id), "撤销跳过");
      assert.equal(reopened.outcome, null);
      assert.equal(reopened.status, "upcoming");
    },
  },
  {
    name: "未开始的计划可以改内容，但改不了日期",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(11, 30), end: minutes(12, 0), title: "旧标题" }),
        ),
        "新建",
      );
      const updated = unwrap(
        await driver.updatePlan(
          created.plan.id,
          work({ start: minutes(11, 0), end: minutes(11, 45), title: "新标题", acceptance: "交出提纲" }),
        ),
        "编辑",
      );
      assert.equal(updated.plan.date, TODAY);
      assert.equal(updated.plan.title, "新标题");
      assert.equal(updated.plan.start, minutes(11, 0));
      assert.equal(updated.plan.acceptance, "交出提纲");
      assert.equal((await listed(driver, TODAY)).length, 1);
      assert.equal((await listed(driver, TOMORROW)).length, 0);
    },
  },
  {
    name: "进行中的计划可以改内容",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(10, 0), end: minutes(11, 0), title: "进行中" }),
        ),
        "新建",
      );
      const updated = unwrap(
        await driver.updatePlan(
          created.plan.id,
          work({ start: minutes(10, 0), end: minutes(11, 30), title: "延长一点" }),
        ),
        "编辑进行中",
      );
      assert.equal(updated.plan.status, "active");
      assert.equal(updated.plan.title, "延长一点");
      assert.equal(updated.plan.date, TODAY);
    },
  },
  {
    name: "已过期、已完成、已跳过的计划不能编辑",
    async run(driver) {
      const overdue = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(8, 0), end: minutes(9, 0), title: "已过期" }),
        ),
        "新建已过期",
      );
      const done = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(10, 0), end: minutes(11, 0), title: "已完成" }),
        ),
        "新建将完成",
      );
      unwrap(await driver.completePlan(done.plan.id), "完成");
      const skipped = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(12, 0), end: minutes(13, 0), title: "已跳过" }),
        ),
        "新建将跳过",
      );
      unwrap(await driver.skipPlan(skipped.plan.id, null), "跳过");

      const replacement = work({ start: minutes(15, 0), end: minutes(16, 0), title: "想改掉" });
      assert.deepEqual(unwrapError(await driver.updatePlan(overdue.plan.id, replacement), "编辑已过期"), {
        code: "locked",
        reason: "ended",
      });
      assert.deepEqual(unwrapError(await driver.updatePlan(done.plan.id, replacement), "编辑已完成"), {
        code: "locked",
        reason: "finished",
      });
      assert.deepEqual(unwrapError(await driver.updatePlan(skipped.plan.id, replacement), "编辑已跳过"), {
        code: "locked",
        reason: "finished",
      });

      const titles = (await listed(driver, TODAY)).map((plan) => plan.title);
      assert.deepEqual(titles, ["已过期", "已完成", "已跳过"]);
    },
  },
  {
    name: "未处理的计划改期后，原计划记为已跳过，新计划留在新的日期",
    async run(driver) {
      unwrap(
        await driver.createPlan(
          TOMORROW,
          work({ start: minutes(10, 0), end: minutes(12, 0), title: "明天已有的安排" }),
        ),
        "先放一条明天的计划",
      );
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({
            start: minutes(11, 30),
            end: minutes(12, 0),
            title: "今天的安排",
            note: "原备注",
          }),
        ),
        "新建今天的计划",
      );
      const moved = unwrap(
        await driver.reschedulePlan(
          created.plan.id,
          TOMORROW,
          work({
            start: minutes(10, 30),
            end: minutes(11, 30),
            title: "改到明天",
            note: "新备注",
          }),
        ),
        "改期",
      );

      assert.equal(moved.original.id, created.plan.id);
      assert.equal(moved.original.date, TODAY);
      assert.equal(moved.original.title, "今天的安排");
      assert.equal(moved.original.note, "原备注");
      assert.equal(moved.original.status, "skipped");
      assert.deepEqual(moved.original.outcome, {
        type: "skipped",
        at: NOW,
        reason: "已改期到 2026-11-27",
      });

      assert.notEqual(moved.created.id, created.plan.id);
      assertUuid(moved.created.id);
      assert.equal(moved.created.date, TOMORROW);
      assert.equal(moved.created.title, "改到明天");
      assert.equal(moved.created.note, "新备注");
      assert.equal(moved.created.outcome, null);
      assert.equal(moved.created.rescheduledFrom, created.plan.id);
      assert.equal(moved.created.status, "upcoming");

      assert.equal(moved.overlaps.length, 1);
      assert.equal(moved.overlaps[0]?.title, "明天已有的安排");
      assert.deepEqual(
        (await listed(driver, TODAY)).map((plan) => plan.title),
        ["今天的安排"],
      );
      assert.deepEqual(
        (await listed(driver, TOMORROW)).map((plan) => plan.title),
        ["明天已有的安排", "改到明天"],
      );
    },
  },
  {
    name: "改期的时间不合法时，原计划保持不动",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(11, 0), end: minutes(12, 0), title: "先不动" }),
        ),
        "新建",
      );
      const error = unwrapError(
        await driver.reschedulePlan(
          created.plan.id,
          TOMORROW,
          work({ start: minutes(10, 0), end: minutes(10, 0), title: "不合法" }),
        ),
        "用颠倒的时间改期",
      );
      assert.equal(error.code, "validation");
      const [plan] = await listed(driver, TODAY);
      assert.equal(plan.title, "先不动");
      assert.equal(plan.outcome, null);
      assert.equal((await listed(driver, TOMORROW)).length, 0);
    },
  },
  {
    name: "已完成的计划改期后，原计划仍然是完成",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(10, 0), end: minutes(11, 0), title: "做完再改期" }),
        ),
        "新建",
      );
      const done = unwrap(await driver.completePlan(created.plan.id), "完成");
      const moved = unwrap(
        await driver.reschedulePlan(
          created.plan.id,
          TOMORROW,
          work({ start: minutes(9, 0), end: minutes(10, 0), title: "明天再做一版" }),
        ),
        "改期",
      );
      assert.equal(moved.original.title, "做完再改期");
      assert.deepEqual(moved.original.outcome, done.outcome);
      assert.equal(moved.original.status, "done");
      assert.equal(moved.created.outcome, null);
      assert.equal(moved.created.rescheduledFrom, created.plan.id);
      assert.equal(moved.created.title, "明天再做一版");
    },
  },
  {
    name: "已跳过的计划改期后，原计划仍然是跳过",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(11, 0), end: minutes(12, 0), title: "先跳过再改期" }),
        ),
        "新建",
      );
      unwrap(await driver.skipPlan(created.plan.id, "先不做"), "跳过");
      const moved = unwrap(
        await driver.reschedulePlan(
          created.plan.id,
          TOMORROW,
          work({ start: minutes(15, 0), end: minutes(16, 0), title: "改去明天" }),
        ),
        "改期",
      );
      assert.deepEqual(moved.original.outcome, {
        type: "skipped",
        at: NOW,
        reason: "先不做",
      });
      assert.equal(moved.created.outcome, null);
      assert.equal(moved.created.rescheduledFrom, created.plan.id);
    },
  },
  {
    name: "复制到另一天时清掉处理结果、备注和改期来源",
    async run(driver) {
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({
            start: minutes(10, 0),
            end: minutes(11, 0),
            title: "要复制的事",
            acceptance: "看得到结果",
            note: "只属于今天",
          }),
        ),
        "新建",
      );
      unwrap(await driver.completePlan(created.plan.id), "完成");
      const copied = unwrap(await driver.copyPlans([created.plan.id], TOMORROW), "复制");
      assert.equal(copied.length, 1);
      const copy = copied[0];
      assert.ok(copy);
      assert.notEqual(copy.id, created.plan.id);
      assert.equal(copy.date, TOMORROW);
      assert.equal(copy.title, "要复制的事");
      assert.equal(copy.acceptance, "看得到结果");
      assert.equal(copy.start, minutes(10, 0));
      assert.equal(copy.end, minutes(11, 0));
      assert.equal(copy.kind, "work");
      assert.equal(copy.weekGoalId, null);
      assert.equal(copy.outcome, null);
      assert.equal(copy.note, null);
      assert.equal(copy.rescheduledFrom, null);
      assert.equal(copy.status, "upcoming");

      const moved = unwrap(
        await driver.reschedulePlan(
          created.plan.id,
          TOMORROW,
          work({ start: minutes(13, 0), end: minutes(14, 0), title: "改期出来的" }),
        ),
        "改期后再复制那条新计划",
      );
      const copiedAgain = unwrap(
        await driver.copyPlans([moved.created.id], "2026-11-28"),
        "复制改期产生的计划",
      );
      assert.equal(copiedAgain[0]?.rescheduledFrom, null);
      assert.equal(copiedAgain[0]?.outcome, null);
      assert.equal(moved.created.rescheduledFrom, created.plan.id);
      const [original] = await listed(driver, TODAY);
      assert.equal(original.outcome?.type, "done");
      assert.equal(original.note, "只属于今天");
    },
  },
  {
    name: "未处理的计划可以删除，已完成或已跳过的不能删除",
    async run(driver) {
      const upcoming = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(12, 0), end: minutes(13, 0), title: "可删的未开始" }),
        ),
        "新建未开始",
      );
      const overdue = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(8, 0), end: minutes(9, 0), title: "可删的已过期" }),
        ),
        "新建已过期",
      );
      const done = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(10, 0), end: minutes(11, 0), title: "不能删的已完成" }),
        ),
        "新建将完成",
      );
      unwrap(await driver.completePlan(done.plan.id), "完成");
      const skipped = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(14, 0), end: minutes(15, 0), title: "不能删的已跳过" }),
        ),
        "新建将跳过",
      );
      unwrap(await driver.skipPlan(skipped.plan.id, null), "跳过");

      unwrap(await driver.deletePlan(upcoming.plan.id), "删除未开始");
      unwrap(await driver.deletePlan(overdue.plan.id), "删除已过期");
      assert.deepEqual(unwrapError(await driver.deletePlan(done.plan.id), "删除已完成"), {
        code: "locked",
        reason: "finished",
      });
      assert.deepEqual(unwrapError(await driver.deletePlan(skipped.plan.id), "删除已跳过"), {
        code: "locked",
        reason: "finished",
      });
      assert.deepEqual(
        (await listed(driver, TODAY)).map((plan) => plan.title),
        ["不能删的已完成", "不能删的已跳过"],
      );
    },
  },
  {
    name: "时间重叠会指出另一条计划，但两条都保存下来",
    async run(driver) {
      const first = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(9, 30), end: minutes(11, 0), title: "第一条" }),
        ),
        "新建第一条",
      );
      assert.deepEqual(first.overlaps, []);
      const second = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(10, 30), end: minutes(12, 0), title: "第二条" }),
        ),
        "新建重叠的第二条",
      );
      assert.deepEqual(second.overlaps, [
        { id: first.plan.id, title: "第一条", start: minutes(9, 30), end: minutes(11, 0) },
      ]);
      const apart = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(13, 0), end: minutes(14, 0), title: "不重叠" }),
        ),
        "新建不重叠的计划",
      );
      assert.deepEqual(apart.overlaps, []);

      const edited = unwrap(
        await driver.updatePlan(
          apart.plan.id,
          work({ start: minutes(10, 0), end: minutes(11, 0), title: "改成重叠" }),
        ),
        "把不重叠的改成重叠",
      );
      assert.deepEqual(
        edited.overlaps.map((item) => item.title).sort(),
        ["第一条", "第二条"],
      );
      assert.deepEqual(
        (await listed(driver, TODAY)).map((plan) => plan.title),
        ["第一条", "改成重叠", "第二条"],
      );
    },
  },
  {
    name: "已跳过的计划不出现在重叠提示里，已完成的仍会提示",
    async run(driver) {
      const done = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(10, 0), end: minutes(11, 0), title: "已完成的安排" }),
        ),
        "新建将完成",
      );
      unwrap(await driver.completePlan(done.plan.id), "完成");
      const skipped = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(10, 30), end: minutes(11, 30), title: "随后跳过" }),
        ),
        "新建将跳过",
      );
      unwrap(await driver.skipPlan(skipped.plan.id, null), "跳过");
      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(10, 15), end: minutes(10, 45), title: "新的安排" }),
        ),
        "新建与两者都相交的计划",
      );
      assert.deepEqual(created.overlaps, [
        {
          id: done.plan.id,
          title: "已完成的安排",
          start: minutes(10, 0),
          end: minutes(11, 0),
        },
      ]);
    },
  },
  {
    name: "核心计划没有周目标时不能保存",
    async run(driver) {
      const error = unwrapError(
        await driver.createPlan(
          TODAY,
          work({
            start: minutes(10, 0),
            end: minutes(11, 0),
            title: "核心却没挂目标",
            kind: "core",
            weekGoalId: null,
          }),
        ),
        "新建缺少周目标的核心计划",
      );
      assert.deepEqual(error, { code: "parent_required", level: "week" });
      assert.equal((await listed(driver, TODAY)).length, 0);
    },
  },
  {
    name: "填了不存在的周目标时不能保存",
    async run(driver) {
      const error = unwrapError(
        await driver.createPlan(
          TODAY,
          work({
            start: minutes(10, 0),
            end: minutes(11, 0),
            title: "挂了一个不存在的目标",
            kind: "work",
            weekGoalId: MISSING_ID,
          }),
        ),
        "新建指向不存在周目标的计划",
      );
      assert.deepEqual(error, { code: "invalid_parent", expected: "week" });
      assert.equal((await listed(driver, TODAY)).length, 0);
    },
  },
  {
    name: "同一天的计划按开始时间、再按创建时间排列",
    async run(driver) {
      unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(13, 0), end: minutes(14, 0), title: "下午" }),
        ),
        "先写下午",
      );
      driver.setNow(shiftSeconds(NOW, 1));
      unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(9, 0), end: minutes(10, 0), title: "早上先写" }),
        ),
        "再写早上第一条",
      );
      driver.setNow(shiftSeconds(NOW, 2));
      unwrap(
        await driver.createPlan(
          TODAY,
          work({ start: minutes(9, 0), end: minutes(9, 30), title: "早上后写" }),
        ),
        "再写同一开始时间的第二条",
      );
      const plans = await listed(driver, TODAY);
      assert.deepEqual(
        plans.map((plan) => plan.title),
        ["早上先写", "早上后写", "下午"],
      );
      assert.ok(plans[0] && plans[1]);
      assert.ok(plans[0].createdAt < plans[1].createdAt);
      assert.equal(plans[0].start, plans[1].start);
    },
  },
  {
    name: "标题空白或时间不成立时不能保存，空白备注等于没有备注",
    async run(driver) {
      assert.equal(
        unwrapError(
          await driver.createPlan(
            TODAY,
            work({ start: minutes(10, 0), end: minutes(11, 0), title: "   " }),
          ),
          "空白标题",
        ).code,
        "validation",
      );
      assert.equal(
        unwrapError(
          await driver.createPlan(
            TODAY,
            work({ start: minutes(10, 0), end: minutes(10, 0), title: "结束不晚于开始" }),
          ),
          "开始等于结束",
        ).code,
        "validation",
      );
      assert.equal(
        unwrapError(
          await driver.createPlan(
            TODAY,
            work({ start: -1, end: minutes(1, 0), title: "开始为负" }),
          ),
          "开始为负",
        ).code,
        "validation",
      );
      assert.equal(
        unwrapError(
          await driver.createPlan(
            TODAY,
            work({ start: minutes(23, 0), end: 1441, title: "超过当天" }),
          ),
          "结束超过 1440",
        ).code,
        "validation",
      );
      assert.equal((await listed(driver, TODAY)).length, 0);

      const created = unwrap(
        await driver.createPlan(
          TODAY,
          work({
            start: 0,
            end: 1440,
            title: "  整天  ",
            note: "   ",
          }),
        ),
        "新建覆盖全天、备注只有空白的计划",
      );
      assert.equal(created.plan.title, "  整天  ");
      assert.equal(created.plan.note, null);
      assert.equal(created.plan.status, "active");
      assert.equal(
        atMinute(TODAY, 1440, parseClock(NOW).offset),
        "2026-11-27T00:00:00+08:00",
      );

      const noted = unwrap(await driver.setPlanNote(created.plan.id, "  带上材料  "), "写备注");
      assert.equal(noted.note, "  带上材料  ");
      const cleared = unwrap(await driver.setPlanNote(created.plan.id, "   "), "用空白清除备注");
      assert.equal(cleared.note, null);
      const clearedAgain = unwrap(await driver.setPlanNote(created.plan.id, null), "用空值清除备注");
      assert.equal(clearedAgain.note, null);
    },
  },
  {
    name: "不存在的计划不能完成",
    async run(driver) {
      const error = unwrapError(await driver.completePlan(MISSING_ID), "完成不存在的计划");
      assert.equal(error.code, "not_found");
      if (error.code !== "not_found") return;
      assert.equal(error.id, MISSING_ID);
      assert.equal(error.entity.length > 0, true);
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
