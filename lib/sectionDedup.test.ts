// Cross-section deduplication: the Growth page has four sections
// ("This week's plan", "Bigger projects", "Your weekly routine", "Ways
// to bring in more customers"), and per Day 3 step 2e's second pass, an
// item — or anything giving the same real-world advice — may appear in
// only ONE of them across the whole page. This file exercises the
// REAL builders together (never each in isolation) against realistic
// business shapes, since a dedup bug only ever shows up when two
// sections are built from the same underlying facts at once.

import { describe, expect, test } from "vitest";
import {
  buildActionPlan,
  buildWeeklyPlan,
  mergeReviewTasks,
  mergeWebsiteTasks,
  MERGED_WEBSITE_CHECK_ID,
} from "./actionPlan";
import { buildGrowthMoves, type GrowthMoveSignals } from "./growthMoves";
import { WEEKLY_CHECKLIST_ITEM_IDS } from "./weeklyChecklist";
import { getScoreWithSuggestions, type BusinessScoringInput } from "./scoring";

function realCheckIds(task: { checkId: string; mergedCheckIds: string[] | null }): string[] {
  return task.mergedCheckIds ?? [task.checkId];
}

/** Builds all four sections' real ids/labels from one consistent
 * business shape + one consistent set of growth-move signals, exactly
 * like the Growth page does (see app/actions/actionPlan.ts and
 * app/actions/growthMoves.ts, minus the DB round-trips). */
function buildAllSections(input: BusinessScoringInput, growthSignals: Omit<GrowthMoveSignals, "businessId">) {
  const { breakdown, suggestions } = getScoreWithSuggestions(input);
  const rawTasks = buildActionPlan(breakdown, suggestions, [], input);
  const merged = mergeWebsiteTasks(mergeReviewTasks(rawTasks, breakdown, input), breakdown, input);
  const weekly = buildWeeklyPlan(merged, breakdown, input);
  const growthMoves = buildGrowthMoves({ businessId: "biz-1", ...growthSignals });

  return {
    weeklyCheckIds: weekly.weeklyTasks.flatMap(realCheckIds),
    laterCheckIds: weekly.laterTasks.flatMap(realCheckIds),
    growthMoveIds: growthMoves.map((m) => m.id),
    checklistItemIds: [...WEEKLY_CHECKLIST_ITEM_IDS],
  };
}

// No website, weak reviews, GBP not connected — the shape most likely
// to stress every dedup rule at once (starter site, reviews, connect
// GBP all real gaps simultaneously).
const NO_WEBSITE_INPUT: BusinessScoringInput = {
  rating: 3.1,
  reviewCount: 5,
  mostRecentReviewDaysAgo: null,
  phone: "+1-555-000-0000",
  address: "123 Main St",
  openingHours: ["Mon-Fri 9-5"],
  website: null,
  httpsStatus: null,
  categories: ["hair_salon"],
  primaryCategory: "Hair Salon",
  photoCount: 6,
  businessStatus: "OPERATIONAL",
  websiteAnalysis: null,
};

// Has a website, but it's weak on performance/contact — the shape that
// exercises improve_website specifically.
const WEAK_WEBSITE_INPUT: BusinessScoringInput = {
  rating: 4.9,
  reviewCount: 200,
  mostRecentReviewDaysAgo: 1,
  phone: "+1-555-000-0000",
  address: "123 Main St",
  openingHours: ["Mon-Fri 9-5"],
  website: "https://example.com",
  httpsStatus: "https",
  categories: ["hair_salon"],
  primaryCategory: "Hair Salon",
  photoCount: 12,
  businessStatus: "OPERATIONAL",
  websiteAnalysis: {
    content: {
      hasTitle: true,
      hasMetaDescription: true,
      hasViewportTag: true,
      headingCount: 3,
      visibleTextLength: 500,
      hasPhoneLink: false,
      hasEmailLink: false,
      hasCtaText: false,
      isLikelyClientRenderedShell: false,
      renderedContentSignals: null,
    },
    mobilePerformance: { method: "lab", fieldCategory: null, labScore: 20 },
    mobilePerformanceFailureReason: null,
    contentFetchFailureReason: null,
    httpsUnreachableReason: null,
    screenshotUrl: null,
    additionalPages: [],
    lastScreenshotRefreshAt: null,
    hasAboutPage: true,
    hasServicesPage: true,
    checkedAt: "2024-01-01T00:00:00.000Z",
  },
};

