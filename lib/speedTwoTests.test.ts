import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { MIN_SPEED_MEASUREMENTS, sampleFrom, speedMeasurementCount, type SpeedSample } from "./speedSmoothing";
import { SCORING_VERSION, SPEED_TWO_TESTS_FROM, scoreBusiness, type BusinessScoringInput, type MobilePerformanceMeasurement } from "./scoring";
import { t } from "./i18n";

// v1.16.0: "Loads in a reasonable time" counts only after two successful
// phone tests within 30 days — this scan's runs plus earlier scans' — so
// one test (the real Hair Express case: 8.6 s on the only run in months
// that could measure the page) never moves the score on its own.

const SITE = "https://www.hairexpressonbroadway.com/";
const lab = (over: Partial<MobilePerformanceMeasurement> = {}): MobilePerformanceMeasurement => ({ method: "lab", fieldCategory: null, labScore: 75, lcpSeconds: 8.6, measuredAt: "2026-11-18T01:44:45Z", measuredUrl: SITE, ...over });
const sample = (at: string, runs?: number): SpeedSample => ({ measuredAt: at, measuredUrl: SITE, lcpSeconds: 8.6, category: "SLOW", ...(runs ? { runs } : {}) });

describe("how many successful phone tests count", () => {
  test("this scan's runs plus earlier scans' within 30 days; older samples count as one; field data is always enough", () => {
    expect(MIN_SPEED_MEASUREMENTS).toBe(2);
    // Hair Express: one scan, its own sample only.
    expect(speedMeasurementCount([sample("2026-11-18T01:44:45Z")], lab())).toBe(1);
    // Two of the scan's three runs measured.
    expect(speedMeasurementCount([sample("2026-11-18T01:44:45Z", 2)], lab({ labRuns: 2 }))).toBe(2);
    // An earlier scan within 30 days adds its own.
    expect(speedMeasurementCount([sample("2026-11-18T01:44:45Z"), sample("2026-11-01T00:00:00Z")], lab())).toBe(2);
    // …one older than 30 days doesn't.
    expect(speedMeasurementCount([sample("2026-11-18T01:44:45Z"), sample("2026-10-01T00:00:00Z")], lab())).toBe(1);
    // Another site's tests never count.
    expect(speedMeasurementCount([sample("2026-11-18T01:44:45Z"), { ...sample("2026-11-10T00:00:00Z"), measuredUrl: "https://other.example/" }], lab())).toBe(1);
    // An analysis from before the history existed: the measurement itself.
    expect(speedMeasurementCount([], lab({ labRuns: 3 }))).toBe(3);
    expect(speedMeasurementCount([], lab())).toBe(1);
    // A carried-forward copy is the earlier test: counted once, never twice.
    expect(speedMeasurementCount([], lab({ carriedForward: true }))).toBe(1);
    expect(speedMeasurementCount([sample("2026-11-18T01:44:45Z")], lab({ carriedForward: true }))).toBe(1);
    expect(speedMeasurementCount([], { ...lab(), method: "field" })).toBe(Infinity);
    expect(speedMeasurementCount([], null)).toBe(0);
    // New scans keep how many runs measured.
    expect(sampleFrom(lab({ labRuns: 3 }))?.runs).toBe(3);
    expect(sampleFrom(lab())?.runs).toBeUndefined();
    expect(readFileSync("lib/websiteAnalysis.ts", "utf8")).toContain("labRuns: labScores.length,");
  });
});

