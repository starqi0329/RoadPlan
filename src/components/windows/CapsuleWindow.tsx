import { useRef } from "react";
import { hideCapsule } from "../../api/window";
import { useActiveNow } from "../../hooks/useActiveNow";
import { formatMinute } from "../../lib/format";
import { noteDragEnd, noteDragStart, pointerMoved, startDraggingNow } from "../../lib/windowDrag";
import styles from "./CapsuleWindow.module.css";

type Props = {
  onOpenDemo?: () => void;
};

/** 置顶卡最小化后的迷你条：只留当前正在执行的那一条，点一下把置顶卡恢复回来。 */
export function CapsuleWindow({ onOpenDemo }: Props) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const { now, activePlan } = useActiveNow();

  async function restorePin() {
    await hideCapsule();
    onOpenDemo?.();
  }

  const remain = activePlan && now ? Math.max(activePlan.end - now.minute, 0) : null;

  return (
    <div className={styles.shell}>
      <button
        type="button"
        className={styles.mini}
        title="恢复置顶时刻表（拖动可挪位置）"
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          origin.current = { x: event.screenX, y: event.screenY };
          const onMove = (move: MouseEvent) => {
            if (move.buttons !== 1) return;
            if (!pointerMoved(origin.current, { x: move.screenX, y: move.screenY })) return;
            window.removeEventListener("mousemove", onMove);
            startDraggingNow();
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            noteDragEnd();
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
          noteDragStart();
        }}
        onClick={(event) => {
          if (pointerMoved(origin.current, { x: event.screenX, y: event.screenY })) return;
          void restorePin();
        }}
      >
        <span className={styles.pin} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M12 17v5" />
            <path d="M9 3h6l-1 5 3 3H7l3-3-1-5z" />
          </svg>
        </span>
        <span className={styles.text}>
          <span className={styles.line}>{activePlan ? activePlan.title : "今日时刻表"}</span>
          <small className={styles.sub}>
            {activePlan
              ? `${formatMinute(activePlan.start)}–${formatMinute(activePlan.end)}${
                  remain === null ? "" : ` · 剩余 ${remain} 分`
                }`
              : "已最小化 · 点击恢复"}
          </small>
        </span>
      </button>
    </div>
  );
}
