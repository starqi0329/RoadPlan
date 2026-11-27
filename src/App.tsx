import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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

  // 副窗角色未定时绝不能画 AppShell，否则真机小窗首屏是整页主壳
  if (role === "pending") {
    return <div data-window-boot="pending" aria-hidden style={{ display: "none" }} />;
  }
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
