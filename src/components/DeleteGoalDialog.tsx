import type { DeleteGoalImpact, GoalView } from "../bindings";
import styles from "./DeleteGoalDialog.module.css";

type Props = {
  goal: GoalView;
  impact: DeleteGoalImpact | null;
  loading: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteGoalDialog({ goal, impact, loading, busy, onCancel, onConfirm }: Props) {
  return (
    <div className={styles.backdrop} role="presentation" onClick={onCancel}>
      <div
        className={styles.panel}
        role="dialog"
        aria-labelledby="delete-goal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="delete-goal-title">确认删除目标</h2>
        <p>即将归档「{goal.title}」。未结束的计划会被删除，历史计划保留。请先看清下面三个数。</p>
        {loading || !impact ? (
          <p>正在计算影响…</p>
        ) : (
          <div className={styles.nums}>
            <div>归档目标：{impact.goalsArchived} 个</div>
            <div>删除未结束计划：{impact.plansDeleted} 条</div>
            <div>保留历史计划：{impact.plansKept} 条</div>
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className={styles.danger}
            disabled={busy || loading || !impact}
            onClick={onConfirm}
          >
            {busy ? "删除中…" : "确认删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