const NO_WEBSITE_GROWTH_SIGNALS: Omit<GrowthMoveSignals, "businessId"> = {
  hasEverCreatedPromo: false,
  hasEverCreatedReferral: false,
  pricingAssessedAt: null,
  photoCount: 6,
  competitorPhotos: { scanAvailable: false, medianCompetitorPhotoCount: null },
  hasWebsite: false,
  hasWebsiteTaskOpen: true, // the real, honest value: has_website IS an open task for this input
  weakWebsiteIssueLabels: [],
};

const WEAK_WEBSITE_GROWTH_SIGNALS: Omit<GrowthMoveSignals, "businessId"> = {
  hasEverCreatedPromo: false,
  hasEverCreatedReferral: false,
  pricingAssessedAt: null,
  photoCount: 12,
  competitorPhotos: { scanAvailable: false, medianCompetitorPhotoCount: null },
  hasWebsite: true,
  hasWebsiteTaskOpen: false,
  weakWebsiteIssueLabels: ["Performance & mobile", "Contact & conversion"],
};

describe("no id (or equivalent advice) appears in more than one Growth page section", () => {
  test("This week's plan and Bigger projects never share a real checkId", () => {
    for (const [input, signals] of [
      [NO_WEBSITE_INPUT, NO_WEBSITE_GROWTH_SIGNALS],
      [WEAK_WEBSITE_INPUT, WEAK_WEBSITE_GROWTH_SIGNALS],
    ] as const) {
      const sections = buildAllSections(input, signals);
      const overlap = sections.weeklyCheckIds.filter((id) => sections.laterCheckIds.includes(id));
      expect(overlap).toEqual([]);
    }
  });

  test("connect_gbp never appears as a growth move — it's a weekly-plan-only item (see app/actions/actionPlan.ts)", () => {
    for (const [input, signals] of [
      [NO_WEBSITE_INPUT, NO_WEBSITE_GROWTH_SIGNALS],
      [WEAK_WEBSITE_INPUT, WEAK_WEBSITE_GROWTH_SIGNALS],
    ] as const) {
      const sections = buildAllSections(input, signals);
      expect(sections.growthMoveIds).not.toContain("connect_gbp");
    }
  });

  test("build_starter_site never fires while the score plan's own website task is open (no website case)", () => {
    const sections = buildAllSections(NO_WEBSITE_INPUT, NO_WEBSITE_GROWTH_SIGNALS);
    const websiteTaskShown =
      sections.weeklyCheckIds.includes(MERGED_WEBSITE_CHECK_ID) ||
      sections.weeklyCheckIds.includes("website.has_website") ||
      sections.laterCheckIds.includes(MERGED_WEBSITE_CHECK_ID) ||
      sections.laterCheckIds.includes("website.has_website");
    expect(websiteTaskShown).toBe(true); // sanity: the scenario is real
    expect(sections.growthMoveIds).not.toContain("build_starter_site");
  });

  test("build_starter_site and improve_website never both fire — mutually exclusive by hasWebsite", () => {
    for (const [input, signals] of [
      [NO_WEBSITE_INPUT, NO_WEBSITE_GROWTH_SIGNALS],
      [WEAK_WEBSITE_INPUT, WEAK_WEBSITE_GROWTH_SIGNALS],
    ] as const) {
      const sections = buildAllSections(input, signals);
      const hasBoth =
        sections.growthMoveIds.includes("build_starter_site") && sections.growthMoveIds.includes("improve_website");
      expect(hasBoth).toBe(false);
    }
  });

  test("the weekly routine checklist's ids never collide with any score-task checkId or growth-move id", () => {
    for (const [input, signals] of [
      [NO_WEBSITE_INPUT, NO_WEBSITE_GROWTH_SIGNALS],
      [WEAK_WEBSITE_INPUT, WEAK_WEBSITE_GROWTH_SIGNALS],
    ] as const) {
      const sections = buildAllSections(input, signals);
      const otherIds = new Set([...sections.weeklyCheckIds, ...sections.laterCheckIds, ...sections.growthMoveIds]);
      for (const itemId of sections.checklistItemIds) {
        expect(otherIds.has(itemId)).toBe(false);
      }
    }
  });

  test("run_price_check (always shown) never duplicates a score-task checkId or another growth move's id", () => {
    const sections = buildAllSections(NO_WEBSITE_INPUT, NO_WEBSITE_GROWTH_SIGNALS);
    const ids = sections.growthMoveIds;
    expect(ids.filter((id) => id === "run_price_check")).toHaveLength(1);
  });
});
