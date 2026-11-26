import { isTauri } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { listGoals } from "../../api/goals";
import { isAppError } from "../../api/result";
import {
  getMockWindowUi,
  getWindowLayout,
  hideMainToTray,
  saveWindowLayout,
  setDragging,
  setMainCollapsed,
  showCapsule,
  showPin,
  subscribeMockWindow,
  type MockWindowUi,
} from "../../api/window";
import type { GoalLevel } from "../../bindings";
import { isUnimplemented, translateAppError } from "../../errors/appError";
import { useActiveNow } from "../../hooks/useActiveNow";
import { datePeriodLabel } from "../../lib/dateLabels";
import { formatDateHeading } from "../../lib/format";
import { DayView } from "../DayView";
import { GoalTree } from "../GoalTree";
import { CapsuleWindow } from "../windows/CapsuleWindow";
import { PinWindow } from "../windows/PinWindow";
import styles from "./AppShell.module.css";
import { LeftRail, type RailView } from "./LeftRail";
import { StatusBar } from "./StatusBar";

export function AppShell() {
  const [view, setView] = useState<RailView>("day");
  const [toast, setToast] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDraggingUi] = useState(false);
  const [mockUi, setMockUi] = useState<MockWindowUi>(() => getMockWindowUi());

  const { now, plans, activePlan } = useActiveNow();
  const doneCount = plans.filter((plan) => plan.status === "done").length;
  const storageHint = isTauri() ? "本地存储" : "浏览器演示（不写库）";

  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      try {
        return await listGoals(null, null);
      } catch (error) {
        if (isAppError(error) && isUnimplemented(error)) return [];
        throw error;
      }
    },
  });

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    if (isTauri()) return;
    return subscribeMockWindow(() => {
      const next = getMockWindowUi();
      setMockUi(next);
      setCollapsed(next.collapsed);
      setDraggingUi(next.dragging);
    });
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const layout = await getWindowLayout();
        setCollapsed(layout.mainCollapsed);
      } catch (error) {
        if (isAppError(error)) showToast(translateAppError(error));
      }
    })();
  }, [showToast]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          event.preventDefault();
          try {
            await hideMainToTray();
            showToast("已隐藏到托盘（进程仍在）");
          } catch (error) {
            if (isAppError(error)) showToast(translateAppError(error));
          }
        });
        if (disposed) unlisten();
      } catch {
        // 关闭拦截不可用时忽略
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [showToast]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unsubs: Array<() => void> = [];
    let timer: number | undefined;

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const persist = () => {
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            void (async () => {
              try {
                const layout = await getWindowLayout();
                const factor = await win.scaleFactor();
                const outer = await win.outerPosition();
                const size = await win.outerSize();
                await saveWindowLayout({
                  ...layout,
                  main: {
                    x: Math.round(outer.x / factor),
                    y: Math.round(outer.y / factor),
                    width: Math.round(size.width / factor),
                    height: Math.round(size.height / factor),
                  },
                  mainCollapsed: collapsed,
                });
              } catch {
                // 布局保存失败不打断交互
              }
            })();
          }, 400);
        };
        unsubs.push(await win.onMoved(persist));
        unsubs.push(await win.onResized(persist));
        if (disposed) unsubs.forEach((fn) => fn());
      } catch {
        // ignore
      }
    })();

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      unsubs.forEach((fn) => fn());
    };
  }, [collapsed]);

  async function toggleCollapse() {
    const next = !collapsed;
    try {
      await setMainCollapsed(next);
      setCollapsed(next);
    } catch (error) {
      if (isAppError(error)) showToast(translateAppError(error));
    }
  }

  async function hideToCapsule() {
    try {
      await showCapsule();
      await hideMainToTray();
      if (!isTauri()) {
        showToast("已隐藏主窗并显示胶囊（浏览器演示）");
      } else {
        showToast("已隐藏到胶囊 / 托盘");
      }
    } catch (error) {
      if (isAppError(error)) showToast(translateAppError(error));
    }
  }

  async function openPin() {
    try {
      await showPin();
      if (!isTauri()) showToast("已打开置顶小窗（浏览器演示浮层）");
    } catch (error) {
      if (isAppError(error)) showToast(translateAppError(error));
    }
  }

  async function beginDrag() {
    setDraggingUi(true);
    try {
      await setDragging(true);
      if (isTauri()) {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().startDragging();
      }
    } catch {
      // ignore
    }
  }

  async function endDrag() {
    setDraggingUi(false);
    try {
      await setDragging(false);
    } catch {
      // ignore
    }
  }

  const mainHidden = !isTauri() && !mockUi.mainVisible;
  const showDemoPin = !isTauri() && mockUi.pinVisible;
  const showDemoCapsule = !isTauri() && mockUi.capsuleVisible;
  const dateMain = now ? formatDateHeading(now.date) : "—";
  const dateSub = now ? datePeriodLabel(now.date) : "读取时间中";

  return (
    <div className={`${styles.desktop} ${dragging || mockUi.dragging ? styles.dragging : ""}`}>
      <div className={styles.halo1} aria-hidden />
      <div className={styles.halo2} aria-hidden />

      {mainHidden ? (
        <div className={styles.trayHint}>
          <p>主窗已隐藏（浏览器模拟托盘）。真机关闭主窗会进系统托盘，进程不退出。</p>
          <button
            type="button"
            onClick={() => {
              void import("../../api/window").then(({ showMain }) => showMain());
            }}
          >
            恢复主窗
          </button>
        </div>
      ) : (
        <div
          className={`${styles.app} ${collapsed ? styles.collapsed : ""}`}
          role="application"
          aria-label="时序"
        >
          <header
            className={styles.titlebar}
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              void beginDrag();
            }}
            onPointerUp={() => {
              void endDrag();
            }}
          >
            <div className={styles.brand}>
              <div className={styles.logo} aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
                  <path d="M4 7h16M4 12h16M4 17h10" />
                </svg>
              </div>
              时序
            </div>
            <div className={styles.datebox}>
              <span className={styles.dateMain}>{dateMain}</span>
              <span className={styles.dateSub}>{dateSub}</span>
            </div>
            <div className={styles.nowtag}>
              <span className={styles.pulse} aria-hidden />
              {activePlan ? (
                <>
                  正在执行 <b>{activePlan.title}</b>
                </>
              ) : (
                <span>当前没有进行中的计划</span>
              )}
            </div>
            <div className={styles.winbtns}>
              <button
                type="button"
                className={styles.wbtn}
                title="审计记录"
                onClick={() => showToast("审计：下一切片再做")}
              >
                审
              </button>
              <button
                type="button"
                className={styles.wbtn}
                title={collapsed ? "展开" : "折叠"}
                onClick={() => void toggleCollapse()}
              >
                {collapsed ? "▢" : "—"}
              </button>
              <button
                type="button"
                className={styles.wbtn}
                title="隐藏到边缘胶囊"
                onClick={() => void hideToCapsule()}
              >
                ◌
              </button>
              <button
                type="button"
                className={styles.wbtn}
                title="置顶小窗"
                onClick={() => void openPin()}
              >
                ⌃
              </button>
              <button
                type="button"
                className={styles.wbtn}
                title="关闭到托盘"
                onClick={() => {
                  void hideMainToTray().then(() => {
                    if (!isTauri()) showToast("已隐藏主窗（模拟托盘）");
                  });
                }}
              >
                ×
              </button>
            </div>
          </header>

          {!collapsed ? (
            <>
              <div className={styles.body}>
                <LeftRail
                  view={view}
                  onSelect={setView}
                  goals={goalsQuery.data ?? []}
                  nowDate={now?.date ?? null}
                  activePlan={activePlan}
                />
                <section className={styles.main}>
                  {view === "day" ? (
                    <DayView embedded onOpenPin={() => void openPin()} />
                  ) : (
                    <GoalTree embedded level={view as GoalLevel} />
                  )}
                </section>
              </div>
              <StatusBar
                doneCount={doneCount}
                totalCount={plans.length}
                storageHint={storageHint}
              />
            </>
          ) : null}
        </div>
      )}

      {showDemoPin ? (
        <div className={styles.demoPin}>
          <PinWindow onCloseDemo={() => setMockUi(getMockWindowUi())} />
        </div>
      ) : null}

      {showDemoCapsule ? (
        <div className={styles.demoCapsule}>
          <CapsuleWindow onOpenDemo={() => setMockUi(getMockWindowUi())} />
        </div>
      ) : null}

      {toast ? (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
