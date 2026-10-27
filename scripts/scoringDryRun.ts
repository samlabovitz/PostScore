// Scoring v1.12.0 — Stage 1 dry run (docs/review-scoring-plan.md). For
// every business, today's v1.11.0 score from its stored data next to what
// the v1.12.0 weights and checks would give. Nothing is saved and owners'
// scores don't change; the only output is ~/Desktop/scoring-dry-run.md.
//
// v1.12.0, as planned:
//   Visibility 40 = rating 14 · review count 14 · recency 6 · replies 6
//   Listing 30    = phone 4 · address 4 · hours 4 · website link 4 ·
//                   categories 3 · photos 4 · status 4 · customer details 3
//   Website 30    = unchanged
// Recency: full points if any review Google returns is ≤ 90 days old, else
// "couldn't confirm" (excluded); 0 reviews = 0, verified; with Google
// connected, GBP's own hasRecentReview decides. Replies: connected only,
// the recent window, full at ≥ 80%, else 6 × rate ÷ 0.8; fewer than 3
// reviews in the window → excluded. Customer details: accessibility,
// payment, parking on the listing, one point each, storefronts only.
//
// Reviews, payment and parking come only from a one-off Place Details
// fetch for a sample of businesses (Decision 1); everyone else shows those
// parts as "couldn't check".

import { breakdownFromChecks, type CheckResult, type ScoreBreakdown } from "../lib/scoring";
import { REPLY_CHECK_MIN_REVIEWS, type GbpReplyCounts } from "../lib/gbpReviewReplies";

const DAY_MS = 86_400_000;

/** v1.11.0 → v1.12.0 maximums for the checks that keep their meaning. */
export const REWEIGHTED: Record<string, number> = {
  "visibility.rating": 14,
  "visibility.review_count": 14,
  "completeness.categories": 3,
  "completeness.business_status": 4,
};

/** What the one-off sample fetch found (null = not in the sample). */
export interface SampleFacts {
  /** publishTime of each review Google returned (at most 5). */
  reviewTimes: string[];
  hasAccessibility: boolean;
  hasPayment: boolean;
  hasParking: boolean;
  pureServiceArea: boolean | null;
}

export interface DryRunExtras {
  reviewCount: number | null;
  sample: SampleFacts | null;
  /** Google connected: the stored reply counts. */
  gbp: GbpReplyCounts | null;
  now: number;
}

type Partial12 = Pick<CheckResult, "earnedPoints" | "confidence" | "explanation">;

export function recencyCheck(x: DryRunExtras): Partial12 {
  if (x.gbp) return x.gbp.hasRecentReview ? { earnedPoints: 6, confidence: "VERIFIED", explanation: "Google (connected): a review in the last 90 days." } : { earnedPoints: 0, confidence: "VERIFIED", explanation: "Google (connected): no review in the last 90 days." };
  if ((x.reviewCount ?? 0) === 0) return { earnedPoints: 0, confidence: "VERIFIED", explanation: "No reviews yet." };
  if (!x.sample) return { earnedPoints: null, confidence: "NOT_FOUND", explanation: "Couldn't check (not in the review sample)." };
  const recent = x.sample.reviewTimes.some((iso) => x.now - Date.parse(iso) <= 90 * DAY_MS);
  return recent
    ? { earnedPoints: 6, confidence: "VERIFIED", explanation: "A review Google shows is from the last 90 days." }
    : { earnedPoints: null, confidence: "NOT_FOUND", explanation: "Couldn't confirm a review in the last 90 days (Google shows only 5)." };
}

export function repliesCheck(x: DryRunExtras): Partial12 {
  if (!x.gbp) return { earnedPoints: null, confidence: "NOT_FOUND", explanation: "Connect Google to check this." };
  if (x.gbp.reviewsInWindow < REPLY_CHECK_MIN_REVIEWS) return { earnedPoints: null, confidence: "NOT_FOUND", explanation: "Not enough recent reviews to check yet." };
  const rate = x.gbp.replied / x.gbp.reviewsInWindow;
  return { earnedPoints: Math.round(Math.min(1, rate / 0.8) * 6 * 10) / 10, confidence: "VERIFIED", explanation: `Replied to ${x.gbp.replied} of the last ${x.gbp.reviewsInWindow} reviews.` };
}

