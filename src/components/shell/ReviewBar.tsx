import { useQueries } from "@tanstack/react-query";
import { getSegmentReview } from "../../api/reviews";
import type { NowInfo, Segment } from "../../bindings";
import { DAY_SEGMENTS, segmentHasStarted } from "../../lib/segments";
import styles from "./ReviewBar.module.css";

type Props = {
  date: string | null;
  now: NowInfo | null;
  onOpen: (segment: Segment) => void;
};

const TITLES: Record<Segment, string> = {
  morning: "上午复盘",
  afternoon: "下午复盘",
  evening: "晚间复盘",
};

export function ReviewBar({ date, now, onOpen }: Props) {
  const reviews = useQueries({
    queries: DAY_SEGMENTS.map((segment) => ({
      queryKey: ["segment-review", date ?? "pending", segment.key],
      queryFn: () => getSegmentReview(date!, segment.key),
      enabled: Boolean(date),
    })),
  });

  return (
    <div className={styles.bar} role="group" aria-label="时段复盘">
      {DAY_SEGMENTS.map((segment, index) => {
        const started =
          Boolean(now) &&
          Boolean(date) &&
          segmentHasStarted(now!.date, now!.minute, date!, segment.key);
        const saved = Boolean(reviews[index]?.data);
        const sub = !started ? "该时段尚未开始" : saved ? "已保存" : "可写复盘";
        return (
          <button
            key={segment.key}
            type="button"
            className={`${styles.btn} ${saved ? styles.saved : ""}`}
            disabled={!date || !now}
            onClick={() => onOpen(segment.key)}
          >
            <span className={styles.icon} aria-hidden>
              <SegmentIcon segment={segment.key} />
            </span>
            <span className={styles.text}>
              <span className={styles.title}>{TITLES[segment.key]}</span>
              <span className={styles.sub}>{sub}</span>
            </span>
            <span className={styles.arrow} aria-hidden>
              ›
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SegmentIcon({ segment }: { segment: Segment }) {
  if (segment === "morning") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3v2M5 6l1.5 1.5M19 6l-1.5 1.5M3 12h2M19 12h2" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    );
  }
  if (segment === "afternoon") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 14A8 8 0 019 3a8 8 0 105 11z" />
    </svg>
  );
}
