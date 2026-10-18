// Pure comparison logic for the Competitors page. Works only on a SAVED
// competitor scan (lib/savedCompetitorScans.ts) — no network, no guessing.
// Every business carries its real FULL PostScore: competitors are scored by
// the same engine, checks and weights as the owner
// (lib/competitorFullScoring.ts), and the owner's row is their own score —
// the same number as the Overview. A check that couldn't be done stays
// "couldn't check" (left out by the engine), never 0.

import type { SavedCompetitorEntry, SavedCompetitorScan } from "@/lib/savedCompetitorScans";
import type { CategoryId } from "@/lib/scoring";

export type CompareView = "overall" | "listing" | "website" | "reviews";
export const COMPARE_VIEWS: readonly CompareView[] = ["overall", "listing", "website", "reviews"];

/** Each comparison view's engine category. */
export const VIEW_CATEGORY: Record<Exclude<CompareView, "overall">, CategoryId> = {
  reviews: "visibility",
  listing: "completeness",
  website: "website",
};

/** Where a trailing item is fixed. */
export const FIX_PAGE: Record<Exclude<CompareView, "overall">, "reviews" | "overview" | "website"> = {
  reviews: "reviews",
  listing: "overview",
  website: "website",
};

function checkPoints(entry: SavedCompetitorEntry, checkId: string): { earned: number; max: number } | null {
  const c = entry.breakdown?.checks.find((x) => x.id === checkId);
  if (!c || c.earnedPoints === null || c.earnedPoints === undefined) return null;
  if (c.confidence !== "VERIFIED" && c.confidence !== "LIKELY") return null;
  return { earned: c.earnedPoints, max: c.maxPoints };
}

/** An entry's score in a view: "overall" is its full PostScore; a
 * category view is that category's own score (0–100), as on the Overview.
 * null when nothing in it could be checked. */
export function entryScore(entry: SavedCompetitorEntry, view: CompareView): number | null {
  if (view === "overall") return entry.total;
  // A site none of whose website checks got a result: couldn't check —
  // never "100%" from the bare fact that it has a website.
  if (view === "website" && websiteNotChecked(entry)) return null;
  const cat = entry.breakdown?.categories.find((c) => c.id === VIEW_CATEGORY[view]);
  return cat && cat.relativeScore !== null ? Math.round(cat.relativeScore) : null;
}

/** Full scoring has run for this business (the owner's own score always has). */
export function isFullScored(entry: SavedCompetitorEntry): boolean {
  if (entry.isSubject) return true;
  return entry.breakdown?.checks.find((c) => c.id === "website.has_website")?.meta?.fullScore === "1";
}

/** A business with a website none of whose website checks got a result
 * (blocked, timed out, JavaScript-only, error page — or not checked yet):
 * its website is left out, so its rank rests on the rest. */
export function websiteNotChecked(entry: SavedCompetitorEntry): boolean {
  if (entry.hasWebsite === false || !entry.breakdown) return false;
  return !entry.breakdown.checks.some(
    (c) =>
      c.category === "website" &&
      c.id !== "website.has_website" &&
      c.earnedPoints !== null &&
      c.earnedPoints !== undefined &&
      (c.confidence === "VERIFIED" || c.confidence === "LIKELY")
  );
}

export type CheckStatus =
  | { kind: "done" | "needs_work" | "not_checked_yet" | "not_applicable" }
  | { kind: "couldnt"; reason: string | null };

/** One check's state, as "Show details" shows it. "Not checked yet" means
 * full scoring hasn't reached this business; "Couldn't check" always
 * carries the observed reason when one was recorded. */
