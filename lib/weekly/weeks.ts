// Weeks for the weekly recap, the weekly PDF and the weekly snapshots:
// Monday–Sunday in the business's own time zone (the same Monday as the
// weekly routine — lib/weeklyChecklist.ts weekStartFor). Pure.

import { weekStartFor } from "@/lib/weeklyChecklist";

export { weekStartFor };

/** Plain calendar arithmetic on "YYYY-MM-DD" (no time zone involved). */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** The week's Sunday ("YYYY-MM-DD"). */
export function weekEndDay(weekStart: string): string {
  return addDays(weekStart, 6);
}

/** The offset (minutes) of `timeZone` from UTC at `instant`. */
function offsetMinutes(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(instant))
    .reduce<Record<string, number>>((acc, p) => (p.type === "literal" ? acc : { ...acc, [p.type]: Number(p.value) }), {});
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - instant) / 60_000);
}

/** The instant local midnight starts on `ymd` in `timeZone` (DST-safe). */
export function localMidnight(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMinutes(guess, timeZone) * 60_000;
  t = guess - offsetMinutes(t, timeZone) * 60_000;
  return new Date(t);
}

/** [start, end) instants of the week starting `weekStart`. */
export function weekBounds(weekStart: string, timeZone: string): { start: Date; end: Date } {
  return { start: localMidnight(weekStart, timeZone), end: localMidnight(addDays(weekStart, 7), timeZone) };
}

/** Which week (Monday) an instant falls in, in the business's zone. */
export function weekOf(iso: string, timeZone: string): string {
  return weekStartFor(new Date(iso), timeZone);
}

/** A week is over once its Sunday has ended in the business's zone. */
export function isWeekOver(weekStart: string, now: Date, timeZone: string): boolean {
  return now.getTime() >= weekBounds(weekStart, timeZone).end.getTime();
}

/** Distinct weeks that have at least one scan, newest first. */
export function weeksWithScans(scanDates: string[], timeZone: string): string[] {
  return Array.from(new Set(scanDates.map((d) => weekOf(d, timeZone)))).sort((a, b) => b.localeCompare(a));
}
