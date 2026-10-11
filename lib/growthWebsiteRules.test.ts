import { describe, expect, test } from "vitest";
import {
  applyGrowthWebsiteRules,
  buildActionPlan,
  buildWebsiteBanner,
  buildWeeklyPlan,
  GOOGLE_MISMATCH_CHECK_ID,
  mergeReviewTasks,
  mergeWebsiteTasks,
  MERGED_WEBSITE_CHECK_ID,
  WEEKLY_PLAN_CAP,
  type ActionPlanTask,
} from "./actionPlan";
import {
  getScoreWithSuggestions,
  type BusinessScoringInput,
  type WebsiteAnalysis,
  type WebsiteTrustAnalysis,
} from "./scoring";
import { t } from "./i18n";

// Day 4 Step 2f — the Growth page's (and PostAI's) website rules.

const CLEAN_TRUST: WebsiteTrustAnalysis = {
  spamSignals: [],
  safeBrowsingThreat: null,
  safeBrowsingChecked: true,
  infoConflicts: [
    { field: "phone", comparison: "matches", siteValue: "555-5555", googleValue: "555-5555" },
    { field: "address", comparison: "matches", siteValue: "123 Main St", googleValue: "123 Main St" },
    { field: "hours", comparison: "matches", siteValue: "see site", googleValue: "see listing" },
  ],
  staleNotices: [],
  abandonedSignals: { newestDateFound: "2026-01-01", templateLeftovers: [], looksAbandoned: false },
  websiteKind: "independent",
  listingLinkBroken: false,
  checkedAt: "2026-01-01T00:00:00.000Z",
};

const GOOD_ANALYSIS: WebsiteAnalysis = {
  content: {
    hasTitle: true,
    hasMetaDescription: true,
    hasViewportTag: true,
    headingCount: 5,
    visibleTextLength: 900,
    hasPhoneLink: true,
    hasEmailLink: true,
    hasCtaText: true,
    isLikelyClientRenderedShell: false,
    renderedContentSignals: null,
  },
  mobilePerformance: { method: "lab", fieldCategory: null, labScore: 100 },
  mobilePerformanceFailureReason: null,
  contentFetchFailureReason: null,
  httpsUnreachableReason: null,
  screenshotUrl: null,
  additionalPages: [],
  lastScreenshotRefreshAt: null,
  aboutPresence: { state: "found", url: "https://example.com/about", locatedOnHomepage: false, reason: null, note: null },
  servicesPresence: { state: "found", url: "https://example.com/services", locatedOnHomepage: false, reason: null, note: null },
  websiteTrust: CLEAN_TRUST,
  checkedAt: "2026-01-01T00:00:00.000Z",
};

const BASE: BusinessScoringInput = {
  rating: 4.9,
  reviewCount: 500,
  mostRecentReviewDaysAgo: null,
  phone: "+1-555-123-4567",
  address: "742 Evergreen Terrace, Springfield",
  openingHours: ["Monday: 9:00 AM – 5:00 PM"],
  website: "https://example.com",
  httpsStatus: "https",
  categories: ["cafe", "coffee_shop"],
  primaryCategory: "Cafe",
  photoCount: 12,
  businessStatus: "OPERATIONAL",
  websiteAnalysis: GOOD_ANALYSIS,
};

function withConflicts(fields: Array<"hours" | "phone" | "address">, extra: Partial<WebsiteAnalysis> = {}): BusinessScoringInput {
  return {
    ...BASE,
    websiteAnalysis: {
      ...GOOD_ANALYSIS,
      ...extra,
      websiteTrust: {
        ...CLEAN_TRUST,
        infoConflicts: CLEAN_TRUST.infoConflicts.map((c) =>
          fields.includes(c.field as "hours" | "phone" | "address")
            ? { ...c, comparison: "conflicts", siteValue: "Monday: Closed", googleValue: "Monday: 12:00 PM–5:00 PM" }
            : c
        ),
      },
    },
  };
}

