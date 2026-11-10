import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

// "Loads fast", steadied (scoring v1.14.0): the typical result of the site's
// last 3 speed tests within 30 days, with a 0.3 s buffer at the 2.5 s and
// 4 s lines. No Google call — measurements are given.

import { bufferedBand, nextSpeedHistory, sampleFrom, smoothSpeed, type SpeedSample } from "@/lib/speedSmoothing";
import { speedForSave } from "@/lib/websiteAnalysisForSave";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { scoreBusiness, type MobilePerformanceMeasurement, type WebsiteAnalysis } from "@/lib/scoring";
import { t } from "@/lib/i18n";

const SITE = "https://wonder.example.com/";
const NOW = new Date("2026-11-10T12:00:00Z");
const sample = (secs: number | null, daysAgo: number, url = SITE, category: SpeedSample["category"] = "AVERAGE"): SpeedSample => ({
  measuredAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
  measuredUrl: url,
  lcpSeconds: secs,
  category,
});
const lab = (secs: number, daysAgo: number, extra: Partial<MobilePerformanceMeasurement> = {}): MobilePerformanceMeasurement => ({
  method: "lab",
  fieldCategory: null,
  labScore: 80,
  lcpSeconds: secs,
  measuredAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
  measuredUrl: SITE,
  ...extra,
});

describe("the 0.3 s buffer at each line", () => {
  test("Fast stays Fast up to 2.8 s; moves only past it", () => {
    expect(bufferedBand(2.6, "FAST")).toBe("FAST");
    expect(bufferedBand(2.8, "FAST")).toBe("FAST");
    expect(bufferedBand(2.81, "FAST")).toBe("AVERAGE");
  });
  test("Average stays Average from 2.2 s to 4.3 s", () => {
    expect(bufferedBand(2.3, "AVERAGE")).toBe("AVERAGE");
    expect(bufferedBand(2.19, "AVERAGE")).toBe("FAST");
    expect(bufferedBand(4.2, "AVERAGE")).toBe("AVERAGE");
    expect(bufferedBand(4.31, "AVERAGE")).toBe("SLOW");
  });
  test("Slow stays Slow down to 3.7 s; a big change moves two bands", () => {
    expect(bufferedBand(3.8, "SLOW")).toBe("SLOW");
    expect(bufferedBand(3.69, "SLOW")).toBe("AVERAGE");
    expect(bufferedBand(4.5, "FAST")).toBe("SLOW");
    expect(bufferedBand(1.5, "SLOW")).toBe("FAST");
  });
  test("no previous band: the plain lines", () => {
    expect(bufferedBand(2.5, null)).toBe("FAST");
    expect(bufferedBand(2.6, null)).toBe("AVERAGE");
    expect(bufferedBand(4.01, null)).toBe("SLOW");
  });
});

describe("the last 3 tests of the same site, within 30 days", () => {
  test("newest first, at most 3; another site's and month-old tests left out; never twice", () => {
    const h = nextSpeedHistory([sample(2.4, 5), sample(2.5, 6), sample(9, 40), sample(1, 2, "https://other.example.com/")], sample(2.6, 0), SITE, NOW);
    expect(h.map((s) => s.lcpSeconds)).toEqual([2.6, 2.4, 2.5]);
    expect(nextSpeedHistory(h, h[0], SITE, NOW)).toHaveLength(3);
    // www. and a trailing slash are the same site.
    expect(nextSpeedHistory([sample(2, 1, "http://www.wonder.example.com")], null, SITE, NOW)).toHaveLength(1);
  });

  test("the median of 3, of 2, or the one there is", () => {
    expect(smoothSpeed([sample(13.8, 6), sample(3.4, 5), sample(2.2, 0)], null)).toMatchObject({ seconds: 3.4, category: "AVERAGE", samples: 3 });
    expect(smoothSpeed([sample(1.8, 5), sample(2.8, 0)], null)).toMatchObject({ seconds: 2.3, category: "FAST", samples: 2 });
    expect(smoothSpeed([sample(5.9, 0)], null)).toMatchObject({ seconds: 5.9, category: "SLOW", samples: 1 });
    expect(smoothSpeed([], null)).toBeNull();
  });

  test("without seconds, the median band", () => {
    expect(smoothSpeed([sample(null, 3, SITE, "FAST"), sample(null, 2, SITE, "SLOW"), sample(null, 1, SITE, "AVERAGE")], null)).toMatchObject({ category: "AVERAGE", seconds: null });
  });

  test("a carried-forward result, or one without a site or date, is never a new test", () => {
    expect(sampleFrom(lab(2.6, 0, { carriedForward: true }))).toBeNull();
    expect(sampleFrom(lab(2.6, 0, { measuredUrl: undefined }))).toBeNull();
    expect(sampleFrom(lab(2.6, 0))).toMatchObject({ lcpSeconds: 2.6, category: "AVERAGE" });
  });
});

