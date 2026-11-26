import { isTauri } from "@tauri-apps/api/core";
import { commands, events, type AuditPage } from "../bindings";
import { isUnimplemented } from "../errors/appError";
import * as mockAudit from "./mockAudit";
import { subscribeAudit } from "./mockStore";
import { isAppError, unwrapResult } from "./result";

export async function listAudit(limit: number, beforeId: string | null): Promise<AuditPage> {
  if (!isTauri()) return mockAudit.listAudit(limit, beforeId);
  try {
    return unwrapResult(await commands.listAudit(limit, beforeId));
  } catch (error) {
    if (isAppError(error) && isUnimplemented(error)) {
      return mockAudit.listAudit(limit, beforeId);
    }
    throw error;
  }
}

export function listenAuditChanged(onChange: () => void): () => void {
  if (!isTauri()) return subscribeAudit(onChange);
  let disposed = false;
  let unlisten: (() => void) | undefined;
  void events.dataChanged
    .listen((event) => {
      if (!disposed && event.payload.entities.includes("audit")) onChange();
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
