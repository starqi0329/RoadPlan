import { isTauri } from "@tauri-apps/api/core";
import { commands, type WindowLayout } from "../bindings";
import { isUnimplemented } from "../errors/appError";
import * as mockWindow from "./mockWindow";
import { isAppError, unwrapResult } from "./result";

export {
  getMockWindowUi,
  subscribeMockWindow,
  resetMockWindow,
  type MockWindowUi,
} from "./mockWindow";

async function withWindowFallback<T>(
  tauriCall: () => Promise<T>,
  mockCall: () => Promise<T>,
): Promise<T> {
  if (!isTauri()) return mockCall();
  try {
    return await tauriCall();
  } catch (error) {
    if (isAppError(error) && isUnimplemented(error)) return mockCall();
    throw error;
  }
}

/**
 * 真机：命令返回后核对副窗真的在、可见，并再顶一次置顶/聚焦。
 * 避免「后端说成功、桌面上却没有小窗」被前端当成已打开。
 */
async function ensureSecondaryVisible(label: "pin" | "capsule"): Promise<void> {
  if (!isTauri()) return;
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const win = await WebviewWindow.getByLabel(label);
    if (!win) return;
    await win.unminimize();
    await win.setAlwaysOnTop(true);
    await win.show();
    if (label === "pin") await win.setFocus();
  } catch {
    // 命令已经成功。这里只是再顶一次，权限或时机失败不把窗口判成没打开。
  }
}

export async function getWindowLayout(): Promise<WindowLayout> {
  return withWindowFallback(
    async () => unwrapResult(await commands.getWindowLayout()),
    () => mockWindow.getWindowLayout(),
  );
}

export async function saveWindowLayout(layout: WindowLayout): Promise<void> {
  await withWindowFallback(
    async () => {
      unwrapResult(await commands.saveWindowLayout(layout));
    },
    async () => {
      await mockWindow.saveWindowLayout(layout);
    },
  );
}

export async function setMainCollapsed(collapsed: boolean): Promise<void> {
  await withWindowFallback(
    async () => {
      unwrapResult(await commands.setMainCollapsed(collapsed));
    },
    async () => {
      await mockWindow.setMainCollapsed(collapsed);
    },
  );
}

export async function hideMainToTray(): Promise<void> {
  await withWindowFallback(
    async () => {
      unwrapResult(await commands.hideMainToTray());
    },
    () => mockWindow.hideMainToTray(),
  );
}

/**
 * 关闭进托盘：只走后端 `hide_main_to_tray`（可重复）。
 * 系统关闭拦截留给 Rust CloseRequested，前端不再二次 hide。
 */
export async function closeMainToTray(): Promise<void> {
  await hideMainToTray();
}

/**
 * 系统最小化：整窗消失，任务栏可恢复。不走折叠、不进托盘。
 * 真机走 `minimize_main`；浏览器演示走 mock。
 */
export async function minimizeMain(): Promise<void> {
  await withWindowFallback(
    async () => {
      unwrapResult(await commands.minimizeMain());
    },
    () => mockWindow.minimizeMain(),
  );
}

/** 浏览器演示：从「最小化」状态恢复。真机任务栏点回；必要时也可 `show_main`。 */
export async function unminimizeMain(): Promise<void> {
  if (!isTauri()) {
    await mockWindow.unminimizeMain();
    return;
  }
  unwrapResult(await commands.showMain());
}

export async function showMain(): Promise<void> {
  await withWindowFallback(
    async () => {
      unwrapResult(await commands.showMain());
    },
    () => mockWindow.showMain(),
  );
}

export async function showPin(): Promise<void> {
  await withWindowFallback(
    async () => {
      unwrapResult(await commands.showPin());
      await ensureSecondaryVisible("pin");
    },
    () => mockWindow.showPin(),
  );
}

export async function hidePin(): Promise<void> {
  await withWindowFallback(
    async () => {
      unwrapResult(await commands.hidePin());
    },
    () => mockWindow.hidePin(),
  );
}

export async function showCapsule(): Promise<void> {
  await withWindowFallback(
    async () => {
      unwrapResult(await commands.showCapsule());
      await ensureSecondaryVisible("capsule");
    },
    () => mockWindow.showCapsule(),
  );
}

export async function hideCapsule(): Promise<void> {
  await withWindowFallback(
    async () => {
      unwrapResult(await commands.hideCapsule());
    },
    () => mockWindow.hideCapsule(),
  );
}

/** 置顶卡按内容自适应高度：只改高度，宽度和位置不动。 */
export async function fitPinHeight(height: number): Promise<void> {
  await withWindowFallback(
    async () => {
      unwrapResult(await commands.fitPinHeight(height));
    },
    async () => {},
  );
}

export async function setDragging(dragging: boolean): Promise<void> {
  await withWindowFallback(
    async () => {
      unwrapResult(await commands.setDragging(dragging));
    },
    () => mockWindow.setDragging(dragging),
  );
}

export async function quitApp(): Promise<void> {
  if (!isTauri()) {
    await mockWindow.quitApp();
    return;
  }
  unwrapResult(await commands.quitApp());
}
