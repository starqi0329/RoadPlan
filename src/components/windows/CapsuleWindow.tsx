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
        title="展开为今日时刻表"
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
        <span className={activePlan ? styles.dot : `${styles.dot} ${styles.dotIdle}`} aria-hidden />
        <span className={styles.text}>
          <span className={styles.line}>
            {activePlan ? `正在执行：${activePlan.title}` : "当前没有执行中的计划"}
          </span>
          {activePlan ? (
            <small className={styles.sub}>
              {`${formatMinute(activePlan.start)}–${formatMinute(activePlan.end)}${
                remain === null ? "" : ` · 剩余 ${remain} 分`
              }`}
            </small>
          ) : null}
        </span>
      </button>
    </div>
  );
}
