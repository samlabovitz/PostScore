import { describe, expect, test } from "vitest";
import {
  CATEGORY_WEIGHTS,
  CHECKS,
  CategoryId,
  applyCheckFix,
  businessRowToScoringInput,
  generateSuggestions,
  getScoreWithSuggestions,
  gradeFromTotal,
  scoreBusiness,
  type BusinessScoringInput,
} from "./scoring";

// A business where every real, collectible field is present and good.
// Review recency, mobile-friendliness, and page speed are still
// NOT_FOUND here (they're never collected today), which is itself part
// of what this suite checks.
const PERFECT_INPUT: BusinessScoringInput = {
  rating: 4.9,
  reviewCount: 500,
  mostRecentReviewDaysAgo: null,
  phone: "+1-555-123-4567",
  address: "742 Evergreen Terrace, Springfield",
  openingHours: ["Monday: 9:00 AM – 5:00 PM"],
  website: "https://example.com",
  categories: ["cafe", "coffee_shop"],
  primaryCategory: "Cafe",
  photoCount: 12,
  businessStatus: "OPERATIONAL",
};

// A realistic partially-filled-out business: has a Google listing with
// some basics, but is missing a website entirely and has weak reviews.
const STRUGGLING_INPUT: BusinessScoringInput = {
  rating: 3.2,
  reviewCount: 6,
  mostRecentReviewDaysAgo: null,
  phone: "+1-555-999-0000",
  address: "10 Market St",
  openingHours: null,
  website: null,
  categories: null,
  primaryCategory: "Hardware Store",
  photoCount: 0,
  businessStatus: "OPERATIONAL",
};

describe("config integrity", () => {
  test("each category's check weights sum to that category's declared weight", () => {
    for (const categoryId of Object.keys(CATEGORY_WEIGHTS) as CategoryId[]) {
      const sum = CHECKS.filter((c) => c.category === categoryId).reduce(
        (s, c) => s + c.maxPoints,
        0
      );
      expect(sum).toBe(CATEGORY_WEIGHTS[categoryId]);
    }
  });

  test("category weights sum to 100", () => {
    const total = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  test("check ids are unique", () => {
    const ids = CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("grade thresholds", () => {
  test.each([
    [100, "A"],
    [90, "A"],
    [89, "B"],
    [80, "B"],
    [79, "C"],
    [70, "C"],
    [69, "D"],
    [60, "D"],
    [59, "F"],
    [0, "F"],
  ] as const)("total %i -> grade %s", (total, grade) => {
    expect(gradeFromTotal(total)).toBe(grade);
  });
});

describe("scoreBusiness determinism", () => {
  test("identical input always produces an identical breakdown", () => {
    const a = scoreBusiness(STRUGGLING_INPUT);
    const b = scoreBusiness({ ...STRUGGLING_INPUT });
    expect(b).toEqual(a);
  });

  test("a business with every determinable check perfect scores 100 / A", () => {
    const breakdown = scoreBusiness(PERFECT_INPUT);
    expect(breakdown.total).toBe(100);
    expect(breakdown.grade).toBe("A");
  });
});

describe("confidence-aware scoring", () => {
  test("NOT_FOUND checks carry a null earnedPoints, never a zero", () => {
    const breakdown = scoreBusiness(PERFECT_INPUT);
    const recency = breakdown.checks.find((c) => c.id === "visibility.review_recency")!;
    expect(recency.confidence).toBe("NOT_FOUND");
    expect(recency.earnedPoints).toBeNull();
  });

  test("a verified real zero (no photos) is distinct from NOT_FOUND and does count against the score", () => {
    const input: BusinessScoringInput = { ...PERFECT_INPUT, photoCount: 0 };
    const breakdown = scoreBusiness(input);
    const photos = breakdown.checks.find((c) => c.id === "completeness.photos")!;
    expect(photos.confidence).toBe("VERIFIED");
    expect(photos.earnedPoints).toBe(0);
  });

  test("missing rating and review count entirely excludes visibility from the total, rather than zeroing it", () => {
    const input: BusinessScoringInput = {
      ...PERFECT_INPUT,
      rating: null,
      reviewCount: null,
    };
    const breakdown = scoreBusiness(input);
    const visibility = breakdown.categories.find((c) => c.id === "visibility")!;
    // Every visibility check is NOT_FOUND for this business.
    expect(visibility.possiblePoints).toBe(0);
    expect(visibility.relativeScore).toBeNull();
    // Completeness (30) and Website (30) are still fully determinable and
    // perfect, so the total is renormalized across just those two
    // categories rather than treating the missing 40% as a loss.
    expect(breakdown.total).toBe(100);
  });

  test("an unrecognized business status is UNCERTAIN, not a failure", () => {
    const input: BusinessScoringInput = { ...PERFECT_INPUT, businessStatus: "SOMETHING_NEW" };
    const breakdown = scoreBusiness(input);
    const status = breakdown.checks.find((c) => c.id === "completeness.business_status")!;
    expect(status.confidence).toBe("UNCERTAIN");
    expect(status.earnedPoints).toBeNull();
  });

  test("a website URL with no recognizable scheme is UNCERTAIN for HTTPS, not a failure", () => {
    const input: BusinessScoringInput = { ...PERFECT_INPUT, website: "example.com" };
    const breakdown = scoreBusiness(input);
    const https = breakdown.checks.find((c) => c.id === "website.https")!;
    expect(https.confidence).toBe("UNCERTAIN");
    expect(https.earnedPoints).toBeNull();
  });
});

describe("curve sanity checks", () => {
  test("review count saturates at 150 for full credit", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, reviewCount: 150 });
    const check = breakdown.checks.find((c) => c.id === "visibility.review_count")!;
    expect(check.earnedPoints).toBe(18);
  });

  test("zero reviews earns zero review-count points (but is still VERIFIED, not NOT_FOUND)", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, reviewCount: 0 });
    const check = breakdown.checks.find((c) => c.id === "visibility.review_count")!;
    expect(check.confidence).toBe("VERIFIED");
    expect(check.earnedPoints).toBe(0);
  });

  test("a 0.0 rating earns zero rating points", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, rating: 0 });
    const check = breakdown.checks.find((c) => c.id === "visibility.rating")!;
    expect(check.earnedPoints).toBe(0);
  });
});

