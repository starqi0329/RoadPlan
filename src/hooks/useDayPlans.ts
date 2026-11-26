import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  completePlan,
  createPlan,
  getNow,
  isUnimplemented,
  listenDataChanged,
  listenMinuteTick,
  listPlans,
  planBackendMode,
  skipPlan,
} from "../api/plans";
import { isAppError } from "../api/result";
import type { PlanFields, PlanSaveResult, PlanView } from "../bindings";
import { translateAppError } from "../errors/appError";

const nowKey = ["now"] as const;
const plansKey = (date: string) => ["plans", date] as const;

export function useDayPlans() {
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [backendGap, setBackendGap] = useState(false);

  const nowQuery = useQuery({
    queryKey: nowKey,
    queryFn: getNow,
  });

  const date = nowQuery.data?.date ?? null;

  const plansQuery = useQuery({
    queryKey: date ? plansKey(date) : ["plans", "pending"],
    queryFn: async () => {
      if (!date) return [] as PlanView[];
      try {
        return await listPlans(date);
      } catch (error) {
        if (isAppError(error) && isUnimplemented(error)) {
          setBackendGap(true);
          return [] as PlanView[];
        }
        throw error;
      }
    },
    enabled: Boolean(date),
  });

  useEffect(() => {
    if (planBackendMode() === "mock") {
      setBanner("浏览器演示数据：关掉页面会清空，不会写入本地数据库。");
    }
  }, []);

  useEffect(() => {
    return listenDataChanged((entities) => {
      if (entities.includes("plan") && date) {
        void queryClient.invalidateQueries({ queryKey: plansKey(date) });
      }
    });
  }, [date, queryClient]);

  useEffect(() => {
    return listenMinuteTick(() => {
      void queryClient.invalidateQueries({ queryKey: nowKey });
      if (date) {
        void queryClient.invalidateQueries({ queryKey: plansKey(date) });
      }
    });
  }, [date, queryClient]);

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

  async function refreshPlans() {
    if (!date) return;
    await queryClient.invalidateQueries({ queryKey: plansKey(date) });
  }

  const createMutation = useMutation({
    mutationFn: (fields: PlanFields) => {
      if (!date) throw new Error("还不知道今天的日期");
      return createPlan(date, fields);
    },
    onSuccess: async (result: PlanSaveResult) => {
      await refreshPlans();
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

  return {
    mode: planBackendMode(),
    backendGap,
    banner,
    toast,
    clearToast: () => setToast(null),
    now: nowQuery.data ?? null,
    date,
    plans: plansQuery.data ?? [],
    loading: nowQuery.isLoading || plansQuery.isLoading,
    loadError:
      nowQuery.error || (plansQuery.error && !backendGap)
        ? translateCaught(nowQuery.error ?? plansQuery.error)
        : null,
    createPlan: createMutation.mutateAsync,
    creating: createMutation.isPending,
    completePlan: completeMutation.mutateAsync,
    completingId: completeMutation.isPending ? (completeMutation.variables ?? null) : null,
    skipPlan: skipMutation.mutateAsync,
    skippingId: skipMutation.isPending ? (skipMutation.variables ?? null) : null,
  };
}

function translateCaught(error: unknown): string {
  if (isAppError(error)) return translateAppError(error);
  if (error instanceof Error) return error.message;
  return "加载失败";
}
