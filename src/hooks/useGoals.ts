import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  addMilestone,
  createGoal,
  deleteGoal,
  listDeletedGoals,
  listGoals,
  previewDeleteGoal,
  restoreGoal,
  setGoalState,
  setMilestoneState,
} from "../api/goals";
import { listenDataChanged, planBackendMode } from "../api/plans";
import { isAppError } from "../api/result";
import type {
  CreateGoalInput,
  DeleteGoalImpact,
  GoalState,
  GoalView,
  MilestoneState,
} from "../bindings";
import { isUnimplemented, translateAppError } from "../errors/appError";

const goalsKey = ["goals"] as const;
const deletedKey = ["goals", "deleted"] as const;

export function useGoals() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const [backendGap, setBackendGap] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const goalsQuery = useQuery({
    queryKey: goalsKey,
    queryFn: async () => {
      try {
        return await listGoals(null, null);
      } catch (error) {
        if (isAppError(error) && isUnimplemented(error)) {
          setBackendGap(true);
          return [] as GoalView[];
        }
        throw error;
      }
    },
  });

  const deletedQuery = useQuery({
    queryKey: deletedKey,
    queryFn: async () => {
      try {
        return await listDeletedGoals();
      } catch (error) {
        if (isAppError(error) && isUnimplemented(error)) {
          setBackendGap(true);
          return [] as GoalView[];
        }
        throw error;
      }
    },
  });

  useEffect(() => {
    if (planBackendMode() === "mock") {
      setBanner("浏览器演示数据：关掉页面会清空，不会写入本地数据库。");
    }
  }, []);

  useEffect(() => {
    return listenDataChanged((entities) => {
      if (entities.includes("goal") || entities.includes("plan")) {
        void queryClient.invalidateQueries({ queryKey: goalsKey });
        void queryClient.invalidateQueries({ queryKey: deletedKey });
      }
    });
  }, [queryClient]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function showError(error: unknown) {
    if (isAppError(error)) {
      if (isUnimplemented(error)) setBackendGap(true);
      setToast(translateAppError(error));
      return;
    }
    setToast(error instanceof Error ? error.message : "操作失败");
  }

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: goalsKey }),
      queryClient.invalidateQueries({ queryKey: deletedKey }),
      queryClient.invalidateQueries({ queryKey: ["plans"] }),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: (input: CreateGoalInput) => createGoal(input),
    onSuccess: async () => {
      await refreshAll();
      setToast("目标已创建");
    },
    onError: showError,
  });

  const stateMutation = useMutation({
    mutationFn: ({ id, state }: { id: string; state: GoalState }) => setGoalState(id, state),
    onSuccess: async () => {
      await refreshAll();
      setToast("状态已更新");
    },
    onError: showError,
  });

  const previewMutation = useMutation({
    mutationFn: (id: string) => previewDeleteGoal(id),
    onError: showError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGoal(id),
    onSuccess: async (impact: DeleteGoalImpact) => {
      await refreshAll();
      setToast(
        `已归档 ${impact.goalsArchived} 个目标；删除 ${impact.plansDeleted} 条未结束计划，保留 ${impact.plansKept} 条`,
      );
    },
    onError: showError,
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreGoal(id),
    onSuccess: async () => {
      await refreshAll();
      setToast("目标已恢复");
    },
    onError: showError,
  });

  const milestoneAddMutation = useMutation({
    mutationFn: ({ goalId, title }: { goalId: string; title: string }) =>
      addMilestone(goalId, title),
    onSuccess: async () => {
      await refreshAll();
      setToast("里程碑已添加");
    },
    onError: showError,
  });

  const milestoneStateMutation = useMutation({
    mutationFn: ({
      goalId,
      milestoneId,
      state,
    }: {
      goalId: string;
      milestoneId: string;
      state: MilestoneState;
    }) => setMilestoneState(goalId, milestoneId, state),
    onSuccess: async () => {
      await refreshAll();
    },
    onError: showError,
  });

  return {
    mode: planBackendMode(),
    backendGap,
    banner,
    toast,
    setToast,
    goals: goalsQuery.data ?? [],
    deleted: deletedQuery.data ?? [],
    loading: goalsQuery.isLoading || deletedQuery.isLoading,
    loadError:
      goalsQuery.error || deletedQuery.error
        ? translateCaught(goalsQuery.error ?? deletedQuery.error)
        : null,
    createGoal: createMutation.mutateAsync,
    creating: createMutation.isPending,
    setGoalState: (id: string, state: GoalState) => stateMutation.mutateAsync({ id, state }),
    previewDelete: previewMutation.mutateAsync,
    deleteGoal: deleteMutation.mutateAsync,
    deleting: deleteMutation.isPending,
    restoreGoal: restoreMutation.mutateAsync,
    addMilestone: (goalId: string, title: string) =>
      milestoneAddMutation.mutateAsync({ goalId, title }),
    setMilestoneState: (goalId: string, milestoneId: string, state: MilestoneState) =>
      milestoneStateMutation.mutateAsync({ goalId, milestoneId, state }),
  };
}

function translateCaught(error: unknown): string {
  if (isAppError(error)) return translateAppError(error);
  if (error instanceof Error) return error.message;
  return "加载失败";
}
