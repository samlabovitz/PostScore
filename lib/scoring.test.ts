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
    expect(check.earnedPoints).toBe(14);
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
    expect(breakdown.scoringVersion).toBe("1.0.0");
  });
});