describe("the check under the rule", () => {
  const input = (m: MobilePerformanceMeasurement, history: SpeedSample[], on: boolean, seconds = 8.6): BusinessScoringInput =>
    ({
      rating: 5,
      reviewCount: 30,
      mostRecentReviewDaysAgo: null,
      phone: "+1 914-555-0100",
      address: "9 S Broadway",
      openingHours: ["Monday: Closed"],
      website: SITE,
      httpsStatus: "https",
      categories: ["hair_salon"],
      primaryCategory: "Hair salon",
      photoCount: 8,
      businessStatus: "OPERATIONAL",
      websiteAnalysis: { content: null, mobilePerformance: m, mobilePerformanceFailureReason: null, speedHistory: history, speedSmoothed: { category: seconds < 4 ? "FAST" : "SLOW", seconds, samples: history.length, measuredUrl: SITE } } as never,
      speedNeedsTwoTests: on,
    }) as BusinessScoringInput;
  const speed = (i: BusinessScoringInput, locale: "en" | "es" = "en") => scoreBusiness(i, locale).checks.find((c) => c.id === "website.performance_mobile")!;

  test("one test: not scored yet — never 0/3 from a single slow run; the real seconds, EN + ES (usted)", () => {
    const one = speed(input(lab(), [sample("2026-11-18T01:44:45Z")], true));
    // 8.6 s: between the clear lines, so one test isn't enough.
    expect(one).toMatchObject({ earnedPoints: null, confidence: "NOT_FOUND", meta: { noScoreCause: "one_test", seconds: "8.6" } });
    expect(one.explanation).toBe("We need one more speed test to be sure. Your first test took 8.6 s on Google's slow-phone test. This check doesn't count for or against your score until your next scan.");
    expect(speed(input(lab(), [sample("2026-11-18T01:44:45Z")], true), "es").explanation).toBe(
      "Necesitamos una prueba de velocidad más para estar seguros. Su primera prueba tardó 8,6 s en la prueba de Google con un teléfono lento. Esta comprobación no cuenta a favor ni en contra de su puntuación hasta su próximo escaneo."
    );
    // Each business's own seconds.
    expect(speed(input(lab({ lcpSeconds: 6.2 }), [{ ...sample("2026-11-18T01:44:45Z"), lcpSeconds: 6.2 }], true, 6.2)).explanation).toContain("took 6.2 s");
  });

  test("shown the same everywhere: “Not scored yet”, “— / 3”, the whole text, the title on one line", async () => {
    const { checkOutcome, isNotScoredYet } = await import("./checkOutcome");
    const { categoryOutcomeCounts } = await import("./overviewTiles");
    const one = speed(input(lab(), [sample("2026-11-18T01:44:45Z")], true));
    expect(isNotScoredYet(one)).toBe(true);
    expect(checkOutcome(one)).toBe("not_scored_yet");
    expect(categoryOutcomeCounts({ checks: [one] })).toEqual({ done: 0, needsWork: 0, couldntCheck: 0, notScoredYet: 1 });
    expect(t("en", "dashboard.checkResult.notScoredYet")).toBe("Not scored yet");
    expect(t("es", "dashboard.checkResult.notScoredYet")).toBe("Aún no se puntúa");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { LocaleProvider } = await import("./i18n");
    const { CategoryCard } = await import("@/components/scoring/CategoryCard");
    const category = { id: "website", label: "Website", weight: 30, possiblePoints: 3, earnedPoints: 0, relativeScore: null, checks: [one] } as never;
    const html = renderToStaticMarkup(createElement(LocaleProvider, { locale: "en", timeZone: "America/New_York" } as never, createElement(CategoryCard, { category, embedded: true } as never)));
    const text = html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(text).toContain("— / 3");
    expect(text).toContain("Not scored yet");
    expect(text).toContain("This check doesn't count for or against your score until your next scan.");
    expect(html).toContain('data-testid="not-scored-yet" class="pl-[25px] text-[13px] text-ink-mute"');
    expect(html).not.toMatch(/not-scored-yet"[^>]*line-clamp/);
    expect(html).toContain('<span class="whitespace-nowrap">Loads in a reasonable time</span>');
    // PostAI, the Website page's lists, and the report summaries use the same state.
    expect(readFileSync("lib/postaiFacts.ts", "utf8")).toContain('status: isNotScoredYet(c) ? "not scored yet"');
    expect(readFileSync("app/business/[id]/website/WebsiteScoreBreakdown.tsx", "utf8")).toContain("const chip = isNotScoredYet(check) ? NOT_SCORED_YET_CHIP : STATUS_CHIP[state];");
    for (const f of ["components/overview/ScoreBreakdownPanel.tsx", "lib/reports/reportPdf.ts", "lib/reports/weeklyReportV2Data.server.ts"]) expect(readFileSync(f, "utf8"), f).toContain('"dashboard.overview.breakdown.notScoredYet"');
  });

  test("one clear test counts on its own: ≤ 3 s passes, ≥ 12 s fails (double the 6 s limit); in between waits for a second", () => {
    const one = (secs: number) => speed(input(lab({ lcpSeconds: secs }), [{ ...sample("2026-11-18T01:44:45Z"), lcpSeconds: secs }], true, secs));
    expect(one(0.9)).toMatchObject({ earnedPoints: 3, confidence: "VERIFIED" });
    expect(one(3)).toMatchObject({ earnedPoints: 3, confidence: "VERIFIED" });
    expect(one(12)).toMatchObject({ earnedPoints: 0, confidence: "VERIFIED" });
    expect(one(19)).toMatchObject({ earnedPoints: 0, confidence: "VERIFIED" });
    expect(one(3.1)).toMatchObject({ earnedPoints: null, meta: { noScoreCause: "one_test" } });
    expect(one(8.6)).toMatchObject({ earnedPoints: null, meta: { noScoreCause: "one_test" } });
    expect(one(11.9)).toMatchObject({ earnedPoints: null, meta: { noScoreCause: "one_test" } });
    // Real-visitor data counts on its own, at any time.
    const field = { ...lab({ lcpSeconds: 8.6 }), method: "field" as const, fieldCategory: "SLOW" as const, labScore: null };
    expect(speed(input(field, [], true))).toMatchObject({ earnedPoints: 0, confidence: "VERIFIED" });
  });

  test("two tests: scored as before (pass/fail on the typical time)", () => {
    expect(speed(input(lab({ labRuns: 2 }), [sample("2026-11-18T01:44:45Z", 2)], true))).toMatchObject({ earnedPoints: 0, confidence: "VERIFIED" });
    expect(speed(input(lab({ lcpSeconds: 2.1 }), [sample("2026-11-18T01:44:45Z"), { ...sample("2026-11-10T00:00:00Z"), lcpSeconds: 2.0, category: "FAST" }], true, 2.05)).earnedPoints).toBe(3);
  });

  test("on since v1.16.0 shipped (a dry run turns it on with POSTSCORE_SCORING_PREVIEW)", () => {
    expect(SPEED_TWO_TESTS_FROM).toBe("1.16.0");
    expect(SCORING_VERSION).toBe("1.17.0");
    expect(speed(input(lab(), [sample("2026-11-18T01:44:45Z")], false))).toMatchObject({ earnedPoints: 0, confidence: "VERIFIED" });
  });
});

describe("the version bump re-scores only the businesses the rule changes", () => {
  test("a 1.15.0 scan still stands for 1.16.0 — unless the speed rule applies to it", async () => {
    const { savedVersionStandsIn } = await import("./savedScore");
    const now = (cause?: string) => ({ scoringVersion: "1.16.0", checks: [{ id: "website.performance_mobile", meta: cause ? { noScoreCause: cause } : null }] }) as never;
    expect(savedVersionStandsIn("1.16.0", now("one_test"))).toBe(true);
    expect(savedVersionStandsIn("1.15.0", now())).toBe(true);
    expect(savedVersionStandsIn("1.15.0", now("no_main_content"))).toBe(true);
    expect(savedVersionStandsIn("1.15.0", now("one_test"))).toBe(false);
    expect(savedVersionStandsIn("1.14.0", now())).toBe(false);
    expect(savedVersionStandsIn(null, now())).toBe(false);
    const src = readFileSync("app/actions/scoring.ts", "utf8");
    expect(src).toContain("const versionChanged = !savedVersionStandsIn(last.scoring_version, live);");
  });
});
