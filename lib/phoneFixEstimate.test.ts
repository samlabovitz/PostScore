// M10 (code review, Nov 7): the "Works well on phones" estimate fixes only
// the phone layout — it never invents a speed result, so it can't also
// earn "Loads fast" points, and never changes which checks ran.
import { describe, expect, test } from "vitest";
import { applyCheckFix, getScoreWithSuggestions, scoreBusiness, type BusinessScoringInput, type WebsiteAnalysis } from "./scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";

const BASE = scoringInput();
const withSite = (wa: Partial<WebsiteAnalysis>): BusinessScoringInput => ({
  ...BASE,
  websiteAnalysis: { ...BASE.websiteAnalysis!, ...wa, content: { ...BASE.websiteAnalysis!.content!, hasViewportTag: false, ...(wa.content ?? {}) } },
});
const check = (input: BusinessScoringInput, id: string) => scoreBusiness(input, "en").checks.find((c) => c.id === id)!;

describe("the 'Works well on phones' fix estimate", () => {
  test("speed test produced nothing: the fix never fills in a speed result", () => {
    const input = withSite({ mobilePerformance: null, mobilePerformanceFailureReason: { kind: "timed_out", status: null } });
    expect(check(input, "website.performance_mobile").earnedPoints).toBeNull();
    const fixed = applyCheckFix(input, "website.mobile_friendly");
    expect(fixed.websiteAnalysis!.mobilePerformance).toBeNull();
    expect(check(fixed, "website.performance_mobile").earnedPoints).toBeNull();
    expect(check(fixed, "website.mobile_friendly").earnedPoints).toBe(check(fixed, "website.mobile_friendly").maxPoints);
  });

  test("the estimate is the phone fix alone — not ~5 website points for a 1-point fix", () => {
    const input = withSite({ mobilePerformance: null, mobilePerformanceFailureReason: { kind: "timed_out", status: null } });
    const phone = getScoreWithSuggestions(input, "en").suggestions.find((s) => s.checkId === "website.mobile_friendly")!;
    // Just the phone check's own share of the 0–100 total: its 1 point of
    // Website's 30, at Website's weight in the total (well under 2 points).
    expect(phone.weightedPoints).toBeGreaterThan(0);
    expect(phone.weightedPoints).toBeLessThan(2);
  });

  test("with a real speed result, only the phone checks that ran are marked passing (speed untouched)", () => {
    const measured = { method: "lab" as const, fieldCategory: null, labScore: 40, measuredAt: "2026-11-01T00:00:00Z", mobileUsability: { tapTargets: false, textReadable: null, fitsScreen: false } };
    const input = withSite({ mobilePerformance: measured });
    const fixed = applyCheckFix(input, "website.mobile_friendly");
    expect(fixed.websiteAnalysis!.mobilePerformance!.labScore).toBe(40);
    expect(fixed.websiteAnalysis!.mobilePerformance!.mobileUsability).toEqual({ tapTargets: true, textReadable: null, fitsScreen: true });
    expect(check(fixed, "website.performance_mobile").earnedPoints).toBe(check(input, "website.performance_mobile").earnedPoints);
    // Which checks ran doesn't change: the same 3 + 2 split before and after.
    expect(check(fixed, "website.mobile_friendly").maxPoints).toBe(check(input, "website.mobile_friendly").maxPoints);
  });

  test("no phone audits at all: the fix doesn't invent them (the 4 + 1 split stays)", () => {
    const measured = { method: "lab" as const, fieldCategory: null, labScore: 40, measuredAt: "2026-11-01T00:00:00Z" };
    const input = withSite({ mobilePerformance: measured, content: { ...BASE.websiteAnalysis!.content!, hasViewportTag: false, phoneLayout: undefined } });
    const fixed = applyCheckFix(input, "website.mobile_friendly");
    expect(fixed.websiteAnalysis!.mobilePerformance!.mobileUsability).toBeUndefined();
    expect(check(fixed, "website.mobile_friendly").maxPoints).toBe(check(input, "website.mobile_friendly").maxPoints);
    expect(check(fixed, "website.performance_mobile").maxPoints).toBe(check(input, "website.performance_mobile").maxPoints);
  });
});
