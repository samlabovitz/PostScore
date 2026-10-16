import type { Locale } from "./locale";

/**
 * Formats an ISO date as a locale-appropriate "Month Year" label — e.g.
 * "September 2026" (en) or "septiembre de 2026" (es). timeZone: "UTC" is
 * load-bearing, not decoration: `date` is a UTC-midnight ISO date, and
 * formatting it in whatever timezone the process happens to run in can
 * silently roll it back to the previous day, mislabeling the month —
 * same reasoning as the English-only formatMonthLabel this is meant to
 * eventually replace in emails/MonthlyReportEmail.tsx (not wired up yet).
 */
export function formatMonthLabel(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

/**
 * The real calendar month a monthly report COVERS — the month BEFORE
 * `sendDate`, computed off `sendDate`'s America/New_York-local calendar
 * date, not UTC. Load-bearing, not decoration: a report sent just after
 * midnight UTC on the 1st can still be the previous evening in US
 * Eastern time, and computing "previous month" off the wrong calendar
 * day would mislabel the report by a full month at that boundary.
 * Returns the bare localized month name and year separately (e.g.
 * `{month: "September", year: "2026"}`) rather than a single combined
 * string, so a caller composes its own full phrasing (e.g. "{month}
 * {year} recap") via t() instead of this function dictating the
 * sentence.
 */
/** Shared by reportCoverageMonth/reportCoverageMonthIndex/
 * reportCoverageMonthRange below — the real calendar month BEFORE
 * `sendDate`, computed off `sendDate`'s America/New_York-local calendar
 * date, never UTC (see reportCoverageMonth's own doc for why). Returns
 * the covered month as a real (year, 0-based month) pair — the one
 * computation every caller below needs, each just presenting it
 * differently. */
function coveredYearMonth(sendDate: string): { year: number; month0: number } {
  const sendDateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date(sendDate));
  const sendYear = Number(sendDateParts.find((p) => p.type === "year")!.value);
  const sendMonth = Number(sendDateParts.find((p) => p.type === "month")!.value); // 1-12, NY-local

  return {
    month0: sendMonth === 1 ? 11 : sendMonth - 2, // 0-based, for Date.UTC
    year: sendMonth === 1 ? sendYear - 1 : sendYear,
  };
}

export function reportCoverageMonth(sendDate: string, locale: Locale): { month: string; year: string } {
  const { year: coveredYear, month0: coveredMonthIndex0 } = coveredYearMonth(sendDate);
  // Noon UTC on the 1st of the covered month — nowhere near a DST/date
  // boundary in any real timezone, so formatting this below can never
  // roll it back/forward to a different month.
  const reference = new Date(Date.UTC(coveredYear, coveredMonthIndex0, 1, 12));

  return {
    month: new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(reference),
    year: String(coveredYear),
  };
}

/**
 * A real, monotonically-increasing index for the covered month
 * (`year * 12 + month0`) — NEVER the raw "YYYYMM" digits, which jump
 * unevenly across year boundaries (see buildAssistantStarterPrompts'
 * own real rotation-bug fix in lib/assistant.ts for why that matters).
 * This index always increments by exactly 1 from one real covered
 * month to the next, which is what lets a caller (e.g.
 * lib/monthlyReport.ts's buildFocus) deterministically rotate "which
 * eligible thing to show" by real calendar month without ever
 * colliding two different months onto the same pick.
 */
export function reportCoverageMonthIndex(sendDate: string): number {
  const { year, month0 } = coveredYearMonth(sendDate);
  return year * 12 + month0;
}

/**
 * The covered month's real calendar-day boundaries, as plain
 * "YYYY-MM-DD" date strings — `start` is the 1st of the covered month,
 * `end` is the 1st of the FOLLOWING month (an exclusive upper bound),
 * both in the covered month's own America/New_York-local calendar day.
 * Built for a `gte(start).lt(end)` range query against a plain DATE
 * column (e.g. weekly_checks.week_start) — never a timestamp comparison,
 * since DATE columns have no timezone of their own to reconcile against.
 */
export function reportCoverageMonthRange(sendDate: string): { start: string; end: string } {
  const { year, month0 } = coveredYearMonth(sendDate);
  const toDateString = (y: number, m0: number) => new Date(Date.UTC(y, m0, 1)).toISOString().slice(0, 10);
  const nextMonth0 = month0 === 11 ? 0 : month0 + 1;
  const nextYear = month0 === 11 ? year + 1 : year;
  return { start: toDateString(year, month0), end: toDateString(nextYear, nextMonth0) };
}

/**
 * No business has a stored timezone column today (see
 * businesses/supabase/schema.sql — confirmed empty of any tz column),
 * and this server process's own runtime timezone is incidental (Vercel
 * defaults to UTC) and has nothing to do with where the business
 * actually is — so every owner-facing date about a specific moment
 * (a scan, a price check, a confirmed fix) falls back to this single
 * constant until a real per-business timezone exists. Same fallback,
 * same reasoning, as WEEKLY_CHECKLIST_TIMEZONE in
 * lib/weeklyChecklist.ts (a different feature, independently arriving
 * at the identical answer) — if a real per-business timezone is ever
 * added, thread it through formatShortDate's `timeZone` parameter
 * below instead of this constant.
 */