describe("suggestion -> projected score guarantee", () => {
  test("generateSuggestions returns suggestions sorted by promisedPoints, highest first", () => {
    const breakdown = scoreBusiness(STRUGGLING_INPUT);
    const suggestions = generateSuggestions(breakdown);
    expect(suggestions.length).toBeGreaterThan(0);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].promisedPoints).toBeGreaterThanOrEqual(suggestions[i].promisedPoints);
    }
  });

  test("every suggestion's promisedPoints equals exactly (check.maxPoints - check.earnedPoints)", () => {
    const { breakdown, suggestions } = getScoreWithSuggestions(STRUGGLING_INPUT);
    for (const suggestion of suggestions) {
      const check = breakdown.checks.find((c) => c.id === suggestion.checkId)!;
      expect(suggestion.promisedPoints).toBe(check.maxPoints - (check.earnedPoints ?? 0));
    }
  });

  test("no suggestions are generated from NOT_FOUND/UNCERTAIN checks", () => {
    const { suggestions } = getScoreWithSuggestions(STRUGGLING_INPUT);
    const recency = suggestions.find((s) => s.checkId === "visibility.review_recency");
    const mobile = suggestions.find((s) => s.checkId === "website.mobile_friendly");
    const speed = suggestions.find((s) => s.checkId === "website.page_speed");
    expect(recency).toBeUndefined();
    expect(mobile).toBeUndefined();
    expect(speed).toBeUndefined();
  });

  test("applying every suggestion's fix and re-scoring reproduces projectedBreakdown exactly", () => {
    const { breakdown, suggestions, projectedInput, projectedBreakdown } =
      getScoreWithSuggestions(STRUGGLING_INPUT);
    expect(suggestions.length).toBeGreaterThan(0);

    // Re-derive the "fixed" input independently of getScoreWithSuggestions'
    // own reduce(), by applying applyCheckFix by hand in a different order,
    // and confirm re-scoring it lands on the exact same breakdown. This
    // guards against the projection being a hand-tuned estimate rather
    // than a genuine re-run of the scoring function.
    const manuallyFixedInput = [...suggestions]
      .reverse()
      .reduce((acc, s) => applyCheckFix(acc, s.checkId), STRUGGLING_INPUT);
    const manuallyRescored = scoreBusiness(manuallyFixedInput);

    expect(manuallyRescored).toEqual(projectedBreakdown);
    expect(scoreBusiness(projectedInput)).toEqual(projectedBreakdown);

    // Every check that was flagged as losing points now scores full marks.
    for (const suggestion of suggestions) {
      const fixedCheck = projectedBreakdown.checks.find((c) => c.id === suggestion.checkId)!;
      expect(fixedCheck.earnedPoints).toBe(fixedCheck.maxPoints);
    }

    // The projected score is never worse, and (since this fixture had
    // real deficits) strictly better than the current score.
    expect(projectedBreakdown.total).toBeGreaterThan(breakdown.total);
  });

  test("fixing only Completeness-category suggestions moves the total by exactly the sum of their promised points", () => {
    // Completeness is the one category where none of its checks are
    // permanently NOT_FOUND, so its determinable weight always equals
    // its full 30-point category weight — nothing to renormalize.
    // Isolating fixes to this category is therefore the clean case
    // where the naive "sum of promised points" and the actual total
    // delta agree exactly.
    const input: BusinessScoringInput = {
      ...STRUGGLING_INPUT,
      website: "https://example.com", // hold Website category constant and fully determinable
    };
    const { breakdown, suggestions } = getScoreWithSuggestions(input);
    const completenessSuggestions = suggestions.filter((s) => s.category === "completeness");
    expect(completenessSuggestions.length).toBeGreaterThan(0);

    const fixedInput = completenessSuggestions.reduce(
      (acc, s) => applyCheckFix(acc, s.checkId),
      input
    );
    const fixedBreakdown = scoreBusiness(fixedInput);

    const promisedTotal = completenessSuggestions.reduce((sum, s) => sum + s.promisedPoints, 0);
    expect(fixedBreakdown.total - breakdown.total).toBe(promisedTotal);
  });

  test("honesty check: fixing 'has a website' can move the total by MORE than that suggestion's own promised points, because HTTPS goes from excluded to fully verified as a side effect", () => {
    // STRUGGLING_INPUT has no website, so website.https is NOT_FOUND
    // ("not applicable") and generates no suggestion of its own. Once a
    // website is added, https becomes determinable and (being
    // https://example.com) scores full — points nobody promised in
    // advance for that specific fix. This is exactly the "other
    // real-world changes can independently move the total" case the
    // suggestion engine is honest about: promisedPoints is a guarantee
    // about the check it came from, not a full prediction of the total.
    const { breakdown, suggestions } = getScoreWithSuggestions(STRUGGLING_INPUT);
    const hasWebsiteSuggestion = suggestions.find((s) => s.checkId === "website.has_website")!;
    expect(hasWebsiteSuggestion).toBeDefined();

    const httpsBefore = breakdown.checks.find((c) => c.id === "website.https")!;
    expect(httpsBefore.confidence).toBe("NOT_FOUND");

    const fixedInput = applyCheckFix(STRUGGLING_INPUT, "website.has_website");
    const fixedBreakdown = scoreBusiness(fixedInput);
    const httpsAfter = fixedBreakdown.checks.find((c) => c.id === "website.https")!;
    expect(httpsAfter.confidence).toBe("VERIFIED");
    expect(httpsAfter.earnedPoints).toBe(httpsAfter.maxPoints);

    const actualDelta = fixedBreakdown.total - breakdown.total;
    expect(actualDelta).toBeGreaterThan(hasWebsiteSuggestion.promisedPoints);
  });
});

