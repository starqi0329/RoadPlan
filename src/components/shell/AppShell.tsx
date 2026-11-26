import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listGoals } from "../../api/goals";
import { getNow, listPlans } from "../../api/plans";
import { isAppError } from "../../api/result";
import type { GoalLevel, PlanView } from "../../bindings";
import { isUnimplemented } from "../../errors/appError";
import { datePeriodLabel } from "../../lib/dateLabels";
import { formatDateHeading } from "../../lib/format";
import { DayView } from "../DayView";
import { GoalTree } from "../GoalTree";
import styles from "./AppShell.module.css";
import { LeftRail, type RailView } from "./LeftRail";
import { StatusBar } from "./StatusBar";

export function AppShell() {
  const [view, setView] = useState<RailView>("day");
  const [toast, setToast] = useState<string | null>(null);

  const nowQuery = useQuery({ queryKey: ["now"], queryFn: getNow });
  const now = nowQuery.data ?? null;

  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      try {
        return await listGoals(null, null);
      } catch (error) {
        if (isAppError(error) && isUnimplemented(error)) return [];
        throw error;
      }
    },
  });

  const todayPlansQuery = useQuery({
    queryKey: ["plans", now?.date ?? "pending", "shell"],
    queryFn: async () => {
      if (!now) return [] as PlanView[];
      return listPlans(now.date);
    },
    enabled: Boolean(now?.date),
  });

  const todayPlans = todayPlansQuery.data ?? [];
  const activePlan = todayPlans.find((plan) => plan.status === "active") ?? null;
  const doneCount = todayPlans.filter((plan) => plan.status === "done").length;

  const dateMain = now ? formatDateHeading(now.date) : "—";
  const dateSub = now ? datePeriodLabel(now.date) : "读取时间中";
  const storageHint = isTauri() ? "本地存储" : "浏览器演示（不写库）";

  function showPlaceholder(label: string) {
    setToast(`${label}：下一切片再做`);
    window.setTimeout(() => setToast(null), 2800);
  }

  return (
    <div className={styles.desktop}>
      <div className={styles.halo1} aria-hidden />
      <div className={styles.halo2} aria-hidden />
      <div className={styles.app} role="application" aria-label="时序">
        <header className={styles.titlebar}>
          <div className={styles.brand}>
            <div className={styles.logo} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
                <path d="M4 7h16M4 12h16M4 17h10" />
              </svg>
            </div>
            时序
          </div>
          <div className={styles.datebox}>
            <span className={styles.dateMain}>{dateMain}</span>
            <span className={styles.dateSub}>{dateSub}</span>
          </div>
          <div className={styles.nowtag}>
            <span className={styles.pulse} aria-hidden />
            {activePlan ? (
              <>
                正在执行 <b>{activePlan.title}</b>
              </>
            ) : (
              <span>当前没有进行中的计划</span>
            )}
          </div>
          <div className={styles.winbtns}>
            <button
              type="button"
              className={styles.wbtn}
              title="审计记录"
              onClick={() => showPlaceholder("审计")}
            >
              审
            </button>
            <button
              type="button"
              className={styles.wbtn}
              title="折叠"
              onClick={() => showPlaceholder("折叠")}
            >
              —
            </button>
            <button
              type="button"
              className={styles.wbtn}
              title="隐藏"
              onClick={() => showPlaceholder("隐藏")}
            >
              ◌
            </button>
          </div>
        </header>

        <div className={styles.body}>
          <LeftRail
            view={view}
            onSelect={setView}
            goals={goalsQuery.data ?? []}
            nowDate={now?.date ?? null}
            activePlan={activePlan}
          />
          <section className={styles.main}>
            {view === "day" ? (
              <DayView embedded />
            ) : (
              <GoalTree embedded level={view as GoalLevel} />
            )}
          </section>
        </div>

        <StatusBar doneCount={doneCount} totalCount={todayPlans.length} storageHint={storageHint} />
      </div>

      {toast ? (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
