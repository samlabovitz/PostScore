import { describe, expect, test } from "vitest";
import {
  buildMonthlyReportContent,
  GENERAL_FOCUS_TIPS,
  type CompetitorDelta,
  type MonthlyReportScoreRow,
} from "./monthlyReport";
import type { ProfileSnapshot } from "./profileChanges";
import { generateSuggestions, scoreBusiness, type BusinessScoringInput } from "./scoring";

const BASE_SNAPSHOT: ProfileSnapshot = {
  phone: "+1-555-100-2000",
  website: "https://example.com",
  openingHours: ["Monday: 9:00 AM – 5:00 PM"],
  categories: ["cafe"],
  photoCount: 12,
  rating: 4.5,
  reviewCount: 80,
  businessStatus: "OPERATIONAL",
};

/** A real, imperfect BusinessScoringInput mirroring BASE_SNAPSHOT — has a
 * genuine, real gap (no contact link/CTA on the site) so
 * generateSuggestions() always has at least one real thing to surface,
 * exactly the way a real scan would. */
function scoringInput(overrides: Partial<BusinessScoringInput> = {}): BusinessScoringInput {
  return {
    rating: BASE_SNAPSHOT.rating,
    reviewCount: BASE_SNAPSHOT.reviewCount,
    mostRecentReviewDaysAgo: null,
    phone: BASE_SNAPSHOT.phone,
    address: "123 Main St",
    openingHours: BASE_SNAPSHOT.openingHours,
    website: BASE_SNAPSHOT.website,
    httpsStatus: "https",
    categories: BASE_SNAPSHOT.categories,
    primaryCategory: "Cafe",
    photoCount: BASE_SNAPSHOT.photoCount,
    businessStatus: BASE_SNAPSHOT.businessStatus,
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
      mobilePerformanceScore: 92,
      screenshotUrl: null,
      additionalPages: [],
      lastScreenshotRefreshAt: null,
      hasAboutPage: true,
      hasServicesPage: true,
      checkedAt: "2026-08-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

/** A genuinely perfect BusinessScoringInput — every check reaches full
 * points, so generateSuggestions() returns nothing. Used only to test
 * the honest "nothing notable" state (see buildFocus). */
function perfectScoringInput(): BusinessScoringInput {
  return scoringInput({
    rating: 4.9,
    reviewCount: 200,
    mostRecentReviewDaysAgo: 0,
    websiteAnalysis: {
      ...scoringInput().websiteAnalysis!,
      content: {
        hasTitle: true,
        hasMetaDescription: true,
        hasViewportTag: true,
        headingCount: 4,
        visibleTextLength: 600,
        hasPhoneLink: true,
        hasEmailLink: true,
        hasCtaText: true,
        isLikelyClientRenderedShell: false,
        renderedContentSignals: null,
      },
      mobilePerformanceScore: 100,
    },
  });
}

function scoreRow(overrides: Partial<MonthlyReportScoreRow> = {}): MonthlyReportScoreRow {
  return {
    id: "score-1",
    total: 82,
    grade: "B",
    createdAt: "2026-08-01T00:00:00.000Z",
    profileSnapshot: BASE_SNAPSHOT,
    breakdown: scoreBusiness(scoringInput()),
    ...overrides,
  };
}

describe("buildMonthlyReportContent — first-ever report (no baseline)", () => {
  test("returns an honest baseline, never a fabricated delta or trend", () => {
    const current = scoreRow({ id: "score-1", total: 78, grade: "C", createdAt: "2026-09-01T00:00:00.000Z" });
    const report = buildMonthlyReportContent(null, current, null);

    expect(report.kind).toBe("baseline");
    expect(report.isSteady).toBe(false);

    expect(report.score.current).toEqual({ total: 78, grade: "C" });
    expect(report.score.previous).toBeNull();
    expect(report.score.scoreDelta).toBeNull();
    expect(report.score.gradeChanged).toBe(false);

    expect(report.rating).toEqual({ available: true, current: 4.5, previous: null, delta: null });
    expect(report.reviewCount).toEqual({ available: true, current: 80, previous: null, delta: null });

    // Nothing to diff against yet — structurally not applicable, not "no changes."
    expect(report.listingChanges).toEqual({ available: false });
    expect(report.competitor).toEqual({ available: false });

    expect(report.summary).toContain("Here's where you stand today");
    expect(report.summary).toContain("rating 4.5★");
    expect(report.summary).toContain("score 78 (C)");
    expect(report.summary).toContain("Month-over-month tracking starts with your next report");
    // Never implies a trend on a first report.
    expect(report.summary).not.toMatch(/rose|dropped|improved|declined/i);
  });

  test("a first report with no profile snapshot at all is still honest, not fabricated", () => {
    const current = scoreRow({ profileSnapshot: null });
    const report = buildMonthlyReportContent(null, current, null);

    expect(report.rating).toEqual({ available: false });
    expect(report.reviewCount).toEqual({ available: false });
    expect(report.summary).not.toContain("rating");
    expect(report.summary).toContain(`score ${current.total} (${current.grade})`);
  });
});

describe("buildMonthlyReportContent — real deltas", () => {
  test("reports genuine improvement across every dimension, never softened or inflated", () => {
    const baseline = scoreRow({
      id: "score-1",
      total: 70,
      grade: "C",
      createdAt: "2026-08-01T00:00:00.000Z",
      profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.2, reviewCount: 60, photoCount: 10 },
    });
    const current = scoreRow({
      id: "score-2",
      total: 84,
      grade: "B",
      createdAt: "2026-09-01T00:00:00.000Z",
      profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.6, reviewCount: 75, photoCount: 14 },
    });
    const competitorDelta: CompetitorDelta = {
      previous: { rank: 5, totalCompetitors: 12, topCompetitorReviewCount: null },
      current: { rank: 2, totalCompetitors: 12, topCompetitorReviewCount: 120 },
    };

    const report = buildMonthlyReportContent(baseline, current, competitorDelta);

    expect(report.kind).toBe("update");
    expect(report.isSteady).toBe(false);

    expect(report.score).toEqual({
      current: { total: 84, grade: "B" },
      previous: { total: 70, grade: "C" },
      scoreDelta: 14,
      gradeChanged: true,
    });

    expect(report.rating).toEqual({ available: true, current: 4.6, previous: 4.2, delta: 0.4 });
    expect(report.reviewCount).toEqual({ available: true, current: 75, previous: 60, delta: 15 });

    expect(report.competitor).toEqual({
      available: true,
      current: { rank: 2, totalCompetitors: 12, topCompetitorReviewCount: 120 },
      previous: { rank: 5, totalCompetitors: 12, topCompetitorReviewCount: null },
      rankDelta: 3,
    });

    expect(report.listingChanges.available).toBe(true);
    if (report.listingChanges.available) {
      expect(report.listingChanges.changes.some((c) => c.field === "photos")).toBe(true);
      // Rating/reviews never double-reported inside listingChanges — they're their own fields.
      expect(report.listingChanges.changes.some((c) => c.field === "rating")).toBe(false);
      expect(report.listingChanges.changes.some((c) => c.field === "reviews")).toBe(false);
    }

    expect(report.summary).toContain("rose 14 points to 84 (B)");
    expect(report.summary).toContain("rating rose to 4.6★");
    expect(report.summary).toContain("15 new reviews");
    expect(report.summary).toContain("moved up to #2 of 12");
    expect(report.summary).toContain("listing change");
  });

  test("reports genuine decline honestly — never softened into something positive", () => {
    const baseline = scoreRow({ total: 88, grade: "B", profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.7, reviewCount: 100 } });
    const current = scoreRow({ total: 74, grade: "C", profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.3, reviewCount: 95 } });
    const competitorDelta: CompetitorDelta = {
      previous: { rank: 2, totalCompetitors: 10, topCompetitorReviewCount: null },
      current: { rank: 6, totalCompetitors: 10, topCompetitorReviewCount: 140 },
    };

    const report = buildMonthlyReportContent(baseline, current, competitorDelta);

    expect(report.score.scoreDelta).toBe(-14);
    expect(report.rating).toMatchObject({ delta: -0.4 });
    expect(report.reviewCount).toMatchObject({ delta: -5 });
    expect(report.competitor).toMatchObject({ rankDelta: -4 });

    expect(report.summary).toContain("dropped 14 points to 74 (C)");
    expect(report.summary).toContain("rating dropped to 4.3★");
    expect(report.summary).toContain("review count dropped by 5");
    expect(report.summary).toContain("moved down to #6 of 10");
  });
});

