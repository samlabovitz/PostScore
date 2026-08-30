import { describe, expect, test } from "vitest";
import { buildActionPlan, buildWeeklyPlan, WEEKLY_PLAN_CAP } from "./actionPlan";
import { generateSuggestions, getScoreWithSuggestions, type BusinessScoringInput } from "./scoring";

// A rough business missing several independent completeness fields plus
// rating/reviews/website — several genuine quick wins available.
const ROUGH_INPUT: BusinessScoringInput = {
  rating: 3.2,
  reviewCount: 4,
  mostRecentReviewDaysAgo: 200,
  phone: null,
  address: "123 Main St",
  openingHours: null,
  website: null,
  httpsStatus: null,
  categories: null,
  primaryCategory: "Restaurant",
  photoCount: 0,
  businessStatus: "OPERATIONAL",
};

// The exact real-world shape that regressed: solid listing completeness
// (phone/address/hours/categories/photos/status all present), but a
// weak rating, a handful of reviews, and no website. Before this fix,
// rating and review_count were both "longer_term" and website_link was
// coupled to has_website — so this business had ZERO quick wins and the
// weekly plan showed a dead "nothing to do, stays an F."
const STRUGGLING_SALON_INPUT: BusinessScoringInput = {
  rating: 3.1,
  reviewCount: 5,
  mostRecentReviewDaysAgo: null, // never collected in production today
  phone: "+1-555-000-0000",
  address: "123 Main St",
  openingHours: ["Mon-Fri 9-5"],
  website: null,
  httpsStatus: null,
  categories: ["hair_salon"],
  primaryCategory: "Hair Salon",
  photoCount: 6,
  businessStatus: "OPERATIONAL",
};

// A genuinely strong business: nothing determinable is a real gap.
const STRONG_INPUT: BusinessScoringInput = {
  rating: 4.9,
  reviewCount: 200,
  mostRecentReviewDaysAgo: 1,
  phone: "+1-555-000-0000",
  address: "123 Main St",
  openingHours: ["Mon-Fri 9-5"],
  website: "https://example.com",
  httpsStatus: "https",
  categories: ["hair_salon", "beauty_salon"],
  primaryCategory: "Hair Salon",
  photoCount: 12,
  businessStatus: "OPERATIONAL",
};

function plan(input: BusinessScoringInput) {
  const { breakdown, suggestions } = getScoreWithSuggestions(input);
  const tasks = buildActionPlan(breakdown, suggestions, []);
  return { breakdown, tasks, weekly: buildWeeklyPlan(tasks, breakdown, input) };
}

describe("buildWeeklyPlan", () => {
  test("respects the cap", () => {
    const { weekly } = plan(ROUGH_INPUT);
    expect(weekly.weeklyTasks.length).toBeLessThanOrEqual(WEEKLY_PLAN_CAP);
  });

  test("the weekly projection is never a full fix-everything jump", () => {
    const { breakdown, weekly } = plan(ROUGH_INPUT);
    const allSuggestions = generateSuggestions(breakdown);
    expect(weekly.weeklyTasks.length).toBeLessThan(allSuggestions.length);
    expect(weekly.weeklyProjectedBreakdown.total).toBeLessThan(100);
    expect(weekly.weeklyProjectedBreakdown.total).toBeGreaterThanOrEqual(breakdown.total);
  });

  test("completeness.website_link never appears as a standalone quick win", () => {
    // Regression guard: completeness.website_link reads the exact same
    // `website` field as website.has_website, so "fixing" it alone via
    // applyCheckFix would silently also grant full points for
    // website.has_website (and website.https) — a fake, oversized jump
    // for a business that doesn't actually have a website yet.
    const { tasks } = plan(ROUGH_INPUT);
    const websiteLinkTask = tasks.find((t) => t.checkId === "completeness.website_link");
    expect(websiteLinkTask?.effort).toBe("longer_term");
  });

  test("a struggling business with only review/rating/website gaps still gets a real, small weekly action (never a dead empty week)", () => {
    const { breakdown, weekly } = plan(STRUGGLING_SALON_INPUT);

    // Never empty: this business has real gaps (rating, review_count,
    // has_website), so the weekly plan must feature at least one.
    expect(weekly.weeklyTasks.length).toBeGreaterThan(0);

    // The featured task(s) should be the review/rating quick-win
    // ACTIONS, not the longer-term "build a website" project.
    const weeklyCheckIds = weekly.weeklyTasks.map((t) => t.checkId);
    expect(weeklyCheckIds).toEqual(
      expect.arrayContaining([expect.stringMatching(/^visibility\.(rating|review_count)$/)])
    );
    expect(weeklyCheckIds).not.toContain("website.has_website");

    // Every task actually chosen for this week must be a genuine action
    // (never the pure longer_term website project, which has no bounded
    // weekly action at all).
    expect(weekly.weeklyTasks.every((t) => t.effort !== "longer_term")).toBe(true);

    // The projected gain is real and encouraging (not stuck at zero)...
    const gain = weekly.weeklyProjectedBreakdown.total - breakdown.total;
    expect(gain).toBeGreaterThan(0);
    // ...but modest and honest — nowhere near the full review_count or
    // rating gap, and never a 44->100-style jump.
    expect(gain).toBeLessThan(10);
    expect(weekly.weeklyProjectedBreakdown.total).toBeLessThan(100);

    // The full outcome still appears in "Bigger projects" too, with its
    // real, full (much larger) opportunity intact.
    const ratingLater = weekly.laterTasks.find((t) => t.checkId === "visibility.rating");
    const ratingWeekly = weekly.weeklyTasks.find((t) => t.checkId === "visibility.rating");
    if (ratingLater && ratingWeekly) {
      expect(ratingLater.promisedPoints).toBeGreaterThan(ratingWeekly.promisedPoints);
    }
  });

  test("a business whose only gap is genuinely longer_term still gets a featured first step, not an empty week", () => {
    const onlyWebsiteGap: BusinessScoringInput = { ...STRONG_INPUT, website: null };
    const { breakdown, tasks, weekly } = plan(onlyWebsiteGap);

    expect(tasks.length).toBeGreaterThan(0); // has_website (and its website_link twin) are real gaps
    expect(weekly.weeklyTasks.length).toBeGreaterThan(0); // never empty when real gaps exist
    // No honest partial-progress metric exists for "build a website" in
    // a single week, so the projection stays at today's real score.
    expect(weekly.weeklyProjectedBreakdown.total).toBe(breakdown.total);
  });

  test("a genuinely strong business gets an honest, empty 'caught up' week", () => {
    const { tasks, weekly, breakdown } = plan(STRONG_INPUT);
    expect(tasks).toHaveLength(0);
    expect(weekly.weeklyTasks).toHaveLength(0);
    expect(weekly.laterTasks).toHaveLength(0);
    expect(weekly.weeklyProjectedBreakdown.total).toBe(breakdown.total);
  });
});
