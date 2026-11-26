import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { isAppError } from "../api/result";
import { getSegmentReview, saveReview, updateReview } from "../api/reviews";
import type { GoalView, NowInfo, PlanFields, PlanView, Segment } from "../bindings";
import { translateAppError } from "../errors/appError";
import { formatDateHeading } from "../lib/format";
import { segmentHasStarted, segmentMeta } from "../lib/segments";
import { ReviewStatsBlock } from "./ReviewStatsBlock";
import { TomorrowPlanZone } from "./TomorrowPlanZone";
import styles from "./SegmentReviewPanel.module.css";

type Props = {
  date: string;
  segment: Segment;
  now: NowInfo;
  todayPlans: PlanView[];
  tomorrowDate: string;
  weekGoals: GoalView[];
  blocked: boolean;
  busyCopy: boolean;
  busyReschedule: boolean;
  busyCreate: boolean;
  onClose: () => void;
  onCopyToday: (planIds: string[]) => Promise<unknown>;
  onRescheduleUnfinished: (plans: PlanView[]) => Promise<unknown>;
  onCreateTomorrow: (fields: PlanFields) => Promise<unknown>;
  onToast: (message: string) => void;
};

export function SegmentReviewPanel({
  date,
  segment,
  now,
  todayPlans,
  tomorrowDate,
  weekGoals,
  blocked,
  busyCopy,
  busyReschedule,
  busyCreate,
  onClose,
  onCopyToday,
  onRescheduleUnfinished,
  onCreateTomorrow,
  onToast,
}: Props) {
  const queryClient = useQueryClient();
  const meta = segmentMeta(segment);
  const started = segmentHasStarted(now.date, now.minute, date, segment);
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const reviewQuery = useQuery({
    queryKey: ["segment-review", date, segment],
    queryFn: () => getSegmentReview(date, segment),
  });

  useEffect(() => {
    if (reviewQuery.data) setNote(reviewQuery.data.note);
  }, [reviewQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const existing = reviewQuery.data;
      if (existing) return updateReview(existing.id, note.trim());
      return saveReview({ type: "segment", date, segment }, note.trim());
    },
    onSuccess: async (review) => {
      await queryClient.invalidateQueries({
        queryKey: ["segment-review", date, segment],
      });
      setNote(review.note);
      onToast("时段复盘已保存");
      setLocalError(null);
    },
    onError: (error) => {
      if (isAppError(error) && error.code === "too_early") {
        setLocalError("该时段尚未开始");
        return;
      }
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
    if (!started) {
      setLocalError("该时段尚未开始");
      return;
    }
    void saveMutation.mutateAsync();
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="segment-review-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{formatDateHeading(date)}</p>
            <h2 id="segment-review-title">
              {meta.name}复盘
              <small>{meta.range}</small>
            </h2>
          </div>
          <button type="button" className={styles.close} onClick={onClose}>
            关闭
          </button>
        </header>

        {!started ? (
          <div className={styles.warn} role="status">
            该时段尚未开始
          </div>
        ) : null}

        {reviewQuery.isLoading ? <p className={styles.muted}>正在读取复盘…</p> : null}

        {reviewQuery.data ? (
          <ReviewStatsBlock
            stats={reviewQuery.data.stats}
            caption="保存时记下的统计（之后改计划不会改这份快照）"
          />
        ) : started ? (
          <p className={styles.muted}>
            还没有这份时段复盘。写完笔记后保存，会记下当时的计划数 / 完成 / 跳过 / 逾期 / 专注分钟。
          </p>
        ) : (
          <p className={styles.muted}>到点之后才能写笔记并保存统计。</p>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          <label htmlFor="segment-review-note">复盘笔记</label>
          <textarea
            id="segment-review-note"
            value={note}
            rows={6}
            disabled={!started || blocked || saveMutation.isPending}
            placeholder={started ? "这一时段做得怎样、卡在哪里…" : "该时段尚未开始"}
            onChange={(event) => setNote(event.target.value)}
          />
          {localError ? <p className={styles.error}>{localError}</p> : null}
          <div className={styles.footer}>
            <button type="submit" disabled={!started || blocked || saveMutation.isPending}>
              {saveMutation.isPending ? "保存中…" : "保存复盘"}
            </button>
          </div>
        </form>

        {segment === "evening" ? (
          <TomorrowPlanZone
            todayPlans={todayPlans}
            tomorrowDate={tomorrowDate}
            weekGoals={weekGoals}
            busyCopy={busyCopy}
            busyReschedule={busyReschedule}
            busyCreate={busyCreate}
            blocked={blocked}
            onCopyToday={onCopyToday}
            onRescheduleUnfinished={onRescheduleUnfinished}
            onCreateTomorrow={onCreateTomorrow}
          />
        ) : null}
      </div>
    </div>
  );
}
