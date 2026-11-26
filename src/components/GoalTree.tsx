import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getNow } from "../api/plans";
import type { DeleteGoalImpact, GoalLevel, GoalView, MilestoneState, NowInfo } from "../bindings";
import { useGoals } from "../hooks/useGoals";
import { goalStateLabel, levelLabel, milestoneStateLabel } from "../lib/goalLabels";
import { CreateGoalForm } from "./CreateGoalForm";
import { DeleteGoalDialog } from "./DeleteGoalDialog";
import { GoalReviewPanel } from "./GoalReviewPanel";
import styles from "./GoalTree.module.css";

type Props = {
  /** 嵌在主窗右区时为 true。 */
  embedded?: boolean;
  /** 左轨选中的层级；缺省时显示年/月/周全部。 */
  level?: GoalLevel;
};

type ListMode = "active" | "deleted";

const ALL_LEVELS: GoalLevel[] = ["year", "month", "week"];

export function GoalTree({ embedded = false, level }: Props) {
  const goalsApi = useGoals();
  const nowQuery = useQuery({ queryKey: ["now"], queryFn: getNow });
  const now: NowInfo | null = nowQuery.data ?? null;

  const [listMode, setListMode] = useState<ListMode>("active");
  const [creating, setCreating] = useState(false);
  const [reviewGoal, setReviewGoal] = useState<GoalView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GoalView | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<DeleteGoalImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [milestoneDrafts, setMilestoneDrafts] = useState<Record<string, string>>({});

  const blocked = goalsApi.backendGap && goalsApi.mode === "tauri";
  const grouped = useMemo(() => {
    const source = listMode === "active" ? goalsApi.goals : goalsApi.deleted;
    const levels = level ? [level] : ALL_LEVELS;
    return levels
      .map((lv) => ({
        level: lv,
        items: source.filter((goal) => goal.level === lv),
      }))
      .filter((group) => group.items.length > 0);
  }, [goalsApi.deleted, goalsApi.goals, listMode, level]);

  const scopedActiveEmpty =
    listMode === "active" &&
    goalsApi.goals.filter((goal) => (level ? goal.level === level : true)).length === 0;

  const scopedDeletedEmpty =
    listMode === "deleted" &&
    goalsApi.deleted.filter((goal) => (level ? goal.level === level : true)).length === 0;

  async function openDelete(goal: GoalView) {
    setDeleteTarget(goal);
    setDeleteImpact(null);
    setImpactLoading(true);
    try {
      const impact = await goalsApi.previewDelete(goal.id);
      setDeleteImpact(impact);
    } catch {
      setDeleteTarget(null);
    } finally {
      setImpactLoading(false);
    }
  }

  const heading = level ? `${levelLabel(level)}目标` : "年 / 月 / 周目标";
  const crumb = level ? `层级 · ${levelLabel(level)}` : "层级链路 年 › 月 › 周";

  const content = (
    <>
      {goalsApi.banner ? <div className={styles.banner}>{goalsApi.banner}</div> : null}
      {goalsApi.backendGap ? (
        <div className={styles.gap}>
          目标命令这一切片还没接上后端。浏览器可用演示数据；真机持久化要等后端合并后再联调。
        </div>
      ) : null}

      <div className={styles.planHead}>
        <div className={styles.crumb}>{crumb}</div>
        <button
          type="button"
          className={styles.add}
          disabled={blocked || listMode === "deleted"}
          onClick={() => setCreating(true)}
        >
          + 新建目标
        </button>
      </div>

      <div className={styles.head}>
        <h2>{heading}</h2>
        <div className={styles.tabs} role="group" aria-label="目标列表">
          <button
            type="button"
            aria-pressed={listMode === "active"}
            onClick={() => setListMode("active")}
          >
            进行中
          </button>
          <button
            type="button"
            aria-pressed={listMode === "deleted"}
            onClick={() => setListMode("deleted")}
          >
            已删除
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {goalsApi.loading && goalsApi.goals.length === 0 ? (
          <p className={styles.loading}>正在读取目标…</p>
        ) : null}
        {goalsApi.loadError ? <p className={styles.error}>{goalsApi.loadError}</p> : null}

        {scopedActiveEmpty ? (
          <div className={styles.empty}>
            <h3>还没有{level ? levelLabel(level) : ""}目标</h3>
            <p>
              {level === "month"
                ? "先有年目标后，再挂月目标。"
                : level === "week"
                  ? "先有月目标后，再挂周目标。"
                  : "先建一条年目标，再挂月目标和周目标。进度会显示在每条目标上。"}
            </p>
            {!blocked ? (
              <button type="button" onClick={() => setCreating(true)}>
                添加第一条目标
              </button>
            ) : null}
          </div>
        ) : null}

        {scopedDeletedEmpty ? (
          <div className={styles.empty}>
            <h3>没有已删除的目标</h3>
            <p>删除目标后会出现在这里，确认上级还在时可以恢复。</p>
          </div>
        ) : null}

        {grouped.map((group) => (
          <section key={group.level} className={styles.section}>
            {!level ? (
              <div className={styles.sectionTitle}>
                <span className={styles.dot} />
                {levelLabel(group.level)}目标
              </div>
            ) : null}
            {group.items.map((goal) => {
              const ratio =
                goal.progress.total > 0
                  ? Math.min(100, Math.round((goal.progress.done / goal.progress.total) * 100))
                  : 0;
              return (
                <article key={goal.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <h3 className={styles.cardTitle}>{goal.title}</h3>
                  </div>
                  <div className={styles.meta}>
                    <span>{goal.period}</span>
                    <span>{goalStateLabel(goal.state)}</span>
                    <span>下级 {goal.childCount}</span>
                    {goal.measure.type === "count" ? (
                      <span>累积 · {goal.measure.unit}</span>
                    ) : (
                      <span>里程碑</span>
                    )}
                  </div>
                  <div className={styles.progress}>
                    进度 {goal.progress.done}/{goal.progress.total}
                    <div className={styles.bar}>
                      <i style={{ width: `${ratio}%` }} />
                    </div>
                  </div>

                  {goal.measure.type === "milestones" && listMode === "active" ? (
                    <div className={styles.milestones}>
                      {goal.milestones.map((item) => (
                        <div key={item.id} className={styles.milestone}>
                          <span>
                            {item.title} · {milestoneStateLabel(item.state)}
                          </span>
                          {(
                            [
                              ["todo", "待办"],
                              ["doing", "进行中"],
                              ["done", "完成"],
                            ] as const
                          ).map(([state, label]) => (
                            <button
                              key={state}
                              type="button"
                              disabled={blocked || item.state === state}
                              onClick={() => {
                                void goalsApi.setMilestoneState(
                                  goal.id,
                                  item.id,
                                  state as MilestoneState,
                                );
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      ))}
                      <div className={styles.addMs}>
                        <input
                          value={milestoneDrafts[goal.id] ?? ""}
                          placeholder="新里程碑标题"
                          disabled={blocked}
                          onChange={(event) =>
                            setMilestoneDrafts((prev) => ({
                              ...prev,
                              [goal.id]: event.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() => {
                            const title = (milestoneDrafts[goal.id] ?? "").trim();
                            if (!title) return;
                            void goalsApi.addMilestone(goal.id, title).then(() => {
                              setMilestoneDrafts((prev) => ({
                                ...prev,
                                [goal.id]: "",
                              }));
                            });
                          }}
                        >
                          添加
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className={styles.actions}>
                    {listMode === "active" ? (
                      <>
                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() => setReviewGoal(goal)}
                        >
                          写复盘
                        </button>
                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() => {
                            void goalsApi.setGoalState(goal.id, "achieved");
                          }}
                        >
                          标为达成
                        </button>
                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() => {
                            void goalsApi.setGoalState(goal.id, "dropped");
                          }}
                        >
                          放弃
                        </button>
                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() => {
                            void openDelete(goal);
                          }}
                        >
                          删除…
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={blocked}
                        onClick={() => {
                          void goalsApi.restoreGoal(goal.id);
                        }}
                      >
                        恢复
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </>
  );

  const overlays = (
    <>
      {creating && !blocked ? (
        <CreateGoalForm
          busy={goalsApi.creating}
          now={now}
          goals={goalsApi.goals}
          onClose={() => setCreating(false)}
          onSubmit={goalsApi.createGoal}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteGoalDialog
          goal={deleteTarget}
          impact={deleteImpact}
          loading={impactLoading}
          busy={goalsApi.deleting}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteImpact(null);
          }}
          onConfirm={() => {
            void goalsApi.deleteGoal(deleteTarget.id).then(() => {
              setDeleteTarget(null);
              setDeleteImpact(null);
            });
          }}
        />
      ) : null}

      {reviewGoal ? (
        <GoalReviewPanel
          goal={reviewGoal}
          blocked={blocked}
          onClose={() => setReviewGoal(null)}
          onToast={(message) => goalsApi.setToast(message)}
        />
      ) : null}

      {goalsApi.toast ? (
        <div className={styles.toast} role="status">
          {goalsApi.toast}
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <div className={styles.panel}>
        {content}
        {overlays}
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.window}>{content}</div>
      {overlays}
    </div>
  );
}
