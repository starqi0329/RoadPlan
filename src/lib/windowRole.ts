import { isTauri } from "@tauri-apps/api/core";

export type WindowRole = "main" | "pin" | "capsule";

/** 当前前端落在哪个系统窗：Tauri 用 label；浏览器可用 ?window=pin|capsule。 */
export function resolveWindowRole(): WindowRole {
  if (typeof window === "undefined") return "main";
  const fromQuery = new URLSearchParams(window.location.search).get("window");
  if (fromQuery === "pin" || fromQuery === "capsule" || fromQuery === "main") {
    return fromQuery;
  }
  if (!isTauri()) return "main";
  try {
    // 同步读不到 label 时先 main；App 里再用异步校正。
    const w = window as Window & {
      __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } };
    };
    const label = w.__TAURI_INTERNALS__?.metadata?.currentWindow?.label;
    if (label === "pin" || label === "capsule" || label === "main") return label;
  } catch {
    // ignore
  }
  return "main";
}

export async function resolveWindowRoleAsync(): Promise<WindowRole> {
  if (!isTauri()) return resolveWindowRole();
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const label = getCurrentWindow().label;
    if (label === "pin" || label === "capsule" || label === "main") return label;
  } catch {
    // ignore
  }
  return resolveWindowRole();
}
