import type { WindowLayout } from "./types.ts";

/**
 * 最小化还没有契约命令。这里只用它和「关闭进托盘」对照，避免混成同一种隐藏。
 * 任务栏图标、整窗是不是还留一条顶栏，要人在 Windows 上看。
 */
const OPEN: WindowLayout = {
  main: { x: 320, y: 40, width: 1100, height: 720 },
  pin: null,
  capsule: null,
  mainCollapsed: false,
  pinVisible: false,
  capsuleVisible: false,
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: { code: string } };

export type MinCloseDriver = {
  getWindowLayout(): Promise<Ok<WindowLayout> | Err>;
  /** 尚未写入契约。对照里表示「最小化」，不是折叠，也不是进托盘。 */
  minimizeMain(): Promise<Ok<null> | Err>;
  /** 从任务栏把最小化的主窗叫回来。 */
  restoreMainFromTaskbar(): Promise<Ok<null> | Err>;
  hideMainToTray(): Promise<Ok<null> | Err>;
  showMain(): Promise<Ok<null> | Err>;
  quitApp(): Promise<Ok<null> | Err>;
  isRunning(): boolean;
  isMainVisible(): boolean;
  isMinimized(): boolean;
  isInTray(): boolean;
};

export function createMinCloseMock(): MinCloseDriver {
  let running = true;
  let visible = true;
  let minimized = false;
  let inTray = false;
  const layout = clone(OPEN);

  function stopped(): Err {
    return { ok: false, error: { code: "internal" } };
  }

  function showFull(): void {
    visible = true;
    minimized = false;
    inTray = false;
  }

  return {
    async getWindowLayout() {
      if (!running) return stopped();
      return { ok: true, value: clone(layout) };
    },
    async minimizeMain() {
      if (!running) return stopped();
      visible = false;
      minimized = true;
      inTray = false;
      return { ok: true, value: null };
    },
    async restoreMainFromTaskbar() {
      if (!running) return stopped();
      showFull();
      return { ok: true, value: null };
    },
    async hideMainToTray() {
      if (!running) return stopped();
      visible = false;
      minimized = false;
      inTray = true;
      return { ok: true, value: null };
    },
    async showMain() {
      if (!running) return stopped();
      showFull();
      return { ok: true, value: null };
    },
    async quitApp() {
      if (!running) return stopped();
      running = false;
      visible = false;
      minimized = false;
      inTray = false;
      return { ok: true, value: null };
    },
    isRunning() {
      return running;
    },
    isMainVisible() {
      return running && visible;
    },
    isMinimized() {
      return running && minimized;
    },
    isInTray() {
      return running && inTray;
    },
  };
}
