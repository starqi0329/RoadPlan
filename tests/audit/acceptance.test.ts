import assert from "node:assert/strict";
import { test } from "node:test";

import { minutes, shiftSeconds } from "../plan/time.ts";
import type { PlanFields, Result } from "../plan/types.ts";
import { connectRealDriver } from "./driver.ts";
import { createAuditMock } from "./mock-driver.ts";
import type { AuditDriver, AuditEvent, AuditPage, GoalView } from "./types.ts";

const NOW = "2026-11-26T10:42:00+08:00";
const TODAY = "2026-11-26";
const TOMORROW = "2026-11-27";

const REAL_SKIP = "操作记录命令尚未合并。当前环境也没有 Windows 桌面，系统标题栏和托盘无法查看。";

type Scenario = {
  name: string;
  run: (driver: AuditDriver) => Promise<void>;
};

function openMock(): AuditDriver {
  const driver = createAuditMock();
  driver.setNow(NOW);
  return driver;
}

function unwrap<T>(result: Result<T>, label: string): T {
  if (!result.ok) assert.fail(`${label} 应成功，实际 ${JSON.stringify(result.error)}`);
  return result.data;
}

function work(title: string, start: number, end: number, weekGoalId: string | null = null): PlanFields {
  return {
    start,
    end,
    title,
    acceptance: "",
    kind: "work",
    weekGoalId,
    note: null,
  };
}

async function audit(driver: AuditDriver, limit = 50, beforeId: string | null = null): Promise<AuditPage> {
  return unwrap(await driver.listAudit(limit, beforeId), "读取操作记录");
}

function hasCount(summary: string, count: number): boolean {
  return new RegExp(`(^|[^0-9])${count}([^0-9]|$)`).test(summary);
}

function isNewer(left: AuditEvent, right: AuditEvent): boolean {
  if (left.at !== right.at) return left.at > right.at;
  return left.id > right.id;
}

