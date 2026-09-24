"use server";

import { createClient } from "@/lib/supabase/server";
import {
  businessRowToScoringInput,
  generateSuggestions,
  scoreBusiness,
  type BusinessScoringRow,
  type CategoryResult,
  type Suggestion,
  type WebsiteAnalysis,
} from "@/lib/scoring";
import { analyzeWebsiteHtml } from "@/lib/websiteContentAnalysis";
import {
  STARTER_SITE_FONTS,
  STARTER_SITE_THEMES,
  buildStarterSiteHtml,
} from "@/lib/starterSite";
import { resolveBizProfile } from "@/config/bizProfiles";
import { normalizeLocale, type Locale } from "@/lib/i18n";
import type { OpeningHoursPeriod } from "@/lib/google/places";

export interface WebsitePageData {
  businessName: string | null;
  address: string | null;
  category: string | null;
  primaryType: string | null;
  businessTypeOverride: string | null;
  /** The business's own real language column — display-only, passed
   * straight through to DashboardShell (which normalizes it). */
  language: string | null;
  phone: string | null;
  openingHours: string[] | null;
  /** Google's structured regularOpeningHours.periods (see
   * lib/google/places.ts) — passed straight through to the starter-site
   * generator so it can display Spanish hours (lib/hours.ts) when the
   * site's own language is set to Spanish; null falls back to
   * openingHours. */
  openingHoursPeriods: OpeningHoursPeriod[] | null;
  rating: number | null;
  reviewCount: number | null;
  /** Real Google-listed website, if any — used only to detect whether
   * this business already has one; never overwritten by this page. */
  website: string | null;
  googleMapsUri: string | null;
  /** The real, frozen analysis of the live site (screenshot, PageSpeed,
   * content signals) — see WebsiteAnalysis in lib/scoring.ts. null if
   * there's no website or it hasn't been analyzed yet (re-scan runs it). */
  websiteAnalysis: WebsiteAnalysis | null;
  /** The live-scored "Website" category breakdown, for the visual
   * analysis section's itemized findings — the exact same CheckResults
   * scoreBusiness() produces everywhere else, never a parallel copy. */
  websiteCategory: CategoryResult | null;
  /** This business's real, currently-losing Website suggestions — the
   * exact output of generateSuggestions(), filtered to the website
   * category, so the visual analysis section's "how to fix" copy is the
   * same advice shown everywhere else, never separately written. */
  websiteSuggestions: Suggestion[];
}

/**
 * Whether/how to offer the starter-site builder: always for a business
 * with no website; ALSO — honestly, not just because it's always
 * offered — when a business's real, measured website score is clearly
 * below what PostScore's own free starter template would score for this
 * same business. Both sides are computed with the exact same
 * scoreBusiness()/analyzeWebsiteHtml() real logic; nothing here is a
 * separate hand-tuned estimate. See buildBuilderOffer below.
 */
export interface BuilderOffer {
  reason: "no_website" | "underperforming" | "backup";
  /** The real business's current Website category score (0-100), or
   * null if it can't be honestly computed yet (no website, or a website
   * that hasn't been analyzed since this feature shipped). */
  realWebsiteScore: number | null;
  /** What PostScore's own starter template would score, for this same
   * business's real data, using default styling — null only in the
   * theoretical case where the template itself has no determinable
   * website checks (never happens in practice). */
  templateWebsiteScore: number | null;
}

export type GetWebsitePageDataResult =
  | { status: "ok"; data: WebsitePageData; builderOffer: BuilderOffer }
  | { status: "not_found" }
  | { status: "unauthenticated" };

/** A template estimate only counts as "clearly" better than the real
 * site once it clears this margin — avoids the builder offer flipping
 * on and off from noise near a tie. */
const UNDERPERFORMING_MARGIN = 8;

/**
 * Scores what PostScore's own starter template would earn for this
 * business's Website category, using the exact same default settings
 * the builder itself starts with (see StarterSiteBuilder.tsx's initial
 * state) — so the comparison reflects what an owner would actually get
 * by clicking through with no customization, not a hand-tuned best case.
 *
 * The template isn't actually published anywhere, so two of its facts
 * are honestly handled rather than measured: HTTPS is assumed true
 * (every free static host this app recommends serves it by default),
 * and PageSpeed is left null/excluded — a real Lighthouse score can
 * only come from a live URL, and simulating one here would be exactly
 * the kind of fabrication this app never does. Content and
 * contact/conversion signals ARE real: analyzeWebsiteHtml() runs on the
 * template's own actually-generated HTML, the same function a live
 * site's real analysis uses.
 */
