import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "./components/shell/AppShell";
import { CapsuleWindow } from "./components/windows/CapsuleWindow";
import { PinWindow } from "./components/windows/PinWindow";
import { resolveWindowRole, resolveWindowRoleAsync, type WindowRole } from "./lib/windowRole";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function RootByRole() {
  const [role, setRole] = useState<WindowRole>(() => resolveWindowRole());

  useEffect(() => {
    void resolveWindowRoleAsync().then(setRole);
  }, []);

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