export function checkStatus(entry: SavedCompetitorEntry, check: { id: string; category: string; earnedPoints: number | null | undefined; maxPoints: number; confidence: string; meta?: Record<string, string> | null }): CheckStatus {
  const measured = check.earnedPoints !== null && check.earnedPoints !== undefined && (check.confidence === "VERIFIED" || check.confidence === "LIKELY");
  if (measured) return { kind: (check.earnedPoints as number) >= check.maxPoints ? "done" : "needs_work" };
  if (check.category === "website") {
    if (entry.hasWebsite === false && check.id !== "website.has_website") return { kind: "not_applicable" };
    if (!isFullScored(entry)) return { kind: "not_checked_yet" };
    return { kind: "couldnt", reason: check.meta?.notCheckedReason ?? websiteNotCheckedReason(entry) };
  }
  return { kind: "couldnt", reason: check.meta?.notCheckedReason ?? null };
}

/** The observed reason a site's website checks couldn't run, if saved. */
export function websiteNotCheckedReason(entry: SavedCompetitorEntry): string | null {
  return entry.breakdown?.checks.find((c) => c.id === "website.has_website")?.meta?.websiteNotChecked ?? null;
}

export interface RankedEntry {
  entry: SavedCompetitorEntry;
  score: number | null;
  /** 1-based; entries without a score rank last, in saved order. */
  rank: number;
}

/** Re-ranks a scan by the selected view (highest first; ties keep the
 * saved order — groupSavedScans makes that order fixed). */
export function rankBy(scan: SavedCompetitorScan, view: CompareView): RankedEntry[] {
  const scored = scan.entries.map((entry, i) => ({ entry, score: entryScore(entry, view), i }));
  scored.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.i - b.i);
  if (view === "overall") {
    // Tied or within 1 point: a business whose website was fully checked
    // goes ahead of one whose website couldn't be checked (left out).
    const unchecked = (e: SavedCompetitorEntry) => websiteNotChecked(e);
    for (let swapped = true; swapped; ) {
      swapped = false;
      for (let k = 0; k + 1 < scored.length; k++) {
        const a = scored[k];
        const b = scored[k + 1];
        if (a.score !== null && b.score !== null && a.score - b.score <= 1 && unchecked(a.entry) && !unchecked(b.entry)) {
          scored[k] = b;
          scored[k + 1] = a;
          swapped = true;
        }
      }
    }
  }
  return scored.map((s, i) => ({ entry: s.entry, score: s.score, rank: i + 1 }));
}

export function ownerOf(scan: SavedCompetitorScan): SavedCompetitorEntry | null {
  return scan.entries.find((e) => e.isSubject) ?? null;
}

export function competitorsOf(scan: SavedCompetitorScan): SavedCompetitorEntry[] {
  return scan.entries.filter((e) => !e.isSubject);
}

