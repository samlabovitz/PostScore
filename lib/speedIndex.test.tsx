import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fetchMobilePerformance } from "@/lib/websiteAnalysis";
import { carryForwardMobilePerformance, parseWebsiteAnalysis, scoreBusiness, SCORING_VERSION, type BusinessScoringInput, type MobilePerformanceMeasurement } from "@/lib/scoring";
import { sampleFrom, smoothSpeed, speedMeasurementCount } from "@/lib/speedSmoothing";
import { savedVersionStandsIn } from "@/lib/savedScore";

// v1.18.0 (Nov 25): "Loads in a reasonable time" keeps its 3 points, its 6-second line and its two-test rule.
// Real-visitor data first; when Google's test can't find the page's main content (no LCP — every Hair Express
// test since Nov 18), the same test's Speed Index is the seconds. Photo weight is advice only. A page Google
// can't measure at all keeps that reason instead of re-using an old test and promising "one more test".

const SITE = "https://www.hairexpressonbroadway.com/";
/** What PageSpeed returned for Hair Express on Nov 25: page loaded, LCP NO_LCP, Speed Index 6.3 s, 1.4 MB, 2 photos 1.2 MB. */
const NO_LCP_WITH_SI = {
  lighthouseResult: {
    requestedUrl: SITE,
    finalUrl: SITE,
    finalDisplayedUrl: SITE,
    mainDocumentUrl: SITE,
    categories: { performance: { score: null } },
    audits: {
      "largest-contentful-paint": { score: null, scoreDisplayMode: "error", errorMessage: "NO_LCP" },
      "speed-index": { numericValue: 6300 },
      "resource-summary": { details: { items: [{ resourceType: "total", transferSize: 1_437_696, requestCount: 11 }, { resourceType: "image", transferSize: 1_224_704, requestCount: 2 }] } },
      "network-requests": { details: { items: [{ url: SITE, statusCode: 200, resourceType: "Document" }] } },
    },
  },
};

describe("measuring: Speed Index when the main content can't be found", () => {
  test("three runs with no LCP but a Speed Index → a lab measurement of 6.3 s (3 runs) with the page weight", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify(NO_LCP_WITH_SI), { status: 200 })) as unknown as typeof fetch;
    const r = await fetchMobilePerformance(SITE, "key", ["performance"], fetchImpl);
    expect(r.failureReason).toBeNull();
    expect(r.measurement).toMatchObject({ method: "lab", labScore: null, labRuns: 3, speedIndexSeconds: 6.3, pageWeight: { totalBytes: 1_437_696, imageBytes: 1_224_704, imageCount: 2 }, measuredUrl: SITE });
    expect(r.measurement?.lcpSeconds).toBeUndefined();
    // Saved and read back; the speed history counts it.
    const parsed = parseWebsiteAnalysis({ mobilePerformance: r.measurement, checkedAt: "2026-11-25T00:00:00Z" })?.mobilePerformance;
    expect(parsed).toMatchObject({ speedIndexSeconds: 6.3, labScore: null, pageWeight: { imageCount: 2 } });
    const sample = sampleFrom(parsed!);
    expect(sample).toMatchObject({ lcpSeconds: null, speedIndexSeconds: 6.3, category: "SLOW", runs: 3 });
    expect(smoothSpeed([sample!], null)?.seconds).toBe(6.3);
    expect(speedMeasurementCount([sample!], parsed!)).toBe(3);
  });

  test("Google can't measure the page at all: the reason is kept, never an old test re-used", () => {
    const old: MobilePerformanceMeasurement = { method: "lab", fieldCategory: null, labScore: 75, lcpSeconds: 8.6, measuredAt: "2026-11-18T01:44:45Z", measuredUrl: SITE };
    const r = carryForwardMobilePerformance(null, { kind: "error", status: null, cause: "no_main_content" }, old, new Date("2026-11-25T00:00:00Z"), SITE);
    expect(r.mobilePerformance).toBeNull();
    expect(r.mobilePerformanceFailureReason).toEqual({ kind: "error", status: null, cause: "no_main_content" });
    // A timeout is still a flaky run: the recent test stands, as before.
    expect(carryForwardMobilePerformance(null, { kind: "timed_out", status: null }, old, new Date("2026-11-25T00:00:00Z"), SITE).mobilePerformance?.carriedForward).toBe(true);
  });
});

