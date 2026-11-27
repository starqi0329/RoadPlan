import { isTauri } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { listGoals } from "../../api/goals";
import { isAppError } from "../../api/result";
import {
  closeMainToTray,
  getMockWindowUi,
  getWindowLayout,
  minimizeMain,
  saveWindowLayout,
  setDragging,
  setMainCollapsed,
  showCapsule,
  showPin,
  subscribeMockWindow,
  unminimizeMain,
  type MockWindowUi,
} from "../../api/window";
import type { GoalLevel, WindowFrame } from "../../bindings";
import { isUnimplemented, translateAppError } from "../../errors/appError";
import { useActiveNow } from "../../hooks/useActiveNow";
import { datePeriodLabel } from "../../lib/dateLabels";
import { formatDateHeading } from "../../lib/format";
import { isCollapsedSized, isSaneExpandedFrame, TITLEBAR_HEIGHT } from "../../lib/windowFrame";
import { DayView } from "../DayView";
import { GoalTree } from "../GoalTree";
import { CapsuleWindow } from "../windows/CapsuleWindow";
import { PinWindow } from "../windows/PinWindow";
import { AuditDrawer } from "./AuditDrawer";
import styles from "./AppShell.module.css";
import { LeftRail, type RailView } from "./LeftRail";
import { StatusBar } from "./StatusBar";

const DEFAULT_EXPANDED: WindowFrame = {
  x: 120,
  y: 80,
  width: 1100,
  height: 760,
};

