/** 从 LocalDate 得到「周三 · 本月第四周」一类副标题。 */
export function datePeriodLabel(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
    new Date(year, month - 1, day).getDay()
  ];
  const weekOfMonth = Math.floor((day - 1) / 7) + 1;
  const weekWords = ["一", "二", "三", "四", "五", "六"];
  const weekLabel = weekWords[weekOfMonth - 1] ?? String(weekOfMonth);
  return `${weekday} · 本月第${weekLabel}周`;
}