describe("at save, and in the score", () => {
  const analysis = (m: MobilePerformanceMeasurement, extra: Partial<WebsiteAnalysis> = {}): WebsiteAnalysis => ({ ...scoringInput().websiteAnalysis!, mobilePerformance: m, ...extra });

  test("the real Wonder case: 2.5 s, then 2.6 s — stays Fast (typical 2.55 s, inside the buffer), full points", () => {
    const existing = analysis(lab(2.5, 5));
    const speed = speedForSave(lab(2.6, 0), existing, SITE, NOW)!;
    expect(speed.speedHistory.map((s) => s.lcpSeconds)).toEqual([2.6, 2.5]);
    expect(speed.speedSmoothed).toMatchObject({ category: "FAST", seconds: 2.55, samples: 2 });
    const wa = analysis(lab(2.6, 0), speed);
    const c = scoreBusiness({ ...scoringInput(), websiteAnalysis: wa }).checks.find((x) => x.id === "website.performance_mobile")!;
    expect(c.earnedPoints).toBe(c.maxPoints);
    // v1.15.0: "Loads in a reasonable time" — said with the typical time.
    expect(c.explanation).toBe("Your site loads in a reasonable time on phones (about 2.6 seconds). Typical of your last 2 tests.");
  });

  test("the history grows to 3; the oldest drops off", () => {
    let existing = analysis(lab(2.4, 9));
    for (const [secs, day] of [[2.5, 6], [2.6, 3], [2.7, 0]] as const) {
      const m = lab(secs, day);
      existing = analysis(m, speedForSave(m, existing, SITE, NOW)!);
    }
    expect(existing.speedHistory!.map((s) => s.lcpSeconds)).toEqual([2.7, 2.6, 2.5]);
    expect(existing.speedSmoothed).toMatchObject({ seconds: 2.6, category: "FAST", samples: 3 });
  });

  test("a failed test keeps the history as it was", () => {
    const existing = analysis(lab(2.4, 2), { speedHistory: [sample(2.4, 2)], speedSmoothed: { category: "FAST", seconds: 2.4, samples: 1, measuredUrl: SITE } });
    expect(speedForSave(null, existing, SITE, NOW)!.speedHistory).toHaveLength(1);
  });

  test("another site: a fresh history, and the old typical result is never used", () => {
    const existing = analysis(lab(1.5, 2), { speedHistory: [sample(1.5, 2)], speedSmoothed: { category: "FAST", seconds: 1.5, samples: 1, measuredUrl: SITE } });
    const other = "https://new.example.com/";
    const speed = speedForSave(lab(7, 0, { measuredUrl: other }), existing, other, NOW)!;
    expect(speed.speedHistory.map((s) => s.measuredUrl)).toEqual([other]);
    expect(speed.speedSmoothed).toMatchObject({ category: "SLOW", samples: 1 });
    // In the score: a stored typical result of another site is ignored.
    const wa = analysis(lab(7, 0, { measuredUrl: other }), { speedSmoothed: { category: "FAST", seconds: 1.5, samples: 3, measuredUrl: SITE } });
    expect(scoreBusiness({ ...scoringInput(), websiteAnalysis: wa }).checks.find((x) => x.id === "website.performance_mobile")!.earnedPoints).toBe(0);
  });

  test("the wording (EN + ES)", () => {
    expect(t("en", "content.checks.website.performance_mobile.explanation.resultTypicalV113", { result: "Average · about 3.9 seconds to show your page on a phone", count: 3 })).toBe(
      "Average · about 3.9 seconds to show your page on a phone, typical of your last 3 tests."
    );
    expect(t("es", "content.checks.website.performance_mobile.explanation.resultTypicalV113", { result: "Promedio", count: 3 })).toBe("Promedio, lo habitual en sus últimas 3 pruebas.");
  });
});