export function AppShell() {
  const [view, setView] = useState<RailView>("day");
  const [toast, setToast] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDraggingUi] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [highlightPlanId, setHighlightPlanId] = useState<string | null>(null);
  const [mockUi, setMockUi] = useState<MockWindowUi>(() => getMockWindowUi());
  const collapsedRef = useRef(false);
  const expandedMainRef = useRef<WindowFrame>({ ...DEFAULT_EXPANDED });

  const native = isTauri();
  const { now, plans, activePlan } = useActiveNow();
  const doneCount = plans.filter((plan) => plan.status === "done").length;
  const storageHint = native ? "本地存储" : "浏览器演示（不写库）";

  collapsedRef.current = collapsed;

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
    const root = document.documentElement;
    root.dataset.shell = native ? "native" : "demo";
    if (collapsed) root.dataset.collapsed = "true";
    else delete root.dataset.collapsed;
    return () => {
      delete root.dataset.shell;
      delete root.dataset.collapsed;
    };
  }, [native, collapsed]);

  useEffect(() => {
    if (native) return;
    return subscribeMockWindow(() => {
      const next = getMockWindowUi();
      setMockUi(next);
      setCollapsed(next.collapsed);
      setDraggingUi(next.dragging);
    });
  }, [native]);

  const readNativeFrame = useCallback(async (): Promise<WindowFrame | null> => {
    if (!native) return null;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const factor = await win.scaleFactor();
      const outer = await win.outerPosition();
      const size = await win.outerSize();
      return {
        x: Math.round(outer.x / factor),
        y: Math.round(outer.y / factor),
        width: Math.round(size.width / factor),
        height: Math.round(size.height / factor),
      };
    } catch {
      return null;
    }
  }, [native]);

  const applyNativeShellSize = useCallback(
    async (nextCollapsed: boolean) => {
      if (!native) return;
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { LogicalSize } = await import("@tauri-apps/api/dpi");
        const win = getCurrentWindow();
        const current = await readNativeFrame();
        if (nextCollapsed) {
          if (current && isSaneExpandedFrame(current)) {
            expandedMainRef.current = current;
          }
          const width =
            current && current.width >= 320 ? current.width : expandedMainRef.current.width;
          await win.setSize(new LogicalSize(width, TITLEBAR_HEIGHT));
        } else {
          const target = isSaneExpandedFrame(expandedMainRef.current)
            ? expandedMainRef.current
            : DEFAULT_EXPANDED;
          await win.setSize(new LogicalSize(target.width, target.height));
        }
      } catch {
        // 尺寸调整失败不打断折叠状态切换
      }
    },
    [native, readNativeFrame],
  );

  useEffect(() => {
    void (async () => {
      try {
        const layout = await getWindowLayout();
        if (isSaneExpandedFrame(layout.main)) {
          expandedMainRef.current = layout.main;
        }
        // 顶栏「—」改为系统最小化后，不再用 mainCollapsed 留 60px 顶栏杠
        setCollapsed(false);
        collapsedRef.current = false;
        if (layout.mainCollapsed) {
          try {
            await setMainCollapsed(false);
          } catch {
            // 清折叠标志失败不挡启动
          }
        }
        if (native && isSaneExpandedFrame(expandedMainRef.current)) {
          await applyNativeShellSize(false);
        }
      } catch (error) {
        if (isAppError(error)) showToast(translateAppError(error));
      }
    })();
  }, [native, applyNativeShellSize, showToast]);

  // 系统关闭进托盘：只由 Rust CloseRequested → hide_main_to_tray 处理，
  // 前端不再挂 onCloseRequested，避免与后端双重 hide。

  useEffect(() => {
    if (!native) return;
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
                if (!(await win.isVisible())) return;
                const frame = await readNativeFrame();
                if (!frame) return;
                const layout = await getWindowLayout();
                const isCollapsed = collapsedRef.current;

                if (isCollapsed) {
                  const kept = isSaneExpandedFrame(expandedMainRef.current)
                    ? expandedMainRef.current
                    : isSaneExpandedFrame(layout.main)
                      ? layout.main
                      : DEFAULT_EXPANDED;
                  await saveWindowLayout({
                    ...layout,
                    main: {
                      ...kept,
                      x: frame.x,
                      y: frame.y,
                    },
                    mainCollapsed: true,
                  });
                  return;
                }

                if (isCollapsedSized(frame) || !isSaneExpandedFrame(frame)) {
                  return;
                }
                expandedMainRef.current = frame;
                await saveWindowLayout({
                  ...layout,
                  main: frame,
                  mainCollapsed: false,
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
  }, [native, readNativeFrame]);

  async function minimizeWindow() {
    try {
      await minimizeMain();
      if (!native) showToast("已最小化（演示：可从任务栏恢复，不是托盘）");
    } catch (error) {
      if (isAppError(error)) showToast(translateAppError(error));
      else showToast("最小化失败，请再试一次");
    }
  }

  async function closeToTray() {
    try {
      await closeMainToTray();
      if (!native) showToast("已进系统托盘（演示：进程不退出）");
      else showToast("已隐藏到托盘（进程仍在）");
    } catch (error) {
      if (isAppError(error)) showToast(translateAppError(error));
      else showToast("隐藏到托盘失败，请再试一次");
    }
  }

  async function hideToCapsule() {
    try {
      await showCapsule();
    } catch (error) {
      if (isAppError(error)) showToast(translateAppError(error));
      else showToast("打开胶囊失败，主窗未隐藏");
      return;
    }

    try {
      await closeMainToTray();
      if (!native) {
        showToast("胶囊已显示，主窗已进托盘（演示）");
      } else {
        showToast("胶囊已显示，主窗已进托盘");
      }
    } catch (error) {
      if (isAppError(error)) {
        showToast(`胶囊已显示，但隐藏主窗失败：${translateAppError(error)}`);
      } else {
        showToast("胶囊已显示，但隐藏主窗失败");
      }
    }
  }

  async function openPin() {
    try {
      await showPin();
      if (!native) {
        showToast("已打开置顶小窗（浏览器演示浮层；真机为独立窗）");
      } else {
        showToast("已打开置顶小窗");
      }
    } catch (error) {
      if (isAppError(error)) showToast(translateAppError(error));
      else showToast("打开置顶小窗失败");
    }
  }

  async function openAudit() {
    if (collapsed) {
      try {
        await applyNativeShellSize(false);
        await setMainCollapsed(false);
        setCollapsed(false);
      } catch (error) {
        if (isAppError(error)) showToast(translateAppError(error));
      }
    }
    setAuditOpen((prev) => !prev);
  }

  function jumpToPlan(planId: string) {
    setView("day");
    setHighlightPlanId(planId);
    window.setTimeout(() => setHighlightPlanId(null), 1800);
  }

  async function beginDrag() {
    setDraggingUi(true);
    try {
      await setDragging(true);
      if (native) {
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

  const mainMinimized = !native && mockUi.minimized;
  const mainHidden = !native && !mockUi.mainVisible;
  const showDemoPin = !native && mockUi.pinVisible;
  const showDemoCapsule = !native && mockUi.capsuleVisible;
  const dateMain = now ? formatDateHeading(now.date) : "—";
  const dateSub = now ? datePeriodLabel(now.date) : "读取时间中";

  return (
    <div
      className={`${styles.desktop} ${dragging || mockUi.dragging ? styles.dragging : ""}`}
      data-frameless="true"
      data-shell={native ? "native" : "demo"}
      data-collapsed={collapsed ? "true" : "false"}
    >
      {!native ? (
        <div className={styles.demoChrome} data-demo-chrome="true" aria-hidden>
          <div className={styles.halo1} />
          <div className={styles.halo2} />
          <div className={styles.mockWin1}>
            <div className={styles.mockBar}>
              <i />
              <i />
              <i />
            </div>
            <div className={styles.mockLines}>
              <span style={{ width: "60%" }} />
              <span style={{ width: "90%" }} />
              <span style={{ width: "75%" }} />
            </div>
          </div>
          <div className={styles.mockWin2}>
            <div className={styles.mockBar}>
              <i />
              <i />
              <i />
            </div>
            <div className={styles.mockLines}>
              <span style={{ width: "70%" }} />
              <span style={{ width: "50%" }} />
              <span style={{ width: "88%" }} />
            </div>
          </div>
          <p className={styles.desktopHint}>无系统标题栏 · 自定义顶栏拖动与关闭</p>
        </div>
      ) : null}

      {mainMinimized ? (
        <div className={styles.trayHint} data-demo-state="minimized">
          <p>
            主窗已<strong>最小化</strong>（浏览器演示）。真机整窗消失，可从
            <strong> Windows 任务栏</strong>点图标恢复完整主窗。这不是进托盘。
          </p>
          <button
            type="button"
            onClick={() => {
              void unminimizeMain();
            }}
          >
            从任务栏恢复（演示）
          </button>
        </div>
      ) : mainHidden ? (
        <div className={styles.trayHint} data-demo-state="tray">
          <p>
            主窗已进<strong>系统托盘</strong>
            （浏览器演示）。真机进程不退出；托盘「打开主窗」可回来。再点 × 应再次进托盘。
          </p>
          <button
            type="button"
            onClick={() => {
              void import("../../api/window").then(({ showMain }) => showMain());
            }}
          >
            从托盘打开（演示）
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
                className={`${styles.wbtn} ${auditOpen ? styles.wbtnOn : ""}`}
                title="操作记录"
                aria-label="操作记录"
                aria-pressed={auditOpen}
                onClick={() => void openAudit()}
              >
                审
              </button>
              <button
                type="button"
                className={styles.wbtn}
                title="最小化"
                aria-label="最小化"
                onClick={() => void minimizeWindow()}
              >
                最小化
              </button>
              <button
                type="button"
                className={styles.wbtn}
                title="隐藏到边缘胶囊"
                aria-label="隐藏到边缘胶囊"
                onClick={() => void hideToCapsule()}
              >
                胶囊
              </button>
              <button
                type="button"
                className={styles.wbtn}
                title="打开置顶小窗"
                aria-label="打开置顶小窗"
                onClick={() => void openPin()}
              >
                置顶
              </button>
              <button
                type="button"
                className={styles.wbtn}
                title="关闭到托盘"
                aria-label="关闭到托盘"
                onClick={() => void closeToTray()}
              >
                ×
              </button>
            </div>
          </header>

          <div className={styles.body} hidden={collapsed} aria-hidden={collapsed}>
            <LeftRail
              view={view}
              onSelect={setView}
              goals={goalsQuery.data ?? []}
              nowDate={now?.date ?? null}
              activePlan={activePlan}
            />
            <section className={styles.main}>
              {view === "day" ? (
                <DayView
                  embedded
                  onOpenPin={() => void openPin()}
                  highlightPlanId={highlightPlanId}
                />
              ) : (
                <GoalTree embedded level={view as GoalLevel} />
              )}
            </section>
          </div>
          <div className={styles.statusSlot} hidden={collapsed} aria-hidden={collapsed}>
            <StatusBar doneCount={doneCount} totalCount={plans.length} storageHint={storageHint} />
          </div>

          <AuditDrawer
            open={auditOpen}
            onClose={() => setAuditOpen(false)}
            onJumpPlan={jumpToPlan}
          />
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
