export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type AppError = {
  code: string;
  entity?: string;
  id?: string;
  field?: string;
  message?: string;
  startsAt?: string;
  reason?: string;
  level?: string;
  expected?: string;
};

export type WindowId = "main" | "pin" | "capsule";

export type WindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WindowLayout = {
  main: WindowFrame;
  pin: WindowFrame | null;
  capsule: WindowFrame | null;
  mainCollapsed: boolean;
  pinVisible: boolean;
  capsuleVisible: boolean;
};

export type DataChanged = {
  entities: string[];
};

export type WindowDriver = {
  getWindowLayout(): Promise<Result<WindowLayout, AppError>>;
  saveWindowLayout(layout: WindowLayout): Promise<Result<null, AppError>>;
  setMainCollapsed(collapsed: boolean): Promise<Result<null, AppError>>;
  hideMainToTray(): Promise<Result<null, AppError>>;
  showMain(): Promise<Result<null, AppError>>;
  showPin(): Promise<Result<null, AppError>>;
  hidePin(): Promise<Result<null, AppError>>;
  showCapsule(): Promise<Result<null, AppError>>;
  hideCapsule(): Promise<Result<null, AppError>>;
  setDragging(dragging: boolean): Promise<Result<null, AppError>>;
  quitApp(): Promise<Result<null, AppError>>;
  /** 用来触发「写成功后通知已打开窗口」。 */
  createPlan(title: string): Promise<Result<null, AppError>>;
  onDataChanged(windowId: WindowId, listener: (event: DataChanged) => void): void;
  /** 进程是否还在。隐藏主窗时仍为 true，quit_app 之后为 false。 */
  isRunning(): boolean;
  isMainVisible(): boolean;
  /** 模拟下次启动：重新套用上次保存的布局。 */
  restart(): void;
};
