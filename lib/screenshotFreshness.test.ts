import { describe, expect, test } from "vitest";
import { isErrorCapture, screenshotFreshness, visibleAdditionalPages, visibleHomepageScreenshot } from "./screenshotFreshness";
import type { WebsiteAnalysis } from "./scoring";

function analysis(partial: Partial<WebsiteAnalysis>): WebsiteAnalysis {
  return {
    content: null,
    mobilePerformance: null,
    mobilePerformanceFailureReason: null,
    contentFetchFailureReason: null,
    httpsUnreachableReason: null,
    screenshotUrl: "https://x/shot.png",
    additionalPages: [],
    lastScreenshotRefreshAt: "2026-10-10T00:00:00Z",
    aboutPresence: null,
    servicesPresence: null,
    checkedAt: "2026-10-11T00:00:00Z",
    ...partial,
  };
}
const NOW = new Date("2026-10-15T00:00:00Z");

describe("screenshotFreshness (Step 2d)", () => {
  test("a recent capture of a site that loaded is current", () => {
    expect(screenshotFreshness(analysis({}), NOW)).toEqual({ kind: "current" });
  });
  test("the real Wonder case: latest scan blocked -> stale_unreachable with the real capture date", () => {
    expect(
      screenshotFreshness(analysis({ contentFetchFailureReason: "blocked_automated_check", lastScreenshotRefreshAt: "2026-09-29T23:37:17Z" }), NOW)
    ).toEqual({ kind: "stale_unreachable", capturedAt: "2026-09-29T23:37:17Z" });
  });
  for (const reason of ["timed_out", "down", "http_error"] as const) {
    test(`${reason} also counts as couldn't load`, () => {
      expect(screenshotFreshness(analysis({ contentFetchFailureReason: reason }), NOW).kind).toBe("stale_unreachable");
    });
  }
  test("older than 30 days -> stale_old", () => {
    expect(screenshotFreshness(analysis({ lastScreenshotRefreshAt: "2026-09-01T00:00:00Z" }), NOW).kind).toBe("stale_old");
  });
  test("no screenshot -> none", () => {
    expect(screenshotFreshness(analysis({ screenshotUrl: null }), NOW)).toEqual({ kind: "none" });
  });
});

describe("error-status captures are hidden", () => {
  test("4xx/5xx homepage capture isn't shown", () => {
    expect(isErrorCapture(404)).toBe(true);
    expect(isErrorCapture(503)).toBe(true);
    expect(isErrorCapture(200)).toBe(false);
    expect(isErrorCapture(null)).toBe(false);
    expect(visibleHomepageScreenshot(analysis({ screenshotHttpStatus: 404 }))).toBeNull();
    expect(screenshotFreshness(analysis({ screenshotHttpStatus: 404 }), NOW)).toEqual({ kind: "automated_error_page" });
  });
  test("a 404 additional page shows as 'couldn't capture', never the error page's picture", () => {
    const pages = visibleAdditionalPages(
      analysis({
        additionalPages: [
          { label: "About", url: "u1", screenshotUrl: "a.png", httpStatus: 404 },
          { label: "Menu", url: "u2", screenshotUrl: "m.png", httpStatus: 200 },
        ],
      })
    );
    expect(pages[0].screenshotUrl).toBeNull();
    expect(pages[1].screenshotUrl).toBe("m.png");
  });
});

describe("listing link error (Step 2d, the Wonder case)", () => {
  const trust = { listingLinkBroken: true, listingLinkErrorPageUrl: "https://www.wonder.com/order/404" } as unknown as WebsiteAnalysis["websiteTrust"];
  test("a recent capture of a broken listing link is labeled as what customers see when they click it", () => {
    expect(
      screenshotFreshness(analysis({ websiteTrust: trust, contentFetchFailureReason: "blocked_automated_check", lastScreenshotRefreshAt: "2026-10-14T00:00:00Z" }), NOW)
    ).toEqual({ kind: "listing_link_error", capturedAt: "2026-10-14T00:00:00Z" });
  });
  test("an old capture still falls back to the stale rule", () => {
    expect(
      screenshotFreshness(analysis({ websiteTrust: trust, contentFetchFailureReason: "blocked_automated_check", lastScreenshotRefreshAt: "2026-09-01T00:00:00Z" }), NOW).kind
    ).toBe("stale_unreachable");
  });
});

describe("automated-only error page (Step 2d correction, the real Wonder case)", () => {
  const trust = { listingLinkBroken: false, automatedErrorPageUrl: "https://www.wonder.com/order/404" } as unknown as WebsiteAnalysis["websiteTrust"];
  test("a capture of a site that shows automated checks an error page is never shown", () => {
    const a = analysis({ websiteTrust: trust, lastScreenshotRefreshAt: "2026-10-14T00:00:00Z" });
    expect(screenshotFreshness(a, NOW)).toEqual({ kind: "automated_error_page" });
    expect(visibleHomepageScreenshot(a)).toBeNull();
  });
});
