// Pure, presentation-only helpers for the Reviews page. These are
// deliberately independent of lib/scoring.ts's own curves (the rubric
// section reuses the real breakdown directly instead) — this module
// only powers the separate "social proof" framing: a simple, honest
// "aim for X" read on the same real rating/review-count data, distinct
// from how those numbers actually earn points.

/** The rating this app encourages aiming for, shown in the social-proof
 * section's progress bar and caption. Independent of RATING_CURVE in
 * lib/scoring.ts, which has its own, more granular point curve. */
export const RATING_TARGET = 4.5;

/** A round, motivating review-count milestone for the social-proof
 * section. Independent of REVIEW_COUNT_SATURATION in lib/scoring.ts
 * (150, where the scoring curve reaches full points) — this is a
 * simpler, earlier milestone meant to feel achievable. */
export const REVIEW_COUNT_MILESTONE = 100;

/** The Google-hosted "write a review" screen for a real place_id — the
 * same URL Google itself links to from a "Write a review" prompt.
 * null only when there's no real place_id to build it from (never a
 * fabricated or guessed link). */
export function buildGoogleReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

/** Rating as a percent of the full 5-star scale, for the progress bar
 * fill — a plain, literal fraction (rating / 5), not the scoring
 * engine's curve. null in, null out — the caller renders an honest
 * empty state instead of a zero-width bar. */
export function ratingProgressPercent(rating: number | null): number | null {
  if (rating === null) return null;
  return Math.max(0, Math.min(100, (rating / 5) * 100));
}

/** Review count as a percent of REVIEW_COUNT_MILESTONE, capped at 100
 * once the milestone is passed (the bar fills, the caption switches to
 * "you've passed it" rather than reading as more than 100%). */
export function reviewCountProgressPercent(reviewCount: number | null): number | null {
  if (reviewCount === null) return null;
  return Math.max(0, Math.min(100, (reviewCount / REVIEW_COUNT_MILESTONE) * 100));
}

/** Honest caption for the rating bar — names the real number and
 * whether it's at/above the target, never implies a score or promise. */
export function ratingCaption(rating: number | null): string {
  if (rating === null) return "No rating yet — this fills in once your listing has reviews.";
  if (rating >= RATING_TARGET) {
    return `You're at ${rating.toFixed(1)}★ — at or above the ${RATING_TARGET}+ most customers look for.`;
  }
  return `You're at ${rating.toFixed(1)}★ — aim for ${RATING_TARGET}+ to build stronger trust at a glance.`;
}

/** Honest caption for the review-count bar. */
export function reviewCountCaption(reviewCount: number | null): string {
  if (reviewCount === null) return "No reviews yet — every review you get starts building this up.";
  if (reviewCount >= REVIEW_COUNT_MILESTONE) {
    return `You've passed ${REVIEW_COUNT_MILESTONE} reviews — ${reviewCount.toLocaleString()} total.`;
  }
  const remaining = REVIEW_COUNT_MILESTONE - reviewCount;
  return `${remaining} more review${remaining === 1 ? "" : "s"} to reach ${REVIEW_COUNT_MILESTONE}.`;
}
