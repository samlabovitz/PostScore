import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import type { WebsiteAnalysis } from "@/lib/scoring";

// app/actions/websiteScreenshots.ts transitively imports
// lib/websiteScreenshotUpload.ts's top-level `import "server-only"`
// guard, which hard-throws outside Next's own server build/runtime —
// same established workaround as elsewhere in this codebase.
vi.mock("@/app/actions/websiteScreenshots", () => ({ refreshWebsiteScreenshots: vi.fn() }));
// RefreshScreenshotsControl calls useRouter() for its post-refresh
// router.refresh() — renderToStaticMarkup has no real app-router
// context to provide one, so stub it the same way any plain SSR render
// of a client component needs to.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { WebsiteVisualAnalysis } from "./WebsiteVisualAnalysis";

function render(websiteAnalysis: WebsiteAnalysis | null) {
  return renderToStaticMarkup(
    <LocaleProvider locale="en">
      <WebsiteVisualAnalysis businessId="biz-1" websiteAnalysis={websiteAnalysis} />
    </LocaleProvider>
  );
}

const BASE_ANALYSIS: WebsiteAnalysis = {
  content: null,
  mobilePerformance: null,
  mobilePerformanceFailureReason: null,
  contentFetchFailureReason: null,
  httpsUnreachableReason: null,
  screenshotUrl: null,
  additionalPages: [],
  lastScreenshotRefreshAt: null,
  hasAboutPage: false,
  hasServicesPage: false,
  checkedAt: "2026-10-01T00:00:00.000Z",
};

describe("WebsiteVisualAnalysis — Day 4 Part 2c: honest empty state when no screenshot exists", () => {
  test("no screenshot: shows the honest 'no screenshot captured yet' state, never a broken image", () => {
    const html = render(BASE_ANALYSIS);
    expect(html).toContain("No screenshot captured yet.");
    expect(html).not.toContain("<img");
  });

  test("no screenshot: never shows the 'what customers actually see' claim — nothing backs it up", () => {
    const html = render(BASE_ANALYSIS);
    expect(html).not.toContain("What customers actually see when they visit your live site");
  });

  test("no screenshot: never shows a 'Screenshots captured {date}' caption either — there's no real date to report", () => {
    const html = render(BASE_ANALYSIS);
    expect(html).not.toContain("Screenshots captured");
  });

  test("null websiteAnalysis (no website at all, or never scanned): same honest empty state, no crash", () => {
    const html = render(null);
    expect(html).toContain("No screenshot captured yet.");
    expect(html).not.toContain("What customers actually see");
  });

  test("a REAL screenshot: shows the 'what customers actually see' claim and the capture-date caption, since both are now true", () => {
    const html = render({
      ...BASE_ANALYSIS,
      screenshotUrl: "https://example.com/real-screenshot.png",
      lastScreenshotRefreshAt: "2026-09-15T00:00:00.000Z",
    });
    expect(html).toContain("What customers actually see when they visit your live site");
    expect(html).toContain("Screenshots captured");
    expect(html).toContain("https://example.com/real-screenshot.png");
    expect(html).not.toContain("No screenshot captured yet.");
  });
});
