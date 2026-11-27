import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getWindowLayout, saveWindowLayout, setDragging } from "../api/window";

const MOVE_THRESHOLD_PX = 6;

export function pointerMoved(
  origin: { x: number; y: number } | null,
  point: { x: number; y: number },
): boolean {
  if (!origin) return false;
  return (
    Math.abs(point.x - origin.x) > MOVE_THRESHOLD_PX ||
    Math.abs(point.y - origin.y) > MOVE_THRESHOLD_PX
  );
}

/** 鼠标仍按着时立刻交给系统拖。前面不能再 await，否则 Windows 会错过这一下。 */
export function startDraggingNow(): void {
  if (!isTauri()) return;
  void getCurrentWindow().startDragging();
}

/** 拖动外观放到下一拍，避免这一拍的重绘抢在系统拖动之前。 */
export function noteDragStart(): void {
  window.setTimeout(() => {
    void setDragging(true).catch(() => undefined);
  }, 0);
}

export function noteDragEnd(): void {
  void setDragging(false).catch(() => undefined);
}

/** 置顶条 / 胶囊拖完后只更新坐标，尺寸沿用已保存的合法值。 */
export function usePersistSecondaryOrigin(kind: "pin" | "capsule"): void {
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let timer: number | undefined;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const stop = await getCurrentWindow().onMoved(() => {
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            void persistOrigin(kind);
          }, 200);
        });
        if (disposed) stop();
        else unlisten = stop;
      } catch {
        // 浏览器演示没有系统窗
      }
    })();

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      unlisten?.();
    };
  }, [kind]);
}

async function persistOrigin(kind: "pin" | "capsule"): Promise<void> {
  try {
    const win = getCurrentWindow();
    const factor = await win.scaleFactor();
    const outer = await win.outerPosition();
    const layout = await getWindowLayout();
    const current = layout[kind];
    if (!current) return;
    const x = Math.round(outer.x / factor);
    const y = Math.round(outer.y / factor);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x === current.x && y === current.y) return;
    await saveWindowLayout({
      ...layout,
      [kind]: { ...current, x, y },
    });
  } catch {
    // 保存失败不打断拖动
  }
}
