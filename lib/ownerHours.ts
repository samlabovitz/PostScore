// Hours the OWNER enters for their starter website (Website page →
// starter-site builder) — for when Google has none, or to adjust them for
// the website. They appear on the generated site and in its schema.org
// openingHoursSpecification, and NEVER feed scoring: they're stored in
// their own column (businesses.starter_site_hours, supabase/hours.sql),
// which lib/scoring.ts never reads — the Google listing part of PostScore
// only ever counts Google's own hours. Pure; times formatted by hand (no
// Intl) so server and browser render identical text.

import type { OpeningHoursPeriod } from "@/lib/google/places";
import type { Locale } from "@/lib/i18n";

export const OWNER_HOURS_NOTE_MAX = 80;
/** A second range per day, e.g. a split lunch break. */
export const MAX_RANGES_PER_DAY = 2;

/** "HH:MM", 24-hour, on a 15-minute step. */
export type HHMM = string;

export interface TimeRange {
  open: HHMM;
  close: HHMM;
}

export interface DayHours {
  open: boolean;
  allDay: boolean;
  ranges: TimeRange[];
}

export interface OwnerHours {
  /** "appointment" shows "By appointment only" instead of a table. */
  mode: "weekly" | "appointment";
  /** Monday … Sunday. */
  days: DayHours[];
  note: string;
}

/** Display order Monday → Sunday as Google day numbers (0 = Sunday). */
const GOOGLE_DAY_FOR_INDEX = [1, 2, 3, 4, 5, 6, 0];
const SCHEMA_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const DAY_NAMES: Record<Locale, string[]> = {
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  es: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"],
};

const HHMM_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/;

/** Every 15-minute time of day, "00:00" … "23:45". */
export const TIME_OPTIONS: HHMM[] = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

const closedDay = (): DayHours => ({ open: false, allDay: false, ranges: [{ open: "09:00", close: "17:00" }] });
const nineToFive = (): DayHours => ({ open: true, allDay: false, ranges: [{ open: "09:00", close: "17:00" }] });

/** A starting point for an empty editor: weekdays 9–5, weekend closed. */
export function defaultOwnerHours(): OwnerHours {
  return { mode: "weekly", days: [nineToFive(), nineToFive(), nineToFive(), nineToFive(), nineToFive(), closedDay(), closedDay()], note: "" };
}

function minutes(t: HHMM): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Stored or posted data is untrusted: keep only a valid shape, or null. */
export function sanitizeOwnerHours(value: unknown): OwnerHours | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.days) || v.days.length !== 7) return null;
  const days: DayHours[] = [];
  for (const raw of v.days) {
    if (!raw || typeof raw !== "object") return null;
    const d = raw as Record<string, unknown>;
    const ranges = Array.isArray(d.ranges)
      ? d.ranges
          .slice(0, MAX_RANGES_PER_DAY)
          .filter((r): r is TimeRange => !!r && typeof r === "object" && HHMM_RE.test(String((r as TimeRange).open)) && HHMM_RE.test(String((r as TimeRange).close)))
          .map((r) => ({ open: r.open, close: r.close }))
      : [];
    days.push({ open: d.open === true, allDay: d.allDay === true, ranges: ranges.length > 0 ? ranges : [{ open: "09:00", close: "17:00" }] });
  }
  const note = typeof v.note === "string" ? Array.from(v.note.replace(/[\u0000-\u001f\u007f]/g, " ").trim()).slice(0, OWNER_HOURS_NOTE_MAX).join("") : "";
  return { mode: v.mode === "appointment" ? "appointment" : "weekly", days, note };
}

export type HoursError = "same_time" | "overlap";

/** Problems per day (index 0 = Monday); empty when every open day is valid.
 * A close time before the open time means past midnight (6 PM–2 AM) and
 * is fine; the same open and close time is not. A second range must
 * start after the first one ends. */
export function validateOwnerHours(hours: OwnerHours): Array<HoursError | null> {
  return hours.days.map((day) => {
    if (hours.mode === "appointment" || !day.open || day.allDay) return null;
    for (const r of day.ranges) if (r.open === r.close) return "same_time";
    if (day.ranges.length === 2) {
      const [a, b] = day.ranges;
      const aEnd = minutes(a.close) <= minutes(a.open) ? minutes(a.close) + 1440 : minutes(a.close);
      if (minutes(b.open) < aEnd || minutes(a.close) <= minutes(a.open)) return "overlap";
    }
    return null;
  });
}

export function isValidOwnerHours(hours: OwnerHours): boolean {
  return validateOwnerHours(hours).every((e) => e === null);
}

/** Tuesday–Friday become a copy of Monday (weekend untouched). */
export function sameEveryWeekday(hours: OwnerHours): OwnerHours {
  const mon = hours.days[0];
  return { ...hours, days: hours.days.map((d, i) => (i >= 1 && i <= 4 ? structuredCloneDay(mon) : d)) };
}

