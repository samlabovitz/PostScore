// scripts/check-insights.ts's date math. Pure.
import type { DayDate } from "./gbpInsights.server";
import { percentChange } from "./gbpInsights";

const fmt = (d: DayDate) => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

/** The months' first day … last day, ending yesterday at the latest; and
 * the same dates a year earlier. */
export function checkRange(from: string, to: string, now: Date) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(ty, tm, 0));
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const endDate = monthEnd < yesterday ? monthEnd : yesterday;
  const start: DayDate = { year: fy, month: fm, day: 1 };
  const end: DayDate = { year: endDate.getUTCFullYear(), month: endDate.getUTCMonth() + 1, day: endDate.getUTCDate() };
  const lastYearStart: DayDate = { ...start, year: start.year - 1 };
  const lastYearEnd: DayDate = { ...end, year: end.year - 1 };
  return { start, end, lastYearStart, lastYearEnd, label: `${fmt(start)} … ${fmt(end)}`, lastYearLabel: `${fmt(lastYearStart)} … ${fmt(lastYearEnd)}` };
}

/** "−13.4%" / "+24.5%" / "no comparison". */
export function percentText(now: number, before: number): string {
  const p = percentChange(now, before);
  return p === null ? "no comparison" : `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}%`;
}
