import { useState } from "react";
import type { GoalView, PlanFields, PlanView } from "../bindings";
import { CreatePlanForm } from "./CreatePlanForm";
import styles from "./TomorrowPlanZone.module.css";

type Props = {
  todayPlans: PlanView[];
  tomorrowDate: string;
  weekGoals: GoalView[];
  busyCopy: boolean;
  busyReschedule: boolean;
  busyCreate: boolean;
  blocked: boolean;
  onCopyToday: (planIds: string[]) => Promise<unknown>;
  onRescheduleUnfinished: (plans: PlanView[]) => Promise<unknown>;
  onCreateTomorrow: (fields: PlanFields) => Promise<unknown>;
};

export function TomorrowPlanZone({
  todayPlans,
  tomorrowDate,
  weekGoals,
  busyCopy,
  busyReschedule,
  busyCreate,
  blocked,
  onCopyToday,
  onRescheduleUnfinished,
  onCreateTomorrow,
}: Props) {
  const [creating, setCreating] = useState(false);

  const unfinished = todayPlans.filter(
    (plan) => plan.status === "upcoming" || plan.status === "active" || plan.status === "overdue",
  );

  return (
    <section className={styles.zone} aria-label="明天计划区">
      <div className={styles.head}>
        <h3>明天计划</h3>
        <span>{tomorrowDate}</span>
      </div>
      <p className={styles.hint}>
        晚间复盘时可以复制今天、把没做完的改到明天，或直接新建明天的计划。排好后可在日计划切到「明天」核对。
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          disabled={blocked || busyCopy || todayPlans.length === 0}
          onClick={() => {
            void onCopyToday(todayPlans.map((plan) => plan.id));
          }}
        >
          {busyCopy ? "复制中…" : "复制今天全部到明天"}
        </button>
        <button
          type="button"
          disabled={blocked || busyReschedule || unfinished.length === 0}
          onClick={() => {
            void onRescheduleUnfinished(unfinished);
          }}
        >
          {busyReschedule ? "改期中…" : `未完成改到明天（${unfinished.length}）`}
        </button>
        <button type="button" disabled={blocked} onClick={() => setCreating(true)}>
          新建明天计划
        </button>
      </div>
      {todayPlans.length === 0 ? (
        <p className={styles.empty}>今天还没有计划可复制。可以先新建明天的计划。</p>
      ) : null}

      {creating && !blocked ? (
        <CreatePlanForm
          busy={busyCreate}
          weekGoals={weekGoals}
          onClose={() => setCreating(false)}
          onSubmit={onCreateTomorrow}
        />
      ) : null}
    </section>
  );
}
