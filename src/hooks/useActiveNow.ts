import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getNow, listenDataChanged, listenMinuteTick, listPlans } from "../api/plans";
import type { PlanView } from "../bindings";

/** 主窗 / 置顶 / 胶囊共用：当前时刻与进行中计划。 */
export function useActiveNow() {
  const nowQuery = useQuery({ queryKey: ["now"], queryFn: getNow });
  const now = nowQuery.data ?? null;

  const plansQuery = useQuery({
    queryKey: ["plans", now?.date ?? "pending", "active-now"],
    queryFn: async () => {
      if (!now) return [] as PlanView[];
      return listPlans(now.date);
    },
    enabled: Boolean(now?.date),
  });

  useEffect(() => {
    return listenDataChanged((entities) => {
      if (entities.includes("plan")) {
        void plansQuery.refetch();
      }
    });
  }, [plansQuery]);

  useEffect(() => {
    return listenMinuteTick(() => {
      void nowQuery.refetch();
      void plansQuery.refetch();
    });
  }, [nowQuery, plansQuery]);

  const plans = plansQuery.data ?? [];
  const activePlan = plans.find((plan) => plan.status === "active") ?? null;

  return {
    now,
    plans,
    activePlan,
    loading: nowQuery.isLoading || plansQuery.isLoading,
  };
}
