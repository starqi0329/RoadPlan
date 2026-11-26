import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listGoals } from "../api/goals";
import { isAppError } from "../api/result";
import type { PlanView } from "../bindings";
import { isUnimplemented } from "../errors/appError";
import { useDayPlans } from "../hooks/useDayPlans";
import { formatDateHeading, formatMinute, statusLabel } from "../lib/format";
import { groupPlansBySegment } from "../lib/segments";
import { CreatePlanForm } from "./CreatePlanForm";
import { EmptyState } from "./EmptyState";
import { PlanItem } from "./PlanItem";
import styles from "./DayView.module.css";

type Filter = "all" | "todo" | "done";

type Props = {
  onOpenGoals: () => void;
};

function matchesFilter(plan: PlanView, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "done") return plan.status === "done" || plan.status === "skipped";
  return plan.status === "upcoming" || plan.status === "active" || plan.status === "overdue";
}

export function DayView({ onOpenGoals }: Props) {
  const day = useDayPlans();
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);

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

  const visible = useMemo(
    () => day.plans.filter((plan) => matchesFilter(plan, filter)),
    [day.plans, filter],
  );
  const groups = useMemo(() => groupPlansBySegment(visible), [visible]);

  const activeTitle = day.plans.find((plan) => plan.status === "active")?.title ?? null;

  if (day.loading && !day.now) {
    return (
      <div className={styles.shell}>
        <div className={styles.window}>
          <p className={styles.loading}>正在读取今天的时间…</p>
        </div>
      </div>
    );
  }

  if (day.loadError && !day.now) {
    return (
      <div className={styles.shell}>
        <div className={styles.window}>
          <p className={styles.error}>{day.loadError}</p>
        </div>
      </div>
    );
  }

  const blocked = day.backendGap && day.mode === "tauri";

  return (
    <div className={styles.shell}>
      <div className={styles.window}>
        <header className={styles.titlebar}>
          <div className={styles.brand}>
            时序
            <small>日计划</small>
          </div>
          <nav className={styles.nav} aria-label="主区域">
            <button type="button" aria-current="page">
              日计划
            </button>
            <button type="button" onClick={onOpenGoals}>
              目标
            </button>
          </nav>
          <div className={styles.datebox}>
            <span className={styles.dateMain}>{day.date ? formatDateHeading(day.date) : "—"}</span>
            <span className={styles.dateSub}>
              {day.now ? `此刻 ${formatMinute(day.now.minute)}` : "读取时间中"}
            </span>
          </div>
          <div className={styles.nowtag}>
            <span className={styles.pulse} aria-hidden />
            {activeTitle ? (
              <>
                正在执行 <b>{activeTitle}</b>
              </>
            ) : (
              <span>当前没有进行中的计划</span>
            )}
          </div>
        </header>

        {day.banner ? <div className={styles.banner}>{day.banner}</div> : null}
        {day.backendGap ? (
          <div className={styles.gap}>
            计划读写还没接上后端。浏览器可用演示数据；真机持久化要等后端就绪后再联调。
          </div>
        ) : null}

        <div className={styles.head}>
          <h1>今日时刻计划</h1>
          <button
            type="button"
            className={styles.add}
            disabled={blocked}
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
          {day.loadError ? <p className={styles.error}>{day.loadError}</p> : null}

          {!day.loading && day.plans.length === 0 ? (
            <EmptyState blocked={blocked} onCreate={() => setCreating(true)} />
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

        <footer className={styles.statusLine}>
          状态文案来自后端字段（{statusLabel("upcoming")} / {statusLabel("active")} /{" "}
          {statusLabel("overdue")}），界面不重算能不能完成。
        </footer>
      </div>

      {creating && !blocked ? (
        <CreatePlanForm
          busy={day.creating}
          weekGoals={weekGoalsQuery.data ?? []}
          onClose={() => setCreating(false)}
          onSubmit={day.createPlan}
        />
      ) : null}

      {day.toast ? (
        <div className={styles.toast} role="status">
          {day.toast}
        </div>
      ) : null}
    </div>
  );
}
