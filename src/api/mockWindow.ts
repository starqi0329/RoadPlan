import type { WindowFrame, WindowLayout } from "../bindings";

const defaultMain: WindowFrame = {
  x: 120,
  y: 80,
  width: 1100,
  height: 760,
};

let layout: WindowLayout = {
  main: { ...defaultMain },
  pin: null,
  capsule: null,
  mainCollapsed: false,
  pinVisible: false,
  capsuleVisible: false,
};

/** 浏览器演示：折叠 / 最小化 / 胶囊 / 置顶可见性（不写库）。 */
export type MockWindowUi = {
  mainVisible: boolean;
  /** 系统最小化演示（与托盘隐藏区分）。 */
  minimized: boolean;
  collapsed: boolean;
  pinVisible: boolean;
  capsuleVisible: boolean;
  dragging: boolean;
};

let ui: MockWindowUi = {
  mainVisible: true,
  minimized: false,
  collapsed: false,
  pinVisible: false,
  capsuleVisible: false,
  dragging: false,
};

const listeners = new Set<() => void>();

export function subscribeMockWindow(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

export function getMockWindowUi(): MockWindowUi {
  return { ...ui };
}

export async function getWindowLayout(): Promise<WindowLayout> {
  return structuredClone(layout);
}

export async function saveWindowLayout(next: WindowLayout): Promise<null> {
  layout = structuredClone(next);
  ui.collapsed = next.mainCollapsed;
  ui.pinVisible = next.pinVisible;
  ui.capsuleVisible = next.capsuleVisible;
  emit();
  return null;
}

export async function setMainCollapsed(collapsed: boolean): Promise<null> {
  layout.mainCollapsed = collapsed;
  ui.collapsed = collapsed;
  emit();
  return null;
}

export async function hideMainToTray(): Promise<null> {
  ui.mainVisible = false;
  ui.minimized = false;
  emit();
  return null;
}

export async function minimizeMain(): Promise<null> {
  ui.minimized = true;
  emit();
  return null;
}

export async function unminimizeMain(): Promise<null> {
  ui.minimized = false;
  emit();
  return null;
}

export async function showMain(): Promise<null> {
  ui.mainVisible = true;
  ui.minimized = false;
  ui.capsuleVisible = false;
  layout.capsuleVisible = false;
  emit();
  return null;
}

export async function showPin(): Promise<null> {
  ui.pinVisible = true;
  layout.pinVisible = true;
  if (!layout.pin) {
    layout.pin = { x: 40, y: 40, width: 320, height: 88 };
  }
  emit();
  return null;
}

export async function hidePin(): Promise<null> {
  ui.pinVisible = false;
  layout.pinVisible = false;
  emit();
  return null;
}

export async function showCapsule(): Promise<null> {
  ui.capsuleVisible = true;
  layout.capsuleVisible = true;
  if (!layout.capsule) {
    layout.capsule = { x: 8, y: 200, width: 56, height: 160 };
  }
  emit();
  return null;
}

export async function hideCapsule(): Promise<null> {
  ui.capsuleVisible = false;
  layout.capsuleVisible = false;
  emit();
  return null;
}

export async function setDragging(dragging: boolean): Promise<null> {
  ui.dragging = dragging;
  emit();
  return null;
}

export async function quitApp(): Promise<null> {
  // 浏览器演示：无法真正退出，仅复位。
  ui = {
    mainVisible: true,
    minimized: false,
    collapsed: false,
    pinVisible: false,
    capsuleVisible: false,
    dragging: false,
  };
  emit();
  return null;
}

export function resetMockWindow(): void {
  layout = {
    main: { ...defaultMain },
    pin: null,
    capsule: null,
    mainCollapsed: false,
    pinVisible: false,
    capsuleVisible: false,
  };
  ui = {
    mainVisible: true,
    minimized: false,
    collapsed: false,
    pinVisible: false,
    capsuleVisible: false,
    dragging: false,
  };
  emit();
}
