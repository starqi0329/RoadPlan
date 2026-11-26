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
 *
 * 后端未合入 `minimize_main` 前：真机暂用窗口 API `minimize()`。
 * 合入后改为：
 *   unwrapResult(await commands.minimizeMain());
 * 浏览器演示仍走 mock。
 */
export async function minimizeMain(): Promise<void> {
  if (!isTauri()) {
    await mockWindow.minimizeMain();
    return;
  }
  // TODO(window-min-close): 后端 minimize_main 合入并生成 bindings 后切换到 commands
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().minimize();
}

/** 浏览器演示：从「最小化」状态恢复。真机由任务栏点回，一般不必调。 */
export async function unminimizeMain(): Promise<void> {
  if (!isTauri()) {
    await mockWindow.unminimizeMain();
    return;
  }
  // 真机任务栏恢复由系统完成；若后端提供 restore/show_main 加强，可改调命令
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  await win.unminimize();
  await win.setFocus();
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
