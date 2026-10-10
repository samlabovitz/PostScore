import { describe, expect, test } from "vitest";
import {
  buildMonthlyReportContent,
  type CompetitorDelta,
  type MonthlyReportFocusInputs,
  type MonthlyReportScoreRow,
} from "./monthlyReport";
import type { ProfileSnapshot } from "./profileChanges";
import { scoreBusiness, type BusinessScoringInput } from "./scoring";

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
      mobilePerformance: { method: "lab", fieldCategory: null, labScore: 92 },
      mobilePerformanceFailureReason: null,
      contentFetchFailureReason: null,
      httpsUnreachableReason: null,
      screenshotUrl: null,
      additionalPages: [],
      lastScreenshotRefreshAt: null,
      aboutPresence: { state: "found", url: "https://example.com/about", locatedOnHomepage: false, reason: null, note: null },
      servicesPresence: { state: "found", url: "https://example.com/services", locatedOnHomepage: false, reason: null, note: null },
      checkedAt: "2026-08-01T00:00:00.000Z",
    },
    ...overrides,
  };
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
    // No competitor snapshot was passed in — honestly never tracked.
    expect(report.competitorStanding).toBeNull();

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

  test("a first report with a REAL competitor scan right now shows the current standing, never 'not tracked'", () => {
    const current = scoreRow();
    const standingNow = { rank: 3, totalCompetitors: 9, topCompetitorReviewCount: 250 };
    // Still no previous report to diff against — competitorDelta stays
    // null — but a real scan was just run, so competitorStanding must
    // carry it through regardless.
    const report = buildMonthlyReportContent(null, current, null, standingNow);

    expect(report.kind).toBe("baseline");
    expect(report.competitor).toEqual({ available: false });
    expect(report.competitorStanding).toEqual(standingNow);
  });

  test("a first report with no competitor scan ever run has competitorStanding: null, never a fabricated rank", () => {
    const current = scoreRow();
    const report = buildMonthlyReportContent(null, current, null, null);

    expect(report.competitorStanding).toBeNull();
  });
});

