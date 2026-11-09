// Step 2d: when may a stored screenshot be presented as "what customers
// see"? Never inspects the image itself — only stored facts.

import type { WebsiteAnalysis, WebsiteAnalysisPage } from "@/lib/scoring";
import type { WebsiteSource } from "@/lib/businessWebsite";
import { sameWebsiteLink } from "@/lib/gbpWebsiteLink";

/** The site PostScore grades (lib/businessWebsite.ts gradedWebsite), and
 * whether the Google listing's own link is parked or broken. */
export interface GradedSite {
  url: string;
  source: WebsiteSource;
  listingBroken: boolean;
}

export const SCREENSHOT_STALE_AFTER_DAYS = 30;

export type ScreenshotFreshness =
  | { kind: "none" }
  | { kind: "current" }
  /** The latest scan couldn't load the site (blocked/timed out/down/
   * error) — the stored picture may no longer match it. */
  | { kind: "stale_unreachable"; capturedAt: string }
  /** Older than SCREENSHOT_STALE_AFTER_DAYS. */
  | { kind: "stale_old"; capturedAt: string }
  /** The site we'd grade is the Google listing's link, and it's parked or
   * broken: a capture of it is never shown as "what customers see" — the
   * Website page shows a warning card with the fix instead. (A parked
   * domain can show automated browsers a page people never see.) */
  | { kind: "broken_listing" }
  /** The stored capture is of a different site than the one graded now
   * (the owner or PostScore changed it since) — never shown as theirs. */
  | { kind: "other_site"; capturedAt: string; siteUrl: string }
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
 * was served. */
export function captureShowsAutomatedErrorPage(analysis: WebsiteAnalysis | null): boolean {
  if (!analysis?.screenshotUrl) return false;
  return isErrorCapture(analysis.screenshotHttpStatus) || !!analysis.websiteTrust?.automatedErrorPageUrl;
}

/** The homepage screenshot URL that may be shown at all (null when none,
 * when its stored status is an error, or when it shows an error page
 * served to our automated check). */
export function visibleHomepageScreenshot(analysis: WebsiteAnalysis | null): string | null {
  if (!analysis?.screenshotUrl || captureShowsAutomatedErrorPage(analysis)) return null;
  return analysis.screenshotUrl;
}

/** Additional pages with any error-status capture hidden (shown as
 * "couldn't capture", never as the error page's picture). */
export function visibleAdditionalPages(analysis: WebsiteAnalysis | null): WebsiteAnalysisPage[] {
  return (analysis?.additionalPages ?? []).map((p) => (isErrorCapture(p.httpStatus) ? { ...p, screenshotUrl: null } : p));
}

export function screenshotFreshness(analysis: WebsiteAnalysis | null, now: Date = new Date(), site: GradedSite | null = null): ScreenshotFreshness {
  // The listing's own link is the site, and it's parked or broken: never a picture of it.
  if (site?.source === "listing" && site.listingBroken) return { kind: "broken_listing" };
  if (captureShowsAutomatedErrorPage(analysis)) return { kind: "automated_error_page" };
  if (!visibleHomepageScreenshot(analysis) || !analysis) return { kind: "none" };
  const capturedAt = analysis.lastScreenshotRefreshAt ?? analysis.checkedAt;
  // Captured before the site changed. (Captures from before Nov 9 don't
  // say which site they are; they were of the site graded at the time.)
  if (site && analysis.screenshotSiteUrl && !sameWebsiteLink(analysis.screenshotSiteUrl, site.url)) return { kind: "other_site", capturedAt, siteUrl: analysis.screenshotSiteUrl };
  const ageMs = now.getTime() - new Date(capturedAt).getTime();
  const isOld = ageMs > SCREENSHOT_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  if (analysis.contentFetchFailureReason) return { kind: "stale_unreachable", capturedAt };
  if (isOld) return { kind: "stale_old", capturedAt };
  return { kind: "current" };
}