export const DEFAULT_BUSINESS_TIMEZONE = "America/New_York";

/**
 * Day 4b: every owner-facing date about a real moment (a scan, a price
 * check, a capture) is built HERE, by hand, from plain digits — never by
 * handing a whole date to Intl/toLocaleString. Load-bearing: these
 * strings render once on the server (Node) and again in the browser
 * during hydration, and engines disagree on Intl's glue text — Node
 * prints "Oct 16, 2026, 12:03 AM" where Safari prints "Oct 16, 2026 at
 * 12:03 AM", and Spanish short months vary ("sep" vs "sept"). Any
 * difference is a React hydration error. So Intl is only asked for the
 * NUMERIC year/month/day/hour/minute in a fixed time zone (digits are
 * the same in every engine), and the words and punctuation come from
 * the tables below. Same output on any machine, any browser, any time
 * zone.
 */
const MONTHS_SHORT: Record<Locale, readonly string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"],
};

const MONTHS_LONG: Record<Locale, readonly string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
};

interface ZonedParts {
  year: number;
  /** 0-11 */
  month0: number;
  day: number;
  /** 0-23 */
  hour: number;
  minute: number;
}

function zonedParts(date: string, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(date));
  const num = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: num("year"),
    month0: num("month") - 1,
    day: num("day"),
    // Some engines still report midnight as "24" under h23.
    hour: num("hour") % 24,
    minute: num("minute"),
  };
}

function formatTime(p: ZonedParts, locale: Locale): string {
  const mm = String(p.minute).padStart(2, "0");
  if (locale === "es") return `${p.hour}:${mm}`;
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${mm} ${p.hour < 12 ? "AM" : "PM"}`;
}

/**
 * Formats an ISO timestamp as a short, locale-appropriate date — e.g.
 * "Sep 28, 2026" (en) or "28 sept 2026" (es). Unlike formatMonthLabel,
 * this is for a real moment in time (e.g. pricing_assessed_at), not a
 * UTC-midnight calendar date.
 *
 * `timeZone` defaults to DEFAULT_BUSINESS_TIMEZONE rather than the
 * server process's own ambient timezone — load-bearing, not decoration:
 * a scan saved late in the evening US-Eastern (e.g. 11:30pm on the
 * 30th) is already past midnight UTC (12:30am the 1st), so formatting
 * in whatever timezone the process happens to run in could silently
 * roll the displayed date forward a full day from the business's own
 * real local day. Every caller gets this fix automatically; pass an
 * explicit `timeZone` only once a real per-business one exists.
 */
export function formatShortDate(date: string, locale: Locale, timeZone: string = DEFAULT_BUSINESS_TIMEZONE): string {
  const p = zonedParts(date, timeZone);
  const month = MONTHS_SHORT[locale][p.month0];
  return locale === "es" ? `${p.day} ${month} ${p.year}` : `${month} ${p.day}, ${p.year}`;
}

/** "October 16, 2026" (en) / "16 de octubre de 2026" (es). */
export function formatLongDate(date: string, locale: Locale, timeZone: string = DEFAULT_BUSINESS_TIMEZONE): string {
  const p = zonedParts(date, timeZone);
  const month = MONTHS_LONG[locale][p.month0];
  return locale === "es" ? `${p.day} de ${month} de ${p.year}` : `${month} ${p.day}, ${p.year}`;
}

/** "Oct 16" (en) / "16 oct" (es) — no year, e.g. chart axis labels. */
export function formatMonthDay(date: string, locale: Locale, timeZone: string = DEFAULT_BUSINESS_TIMEZONE): string {
  const p = zonedParts(date, timeZone);
  const month = MONTHS_SHORT[locale][p.month0];
  return locale === "es" ? `${p.day} ${month}` : `${month} ${p.day}`;
}

/** "Oct 16, 2026, 12:03 AM" (en) / "16 oct 2026, 0:03" (es). */
export function formatDateTime(date: string, locale: Locale, timeZone: string = DEFAULT_BUSINESS_TIMEZONE): string {
  return `${formatShortDate(date, locale, timeZone)}, ${formatTime(zonedParts(date, timeZone), locale)}`;
}

/** "Oct 16, 12:03 AM" (en) / "16 oct, 0:03" (es) — no year. */
export function formatMonthDayTime(date: string, locale: Locale, timeZone: string = DEFAULT_BUSINESS_TIMEZONE): string {
  return `${formatMonthDay(date, locale, timeZone)}, ${formatTime(zonedParts(date, timeZone), locale)}`;
}

/**
 * A whole-number count (e.g. a Google review count) — "1,234" /
 * "12,345" (en), "1234" / "12.345" (es: a period groups thousands, and
 * a four-digit number isn't grouped, the standard Spanish style). Built
 * by hand for the same reason as the dates above: toLocaleString() with
 * no locale uses whatever language the server or the browser happens to
 * run in, so a Spanish-language browser printing "1.234" over the
 * server's "1,234" is a React hydration error. Rounds to a whole number.
 */
export function formatCount(value: number, locale: Locale): string {
  const n = Math.round(value);
  const digits = String(Math.abs(n));
  const sign = n < 0 ? "-" : "";
  if (locale === "es" && digits.length <= 4) return sign + digits;
  const separator = locale === "es" ? "." : ",";
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}
