// Step 2d: when may a stored screenshot be presented as "what customers
// see"? Never inspects the image itself — only stored facts.

import type { WebsiteAnalysis, WebsiteAnalysisPage } from "@/lib/scoring";

export const SCREENSHOT_STALE_AFTER_DAYS = 30;

export type ScreenshotFreshness =
  | { kind: "none" }
  | { kind: "current" }
  /** The latest scan couldn't load the site (blocked/timed out/down/
   * error) — the stored picture may no longer match it. */
  | { kind: "stale_unreachable"; capturedAt: string }
  /** Older than SCREENSHOT_STALE_AFTER_DAYS. */
  | { kind: "stale_old"; capturedAt: string }
  /** Step 2d: the Google listing's link is confirmed broken (a real
   * browser landed on an error page) and this recent capture is of that
   * same link — shown as what customers see when they click it, never as
   * the business's homepage. */
  | { kind: "listing_link_error"; capturedAt: string }
  /** Step 2d: the capture shows an error page the site served to our
   * AUTOMATED check (a 4xx/5xx capture, or a site that shows automated
   * browsers an error page — the real Wonder case) — never shown;
   * replaced by an honest "open it yourself" note. */
  | { kind: "automated_error_page" };

/** True when a capture's own stored HTTP status says the page answered
 * with an error (4xx/5xx) — such a capture is never shown. */
export function isErrorCapture(httpStatus: number | null | undefined): boolean {
  return typeof httpStatus === "number" && httpStatus >= 400;
}

/** True when a stored capture shows an error page our automated check
 * was served — unless the listing link is confirmed broken by our own
 * plain fetch, in which case that error page IS what customers see. */
export function captureShowsAutomatedErrorPage(analysis: WebsiteAnalysis | null): boolean {
  if (!analysis?.screenshotUrl) return false;
  const trust = analysis.websiteTrust;
  if (trust?.listingLinkBroken) return false;
  return isErrorCapture(analysis.screenshotHttpStatus) || !!trust?.automatedErrorPageUrl;
}

/** The homepage screenshot URL that may be shown at all (null when none,
 * when its stored status is an error, or when it shows an error page
 * served to our automated check). */
export function visibleHomepageScreenshot(analysis: WebsiteAnalysis | null): string | null {
  if (!analysis?.screenshotUrl || captureShowsAutomatedErrorPage(analysis)) return null;
  if (isErrorCapture(analysis.screenshotHttpStatus) && !analysis.websiteTrust?.listingLinkBroken) return null;
  return analysis.screenshotUrl;
}

/** Additional pages with any error-status capture hidden (shown as
 * "couldn't capture", never as the error page's picture). */
export function visibleAdditionalPages(analysis: WebsiteAnalysis | null): WebsiteAnalysisPage[] {
  return (analysis?.additionalPages ?? []).map((p) => (isErrorCapture(p.httpStatus) ? { ...p, screenshotUrl: null } : p));
}

export function screenshotFreshness(analysis: WebsiteAnalysis | null, now: Date = new Date()): ScreenshotFreshness {
  if (captureShowsAutomatedErrorPage(analysis)) return { kind: "automated_error_page" };
  if (!visibleHomepageScreenshot(analysis) || !analysis) return { kind: "none" };
  const capturedAt = analysis.lastScreenshotRefreshAt ?? analysis.checkedAt;
  const ageMs = now.getTime() - new Date(capturedAt).getTime();
  const isOld = ageMs > SCREENSHOT_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const trust = analysis.websiteTrust;
  if (!isOld && trust?.listingLinkBroken && trust.listingLinkErrorPageUrl) return { kind: "listing_link_error", capturedAt };
  if (analysis.contentFetchFailureReason) return { kind: "stale_unreachable", capturedAt };
  if (isOld) return { kind: "stale_old", capturedAt };
  return { kind: "current" };
}
