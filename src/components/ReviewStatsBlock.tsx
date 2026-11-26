import type { ReviewStats } from "../bindings";
import styles from "./ReviewStatsBlock.module.css";

type Props = {
  stats: ReviewStats;
  caption?: string;
};

export function ReviewStatsBlock({ stats, caption }: Props) {
  return (
    <div className={styles.wrap}>
      {caption ? <p className={styles.caption}>{caption}</p> : null}
      <dl className={styles.grid}>
        <div>
          <dt>计划</dt>
          <dd>{stats.planned}</dd>
        </div>
        <div>
          <dt>完成</dt>
          <dd>{stats.done}</dd>
        </div>
        <div>
          <dt>跳过</dt>
          <dd>{stats.skipped}</dd>
        </div>
        <div>
          <dt>逾期</dt>
          <dd>{stats.overdue}</dd>
        </div>
        <div>
          <dt>专注</dt>
          <dd>{stats.focusMinutes} 分</dd>
        </div>
      </dl>
    </div>
  );
}
