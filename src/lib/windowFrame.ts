import type { WindowFrame } from "../bindings";

/** 折叠后主窗内容区只留顶栏。 */
export const TITLEBAR_HEIGHT = 60;

/** 与后端热修建议一致：展开态可用区下限。 */
export const MIN_EXPANDED_WIDTH = 640;
export const MIN_EXPANDED_HEIGHT = 480;

/** 明显甩出可用桌面的坐标（真机曾出现约 -16000）。 */
const OFFSCREEN = 10000;

export function isSaneExpandedFrame(frame: WindowFrame): boolean {
  return (
    Number.isFinite(frame.x) &&
    Number.isFinite(frame.y) &&
    Number.isFinite(frame.width) &&
    Number.isFinite(frame.height) &&
    frame.width >= MIN_EXPANDED_WIDTH &&
    frame.height >= MIN_EXPANDED_HEIGHT &&
    Math.abs(frame.x) < OFFSCREEN &&
    Math.abs(frame.y) < OFFSCREEN
  );
}

export function isCollapsedSized(frame: WindowFrame): boolean {
  return Number.isFinite(frame.height) && frame.height > 0 && frame.height <= TITLEBAR_HEIGHT + 20;
}
