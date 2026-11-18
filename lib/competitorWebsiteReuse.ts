// A competitor's own website result, reused for 14 days: a refresh that
// finds a competitor whose site PostScore fully checked in the last 14
// days (any business's scan, the same website address, the same scoring
// version) takes that check's Website results instead of checking the
// site again. Everything from Google's listing is still scored fresh from
// this refresh's search. "Couldn't check" is never reused — that site is
// tried again. The card says "Website checked {date}". Pure.

import { breakdownFromChecks, isRealWebsite, sameMeasuredSite, SCORING_VERSION, type CheckResult, type ScoreBreakdown } from "@/lib/scoring";
import type { Locale } from "@/lib/i18n";

export const WEBSITE_REUSE_DAYS = 14;

/** The saved row a reused result comes from (our own results only). */
export interface PriorWebsiteRow {
  scan_id: string;
  scoring_version: string | null;
  breakdown_json: unknown;
  website_analysis_json: unknown;
}

/** The checks a reused result carries: the Website category, and the
 * listing-link check (it reads the site's own state: parked, 404). */
export function isReusedCheck(c: Pick<CheckResult, "id" | "category">): boolean {
  return c.category === "website" || c.id === "completeness.website_link";
}

type Analysis = { checkedAt?: unknown; mobilePerformance?: { measuredUrl?: unknown } | null; speedHistory?: Array<{ measuredUrl?: unknown }> | null };

/** When PostScore checked the site (our own analysis's date). */
export function analysisCheckedAt(analysis: unknown): string | null {
  const at = (analysis as Analysis | null)?.checkedAt;
  return typeof at === "string" && Number.isFinite(Date.parse(at)) ? at : null;
}

/** The address PostScore's own speed test measured (null: none saved). */
export function analysisSiteUrl(analysis: unknown): string | null {
  const a = analysis as Analysis | null;
  const measured = a?.mobilePerformance?.measuredUrl;
  if (typeof measured === "string" && measured) return measured;
  const history = Array.isArray(a?.speedHistory) ? a!.speedHistory! : [];
  const last = history[history.length - 1]?.measuredUrl;
  return typeof last === "string" && last ? last : null;
}

function asBreakdown(value: unknown): ScoreBreakdown | null {
  const v = value as Partial<ScoreBreakdown> | null;
  return v && typeof v === "object" && Array.isArray(v.checks) && Array.isArray(v.categories) ? (value as ScoreBreakdown) : null;
}

/** The newest row whose website result may be reused for this listing, or null. */
export function pickReusableWebsite(
  rows: PriorWebsiteRow[],
  opts: { listingWebsite: string | null | undefined; scanId: string; now: number; version?: string }
): { row: PriorWebsiteRow; checkedAt: string } | null {
  const site = opts.listingWebsite;
  if (!site || !isRealWebsite(site)) return null;
  const cutoff = opts.now - WEBSITE_REUSE_DAYS * 24 * 60 * 60 * 1000;
  let best: { row: PriorWebsiteRow; checkedAt: string } | null = null;
  for (const row of rows) {
    if (row.scan_id === opts.scanId) continue;
    if ((row.scoring_version ?? null) !== (opts.version ?? SCORING_VERSION)) continue;
    const b = asBreakdown(row.breakdown_json);
    const hasSite = b?.checks.find((c) => c.id === "website.has_website");
    // Fully checked, and the check ran — never "couldn't check", never a first score.
    if (!hasSite || hasSite.meta?.fullScore !== "1" || hasSite.meta?.websiteNotChecked) continue;
    const checkedAt = analysisCheckedAt(row.website_analysis_json);
    if (!checkedAt || Date.parse(checkedAt) < cutoff || Date.parse(checkedAt) > opts.now) continue;
    const measured = analysisSiteUrl(row.website_analysis_json);
    if (!measured || !sameMeasuredSite(measured, site)) continue;
    if (!best || Date.parse(checkedAt) > Date.parse(best.checkedAt)) best = { row, checkedAt };
  }
  return best;
}

/** This refresh's listing checks with the reused Website results, re-totalled. */
export function withReusedWebsite(first: ScoreBreakdown, saved: ScoreBreakdown, checkedAt: string, locale: Locale): ScoreBreakdown {
  const savedById = new Map(saved.checks.map((c) => [c.id, c]));
  const checks = first.checks.map((c) => {
    const s = isReusedCheck(c) ? savedById.get(c.id) : undefined;
    if (!s) return c;
    return c.id === "website.has_website" ? { ...s, meta: { ...(s.meta ?? {}), fullScore: "1", websiteCheckedAt: checkedAt } } : s;
  });
  return breakdownFromChecks(checks, locale);
}

/** "Website checked {date}": the date a reused website result was checked, or null. */
export function websiteCheckedAt(breakdown: ScoreBreakdown | null | undefined): string | null {
  const at = breakdown?.checks.find((c) => c.id === "website.has_website")?.meta?.websiteCheckedAt;
  return typeof at === "string" ? at : null;
}
