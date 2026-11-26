import type { GoalLevel, GoalView, PlanView } from "../../bindings";
import { formatMinute } from "../../lib/format";
import styles from "./LeftRail.module.css";

export type RailView = "day" | GoalLevel;

type Props = {
  view: RailView;
  onSelect: (view: RailView) => void;
  goals: GoalView[];
  nowDate: string | null;
  activePlan: PlanView | null;
};

const LEVELS: {
  key: RailView;
  title: string;
  icon: "year" | "month" | "week" | "day";
}[] = [
  { key: "year", title: "年内计划", icon: "year" },
  { key: "month", title: "月内计划", icon: "month" },
  { key: "week", title: "周内计划", icon: "week" },
  { key: "day", title: "每日时间表", icon: "day" },
];

export function LeftRail({ view, onSelect, goals, nowDate, activePlan }: Props) {
  const yearCount = goals.filter((g) => g.level === "year" && !g.deletedAt).length;
  const monthCount = goals.filter((g) => g.level === "month" && !g.deletedAt).length;
  const weekCount = goals.filter((g) => g.level === "week" && !g.deletedAt).length;

  const chain = buildChain(goals, activePlan);

  return (
    <aside className={styles.rail} aria-label="计划层级">
      <div className={styles.railTitle}>计划层级 · 自上而下制定</div>
      {LEVELS.map((item) => {
        const sub =
          item.key === "year"
            ? `${nowDate?.slice(0, 4) ?? "—"} · ${yearCount} 个目标`
            : item.key === "month"
              ? `${monthLabel(nowDate)} · ${monthCount} 项`
              : item.key === "week"
                ? `${weekLabel(nowDate)} · ${weekCount} 项`
                : `${dayShort(nowDate)} · 日计划`;
        return (
          <button
            key={item.key}
            type="button"
            className={`${styles.level} ${view === item.key ? styles.active : ""}`}
            aria-current={view === item.key ? "page" : undefined}
            onClick={() => onSelect(item.key)}
          >
            <span className={styles.lico} aria-hidden>
              <LevelIcon kind={item.icon} />
            </span>
            <span className={styles.lmeta}>
              <span className={styles.t}>{item.title}</span>
              <span className={styles.s}>{sub}</span>
            </span>
            <span className={styles.chev} aria-hidden>
              ›
            </span>
          </button>
        );
      })}

      <div className={styles.chain}>
        <div className={styles.cap}>当前执行所属链路</div>
        {chain.length === 0 ? (
          <p className={styles.chainEmpty}>
            当前没有进行中的核心计划。开始一条挂了周目标的计划后，这里会显示年 → 月 → 周 → 计划。
          </p>
        ) : (
          chain.map((item, index) => (
            <div
              key={`${item.label}-${item.title}`}
              className={`${styles.chainItem} ${index === chain.length - 1 ? styles.now : ""}`}
            >
              <span className={styles.bullet} />
              <span className={styles.tx}>
                {item.label}
                <small>{item.title}</small>
              </span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function buildChain(
  goals: GoalView[],
  activePlan: PlanView | null,
): { label: string; title: string }[] {
  if (!activePlan) return [];
  const items: { label: string; title: string }[] = [];
  const week = activePlan.weekGoalId
    ? goals.find((g) => g.id === activePlan.weekGoalId && !g.deletedAt)
    : null;
  const month = week?.parentId ? goals.find((g) => g.id === week.parentId && !g.deletedAt) : null;
  const year = month?.parentId ? goals.find((g) => g.id === month.parentId && !g.deletedAt) : null;
  if (year) items.push({ label: "年度目标", title: year.title });
  if (month) items.push({ label: "月计划", title: month.title });
  if (week) items.push({ label: "周计划", title: week.title });
  items.push({
    label: activePlan.title,
    title: `${formatMinute(activePlan.start)} – ${formatMinute(activePlan.end)}`,
  });
  return items;
}

function monthLabel(date: string | null): string {
  if (!date) return "—";
  const m = date.match(/^\d{4}-(\d{2})/);
  return m ? `${Number(m[1])}月` : "—";
}

function weekLabel(date: string | null): string {
  if (!date) return "—";
  const day = Number(date.slice(8, 10));
  if (!day) return "—";
  return `第 ${Math.floor((day - 1) / 7) + 1} 周`;
}

function dayShort(date: string | null): string {
  if (!date) return "—";
  const m = date.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[1])}.${m[2]}` : "—";
}

function LevelIcon({ kind }: { kind: "year" | "month" | "week" | "day" }) {
  if (kind === "day") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  if (kind === "week") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="5" width="18" height="15" rx="2" />
        <path d="M7 9l2 2 4-4M7 16h10" />
      </svg>
    );
  }
  if (kind === "month") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="5" width="18" height="15" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h10M7 13h10M7 17h6" />
    </svg>
  );
}
