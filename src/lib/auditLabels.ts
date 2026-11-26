import type { AuditAction, AuditEntity } from "../bindings";

export function auditActionLabel(action: AuditAction): string {
  switch (action) {
    case "create":
      return "新建";
    case "update":
      return "修改";
    case "complete":
      return "完成";
    case "reopen":
      return "重开";
    case "skip":
      return "跳过";
    case "reschedule":
      return "改期";
    case "copy":
      return "复制";
    case "delete":
      return "删除";
    case "restore":
      return "恢复";
    case "note":
      return "备注";
    case "review":
      return "复盘";
    case "state":
      return "状态";
  }
}

export function auditEntityLabel(entity: AuditEntity): string {
  switch (entity) {
    case "plan":
      return "计划";
    case "goal":
      return "目标";
    case "milestone":
      return "里程碑";
    case "review":
      return "复盘";
  }
}

export function formatAuditTime(at: string): string {
  const match = at.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (match) return `${match[1]} ${match[2]}`;
  return at;
}
