import { useEffect, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import type { PlanStatus } from "../../bindings";
import { hidePin, showCapsule, showMain } from "../../api/window";
import { useActiveNow } from "../../hooks/useActiveNow";
import { formatMinute } from "../../lib/format";
import { noteDragEnd, noteDragStart, usePersistSecondaryOrigin } from "../../lib/windowDrag";
import { CapsuleWindow } from "./CapsuleWindow";
import styles from "./PinWindow.module.css";

const MINI_HEIGHT = 110;

type Props = {
  /** 浏览器演示时关嵌入浮层，而不是系统窗。 */
  onCloseDemo?: () => void;
};

function rowClass(status: PlanStatus): string {
  if (status === "active") return `${styles.row} ${styles.rowActive}`;
  if (status === "done") return `${styles.row} ${styles.rowDone}`;
  return styles.row;
}

/** 置顶卡片：今日时刻表，按住标题栏可拖。 */
export function PinWindow({ onCloseDemo }: Props) {
  const { now, plans, activePlan } = useActiveNow();
  const [mini, setMini] = useState(false);
  usePersistSecondaryOrigin("pin");

  // 最小化不是另开一个窗，是这张卡自己缩成迷你条：同一个 WebView，按窗口高度切形态。
  useEffect(() => {
    const win = getCurrentWindow();
    let alive = true;
    const sync = async () => {
      const size = await win.innerSize();
      const scale = await win.scaleFactor();
      if (alive) setMini(size.height / scale < MINI_HEIGHT);
    };
    void sync();
    const unlisten = win.onResized(() => {
      void sync();
    });
    const stop = listen<{ mini: boolean }>("pin-mini-mode", (event) => {
      setMini(event.payload.mini);
    });
    return () => {
      alive = false;
      void unlisten.then((fn) => fn());
      void stop.then((fn) => fn());
    };
  }, []);

  function onHeadDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    noteDragStart();
  }

  /** 按钮在标题栏的拖动区里，只拦住冒泡；不能 preventDefault，否则 click 不再派发。 */
  function blockDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
  }

  async function openFull() {
    await showMain();
    await hidePin();
    onCloseDemo?.();
  }

  async function minimizeToCapsule() {
    await showCapsule();
    onCloseDemo?.();
  }

  async function handleClose() {
    await hidePin();
    onCloseDemo?.();
  }

  if (mini) {
    return <CapsuleWindow onOpenDemo={onCloseDemo} />;
  }

  const subtitle = activePlan
    ? `正在执行 · ${formatMinute(activePlan.start)}–${formatMinute(activePlan.end)}`
    : `暂无进行中计划${now ? ` · ${formatMinute(now.minute)}` : ""}`;

  return (
    <div className={styles.shell} data-pin-bar="true">
      <div className={styles.head} onPointerDown={onHeadDown} onPointerUp={noteDragEnd}>
        <span className={styles.badge} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M12 17v5" />
            <path d="M9 3h6l-1 5 3 3H7l3-3-1-5z" />
          </svg>
        </span>
        <span className={styles.titles}>
          <span className={styles.title}>今日时刻表</span>
          <small className={styles.subtitle}>{subtitle}</small>
        </span>
        <button
          type="button"
          className={styles.action}
          title="打开完整时刻表"
          aria-label="打开完整时刻表"
          onPointerDown={blockDrag}
          onClick={() => void openFull()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.action}
          title="最小化到桌面"
          aria-label="最小化到桌面"
          onPointerDown={blockDrag}
          onClick={() => void minimizeToCapsule()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.action} ${styles.danger}`}
          title="取消置顶"
          aria-label="取消置顶"
          onPointerDown={blockDrag}
          onClick={() => void handleClose()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className={styles.body}>
        {plans.length === 0 ? (
          <div className={styles.empty}>今天还没有计划</div>
        ) : (
          plans.map((plan) => (
            <div key={plan.id} className={rowClass(plan.status)} title={plan.title}>
              <span className={styles.time}>{formatMinute(plan.start)}</span>
              <i className={styles.dot} aria-hidden />
              <span className={styles.text}>{plan.title}</span>
              <span className={styles.duration}>{plan.end - plan.start}min</span>
            </div>
          ))
        )}
      </div>

      <div className={styles.foot}>
        <i className={styles.live} aria-hidden />
        始终显示在桌面最前 · 拖动标题栏可移动
      </div>
    </div>
  );
}