describe("buildMonthlyReportContent — quiet/steady month", () => {
  test("no meaningful change is a valid, honest, non-empty result", () => {
    const baseline = scoreRow({ id: "score-1", createdAt: "2026-08-01T00:00:00.000Z" });
    const current = scoreRow({ id: "score-2", createdAt: "2026-09-01T00:00:00.000Z" });
    const competitorDelta: CompetitorDelta = {
      previous: { rank: 3, totalCompetitors: 9, topCompetitorReviewCount: null },
      current: { rank: 3, totalCompetitors: 9, topCompetitorReviewCount: null },
    };

    const report = buildMonthlyReportContent(baseline, current, competitorDelta);

    expect(report.isSteady).toBe(true);
    expect(report.score.scoreDelta).toBe(0);
    expect(report.rating).toMatchObject({ delta: 0 });
    expect(report.reviewCount).toMatchObject({ delta: 0 });
    expect(report.competitor).toMatchObject({ rankDelta: 0 });
    if (report.listingChanges.available) {
      expect(report.listingChanges.changes).toEqual([]);
    }

    expect(report.summary).toContain("You held steady this month");
    expect(report.summary).toContain("rating stable at 4.5★");
    expect(report.summary).toContain("still #3 of 9 nearby");
    expect(report.summary).toContain("score unchanged at 82 (B)");
  });

  test("an unmeasurable metric never breaks steadiness for the ones that are measurable", () => {
    const baseline = scoreRow({ id: "score-1" });
    const current = scoreRow({ id: "score-2" });
    // No competitor scan this period — steadiness is still real for
    // everything we could actually check.
    const report = buildMonthlyReportContent(baseline, current, null);

    expect(report.isSteady).toBe(true);
    expect(report.competitor).toEqual({ available: false });
    expect(report.summary).toContain("You held steady this month");
    expect(report.summary).not.toContain("nearby");
  });
});

