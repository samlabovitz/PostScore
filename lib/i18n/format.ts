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
