import type { WindowLayout } from "./types.ts";

/**
 * 置顶是否压在别的软件上、胶囊是不是贴在屏幕边，要人在 Windows 上看。
 * 这里只分清：置顶、胶囊、最小化、关闭进托盘是四件事。
 * 点胶囊必须先把胶囊显示成功，再藏主窗；失败时主窗还在。
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

export type PinCapsuleDriver = {
  getWindowLayout(): Promise<Ok<WindowLayout> | Err>;
  showPin(): Promise<Ok<null> | Err>;
  hidePin(): Promise<Ok<null> | Err>;
  showCapsule(): Promise<Ok<null> | Err>;
  hideCapsule(): Promise<Ok<null> | Err>;
  /** 用户点「胶囊」：先显示胶囊，成功后再把主窗关进托盘。 */
  hideMainBehindCapsule(): Promise<Ok<null> | Err>;
  showMain(): Promise<Ok<null> | Err>;
  /** 下一次打开置顶或胶囊时失败，用来核对不会假装成功。 */
  failNextShow(which: "pin" | "capsule"): void;
  isRunning(): boolean;
  isMainVisible(): boolean;
  isMinimized(): boolean;
  isInTray(): boolean;
  isPinAlwaysOnTop(): boolean;
};

export function createPinCapsuleMock(): PinCapsuleDriver {
  let running = true;
  let mainVisible = true;
  let inTray = false;
  let layout = clone(OPEN);
  let failPin = false;
  let failCapsule = false;

  function stopped(): Err {
    return { ok: false, error: { code: "internal" } };
  }

  function failed(): Err {
    return { ok: false, error: { code: "internal" } };
  }

  return {
    async getWindowLayout() {
      if (!running) return stopped();
      return { ok: true, value: clone(layout) };
    },
    async showPin() {
      if (!running) return stopped();
      if (failPin) {
        failPin = false;
        return failed();
      }
      layout = { ...layout, pinVisible: true };
      return { ok: true, value: null };
    },
    async hidePin() {
      if (!running) return stopped();
      layout = { ...layout, pinVisible: false };
      return { ok: true, value: null };
    },
    async showCapsule() {
      if (!running) return stopped();
      if (failCapsule) {
        failCapsule = false;
        return failed();
      }
      layout = { ...layout, capsuleVisible: true };
      return { ok: true, value: null };
    },
    async hideCapsule() {
      if (!running) return stopped();
      layout = { ...layout, capsuleVisible: false };
      return { ok: true, value: null };
    },
    async hideMainBehindCapsule() {
      if (!running) return stopped();
      const shown = await this.showCapsule();
      if (!shown.ok) return shown;
      mainVisible = false;
      inTray = true;
      return { ok: true, value: null };
    },
    async showMain() {
      if (!running) return stopped();
      mainVisible = true;
      inTray = false;
      return { ok: true, value: null };
    },
    failNextShow(which) {
      if (which === "pin") failPin = true;
      else failCapsule = true;
    },
    isRunning() {
      return running;
    },
    isMainVisible() {
      return running && mainVisible;
    },
    isMinimized() {
      return false;
    },
    isInTray() {
      return running && inTray;
    },
    isPinAlwaysOnTop() {
      return running && layout.pinVisible;
    },
  };
}
