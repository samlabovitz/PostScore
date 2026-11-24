// How a fix's points read, everywhere (Fix plan, Overview, the recap, PostAI,
// reports — Day 25B step 3): one decimal under 10 ("+4.7", "+0.5"), whole
// numbers from 10 up ("+13", "about +29–31 pts"). A range that reads as a
// single number collapses to that number.

import { t, tPlural } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";

export type WholePointRange = { low: number; high: number | null };

/** One decimal under 10, whole from 10 up. */
export function displayPoints(points: number): number {
  return Math.abs(points) >= 10 ? Math.round(points) : Math.round(points * 10) / 10;
}

/** A fix's points as shown (displayPoints): never below +0.1 (a fix always adds something). */
export function wholePointRange(low: number, high: number | null): WholePointRange {
  const lo = Math.max(0.1, displayPoints(low));
  const hi = high === null ? null : displayPoints(high);
  return { low: lo, high: hi !== null && hi > lo ? hi : null };
}

/** "…could add about +29–31 pts…" for the get-a-website banner. */
export function websiteRangeText(locale: Locale, low: number, high: number | null): string {
  const range = wholePointRange(low, high);
  return range.high !== null
    ? t(locale, "dashboard.growth.websiteBanner.getWebsite.range", { low: range.low, high: range.high })
    : t(locale, "dashboard.growth.websiteBanner.getWebsite.single", { points: range.low });
}

/** "+1 pt" / "+4 pts", or "about +2 pts" for an estimate. */
export function pointsText(locale: Locale, points: number, about = false): string {
  return tPlural(locale, about ? "dashboard.overview.recs.pointsAbout" : "dashboard.overview.recs.points", points, { points });
}

/** "about +29–31 pts" on a recommendation row. */
export function recRangeText(locale: Locale, low: number, high: number): string {
  const range = wholePointRange(low, high);
  return range.high !== null
    ? t(locale, "dashboard.overview.recs.pointsRange", { low: range.low, high: range.high })
    : pointsText(locale, range.low, true);
}
