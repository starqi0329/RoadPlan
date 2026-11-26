import type { WindowDriver } from "./types.ts";

/**
 * 真实窗口命令还没有合入，这台机器也没有 Windows 桌面。
 * 托盘、置顶、胶囊和拖动不能在这里调用。
 */
export function connectRealDriver(): (() => Promise<WindowDriver>) | null {
  return null;
}
