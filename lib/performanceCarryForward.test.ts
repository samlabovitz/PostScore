import { beforeEach, describe, expect, test, vi } from "vitest";

// "Performance & mobile" after the v1.12.0 re-scan (Hair express on
// Broadway): --no-screenshots never skips the speed test, a failed run
// keeps a real measurement from the last 30 days ("last measured {date}"),
// and the owner's wording is plain — no API names.

const collectWebsiteAnalysis = vi.fn();
vi.mock("@/lib/websiteAnalysis", () => ({ collectWebsiteAnalysis: (...a: unknown[]) => collectWebsiteAnalysis(...a) }));
vi.mock("@/lib/websiteHttps", () => ({ checkWebsiteHttps: async () => ({ status: "ok", reason: null }) }));
const loadScreenshotCallsThisMonth = vi.fn(async () => 0);
vi.mock("@/lib/screenshotBudgetServer", () => ({ loadScreenshotCallsThisMonth: () => loadScreenshotCallsThisMonth(), loadBrowserRendersThisMonth: async () => 0 }));

import { analyzeWebsiteForSave } from "@/lib/websiteAnalysisForSave";
import { businessRowToScoringInput, scoreBusiness, SCORING_VERSION, type BusinessScoringRow, type MobilePerformanceFailure, type MobilePerformanceMeasurement } from "@/lib/scoring";

const DAY = 24 * 60 * 60 * 1000;
const SITE = "https://www.hairexpressonbroadway.com/";

function analysisResult(failure: MobilePerformanceFailure | null, measurement: MobilePerformanceMeasurement | null = null) {
  return {
    content: null,
    mobilePerformance: measurement,
    mobilePerformanceFailureReason: failure,
    contentFetchFailureReason: null,
    aboutPresence: "unknown",
    servicesPresence: "unknown",
    websiteTrust: {},
    readViaBrowserChecks: [],
    browserRenders: 0,
    builder: null,
  };
}

async function save(existing: MobilePerformanceMeasurement | null, failure: MobilePerformanceFailure | null) {
  collectWebsiteAnalysis.mockResolvedValueOnce(analysisResult(failure));
  return analyzeWebsiteForSave({
    analysisUrl: SITE,
    listingWebsite: SITE,
    existingAnalysisJson: existing ? { mobilePerformance: existing, checkedAt: existing.measuredAt } : null,
    skipScreenshots: true,
    extraServicesKeywords: [],
    listingFacts: { phone: null, address: null, openingHoursPeriods: null },
  });
}

function performanceCheck(websiteAnalysis: unknown, locale: "en" | "es" = "en") {
  const row = { name: "Hair express on Broadway", rating: 4.6, review_count: 120, website: SITE, website_analysis_json: websiteAnalysis, categories: ["hair_salon"], category: "hair_salon" } as unknown as BusinessScoringRow;
  return scoreBusiness(businessRowToScoringInput(row), locale).checks.find((c) => c.id === "website.performance_mobile")!;
}

beforeEach(() => {
  collectWebsiteAnalysis.mockReset();
  loadScreenshotCallsThisMonth.mockClear();
  process.env.PAGESPEED_API_KEY = "test-pagespeed-key";
});

describe("--no-screenshots never skips the speed test", () => {
  test("rescan-all's skipScreenshots: no screenshot, but the speed test still gets its key", async () => {
    await save(null, null);
    const [url, keys, options] = collectWebsiteAnalysis.mock.calls[0];
    expect(url).toBe(SITE);
    expect(keys.pageSpeedApiKey).toBe("test-pagespeed-key");
    expect(options.captureScreenshots).toBe(false);
    // Not even the screenshot budget is read.
    expect(loadScreenshotCallsThisMonth).not.toHaveBeenCalled();
  });
});

describe("a failed speed test keeps a real measurement from the last 30 days (v1.12.0)", () => {
  const measured = (daysAgo: number): MobilePerformanceMeasurement => ({ method: "lab", fieldCategory: null, labScore: 68, measuredAt: new Date(Date.now() - daysAgo * DAY).toISOString() });

  for (const kind of ["timed_out", "error_page", "error"] as const) {
    test(`${kind}: carried forward, scored, "last measured {date}"`, async () => {
      const { websiteAnalysis } = await save(measured(10), { kind, status: null });
      expect(websiteAnalysis!.mobilePerformance).toMatchObject({ labScore: 68, carriedForward: true });
      expect(websiteAnalysis!.mobilePerformanceFailureReason).toBeNull();
      expect(SCORING_VERSION).toBe("1.12.0");
      const check = performanceCheck(websiteAnalysis);
      expect(check.earnedPoints).not.toBeNull();
      expect(check.explanation).toContain("last measured");
      expect(check.explanation).not.toMatch(/PageSpeed|API|Lighthouse/);
    });
  }

  test("older than 30 days (Hair express: last real measurement Sep 11): left out, never a stale number", async () => {
    const { websiteAnalysis } = await save(measured(47), { kind: "error", status: null });
    expect(websiteAnalysis!.mobilePerformance).toBeNull();
    expect(performanceCheck(websiteAnalysis).earnedPoints).toBeNull();
  });

  test("the site itself answered an error (http_error): never carried forward", async () => {
    const { websiteAnalysis } = await save(measured(10), { kind: "http_error", status: 500 });
    expect(websiteAnalysis!.mobilePerformance).toBeNull();
  });

  test("a carried measurement keeps its own date, so it's carried again on the next failed scan until 30 days", async () => {
    const first = await save(measured(20), { kind: "error", status: null });
    collectWebsiteAnalysis.mockResolvedValueOnce(analysisResult({ kind: "error", status: null }));
    const second = await analyzeWebsiteForSave({
      analysisUrl: SITE,
      listingWebsite: SITE,
      existingAnalysisJson: first.websiteAnalysis,
      skipScreenshots: true,
      extraServicesKeywords: [],
      listingFacts: { phone: null, address: null, openingHoursPeriods: null },
    });
    expect(second.websiteAnalysis!.mobilePerformance).toMatchObject({ labScore: 68, carriedForward: true, measuredAt: first.websiteAnalysis!.mobilePerformance!.measuredAt });
  });
});

describe("plain owner wording when nothing could be measured (EN + ES)", () => {
  test("no API names; left out, not counted against you; we'll try again", async () => {
    const { websiteAnalysis } = await save(null, { kind: "error", status: null });
    expect(performanceCheck(websiteAnalysis).explanation).toBe(
      "We couldn't measure your site's speed this time — Google's speed test didn't finish. This check is left out of your score, not counted against you. We'll try again on your next scan."
    );
    expect(performanceCheck(websiteAnalysis, "es").explanation).toBe(
      "No pudimos medir la velocidad de su sitio esta vez: la prueba de velocidad de Google no terminó. Esta comprobación queda fuera de su puntuación, no cuenta en su contra. Lo intentaremos de nuevo en su próximo escaneo."
    );
  });
});
