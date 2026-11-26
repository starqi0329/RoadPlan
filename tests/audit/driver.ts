import type { AuditDriver } from "./types.ts";

/**
 * list_audit 还没有合入，这台机器也没有 Windows 桌面。
 * 系统标题栏和托盘不能在这里看。
 */
export function connectRealDriver(): (() => Promise<AuditDriver>) | null {
  return null;
}
