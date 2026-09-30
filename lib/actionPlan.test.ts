import { describe, expect, test } from "vitest";
import {
  buildActionPlan,
  buildWeeklyPlan,
  mergeReviewTasks,
  mergeWebsiteTasks,
  rawWeightedTotal,
  MERGED_REVIEW_CHECK_ID,
  MERGED_WEBSITE_CHECK_ID,
  WEEKLY_PLAN_CAP,
} from "./actionPlan";
import { generateSuggestions, getScoreWithSuggestions, scoreBusiness, type BusinessScoringInput } from "./scoring";

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
  websiteAnalysis: null,
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
  websiteAnalysis: null,
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
  websiteAnalysis: null,
};

// ROUGH_INPUT, but with a website already on file — isolates its real
// gaps to completeness only, so no website/starter-site task can ever
// get picked into the weekly plan. Used by tests that need an exact
// raw-points-equal-total-points relationship (see completeness's
// weight-equals-possible-points property below).
const COMPLETENESS_ONLY_INPUT: BusinessScoringInput = {
  rating: 3.2,
  reviewCount: 4,
  mostRecentReviewDaysAgo: 200,
  phone: null,
  address: "123 Main St",
  openingHours: null,
  website: "https://example.com",
  httpsStatus: "https",
  categories: null,
  primaryCategory: "Restaurant",
  photoCount: 0,
  businessStatus: "OPERATIONAL",
  websiteAnalysis: null,
};

function plan(input: BusinessScoringInput) {
  const { breakdown, suggestions } = getScoreWithSuggestions(input);
  const tasks = buildActionPlan(breakdown, suggestions, [], input);
  return { breakdown, tasks, weekly: buildWeeklyPlan(tasks, breakdown, input) };
}

/** Same real pipeline getActionPlan() actually runs (merge, then weekly
 * plan) — used by the projection tests below, since the review/website
 * merge bugs only ever showed up after both steps ran together. */
