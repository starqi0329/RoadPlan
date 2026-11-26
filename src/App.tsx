import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { DayView } from "./components/DayView";
import { GoalTree } from "./components/GoalTree";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

type Page = "day" | "goals";

function Shell() {
  const [page, setPage] = useState<Page>("day");
  if (page === "goals") {
    return <GoalTree onOpenDay={() => setPage("day")} />;
  }
  return <DayView onOpenGoals={() => setPage("goals")} />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>
  );
}
