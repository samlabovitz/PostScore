// The website half of a scan, shared by the owner's own save/re-scan
// (app/actions/businesses.ts) and competitor full scoring
// (lib/competitorFullScoring.ts) — so both are analyzed exactly the same
// way. Competitors pass skipScreenshots and allowBrowserRenders: false.

import { canAutoCapture, needsAutoScreenshot, screenshotAutoMonthlyCap } from "@/lib/screenshotBudget";
import { loadBrowserRendersThisMonth, loadScreenshotCallsThisMonth } from "@/lib/screenshotBudgetServer";
import { browserRenderMonthlyCap, currentRenderMonth, rendersAllowedThisScan } from "@/lib/browserRender";
import type { PlaceDetails } from "@/lib/google/places";
import { checkWebsiteHttps } from "@/lib/websiteHttps";
import { collectWebsiteAnalysis } from "@/lib/websiteAnalysis";
import { carryForwardMobilePerformance, parseWebsiteAnalysis, type WebsiteAnalysis } from "@/lib/scoring";

/**
 * The website half of a save (Day 2b: shared by a normal Google-listing
 * save and the website-only mode, so both analyze a site the same way):
 * screenshot/render budgets, HTTPS, the full website analysis, and the
 * saved WebsiteAnalysis. `listingWebsite` is the Google listing's own
 * URL (null in website-only mode) — only it can be marked a broken link.
 */