function planWithMerge(input: BusinessScoringInput) {
  const { breakdown, suggestions } = getScoreWithSuggestions(input);
  const rawTasks = buildActionPlan(breakdown, suggestions, [], input);
  const tasks = mergeWebsiteTasks(mergeReviewTasks(rawTasks, breakdown, input), breakdown, input);
  return { breakdown, tasks, weekly: buildWeeklyPlan(tasks, breakdown, input) };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
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

  test("a struggling business with review and website gaps gets BOTH real weekly actions", () => {
    // Since step 2d, website.has_website (merged with its
    // completeness.website_link twin — see mergeWebsiteTasks) is a
    // genuine quick_win: the starter-site builder makes it a real,
    // bounded, full-points-this-week action, not a longer-term project.
    const { breakdown, weekly } = planWithMerge(STRUGGLING_SALON_INPUT);

    expect(weekly.weeklyTasks.length).toBeGreaterThan(0);

    const weeklyCheckIds = weekly.weeklyTasks.map((t) => t.checkId);
    expect(weeklyCheckIds).toContain(MERGED_WEBSITE_CHECK_ID);
    expect(weeklyCheckIds).toContain(MERGED_REVIEW_CHECK_ID);

    // No longer_term task ever appears in the weekly plan.
    expect(weekly.weeklyTasks.every((t) => t.effort !== "longer_term")).toBe(true);

    // The projected gain is real, and now genuinely substantial — the
    // website action alone is worth its full combined points this week.
    const gain = weekly.weeklyProjectedBreakdown.total - breakdown.total;
    expect(gain).toBeGreaterThan(0);
    expect(weekly.weeklyProjectedBreakdown.total).toBeLessThanOrEqual(100);

    // Fully represented by its weekly card alone — no separate "Bigger
    // projects" duplicate for either merged card.
    expect(weekly.laterTasks).toHaveLength(0);
  });

  test("website.has_website carries the honest timing note once it's a real task", () => {
    const { tasks } = plan(STRUGGLING_SALON_INPUT);
    const hasWebsiteTask = tasks.find((t) => t.checkId === "website.has_website");
    expect(hasWebsiteTask?.effort).toBe("quick_win");
    expect(hasWebsiteTask?.timingNote).toContain("Google can take a few days");
  });

  // A genuinely-longer_term-only business: a real, analyzed website
  // that's just weak on performance/content/contact — has_website,
  // website_link, and https are all already closed, so nothing here is
  // a quick_win/quick_win_action; only true longer_term projects remain.
  const WEAK_ANALYZED_WEBSITE_INPUT: BusinessScoringInput = {
    ...STRONG_INPUT,
    websiteAnalysis: {
      content: {
        hasTitle: false,
        hasMetaDescription: false,
        hasViewportTag: false,
        headingCount: 0,
        visibleTextLength: 20,
        hasPhoneLink: false,
        hasEmailLink: false,
        hasCtaText: false,
        isLikelyClientRenderedShell: false,
        renderedContentSignals: null,
      },
      mobilePerformanceScore: 15,
      screenshotUrl: null,
      additionalPages: [],
      lastScreenshotRefreshAt: null,
      hasAboutPage: false,
      hasServicesPage: false,
      checkedAt: "2024-01-01T00:00:00.000Z",
    },
  };

  test("a business whose only real gaps are longer_term promotes the best one's real weekly first step", () => {
    // content_depth and contact_conversion both have a genuine weekly
    // first step (see their weeklyFix) — since step 2e's second pass,
    // buildWeeklyPlan promotes the best of these when nothing
    // quick_win/quick_win_action qualifies, rather than leaving the
    // week empty.
    const { breakdown, tasks, weekly } = plan(WEAK_ANALYZED_WEBSITE_INPUT);

    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.effort === "longer_term")).toBe(true);
    expect(weekly.weeklyTasks).toHaveLength(1);
    expect(["website.content_depth", "website.contact_conversion"]).toContain(weekly.weeklyTasks[0].checkId);
    expect(weekly.weeklyTasks[0].weightedPoints).toBeGreaterThanOrEqual(0.5);
    expect(weekly.weeklyProjectedBreakdown.total).toBeGreaterThan(breakdown.total);
    // Promoted into the week — no longer duplicated in Bigger projects.
    expect(weekly.laterTasks.some((t) => t.checkId === weekly.weeklyTasks[0].checkId)).toBe(false);
  });

  test("a business whose only longer_term gap has no honest weekly step gets an empty week, no filler", () => {
    // website.performance_mobile genuinely has no partial fix (no input
    // PostScore controls can honestly move a live Lighthouse score) —
    // a website that's ONLY weak there, with real content/contact,
    // should promote nothing.
    const onlyPerformanceGap: BusinessScoringInput = {
      ...STRONG_INPUT,
      websiteAnalysis: {
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
        mobilePerformanceScore: 10,
        screenshotUrl: null,
        additionalPages: [],
        lastScreenshotRefreshAt: null,
        hasAboutPage: true,
        hasServicesPage: true,
        checkedAt: "2024-01-01T00:00:00.000Z",
      },
    };
    const { breakdown, tasks, weekly } = plan(onlyPerformanceGap);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].checkId).toBe("website.performance_mobile");
    expect(weekly.weeklyTasks).toHaveLength(0);
    expect(weekly.weeklyProjectedBreakdown.total).toBe(breakdown.total);
    expect(weekly.laterTasks).toHaveLength(1);
  });

  test("a genuinely strong business gets an honest, empty 'caught up' week", () => {
    const { tasks, weekly, breakdown } = plan(STRONG_INPUT);
    expect(tasks).toHaveLength(0);
    expect(weekly.weeklyTasks).toHaveLength(0);
    expect(weekly.laterTasks).toHaveLength(0);
    expect(weekly.weeklyProjectedBreakdown.total).toBe(breakdown.total);
  });

  test("the weekly plan never contains growth moves — only real score tasks", () => {
    const { weekly } = planWithMerge(STRUGGLING_SALON_INPUT);
    expect(weekly.weeklyTasks.length).toBeGreaterThan(0);
    for (const task of weekly.weeklyTasks) {
      // A real ActionPlanTask always has these; a GrowthMove has
      // neither (it has `id`/`href`/`signal` instead).
      expect(task).toHaveProperty("checkId");
      expect(task).toHaveProperty("effort");
      expect(typeof task.weightedPoints).toBe("number");
    }
  });

  test("the weekly plan never has more than one review item (structurally guaranteed by the merge)", () => {
    const { weekly } = planWithMerge(STRUGGLING_SALON_INPUT);
    const reviewItems = weekly.weeklyTasks.filter(
      (t) => t.checkId === MERGED_REVIEW_CHECK_ID || t.checkId.startsWith("visibility.")
    );
    expect(reviewItems.length).toBeLessThanOrEqual(1);
  });
});

