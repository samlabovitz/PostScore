// A competitor's FULL PostScore — the same scoring engine, checks and
// weights as the owner's own score. Its website gets the owner's own
// analysis (lib/websiteAnalysisForSave.ts: homepage, HTTPS, contact page,
// About/Services, social links, PageSpeed mobile speed, Safe Browsing,
// "matches your Google listing", freshness) with no screenshots and no
// Browserless renders, and no new Google Places calls. A JavaScript-built
// or blocked site gets "couldn't check" on what a plain fetch can't read,
// exactly as the engine already handles it for anyone.
//
// Listing facts: a scan saves the competitor's phone, hours, categories and
// status from the Google data it already fetched, so the listing checks and
// "matches your Google listing" are scored from real values. Scans saved
// before that kept only the CHECK RESULTS for the listing — those saved
// results are reused as they are, and "matches your Google listing" is
// "couldn't check" (the phone and hours it compares weren't saved).

import { analyzeWebsiteForSave } from "@/lib/websiteAnalysisForSave";
import {
  breakdownFromChecks,
  businessRowToScoringInput,
  isRealWebsite,
  scoreBusiness,
  type BusinessScoringRow,
  type CheckResult,
  type ScoreBreakdown,
  type WebsiteAnalysis,
} from "@/lib/scoring";
import type { OpeningHoursPeriod } from "@/lib/google/places";
import { t } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";

/** The saved competitor_scans fields full scoring reads. */
export interface CompetitorScoringRow {
  place_id: string;
  address: string | null;
  rating: number | string | null;
  review_count: number | null;
  photo_count: number | null;
  has_website: boolean | null;
  website_url: string | null;
  phone?: string | null;
  opening_hours?: { weekday?: string[] | null; periods?: OpeningHoursPeriod[] | null } | null;
  categories?: string[] | null;
  business_status?: string | null;
  breakdown_json: unknown;
}

export interface CompetitorFullScore {
  breakdown: ScoreBreakdown;
  websiteAnalysis: WebsiteAnalysis | null;
  /** PageSpeed requests this competitor's analysis made. */
  pagespeedCalls: number;
}

/** True when the scan saved this competitor's listing facts (new scans). */
export function hasSavedListingFacts(row: Pick<CompetitorScoringRow, "business_status" | "categories">): boolean {
  return (row.business_status ?? null) !== null || (row.categories ?? null) !== null;
}

function toNumber(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Counts PageSpeed requests made through a fetch. */
export function countingFetch(base: typeof fetch = fetch): { fetchImpl: typeof fetch; count: () => number } {
  let n = 0;
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // The app calls https://www.googleapis.com/pagespeedonline/v5/runPagespeed.
    if (/\/pagespeedonline\//i.test(url) || /pagespeedonline\.googleapis\.com/i.test(url)) n++;
    return base(input, init);
  }) as typeof fetch;
  return { fetchImpl, count: () => n };
}

/**
 * Listing checks from the scan's saved results + freshly run website
 * checks, re-totalled with the engine's own weighting. "Matches your
 * Google listing" is couldn't-check: its phone/hours inputs weren't saved.
 * Pure; exported for tests.
 */
export function mergeLegacyListing(fresh: ScoreBreakdown, saved: ScoreBreakdown | null, locale: Locale): ScoreBreakdown {
  const savedById = new Map((saved?.checks ?? []).map((c) => [c.id, c]));
  const checks: CheckResult[] = fresh.checks.map((c) => {
    if (c.category !== "website") return savedById.get(c.id) ?? c;
    if (c.id === "website.info_consistency") {
      return {
        ...c,
        earnedPoints: null,
        confidence: "UNCERTAIN",
        explanation: t(locale, "dashboard.competitors.listingFactsNotSaved"),
        meta: { notCheckedReason: "listing_facts" },
      };
    }
    return c;
  });
  return breakdownFromChecks(checks, locale);
}

/** Why a site's website checks couldn't run — only ever a real, observed
 * reason; null when the site was read. */
export type WebsiteNotCheckedReason = "blocked" | "timed_out" | "js_only" | "error_page" | "unreachable" | "no_address";

export function websiteNotCheckedReason(a: WebsiteAnalysis | null): WebsiteNotCheckedReason | null {
  if (!a) return null;
  if (a.contentFetchFailureReason === "blocked_automated_check" || a.websiteTrust?.automatedErrorPageUrl) return "blocked";
  if (a.contentFetchFailureReason === "timed_out") return "timed_out";
  if (a.contentFetchFailureReason === "http_error") return "error_page";
  if (a.contentFetchFailureReason === "down") return "unreachable";
  if (a.content?.isLikelyClientRenderedShell) return "js_only";
  return null;
}

const isMeasured = (c: CheckResult) =>
  c.earnedPoints !== null && c.earnedPoints !== undefined && (c.confidence === "VERIFIED" || c.confidence === "LIKELY");

/**
 * Never count website points that weren't measured: when a site exists
 * but NONE of its real website checks got a result, "has a website"
 * alone must not make the Website category 100% — the category is left
 * out (couldn't check), with the observed reason saved on the check.
 * Pure; exported for tests.
 */
/** The homepage itself couldn't be read — a transport check like HTTPS on
 * its own must not stand in for the whole Website category. */
const PAGE_UNREADABLE: readonly WebsiteNotCheckedReason[] = ["blocked", "timed_out", "error_page", "unreachable"];

