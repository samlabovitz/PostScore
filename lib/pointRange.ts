// Point estimates that come as a range ("a starter site could add …")
// are shown in whole points: "about +29–31 pts", never "~+29.2–31.4".
// A range that rounds to a single number collapses to that number.

import { t } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";

export type WholePointRange = { low: number; high: number | null };

export function wholePointRange(low: number, high: number | null): WholePointRange {
  const lo = Math.max(1, Math.round(low));
  const hi = high === null ? null : Math.round(high);
  return { low: lo, high: hi !== null && hi > lo ? hi : null };
}

/** "…could add about +29–31 pts…" for the get-a-website banner. */
export function websiteRangeText(locale: Locale, low: number, high: number | null): string {
  const range = wholePointRange(low, high);
  return range.high !== null
    ? t(locale, "dashboard.growth.websiteBanner.getWebsite.range", { low: range.low, high: range.high })
    : t(locale, "dashboard.growth.websiteBanner.getWebsite.single", { points: range.low });
}

/** "about +29–31 pts" on a recommendation row. */
export function recRangeText(locale: Locale, low: number, high: number): string {
  const range = wholePointRange(low, high);
  return range.high !== null
    ? t(locale, "dashboard.overview.recs.pointsRange", { low: range.low, high: range.high })
    : t(locale, "dashboard.overview.recs.pointsAbout", { points: range.low });
}