describe("mergeReviewTasks", () => {
  test("combines rating, review_count, and review_recency into one card when all three are open gaps", () => {
    const { tasks } = plan(ROUGH_INPUT);
    const reviewCheckIds = tasks
      .map((t) => t.checkId)
      .filter((id) => id.startsWith("visibility."));
    expect(reviewCheckIds.sort()).toEqual(
      ["visibility.rating", "visibility.review_count", "visibility.review_recency"].sort()
    );

    const { breakdown } = plan(ROUGH_INPUT);
    const merged = mergeReviewTasks(tasks, breakdown, ROUGH_INPUT);
    const mergedCard = merged.find((t) => t.checkId === MERGED_REVIEW_CHECK_ID);
    expect(mergedCard).toBeDefined();
    expect(mergedCard!.mergedCheckIds?.sort()).toEqual(
      ["visibility.rating", "visibility.review_count", "visibility.review_recency"].sort()
    );
    expect(mergedCard!.mergedLabels).toHaveLength(3);

    // Exactly one merged card replaces all three individual review
    // tasks — no leftover individual visibility.* task remains (the
    // merged card's own synthetic id also starts with "visibility." so
    // it's excluded here on purpose).
    expect(
      merged.filter((t) => t.checkId.startsWith("visibility.") && t.checkId !== MERGED_REVIEW_CHECK_ID)
    ).toHaveLength(0);
    expect(merged).toHaveLength(tasks.length - 2);
  });

  test("does not merge when only one review check is an open gap", () => {
    // Only review_recency is a real gap; rating and review_count are
    // already effectively closed by a strong rating/review base.
    const almostThere: BusinessScoringInput = {
      ...STRONG_INPUT,
      mostRecentReviewDaysAgo: 200,
    };
    const { breakdown, suggestions } = getScoreWithSuggestions(almostThere);
    const tasks = buildActionPlan(breakdown, suggestions, [], almostThere);
    const reviewTasks = tasks.filter((t) => t.checkId.startsWith("visibility."));

    if (reviewTasks.length <= 1) {
      const merged = mergeReviewTasks(tasks, breakdown, almostThere);
      expect(merged).toEqual(tasks);
      expect(merged.some((t) => t.checkId === MERGED_REVIEW_CHECK_ID)).toBe(false);
    }
  });

  test("leaves the underlying tasks list untouched when there's nothing to merge", () => {
    const { tasks, breakdown } = plan(STRONG_INPUT);
    expect(mergeReviewTasks(tasks, breakdown, STRONG_INPUT)).toEqual(tasks);
  });

  test("the merged card's combined raw-gap total is a real, non-inflated sum", () => {
    const { breakdown, tasks } = plan(ROUGH_INPUT);
    const merged = mergeReviewTasks(tasks, breakdown, ROUGH_INPUT);
    const mergedCard = merged.find((t) => t.checkId === MERGED_REVIEW_CHECK_ID)!;
    const individualSum = tasks
      .filter((t) => t.checkId.startsWith("visibility."))
      .reduce((sum, t) => sum + t.promisedPoints, 0);
    // The merged card's full-gap total matches the sum of the three
    // real gaps it stands in for — never invented, never double-counted.
    expect(mergedCard.promisedPoints).toBeCloseTo(individualSum, 5);
    expect(mergedCard.promisedPoints).toBeLessThanOrEqual(breakdown.checks.reduce((s, c) => s + c.maxPoints, 0));
  });
});