export async function analyzeWebsiteForSave(params: {
  analysisUrl: string | null;
  listingWebsite: string | null;
  existingAnalysisJson: unknown;
  skipScreenshots: boolean;
  extraServicesKeywords: string[];
  listingFacts: { phone: string | null; address: string | null; openingHoursPeriods: PlaceDetails["openingHoursPeriods"] };
  /** false for competitors: never a Browserless render (default true). */
  allowBrowserRenders?: boolean;
  /** For counting PageSpeed calls (competitor scoring); defaults to fetch. */
  fetchImpl?: typeof fetch;
}) {
  const { analysisUrl, listingWebsite, existingAnalysisJson, skipScreenshots, extraServicesKeywords, listingFacts } = params;
  const fetchImpl = params.fetchImpl ?? fetch;
  const existingAnalysis = analysisUrl ? parseWebsiteAnalysis(existingAnalysisJson ?? null) : null;
  // Step 2d (see lib/screenshotBudget.ts): capture automatically only
  // when this business has no screenshot and none was ever attempted —
  // never because one is old — and only while this month's real
  // ScreenshotOne usage leaves room under the cap. When skipped, the
  // honest "no screenshot captured yet" state simply stays.
  let captureScreenshots = !skipScreenshots && !!analysisUrl && needsAutoScreenshot(existingAnalysis);
  if (captureScreenshots) {
    captureScreenshots = canAutoCapture(await loadScreenshotCallsThisMonth(), screenshotAutoMonthlyCap());
  }

  // Step 2g: Browserless renders this scan may use — only with a key, and
  // only while this month's real renders (all businesses) leave room
  // under the cap. Whether a render actually happens is decided inside
  // collectWebsiteAnalysis (JavaScript-only, reachable pages only).
  const browserlessApiKey = process.env.BROWSERLESS_API_KEY || undefined;
  const maxBrowserRenders =
    params.allowBrowserRenders !== false && browserlessApiKey && analysisUrl
      ? rendersAllowedThisScan(await loadBrowserRendersThisMonth(), browserRenderMonthlyCap())
      : 0;

  const [httpsResult, analysis] = await Promise.all([
    analysisUrl ? checkWebsiteHttps(analysisUrl) : Promise.resolve(null),
    analysisUrl
      ? collectWebsiteAnalysis(
          analysisUrl,
          {
            pageSpeedApiKey: process.env.PAGESPEED_API_KEY,
            screenshotApiKey: process.env.SCREENSHOT_API_KEY,
            safeBrowsingApiKey: process.env.GOOGLE_SAFE_BROWSING_API_KEY,
            browserlessApiKey,
          },
          { captureScreenshots, maxBrowserRenders, extraServicesKeywords },
          listingFacts,
          fetchImpl
        )
      : Promise.resolve(null),
  ]);
  const httpsStatus = httpsResult?.status ?? null;

  // Only ever reuses a real PRIOR measurement when THIS scan's own
  // PageSpeed attempt specifically timed out and that prior measurement
  // is recent enough — see carryForwardMobilePerformance's own doc
  // (lib/scoring.ts) for the real Blue Bottle Coffee case this fixes.
  // Never applies when there's no website analysis at all (analysis is
  // null) — existingAnalysis itself is also null in that case.
  const { mobilePerformance, mobilePerformanceFailureReason } = analysis
    ? carryForwardMobilePerformance(
        analysis.mobilePerformance,
        analysis.mobilePerformanceFailureReason,
        existingAnalysis?.mobilePerformance
      )
    : { mobilePerformance: null, mobilePerformanceFailureReason: null };

  // Step 2d (corrected after the real Wonder case): a soft 404 seen only
  // by PageSpeed's automated Chrome NEVER marks the Google listing link
  // broken — sites like Wonder show automated browsers an error page
  // while real people get the real page. It's recorded only as "this
  // site shows automated checks an error page" (couldn't check).
  // The ONE way our plain fetch marks the listing link broken (Step 2d):
  // the listing's own URL answered a genuine 404 or 410. Never 403/429/
  // 503 or any bot-challenge signal — those stay "couldn't check".
  const listingLinkMissing =
    !!analysis?.contentFetchMissingPageStatus && !!listingWebsite && analysisUrl === listingWebsite;
  const websiteTrustForSave = analysis
    ? {
        ...analysis.websiteTrust,
        ...(analysis.pageSpeedSoftNotFoundUrl ? { automatedErrorPageUrl: analysis.pageSpeedSoftNotFoundUrl } : {}),
        ...(listingLinkMissing ? { listingLinkBroken: true, listingLinkErrorPageUrl: listingWebsite } : {}),
      }
    : null;

  // Step 2g: record this month's real renders for this business (added to
  // any earlier renders this same month), and whether the findings were
  // read from the page as a browser shows it.
  const renderMonth = currentRenderMonth();
  const priorRenders = existingAnalysis?.browserRenderLog?.month === renderMonth ? existingAnalysis.browserRenderLog.renders : 0;
  const browserReadFields = {
    ...(analysis && analysis.readViaBrowserChecks.length > 0 ? { readViaBrowserChecks: analysis.readViaBrowserChecks } : {}),
    ...(analysis && (analysis.browserRenders > 0 || priorRenders > 0)
      ? { browserRenderLog: { month: renderMonth, renders: priorRenders + analysis.browserRenders } }
      : {}),
  };

  const checkedAt = new Date().toISOString();
  const websiteAnalysis: WebsiteAnalysis | null = analysis
    ? captureScreenshots
      ? {
          content: analysis.content,
          mobilePerformance,
          mobilePerformanceFailureReason,
          contentFetchFailureReason: analysis.contentFetchFailureReason,
          httpsUnreachableReason: httpsResult?.reason ?? null,
          screenshotUrl: null, // filled in by the follow-up update below
          additionalPages: [], // filled in by the follow-up update below
          lastScreenshotRefreshAt: null, // filled in by the follow-up update below, once the capture attempt lands
          // Real detection (Day 4 Step 2c) — see collectWebsiteAnalysis's
          // own detectPagePresence. Always fresh, same as content above:
          // unlike screenshots, this costs at most 2 extra, unbilled page
          // fetches, so there's no reason to ever carry it forward stale.
          aboutPresence: analysis.aboutPresence,
          servicesPresence: analysis.servicesPresence,
          // Real site-trust signals (Oct 10) — same "always fresh" reasoning
          // as aboutPresence/servicesPresence above.
          websiteTrust: websiteTrustForSave ?? analysis.websiteTrust,
          ...browserReadFields,
          builder: analysis.builder,
          checkedAt,
        }
      : {
          content: analysis.content,
          mobilePerformance,
          mobilePerformanceFailureReason,
          contentFetchFailureReason: analysis.contentFetchFailureReason,
          httpsUnreachableReason: httpsResult?.reason ?? null,
          // Regular re-scan: reuse whatever's already stored rather than
          // spending another ScreenshotOne call — see captureScreenshots above.
          screenshotUrl: existingAnalysis?.screenshotUrl ?? null,
          additionalPages: existingAnalysis?.additionalPages ?? [],
          lastScreenshotRefreshAt: existingAnalysis?.lastScreenshotRefreshAt ?? null,
          // Same real detection, freshly re-run on every regular re-scan
          // too — see the first branch's own comment above.
          aboutPresence: analysis.aboutPresence,
          servicesPresence: analysis.servicesPresence,
          websiteTrust: websiteTrustForSave ?? analysis.websiteTrust,
          ...browserReadFields,
          builder: analysis.builder,
          checkedAt,
        }
    : null;

  return { websiteAnalysis, httpsStatus, checkedAt, captureScreenshots, analysis };
}
