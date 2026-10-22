// When competitors update, said the same way everywhere (by plan —
// lib/competitorScanPolicy.ts rescanRefreshesCompetitors):
// - Free: never after the first scan;
// - Grow: with a re-scan, at most once every 7 days;
// - Premium and Multi: with every re-scan.
// Pure: the Competitors page, the line beside the Re-scan button and the
// re-scan toast all read these.

import { growNextCompetitorUpdate } from "@/lib/competitorScanPolicy";
import { formatShortDate, t, type Locale } from "@/lib/i18n";
import type { Plan } from "@/lib/plan";

const paid = (plan: Plan) => plan === "premium" || plan === "multi";

/** The Competitors page: "Competitors last updated {date}." on every
 * plan, then Free's "don't update" or Grow's "Next update: {date}." */
export function competitorPageLines(plan: Plan, latestScanAt: string | null, locale: Locale, timeZone: string, now: Date): string[] {
  const lines = [latestScanAt ? t(locale, "dashboard.competitors.lastUpdated", { date: formatShortDate(latestScanAt, locale, timeZone) }) : t(locale, "dashboard.competitors.neverUpdated")];
  if (plan === "free") lines.push(t(locale, "dashboard.competitors.freeNoUpdate"));
  else if (plan === "grow") {
    const next = growNextCompetitorUpdate(latestScanAt);
    lines.push(next && Date.parse(next) > now.getTime() ? t(locale, "dashboard.competitors.growNext", { date: formatShortDate(next, locale, timeZone) }) : t(locale, "dashboard.competitors.growNextNow"));
  } else lines.push(t(locale, "dashboard.rescan.competitorsLine.premium"));
  return lines;
}

/** Beside the Re-scan button: what a re-scan does for competitors. */
export function rescanCompetitorsLine(plan: Plan, latestScanAt: string | null, locale: Locale, timeZone: string, now: Date): string {
  if (plan === "free") return t(locale, "dashboard.rescan.competitorsLine.free");
  if (paid(plan)) return t(locale, "dashboard.rescan.competitorsLine.premium");
  const next = growNextCompetitorUpdate(latestScanAt);
  return next && Date.parse(next) > now.getTime()
    ? t(locale, "dashboard.rescan.competitorsLine.grow", { date: formatShortDate(next, locale, timeZone) })
    : t(locale, "dashboard.rescan.competitorsLine.growNow");
}

/** The re-scan toast's competitor sentence: updated this time or not. */
export function rescanCompetitorsToast(plan: Plan, competitors: "refreshed" | "skipped", locale: Locale): string {
  if (competitors === "refreshed") return t(locale, "dashboard.rescan.toastCompetitors.refreshed");
  if (plan === "free") return t(locale, "dashboard.rescan.toastCompetitors.free");
  if (plan === "grow") return t(locale, "dashboard.rescan.toastCompetitors.growLater");
  // Premium/Multi always try — skipped means the month's cap or a failure.
  return t(locale, "dashboard.rescan.toastCompetitors.notUpdated");
}