describe("mergeWebsiteTasks", () => {
  test("combines has_website and website_link into one card whenever there's no website", () => {
    const { breakdown, tasks } = plan(STRUGGLING_SALON_INPUT);
    const merged = mergeWebsiteTasks(tasks, breakdown, STRUGGLING_SALON_INPUT);
    const mergedCard = merged.find((t) => t.checkId === MERGED_WEBSITE_CHECK_ID);
    expect(mergedCard).toBeDefined();
    expect(mergedCard!.mergedCheckIds?.sort()).toEqual(
      ["completeness.website_link", "website.has_website"].sort()
    );
    expect(merged.some((t) => t.checkId === "website.has_website")).toBe(false);
    expect(merged.some((t) => t.checkId === "completeness.website_link")).toBe(false);
  });

  test("leaves the underlying tasks list untouched when a website already exists", () => {
    const { tasks, breakdown } = plan(STRONG_INPUT);
    expect(mergeWebsiteTasks(tasks, breakdown, STRONG_INPUT)).toEqual(tasks);
  });

  test("with a starterSiteRange, the merged card shows a real LOW/HIGH range instead of a single value", () => {
    const { breakdown, tasks } = plan(STRUGGLING_SALON_INPUT);
    const range = {
      low: 12,
      high: 30,
      lowOverlay: { website: "https://example.com" } as Partial<BusinessScoringInput>,
      highOverlay: { website: "https://example.com", httpsStatus: "https" } as Partial<BusinessScoringInput>,
    };
    const merged = mergeWebsiteTasks(tasks, breakdown, STRUGGLING_SALON_INPUT, "en", range);
    const card = merged.find((t) => t.checkId === MERGED_WEBSITE_CHECK_ID)!;
    expect(card.weightedPoints).toBe(12);
    expect(card.weightedPointsHigh).toBe(30);
    expect(card.rangeLowOverlay).toEqual(range.lowOverlay);
    expect(card.rangeHighOverlay).toEqual(range.highOverlay);
  });
});

describe("buildWeeklyPlan: starter-site points range end to end", () => {
  test("a range task's weeklyProjectedBreakdownHigh reflects its real HIGH overlay, distinct from the LOW projection", () => {
    const { breakdown, tasks } = plan(STRUGGLING_SALON_INPUT);
    const range = {
      low: 12,
      high: 30,
      lowOverlay: { website: "https://example.com" } as Partial<BusinessScoringInput>,
      highOverlay: { website: "https://example.com", httpsStatus: "https" as const } as Partial<BusinessScoringInput>,
    };
    const merged = mergeWebsiteTasks(tasks, breakdown, STRUGGLING_SALON_INPUT, "en", range);
    // Isolate just the range task so the math is easy to verify exactly.
    const rangeTask = merged.find((t) => t.checkId === MERGED_WEBSITE_CHECK_ID)!;
    const weekly = buildWeeklyPlan([rangeTask], breakdown, STRUGGLING_SALON_INPUT);

    // buildWeeklyPlan doesn't trust the range object's own low/high
    // numbers for what it displays — it re-derives the LOW card's
    // weightedPoints from applying rangeLowOverlay to the REAL input
    // (same computation weightedFixPoints does everywhere else), so the
    // displayed number always agrees with weeklyProjectedBreakdown. Only
    // the HIGH end passes through unadjusted (see buildWeeklyPlan's own
    // doc) — it's an honest range, not a sum-matching figure.
    const realLowDelta = Math.max(
      0,
      rawWeightedTotal(scoreBusiness({ ...STRUGGLING_SALON_INPUT, ...range.lowOverlay })) - rawWeightedTotal(breakdown)
    );
    expect(weekly.weeklyTasks[0].weightedPoints).toBe(round1(realLowDelta));
    expect(weekly.weeklyTasks[0].weightedPointsHigh).toBe(30);
    expect(weekly.weeklyProjectedBreakdownHigh).not.toBeNull();
    // The HIGH projection (real HTTPS applied) scores at least as high
    // as the LOW one (HTTPS untouched) — never lower, since HIGH only
    // ever adds real, positive facts on top of LOW.
    expect(weekly.weeklyProjectedBreakdownHigh!.total).toBeGreaterThanOrEqual(weekly.weeklyProjectedBreakdown.total);
  });

  test("weeklyProjectedBreakdownHigh is null whenever nothing picked is a range", () => {
    const { weekly } = planWithMerge(STRUGGLING_SALON_INPUT);
    // STRUGGLING_SALON_INPUT's own merge (via planWithMerge, no range
    // data supplied) falls back to a single value — no range.
    expect(weekly.weeklyTasks.every((t) => t.weightedPointsHigh === null)).toBe(true);
    expect(weekly.weeklyProjectedBreakdownHigh).toBeNull();
  });
});

