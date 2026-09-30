// Shared logic for scoring what PostScore's own starter-site template
// would earn for a business — used by both the Website page's
// builder-offer comparison (app/actions/website.ts) and the Growth
// page's no-website weekly-plan/growth-move copy (lib/actionPlan.ts),
// so there's exactly one place that knows how to turn real business
// data into a template scoring input, never two versions that could
// drift apart.

import { analyzeWebsiteHtml } from "@/lib/websiteContentAnalysis";
import { STARTER_SITE_FONTS, STARTER_SITE_THEMES, buildStarterSiteHtml } from "@/lib/starterSite";
import {
  businessRowToScoringInput,
  scoreBusiness,
  type BusinessScoringInput,
  type BusinessScoringRow,
  type ScoreBreakdown,
} from "@/lib/scoring";
import { rawWeightedTotal } from "@/lib/actionPlan";
import type { Locale } from "@/lib/i18n";

export interface StarterSiteTemplateData {
  businessName: string;
  category: string | null;
  phone: string | null;
  address: string | null;
  openingHours: string[] | null;
  rating: number | null;
  reviewCount: number | null;
  googleMapsUri: string | null;
  profileId: string;
}

/**
 * The two real facts the template can't honestly claim without a live,
 * hosted URL — see estimateTemplateWebsiteScore's own doc for why HTTPS
 * and mobile performance are excluded there. A caller that DOES want an
 * honest best-or-worst-case estimate (see estimateStarterSiteRange
 * below) passes real values for these instead of the "excluded"
 * defaults.
 */
export interface TemplateHostingAssumptions {
  httpsStatus: "https" | "http_only" | null;
  mobilePerformanceScore: number | null;
}

/** Nothing claimed about hosting — every free static host varies, so
 * this is the honest "don't know yet" default (see
 * estimateTemplateWebsiteScore's own use of this shape, historically
 * hard-coded inline). */
export const TEMPLATE_HOSTING_UNKNOWN: TemplateHostingAssumptions = {
  httpsStatus: "https",
  mobilePerformanceScore: null,
};

/** Nothing the template guarantees on its own — excludes both
 * hosting-dependent facts, for an honest LOW estimate. */
export const TEMPLATE_HOSTING_LOW: TemplateHostingAssumptions = {
  httpsStatus: null,
  mobilePerformanceScore: null,
};

/** The best realistic outcome once it's live on a fast, HTTPS-serving
 * host — for an honest HIGH estimate. */
export const TEMPLATE_HOSTING_HIGH: TemplateHostingAssumptions = {
  httpsStatus: "https",
  mobilePerformanceScore: 100,
};

/**
 * Builds the real BusinessScoringInput that scoring the starter
 * template against THIS business's own real data (rating, review
 * count, completeness fields, etc.) would use — every field except the
 * website ones comes straight from `business`, so the comparison
 * reflects this business's real standing, not a generic template
 * score. The template isn't actually published anywhere: content and
 * contact/conversion signals are real (analyzeWebsiteHtml runs on the
 * template's own actually-generated HTML), but HTTPS and mobile
 * performance are only ever as real as `hosting` says — a live
 * Lighthouse score can only come from a real URL.
 */
export function buildTemplateScoringInput(
  business: BusinessScoringRow,
  data: StarterSiteTemplateData,
  locale: Locale,
  hosting: TemplateHostingAssumptions = TEMPLATE_HOSTING_UNKNOWN
): BusinessScoringInput {
  const templateHtml = buildStarterSiteHtml({
    locale,
    businessName: data.businessName,
    category: data.category,
    tagline: "",
    taglineFontId: STARTER_SITE_FONTS[0].id,
    taglineColor: null,
    taglineSize: "medium",
    taglinePlacement: "below",
    phone: data.phone,
    address: data.address,
    openingHours: data.openingHours,
    // Not needed for a scoring-only estimate — never shown to the
    // owner, and analyzeWebsiteHtml() doesn't parse hours text.
    openingHoursPeriods: null,
    rating: data.rating,
    reviewCount: data.reviewCount,
    googleMapsUri: data.googleMapsUri,
    profileId: data.profileId,
    themeId: STARTER_SITE_THEMES[0].id,
    customAccent: null,
    fontId: STARTER_SITE_FONTS[0].id,
    show: {
      address: !!data.address,
      phone: !!data.phone,
      hours: !!data.openingHours && data.openingHours.length > 0,
      rating: data.rating !== null,
    },
    // Compares against the builder's default, no-customization state —
    // no photos uploaded yet.
    heroImage: null,
    contentImages: [],
  });

  return businessRowToScoringInput({
    ...business,
    website: "https://example.com",
    https_status: hosting.httpsStatus,
    website_analysis_json: {
      content: analyzeWebsiteHtml(templateHtml),
      mobilePerformanceScore: hosting.mobilePerformanceScore,
      screenshotUrl: null,
      checkedAt: new Date().toISOString(),
    },
  });
}

/**
 * The honest LOW–HIGH weighted-points range building the starter
 * template is worth for a business with NO website today — see item 5
 * of Day 3 step 2e's second pass. LOW is what the template guarantees
 * regardless of hosting (a real website on file, real content depth,
 * real contact/conversion signals — everything analyzeWebsiteHtml can
 * confirm from the template's own generated HTML); HIGH adds HTTPS and
 * a full mobile-performance score, the two facts that depend on where
 * the owner actually hosts it. Both ends are computed the exact same
 * way every other weighted-points figure in the app is: build the real
 * input, run the real scoreBusiness(), diff the real weighted total
 * against `baselineBreakdown` — never estimated or hand-summed.
 */
export function estimateStarterSiteRange(
  baselineBreakdown: ScoreBreakdown,
  business: BusinessScoringRow,
  data: StarterSiteTemplateData,
  locale: Locale
): {
  low: number;
  high: number;
  lowOverlay: Pick<BusinessScoringInput, "website" | "httpsStatus" | "websiteAnalysis">;
  highOverlay: Pick<BusinessScoringInput, "website" | "httpsStatus" | "websiteAnalysis">;
} {
  const before = rawWeightedTotal(baselineBreakdown);

  const lowInput = buildTemplateScoringInput(business, data, locale, TEMPLATE_HOSTING_LOW);
  const lowAfter = rawWeightedTotal(scoreBusiness(lowInput, locale));

  const highInput = buildTemplateScoringInput(business, data, locale, TEMPLATE_HOSTING_HIGH);
  const highAfter = rawWeightedTotal(scoreBusiness(highInput, locale));

  return {
    low: Math.max(0, lowAfter - before),
    high: Math.max(0, highAfter - before),
    lowOverlay: {
      website: lowInput.website,
      httpsStatus: lowInput.httpsStatus,
      websiteAnalysis: lowInput.websiteAnalysis,
    },
    highOverlay: {
      website: highInput.website,
      httpsStatus: highInput.httpsStatus,
      websiteAnalysis: highInput.websiteAnalysis,
    },
  };
}
