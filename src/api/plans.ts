import { isTauri } from "@tauri-apps/api/core";
import {
  commands,
  events,
  type CopyPlansInput,
  type NowInfo,
  type PlanFields,
  type PlanSaveResult,
  type PlanView,
  type RescheduleResult,
  type SkipPlanInput,
} from "../bindings";
import { isUnimplemented } from "../errors/appError";
import * as mock from "./mock";
import { unwrapResult } from "./result";

export type PlanBackendMode = "tauri" | "mock";

export function planBackendMode(): PlanBackendMode {
  return isTauri() ? "tauri" : "mock";
}

export async function getNow(): Promise<NowInfo> {
  if (!isTauri()) return mock.getNow();
  return commands.getNow();
}

export async function listPlans(date: string): Promise<PlanView[]> {
  if (!isTauri()) return mock.listPlans(date);
  return unwrapResult(await commands.listPlans(date));
}

export async function createPlan(date: string, fields: PlanFields): Promise<PlanSaveResult> {
  if (!isTauri()) return mock.createPlan(date, fields);
  return unwrapResult(await commands.createPlan(date, fields));
}

export async function completePlan(id: string): Promise<PlanView> {
  if (!isTauri()) return mock.completePlan(id);
  return unwrapResult(await commands.completePlan(id));
}

export async function skipPlan(input: SkipPlanInput): Promise<PlanView> {
  if (!isTauri()) return mock.skipPlan(input);
  return unwrapResult(await commands.skipPlan(input));
}

export async function copyPlans(input: CopyPlansInput): Promise<PlanView[]> {
  if (!isTauri()) return mock.copyPlans(input);
  return unwrapResult(await commands.copyPlans(input));
}

export async function reschedulePlan(
  id: string,
  date: string,
  fields: PlanFields,
): Promise<RescheduleResult> {
  if (!isTauri()) return mock.reschedulePlan(id, date, fields);
  return unwrapResult(await commands.reschedulePlan(id, date, fields));
}

export { fieldsFromPlan } from "../lib/planFields";

export function listenDataChanged(onChange: (entities: string[]) => void): () => void {
  if (!isTauri()) {
    return () => undefined;
  }
  let disposed = false;
  let unlisten: (() => void) | undefined;
  void events.dataChanged
    .listen((event) => {
      if (!disposed) onChange(event.payload.entities);
    })
    .then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    })
    .catch(() => {
      // 事件通道不可用时忽略，界面仍可手动刷新。
    });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

export function listenMinuteTick(onTick: () => void): () => void {
  if (!isTauri()) {
    const timer = window.setInterval(onTick, 30_000);
    return () => window.clearInterval(timer);
  }
  let disposed = false;
  let unlisten: (() => void) | undefined;
  void events.minuteTick
    .listen(() => {
      if (!disposed) onTick();
    })
    .then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    })
    .catch(() => undefined);
  return () => {
    disposed = true;
    unlisten?.();
  };
}

export { isUnimplemented };
