import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { isAppError } from "../api/result";
import { listGoalReviews, saveReview, updateReview } from "../api/reviews";
import type { GoalView, Review } from "../bindings";
import { translateAppError } from "../errors/appError";
import { ReviewStatsBlock } from "./ReviewStatsBlock";
import styles from "./GoalReviewPanel.module.css";

type Props = {
  goal: GoalView;
  blocked: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
};

export function GoalReviewPanel({ goal, blocked, onClose, onToast }: Props) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<Review | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["goal-reviews", goal.id],
    queryFn: () => listGoalReviews(goal.id),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const text = note.trim();
      if (editing) return updateReview(editing.id, text);
      return saveReview({ type: "goal", goal_id: goal.id }, text);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goal-reviews", goal.id] });
      setNote("");
      setEditing(null);
      setLocalError(null);
      onToast(editing ? "目标复盘已更新" : "目标复盘已保存");
    },
    onError: (error) => {
      setLocalError(
        isAppError(error)
          ? translateAppError(error)
          : error instanceof Error
            ? error.message
            : "保存失败",
      );
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) {
      setLocalError("请先写一点复盘笔记");
      return;
    }
    void saveMutation.mutateAsync();
  }

  const reviews = listQuery.data ?? [];

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-review-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>目标复盘</p>
            <h2 id="goal-review-title">{goal.title}</h2>
          </div>
          <button type="button" className={styles.close} onClick={onClose}>
            关闭
          </button>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label htmlFor="goal-review-note">{editing ? "修改这篇复盘" : "新写一篇复盘"}</label>
          <textarea
            id="goal-review-note"
            value={note}
            rows={5}
            disabled={blocked || saveMutation.isPending}
            placeholder="进展、卡点、下一周打算…"
            onChange={(event) => setNote(event.target.value)}
          />
          {localError ? <p className={styles.error}>{localError}</p> : null}
          <div className={styles.footer}>
            {editing ? (
              <button
                type="button"
                className={styles.ghost}
                onClick={() => {
                  setEditing(null);
                  setNote("");
                }}
              >
                取消修改
              </button>
            ) : null}
            <button type="submit" disabled={blocked || saveMutation.isPending}>
              {saveMutation.isPending ? "保存中…" : editing ? "更新复盘" : "保存新复盘"}
            </button>
          </div>
        </form>

        <div className={styles.list}>
          <h3>历史复盘（新的在前）</h3>
          {listQuery.isLoading ? <p className={styles.muted}>正在读取…</p> : null}
          {!listQuery.isLoading && reviews.length === 0 ? (
            <p className={styles.muted}>
              还没有目标复盘。写完上面的笔记并保存，会出现在这里，并附带保存时的统计快照。
            </p>
          ) : null}
          {reviews.map((review) => (
            <article key={review.id} className={styles.card}>
              <div className={styles.cardHead}>
                <time dateTime={review.createdAt}>{formatStamp(review.createdAt)}</time>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    setEditing(review);
                    setNote(review.note);
                    setLocalError(null);
                  }}
                >
                  改笔记
                </button>
              </div>
              <p className={styles.note}>{review.note || "（无文字）"}</p>
              <ReviewStatsBlock stats={review.stats} caption="保存时的统计" />
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatStamp(value: string): string {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (match) return `${match[1]} ${match[2]}`;
  return value;
}
