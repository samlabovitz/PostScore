import { afterEach, describe, expect, test, vi } from "vitest";
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
  aboutPresence: null,
  servicesPresence: null,
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

  // Step 2d: a screenshot older than SCREENSHOT_STALE_AFTER_DAYS (30) is
  // never captioned "what customers see", so the clock is pinned here —
  // a fixed capture date with a moving "now" would silently turn this
  // into the stale case once 30 real days passed.
  afterEach(() => {
    vi.useRealTimers();
  });

  test("a REAL screenshot: shows the 'what customers actually see' claim and the capture-date caption, since both are now true", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T00:00:00.000Z")); // 16 days after capture
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

  test("Step 2d: the same screenshot once it's more than 30 days old is still shown, but captioned as possibly out of date — never 'what customers see'", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T00:00:00.000Z")); // 35 days after capture
    const html = render({
      ...BASE_ANALYSIS,
      screenshotUrl: "https://example.com/real-screenshot.png",
      lastScreenshotRefreshAt: "2026-09-15T00:00:00.000Z",
    }).replace(/&#x27;/g, "'");
    expect(html).toContain("https://example.com/real-screenshot.png");
    expect(html).toContain("it's more than 30 days old, so it may be out of date.");
    expect(html).not.toContain("What customers actually see when they visit your live site");
  });
});

describe("Step 2d: stale screenshot caption", () => {
  const base: WebsiteAnalysis = {
    content: null,
    mobilePerformance: null,
    mobilePerformanceFailureReason: null,
    contentFetchFailureReason: "blocked_automated_check",
    httpsUnreachableReason: null,
    screenshotUrl: "https://x/shot.png",
    additionalPages: [],
    lastScreenshotRefreshAt: "2026-09-29T23:37:17Z",
    aboutPresence: null,
    servicesPresence: null,
    checkedAt: "2026-10-11T18:22:02Z",
  };
  function renderIn(locale: "en" | "es", analysis: WebsiteAnalysis) {
    return renderToStaticMarkup(
      <LocaleProvider locale={locale}>
        <WebsiteVisualAnalysis businessId="biz-1" websiteAnalysis={analysis} />
      </LocaleProvider>
    ).replace(/&#x27;/g, "'");
  }

  test("EN: the real Wonder case says the screenshot may be out of date, never 'what customers see'", () => {
    const html = renderIn("en", base);
    expect(html).toContain("Screenshot from Sep 29, 2026 — we couldn't load your site in our latest check, so it may be out of date.");
    expect(html).not.toContain("What customers actually see");
  });

  test("ES: usted copy", () => {
    expect(renderIn("es", base)).toContain("no pudimos cargar su sitio en nuestra última verificación");
  });

  test("a stored 404 capture isn't shown at all", () => {
    const html = renderIn("en", { ...base, contentFetchFailureReason: null, lastScreenshotRefreshAt: new Date().toISOString(), screenshotHttpStatus: 404 });
    expect(html).not.toContain("https://x/shot.png");
  });
});

describe("Step 2d correction: a capture of an automated-only error page", () => {
  test("isn't shown; the honest 'open it yourself' note is (EN + ES)", () => {
    const analysis: WebsiteAnalysis = {
      content: null,
      mobilePerformance: null,
      mobilePerformanceFailureReason: null,
      contentFetchFailureReason: "blocked_automated_check",
      httpsUnreachableReason: null,
      screenshotUrl: "https://x/shot.png",
      additionalPages: [],
      lastScreenshotRefreshAt: new Date().toISOString(),
      aboutPresence: null,
      servicesPresence: null,
      websiteTrust: { automatedErrorPageUrl: "https://www.wonder.com/order/404", listingLinkBroken: false } as unknown as WebsiteAnalysis["websiteTrust"],
      checkedAt: new Date().toISOString(),
    };
    const render = (locale: "en" | "es") =>
      renderToStaticMarkup(
        <LocaleProvider locale={locale}>
          <WebsiteVisualAnalysis businessId="biz-1" websiteAnalysis={analysis} siteUrl="https://www.wonder.com/order/thegrove" />
        </LocaleProvider>
      ).replace(/&#x27;/g, "'");
    const en = render("en");
    expect(en).not.toContain("https://x/shot.png");
    expect(en).toContain("We couldn't capture this page — the site showed our automated check an error page instead of what customers see. Open it yourself: https://www.wonder.com/order/thegrove");
    expect(render("es")).toContain("Ábrala usted mismo: https://www.wonder.com/order/thegrove");
  });
});
