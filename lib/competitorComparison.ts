// Pure comparison logic for the Competitors page (Part C). Works only on a
// SAVED competitor scan (lib/savedCompetitorScans.ts) — no network, no
// guessing: a value Google didn't give us stays null and is shown as
// "not checked" / "not listed by Google", never as 0.

import type { SavedCompetitorEntry, SavedCompetitorScan } from "@/lib/savedCompetitorScans";

export type CompareView = "overall" | "listing" | "website" | "reviews";
export const COMPARE_VIEWS: readonly CompareView[] = ["overall", "listing", "website", "reviews"];

/** The checks we actually have for competitors (their listings come from
 * Google; their websites are never fetched), by category. Every other
 * check is "Not checked for competitors". */
export const COMPARABLE_CHECKS: Record<Exclude<CompareView, "overall">, readonly string[]> = {
  reviews: ["visibility.rating", "visibility.review_count"],
  listing: [
    "completeness.phone",
    "completeness.address",
    "completeness.hours",
    "completeness.website_link",
    "completeness.categories",
    "completeness.photos",
    "completeness.business_status",
  ],
  website: ["website.has_website"],
};
const ALL_COMPARABLE = new Set(Object.values(COMPARABLE_CHECKS).flat());

export function isComparableCheck(checkId: string): boolean {
  return ALL_COMPARABLE.has(checkId);
}

/** Where a trailing item is fixed. */
export const FIX_PAGE: Record<Exclude<CompareView, "overall">, "reviews" | "overview" | "website"> = {
  reviews: "reviews",
  listing: "overview",
  website: "website",
};

function checkPoints(entry: SavedCompetitorEntry, checkId: string): { earned: number; max: number } | null {
  const c = entry.breakdown?.checks.find((x) => x.id === checkId);
  if (!c || c.earnedPoints === null || c.earnedPoints === undefined) return null;
  return { earned: c.earnedPoints, max: c.maxPoints };
}

/** The PostScore category weights, by comparison view (Reviews is the
 * engine's "visibility", Google listing its "completeness"). */
const VIEW_WEIGHTS: Record<Exclude<CompareView, "overall">, number> = { reviews: 40, listing: 30, website: 30 };

/** Raw 0–1 share earned on a category's COMPARABLE checks, or null when
 * none of them were scored for this entry. */
function categoryShare(entry: SavedCompetitorEntry, view: Exclude<CompareView, "overall">): number | null {
  let earned = 0;
  let max = 0;
  for (const id of COMPARABLE_CHECKS[view]) {
    const p = checkPoints(entry, id);
    if (!p) continue;
    earned += p.earned;
    max += p.max;
  }
  return max > 0 ? earned / max : null;
}

/** An entry's score in a view, from the SAME checks for everyone (the
 * ones we have for competitors) — never the owner's full PostScore,
 * which also counts website checks we don't run on competitors.
 *  - per category: points on that category's comparable checks, as a %;
 *  - "overall" (the comparable score): those category shares combined
 *    with PostScore's own weights (40 / 30 / 30), renormalized over the
 *    categories that have data — the same formula as the real score.
 * null when nothing comparable was scored. */
export function entryScore(entry: SavedCompetitorEntry, view: CompareView): number | null {
  if (view !== "overall") {
    const share = categoryShare(entry, view);
    return share === null ? null : Math.round(share * 100);
  }
  let weighted = 0;
  let weights = 0;
  for (const v of ["reviews", "listing", "website"] as const) {
    const share = categoryShare(entry, v);
    if (share === null) continue;
    weighted += share * VIEW_WEIGHTS[v];
    weights += VIEW_WEIGHTS[v];
  }
  return weights > 0 ? Math.round((weighted / weights) * 100) : null;
}

export interface RankedEntry {
  entry: SavedCompetitorEntry;
  score: number | null;
  /** 1-based; entries without a score rank last, in saved order. */
  rank: number;
}

/** Re-ranks a scan by the selected view (highest first; ties keep the
 * saved order). */
export function rankBy(scan: SavedCompetitorScan, view: CompareView): RankedEntry[] {
  const scored = scan.entries.map((entry, i) => ({ entry, score: entryScore(entry, view), i }));
  scored.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.i - b.i);
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
  /** The owner's comparable score (same checks as competitors). */
  ownerScore: number | null;
  /** The owner's full saved PostScore — shown for context only, never
   * used to rank or compare. */
  ownerFullScore: number | null;
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
    rank: owner && owner.score !== null ? owner.rank : null,
    of: ranked.length,
    ownerScore: owner?.score ?? null,
    ownerFullScore: owner?.entry.total ?? null,
    localAverage: avg === null ? null : Math.round(avg),
    topScore: top?.score ?? null,
    topName: top?.entry.name ?? null,
    radiusMiles: radiusMiles(scan),
  };
}

// ---------------------------------------------------------------------
// Metrics: the real values behind each comparable check.
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
  const unique = gaps.some((g) => g.metric.checkId === "website.has_website")
    ? gaps.filter((g) => g.metric.checkId !== "completeness.website_link")
    : gaps;
  return {
    leads: unique.filter((g) => g.size > 0).sort((a, b) => b.size - a.size).slice(0, 3),
    trails: unique.filter((g) => g.size < 0).sort((a, b) => a.size - b.size).slice(0, 3),
  };
}
