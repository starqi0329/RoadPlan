import { isTauri } from "@tauri-apps/api/core";

export type WindowRole = "main" | "pin" | "capsule";

function roleFromString(value: string | null | undefined): WindowRole | null {
  if (value === "pin" || value === "capsule" || value === "main") return value;
  return null;
}

/** URL `?window=pin|capsule|main`（与后端副窗 URL 约定双保险）。 */
export function roleFromQuery(
  search = typeof window !== "undefined" ? window.location.search : "",
): WindowRole | null {
  return roleFromString(new URLSearchParams(search).get("window"));
}

/** 尽量同步读 Tauri 当前窗 label（首屏路由用，避免先画主壳）。 */
export function roleFromTauriLabelSync(): WindowRole | null {
  if (typeof window === "undefined" || !isTauri()) return null;
  try {
    const w = window as Window & {
      __TAURI_INTERNALS__?: {
        metadata?: { currentWindow?: { label?: string } };
      };
      __TAURI__?: {
        metadata?: { currentWindow?: { label?: string } };
      };
    };
    return (
      roleFromString(w.__TAURI_INTERNALS__?.metadata?.currentWindow?.label) ??
      roleFromString(w.__TAURI__?.metadata?.currentWindow?.label)
    );
  } catch {
    return null;
  }
}

/** 后端创建副窗时在页面脚本前写入，不依赖会打不开的 ?window= 地址。 */
export function roleFromBootGlobal(): WindowRole | null {
  if (typeof window === "undefined") return null;
  const marked = (window as Window & { __ROADPLAN_ROLE__?: string }).__ROADPLAN_ROLE__;
  return roleFromString(marked);
}

/** 当前前端落在哪个系统窗：启动标记、query，其次同步 label。 */
export function resolveWindowRole(): WindowRole {
  if (typeof window === "undefined") return "main";
  return roleFromBootGlobal() ?? roleFromQuery() ?? roleFromTauriLabelSync() ?? "main";
}

/**
 * 是否应推迟画主壳：Tauri 下同步还读不到角色时，先空白，等异步 label，
 * 避免 pin/capsule 副窗首帧误渲染整页 AppShell。
 */
export function shouldDeferMainShell(): boolean {
  if (typeof window === "undefined") return false;
  if (!isTauri()) return false;
  if (roleFromBootGlobal() !== null) return false;
  if (roleFromQuery() !== null) return false;
  if (roleFromTauriLabelSync() !== null) return false;
  return true;
}

export async function resolveWindowRoleAsync(): Promise<WindowRole> {
  const fromBoot = roleFromBootGlobal();
  if (fromBoot) return fromBoot;

  const fromQuery = roleFromQuery();
  if (fromQuery) return fromQuery;

  if (!isTauri()) return "main";

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const fromLabel = roleFromString(getCurrentWindow().label);
    if (fromLabel) return fromLabel;
  } catch {
    // ignore
  }

  return roleFromTauriLabelSync() ?? "main";
}
