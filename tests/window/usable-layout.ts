import type { WindowFrame } from "./types.ts";

/**
 * 任务包要求主窗不要再变成「几十像素高」或明显甩出屏幕。
 * 契约还没写最小宽高，这里先用可复核的界限，汇报里已申请写进契约。
 * 100：离开「几十像素」。8000：事故坐标是 -16000，这一档算明显屏外；贴着屏幕边缘的负数不算。
 */
export const MIN_USABLE_EDGE = 100;
export const OFFSCREEN_ABS = 8000;

export function isUsableMainFrame(frame: WindowFrame): boolean {
  const numbers = [frame.x, frame.y, frame.width, frame.height];
  if (numbers.some((value) => typeof value !== "number" || !Number.isFinite(value))) return false;
  if (frame.width < MIN_USABLE_EDGE || frame.height < MIN_USABLE_EDGE) return false;
  if (Math.abs(frame.x) >= OFFSCREEN_ABS || Math.abs(frame.y) >= OFFSCREEN_ABS) return false;
  return true;
}