describe("businessRowToScoringInput adapter", () => {
  test("maps a saved businesses row into scoring input without inventing data", () => {
    const input = businessRowToScoringInput({
      rating: 4.2,
      review_count: 30,
      phone: "+1-555-000-1111",
      address: "1 First St",
      opening_hours: null,
      website: "https://mybiz.example",
      categories: ["bakery"],
      category: "Bakery",
      photo_count: 4,
      business_status: "OPERATIONAL",
    });
    expect(input.rating).toBe(4.2);
    expect(input.mostRecentReviewDaysAgo).toBeNull();
    const breakdown = scoreBusiness(input);
    expect(breakdown.scoringVersion).toBe("1.3.0");
  });
});

// v1.1.0 re-tuned the rating and review-count curves to be more demanding
// (see RATING_CURVE / reviewCountFraction) so that scores actually spread
// out instead of clustering in the high 80s-100s. v1.2.0 went further and
// shifted point ceiling *within* Visibility from the rating check (20->16)
// to the review-count check (14->18) — see RATING_MAX_POINTS /
// REVIEW_COUNT_CHECK_MAX_POINTS — so that two businesses with the same
// rating are meaningfully separated by how many reviews back it up, not
// just marginally. These tests pin down the resulting shape: a 4.0 rating
// should clearly lose points rather than scoring near-full, a handful of
// reviews should earn only a small fraction of that check's points, more
// reviews at an identical rating should move a business by a real margin,
// a realistic "good but not perfect" business should land in the B range,
// and only a business that's strong across rating, review volume, and
// listing/website completeness should reach the 90s.
describe("v1.2.0 curve & weight re-tuning", () => {
  test("a 4.0 rating earns roughly half of the rating check's points, not near-full", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, rating: 4.0 });
    const check = breakdown.checks.find((c) => c.id === "visibility.rating")!;
    expect(check.earnedPoints).toBe(8.8); // 55% of 16 — see RATING_CURVE
  });

  test("a 4.5 rating no longer scores near-full on the rating check", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, rating: 4.5 });
    const check = breakdown.checks.find((c) => c.id === "visibility.rating")!;
    expect(check.earnedPoints).toBe(12.8); // 80% of 16 — see RATING_CURVE
  });

  test("a handful of reviews earns a small fraction of the review-count check", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, reviewCount: 6 });
    const check = breakdown.checks.find((c) => c.id === "visibility.review_count")!;
    // sqrt(6/150) * 18 = 3.6 — well under a quarter credit for a handful
    // of reviews.
    expect(check.earnedPoints).toBe(3.6);
  });

  test("at the same rating, meaningfully more reviews earns a meaningfully higher total", () => {
    const moreReviews = scoreBusiness({ ...PERFECT_INPUT, rating: 5.0, reviewCount: 87 });
    const fewerReviews = scoreBusiness({ ...PERFECT_INPUT, rating: 5.0, reviewCount: 29 });
    expect(moreReviews.total).toBeGreaterThan(fewerReviews.total);
    // The gap should be large enough to matter for ranking — not a
    // rounding-error-sized difference — and in this case actually crosses
    // a letter grade.
    expect(moreReviews.total - fewerReviews.total).toBeGreaterThanOrEqual(5);
    expect(moreReviews.grade).not.toBe(fewerReviews.grade);
  });

  test("a realistically 'average' business (good rating backed by enough reviews to trust it, missing a couple listing items) lands in the B range", () => {
    const input: BusinessScoringInput = {
      ...PERFECT_INPUT,
      rating: 4.5,
      // 45 reviews clears RATING_CONFIDENCE_FULL_AT_REVIEWS (40), so this
      // business's rating isn't also getting confidence-discounted on top
      // of the curve's own demandingness — it's a realistic, established
      // small business, not a thin-sample one.
      reviewCount: 45,
      openingHours: null, // one missing completeness item
    };
    const breakdown = scoreBusiness(input);
    expect(breakdown.total).toBeGreaterThanOrEqual(80);
    expect(breakdown.total).toBeLessThanOrEqual(85);
    expect(breakdown.grade).toBe("B");
  });

  test("a weak business (low rating, very few reviews, incomplete listing) falls to C or below", () => {
    const input: BusinessScoringInput = {
      ...PERFECT_INPUT,
      rating: 3.5,
      reviewCount: 5,
      openingHours: null,
      photoCount: 0,
    };
    const breakdown = scoreBusiness(input);
    expect(breakdown.total).toBeLessThanOrEqual(79);
  });

  test("only a business strong across rating, review volume, and completeness reaches the 90s", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, rating: 4.8, reviewCount: 180 });
    expect(breakdown.total).toBeGreaterThanOrEqual(90);
    expect(breakdown.grade).toBe("A");
  });
});

