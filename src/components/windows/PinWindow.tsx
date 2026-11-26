import { isTauri } from "@tauri-apps/api/core";
import { hidePin, setDragging } from "../../api/window";
import { useActiveNow } from "../../hooks/useActiveNow";
import { formatMinute } from "../../lib/format";
import styles from "./PinWindow.module.css";

type Props = {
  /** 浏览器演示时关嵌入浮层，而不是系统窗。 */
  onCloseDemo?: () => void;
};

export function PinWindow({ onCloseDemo }: Props) {
  const { now, activePlan } = useActiveNow();

  async function handleClose() {
    await hidePin();
    onCloseDemo?.();
  }

  async function onDragStart() {
    await setDragging(true);
    if (isTauri()) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().startDragging();
      } catch {
        // ignore
      }
    }
  }

  async function onDragEnd() {
    await setDragging(false);
  }

  return (
    <div className={styles.shell}>
      <div
        className={styles.card}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          void onDragStart();
        }}
        onPointerUp={() => {
          void onDragEnd();
        }}
      >
        <div className={styles.row}>
          <span className={styles.pulse} aria-hidden />
          <div className={styles.text}>
            <div className={styles.label}>置顶时刻表</div>
            <div className={styles.title}>
              {activePlan ? activePlan.title : "当前没有进行中的计划"}
            </div>
            <div className={styles.meta}>
              {now ? `此刻 ${formatMinute(now.minute)}` : "读取时间…"}
              {activePlan
                ? ` · ${formatMinute(activePlan.start)}–${formatMinute(activePlan.end)}`
                : null}
            </div>
          </div>
          <button type="button" className={styles.close} onClick={() => void handleClose()}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