function estimateTemplateWebsiteScore(
  business: BusinessScoringRow,
  data: {
    businessName: string;
    category: string | null;
    phone: string | null;
    address: string | null;
    openingHours: string[] | null;
    rating: number | null;
    reviewCount: number | null;
    googleMapsUri: string | null;
    profileId: string;
  },
  locale: Locale
): number | null {
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
    // Not needed for this internal scoring-only estimate — never shown
    // to the owner, and analyzeWebsiteHtml() doesn't parse hours text.
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
    // The template estimate compares against the builder's default,
    // no-customization state — no photos uploaded yet.
    heroImage: null,
    contentImages: [],
  });

  const templateInput = businessRowToScoringInput({
    ...business,
    website: "https://example.com",
    https_status: "https",
    website_analysis_json: {
      content: analyzeWebsiteHtml(templateHtml),
      mobilePerformanceScore: null, // honestly excluded — never live-tested
      screenshotUrl: null,
      checkedAt: new Date().toISOString(),
    },
  });

  const templateBreakdown = scoreBusiness(templateInput, locale);
  return templateBreakdown.categories.find((c) => c.id === "website")?.relativeScore ?? null;
}

function buildBuilderOffer(
  hasWebsite: boolean,
  realWebsiteScore: number | null,
  templateWebsiteScore: number | null
): BuilderOffer {
  if (!hasWebsite) {
    return { reason: "no_website", realWebsiteScore, templateWebsiteScore };
  }
  if (
    realWebsiteScore !== null &&
    templateWebsiteScore !== null &&
    templateWebsiteScore - realWebsiteScore >= UNDERPERFORMING_MARGIN
  ) {
    return { reason: "underperforming", realWebsiteScore, templateWebsiteScore };
  }
  return { reason: "backup", realWebsiteScore, templateWebsiteScore };
}

/**
 * A dedicated, RLS-scoped fetch for the Website page — the starter site
 * generator and the smart builder-offer comparison both need real
 * fields getBusinessSummary() deliberately doesn't select. Never writes
 * to the database: generating or downloading a starter site here has no
 * effect on the saved business row or on scoring — see StarterSiteBuilder's
 * own doc comment for why. The builder-offer comparison and the visual
 * analysis section's data ARE derived from the real saved row here, but
 * that's just reading/computing, same as any other score view.
 */
export async function getWebsitePageData(businessId: string): Promise<GetWebsitePageDataResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("businesses")
    .select(
      "name, address, category, primary_type, business_type_override, phone, opening_hours, opening_hours_periods, rating, review_count, website, categories, photo_count, business_status, https_status, website_analysis_json, google_maps_uri, language"
    )
    .eq("id", businessId)
    .single();

  if (error || !data) {
    return { status: "not_found" };
  }

  const businessRow = data as BusinessScoringRow;
  const hasWebsite = !!data.website && data.website.trim().length > 0;
  const locale = normalizeLocale(data.language);
  const profile = resolveBizProfile(data.category, data.primary_type, data.business_type_override, locale);

  const realInput = businessRowToScoringInput(businessRow);
  const realBreakdown = scoreBusiness(realInput, locale);
  const websiteCategory = realBreakdown.categories.find((c) => c.id === "website") ?? null;
  const websiteSuggestions = generateSuggestions(realBreakdown, locale).filter((s) => s.category === "website");
  // Only trust the real score for the underperformance comparison once
  // this site's quality checks are actually determinable — a business
  // whose site has never been analyzed yet has no honest basis for
  // "your site is holding you back" (see buildBuilderOffer above).
  const realWebsiteScore =
    hasWebsite && realInput.websiteAnalysis?.content ? websiteCategory?.relativeScore ?? null : null;

  const templateWebsiteScore = estimateTemplateWebsiteScore(
    businessRow,
    {
      businessName: data.name ?? "Your business",
      category: data.category,
      phone: data.phone,
      address: data.address,
      openingHours: data.opening_hours,
      rating: data.rating,
      reviewCount: data.review_count,
      googleMapsUri: data.google_maps_uri,
      profileId: profile.id,
    },
    locale
  );

  const builderOffer = buildBuilderOffer(hasWebsite, realWebsiteScore, templateWebsiteScore);

  return {
    status: "ok",
    data: {
      businessName: data.name,
      address: data.address,
      category: data.category,
      primaryType: data.primary_type,
      businessTypeOverride: data.business_type_override,
      language: data.language,
      phone: data.phone,
      openingHours: data.opening_hours,
      openingHoursPeriods: data.opening_hours_periods,
      rating: data.rating,
      reviewCount: data.review_count,
      website: data.website,
      googleMapsUri: data.google_maps_uri,
      websiteAnalysis: realInput.websiteAnalysis,
      websiteCategory,
      websiteSuggestions,
    },
    builderOffer,
  };
}