export function withoutUnmeasuredWebsite(b: ScoreBreakdown, reason: WebsiteNotCheckedReason | null, locale: Locale): ScoreBreakdown {
  const hasSite = b.checks.find((c) => c.id === "website.has_website");
  if (!hasSite || !isMeasured(hasSite) || (hasSite.earnedPoints ?? 0) === 0) return b;
  if (reason && PAGE_UNREADABLE.includes(reason)) {
    // Nothing on the page could be read: the whole Website category is
    // "couldn't check" with the observed reason (e.g. a site that only
    // redirects away to unrelated domains — "error page").
    const checks = b.checks.map((c) =>
      c.category !== "website"
        ? c
        : {
            ...c,
            earnedPoints: null,
            confidence: "UNCERTAIN" as const,
            excludedReason: "unreachable" as const,
            meta: c.id === "website.has_website" ? { ...(c.meta ?? {}), websiteNotChecked: reason } : { ...(c.meta ?? {}), notCheckedReason: c.meta?.notCheckedReason ?? reason },
          }
    );
    return breakdownFromChecks(checks, locale);
  }
  const anyMeasured = b.checks.some((c) => c.category === "website" && c.id !== "website.has_website" && isMeasured(c));
  const meta = reason ? { ...(hasSite.meta ?? {}), websiteNotChecked: reason } : hasSite.meta;
  if (anyMeasured) {
    return reason ? { ...b, checks: b.checks.map((c) => (c.id === "website.has_website" ? { ...c, meta } : c)) } : b;
  }
  const checks = b.checks.map((c) =>
    c.id === "website.has_website"
      ? { ...c, earnedPoints: null, confidence: "UNCERTAIN" as const, excludedReason: "unreachable" as const, meta: { ...(meta ?? {}), websiteNotChecked: reason ?? "unreachable" } }
      : c
  );
  return breakdownFromChecks(checks, locale);
}

/** The scan said this business has a website, but no address for it was
 * saved (Google no longer lists one) — so nothing could be checked: the
 * Website category is left out, never scored as "no website". Pure. */
export function websiteWithoutAddress(b: ScoreBreakdown, locale: Locale): ScoreBreakdown {
  const checks = b.checks.map((c) =>
    c.category === "website"
      ? { ...c, earnedPoints: null, confidence: "UNCERTAIN" as const, excludedReason: "unreachable" as const, meta: c.id === "website.has_website" ? { websiteNotChecked: "no_address" } : c.meta }
      : c
  );
  return breakdownFromChecks(checks, locale);
}

/** Marks the result as full-scored and gives every website check that got
 * no result the observed reason (site-level, or the speed test's own). */
export function annotateWebsiteChecks(b: ScoreBreakdown, siteReason: string | null, speedTestFailed: boolean): ScoreBreakdown {
  return {
    ...b,
    checks: b.checks.map((c) => {
      if (c.category !== "website") return c;
      if (c.id === "website.has_website") return { ...c, meta: { ...(c.meta ?? {}), fullScore: "1" } };
      if (c.earnedPoints !== null && c.earnedPoints !== undefined) return c;
      if (c.meta?.notCheckedReason) return c;
      const reason = siteReason ?? (c.id === "website.performance_mobile" && speedTestFailed ? "speed_test" : null);
      return reason ? { ...c, meta: { ...(c.meta ?? {}), notCheckedReason: reason } } : c;
    }),
  };
}

/** One competitor, fully scored. Never throws on a website problem — the
 * engine records it as "couldn't check". */
export async function scoreCompetitorFully(
  row: CompetitorScoringRow,
  options: { locale: Locale; fetchImpl?: typeof fetch }
): Promise<CompetitorFullScore> {
  const counter = countingFetch(options.fetchImpl);
  const url = row.has_website !== false && row.website_url && isRealWebsite(row.website_url) ? row.website_url : null;
  const listingFacts = hasSavedListingFacts(row);

  const site = url
    ? await analyzeWebsiteForSave({
        analysisUrl: url,
        listingWebsite: url,
        existingAnalysisJson: null,
        skipScreenshots: true,
        allowBrowserRenders: false,
        extraServicesKeywords: [],
        listingFacts: {
          phone: listingFacts ? row.phone ?? null : null,
          address: row.address,
          openingHoursPeriods: listingFacts ? row.opening_hours?.periods ?? null : null,
        },
        fetchImpl: counter.fetchImpl,
      })
    : null;

  const scoringRow: BusinessScoringRow = {
    rating: toNumber(row.rating),
    review_count: row.review_count,
    phone: row.phone ?? null,
    address: row.address,
    opening_hours: row.opening_hours?.weekday ?? null,
    // The listing's address as saved (a Facebook page included), so the
    // engine marks "Facebook page only" itself; only a real site is analyzed.
    website: row.website_url ?? null,
    categories: row.categories ?? null,
    category: row.categories?.[0] ?? null,
    photo_count: row.photo_count,
    business_status: row.business_status ?? null,
    https_status: site?.httpsStatus ?? null,
    website_analysis_json: site?.websiteAnalysis ?? null,
  };
  const fresh = scoreBusiness(businessRowToScoringInput(scoringRow), options.locale);
  const saved = row.breakdown_json && typeof row.breakdown_json === "object" ? (row.breakdown_json as ScoreBreakdown) : null;
  const merged = listingFacts ? fresh : mergeLegacyListing(fresh, saved, options.locale);
  const siteReason = url ? websiteNotCheckedReason(site?.websiteAnalysis ?? null) : row.has_website === true ? "no_address" : null;
  const scored = url
    ? withoutUnmeasuredWebsite(merged, siteReason as WebsiteNotCheckedReason | null, options.locale)
    : row.has_website === true
      ? websiteWithoutAddress(merged, options.locale)
      : merged;
  const breakdown = annotateWebsiteChecks(scored, siteReason, !!site?.websiteAnalysis?.mobilePerformanceFailureReason);

  return { breakdown, websiteAnalysis: site?.websiteAnalysis ?? null, pagespeedCalls: counter.count() };
}
