import type { WindowLayout } from "./types.ts";
import { isUsableMainFrame } from "./usable-layout.ts";

/**
 * 坏档对照。默认像素只是一块能用的占位，测试不去对具体数字。
 * 保存时拒绝不可用的主窗；启动读到坏档则退回这块占位，并且是展开的。
 */
const FALLBACK: WindowLayout = {
  main: { x: 80, y: 80, width: 960, height: 640 },
  pin: null,
  capsule: null,
  mainCollapsed: false,
  pinVisible: false,
  capsuleVisible: false,
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

export type StabilityDriver = {
  getWindowLayout(): Promise<{ ok: true; value: WindowLayout } | { ok: false; error: { code: string; field?: string } }>;
  saveWindowLayout(
    layout: WindowLayout,
  ): Promise<{ ok: true; value: null } | { ok: false; error: { code: string; field?: string } }>;
  setMainCollapsed(collapsed: boolean): Promise<{ ok: true; value: null } | { ok: false; error: { code: string } }>;
  hideMainToTray(): Promise<{ ok: true; value: null } | { ok: false; error: { code: string } }>;
  showMain(): Promise<{ ok: true; value: null } | { ok: false; error: { code: string } }>;
  quitApp(): Promise<{ ok: true; value: null } | { ok: false; error: { code: string } }>;
  /** 模拟磁盘上已有一份旧档，不经过保存校验。 */
  plantSaved(layout: WindowLayout): void;
  restart(): void;
  isRunning(): boolean;
  isMainVisible(): boolean;
};

export function createStabilityMock(): StabilityDriver {
  let running = true;
  let mainVisible = true;
  let layout = clone(FALLBACK);
  let saved: WindowLayout | null = null;

  function stopped() {
    return { ok: false as const, error: { code: "internal" } };
  }

  function openFromDisk(): void {
    const raw = saved ?? FALLBACK;
    layout = isUsableMainFrame(raw.main) ? clone(raw) : clone(FALLBACK);
    mainVisible = true;
    running = true;
  }

  return {
    async getWindowLayout() {
      if (!running) return stopped();
      return { ok: true, value: clone(layout) };
    },
    async saveWindowLayout(next) {
      if (!running) return stopped();
      if (!isUsableMainFrame(next.main)) {
        return { ok: false, error: { code: "validation", field: "main" } };
      }
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
    async quitApp() {
      if (!running) return stopped();
      running = false;
      mainVisible = false;
      return { ok: true, value: null };
    },
    plantSaved(raw) {
      saved = clone(raw);
    },
    restart() {
      openFromDisk();
    },
    isRunning() {
      return running;
    },
    isMainVisible() {
      return running && mainVisible;
    },
  };
}