describe("buildMonthlyReportContent — real deltas", () => {
  test("reports genuine improvement across every dimension, never softened or inflated", () => {
    const baseline = scoreRow({
      id: "score-1",
      total: 70,
      grade: "C",
      createdAt: "2026-08-01T00:00:00.000Z",
      // Both below Google's real 10-photo API cap (lib/googlePhotoCap.ts)
      // — a real-world-possible exact delta, not the impossible-to-collect
      // 14 this fixture used before that cap was honestly handled.
      profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.2, reviewCount: 60, photoCount: 6 },
    });
    const current = scoreRow({
      id: "score-2",
      total: 84,
      grade: "B",
      createdAt: "2026-09-01T00:00:00.000Z",
      profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.6, reviewCount: 75, photoCount: 9 },
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
  const current = scoreRow({ id: "current" });

  function withFocus(focusInputs: MonthlyReportFocusInputs) {
    return buildMonthlyReportContent(null, current, null, null, "en", focusInputs);
  }

  test("the score_gap pointer comes from the real, already action-plan-merged top task — never recomputed from the raw breakdown", () => {
    const report = withFocus({
      topActionPlanTask: { checkId: "visibility.reviews_merged", label: "Reviews", action: "Ask recent customers for a review." },
      growthMoves: [],
      monthIndex: 0,
      routineCheckedCount: null,
    });
    const scoreGaps = report.focus.pointers.filter((p) => p.kind === "score_gap");
    expect(scoreGaps).toHaveLength(1);
    expect(scoreGaps[0].checkId).toBe("visibility.reviews_merged");
    expect(scoreGaps[0].text).toContain("Reviews");
    expect(scoreGaps[0].text).toContain("Ask recent customers for a review.");
  });

  test("never shows 2 review items — the score slot is capped to exactly one, even when it's the merged reviews card", () => {
    const report = withFocus({
      topActionPlanTask: { checkId: "visibility.reviews_merged", label: "Reviews", action: "Ask for reviews." },
      growthMoves: [],
      monthIndex: 0,
      routineCheckedCount: null,
    });
    expect(report.focus.pointers.filter((p) => p.kind === "score_gap")).toHaveLength(1);
  });

  test("no open action-plan task means no score_gap pointer at all — never fabricated", () => {
    const report = withFocus({ topActionPlanTask: null, growthMoves: [], monthIndex: 0, routineCheckedCount: null });
    expect(report.focus.pointers.some((p) => p.kind === "score_gap")).toBe(false);
  });

  test("the growth-move pointer uses the Growth page's own honest badge text — customers-only vs. also-raises-score", () => {
    const customersOnly = withFocus({
      topActionPlanTask: null,
      growthMoves: [{ id: "start_coupon", title: "Start a coupon", why: "Give new customers a reason to try you." }],
      monthIndex: 0,
      routineCheckedCount: null,
    });
    const customersPointer = customersOnly.focus.pointers.find((p) => p.kind === "growth_move");
    expect(customersPointer?.text).toContain("Start a coupon");
    expect(customersPointer?.text).toContain("doesn't change your score");

    const alsoScore = withFocus({
      topActionPlanTask: null,
      growthMoves: [{ id: "improve_website", title: "Improve your website", why: "Your site is losing points." }],
      monthIndex: 0,
      routineCheckedCount: null,
    });
    const alsoScorePointer = alsoScore.focus.pointers.find((p) => p.kind === "growth_move");
    expect(alsoScorePointer?.text).toContain("also raises your score");
  });

  test("Day 4 Part 2b fix: a growth move that just repeats the score-gap task already shown is skipped, not duplicated (the real Lamonsoff case)", () => {
    // The exact real shape that regressed: the score-gap item IS a
    // website check, and the only firing growth move is improve_website
    // — before the fix, this showed "Performance & mobile" as the score
    // gap AND "Improve your website" as a growth move, two bullets about
    // the identical real action.
    const report = withFocus({
      topActionPlanTask: {
        checkId: "website.performance_mobile",
        label: "Performance & mobile",
        action: "Speed up your website, especially on mobile.",
      },
      growthMoves: [{ id: "improve_website", title: "Improve your website", why: "Your site is losing points." }],
      monthIndex: 0,
      routineCheckedCount: null,
    });
    expect(report.focus.pointers.some((p) => p.kind === "growth_move")).toBe(false);
    expect(report.focus.pointers.filter((p) => p.kind === "score_gap")).toHaveLength(1);
  });

  test("Day 4 Part 2b fix: rotation skips a duplicate move and takes the next eligible one instead of showing nothing", () => {
    const report = withFocus({
      topActionPlanTask: {
        checkId: "website.performance_mobile",
        label: "Performance & mobile",
        action: "Speed up your website, especially on mobile.",
      },
      growthMoves: [
        { id: "improve_website", title: "Improve your website", why: "Your site is losing points." },
        { id: "start_coupon", title: "Start a coupon", why: "Give new customers a reason to try you." },
      ],
      monthIndex: 0,
      routineCheckedCount: null,
    });
    const growthMove = report.focus.pointers.find((p) => p.kind === "growth_move");
    expect(growthMove?.text).toContain("Start a coupon");
  });

  test("Day 4 Part 2b fix: add_photos_vs_competitors is skipped only when the score gap is specifically completeness.photos", () => {
    const duplicate = withFocus({
      topActionPlanTask: { checkId: "completeness.photos", label: "Photos", action: "Add more photos." },
      growthMoves: [{ id: "add_photos_vs_competitors", title: "Add photos", why: "Competitors show more." }],
      monthIndex: 0,
      routineCheckedCount: null,
    });
    expect(duplicate.focus.pointers.some((p) => p.kind === "growth_move")).toBe(false);

    const notDuplicate = withFocus({
      topActionPlanTask: { checkId: "visibility.rating", label: "Star rating", action: "Ask for reviews." },
      growthMoves: [{ id: "add_photos_vs_competitors", title: "Add photos", why: "Competitors show more." }],
      monthIndex: 0,
      routineCheckedCount: null,
    });
    expect(notDuplicate.focus.pointers.some((p) => p.kind === "growth_move")).toBe(true);
  });

  test("rotates which firing growth move is shown deterministically by the real recap month — same month same pick, next month a different one", () => {
    const moves = [
      { id: "start_coupon" as const, title: "Coupon", why: "x" },
      { id: "run_price_check" as const, title: "Price check", why: "x" },
      { id: "build_starter_site" as const, title: "Starter site", why: "x" },
    ];
    const pickFor = (monthIndex: number) =>
      withFocus({ topActionPlanTask: null, growthMoves: moves, monthIndex, routineCheckedCount: null }).focus.pointers.find(
        (p) => p.kind === "growth_move"
      )?.text;

    const september = 2026 * 12 + 8; // a real, arbitrary month index
    expect(pickFor(september)).toBe(pickFor(september));

    const picks = new Set([pickFor(september), pickFor(september + 1), pickFor(september + 2), pickFor(september + 3)]);
    expect(picks.size).toBeGreaterThan(1);
  });

  test("a law firm's real growth-move list never includes a referral move (referralOk respected upstream) — so no referral pointer can ever surface", () => {
    // A law firm's real buildGrowthMoves() output never contains
    // start_referral in the first place (gated on referralOk there) —
    // this fixture mirrors exactly what the real caller would pass for
    // one: every OTHER move, but never that one.
    const report = withFocus({
      topActionPlanTask: null,
      growthMoves: [
        { id: "start_coupon", title: "Coupon", why: "x" },
        { id: "run_price_check", title: "Price check", why: "x" },
      ],
      monthIndex: 0,
      routineCheckedCount: null,
    });
    expect(report.focus.pointers.some((p) => p.text.toLowerCase().includes("referral"))).toBe(false);
  });

  test("no firing growth move means no growth_move pointer at all", () => {
    const report = withFocus({ topActionPlanTask: null, growthMoves: [], monthIndex: 0, routineCheckedCount: null });
    expect(report.focus.pointers.some((p) => p.kind === "growth_move")).toBe(false);
  });

  test("the routine pointer states the real checked-off count, never a claim the owner actually posted/replied/added anything", () => {
    const withCount = withFocus({ topActionPlanTask: null, growthMoves: [], monthIndex: 0, routineCheckedCount: 6 });
    const pointer = withCount.focus.pointers.find((p) => p.kind === "routine");
    expect(pointer?.text).toContain("6");
    expect(pointer?.text).toMatch(/checked off/i);
    expect(pointer?.text).not.toMatch(/posted|replied|added a photo/i);
  });

  test("a real zero still gets an honest pointer to the real checklist, never silently omitted", () => {
    const zero = withFocus({ topActionPlanTask: null, growthMoves: [], monthIndex: 0, routineCheckedCount: 0 });
    const pointer = zero.focus.pointers.find((p) => p.kind === "routine");
    expect(pointer?.text).toContain("Your weekly routine");
    expect(pointer?.text).not.toMatch(/posted|replied|added a photo/i);
  });

  test("a genuinely unreadable routine count (null) produces no routine pointer at all — never a fabricated zero", () => {
    const report = withFocus({ topActionPlanTask: null, growthMoves: [], monthIndex: 0, routineCheckedCount: null });
    expect(report.focus.pointers.some((p) => p.kind === "routine")).toBe(false);
  });

  test("shows all 3 when all three real sources are present, and never more than 3", () => {
    const report = withFocus({
      topActionPlanTask: { checkId: "visibility.reviews_merged", label: "Reviews", action: "Ask for reviews." },
      growthMoves: [{ id: "start_coupon", title: "Coupon", why: "x" }],
      monthIndex: 0,
      routineCheckedCount: 3,
    });
    expect(report.focus.pointers).toHaveLength(3);
    expect(report.focus.nothingNotable).toBe(false);
  });

  test("never pads: no open task, no firing growth move, and no readable routine data shows nothing at all, honestly", () => {
    const report = withFocus({ topActionPlanTask: null, growthMoves: [], monthIndex: 0, routineCheckedCount: null });
    expect(report.focus.nothingNotable).toBe(true);
    expect(report.focus.pointers).toEqual([]);
  });

  test("omitting focusInputs entirely (the default) is the same honest 'nothing to show' — never a fabricated default", () => {
    const report = buildMonthlyReportContent(null, current, null);
    expect(report.focus.nothingNotable).toBe(true);
    expect(report.focus.pointers).toEqual([]);
  });
});