describe("buildMonthlyReportContent — missing competitor data", () => {
  test("honestly omits competitor standing rather than guessing, without blocking other real deltas", () => {
    const baseline = scoreRow({ total: 70, profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.0 } });
    const current = scoreRow({ total: 80, profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.5 } });

    const report = buildMonthlyReportContent(baseline, current, null);

    expect(report.competitor).toEqual({ available: false });
    expect(report.score.scoreDelta).toBe(10);
    expect(report.rating).toMatchObject({ delta: 0.5 });
    // Never a fabricated rank, never the word "competitor" in the summary
    // when we have nothing real to say about it.
    expect(report.summary).not.toMatch(/#\d+ of \d+/);
    expect(report.summary).toContain("rose 10 points");
  });
});

describe("buildMonthlyReportContent — missing profile-snapshot data", () => {
  // "Performance data" here means the real per-scan profile snapshot
  // (rating/review count/listing fields) — a scan saved before that
  // column existed has none, same honest gap MonthlyRecap.changesUnavailable
  // already models in app/actions/reports.ts. Score/grade are unaffected:
  // a `scores` row always has those regardless of snapshot presence.
  test("current scan has no snapshot: rating/reviews/listing changes are honestly unavailable, score still real", () => {
    const baseline = scoreRow({ total: 70, grade: "C" });
    const current = scoreRow({ total: 85, grade: "B", profileSnapshot: null });

    const report = buildMonthlyReportContent(baseline, current, null);

    expect(report.rating).toEqual({ available: false });
    expect(report.reviewCount).toEqual({ available: false });
    expect(report.listingChanges).toEqual({ available: false });

    expect(report.score).toEqual({
      current: { total: 85, grade: "B" },
      previous: { total: 70, grade: "C" },
      scoreDelta: 15,
      gradeChanged: true,
    });
    expect(report.isSteady).toBe(false);
    expect(report.summary).toContain("rose 15 points to 85 (B)");
    expect(report.summary).not.toContain("rating");
  });

  test("baseline scan has no snapshot: deltas fall back to honestly unavailable, not zero", () => {
    const baseline = scoreRow({ total: 70, grade: "C", profileSnapshot: null });
    const current = scoreRow({ total: 70, grade: "C" });

    const report = buildMonthlyReportContent(baseline, current, null);

    // Current rating IS known even though baseline's snapshot is missing
    // — so it's available, just with no real previous to diff against.
    // delta: null, never a fabricated 0.
    expect(report.rating).toEqual({ available: true, current: 4.5, previous: null, delta: null });
    expect(report.reviewCount).toEqual({ available: true, current: 80, previous: null, delta: null });
    expect(report.listingChanges).toEqual({ available: false });

    // A delta we couldn't compute doesn't count AGAINST steadiness either
    // — score is unchanged, and nothing we could actually compare moved.
    expect(report.score.scoreDelta).toBe(0);
    expect(report.isSteady).toBe(true);
    expect(report.summary).toContain("You held steady this month");
    // But the summary never claims rating specifically was "stable" —
    // that would assert a comparison we couldn't actually make (no real
    // previous value). It only cites what's genuinely confirmed unchanged.
    expect(report.summary).not.toContain("rating");
    expect(report.summary).toContain("score unchanged at 70 (C)");
  });
});