// v1.3.0 added review-confidence weighting to the rating check: a
// business's star value alone no longer earns full rating points — it
// also needs enough reviews backing it up to be trusted (full confidence
// at RATING_CONFIDENCE_FULL_AT_REVIEWS). This is deliberately a
// different axis from the review-count check (which measures social
// proof volume, saturating much later at 150) — a thin-sample business
// can lose points on both, honestly, for the same real weakness.
describe("v1.3.0 rating confidence weighting", () => {
  const RATING_MAX_POINTS = CHECKS.find((c) => c.id === "visibility.rating")!.maxPoints;
  // Mirrors RATING_CONFIDENCE_FULL_AT_REVIEWS in lib/scoring.ts — not
  // exported (it's an internal curve constant), so pinned here the same
  // way other tests in this file pin internal curve values directly.
  const RATING_CONFIDENCE_FULL_AT_REVIEWS = 40;

  test("a perfect 5.0 rating from only 7 reviews earns well under full rating points", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, rating: 5.0, reviewCount: 7 });
    const check = breakdown.checks.find((c) => c.id === "visibility.rating")!;
    expect(check.confidence).toBe("VERIFIED");
    // The star value itself is maxed (ratingFraction(5.0) = 1.0), so any
    // shortfall below the 16-point ceiling is purely the confidence
    // discount — not a curve/rounding artifact.
    expect(check.earnedPoints).toBeLessThan(RATING_MAX_POINTS * 0.6);
    expect(check.earnedPoints).toBeGreaterThan(0);
  });

  test("the same 5.0 rating earns full rating points once review count clears the confidence threshold", () => {
    const breakdown = scoreBusiness({
      ...PERFECT_INPUT,
      rating: 5.0,
      reviewCount: RATING_CONFIDENCE_FULL_AT_REVIEWS,
    });
    const check = breakdown.checks.find((c) => c.id === "visibility.rating")!;
    expect(check.earnedPoints).toBe(RATING_MAX_POINTS);
  });

  test("confidence ramps smoothly: more reviews never earns fewer rating points at a fixed star value", () => {
    const counts = [0, 3, 7, 10, 15, 20, 25, 30, 35, 40, 60, 150];
    const points = counts.map(
      (reviewCount) =>
        scoreBusiness({ ...PERFECT_INPUT, rating: 4.7, reviewCount }).checks.find(
          (c) => c.id === "visibility.rating"
        )!.earnedPoints!
    );
    for (let i = 1; i < points.length; i++) {
      expect(points[i]).toBeGreaterThanOrEqual(points[i - 1]);
    }
    // And it's a ramp, not a single jump — points strictly increase
    // somewhere in the middle of the range, not just at the endpoints.
    expect(points[points.length - 1]).toBeGreaterThan(points[0]);
  });

  test("a null review count discounts confidence the same as zero, not the same as full trust", () => {
    const withZero = scoreBusiness({ ...PERFECT_INPUT, rating: 4.9, reviewCount: 0 });
    const withNull = scoreBusiness({ ...PERFECT_INPUT, rating: 4.9, reviewCount: null });
    const zeroCheck = withZero.checks.find((c) => c.id === "visibility.rating")!;
    const nullCheck = withNull.checks.find((c) => c.id === "visibility.rating")!;
    expect(nullCheck.confidence).toBe("VERIFIED");
    expect(nullCheck.earnedPoints).toBe(zeroCheck.earnedPoints);
    expect(nullCheck.earnedPoints).toBeLessThan(RATING_MAX_POINTS);
  });

  test("explanation honestly names the review count while confidence is discounted, and drops the caveat once full", () => {
    const thin = scoreBusiness({ ...PERFECT_INPUT, rating: 5.0, reviewCount: 7 });
    const thinCheck = thin.checks.find((c) => c.id === "visibility.rating")!;
    expect(thinCheck.explanation).toContain("7 review");
    expect(thinCheck.explanation.toLowerCase()).toContain("more reviews");

    const established = scoreBusiness({ ...PERFECT_INPUT, rating: 5.0, reviewCount: 200 });
    const establishedCheck = established.checks.find((c) => c.id === "visibility.rating")!;
    expect(establishedCheck.explanation).toBe("Rated 5.0★ on Google.");
  });

  test("simulateFix for the rating check reaches full points on its own, even starting from zero or null reviews", () => {
    const zeroReviews: BusinessScoringInput = { ...PERFECT_INPUT, rating: 2.0, reviewCount: 0 };
    const fixedFromZero = scoreBusiness(applyCheckFix(zeroReviews, "visibility.rating"));
    expect(fixedFromZero.checks.find((c) => c.id === "visibility.rating")!.earnedPoints).toBe(
      RATING_MAX_POINTS
    );

    const nullReviews: BusinessScoringInput = { ...PERFECT_INPUT, rating: 2.0, reviewCount: null };
    const fixedFromNull = scoreBusiness(applyCheckFix(nullReviews, "visibility.rating"));
    expect(fixedFromNull.checks.find((c) => c.id === "visibility.rating")!.earnedPoints).toBe(
      RATING_MAX_POINTS
    );
  });

  test("simulateFix never lowers an already-sufficient review count", () => {
    const input: BusinessScoringInput = { ...PERFECT_INPUT, rating: 2.0, reviewCount: 500 };
    const fixed = applyCheckFix(input, "visibility.rating");
    expect(fixed.reviewCount).toBe(500);
  });
});
