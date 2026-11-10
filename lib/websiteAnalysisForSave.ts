// The website half of a scan, shared by the owner's own save/re-scan
// (app/actions/businesses.ts) and competitor full scoring
// (lib/competitorFullScoring.ts) — so both are analyzed exactly the same
// way. Competitors pass skipScreenshots and allowBrowserRenders: false.

import { autoCaptureAllowed, canCaptureForBusiness, needsAutoScreenshot, screenshotAutoMonthlyCap } from "@/lib/screenshotBudget";
import type { Plan } from "@/lib/plan";
import { loadBrowserRendersThisMonth, loadScreenshotCallsThisMonth } from "@/lib/screenshotBudgetServer";
import { browserRenderMonthlyCap, currentRenderMonth, rendersAllowedThisScan } from "@/lib/browserRender";
import type { PlaceDetails } from "@/lib/google/places";
import { checkWebsiteHttps } from "@/lib/websiteHttps";
import { collectWebsiteAnalysis } from "@/lib/websiteAnalysis";
import { carryForwardMobilePerformance, parseWebsiteAnalysis, sameMeasuredSite, type MobilePerformanceMeasurement, type WebsiteAnalysis } from "@/lib/scoring";
import { nextSpeedHistory, sampleCategory, sampleFrom, smoothSpeed, type SpeedSample, type SpeedSmoothed } from "@/lib/speedSmoothing";

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
  /** false for competitors: no homepage link check (scoring 1.15.0 — default true). */
  checkLinks?: boolean;
  /** For counting PageSpeed calls (competitor scoring); defaults to fetch. */
  fetchImpl?: typeof fetch;
  /** The owner's plan, for the business's own monthly screenshot allowance
   * (lib/screenshotBudget.ts rule 4). Default: getPlan() — the request's
   * plan, or the background plan in the monthly job and scripts. */
  plan?: Plan;
}) {
  const { analysisUrl, listingWebsite, existingAnalysisJson, skipScreenshots, extraServicesKeywords, listingFacts } = params;
  const fetchImpl = params.fetchImpl ?? fetch;
  const existingAnalysis = analysisUrl ? parseWebsiteAnalysis(existingAnalysisJson ?? null) : null;
  // Step 2d (see lib/screenshotBudget.ts): capture automatically only
  // when this business has no screenshot and none was ever attempted —
  // never because one is old — and only while this month's real
  // ScreenshotOne usage leaves room under the cap. When skipped, the
  // honest "no screenshot captured yet" state simply stays.
  // The business's own monthly allowance by plan (rule 4) comes first,
  // then the account-wide cap — both before ScreenshotOne is called.
  let captureScreenshots = !skipScreenshots && !!analysisUrl && needsAutoScreenshot(existingAnalysis);
  if (captureScreenshots) {
    const plan = params.plan ?? (await (await import("@/lib/premium")).getPlan());
    captureScreenshots =
      canCaptureForBusiness(parseWebsiteAnalysis(existingAnalysisJson ?? null), plan) &&
      autoCaptureAllowed(parseWebsiteAnalysis(existingAnalysisJson ?? null), plan, await loadScreenshotCallsThisMonth(), screenshotAutoMonthlyCap());
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
          { captureScreenshots, maxBrowserRenders, extraServicesKeywords, checkLinks: params.checkLinks !== false },
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
        existingAnalysis?.mobilePerformance,
        new Date(),
        // Only a past measurement of THIS site (lib/scoring.ts sameMeasuredSite).
        analysisUrl
      )
    : { mobilePerformance: null, mobilePerformanceFailureReason: null };

  // "Loads fast", steadied (lib/speedSmoothing.ts): this site's last 3
  // successful measurements within 30 days, and their typical result —
  // the median, kept in its band unless a line is crossed by more than
  // 0.3 s. Before any history exists, the last saved measurement starts it.
  const speed = analysis ? speedForSave(analysis.mobilePerformance, existingAnalysis, analysisUrl) : null;

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
  // v1.13.1: the listing's own URL is a domain company's parking / "coming
  // soon" page — the link is broken (and nothing on it is the business's).
  const listingLinkParked = !!analysis?.content?.parkedDomain && !!listingWebsite && analysisUrl === listingWebsite;
  const websiteTrustForSave = analysis
    ? {
        ...analysis.websiteTrust,
        ...(analysis.pageSpeedSoftNotFoundUrl ? { automatedErrorPageUrl: analysis.pageSpeedSoftNotFoundUrl } : {}),
        ...(listingLinkMissing ? { listingLinkBroken: true, listingLinkErrorPageUrl: listingWebsite } : {}),
        ...(listingLinkParked ? { listingLinkBroken: true, listingLinkErrorPageUrl: listingWebsite, listingLinkParked: true } : {}),
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
          ...(speed ? speed : {}),
          ...(analysis.linkCheck ? { linkCheck: analysis.linkCheck } : {}),
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
          ...(speed ? speed : {}),
          ...(analysis.linkCheck ? { linkCheck: analysis.linkCheck } : {}),
          mobilePerformanceFailureReason,
          contentFetchFailureReason: analysis.contentFetchFailureReason,
          httpsUnreachableReason: httpsResult?.reason ?? null,
          // Regular re-scan: reuse whatever's already stored rather than
          // spending another ScreenshotOne call — see captureScreenshots above.
          screenshotUrl: existingAnalysis?.screenshotUrl ?? null,
          additionalPages: existingAnalysis?.additionalPages ?? [],
          lastScreenshotRefreshAt: existingAnalysis?.lastScreenshotRefreshAt ?? null,
          // The stored capture's facts stay with it — above all its log,
          // which the monthly ScreenshotOne counts (account and business)
          // read: dropping it let a re-scan reset them.
          ...(existingAnalysis?.screenshotHttpStatus != null ? { screenshotHttpStatus: existingAnalysis.screenshotHttpStatus } : {}),
          ...(existingAnalysis?.screenshotSiteUrl ? { screenshotSiteUrl: existingAnalysis.screenshotSiteUrl } : {}),
          ...(existingAnalysis?.screenshotCaptureLog ? { screenshotCaptureLog: existingAnalysis.screenshotCaptureLog } : {}),
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

/**
 * The Google listing's own link, when PostScore grades a different site
 * (the owner's confirmed one, or a verified one): one plain fetch — no
 * PageSpeed, no screenshot — enough to know whether customers who tap
 * "Website" reach a parked page or a 404/410 (the same two signals a full
 * scan of the listing link would use). A block, a timeout or any other
 * error proves nothing, so it's never "broken".
 */
export async function probeListingLink(listingWebsite: string, fetchImpl: typeof fetch = fetch): Promise<{ broken: boolean; parked: boolean }> {
  const { fetchWebsiteHtml } = await import("@/lib/websiteAnalysis");
  const { detectParkedDomain } = await import("@/lib/websiteContentAnalysis");
  try {
    const fetched = await fetchWebsiteHtml(listingWebsite, fetchImpl);
    if (fetched.html) {
      const parked = !!detectParkedDomain(fetched.html);
      return { broken: parked, parked };
    }
    return { broken: fetched.missingPageStatus === 404 || fetched.missingPageStatus === 410, parked: false };
  } catch {
    return { broken: false, parked: false };
  }
}

/** The graded site's analysis, with the listing link's own state from
 * probeListingLink (the listing link is the one completeness.website_link
 * scores). Unchanged when the graded site IS the listing link. */
export function withListingLinkState(
  websiteAnalysis: WebsiteAnalysis | null,
  listingWebsite: string,
  probe: { broken: boolean; parked: boolean }
): WebsiteAnalysis | null {
  if (!websiteAnalysis?.websiteTrust) return websiteAnalysis;
  return {
    ...websiteAnalysis,
    websiteTrust: {
      ...websiteAnalysis.websiteTrust,
      listingLinkBroken: probe.broken,
      listingLinkErrorPageUrl: probe.broken ? listingWebsite : null,
      listingLinkParked: probe.parked,
    },
  };
}

/** The speed history and its typical result for the analysis being saved.
 * `fresh` is THIS scan's own measurement (null when it failed — the
 * history then stays as it was). Exported for tests. */
export function speedForSave(
  fresh: MobilePerformanceMeasurement | null | undefined,
  existing: WebsiteAnalysis | null | undefined,
  siteUrl: string | null,
  now: Date = new Date()
): { speedHistory: SpeedSample[]; speedSmoothed: SpeedSmoothed | null } | null {
  if (!siteUrl) return null;
  // Before this existed: the last saved measurement of this site starts the history.
  const seedSample = sampleFrom(existing?.mobilePerformance);
  const previous = existing?.speedHistory ?? (seedSample ? [seedSample] : []);
  const history = nextSpeedHistory(previous, sampleFrom(fresh), siteUrl, now);
  // The band shown last time — its stored typical result, else the last measurement's own.
  const lastMeasured = existing?.mobilePerformance;
  const previousSmoothed: SpeedSmoothed | null =
    existing?.speedSmoothed ??
    (lastMeasured?.measuredUrl && sameMeasuredSite(lastMeasured.measuredUrl, siteUrl) && seedSample
      ? { category: sampleCategory(lastMeasured), seconds: seedSample.lcpSeconds, samples: 1, measuredUrl: lastMeasured.measuredUrl }
      : null);
  return { speedHistory: history, speedSmoothed: smoothSpeed(history, previousSmoothed) };
}
