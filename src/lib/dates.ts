/** 在 LocalDate 上加减整天。 */
export function addDays(date: string, days: number): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;
  const base = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  base.setDate(base.getDate() + days);
  return [
    base.getFullYear(),
    String(base.getMonth() + 1).padStart(2, "0"),
    String(base.getDate()).padStart(2, "0"),
  ].join("-");
}
