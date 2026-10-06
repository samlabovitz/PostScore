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
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(date));
}