describe("buildMonthlyReportContent — closing focus section", () => {
  test("score_gap pointers come directly from this scan's own real breakdown, biggest opportunity first", () => {
    const current = scoreRow({ id: "current" });
    const report = buildMonthlyReportContent(null, current, null);

    const realSuggestions = generateSuggestions(current.breakdown).filter((s) => s.promisedPoints > 0);
    expect(realSuggestions.length).toBeGreaterThan(0);

    const scoreGapPointers = report.focus.pointers.filter((p) => p.kind === "score_gap");
    expect(scoreGapPointers[0]?.checkId).toBe(realSuggestions[0].checkId);
    expect(scoreGapPointers[0]?.text).toContain(realSuggestions[0].label);
    expect(scoreGapPointers[0]?.text).toContain(realSuggestions[0].advice);
  });

  test("a real competitor review-count gap only becomes a pointer when the subject isn't already #1 and every real fact is available", () => {
    const baseline = scoreRow({ id: "baseline" });
    const current = scoreRow({ id: "current" });

    const rank1 = buildMonthlyReportContent(baseline, current, {
      previous: { rank: 1, totalCompetitors: 5, topCompetitorReviewCount: null },
      current: { rank: 1, totalCompetitors: 5, topCompetitorReviewCount: 999 },
    });
    // Already #1 — there's no real "top competitor" gap to report, no
    // matter how high topCompetitorReviewCount is.
    expect(rank1.focus.pointers.some((p) => p.kind === "competitor_gap")).toBe(false);

    const rank2WithGap = buildMonthlyReportContent(baseline, current, {
      previous: { rank: 2, totalCompetitors: 5, topCompetitorReviewCount: null },
      current: { rank: 2, totalCompetitors: 5, topCompetitorReviewCount: current.profileSnapshot!.reviewCount! + 30 },
    });
    const gapPointer = rank2WithGap.focus.pointers.find((p) => p.kind === "competitor_gap");
    expect(gapPointer?.text).toContain("30 more reviews");
  });

  test("a listing_issue pointer only surfaces for an operationally-notable change (phone/website/status), never a cosmetic one alone", () => {
    const baseline = scoreRow({ id: "baseline" });
    const currentPhotosOnly = scoreRow({ id: "current", profileSnapshot: { ...BASE_SNAPSHOT, photoCount: 20 } });
    const photosOnlyReport = buildMonthlyReportContent(baseline, currentPhotosOnly, null);
    expect(photosOnlyReport.focus.pointers.some((p) => p.kind === "listing_issue")).toBe(false);

    const currentPhoneChanged = scoreRow({ id: "current", profileSnapshot: { ...BASE_SNAPSHOT, phone: "+1-555-999-0000" } });
    const phoneChangedReport = buildMonthlyReportContent(baseline, currentPhoneChanged, null);
    const issuePointer = phoneChangedReport.focus.pointers.find((p) => p.kind === "listing_issue");
    expect(issuePointer?.text).toContain("Your phone number changed.");
  });

  test("fills a remaining slot with the one fixed, clearly-labeled general tip when real pointers don't fill the section", () => {
    const current = scoreRow({ id: "current" });
    // Baseline report: competitor and listing-change pointers are
    // structurally unavailable, so with 2+ real score gaps this scan's
    // breakdown always leaves exactly one slot for the general tip.
    const report = buildMonthlyReportContent(null, current, null);

    const generalTips = report.focus.pointers.filter((p) => p.kind === "general_tip");
    expect(generalTips.length).toBe(1);
    expect(GENERAL_FOCUS_TIPS.map((t) => t.text)).toContain(generalTips[0].text);
  });

  test("never shows more than 3 pointers total, even when every real source has something to say", () => {
    const baseline = scoreRow({ id: "baseline" });
    const current = scoreRow({ id: "current", profileSnapshot: { ...BASE_SNAPSHOT, phone: "+1-555-999-0000" } });
    const report = buildMonthlyReportContent(baseline, current, {
      previous: { rank: 2, totalCompetitors: 5, topCompetitorReviewCount: null },
      current: { rank: 2, totalCompetitors: 5, topCompetitorReviewCount: current.profileSnapshot!.reviewCount! + 50 },
    });
    // Real candidates here: 2 score gaps + 1 competitor gap + 1 listing
    // issue = 4 — the cap must still hold at 3.
    expect(report.focus.pointers.length).toBeLessThanOrEqual(3);
    expect(report.focus.nothingNotable).toBe(false);
  });

  test("says so honestly, with no pointers at all, when a real scan genuinely has nothing to flag", () => {
    const current = scoreRow({ id: "current", breakdown: scoreBusiness(perfectScoringInput()) });
    expect(generateSuggestions(current.breakdown).length).toBe(0);

    const report = buildMonthlyReportContent(null, current, null);
    expect(report.focus.nothingNotable).toBe(true);
    expect(report.focus.pointers).toEqual([]);
  });
});
