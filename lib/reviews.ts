// Pure, presentation-only helpers for the Reviews page. These are
// deliberately independent of lib/scoring.ts's own curves (the rubric
// section reuses the real breakdown directly instead) — this module
// only powers the separate "social proof" framing: a simple, honest
// "aim for X" read on the same real rating/review-count data, distinct
// from how those numbers actually earn points.

import { DEFAULT_LOCALE, t, tPlural, type Locale } from "@/lib/i18n";

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
export function ratingCaption(rating: number | null, locale: Locale = DEFAULT_LOCALE): string {
  if (rating === null) return t(locale, "dashboard.websiteReviews.ratingCaptionNoRating");
  if (rating >= RATING_TARGET) {
    return t(locale, "dashboard.websiteReviews.ratingCaptionAtTarget", {
      rating: rating.toFixed(1),
      target: RATING_TARGET,
    });
  }
  return t(locale, "dashboard.websiteReviews.ratingCaptionBelowTarget", {
    rating: rating.toFixed(1),
    target: RATING_TARGET,
  });
}

/** Honest caption for the review-count bar. */
export function reviewCountCaption(reviewCount: number | null, locale: Locale = DEFAULT_LOCALE): string {
  if (reviewCount === null) return t(locale, "dashboard.websiteReviews.reviewCountCaptionNone");
  if (reviewCount >= REVIEW_COUNT_MILESTONE) {
    return t(locale, "dashboard.websiteReviews.reviewCountCaptionPassed", {
      milestone: REVIEW_COUNT_MILESTONE,
      reviewCount: reviewCount.toLocaleString(),
    });
  }
  const remaining = REVIEW_COUNT_MILESTONE - reviewCount;
  return tPlural(locale, "dashboard.websiteReviews.reviewCountCaptionRemaining", remaining, {
    remaining,
    milestone: REVIEW_COUNT_MILESTONE,
  });
}