/** The exact pipeline getActionPlan runs (minus the DB reads). */
function growthPlan(input: BusinessScoringInput, cap = WEEKLY_PLAN_CAP) {
  const { breakdown, suggestions } = getScoreWithSuggestions(input, "en");
  const raw = buildActionPlan(breakdown, suggestions, [], input, "en");
  const tasks = applyGrowthWebsiteRules(
    mergeWebsiteTasks(mergeReviewTasks(raw, breakdown, input, "en"), breakdown, input, "en", null),
    input,
    "en"
  );
  const weekly = buildWeeklyPlan(tasks, breakdown, input, cap, "en", [GOOGLE_MISMATCH_CHECK_ID]);
  return { breakdown, raw, tasks, weekly, banner: buildWebsiteBanner(breakdown, input, null) };
}

const sum = (tasks: ActionPlanTask[]) => Math.round(tasks.reduce((s, x) => s + x.weightedPoints, 0) * 10) / 10;

describe("applyGrowthWebsiteRules", () => {
  test("removes every website.* task except the Google mismatch (and the merged starter-site card)", () => {
    const input = withConflicts(["hours"], {
      mobilePerformance: { method: "lab", fieldCategory: null, labScore: 40 },
      content: { ...GOOD_ANALYSIS.content!, hasPhoneLink: false, hasCtaText: false },
    });
    const { raw, tasks } = growthPlan(input);
    expect(raw.some((x) => x.checkId === "website.performance_mobile")).toBe(true);
    expect(tasks.filter((x) => x.category === "website").map((x) => x.checkId)).toEqual([GOOGLE_MISMATCH_CHECK_ID]);

    const noSite = growthPlan({ ...BASE, website: null, httpsStatus: null, websiteAnalysis: null });
    expect(noSite.tasks.some((x) => x.checkId === MERGED_WEBSITE_CHECK_ID || x.category === "website")).toBe(false);
  });

  test("the mismatch card gets a specific, neutral action per real mismatched field — never the generic fallback", () => {
    const hours = growthPlan(withConflicts(["hours"])).tasks.find((x) => x.checkId === GOOGLE_MISMATCH_CHECK_ID)!;
    expect(hours.action).toBe(t("en", "content.actionPlan.website.info_consistency.action.hours"));
    expect(hours.action).toContain("check which is correct and update the other");
    expect(hours.why).toBe(t("en", "content.actionPlan.website.info_consistency.why"));
    expect(hours.effort).toBe("quick_win");
    expect(hours.action).not.toBe(t("en", "content.actionPlan.fallback.action"));
    expect(hours.why).not.toBe(t("en", "content.actionPlan.fallback.why"));
    // The real evidence line stays.
    expect(hours.problem).toContain("Your website says");

    const phone = growthPlan(withConflicts(["phone"])).tasks.find((x) => x.checkId === GOOGLE_MISMATCH_CHECK_ID)!;
    expect(phone.action).toBe(t("en", "content.actionPlan.website.info_consistency.action.phone"));
    const address = growthPlan(withConflicts(["address"])).tasks.find((x) => x.checkId === GOOGLE_MISMATCH_CHECK_ID)!;
    expect(address.action).toBe(t("en", "content.actionPlan.website.info_consistency.action.address"));

    const both = growthPlan(withConflicts(["hours", "phone"])).tasks.find((x) => x.checkId === GOOGLE_MISMATCH_CHECK_ID)!;
    expect(both.action).toContain("different hours");
    expect(both.action).toContain("different phone numbers");
  });

  test("never assumes Google is the correct source", () => {
    for (const key of [
      "content.actionPlan.website.info_consistency.action.hours",
      "content.actionPlan.website.info_consistency.fix",
    ] as const) {
      expect(t("en", key)).not.toMatch(/update (your )?website to match/i);
    }
  });

  test("completeness.website_link with a verified site shows the real add-to-listing steps with the URL, never the starter-site text", () => {
    const input: BusinessScoringInput = { ...BASE, website: null, verifiedElsewhereUrl: "https://banhmiboy.com" };
    const link = growthPlan(input).tasks.find((x) => x.checkId === "completeness.website_link")!;
    expect(link).toBeDefined();
    expect(link.action).toBe(t("en", "growth.fix.addWebsiteToListing.heading"));
    expect(link.fix).toContain("https://banhmiboy.com");
    expect(link.fix).not.toContain("Don't have a site yet");
    expect(link.timingNote).toBe(t("en", "growth.fix.addWebsiteToListing.note"));
    expect(link.effort).toBe("quick_win");
  });

  test("with a verified site, the add-to-listing card competes as a normal quick win this week, and the cards still add up exactly", () => {
    const input: BusinessScoringInput = { ...BASE, website: null, verifiedElsewhereUrl: "https://banhmiboy.com" };
    const { breakdown, weekly } = growthPlan(input);
    const link = weekly.weeklyTasks.find((x) => x.checkId === "completeness.website_link");
    expect(link).toBeDefined();
    expect(link!.weightedPoints).toBeGreaterThanOrEqual(0.5);
    expect(weekly.laterTasks.some((x) => x.checkId === "completeness.website_link")).toBe(false);
    expect(sum(weekly.weeklyTasks)).toBe(weekly.weeklyPointsWithinReach);
    expect(weekly.weeklyPointsWithinReach).toBe(weekly.weeklyProjectedBreakdown.total - breakdown.total);
  });

  test("it is NOT pinned: with the cap at 0 it stays in Bigger projects", () => {
    const input: BusinessScoringInput = { ...BASE, website: null, verifiedElsewhereUrl: "https://banhmiboy.com" };
    const { weekly } = growthPlan(input, 0);
    expect(weekly.weeklyTasks.some((x) => x.checkId === "completeness.website_link")).toBe(false);
    expect(weekly.laterTasks.some((x) => x.checkId === "completeness.website_link")).toBe(true);
  });

  test("without a verified site, completeness.website_link keeps its original effort", () => {
    const input: BusinessScoringInput = {
      ...BASE,
      websiteAnalysis: { ...GOOD_ANALYSIS, websiteTrust: { ...CLEAN_TRUST, listingLinkBroken: true } },
    };
    const { raw, tasks } = growthPlan(input);
    const before = raw.find((x) => x.checkId === "completeness.website_link");
    const after = tasks.find((x) => x.checkId === "completeness.website_link");
    if (before && after) expect(after.effort).toBe(before.effort);
  });
});

