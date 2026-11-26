import type { PlanView } from "../bindings";
import { formatMinute, kindLabel, statusLabel } from "../lib/format";
import styles from "./PlanItem.module.css";

type Props = {
  plan: PlanView;
  completing: boolean;
  skipping: boolean;
  actionsDisabled: boolean;
  onComplete: (id: string) => void;
  onSkip: (id: string) => void;
};

export function PlanItem({
  plan,
  completing,
  skipping,
  actionsDisabled,
  onComplete,
  onSkip,
}: Props) {
  const statusClass =
    plan.status === "active"
      ? styles.itemActive
      : plan.status === "done"
        ? styles.itemDone
        : plan.status === "skipped"
          ? styles.itemSkipped
          : plan.status === "overdue"
            ? styles.itemOverdue
            : "";

  const badgeClass =
    plan.status === "active"
      ? styles.badgeActive
      : plan.status === "done"
        ? styles.badgeDone
        : plan.status === "overdue"
          ? styles.badgeOverdue
          : plan.status === "skipped"
            ? styles.badgeSkipped
            : "";

  const untreated = plan.outcome === null;
  const showComplete =
    untreated &&
    (plan.status === "upcoming" || plan.status === "active" || plan.status === "overdue");
  const showSkip = untreated;
  const showActions = (showComplete || showSkip) && !actionsDisabled;

  return (
    <article className={`${styles.item} ${statusClass}`}>
      <div className={styles.time}>
        <b className={styles.timeStart}>{formatMinute(plan.start)}</b>
        <small className={styles.timeEnd}>{formatMinute(plan.end)}</small>
      </div>
      <div className={styles.rail}>
        <span className={styles.node} aria-hidden />
      </div>
      <div className={styles.card}>
        <div className={styles.top}>
          <h3 className={styles.title}>{plan.title}</h3>
        </div>

        <div className={styles.metaRow}>
          <div className={styles.meta}>
            <span className={`${styles.badge} ${badgeClass}`}>{statusLabel(plan.status)}</span>
            <span>{kindLabel(plan.kind)}</span>
            {plan.late ? <span className={styles.late}>迟</span> : null}
            {plan.acceptance ? <span>{plan.acceptance}</span> : null}
          </div>

          {showActions ? (
            <div className={styles.actions}>
              {showComplete ? (
                <button
                  type="button"
                  className={`${styles.action} ${styles.actionPrimary}`}
                  disabled={!plan.canComplete || completing || skipping}
                  title={plan.canComplete ? "标记完成" : "还没到开始时间，不能标记完成"}
                  onClick={() => onComplete(plan.id)}
                >
                  {completing ? "…" : "完成"}
                </button>
              ) : null}
              {showSkip ? (
                <button
                  type="button"
                  className={styles.action}
                  disabled={completing || skipping}
                  onClick={() => onSkip(plan.id)}
                >
                  {skipping ? "…" : "跳过"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