/** Farthest competitor actually in the scan, in miles (null if none). */
export function radiusMiles(scan: SavedCompetitorScan): number | null {
  const d = competitorsOf(scan)
    .map((e) => e.distanceMeters)
    .filter((m): m is number => m !== null);
  return d.length ? Math.max(...d) / 1609.344 : null;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export interface HeroSummary {
  rank: number | null;
  of: number;
  /** The owner's score in this view (overall: their PostScore). */
  ownerScore: number | null;
  /** Mean of the competitors' scores — the owner is NEVER included. */
  localAverage: number | null;
  topScore: number | null;
  topName: string | null;
  radiusMiles: number | null;
}

export function heroSummary(scan: SavedCompetitorScan, view: CompareView): HeroSummary {
  const ranked = rankBy(scan, view);
  const owner = ranked.find((r) => r.entry.isSubject) ?? null;
  const top = ranked[0] ?? null;
  const compScores = ranked.filter((r) => !r.entry.isSubject && r.score !== null).map((r) => r.score as number);
  const avg = mean(compScores);
  return {
    // The headline "overall" rank is exactly ownerStanding's.
    rank: view === "overall" ? (ownerStanding(scan)?.rank ?? null) : owner && owner.score !== null ? owner.rank : null,
    of: ranked.length,
    ownerScore: owner?.score ?? null,
    localAverage: avg === null ? null : Math.round(avg),
    topScore: top?.score ?? null,
    topName: top?.entry.name ?? null,
    radiusMiles: radiusMiles(scan),
  };
}

// ---------------------------------------------------------------------
// Metrics: the real values behind the checks used for lead/trail cards.
// ---------------------------------------------------------------------

export type MetricKind = "rating" | "count" | "yesno";
export interface MetricDef {
  checkId: string;
  view: Exclude<CompareView, "overall">;
  kind: MetricKind;
}

export const METRICS: readonly MetricDef[] = [
  { checkId: "visibility.rating", view: "reviews", kind: "rating" },
  { checkId: "visibility.review_count", view: "reviews", kind: "count" },
  { checkId: "completeness.photos", view: "listing", kind: "count" },
  { checkId: "completeness.hours", view: "listing", kind: "yesno" },
  { checkId: "completeness.phone", view: "listing", kind: "yesno" },
  { checkId: "completeness.address", view: "listing", kind: "yesno" },
  { checkId: "completeness.categories", view: "listing", kind: "yesno" },
  { checkId: "completeness.website_link", view: "listing", kind: "yesno" },
  { checkId: "completeness.business_status", view: "listing", kind: "yesno" },
  { checkId: "website.has_website", view: "website", kind: "yesno" },
  { checkId: "website.https", view: "website", kind: "yesno" },
  { checkId: "website.performance_mobile", view: "website", kind: "yesno" },
  { checkId: "website.contact_conversion", view: "website", kind: "yesno" },
  { checkId: "website.social_links", view: "website", kind: "yesno" },
  { checkId: "website.about_presence", view: "website", kind: "yesno" },
  { checkId: "website.services_presence", view: "website", kind: "yesno" },
  { checkId: "website.content_depth", view: "website", kind: "yesno" },
  { checkId: "website.info_consistency", view: "website", kind: "yesno" },
  { checkId: "website.security", view: "website", kind: "yesno" },
];

/** One business's real value for a metric: a number (★ rating, review
 * or photo count), 1/0 for yes/no checks, or null = not checked. */
export function metricValue(entry: SavedCompetitorEntry, m: MetricDef): number | null {
  if (m.checkId === "visibility.rating") return entry.rating;
  if (m.checkId === "visibility.review_count") return entry.reviewCount;
  if (m.checkId === "completeness.photos") return entry.photoCount;
  if (m.checkId === "website.has_website" && entry.hasWebsite !== null) return entry.hasWebsite ? 1 : 0;
  const p = checkPoints(entry, m.checkId);
  if (!p) return null;
  return p.earned >= p.max ? 1 : 0;
}

export interface MetricComparison {
  metric: MetricDef;
  owner: number | null;
  /** Mean over competitors with a real value (owner excluded); for
   * yes/no metrics, the share (0–1) of competitors that have it. */
  average: number | null;
  /** The value of the #1 competitor in this metric's category. */
  top: number | null;
  topName: string | null;
  /** How many competitors had a real value. */
  sample: number;
}

export function compareMetric(scan: SavedCompetitorScan, m: MetricDef): MetricComparison {
  const owner = ownerOf(scan);
  const comps = competitorsOf(scan);
  const values = comps.map((c) => metricValue(c, m)).filter((v): v is number => v !== null);
  const topComp = rankBy(scan, m.view).find((r) => !r.entry.isSubject) ?? null;
  return {
    metric: m,
    owner: owner ? metricValue(owner, m) : null,
    average: mean(values),
    top: topComp ? metricValue(topComp.entry, m) : null,
    topName: topComp?.entry.name ?? null,
    sample: values.length,
  };
}

export interface Gap {
  metric: MetricDef;
  comparison: MetricComparison;
  /** Positive = the owner leads; negative = trails. Comparable across
   * metrics (each scaled to its own natural range). */
  size: number;
}

/** Real, sizeable differences vs. the local average only — nothing
 * without both an owner value and a competitor average.
 *  - rating: at least 0.2★ apart (scaled per 1★),
 *  - review/photo counts: at least 1.5× (or ⅔×) the average AND 10+
 *    reviews / 3+ photos apart (scaled by log ratio),
 *  - yes/no: the owner lacks it while most competitors (≥ 50%) have it,
 *    or has it while most don't. */
export function computeGaps(scan: SavedCompetitorScan): { leads: Gap[]; trails: Gap[] } {
  const gaps: Gap[] = [];
  for (const m of METRICS) {
    const c = compareMetric(scan, m);
    if (c.owner === null || c.average === null || c.sample === 0) continue;
    let size = 0;
    if (m.kind === "rating") {
      const d = c.owner - c.average;
      if (Math.abs(d) >= 0.2) size = d;
    } else if (m.kind === "count") {
      const minAbs = m.checkId === "completeness.photos" ? 3 : 10;
      const ratio = (c.owner + 1) / (c.average + 1);
      if ((ratio >= 1.5 || ratio <= 2 / 3) && Math.abs(c.owner - c.average) >= minAbs) size = Math.log2(ratio);
    } else {
      if (c.owner === 0 && c.average >= 0.5) size = -c.average;
      else if (c.owner === 1 && c.average < 0.5) size = 1 - c.average;
    }
    if (size !== 0) gaps.push({ metric: m, comparison: c, size });
  }
  // For competitors, "website link on listing" and "has a website" are the
  // same Google fact — show it once (as "has a website").
  // And when having a website at all is the gap, its basic checks would
  // only repeat it.
  const unique = gaps.some((g) => g.metric.checkId === "website.has_website")
    ? gaps.filter((g) => g.metric.checkId !== "completeness.website_link" && !(g.metric.view === "website" && g.metric.checkId !== "website.has_website"))
    : gaps;
  return {
    leads: unique.filter((g) => g.size > 0).sort((a, b) => b.size - a.size).slice(0, 3),
    trails: unique.filter((g) => g.size < 0).sort((a, b) => a.size - b.size).slice(0, 3),
  };
}

export interface OwnerStanding {
  /** 1-based, by full PostScore. */
  rank: number;
  /** Everyone in the scan, the owner included ("#rank of of"). */
  of: number;
  /** The owner's PostScore (the same number as the Overview). */
  ownerScore: number;
  /** Competitors in the scan (the owner excluded). */
  othersCount: number;
  /** Competitors the owner outscores (a tie isn't "ahead"). */
  aheadCount: number;
  /** The #1 business's real review count. */
  topReviewCount: number | null;
}

/** THE owner rank, used everywhere a rank is shown — Overview "Local
 * benchmark", Competitors page, monthly report, PostAI: rankBy(scan,
 * "overall") on each business's full PostScore. null when the owner's row
 * is missing or has no score. */
export function ownerStanding(scan: SavedCompetitorScan): OwnerStanding | null {
  const ranked = rankBy(scan, "overall");
  const owner = ranked.find((r) => r.entry.isSubject);
  if (!owner || owner.score === null) return null;
  const ownerScore = owner.score;
  const others = ranked.filter((r) => !r.entry.isSubject);
  return {
    rank: owner.rank,
    of: ranked.length,
    ownerScore,
    othersCount: others.length,
    aheadCount: others.filter((r) => (r.score ?? -1) < ownerScore).length,
    topReviewCount: ranked[0]?.entry.reviewCount ?? null,
  };
}

/** The monthly report's competitor standing for one saved scan — the
 * shared ownerStanding. `topReviewCount` feeds the report's "the top
 * business has N more reviews" pointer. */
export function reportStanding(scan: SavedCompetitorScan): { rank: number; total: number; topReviewCount: number | null } | null {
  const standing = ownerStanding(scan);
  return standing ? { rank: standing.rank, total: standing.of, topReviewCount: standing.topReviewCount } : null;
}
