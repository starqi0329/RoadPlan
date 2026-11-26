import type { StabilityDriver } from "./stability-mock.ts";

/**
 * 布局校验还没合入，这台机器也没有 Windows 桌面。
 * 折叠、托盘和冷启动后的画面不能在这里看。
 */
export function connectRealDriver(): (() => Promise<StabilityDriver>) | null {
  return null;
}
