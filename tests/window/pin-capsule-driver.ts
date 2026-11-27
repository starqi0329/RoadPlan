import type { PinCapsuleDriver } from "./pin-capsule-mock.ts";

/**
 * 置顶和胶囊的真机修复还没合入。
 * 这台机器也没有 Windows 桌面，看不到副窗。
 */
export function connectRealDriver(): (() => Promise<PinCapsuleDriver>) | null {
  return null;
}
