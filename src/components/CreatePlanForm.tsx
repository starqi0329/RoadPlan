import { useState, type FormEvent } from "react";
import type { GoalView, PlanFields, PlanKind } from "../bindings";
import { parseTimeInput } from "../lib/format";
import styles from "./CreatePlanForm.module.css";

type Props = {
  busy: boolean;
  weekGoals: GoalView[];
  onClose: () => void;
  onSubmit: (fields: PlanFields) => Promise<unknown>;
};

const KIND_OPTIONS: { value: PlanKind; label: string }[] = [
  { value: "core", label: "核心" },
  { value: "work", label: "工作" },
  { value: "routine", label: "日常" },
  { value: "review", label: "复盘" },
];

export function CreatePlanForm({ busy, weekGoals, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [startText, setStartText] = useState("09:00");
  const [endText, setEndText] = useState("10:00");
  const [kind, setKind] = useState<PlanKind>("work");
  const [weekGoalId, setWeekGoalId] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const start = parseTimeInput(startText);
    const end = parseTimeInput(endText);
    if (start === null || end === null) {
      setError("时间请写成 09:00 这种格式");
      return;
    }
    if (!(start < end)) {
      setError("结束时间必须晚于开始时间");
      return;
    }
    if (!title.trim()) {
      setError("请填写标题");
      return;
    }
    if (kind === "core") {
      if (weekGoals.length === 0) {
        setError("还没有未删除的周目标，请先到「目标」里新建一条周目标");
        return;
      }
      if (!weekGoalId) {
        setError("核心计划必须选择所属周目标");
        return;
      }
    }

    const fields: PlanFields = {
      start,
      end,
      title: title.trim(),
      acceptance: acceptance.trim(),
      kind,
      weekGoalId: kind === "core" ? weekGoalId : weekGoalId || null,
      note: null,
    };

    try {
      await onSubmit(fields);
      onClose();
    } catch {
      // 错误提示由上层 toast 处理
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <form
        className={styles.panel}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className={styles.head}>
          <h2>新建计划</h2>
          <p>核心计划需挂周目标</p>
        </div>

        <div className={styles.field}>
          <label htmlFor="plan-title">标题</label>
          <input
            id="plan-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：整理今日待办"
            autoFocus
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="plan-start">开始</label>
            <input
              id="plan-start"
              value={startText}
              onChange={(event) => setStartText(event.target.value)}
              placeholder="09:00"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="plan-end">结束</label>
            <input
              id="plan-end"
              value={endText}
              onChange={(event) => setEndText(event.target.value)}
              placeholder="10:00"
            />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="plan-kind">种类</label>
          <select
            id="plan-kind"
            value={kind}
            onChange={(event) => {
              const next = event.target.value as PlanKind;
              setKind(next);
              if (next !== "core") setWeekGoalId("");
            }}
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {kind === "core" ? (
          <div className={styles.field}>
            <label htmlFor="plan-week-goal">所属周目标</label>
            {weekGoals.length === 0 ? (
              <p className={styles.error}>当前没有未删除的周目标。请先到「目标」页新建周目标。</p>
            ) : (
              <select
                id="plan-week-goal"
                value={weekGoalId}
                onChange={(event) => setWeekGoalId(event.target.value)}
              >
                <option value="">请选择周目标</option>
                {weekGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}（{goal.period}）
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : null}

        <div className={styles.field}>
          <label htmlFor="plan-acceptance">验收方式（可空）</label>
          <input
            id="plan-acceptance"
            value={acceptance}
            onChange={(event) => setAcceptance(event.target.value)}
            placeholder="怎样算做完"
          />
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="submit" className={styles.submit} disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}
