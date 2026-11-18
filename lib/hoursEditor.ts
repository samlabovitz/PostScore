// The week-of-hours editor's rules (components/hours/WeekHoursEditor.tsx),
// shared by the Google Profile tab's "Edit on Google" and Settings →
// "Your business details": 15-minute steps, typed times, copying a day,
// and Google's live hours as the editor's week. Pure.

import { closedWeek, formatTime, type DayHours, type WeeklyHours } from "@/lib/gbpProfileEdits";
import type { OpeningHoursPeriod } from "@/lib/google/places";

const DAY = 1440;

/** "Monday" in the owner's language (Google's day numbers: 0 = Sunday). */
export function dayName(day: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 4 + day)));
}
export const TIME_STEP = 15;

/** Every quarter hour, for the dropdown: 0, 15, … 1425. */
export const QUARTER_HOURS: number[] = Array.from({ length: DAY / TIME_STEP }, (_, i) => i * TIME_STEP);

/** The quarter hour the dropdown highlights for a time (an off-grid typed
 * time: the nearest one). */
export function nearestQuarter(minutes: number): number {
  return (Math.round(minutes / TIME_STEP) * TIME_STEP) % DAY;
}

/** The dropdown's fixed row and list heights (components/hours/TimePicker.tsx). */
export const DROPDOWN_ITEM_PX = 28;
export const DROPDOWN_LIST_PX = 224;

/** Where the dropdown opens: row `index` in the middle of the list
 * (never past the top or bottom). */
export function dropdownScrollTop(index: number): number {
  const max = QUARTER_HOURS.length * DROPDOWN_ITEM_PX - DROPDOWN_LIST_PX;
  return Math.max(0, Math.min(max, index * DROPDOWN_ITEM_PX - (DROPDOWN_LIST_PX - DROPDOWN_ITEM_PX) / 2));
}

/** ↑ / ↓: the next quarter hour up or down (wraps around midnight). */
export function stepTime(minutes: number, direction: 1 | -1): number {
  const next = direction === 1 ? Math.floor(minutes / TIME_STEP) * TIME_STEP + TIME_STEP : Math.ceil(minutes / TIME_STEP) * TIME_STEP - TIME_STEP;
  return ((next % DAY) + DAY) % DAY;
}

/**
 * A typed time: "9", "9:30", "930", "21:00", "2130", "9am", "9:30 PM",
 * "9:30 p. m.". Null when it isn't one.
 */
export function parseTypedTime(text: string): number | null {
  const s = text.toLowerCase().replace(/[\s.]/g, "");
  const m = /^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (minute > 59) return null;
  if (m[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (m[3].startsWith("p") ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

/** "until 2:00 AM next day" / "until midnight" — null when it closes the same day. */
export function overnightNote(open: number, close: number, locale: string, words: { nextDay: (time: string) => string; midnight: string }): string | null {
  if (close > open || close === open) return null;
  return close === 0 ? words.midnight : words.nextDay(formatTime(close, locale));
}

const copyDay = (d: DayHours): DayHours => (d.mode === "open" ? { mode: "open", ranges: d.ranges.map((r) => ({ ...r })) } : { mode: d.mode });

/** Monday's hours on Tuesday through Friday. */
export function copyToWeekdays(week: WeeklyHours): WeeklyHours {
  return week.map((d, day) => (day >= 2 && day <= 5 ? copyDay(week[1]) : d));
}

/** Monday's hours on every day. */
export function sameEveryDay(week: WeeklyHours): WeeklyHours {
  return week.map(() => copyDay(week[1]));
}

/** Google's live hours (Places periods; Business Profile's are converted to
 * the same shape) as the editor's week. Null when Google has none. */
export function weekFromPlacesPeriods(periods: OpeningHoursPeriod[] | null | undefined): WeeklyHours | null {
  if (!periods || periods.length === 0) return null;
  // Open all day, every day: one period with no close.
  if (periods.length === 1 && !periods[0].close) return Array.from({ length: 7 }, () => ({ mode: "open24" as const }));
  const week = closedWeek();
  for (const p of periods) {
    const o = p.open;
    const c = p.close;
    const day = o?.day;
    if (!o || !c || typeof day !== "number" || day < 0 || day > 6) continue;
    const open = (o.hour ?? 0) * 60 + (o.minute ?? 0);
    const close = (c.hour ?? 0) * 60 + (c.minute ?? 0);
    const current = week[day];
    if (current.mode === "open24") continue;
    if (open === 0 && close === 0 && c.day === (day + 1) % 7) {
      week[day] = { mode: "open24" };
      continue;
    }
    const ranges = current.mode === "open" ? current.ranges : [];
    week[day] = { mode: "open", ranges: [...ranges, { open, close }].sort((a, b) => a.open - b.open) };
  }
  return week;
}
