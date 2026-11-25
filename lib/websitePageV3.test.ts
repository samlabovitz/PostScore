// Day 25B: the Website page — whole points in the fix line, re-check 2 a day beside "Refresh screenshots",
// one number on the score card, framed thumbnails (and a phone one) with a viewer.
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { websiteFixWords } from "@/lib/fixPlan";
import { WEBSITE_RECHECKS_PER_DAY } from "@/lib/websiteRecheckPolicy";
import { t, tPlural } from "@/lib/i18n";

describe("the fix line in whole points, like the title", () => {
  test("'Fix this 1 and your Website gets its last point (score 78 → 79)' — never '29.4 → 29.9'", () => {
    const w = websiteFixWords({ count: 1, to: 29.9, score: 78, after: 79 }, { earned: 29, of: 30 });
    expect(w).toEqual({ kind: "last", count: 1, points: 1, score: 78, after: 79 });
    expect(tPlural("en", "dashboard.fixPlan.websiteWhole.lastOne", 1, { count: 1, points: 1, score: 78, after: 79 })).toBe("Fix this 1 and your Website gets its last point (score 78 → 79).");
    expect(tPlural("es", "dashboard.fixPlan.websiteWhole.lastOne", 1, { count: 1, points: 1, score: 78, after: 79 })).toBe("Arregle esta 1 y su sitio web obtiene su último punto (puntuación 78 → 79).");
  });
  test("a step on the way: 'goes 22 → 27 / 30'; less than a whole point: no number claimed", () => {
    expect(websiteFixWords({ count: 7, to: 27.2, score: 86, after: 91 }, { earned: 22, of: 30 })).toMatchObject({ kind: "goes", from: 22, to: 27, of: 30 });
    expect(websiteFixWords({ count: 7, to: 21.5, score: 86, after: 86 }, { earned: 22, of: 30 })).toEqual({ kind: "small", count: 7 });
    expect(tPlural("en", "dashboard.fixPlan.websiteWhole.small", 7, { count: 7 })).toBe("Fix these 7 small things on your Website.");
    expect(readFileSync("app/business/[id]/website/page.tsx", "utf8")).not.toContain("dashboard.fixPlan.websiteSummary\", fixLine.summary.count");
  });
});

describe("re-check: 2 a day, beside 'Refresh screenshots'", () => {
  test("the limit and its counter", () => {
    expect(WEBSITE_RECHECKS_PER_DAY).toBe(2);
    expect(t("en", "dashboard.websiteRecheck.left", { left: 1, total: WEBSITE_RECHECKS_PER_DAY })).toBe("1 of 2 left today");
    const shots = readFileSync("app/business/[id]/website/WebsiteVisualAnalysis.tsx", "utf8");
    expect(shots).toContain('data-testid="website-top-actions"');
    expect(shots.indexOf("<RefreshScreenshotsControl")).toBeLessThan(shots.indexOf("{recheck}"));
  });
});

describe("screenshots: framed thumbnails and a phone one, a viewer, no 'See 3 more pages'", () => {
  test("Home + the pages found (up to 4 frames), each fading at the bottom; the phone frame when captured", () => {
    const shots = readFileSync("app/business/[id]/website/WebsiteVisualAnalysis.tsx", "utf8");
    expect(shots).toContain("additionalPages.slice(0, 3)");
    expect(shots).toContain("bg-gradient-to-t from-white to-transparent");
    expect(shots).toContain('data-testid="website-thumb-phone"');
    expect(shots).toContain("snap-x gap-3 overflow-x-auto");
    expect(shots).not.toContain("seeMorePages");
    expect(shots).toContain('data-testid="screenshot-viewer-scroll"');
  });
  test("the phone capture: one more call at 390 × 844 with the screenshots, counted, stored and signed", () => {
    const a = readFileSync("lib/websiteAnalysis.ts", "utf8");
    expect(a).toContain("captureScreenshot(website, screenshotApiKey, fetchImpl, { width: 390, height: 844 })");
    expect(a).toContain("calls: screenshotApiKey ? 2 + additionalPages.length : 0");
    expect(readFileSync("lib/websiteScreenshotUpload.ts", "utf8")).toContain("`${businessId}/phone.png`");
    expect(readFileSync("lib/screenshotStorage.server.ts", "utf8")).toContain("analysis.mobileScreenshotUrl");
  });
});
