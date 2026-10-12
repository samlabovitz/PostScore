import { describe, expect, test } from "vitest";
import {
  canAutoCapture,
  DEFAULT_SCREENSHOT_AUTO_MONTHLY_CAP,
  MAX_SCREENSHOT_CALLS_PER_CAPTURE,
  needsAutoScreenshot,
  screenshotAutoMonthlyCap,
  screenshotCallsThisMonth,
} from "./screenshotBudget";
import type { WebsiteAnalysis } from "./scoring";

function analysis(partial: Partial<WebsiteAnalysis>): WebsiteAnalysis {
  return {
    content: null,
    mobilePerformance: null,
    mobilePerformanceFailureReason: null,
    contentFetchFailureReason: null,
    httpsUnreachableReason: null,
    screenshotUrl: null,
    additionalPages: [],
    lastScreenshotRefreshAt: null,
    aboutPresence: null,
    servicesPresence: null,
    checkedAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}
const NOW = new Date("2026-10-15T12:00:00Z");

describe("needsAutoScreenshot", () => {
  test("only when there's no screenshot and no attempt was ever made", () => {
    expect(needsAutoScreenshot(null)).toBe(true);
    expect(needsAutoScreenshot(analysis({}))).toBe(true);
  });
  test("never recaptures just because a screenshot is old", () => {
    expect(needsAutoScreenshot(analysis({ screenshotUrl: "x.png", lastScreenshotRefreshAt: "2025-01-01T00:00:00Z" }))).toBe(false);
  });
  test("a past failed attempt isn't retried automatically", () => {
    expect(needsAutoScreenshot(analysis({ screenshotUrl: null, lastScreenshotRefreshAt: "2026-09-29T00:00:00Z" }))).toBe(false);
  });
});

describe("monthly cap", () => {
  test("defaults to 80 and is configurable", () => {
    expect(screenshotAutoMonthlyCap({})).toBe(DEFAULT_SCREENSHOT_AUTO_MONTHLY_CAP);
    expect(DEFAULT_SCREENSHOT_AUTO_MONTHLY_CAP).toBe(80);
    expect(screenshotAutoMonthlyCap({ SCREENSHOT_AUTO_MONTHLY_CAP: "40" })).toBe(40);
    expect(screenshotAutoMonthlyCap({ SCREENSHOT_AUTO_MONTHLY_CAP: "nonsense" })).toBe(80);
  });
  test("counts this month's real calls — auto AND manual — and legacy captures by homepage + pages", () => {
    const used = screenshotCallsThisMonth(
      [
        analysis({ screenshotCaptureLog: { at: "2026-10-02T00:00:00Z", calls: 5, source: "auto" } }),
        analysis({ screenshotCaptureLog: { at: "2026-10-03T00:00:00Z", calls: 3, source: "manual" } }),
        analysis({ screenshotCaptureLog: { at: "2026-09-30T23:00:00Z", calls: 5, source: "auto" } }),
        analysis({ lastScreenshotRefreshAt: "2026-10-05T00:00:00Z", additionalPages: [{ label: "About", url: "u", screenshotUrl: null }] }),
        null,
      ],
      NOW
    );
    expect(used).toBe(5 + 3 + 2);
  });
  test("a capture reserves its worst case before running", () => {
    expect(MAX_SCREENSHOT_CALLS_PER_CAPTURE).toBe(5);
    expect(canAutoCapture(75, 80)).toBe(true);
    expect(canAutoCapture(76, 80)).toBe(false);
    expect(canAutoCapture(Number.POSITIVE_INFINITY, 80)).toBe(false);
  });
});