export function customerDetailsCheck(x: DryRunExtras): Partial12 {
  if (!x.sample) return { earnedPoints: null, confidence: "NOT_FOUND", explanation: "Couldn't check (not in the sample)." };
  if (x.sample.pureServiceArea === true) return { earnedPoints: null, confidence: "NOT_FOUND", explanation: "Not applicable — no storefront." };
  const parts = [x.sample.hasAccessibility, x.sample.hasPayment, x.sample.hasParking];
  return { earnedPoints: parts.filter(Boolean).length, confidence: "VERIFIED", explanation: `Accessibility ${parts[0] ? "✓" : "—"}, payment ${parts[1] ? "✓" : "—"}, parking ${parts[2] ? "✓" : "—"}.` };
}

/** The v1.12.0 breakdown from a v1.11.0 one and the new facts — totalled
 * by the engine's own breakdownFromChecks (same weighting, same grades). */
export function v112Breakdown(v111: ScoreBreakdown, x: DryRunExtras): ScoreBreakdown {
  const checks: CheckResult[] = v111.checks.map((c) => {
    if (c.id === "visibility.review_recency") return { ...c, ...recencyCheck(x) };
    const max = REWEIGHTED[c.id];
    if (max === undefined) return c;
    return { ...c, maxPoints: max, earnedPoints: c.earnedPoints === null ? null : (c.earnedPoints / c.maxPoints) * max };
  });
  checks.push(
    { id: "visibility.review_replies", label: "Replying to reviews", category: "visibility", maxPoints: 6, meta: null, ...repliesCheck(x) },
    { id: "completeness.customer_details", label: "Customer details on your listing", category: "completeness", maxPoints: 3, meta: null, ...customerDetailsCheck(x) }
  );
  return breakdownFromChecks(checks);
}

/** Each check's change in weighted points (what actually moved the total). */
export function checkMoves(before: ScoreBreakdown, after: ScoreBreakdown): Array<{ id: string; label: string; delta: number; note: string }> {
  const weighted = (b: ScoreBreakdown, id: string) => {
    const check = b.checks.find((c) => c.id === id);
    if (!check || check.earnedPoints === null || !(check.confidence === "VERIFIED" || check.confidence === "LIKELY")) return 0;
    const cat = b.categories.find((c) => c.id === check.category)!;
    const possibleWeight = b.categories.filter((c) => c.possiblePoints > 0).reduce((s, c) => s + c.weight, 0);
    return cat.possiblePoints > 0 ? ((check.earnedPoints / cat.possiblePoints) * cat.weight * 100) / possibleWeight : 0;
  };
  const ids = Array.from(new Set([...before.checks, ...after.checks].map((c) => c.id)));
  return ids
    .map((id) => {
      const a = after.checks.find((c) => c.id === id);
      return { id, label: a?.label ?? before.checks.find((c) => c.id === id)!.label, delta: weighted(after, id) - weighted(before, id), note: a?.explanation ?? "" };
    })
    .filter((m) => Math.abs(m.delta) >= 0.5)
    .sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta));
}

/** The one-off sample fetch's field mask (Decision 1 — never in production). */
export const SAMPLE_FIELD_MASK = "reviews,paymentOptions,parkingOptions,accessibilityOptions,pureServiceAreaBusiness";

/** Pure: the sample facts out of a raw Place Details response. */
export function sampleFactsFrom(raw: {
  reviews?: Array<{ publishTime?: string }>;
  paymentOptions?: Record<string, unknown>;
  parkingOptions?: Record<string, unknown>;
  accessibilityOptions?: Record<string, unknown>;
  pureServiceAreaBusiness?: boolean;
}): SampleFacts {
  const has = (o: Record<string, unknown> | undefined) => !!o && Object.values(o).some((v) => typeof v === "boolean");
  return {
    reviewTimes: (raw.reviews ?? []).map((r) => r.publishTime).filter((t): t is string => typeof t === "string"),
    hasAccessibility: has(raw.accessibilityOptions),
    hasPayment: has(raw.paymentOptions),
    hasParking: has(raw.parkingOptions),
    pureServiceArea: typeof raw.pureServiceAreaBusiness === "boolean" ? raw.pureServiceAreaBusiness : null,
  };
}