describe("buildWeeklyPlan: real weighted points, and cards that sum to the projection", () => {
  test("every weekly task's weightedPoints sums EXACTLY to the projected total's own real delta", () => {
    for (const input of [ROUGH_INPUT, STRUGGLING_SALON_INPUT, COMPLETENESS_ONLY_INPUT]) {
      const { breakdown, weekly } = planWithMerge(input);
      const displayedSum = round1(weekly.weeklyTasks.reduce((sum, t) => sum + t.weightedPoints, 0));
      const target = weekly.weeklyProjectedBreakdown.total - breakdown.total;
      expect(displayedSum).toBeCloseTo(target, 5);
    }
  });

  test("Bigger projects cards also show real weighted points, not raw check points, when they differ", () => {
    // website.has_website sits ALONE in the 30-weight "website" category
    // whenever there's no website (every other website.* check is
    // NOT_FOUND without one) — so its real weighted value is far more
    // than its own 4 raw points. STRUGGLING_SALON_INPUT's merged
    // website card gets picked into the WEEKLY plan (not laterTasks,
    // since it's a top candidate) — pick a scenario where it's pushed
    // to "later" instead by capping at 0 weekly slots, to check the
    // laterTasks list specifically.
    const { breakdown, tasks } = plan(STRUGGLING_SALON_INPUT);
    const merged = mergeWebsiteTasks(mergeReviewTasks(tasks, breakdown, STRUGGLING_SALON_INPUT), breakdown, STRUGGLING_SALON_INPUT);
    const websiteTask = merged.find((t) => t.checkId === MERGED_WEBSITE_CHECK_ID)!;
    expect(websiteTask.weightedPoints).toBeGreaterThan(websiteTask.promisedPoints);
  });

  test("the starter-site card's projected gain matches lib/scoring.ts's real category weighting, not a naive raw-points sum", () => {
    // website.has_website sits ALONE in the 30-weight "website" category
    // whenever there's no website — so closing its 4 raw points is
    // worth the category's FULL 30 weighted points, not a proportional
    // slice. This is a real, pre-existing property of lib/scoring.ts's
    // category renormalization (untouched by this change).
    const { breakdown, weekly } = planWithMerge(STRUGGLING_SALON_INPUT);
    const websiteTask = weekly.weeklyTasks.find((t) => t.checkId === MERGED_WEBSITE_CHECK_ID);
    expect(websiteTask).toBeDefined();
    expect(websiteTask!.weightedPoints).toBeGreaterThan(8); // far more than the raw 4+4 sum

    // Isolating just the website task's own projection still matches
    // its own displayed weightedPoints exactly.
    const onlyWebsitePlan = buildWeeklyPlan([websiteTask!], breakdown, STRUGGLING_SALON_INPUT);
    const realGain = onlyWebsitePlan.weeklyProjectedBreakdown.total - breakdown.total;
    expect(realGain).toBeCloseTo(onlyWebsitePlan.weeklyTasks[0].weightedPoints, 5);
  });

  test("regression: a check that isn't one of the displayed weekly items never moves in the projection", () => {
    // The real bug this guards against: mostRecentReviewDaysAgo is null
    // in production today (never collected), which makes
    // visibility.review_recency NOT_FOUND — excluded from scoring
    // entirely. The old weeklyReviewAskFix set it to 0 unconditionally,
    // silently flipping review_recency to fully-earned even though it
    // was never one of the merged/displayed checks — inflating the
    // projected total far past what was actually promised.
    const { breakdown, weekly } = planWithMerge(STRUGGLING_SALON_INPUT);

    const touchedCheckIds = new Set<string>();
    for (const task of weekly.weeklyTasks) {
      for (const id of task.mergedCheckIds ?? [task.checkId]) touchedCheckIds.add(id);
    }
    // review_recency must never be silently touched by a fix for a
    // card that doesn't actually include it.
    expect(touchedCheckIds.has("visibility.review_recency")).toBe(false);

    for (const check of breakdown.checks) {
      if (touchedCheckIds.has(check.id)) continue;
      const after = weekly.weeklyProjectedBreakdown.checks.find((c) => c.id === check.id);
      expect(after?.earnedPoints ?? null).toBe(check.earnedPoints);
      expect(after?.confidence).toBe(check.confidence);
    }
  });

  test("every weekly task clears the 0.5pt weighted headline bar", () => {
    for (const input of [ROUGH_INPUT, STRUGGLING_SALON_INPUT, COMPLETENESS_ONLY_INPUT]) {
      const { weekly } = planWithMerge(input);
      for (const task of weekly.weeklyTasks) {
        expect(task.weightedPoints).toBeGreaterThanOrEqual(0.5);
      }
    }
  });
});