describe("scoring: same 3 points, same 6-second line, same two-test rule", () => {
  const input = (m: MobilePerformanceMeasurement, seconds: number, samples: number): BusinessScoringInput =>
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
      websiteAnalysis: {
        content: null,
        mobilePerformance: m,
        mobilePerformanceFailureReason: null,
        speedHistory: [{ measuredAt: m.measuredAt, measuredUrl: SITE, lcpSeconds: null, speedIndexSeconds: seconds, category: "SLOW", runs: m.labRuns }],
        speedSmoothed: { category: "SLOW", seconds, samples, measuredUrl: SITE },
      } as never,
      speedNeedsTwoTests: true,
    }) as BusinessScoringInput;
  const si = (seconds: number, runs = 3): MobilePerformanceMeasurement => ({ method: "lab", fieldCategory: null, labScore: null, labRuns: runs, speedIndexSeconds: seconds, measuredAt: "2026-11-25T18:29:00Z", measuredUrl: SITE, pageWeight: { totalBytes: 1_437_696, imageBytes: 1_224_704, imageCount: 2 } });
  const speed = (i: BusinessScoringInput, locale: "en" | "es" = "en") => scoreBusiness(i, locale).checks.find((c) => c.id === "website.performance_mobile")!;

  test("Hair Express: Speed Index 6.3 s over three runs → 0 / 3, with why and the photo advice (EN + ES)", () => {
    expect(SCORING_VERSION).toBe("1.18.0");
    const c = speed(input(si(6.3), 6.3, 1));
    expect(c).toMatchObject({ earnedPoints: 0, maxPoints: 3, meta: { speedMetric: "speed_index", seconds: "6.3" } });
    expect(c.explanation).toContain("about 6.3 seconds");
    expect(c.explanation).toContain("Google couldn't find your page's main content, so this is how fast the page visibly fills in (Google's Speed Index).");
    expect(c.explanation).toContain("Your 2 photos are 1.2 MB; smaller photos load faster.");
    const es = speed(input(si(6.3), 6.3, 1), "es").explanation;
    expect(es).toContain("Speed Index de Google");
    expect(es).toContain("Sus 2 fotos pesan 1,2 MB");
  });
  test("under 6 s passes; one borderline run waits for a second test, as before", () => {
    expect(speed(input(si(4.8), 4.8, 1)).earnedPoints).toBe(3);
    const one = speed(input(si(6.3, 1), 6.3, 1));
    expect(one).toMatchObject({ earnedPoints: null, meta: { noScoreCause: "one_test", speedMetric: "speed_index" } });
  });
  test("a main-content time (LCP) still wins over Speed Index; photo weight never changes points", () => {
    const lcp = speed(input({ ...si(9), lcpSeconds: 4.2, labScore: 70 }, 4.2, 1));
    expect(lcp.earnedPoints).toBe(3);
    expect(lcp.meta?.speedMetric).toBeUndefined();
  });
  test("version note and saved scans: earlier scans stand until Speed Index is in use", () => {
    expect(readFileSync("lib/scoring.ts", "utf8")).toContain("// 1.18.0: \"Loads in a reasonable time\" (same 3 points");
    const now = (speedIndex: boolean) => ({ scoringVersion: "1.18.0", categories: [], checks: speedIndex ? [{ id: "website.performance_mobile", meta: { speedMetric: "speed_index" } }] : [] }) as never;
    expect(savedVersionStandsIn("1.17.0", now(false))).toBe(true);
    expect(savedVersionStandsIn("1.17.0", now(true))).toBe(false);
  });
});