const cases: Scenario[] = [
  {
    name: "写成功留一条，失败和查看不留",
    async run(driver) {
      assert.equal((await audit(driver)).total, 0);

      const created = unwrap(await driver.createPlan(TODAY, work("写周报", minutes(11, 0), minutes(12, 0))), "新建");
      const written = await audit(driver);
      assert.equal(written.total, 1);
      assert.equal(written.items.length, 1);
      const event = written.items[0];
      assert.equal(event.action, "create");
      assert.equal(event.entity, "plan");
      assert.equal(event.entityId, created.id);
      assert.equal(event.entityTitle, "写周报");
      assert.equal(event.at, NOW);
      assert.equal(event.summary.length > 0, true);
      assert.equal(event.summary.includes("<"), false);

      unwrap(await driver.listPlans(TODAY), "查看当天计划");
      assert.equal((await audit(driver)).total, 1);
      assert.equal((await audit(driver)).total, 1);

      const failed = await driver.createPlan(TODAY, work("   ", minutes(11, 0), minutes(12, 0)));
      assert.equal(failed.ok, false);
      if (!failed.ok) assert.equal(failed.error.code, "validation");
      assert.equal((await audit(driver)).total, 1);

      const tooEarly = await driver.completePlan(created.id);
      assert.equal(tooEarly.ok, false);
      if (!tooEarly.ok) assert.equal(tooEarly.error.code, "too_early");
      assert.equal((await audit(driver)).total, 1);
    },
  },
  {
    name: "复制和删除目标都只留一条，摘要里写数量",
    async run(driver) {
      const year = unwrap(
        await driver.createGoal({ level: "year", parentId: null, period: "2026", title: "今年" }),
        "建年",
      );
      const month = unwrap(
        await driver.createGoal({ level: "month", parentId: year.id, period: "2026-11", title: "本月" }),
        "建月",
      );
      const week = unwrap(
        await driver.createGoal({ level: "week", parentId: month.id, period: "2026-11-W4", title: "这周" }),
        "建周",
      );

      const copied: string[] = [];
      for (const title of ["甲", "乙", "丙"]) {
        const plan = unwrap(await driver.createPlan(TODAY, work(title, minutes(9, 0), minutes(10, 0))), title);
        copied.push(plan.id);
      }
      driver.setNow(shiftSeconds(NOW, 1));
      const beforeCopy = (await audit(driver)).total;
      const copies = unwrap(await driver.copyPlans(copied, TOMORROW), "复制");
      assert.equal(copies.length, 3);
      const afterCopy = await audit(driver);
      assert.equal(afterCopy.total, beforeCopy + 1);
      assert.equal(afterCopy.items[0].action, "copy");
      assert.equal(afterCopy.items[0].entity, "plan");
      assert.equal(hasCount(afterCopy.items[0].summary, 3), true);

      await attachForDelete(driver, week);
      const preview = unwrap(await driver.previewDeleteGoal(week.id), "预览删除");
      const beforeDelete = (await audit(driver)).total;
      assert.deepEqual(preview, { goalsArchived: 1, plansDeleted: 5, plansKept: 2 });

      driver.setNow(shiftSeconds(NOW, 2));
      const deleted = unwrap(await driver.deleteGoal(week.id), "删除目标");
      assert.deepEqual(deleted, preview);
      const afterDelete = await audit(driver);
      assert.equal(afterDelete.total, beforeDelete + 1);
      const entry = afterDelete.items[0];
      assert.equal(entry.action, "delete");
      assert.equal(entry.entity, "goal");
      assert.equal(entry.entityId, week.id);
      assert.equal(entry.entityTitle, "这周");
      assert.equal(hasCount(entry.summary, deleted.goalsArchived), true);
      assert.equal(hasCount(entry.summary, deleted.plansDeleted), true);
      assert.equal(hasCount(entry.summary, deleted.plansKept), true);
    },
  },
  {
    name: "按时间倒序，同一时间再按 id 倒序",
    async run(driver) {
      const first = unwrap(await driver.createPlan(TODAY, work("第一条", minutes(9, 0), minutes(10, 0))), "第一条");
      driver.setNow(shiftSeconds(NOW, 60));
      const second = unwrap(await driver.createPlan(TODAY, work("第二条", minutes(10, 0), minutes(11, 0))), "第二条");
      driver.setNow(shiftSeconds(NOW, 120));
      const third = unwrap(await driver.createPlan(TODAY, work("第三条", minutes(11, 0), minutes(12, 0))), "第三条");
      const fourth = unwrap(await driver.createPlan(TODAY, work("第四条", minutes(12, 0), minutes(13, 0))), "第四条");

      const page = await audit(driver);
      assert.equal(page.total, 4);
      assert.equal(page.items.length, 4);
      for (let index = 1; index < page.items.length; index += 1) {
        assert.equal(isNewer(page.items[index - 1], page.items[index]), true);
      }
      const tied = page.items.filter((event) => event.entityId === third.id || event.entityId === fourth.id);
      assert.equal(tied.length, 2);
      assert.equal(tied[0].at, tied[1].at);
      assert.equal(tied[0].id > tied[1].id, true);
    },
  },
  {
    name: "limit 和 beforeId 能翻到更早的记录，且不重复",
    async run(driver) {
      for (let index = 0; index < 5; index += 1) {
        driver.setNow(shiftSeconds(NOW, index));
        unwrap(
          await driver.createPlan(TODAY, work(`第${index + 1}条`, minutes(9, index), minutes(10, index))),
          `第${index + 1}条`,
        );
      }
      const all = await audit(driver, 10, null);
      assert.equal(all.total, 5);
      assert.equal(all.items.length, 5);

      const first = await audit(driver, 2, null);
      assert.equal(first.total, 5);
      assert.equal(first.items.length, 2);
      assert.deepEqual(
        first.items.map((event) => event.id),
        all.items.slice(0, 2).map((event) => event.id),
      );

      const second = await audit(driver, 2, first.items[1].id);
      assert.equal(second.total, 5);
      assert.deepEqual(
        second.items.map((event) => event.id),
        all.items.slice(2, 4).map((event) => event.id),
      );

      const third = await audit(driver, 2, second.items[1].id);
      assert.equal(third.total, 5);
      assert.deepEqual(
        third.items.map((event) => event.id),
        all.items.slice(4).map((event) => event.id),
      );
      assert.equal(third.items.length, 1);

      const done = await audit(driver, 2, third.items[0].id);
      assert.equal(done.total, 5);
      assert.deepEqual(done.items, []);

      const seen = [...first.items, ...second.items, ...third.items].map((event) => event.id);
      assert.equal(new Set(seen).size, seen.length);
      assert.deepEqual(seen, all.items.map((event) => event.id));
    },
  },
];

async function attachForDelete(driver: AuditDriver, week: GoalView): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    const start = minutes(11 + index, 0);
    unwrap(await driver.createPlan(TODAY, work(`待做${index}`, start, start + 60, week.id)), `待做${index}`);
  }
  const finished = unwrap(
    await driver.createPlan(TODAY, work("已做完", minutes(9, 0), minutes(10, 0), week.id)),
    "已做完",
  );
  unwrap(await driver.completePlan(finished.id), "完成已做完");
  unwrap(await driver.createPlan(TODAY, work("已过点", minutes(8, 0), minutes(9, 0), week.id)), "已过点");
  unwrap(await driver.createPlan(TODAY, work("没挂目标", minutes(16, 0), minutes(17, 0))), "没挂目标");
}

for (const item of cases) {
  test(`对照：${item.name}`, async () => {
    await item.run(openMock());
  });

  test(`真实命令：${item.name}`, { skip: connectRealDriver() ? false : REAL_SKIP }, async () => {
    const open = connectRealDriver();
    assert.ok(open);
    await item.run(await open());
  });
}
