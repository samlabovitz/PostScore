import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";

// Each business's own monthly ScreenshotOne allowance, by plan (Nov 10):
// Free 5 calls (about one capture), Grow/Premium/Multi 10 (about two),
// counted across every path. Pure — no ScreenshotOne call.

import {
  autoCaptureAllowed,
  businessScreenshotCallsThisMonth,
  canCaptureForBusiness,
  nextBusinessCaptureAt,
  nextCaptureLog,
  SCREENSHOT_CALLS_PER_BUSINESS,
} from "@/lib/screenshotBudget";
import type { WebsiteAnalysis } from "@/lib/scoring";

const NOW = new Date("2026-11-09T12:00:00Z");
const withLog = (calls: number, at = "2026-11-02T00:00:00Z", extra: Partial<WebsiteAnalysis> = {}) =>
  ({ screenshotUrl: "x", additionalPages: [], lastScreenshotRefreshAt: at, checkedAt: at, screenshotCaptureLog: { at, calls, source: "manual" }, ...extra }) as unknown as WebsiteAnalysis;

describe("the allowance", () => {
  test("by plan", () => {
    expect(SCREENSHOT_CALLS_PER_BUSINESS).toEqual({ free: 5, grow: 10, premium: 10, multi: 10 });
  });

  test("Free: the first capture fits (worst case 5), then nothing until next month", () => {
    expect(canCaptureForBusiness(null, "free", NOW)).toBe(true);
    expect(canCaptureForBusiness(withLog(1), "free", NOW)).toBe(false);
    expect(canCaptureForBusiness(withLog(5, "2026-10-31T23:00:00Z"), "free", NOW)).toBe(true);
  });

  test("Grow/Premium/Multi: two worst-case captures", () => {
    for (const plan of ["grow", "premium", "multi"] as const) {
      expect(canCaptureForBusiness(withLog(5), plan, NOW)).toBe(true);
      expect(canCaptureForBusiness(withLog(6), plan, NOW)).toBe(false);
    }
  });

  test("the next one: the 1st of next month", () => {
    expect(nextBusinessCaptureAt(NOW)).toBe("2026-12-01T00:00:00.000Z");
    expect(nextBusinessCaptureAt(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01T00:00:00.000Z");
  });

  test("the log adds up this month's captures, and starts over in a new month", () => {
    expect(nextCaptureLog({ at: "2026-11-02T00:00:00Z", calls: 3, source: "auto" }, 2, "manual", NOW)).toEqual({ at: NOW.toISOString(), calls: 5, source: "manual" });
    expect(nextCaptureLog({ at: "2026-10-30T00:00:00Z", calls: 5, source: "auto" }, 2, "site_change", NOW)).toMatchObject({ calls: 2 });
    expect(nextCaptureLog(null, 4, "auto", NOW)).toMatchObject({ calls: 4 });
    expect(businessScreenshotCallsThisMonth(withLog(7), NOW)).toBe(7);
  });

  test("automatic capture (adding a business, re-scans, the monthly job, rescan-all): first-ever only, within the business allowance and the account cap", () => {
    expect(autoCaptureAllowed(null, "free", 0, 80, NOW)).toBe(true);
    expect(autoCaptureAllowed(null, "free", 76, 80, NOW)).toBe(false);
    // Already captured (or tried): never automatically again.
    expect(autoCaptureAllowed(withLog(0), "premium", 0, 80, NOW)).toBe(false);
    // A business with no screenshot that already used its month (e.g. a capture that came back empty).
    expect(autoCaptureAllowed({ screenshotUrl: null, lastScreenshotRefreshAt: null, screenshotCaptureLog: { at: "2026-11-02T00:00:00Z", calls: 5, source: "manual" } } as unknown as WebsiteAnalysis, "free", 0, 80, NOW)).toBe(false);
  });
});

describe("every path checks it before ScreenshotOne", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  test("the scan (adding a business, Re-scan now, the monthly job, rescan-all, website-only)", () => {
    expect(src("lib/websiteAnalysisForSave.ts")).toContain("autoCaptureAllowed(parseWebsiteAnalysis(existingAnalysisJson ?? null), plan,");
    expect(src("scripts/rescan-all.ts")).toContain("canCaptureForBusiness(analysis, backgroundPlan(");
  });
  test("Refresh screenshots and “Wrong site?” (the shared core)", () => {
    const core = src("lib/websiteScreenshotRefresh.server.ts");
    expect(core.indexOf("canCaptureForBusiness(existing")).toBeLessThan(core.indexOf("captureWebsiteScreenshots(siteUrl"));
    expect(core).toContain('return { status: "business_limit", nextAvailableAt: nextBusinessCaptureAt(now) };');
  });
  test("a regular re-scan keeps the capture log (it used to drop it, resetting the monthly counts)", () => {
    expect(src("lib/websiteAnalysisForSave.ts")).toContain("...(existingAnalysis?.screenshotCaptureLog ? { screenshotCaptureLog: existingAnalysis.screenshotCaptureLog } : {}),");
    expect(src("app/actions/businesses.ts")).toContain('screenshotCaptureLog: nextCaptureLog(websiteAnalysis.screenshotCaptureLog, analysis?.screenshotCalls ?? 0, "auto",');
  });
});