describe("buildWeeklyPlan — the Google mismatch is pinned this week", () => {
  test("a +0.3 mismatch (under the 0.5 minimum) still shows, with its real value", () => {
    // 2 of 3 fields still match -> 0.7/1 raw, the real Santa Fe shape.
    const input = withConflicts(["hours"]);
    input.websiteAnalysis!.websiteTrust!.infoConflicts.push({
      field: "phone",
      comparison: "matches",
      siteValue: "x",
      googleValue: "x",
    });
    const { weekly } = growthPlan(input);
    const card = weekly.weeklyTasks.find((x) => x.checkId === GOOGLE_MISMATCH_CHECK_ID);
    expect(card).toBeDefined();
    expect(card!.weightedPoints).toBeGreaterThan(0);
    expect(card!.weightedPoints).toBeLessThan(0.5);
  });

  test("it's an extra card beyond the cap, and never takes another task's slot", () => {
    const input: BusinessScoringInput = {
      ...withConflicts(["hours"]),
      phone: null,
      categories: null,
      photoCount: 0,
      openingHours: null,
    };
    const { weekly } = growthPlan(input);
    const others = weekly.weeklyTasks.filter((x) => x.checkId !== GOOGLE_MISMATCH_CHECK_ID);
    expect(others.length).toBe(WEEKLY_PLAN_CAP);
    expect(weekly.weeklyTasks.length).toBe(WEEKLY_PLAN_CAP + 1);
  });

  test("cards always add up exactly to 'Points within reach' — and that equals the real projected gain when other cards exist", () => {
    for (const input of [
      withConflicts(["hours"]),
      { ...withConflicts(["phone"]), photoCount: 0 },
      { ...withConflicts(["hours", "address"]), phone: null, categories: null, photoCount: 0 },
    ]) {
      const { breakdown, weekly } = growthPlan(input);
      expect(sum(weekly.weeklyTasks)).toBe(weekly.weeklyPointsWithinReach);
      const others = weekly.weeklyTasks.filter((x) => x.checkId !== GOOGLE_MISMATCH_CHECK_ID);
      if (others.length > 0 && weekly.weeklyPointsWithinReach >= 0) {
        expect(weekly.weeklyPointsWithinReach).toBe(weekly.weeklyProjectedBreakdown.total - breakdown.total);
      }
    }
  });

  test("no pinned ids: behavior is unchanged (within reach = real projected delta)", () => {
    const input = { ...BASE, photoCount: 0, phone: null };
    const { breakdown, suggestions } = getScoreWithSuggestions(input, "en");
    const tasks = mergeReviewTasks(buildActionPlan(breakdown, suggestions, [], input, "en"), breakdown, input, "en");
    const weekly = buildWeeklyPlan(tasks, breakdown, input, WEEKLY_PLAN_CAP, "en");
    expect(weekly.weeklyPointsWithinReach).toBe(weekly.weeklyProjectedBreakdown.total - breakdown.total);
    expect(sum(weekly.weeklyTasks)).toBe(weekly.weeklyPointsWithinReach);
  });
});

