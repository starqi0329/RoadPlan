import { useMemo, useState, type FormEvent } from "react";
import type { CreateGoalInput, GoalLevel, GoalMeasure, GoalView, NowInfo } from "../bindings";
import { levelLabel } from "../lib/goalLabels";
import styles from "./CreateGoalForm.module.css";

type Props = {
  busy: boolean;
  now: NowInfo | null;
  goals: GoalView[];
  onClose: () => void;
  onSubmit: (input: CreateGoalInput) => Promise<unknown>;
};

export function CreateGoalForm({ busy, now, goals, onClose, onSubmit }: Props) {
  const [level, setLevel] = useState<GoalLevel>("year");
  const [title, setTitle] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [parentId, setParentId] = useState("");
  const [measureType, setMeasureType] = useState<"milestones" | "count">("milestones");
  const [countTarget, setCountTarget] = useState("3");
  const [countUnit, setCountUnit] = useState("次");
  const [error, setError] = useState<string | null>(null);

  const parents = useMemo(() => {
    if (level === "month") {
      return goals.filter((goal) => goal.level === "year");
    }
    if (level === "week") {
      return goals.filter((goal) => goal.level === "month");
    }
    return [];
  }, [goals, level]);

  const period = useMemo(() => {
    if (!now) return "";
    if (level === "year") return now.periods.year;
    if (level === "month") return now.periods.month;
    return now.periods.week;
  }, [level, now]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("请填写标题");
      return;
    }
    if (!period) {
      setError("还读不到当前周期");
      return;
    }
    if (level !== "year" && !parentId) {
      setError(`请先选择所属的${levelLabel(level === "month" ? "year" : "month")}目标`);
      return;
    }
    if (level !== "year" && parents.length === 0) {
      setError(
        `还没有可挂靠的${levelLabel(level === "month" ? "year" : "month")}目标，请先新建上级`,
      );
      return;
    }

    let measure: GoalMeasure;
    if (measureType === "milestones") {
      measure = { type: "milestones" };
    } else {
      const target = Number(countTarget);
      if (!Number.isInteger(target) || target <= 0) {
        setError("累积次数目标要写成正整数");
        return;
      }
      measure = { type: "count", target, unit: countUnit.trim() || "次" };
    }

    const input: CreateGoalInput = {
      level,
      parentId: level === "year" ? null : parentId,
      period,
      title: title.trim(),
      acceptance: acceptance.trim(),
      measure,
    };

    try {
      await onSubmit(input);
      onClose();
    } catch {
      // toast 由上层处理
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
          <h2>新建目标</h2>
          <p>周挂月、月挂年</p>
        </div>

        <div className={styles.field}>
          <label htmlFor="goal-level">层级</label>
          <select
            id="goal-level"
            value={level}
            onChange={(event) => {
              setLevel(event.target.value as GoalLevel);
              setParentId("");
            }}
          >
            <option value="year">年目标</option>
            <option value="month">月目标</option>
            <option value="week">周目标</option>
          </select>
        </div>

        <p className={styles.hint}>周期将使用当前：{period || "—"}</p>

        {level !== "year" ? (
          <div className={styles.field}>
            <label htmlFor="goal-parent">
              所属{levelLabel(level === "month" ? "year" : "month")}目标
            </label>
            <select
              id="goal-parent"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">请选择</option>
              {parents.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}（{goal.period}）
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className={styles.field}>
          <label htmlFor="goal-title">标题</label>
          <input
            id="goal-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：推进产品能力升级"
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="goal-acceptance">验收方式（可空）</label>
          <input
            id="goal-acceptance"
            value={acceptance}
            onChange={(event) => setAcceptance(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="goal-measure">进度口径</label>
          <select
            id="goal-measure"
            value={measureType}
            onChange={(event) => setMeasureType(event.target.value as "milestones" | "count")}
          >
            <option value="milestones">里程碑</option>
            <option value="count">累积次数</option>
          </select>
        </div>

        {measureType === "count" ? (
          <>
            <div className={styles.field}>
              <label htmlFor="goal-target">目标次数</label>
              <input
                id="goal-target"
                value={countTarget}
                onChange={(event) => setCountTarget(event.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="goal-unit">单位</label>
              <input
                id="goal-unit"
                value={countUnit}
                onChange={(event) => setCountUnit(event.target.value)}
              />
            </div>
          </>
        ) : null}

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
