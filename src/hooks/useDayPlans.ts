import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  completePlan,
  copyPlans,
  createPlan,
  getNow,
  isUnimplemented,
  listenDataChanged,
  listenMinuteTick,
  listPlans,
  planBackendMode,
  reschedulePlan,
  skipPlan,
} from "../api/plans";
import { isAppError } from "../api/result";
import type { PlanFields, PlanSaveResult, PlanView } from "../bindings";
import { translateAppError } from "../errors/appError";
import { fieldsFromPlan } from "../lib/planFields";

const nowKey = ["now"] as const;
const plansKey = (date: string) => ["plans", date] as const;

export function useDayPlans(viewDate: string | null) {
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [backendGap, setBackendGap] = useState(false);

  const nowQuery = useQuery({
    queryKey: nowKey,
    queryFn: getNow,
  });

  const plansQuery = useQuery({
    queryKey: viewDate ? plansKey(viewDate) : ["plans", "pending"],
    queryFn: async () => {
      if (!viewDate) return [] as PlanView[];
      try {
        return await listPlans(viewDate);
      } catch (error) {
        if (isAppError(error) && isUnimplemented(error)) {
          setBackendGap(true);
          return [] as PlanView[];
        }
        throw error;
      }
    },
    enabled: Boolean(viewDate),
  });

  useEffect(() => {
    if (planBackendMode() === "mock") {
      setBanner("浏览器演示数据：关掉页面会清空，不会写入本地数据库。");
    }
  }, []);

  useEffect(() => {
    return listenDataChanged((entities) => {
      if (entities.includes("plan") && viewDate) {
        void queryClient.invalidateQueries({ queryKey: plansKey(viewDate) });
      }
    });
  }, [viewDate, queryClient]);

  useEffect(() => {
    return listenMinuteTick(() => {
      void queryClient.invalidateQueries({ queryKey: nowKey });
      if (viewDate) {
        void queryClient.invalidateQueries({ queryKey: plansKey(viewDate) });
      }
    });
  }, [viewDate, queryClient]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function showError(error: unknown) {
    if (isAppError(error)) {
      if (isUnimplemented(error)) {
        setBackendGap(true);
      }
      setToast(translateAppError(error));
      return;
    }
    setToast(error instanceof Error ? error.message : "操作失败");
  }

  async function refreshPlans(extraDates: string[] = []) {
    const dates = new Set(
      [viewDate, ...extraDates].filter((value): value is string => Boolean(value)),
    );
    await Promise.all(
      [...dates].map((date) => queryClient.invalidateQueries({ queryKey: plansKey(date) })),
    );
  }

  const createMutation = useMutation({
    mutationFn: ({ date, fields }: { date: string; fields: PlanFields }) =>
      createPlan(date, fields),
    onSuccess: async (result: PlanSaveResult, variables) => {
      await refreshPlans([variables.date]);
      if (result.overlaps.length > 0) {
        const names = result.overlaps.map((item) => item.title).join("、");
        setToast(`已保存。与「${names}」时间重叠，仅提示不阻止。`);
      } else {
        setToast("计划已添加");
      }
    },
    onError: showError,
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => completePlan(id),
    onSuccess: async () => {
      await refreshPlans();
      setToast("已标记完成");
    },
    onError: showError,
  });

  const skipMutation = useMutation({
    mutationFn: (id: string) => skipPlan({ id, reason: null }),
    onSuccess: async () => {
      await refreshPlans();
      setToast("已跳过");
    },
    onError: showError,
  });

  const copyMutation = useMutation({
    mutationFn: ({ planIds, toDate }: { planIds: string[]; toDate: string }) =>
      copyPlans({ planIds, toDate }),
    onSuccess: async (_data, variables) => {
      await refreshPlans([variables.toDate]);
      setToast(`已复制 ${variables.planIds.length} 条计划到明天`);
    },
    onError: showError,
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ plans, toDate }: { plans: PlanView[]; toDate: string }) => {
      for (const plan of plans) {
        await reschedulePlan(plan.id, toDate, fieldsFromPlan(plan));
      }
    },
    onSuccess: async (_data, variables) => {
      await refreshPlans([variables.toDate, ...variables.plans.map((p) => p.date)]);
      setToast(`已把 ${variables.plans.length} 条未完成改到明天`);
    },
    onError: showError,
  });

  return {
    mode: planBackendMode(),
    backendGap,
    banner,
    toast,
    setToast,
    now: nowQuery.data ?? null,
    date: viewDate,
    plans: plansQuery.data ?? [],
    loading: nowQuery.isLoading || plansQuery.isLoading,
    loadError:
      nowQuery.error || (plansQuery.error && !backendGap)
        ? translateCaught(nowQuery.error ?? plansQuery.error)
        : null,
    createPlan: (fields: PlanFields, date = viewDate) => {
      if (!date) throw new Error("还不知道日期");
      return createMutation.mutateAsync({ date, fields });
    },
    creating: createMutation.isPending,
    completePlan: completeMutation.mutateAsync,
    completingId: completeMutation.isPending ? (completeMutation.variables ?? null) : null,
    skipPlan: skipMutation.mutateAsync,
    skippingId: skipMutation.isPending ? (skipMutation.variables ?? null) : null,
    copyPlansTo: (planIds: string[], toDate: string) =>
      copyMutation.mutateAsync({ planIds, toDate }),
    copying: copyMutation.isPending,
    reschedulePlansTo: (plans: PlanView[], toDate: string) =>
      rescheduleMutation.mutateAsync({ plans, toDate }),
    rescheduling: rescheduleMutation.isPending,
    refreshPlans,
  };
}

function translateCaught(error: unknown): string {
  if (isAppError(error)) return translateAppError(error);
  if (error instanceof Error) return error.message;
  return "加载失败";
}
