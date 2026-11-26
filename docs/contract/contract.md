# 数据契约

| 项目 | 内容 |
| --- | --- |
| 版本 | 0.2.0 |
| 状态 | 冻结（第 0 阶段） |
| 源头 | Rust：`src-tauri/src/domain/`；前端类型由它生成到 `src/bindings.ts` |
| 修改权限 | 只有组织者能改；流程见 `docs/standards/git.md` 与 `docs/templates/contract-change.md` |

本文是前端、后端、测试三方的共同依据。代码与本文不一致时，先停下来提交契约变更申请，不要自行"修正"任何一方。

下文用前端看到的 TypeScript 写法表示；Rust 端字段为 snake_case，序列化为 camelCase。

---

## 1. 通用约定

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `Id` | `string` | UUID v7 |
| `LocalDate` | `string` | 本机日期 `"2026-11-26"` |
| `Minute` | `number` | 当天零点起的分钟数，0–1440；`09:30` 为 `570` |
| `Timestamp` | `string` | RFC 3339，带时区，`"2026-11-26T10:42:00+08:00"` |
| `Period` | `string` | 年 `"2026"`；月 `"2026-11"`；周 `"2026-11-W1"`（见 4.4） |

- 所有写操作在 Rust 中执行；每个写操作与它的操作记录在同一数据库事务内。
- "当前时间"只由 Rust 提供。开发版可用环境变量 `SHIXU_FAKE_NOW`（Timestamp）固定时钟，用于演示和手工测试；发布版忽略该变量。

## 2. 数据结构

### 2.1 计划

```ts
type PlanKind = "core" | "work" | "routine" | "review"; // 核心 / 工作 / 日常 / 复盘

type PlanOutcome =
  | { type: "done"; at: Timestamp }
  | { type: "skipped"; at: Timestamp; reason: string | null };

type Plan = {
  id: Id;
  date: LocalDate;
  start: Minute;
  end: Minute;
  title: string;
  acceptance: string;            // 验收方式，可为 ""
  kind: PlanKind;
  weekGoalId: Id | null;
  note: string | null;
  outcome: PlanOutcome | null;   // null = 用户尚未处理
  rescheduledFrom: Id | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type PlanStatus = "upcoming" | "active" | "overdue" | "done" | "skipped";

type PlanView = Plan & {
  status: PlanStatus;     // 由 Rust 推导，不入库
  canComplete: boolean;
  editable: boolean;
  late: boolean;
};

// 新建、编辑、改期共用的可编辑字段（整体替换，不做部分更新）
type PlanFields = {
  start: Minute;
  end: Minute;
  title: string;
  acceptance: string;
  kind: PlanKind;
  weekGoalId: Id | null;
  note: string | null;
};

type OverlapRef = { id: Id; title: string; start: Minute; end: Minute };

type PlanSaveResult = { plan: PlanView; overlaps: OverlapRef[] };

type RescheduleResult = { original: PlanView; created: PlanView; overlaps: OverlapRef[] };
```

### 2.2 目标

```ts
type GoalLevel = "year" | "month" | "week";
type GoalState = "active" | "achieved" | "dropped";
type MilestoneState = "todo" | "doing" | "done";

type GoalMeasure =
  | { type: "milestones" }
  | { type: "count"; target: number; unit: string };

type Milestone = { id: Id; title: string; state: MilestoneState; order: number };

type Goal = {
  id: Id;
  level: GoalLevel;
  parentId: Id | null;
  period: Period;
  title: string;
  acceptance: string;
  measure: GoalMeasure;
  milestones: Milestone[];
  state: GoalState;
  deletedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type GoalView = Goal & {
  progress: { done: number; total: number };
  childCount: number;   // 未删除的直接下级目标数
};

type CreateGoalInput = {
  level: GoalLevel;
  parentId: Id | null;
  period: Period;
  title: string;
  acceptance: string;
  measure: GoalMeasure;
};

type UpdateGoalInput = { title: string; acceptance: string; measure: GoalMeasure };

type DeleteGoalImpact = { goalsArchived: number; plansDeleted: number; plansKept: number };

type ChainTarget = { type: "plan"; id: Id } | { type: "goal"; id: Id };
```

### 2.3 复盘

```ts
type Segment = "morning" | "afternoon" | "evening";

type ReviewTarget =
  | { type: "segment"; date: LocalDate; segment: Segment }
  | { type: "goal"; goalId: Id };

type ReviewStats = {
  planned: number;
  done: number;
  skipped: number;
  overdue: number;
  focusMinutes: number;   // 已完成计划的时长之和
};

type Review = {
  id: Id;
  target: ReviewTarget;
  note: string;
  stats: ReviewStats;     // 保存时的快照，之后不随计划变化
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### 2.4 操作记录

```ts
type AuditAction =
  | "create" | "update" | "complete" | "reopen" | "skip" | "reschedule" | "copy"
  | "delete" | "restore" | "note" | "review" | "state";

