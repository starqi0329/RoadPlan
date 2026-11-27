import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { hideCapsule, hideMainToTray, hidePin } from "./api/window";
import { AppShell } from "./components/shell/AppShell";
import { CapsuleWindow } from "./components/windows/CapsuleWindow";
import { PinWindow } from "./components/windows/PinWindow";
import {
  resolveWindowRole,
  resolveWindowRoleAsync,
  shouldDeferMainShell,
  type WindowRole,
} from "./lib/windowRole";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

type BootRole = WindowRole | "pending";

function PendingWindow() {
  async function closeThis() {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const label = getCurrentWindow().label;
      if (label === "pin") await hidePin();
      else if (label === "capsule") await hideCapsule();
      else await hideMainToTray();
    } catch {
      await hideMainToTray();
    }
  }

  return (
    <div
      data-window-boot="pending"
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "8px 12px",
        background: "#f6f6f8",
        color: "#1d1d1f",
        fontSize: 13,
      }}
    >
      <span>正在打开…</span>
      <button type="button" onClick={() => void closeThis()}>
        关闭
      </button>
    </div>
  );
}

function RootByRole() {
  const [role, setRole] = useState<BootRole>(() => {
    if (shouldDeferMainShell()) return "pending";
    return resolveWindowRole();
  });

  useEffect(() => {
    let cancelled = false;
    void resolveWindowRoleAsync().then((next) => {
      if (!cancelled) setRole(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (role === "pending" || role === "main") {
      delete document.documentElement.dataset.windowRole;
      return;
    }
    document.documentElement.dataset.windowRole = role;
  }, [role]);

  // 副窗角色未定时绝不能画 AppShell，否则真机小窗首屏是整页主壳。
  // 也不能 display:none，否则系统窗只剩一块空白，没有关闭、也不能拖。
  if (role === "pending") return <PendingWindow />;
  if (role === "pin") return <PinWindow />;
  if (role === "capsule") return <CapsuleWindow />;
  return <AppShell />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootByRole />
    </QueryClientProvider>
  );
}
