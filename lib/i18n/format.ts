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
export function reportCoverageMonth(sendDate: string, locale: Locale): { month: string; year: string } {
  const sendDateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date(sendDate));
  const sendYear = Number(sendDateParts.find((p) => p.type === "year")!.value);
  const sendMonth = Number(sendDateParts.find((p) => p.type === "month")!.value); // 1-12, NY-local

  const coveredMonthIndex0 = sendMonth === 1 ? 11 : sendMonth - 2; // 0-based, for Date.UTC
  const coveredYear = sendMonth === 1 ? sendYear - 1 : sendYear;
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
 * Formats an ISO timestamp as a short, locale-appropriate date — e.g.
 * "Sep 28, 2026" (en) or "28 sept 2026" (es). Unlike formatMonthLabel,
 * this is for a real moment in time (e.g. pricing_assessed_at), not a
 * UTC-midnight calendar date, so it deliberately does NOT pin
 * timeZone: "UTC" — it renders in whatever timezone the process runs
 * in, same as every other "when did this happen" timestamp display in
 * the app.
 */
export function formatShortDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}