type AuditEntity = "plan" | "goal" | "milestone" | "review";

type AuditEvent = {
  id: Id;
  at: Timestamp;
  action: AuditAction;
  entity: AuditEntity;
  entityId: Id;
  entityTitle: string;
  summary: string;   // 纯文本，前端负责排版
};

type AuditPage = { items: AuditEvent[]; total: number };
```

### 2.5 时间与周期

```ts
type Periods = { year: Period; month: Period; week: Period };

type NowInfo = { now: Timestamp; date: LocalDate; minute: Minute; periods: Periods };
```

## 3. 命令

全部命令返回 `Result<T, AppError>`。前端只能通过 `src/bindings.ts` 调用。

### 3.1 时间

| 命令 | 参数 | 返回 |
| --- | --- | --- |
| `get_now` | — | `NowInfo` |
| `periods_of` | `date: LocalDate` | `Periods` |

### 3.2 计划

| 命令 | 参数 | 返回 |
| --- | --- | --- |
| `list_plans` | `date: LocalDate` | `PlanView[]`（按 start、再按 createdAt 排序） |
| `create_plan` | `date: LocalDate, fields: PlanFields` | `PlanSaveResult` |
| `update_plan` | `id: Id, fields: PlanFields` | `PlanSaveResult` |
| `reschedule_plan` | `id: Id, date: LocalDate, fields: PlanFields` | `RescheduleResult` |
| `copy_plans` | `planIds: Id[], toDate: LocalDate` | `PlanView[]` |
| `complete_plan` | `id: Id` | `PlanView` |
| `reopen_plan` | `id: Id` | `PlanView` |
| `skip_plan` | `id: Id, reason: string \| null` | `PlanView` |
| `set_plan_note` | `id: Id, note: string \| null` | `PlanView` |
| `delete_plan` | `id: Id` | `void` |

### 3.3 目标

| 命令 | 参数 | 返回 |
| --- | --- | --- |
| `list_goals` | `level: GoalLevel \| null, period: Period \| null` | `GoalView[]`（不含已删除） |
| `list_deleted_goals` | — | `GoalView[]` |
| `get_goal` | `id: Id` | `GoalView`（含已删除） |
| `get_goal_chain` | `target: ChainTarget` | `GoalView[]`（从年到最近一级） |
| `create_goal` | `input: CreateGoalInput` | `GoalView` |
| `update_goal` | `id: Id, input: UpdateGoalInput` | `GoalView` |
| `set_goal_state` | `id: Id, state: GoalState` | `GoalView` |
| `preview_delete_goal` | `id: Id` | `DeleteGoalImpact` |
| `delete_goal` | `id: Id` | `DeleteGoalImpact`（实际处理数量） |
| `restore_goal` | `id: Id` | `GoalView` |
| `add_milestone` | `goalId: Id, title: string` | `GoalView` |
| `update_milestone` | `goalId: Id, milestoneId: Id, title: string` | `GoalView` |
| `set_milestone_state` | `goalId: Id, milestoneId: Id, state: MilestoneState` | `GoalView` |
| `remove_milestone` | `goalId: Id, milestoneId: Id` | `GoalView` |

### 3.4 复盘

| 命令 | 参数 | 返回 |
| --- | --- | --- |
| `get_segment_review` | `date: LocalDate, segment: Segment` | `Review \| null` |
| `list_goal_reviews` | `goalId: Id` | `Review[]`（新的在前） |
| `save_review` | `target: ReviewTarget, note: string` | `Review` |
| `update_review` | `id: Id, note: string` | `Review` |

### 3.5 操作记录

| 命令 | 参数 | 返回 |
| --- | --- | --- |
| `list_audit` | `limit: number, beforeId: Id \| null` | `AuditPage` |

### 3.6 窗口

窗口命令（主窗口、置顶小窗、胶囊、托盘、退出）在切片 4 开始前冻结，届时以契约 0.3 追加。

## 4. 业务规则

规则全部在 Rust 中执行，是测试的主要对象。编号供任务包、测试和汇报引用。

### 4.1 计划状态

- **R1 状态推导**：outcome 为 done → `done`；为 skipped → `skipped`；否则以计划的 date 与 start、end 组成的时间点和当前时间比较：早于开始 → `upcoming`，在 `[开始, 结束)` 内 → `active`，不早于结束 → `overdue`。数据库不存状态。
- **R2 完成门槛**：只有 status 为 `active` 或 `overdue` 的计划可以完成；`upcoming` 返回 `too_early`，已处理返回 `locked{finished}`。`canComplete` 与此一致。
- **R3 迟交**：`late` = outcome 为 done 且完成时间晚于结束时间点。
- **R4 撤销**：`reopen_plan` 清空 outcome；未处理的计划调用时返回 `validation`。
- **R5 跳过**：只有未处理的计划可以跳过，否则返回 `locked{finished}`。

### 4.2 计划编辑

- **R6 编辑范围**：只有 `upcoming`、`active` 可以 `update_plan`，即 `editable` 为 true；`overdue` 返回 `locked{ended}`，已处理返回 `locked{finished}`。`update_plan` 不能改日期。
- **R7 改期**：任何状态都可以改期。生成新计划（`rescheduledFrom` 指向原计划，outcome 为 null）；原计划若未处理，则记为 skipped，reason 为 `"已改期到 YYYY-MM-DD"`；原计划若已处理，保持不变。
- **R8 复制**：每条复制出的计划 outcome 为 null，note 为 null，rescheduledFrom 为 null，其余字段沿用，date 改为目标日期。
- **R9 删除计划**：只有未处理的计划可以删除，否则返回 `locked{finished}`。
- **R10 字段校验**：`0 <= start < end <= 1440`；title 去掉首尾空白后不能为空；note 去掉首尾空白后为空时等同于 null。
- **R11 所属目标**：kind 为 `core` 时 weekGoalId 必填，否则返回 `parent_required{week}`；weekGoalId 非空时必须指向未删除的周目标，否则返回 `invalid_parent{week}`。
- **R12 时间重叠**：新建、编辑、改期时，返回同一日期中与之时间区间相交的其他计划（不含已跳过的），不阻止保存。

### 4.3 目标

- **R13 层级**：year 的 parentId 必须为 null；month 的上级必须是未删除的 year；week 的上级必须是未删除的 month。违反时返回 `parent_required` 或 `invalid_parent`。
- **R14 周期一致**：period 格式必须与 level 对应；month 的 period 必须属于上级的年份；week 的 period 必须属于上级的月份。
- **R15 进度**：milestones 型为 `{ done: 完成的里程碑数, total: 里程碑总数 }`；count 型为 `{ done: 该目标及其所有未删除和已删除下级目标下 outcome 为 done 的计划数, total: target }`。
- **R16 删除预览**：goalsArchived = 该目标与全部未删除下级目标数；plansDeleted = 挂在这些目标下、outcome 为 null 且结束时间点晚于当前时间的计划数；plansKept = 挂在这些目标下的其他计划数。
- **R17 删除执行**：与预览口径一致；这些目标的 deletedAt 设为同一个时间戳；符合条件的计划被物理删除；其余计划不变。
- **R18 恢复**：只能恢复上级未删除的已删除目标，否则返回 `validation`；恢复该目标及与它 deletedAt 相同的下级目标；被删除的计划不恢复。
- **R19 已删除目标**：不出现在 `list_goals` 中，不能作为新计划或新目标的上级，不能编辑。

### 4.4 周期

- **R20 按月划周**：日期的周序号 = `(日 - 1) / 7 + 1`（整数除法），取值 1–5；周期写为 `YYYY-MM-W{n}`。一周不跨月。

### 4.5 复盘

- **R21 时段**：开始时间在 `[0, 720)` 为 morning，`[720, 1080)` 为 afternoon，`[1080, 1440)` 为 evening。
- **R22 时段复盘门槛**：时段开始时间点晚于当前时间时，`save_review` 返回 `too_early`。
- **R23 时段复盘唯一**：同一日期同一时段只有一份，再次 `save_review` 覆盖 note 并重新计算统计快照。
- **R24 目标复盘**：每次 `save_review` 新增一份。
- **R25 统计快照**：时段复盘统计该日期该时段的计划；目标复盘统计挂在该目标及其下级目标下的全部计划。`overdue` 为保存时状态为 overdue 的数量；`focusMinutes` 为已完成计划的 `end - start` 之和。`update_review` 只改 note，不改统计。

### 4.6 操作记录

- **R26 留痕**：每个成功的写命令恰好写一条操作记录（`copy_plans` 写一条，摘要中写数量；`delete_goal` 写一条，摘要中写影响数量）。失败的命令不写。读命令不写。
- **R27 排序**：按 at 倒序，同一时间按 id 倒序。

## 5. 事件

Rust 主动发给所有窗口：

| 事件 | 载荷 | 时机 |
| --- | --- | --- |
| `data-changed` | `{ entities: ("plan" \| "goal" \| "review" \| "audit")[] }` | 任意写命令成功后 |
| `minute-tick` | `NowInfo` | 每分钟整点 |

## 6. 错误

```ts
type AppError =
  | { code: "not_found"; entity: string; id: Id }
  | { code: "validation"; field: string; message: string }
  | { code: "too_early"; startsAt: Timestamp }
  | { code: "locked"; reason: "ended" | "finished" }
  | { code: "parent_required"; level: "year" | "month" | "week" }
  | { code: "invalid_parent"; expected: "year" | "month" | "week" }
  | { code: "internal"; message: string };
```

第 0 阶段除 `get_now` 和 `periods_of` 外，命令都返回 `{ code: "internal", message: "未实现" }`。这两个只读命令已经按第 4 节实现，方便骨架和测试使用固定时间。

## 7. 变更记录

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| 0.2.0 | 2026-11-26 | 首个冻结版本 |
