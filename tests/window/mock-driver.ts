import type { DataChanged, WindowDriver, WindowId, WindowLayout } from "./types.ts";

/**
 * 契约没写第一次打开时的像素，这里只放一块正的主窗，测试不去对具体数字。
 * 置顶、透明和拖动手感不在这个对照里。
 */
const DEFAULT_LAYOUT: WindowLayout = {
  main: { x: 0, y: 0, width: 1, height: 1 },
  pin: null,
  capsule: null,
  mainCollapsed: false,
  pinVisible: false,
  capsuleVisible: false,
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createMockDriver(): WindowDriver {
  let running = true;
  let mainVisible = true;
  let layout = clone(DEFAULT_LAYOUT);
  let saved: WindowLayout | null = null;
  const listeners: Record<WindowId, Array<(event: DataChanged) => void>> = {
    main: [],
    pin: [],
    capsule: [],
  };

  function stopped() {
    return { ok: false as const, error: { code: "internal", message: "已经退出" } };
  }

  function openWindows(): WindowId[] {
    const open: WindowId[] = [];
    if (mainVisible) open.push("main");
    if (layout.pinVisible) open.push("pin");
    if (layout.capsuleVisible) open.push("capsule");
    return open;
  }

  function emit(entities: string[]): void {
    const event = { entities: [...entities] };
    for (const id of openWindows()) {
      for (const listener of listeners[id]) listener(event);
    }
  }

  return {
    async getWindowLayout() {
      if (!running) return stopped();
      return { ok: true, value: clone(layout) };
    },
    async saveWindowLayout(next) {
      if (!running) return stopped();
      layout = clone(next);
      saved = clone(next);
      return { ok: true, value: null };
    },
    async setMainCollapsed(collapsed) {
      if (!running) return stopped();
      layout = { ...layout, mainCollapsed: collapsed };
      if (saved) saved = { ...saved, mainCollapsed: collapsed };
      return { ok: true, value: null };
    },
    async hideMainToTray() {
      if (!running) return stopped();
      mainVisible = false;
      return { ok: true, value: null };
    },
    async showMain() {
      if (!running) return stopped();
      mainVisible = true;
      return { ok: true, value: null };
    },
    async showPin() {
      if (!running) return stopped();
      layout = { ...layout, pinVisible: true };
      if (saved) saved = { ...saved, pinVisible: true };
      return { ok: true, value: null };
    },
    async hidePin() {
      if (!running) return stopped();
      layout = { ...layout, pinVisible: false };
      if (saved) saved = { ...saved, pinVisible: false };
      return { ok: true, value: null };
    },
    async showCapsule() {
      if (!running) return stopped();
      layout = { ...layout, capsuleVisible: true };
      if (saved) saved = { ...saved, capsuleVisible: true };
      return { ok: true, value: null };
    },
    async hideCapsule() {
      if (!running) return stopped();
      layout = { ...layout, capsuleVisible: false };
      if (saved) saved = { ...saved, capsuleVisible: false };
      return { ok: true, value: null };
    },
    async setDragging() {
      if (!running) return stopped();
      return { ok: true, value: null };
    },
    async quitApp() {
      if (!running) return stopped();
      running = false;
      mainVisible = false;
      return { ok: true, value: null };
    },
    async createPlan() {
      if (!running) return stopped();
      emit(["plan"]);
      return { ok: true, value: null };
    },
    onDataChanged(windowId, listener) {
      listeners[windowId].push(listener);
    },
    isRunning() {
      return running;
    },
    isMainVisible() {
      return running && mainVisible;
    },
    restart() {
      running = true;
      mainVisible = true;
      layout = clone(saved ?? DEFAULT_LAYOUT);
    },
  };
}
