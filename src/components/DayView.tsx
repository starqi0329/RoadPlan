import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { listGoals } from "../api/goals";
import { listPlans } from "../api/plans";
import { isAppError } from "../api/result";
import type { PlanView, Segment } from "../bindings";
import { isUnimplemented } from "../errors/appError";
import { useDayPlans } from "../hooks/useDayPlans";
import { addDays } from "../lib/dates";
import { formatMinute } from "../lib/format";
import { groupPlansBySegment } from "../lib/segments";
import { CreatePlanForm } from "./CreatePlanForm";
import { EmptyState } from "./EmptyState";
import { PlanItem } from "./PlanItem";
import { SegmentReviewPanel } from "./SegmentReviewPanel";
import { ReviewBar } from "./shell/ReviewBar";
import styles from "./DayView.module.css";

type Filter = "all" | "todo" | "done";
type DayTab = "today" | "tomorrow";

type Props = {
  /** 嵌在主窗右区时为 true：不要整页壳与顶 Tab。 */
  embedded?: boolean;
};

function matchesFilter(plan: PlanView, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "done") return plan.status === "done" || plan.status === "skipped";
  return plan.status === "upcoming" || plan.status === "active" || plan.status === "overdue";
}

export function DayView({ embedded = false }: Props) {
  const [dayTab, setDayTab] = useState<DayTab>("today");
  const [viewDate, setViewDate] = useState<string | null>(null);
  const day = useDayPlans(viewDate);
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [reviewSegment, setReviewSegment] = useState<Segment | null>(null);

  useEffect(() => {
    if (!day.now) return;
    setViewDate(dayTab === "today" ? day.now.date : addDays(day.now.date, 1));
  }, [day.now, dayTab]);

  const weekGoalsQuery = useQuery({
    queryKey: ["goals", "week"],
    queryFn: async () => {
      try {
        return await listGoals("week", null);
      } catch (error) {
        if (isAppError(error) && isUnimplemented(error)) return [];
        throw error;
      }
    },
  });

  const todayDate = day.now?.date ?? null;
  const tomorrowDate = todayDate ? addDays(todayDate, 1) : null;

  const todayPlansQuery = useQuery({
    queryKey: ["plans", todayDate ?? "pending", "for-review"],
    queryFn: async () => {
      if (!todayDate) return [] as PlanView[];
      return listPlans(todayDate);
    },
    enabled: Boolean(todayDate) && reviewSegment === "evening",
  });

  const visible = useMemo(
    () => day.plans.filter((plan) => matchesFilter(plan, filter)),
    [day.plans, filter],
  );
  const groups = useMemo(() => groupPlansBySegment(visible), [visible]);

  const blocked = day.backendGap && day.mode === "tauri";
  const heading = dayTab === "today" ? "今日时刻计划" : "明天时刻计划";

  const body = (
    <>
      {day.banner ? <div className={styles.banner}>{day.banner}</div> : null}
      {day.backendGap ? (
        <div className={styles.gap}>
          计划读写还没接上后端。浏览器可用演示数据；真机持久化要等后端就绪后再联调。
        </div>
      ) : null}

      <div className={styles.head}>
        <h2>{heading}</h2>
        <div className={styles.dayTabs} role="group" aria-label="查看日期">
          <button
            type="button"
            aria-pressed={dayTab === "today"}
            onClick={() => setDayTab("today")}
          >
            今天
          </button>
          <button
            type="button"
            aria-pressed={dayTab === "tomorrow"}
            onClick={() => setDayTab("tomorrow")}
          >
            明天
          </button>
        </div>
        <button
          type="button"
          className={styles.add}
          disabled={blocked || !day.date}
          onClick={() => setCreating(true)}
        >
          + 添加计划
        </button>
        <div className={styles.filters} role="group" aria-label="筛选">
          {(
            [
              ["all", "全部"],
              ["todo", "待办"],
              ["done", "已完成"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.legend}>
          <span>
            <i className={`${styles.dot} ${styles.dotDone}`} />
            完成
          </span>
          <span>
            <i className={`${styles.dot} ${styles.dotActive}`} />
            进行中
          </span>
          <span>
            <i className={`${styles.dot} ${styles.dotTodo}`} />
            待办
          </span>
        </div>
      </div>

      <div className={styles.timeline}>
        {day.loading && !day.now ? <p className={styles.loading}>正在读取今天的时间…</p> : null}
        {day.loadError ? <p className={styles.error}>{day.loadError}</p> : null}

        {!day.loading && day.plans.length === 0 ? (
          <EmptyState
            blocked={blocked}
            onCreate={() => setCreating(true)}
            title={dayTab === "tomorrow" ? "明天还没有计划" : undefined}
            hint={
              dayTab === "tomorrow"
                ? "可在晚间复盘里复制今天、改期未完成，或直接在这里新建。"
                : undefined
            }
          />
        ) : null}

        {!day.loading && day.plans.length > 0 && visible.length === 0 ? (
          <p className={styles.loading}>当前筛选下没有计划，试试「全部」。</p>
        ) : null}

        {groups.map(({ segment, plans }) => {
          const doneCount = plans.filter((plan) => plan.status === "done").length;
          return (
            <section key={segment.key}>
              <div className={styles.segment}>
                <span
                  className={`${styles.segDot} ${
                    segment.key === "afternoon"
                      ? styles.segAfternoon
                      : segment.key === "evening"
                        ? styles.segEvening
                        : ""
                  }`}
                />
                <b>{segment.name}</b>
                <span className={styles.segRange}>{segment.range}</span>
                <button
                  type="button"
                  className={styles.segReview}
                  disabled={!day.now || !todayDate}
                  onClick={() => setReviewSegment(segment.key)}
                >
                  复盘
                </button>
                <span className={styles.segCount}>
                  {doneCount}/{plans.length} 完成
                </span>
              </div>

              {day.now &&
              day.date === day.now.date &&
              day.now.minute >= segment.from &&
              day.now.minute < segment.to ? (
                <div className={styles.nowline}>
                  <span>现在 · {formatMinute(day.now.minute)}</span>
                </div>
              ) : null}

              {plans.map((plan) => (
                <PlanItem
                  key={plan.id}
                  plan={plan}
                  actionsDisabled={blocked}
                  completing={day.completingId === plan.id}
                  skipping={day.skippingId === plan.id}
                  onComplete={(id) => {
                    void day.completePlan(id);
                  }}
                  onSkip={(id) => {
                    void day.skipPlan(id);
                  }}
                />
              ))}
            </section>
          );
        })}
      </div>

      <ReviewBar date={todayDate} now={day.now} onOpen={(segment) => setReviewSegment(segment)} />
    </>
  );

  const overlays = (
    <>
      {creating && !blocked && day.date ? (
        <CreatePlanForm
          busy={day.creating}
          weekGoals={weekGoalsQuery.data ?? []}
          onClose={() => setCreating(false)}
          onSubmit={(fields) => day.createPlan(fields, day.date!)}
        />
      ) : null}

      {reviewSegment && day.now && todayDate && tomorrowDate ? (
        <SegmentReviewPanel
          date={todayDate}
          segment={reviewSegment}
          now={day.now}
          todayPlans={
            reviewSegment === "evening"
              ? (todayPlansQuery.data ?? (dayTab === "today" ? day.plans : []))
              : dayTab === "today"
                ? day.plans
                : []
          }
          tomorrowDate={tomorrowDate}
          weekGoals={weekGoalsQuery.data ?? []}
          blocked={blocked}
          busyCopy={day.copying}
          busyReschedule={day.rescheduling}
          busyCreate={day.creating}
          onClose={() => setReviewSegment(null)}
          onCopyToday={(planIds) => day.copyPlansTo(planIds, tomorrowDate)}
          onRescheduleUnfinished={(plans) => day.reschedulePlansTo(plans, tomorrowDate)}
          onCreateTomorrow={(fields) => day.createPlan(fields, tomorrowDate)}
          onToast={day.setToast}
        />
      ) : null}

      {day.toast ? (
        <div className={styles.toast} role="status">
          {day.toast}
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <div className={styles.panel}>
        {body}
        {overlays}
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.window}>{body}</div>
      {overlays}
    </div>
  );
}
