import type { AuditEvent, AuditPage } from "../bindings";
import { auditStore } from "./mockStore";

function sortedAudits(): AuditEvent[] {
  return [...auditStore].sort((a, b) => {
    const byTime = b.at.localeCompare(a.at);
    if (byTime !== 0) return byTime;
    return b.id.localeCompare(a.id);
  });
}

export async function listAudit(limit: number, beforeId: string | null): Promise<AuditPage> {
  const all = sortedAudits();
  let start = 0;
  if (beforeId) {
    const idx = all.findIndex((item) => item.id === beforeId);
    start = idx >= 0 ? idx + 1 : all.length;
  }
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit) || 20));
  return {
    items: all.slice(start, start + safeLimit),
    total: all.length,
  };
}