describe("buildWebsiteBanner", () => {
  test("real Website score, improvement count and points — excluding the Google mismatch", () => {
    const input = withConflicts(["hours"], {
      mobilePerformance: { method: "lab", fieldCategory: null, labScore: 40 },
      content: { ...GOOD_ANALYSIS.content!, hasPhoneLink: false, hasCtaText: false },
    });
    const { breakdown, banner } = growthPlan(input);
    const website = breakdown.categories.find((c) => c.id === "website")!;
    expect(banner).toEqual({
      kind: "improve",
      score: Math.round(website.relativeScore!),
      improvements: 2, // performance_mobile + contact_conversion; NOT info_consistency
      points: expect.any(Number),
    });
    expect((banner as { points: number }).points).toBeGreaterThan(0);
  });

  test("hidden when the Google mismatch is the only website gap, and when the website is at 100", () => {
    expect(growthPlan(withConflicts(["hours"])).banner).toBeNull();
    expect(growthPlan(BASE).banner).toBeNull();
  });

  test("hidden when the Website page itself shows 100/100 (a 99.6 rounds to 100 there)", () => {
    // A barely-below-full speed score: real gap, but the Website page reads 100.
    const input: BusinessScoringInput = {
      ...BASE,
      websiteAnalysis: { ...GOOD_ANALYSIS, mobilePerformance: { method: "lab", fieldCategory: null, labScore: 99 } },
    };
    const { breakdown, banner } = growthPlan(input);
    const website = breakdown.categories.find((c) => c.id === "website")!;
    expect(website.relativeScore!).toBeLessThan(100);
    expect(Math.round(website.relativeScore!)).toBe(100);
    expect(banner).toBeNull();
  });

  test("no website at all: 'get a website' with the starter-site range (or one value without a template)", () => {
    const noSite: BusinessScoringInput = { ...BASE, website: null, httpsStatus: null, websiteAnalysis: null };
    const { breakdown } = getScoreWithSuggestions(noSite, "en");
    expect(buildWebsiteBanner(breakdown, noSite, { low: 12.34, high: 18.06 })).toEqual({ kind: "get_website", low: 12.3, high: 18.1 });
    const single = buildWebsiteBanner(breakdown, noSite, null);
    expect(single?.kind).toBe("get_website");
    expect((single as { low: number }).low).toBeGreaterThan(0);
  });

  test("a verified-elsewhere site is never offered 'get a website'", () => {
    const verified: BusinessScoringInput = {
      ...withConflicts([], { mobilePerformance: { method: "lab", fieldCategory: null, labScore: 40 } }),
      website: null,
      verifiedElsewhereUrl: "https://banhmiboy.com",
    };
    expect(growthPlan(verified).banner?.kind).toBe("improve");
  });
});
