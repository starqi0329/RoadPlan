import type {
  AppError,
  NowInfo,
  OverlapRef,
  PlanFields,
  PlanSaveResult,
  PlanStatus,
  PlanView,
  SkipPlanInput,
} from "../bindings";

type StoredPlan = Omit<PlanView, "status" | "canComplete" | "editable" | "late">;

const plans = new Map<string, StoredPlan>();
let seed = 0;

function nextId(): string {
  seed += 1;
  return `mock-plan-${String(seed).padStart(4, "0")}`;
}

function nowInfoFromClock(date = new Date()): NowInfo {
  const localDate = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const minute = date.getHours() * 60 + date.getMinutes();
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const tz = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  const stamp = `${localDate}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}${tz}`;
  const week = Math.floor((date.getDate() - 1) / 7) + 1;
  return {
    now: stamp,
    date: localDate,
    minute,
    periods: {
      year: String(date.getFullYear()),
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      week: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-W${week}`,
    },
  };
}

function endTimestamp(date: string, end: number): string {
  const hours = Math.floor(end / 60);
  const mins = end % 60;
  return `${date}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00+08:00`;
}

function deriveView(plan: StoredPlan, clock: NowInfo): PlanView {
  let status: PlanStatus;
  if (plan.outcome?.type === "done") {
    status = "done";
  } else if (plan.outcome?.type === "skipped") {
    status = "skipped";
  } else if (plan.date > clock.date) {
    status = "upcoming";
  } else if (plan.date < clock.date) {
    status = "overdue";
  } else if (clock.minute < plan.start) {
    status = "upcoming";
  } else if (clock.minute < plan.end) {
    status = "active";
  } else {
    status = "overdue";
  }

  const late = plan.outcome?.type === "done" && plan.outcome.at > endTimestamp(plan.date, plan.end);

  return {
    ...plan,
    status,
    canComplete: status === "active" || status === "overdue",
    editable: status === "upcoming" || status === "active",
    late,
  };
}

function findOverlaps(
  date: string,
  start: number,
  end: number,
  excludeId: string | null,
): OverlapRef[] {
  const clock = nowInfoFromClock();
  const overlaps: OverlapRef[] = [];
  for (const plan of plans.values()) {
    if (plan.date !== date) continue;
    if (excludeId && plan.id === excludeId) continue;
    const view = deriveView(plan, clock);
    if (view.status === "skipped") continue;
    if (start < plan.end && end > plan.start) {
      overlaps.push({
        id: plan.id,
        title: plan.title,
        start: plan.start,
        end: plan.end,
      });
    }
  }
  return overlaps;
}

function validateFields(fields: PlanFields): void {
  if (!(fields.start >= 0 && fields.start < fields.end && fields.end <= 1440)) {
    throw {
      code: "validation",
      field: "end",
      message: "结束时间必须晚于开始时间",
    } satisfies AppError;
  }
  if (!fields.title.trim()) {
    throw {
      code: "validation",
      field: "title",
      message: "标题不能为空",
    } satisfies AppError;
  }
  if (fields.kind === "core" && !fields.weekGoalId) {
    throw {
      code: "parent_required",
      level: "week",
    } satisfies AppError;
  }
}

function requirePlan(id: string): StoredPlan {
  const plan = plans.get(id);
  if (!plan) {
    throw {
      code: "not_found",
      entity: "plan",
      id,
    } satisfies AppError;
  }
  return plan;
}

export async function getNow(): Promise<NowInfo> {
  return nowInfoFromClock();
}

export async function listPlans(date: string): Promise<PlanView[]> {
  const clock = nowInfoFromClock();
  return [...plans.values()]
    .filter((plan) => plan.date === date)
    .map((plan) => deriveView(plan, clock))
    .sort((a, b) => a.start - b.start || a.createdAt.localeCompare(b.createdAt));
}

export async function createPlan(date: string, fields: PlanFields): Promise<PlanSaveResult> {
  validateFields(fields);
  const clock = nowInfoFromClock();
  const note = fields.note?.trim() ? fields.note.trim() : null;
  const stored: StoredPlan = {
    id: nextId(),
    date,
    start: fields.start,
    end: fields.end,
    title: fields.title.trim(),
    acceptance: fields.acceptance,
    kind: fields.kind,
    weekGoalId: fields.weekGoalId,
    note,
    outcome: null,
    rescheduledFrom: null,
    createdAt: clock.now,
    updatedAt: clock.now,
  };
  plans.set(stored.id, stored);
  return {
    plan: deriveView(stored, clock),
    overlaps: findOverlaps(date, fields.start, fields.end, stored.id),
  };
}

export async function completePlan(id: string): Promise<PlanView> {
  const plan = requirePlan(id);
  const clock = nowInfoFromClock();
  const view = deriveView(plan, clock);
  if (view.status === "upcoming") {
    throw {
      code: "too_early",
      startsAt: endTimestamp(plan.date, plan.start).replace(
        /T\d{2}:\d{2}:\d{2}/,
        `T${String(Math.floor(plan.start / 60)).padStart(2, "0")}:${String(plan.start % 60).padStart(2, "0")}:00`,
      ),
    } satisfies AppError;
  }
  if (view.status === "done" || view.status === "skipped") {
    throw { code: "locked", reason: "finished" } satisfies AppError;
  }
  plan.outcome = { type: "done", at: clock.now };
  plan.updatedAt = clock.now;
  return deriveView(plan, clock);
}

export async function skipPlan(input: SkipPlanInput): Promise<PlanView> {
  const plan = requirePlan(input.id);
  const clock = nowInfoFromClock();
  const view = deriveView(plan, clock);
  if (view.status === "done" || view.status === "skipped") {
    throw { code: "locked", reason: "finished" } satisfies AppError;
  }
  const reason = input.reason?.trim() ? input.reason.trim() : null;
  plan.outcome = { type: "skipped", at: clock.now, reason };
  plan.updatedAt = clock.now;
  return deriveView(plan, clock);
}

/** 测试用：清空演示数据。 */
export function resetMockPlans(): void {
  plans.clear();
  seed = 0;
}
