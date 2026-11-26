import type { AppError } from "../bindings";

/** 把后端错误码翻成界面提示。 */
export function translateAppError(error: AppError): string {
  switch (error.code) {
    case "not_found":
      return `找不到${error.entity}（${error.id}）`;
    case "validation":
      return error.message || `${error.field} 填写有误`;
    case "too_early":
      return `还没到开始时间（${formatStartsAt(error.startsAt)}），不能标记完成`;
    case "locked":
      return error.reason === "ended" ? "这条计划已结束，不能这样改" : "这条计划已经处理过了";
    case "parent_required":
      return `需要先选择所属的${levelLabel(error.level)}目标`;
    case "invalid_parent":
      return `所属目标必须是${levelLabel(error.expected)}目标`;
    case "internal":
      return error.message === "未实现"
        ? "这一功能还没接上后端"
        : error.message || "出了点问题，请稍后再试";
  }
}

export function isUnimplemented(error: AppError): boolean {
  return error.code === "internal" && error.message === "未实现";
}

function levelLabel(level: "year" | "month" | "week"): string {
  if (level === "year") return "年";
  if (level === "month") return "月";
  return "周";
}

function formatStartsAt(startsAt: string): string {
  const match = startsAt.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : startsAt;
}