/** Every day becomes a copy of Monday. */
export function copyMondayToAll(hours: OwnerHours): OwnerHours {
  const mon = hours.days[0];
  return { ...hours, days: hours.days.map(() => structuredCloneDay(mon)) };
}

function structuredCloneDay(d: DayHours): DayHours {
  return { open: d.open, allDay: d.allDay, ranges: d.ranges.map((r) => ({ ...r })) };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Google's periods as owner hours (the editor's prefill), or null when
 * they don't fit (more than 2 ranges a day, unparseable). */
export function ownerHoursFromGoogle(periods: OpeningHoursPeriod[] | null): OwnerHours | null {
  if (!periods || periods.length === 0) return null;
  // Open 24/7: one period, open Sunday 00:00, no close.
  if (periods.length === 1 && periods[0].open && !periods[0].close && (periods[0].open.hour ?? 0) === 0 && (periods[0].open.minute ?? 0) === 0) {
    return { mode: "weekly", days: Array.from({ length: 7 }, () => ({ open: true, allDay: true, ranges: [{ open: "00:00", close: "00:00" }] })), note: "" };
  }
  const days: DayHours[] = Array.from({ length: 7 }, () => closedDay());
  for (const p of periods) {
    const o = p.open;
    const c = p.close;
    if (!o || !c || typeof o.day !== "number" || typeof c.day !== "number") return null;
    const index = GOOGLE_DAY_FOR_INDEX.indexOf(o.day);
    if (index < 0) return null;
    const open = `${pad(o.hour ?? 0)}:${pad(o.minute ?? 0)}`;
    const close = `${pad(c.hour ?? 0)}:${pad(c.minute ?? 0)}`;
    const day = days[index];
    // A period that runs a full 24 hours (same time the next day).
    if (open === "00:00" && close === "00:00" && c.day !== o.day) {
      days[index] = { open: true, allDay: true, ranges: [{ open: "00:00", close: "00:00" }] };
      continue;
    }
    if (day.open) {
      if (day.ranges.length >= MAX_RANGES_PER_DAY) return null;
      day.ranges.push({ open, close });
    } else {
      days[index] = { open: true, allDay: false, ranges: [{ open, close }] };
    }
  }
  for (const d of days) d.ranges.sort((a, b) => minutes(a.open) - minutes(b.open));
  return { mode: "weekly", days, note: "" };
}

/** Same days, times and modes (the note doesn't count). */
export function sameSchedule(a: OwnerHours, b: OwnerHours): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === "appointment") return true;
  return a.days.every((d, i) => {
    const e = b.days[i];
    if (d.open !== e.open) return false;
    if (!d.open) return true;
    if (d.allDay || e.allDay) return d.allDay === e.allDay;
    return d.ranges.length === e.ranges.length && d.ranges.every((r, j) => r.open === e.ranges[j].open && r.close === e.ranges[j].close);
  });
}

/** "9:00 AM" / "9:00 a.m." (the same Spanish style as lib/hours.ts). */
export function formatTime(t: HHMM, locale: Locale): string {
  const [h, m] = t.split(":").map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = locale === "es" ? (h < 12 ? "a.m." : "p.m.") : h < 12 ? "AM" : "PM";
  return `${hour12}:${pad(m)} ${suffix}`;
}

const WORDS = {
  en: { closed: "Closed", allDay: "Open 24 hours", appointment: "By appointment only" },
  es: { closed: "Cerrado", allDay: "Abierto las 24 horas", appointment: "Solo con cita previa" },
} as const;

export function appointmentOnlyLabel(locale: Locale): string {
  return WORDS[locale].appointment;
}

/** One display row per day, Monday → Sunday. */
export function hoursRows(hours: OwnerHours, locale: Locale): Array<{ index: number; day: string; text: string }> {
  return hours.days.map((d, index) => ({
    index,
    day: DAY_NAMES[locale][index],
    text: !d.open ? WORDS[locale].closed : d.allDay ? WORDS[locale].allDay : d.ranges.map((r) => `${formatTime(r.open, locale)} – ${formatTime(r.close, locale)}`).join(", "),
  }));
}

/** schema.org openingHoursSpecification (empty for appointment-only). A
 * close earlier than the open time means the next morning. */
export function openingHoursSpecification(hours: OwnerHours): Array<Record<string, string>> {
  if (hours.mode === "appointment") return [];
  return hours.days.flatMap((d, i) => {
    if (!d.open) return [];
    if (d.allDay) return [{ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${SCHEMA_DAYS[i]}`, opens: "00:00", closes: "23:59" }];
    return d.ranges.map((r) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${SCHEMA_DAYS[i]}`, opens: r.open, closes: r.close }));
  });
}
