import type { MinCloseDriver } from "./min-close-mock.ts";

/**
 * 最小化还没有契约命令。这台机器也没有 Windows 桌面，
 * 任务栏和托盘不能在这里点。
 */
export function connectRealDriver(): (() => Promise<MinCloseDriver>) | null {
  return null;
}
