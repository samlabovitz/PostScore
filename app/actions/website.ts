"use server";

import { websiteWholePoints } from "@/lib/categoryPoints";
import { viewLocale } from "@/lib/viewLocale.server";
import { loadOwnerDetails, withOwnerDetailsFor } from "@/lib/ownerDetails.server";
import { gradedWebsite, listingLinkBroken } from "@/lib/businessWebsite";
import { createClient } from "@/lib/supabase/server";
import {
  businessRowToScoringInput,
  generateSuggestions,
  scoreBasisPoints,
  scoreBusiness,
  type BusinessScoringRow,
  type CategoryResult,
  type Suggestion,
  type WebsiteAnalysis,
  OWNER_SCORING_COLUMNS,
} from "@/lib/scoring";
import {
  buildTemplateScoringInput,
  TEMPLATE_HOSTING_UNKNOWN,
  type StarterSiteTemplateData,
} from "@/lib/starterSiteScoring";
import { resolveBizProfile } from "@/config/bizProfiles";
import { type Locale } from "@/lib/i18n";
import { sanitizeOwnerHours, type OwnerHours } from "@/lib/ownerHours";
import { sanitizeStarterSiteDetails, type StarterSiteDetails } from "@/lib/starterSiteDetails";
import { businessTimeZone } from "@/lib/businessTimeZone";
import { hasStorefront } from "@/lib/starterSite";
import { getListingMode } from "@/lib/listingMode";
import type { OpeningHoursPeriod } from "@/lib/google/places";
import { withSavedScore } from "@/lib/savedScore";
import { latestSavedScore } from "@/lib/savedScore.server";
import { withLiveListingFor } from "@/lib/ownerListing.server";

export interface WebsitePageData {
  /** The owner's confirmed name (and address below) once confirmed (lib/ownerDetails.ts). */
  businessName: string | null;
  address: string | null;
  category: string | null;
  /** Every real secondary Google type for this business — feeds
   * resolveBizProfile()'s secondary-Google-type lawyer check (see
   * isLikelyLawFirm in config/bizProfiles.ts) for this page's own FAQ
   * rendering, same real data already fetched for `category` above. */
  categories: string[] | null;
  primaryType: string | null;
  businessTypeOverride: string | null;
  /** Our own saved business type (Day 23 2d-1). */
  bizTypeResolved: string | null;
  /** The business's own real language column — display-only, passed
   * straight through to DashboardShell (which normalizes it). */
  language: string | null;
  phone: string | null;
  /** The phone the owner confirmed (Settings → "Your business details"); null = none. */
  ownerPhone: string | null;
  openingHours: string[] | null;
  /** Google's structured regularOpeningHours.periods (see
   * lib/google/places.ts) — passed straight through to the starter-site
   * generator so it can display Spanish hours (lib/hours.ts) when the
   * site's own language is set to Spanish; null falls back to
   * openingHours. */
  openingHoursPeriods: OpeningHoursPeriod[] | null;
  rating: number | null;
  reviewCount: number | null;
  /** Google couldn't be read for this page (Day 23 2d-2). */
  liveUnavailable?: boolean;
  /** Real Google-listed website, if any — used only to detect whether
   * this business already has one; never overwritten by this page. */
  website: string | null;
  /** A real site verified elsewhere (by phone/address match) when the
   * Google listing itself shows none — see businesses.verified_website_url.
   * The page treats either one as "this business has a real website." */
  verifiedWebsiteUrl: string | null;
  /** The site PostScore grades, screenshots and shows (lib/businessWebsite.ts
   * gradedWebsite — owner-confirmed, verified, or the listing's link), and
   * whether the listing's own link is parked or broken. */
  gradedSite: { url: string; source: import("@/lib/businessWebsite").WebsiteSource; listingBroken: boolean } | null;
  /** The listing was read live and has no website link, though the last scan graded one. */
  notOnListing?: boolean;
  /** Non-null only the first scan to SUSPECT Google's listing lost its
   * website (one lookup + one retry, both empty, despite one kept on
   * file for scoring) — see resolveListingWebsite in
   * lib/googleListingWebsite.ts. An honest, separate fact about
   * Google's OWN listing, never about whether this site is reachable. */
  googleListingMissingWebsiteSince: string | null;
  /** Non-null once that suspicion is CONFIRMED on a later, separate
   * scan — the website is genuinely cleared and scored as missing at
   * that point. The one real "is this confirmed" signal; never read
   * for display — see googleListingLastKnownWebsiteAt below for the
   * real date. Mutually exclusive with googleListingMissingWebsiteSince
   * above (never both set at once). */
  googleListingWebsiteRemovedSince: string | null;
  /** The REAL date Google last actually returned a website — see
   * findLastKnownWebsiteDate (lib/googleListingWebsite.ts). Shown as
   * "it last showed one on {date}" ONLY when non-null; when
   * googleListingWebsiteRemovedSince is set but this is null (no
   * determinable prior date), show the no-date variant instead of
   * guessing. */
  googleListingLastKnownWebsiteAt: string | null;
  googleMapsUri: string | null;
  /** The real, frozen analysis of the live site (screenshot, PageSpeed,
   * content signals) — see WebsiteAnalysis in lib/scoring.ts. null if
   * there's no website or it hasn't been analyzed yet (re-scan runs it). */
  websiteAnalysis: WebsiteAnalysis | null;
  /** The live-scored "Website" category breakdown, for the visual
   * analysis section's itemized findings — the exact same CheckResults
   * scoreBusiness() produces everywhere else, never a parallel copy. */
  websiteCategory: CategoryResult | null;
  /** The title's "29 / 30 pts" from the saved scan, rounded as the Overview's breakdown (lib/categoryPoints.ts);
   * `speedPending`: mobile speed isn't scored yet. */
  categoryPoints?: { earned: number; of: number; speedPending: boolean } | null;
  /** v1.10.0: scoreBasisPoints(all categories) — see lib/scoring.ts. */
  scoreBasis: number;
  /** The business's own time zone (lib/businessTimeZone.ts). */
  timeZone: string;
  /** Hours the owner entered for the starter website (supabase/hours.sql); website only, never scored. */
  starterSiteHours: OwnerHours | null;
  /** false until supabase/hours.sql has been run. */
  starterSiteHoursEnabled: boolean;
  /** The name/type/address/phone the owner confirmed for the starter
   * website, "provided by you" (supabase/starter-site-details.sql). */
  starterSiteDetails: StarterSiteDetails | null;
  /** false until supabase/starter-site-details.sql has been run. */
  starterSiteDetailsEnabled: boolean;
  /** A real storefront (lib/starterSite.ts hasStorefront) — street address,
   * directions and the map on the starter site; false for website-only and
   * service-area businesses. */
  storefront: boolean;
  /** Google place id, for the storefront map (Maps Embed API place mode). */
  placeId: string | null;
  /** Google's price level enum (lib/priceLevel.ts), or null. */
  priceLevel: string | null;
  /** Social profiles on the business's site that a real request confirmed
   * open the profile (lib/socialLinkCheck.ts) — the starter site links
   * only these. */
  verifiedSocialLinks: Array<{ platform: string; url: string }>;
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
  /** The starter template's Website points (whole, out of 30), from the same scoring — the page's comparison. */
  templatePoints: number | null;
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
  data: StarterSiteTemplateData,
  locale: Locale
): { relative: number | null; points: number | null } {
  const templateInput = buildTemplateScoringInput(business, data, locale, TEMPLATE_HOSTING_UNKNOWN);
  const templateBreakdown = scoreBusiness(templateInput, locale);
  return { relative: templateBreakdown.categories.find((c) => c.id === "website")?.relativeScore ?? null, points: websiteWholePoints(templateBreakdown.categories)?.earned ?? null };
}

function buildBuilderOffer(
  hasWebsite: boolean,
  realWebsiteScore: number | null,
  templateWebsiteScore: number | null,
  templatePoints: number | null = null
): BuilderOffer {
  if (!hasWebsite) {
    return { reason: "no_website", realWebsiteScore, templateWebsiteScore, templatePoints };
  }
  if (
    realWebsiteScore !== null &&
    templateWebsiteScore !== null &&
    templateWebsiteScore - realWebsiteScore >= UNDERPERFORMING_MARGIN
  ) {
    return { reason: "underperforming", realWebsiteScore, templateWebsiteScore, templatePoints };
  }
  return { reason: "backup", realWebsiteScore, templateWebsiteScore, templatePoints };
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

  const { data: saved, error } = await supabase
    .from("businesses")
    .select(
      `business_type_override, biz_type_resolved, listing_mode, https_status, website_analysis_json, place_id, language, google_listing_missing_website_since, google_listing_website_removed_since, google_listing_last_known_website_at, verified_website_url, website_trust_overrides_json, lat, lng, ${OWNER_SCORING_COLUMNS}`
    )
    .eq("id", businessId)
    .single();

  if (error || !saved) {
    return { status: "not_found" };
  }
  // Day 23 2d-4: Google's values as read now (lib/ownerListing.server.ts) —
  // the page's words, website and listing facts; never the saved columns.
  const data = await withLiveListingFor(supabase, businessId, saved as typeof saved & { listing_mode?: string | null });

  // Owner-entered starter-site hours, read on their own so the page still
  // works before supabase/hours.sql has been run (website only, never
  // part of businessRow or scoring).
  const hoursRow = await supabase.from("businesses").select("starter_site_hours").eq("id", businessId).maybeSingle();
  const starterSiteHoursEnabled = !hoursRow.error;
  const starterSiteHours = starterSiteHoursEnabled ? sanitizeOwnerHours((hoursRow.data as { starter_site_hours?: unknown } | null)?.starter_site_hours ?? null) : null;
  // The owner-confirmed details, the same way (supabase/starter-site-details.sql).
  const detailsRow = await supabase.from("businesses").select("starter_site_details").eq("id", businessId).maybeSingle();
  const starterSiteDetailsEnabled = !detailsRow.error;
  const starterSiteDetails = starterSiteDetailsEnabled ? sanitizeStarterSiteDetails((detailsRow.data as { starter_site_details?: unknown } | null)?.starter_site_details ?? null) : null;

  const timeZone = businessTimeZone(data.lat, data.lng);
  const businessRow = { ...data, time_zone: timeZone } as BusinessScoringRow;
  const verifiedWebsiteUrl =
    typeof data.verified_website_url === "string" && data.verified_website_url.trim().length > 0
      ? data.verified_website_url.trim()
      : null;
  // A real site, on the listing OR verified elsewhere (the real Bánh Mì
  // Boy case) — same definition website.has_website scores, so the page
  // never pitches "build a website" to a business that already has one.
  const { readOwnerWebsite } = await import("@/lib/ownerWebsite.server");
  const ownerWebsite = await readOwnerWebsite(supabase, businessId);
  const siteRow = { website: data.website, verified_website_url: verifiedWebsiteUrl, owner_website_url: ownerWebsite?.url ?? null, website_analysis_json: data.website_analysis_json };
  // The site the last scan graded (our own result). When the listing can't be read live right now (a failed
  // read, the monthly cap, a dev run), the page uses it — the same site the score is from, never "no website".
  const { gradedSiteUrl } = await import("@/lib/gradedSite");
  const { socialPagePlatform } = await import("@/lib/websiteTrust");
  const scanned = gradedSiteUrl(data.website_analysis_json);
  const scanSite = scanned && socialPagePlatform(scanned) === null ? scanned : null;
  const fromRow = gradedWebsite(siteRow);
  // The listing couldn't be read live: a "listing" link here is the scan's own (ownerListing.server.ts), so say "From your last scan".
  const fromRowShown = fromRow && fromRow.source === "listing" && data.live_unavailable === true ? { ...fromRow, source: "scan" as const } : fromRow;
  const graded: { url: string; source: import("@/lib/businessWebsite").WebsiteSource } | null = fromRowShown ?? (scanSite ? { url: scanSite, source: "scan" } : null);
  const hasWebsite = (!!data.website && data.website.trim().length > 0) || !!verifiedWebsiteUrl || graded !== null;
  // The listing was read and has no link, yet the scan graded a site: "Your website isn't on your Google listing yet".
  const notOnListing = !fromRow && !!scanSite && data.live_unavailable !== true;
  const gradedSite = graded ? { ...graded, listingBroken: listingLinkBroken(siteRow) } : null;
  const locale = viewLocale(data.language);
  const profile = resolveBizProfile(
    data.category,
    data.primary_type,
    data.business_type_override,
    locale,
    data.categories,
    data.name,
    data.biz_type_resolved
  );

  const realInput = businessRowToScoringInput(businessRow);
  // Day 23 2d-1: the saved scan's points (lib/savedScore.ts), today's words.
  const realNow = scoreBusiness(realInput, locale);
  const realBreakdown = withSavedScore(realNow, await latestSavedScore(supabase, businessId), { liveUnavailable: data.live_unavailable === true }) ?? realNow;
  const websiteCategory = realBreakdown.categories.find((c) => c.id === "website") ?? null;
  const websiteSuggestions = generateSuggestions(realBreakdown, locale).filter((s) => s.category === "website");
  // Only trust the real score for the underperformance comparison once
  // this site's quality checks are actually determinable — a business
  // whose site has never been analyzed yet has no honest basis for
  // "your site is holding you back" (see buildBuilderOffer above).
  const realWebsiteScore =
    hasWebsite && realInput.websiteAnalysis?.content ? websiteCategory?.relativeScore ?? null : null;

  const template = estimateTemplateWebsiteScore(
    businessRow,
    {
      businessName: data.name ?? "Your business",
      category: data.category,
      phone: data.phone,
      address: data.address,
      placeId: data.place_id || null,
      profileId: profile.id,
    },
    locale
  );

  const builderOffer = buildBuilderOffer(hasWebsite, realWebsiteScore, template.relative, template.points);
  // Day 23 2d-2: Google's values shown here are read now (lib/ownerListing.ts).
  const live = data;
  // Day 23 2d-3: the owner's confirmed details (lib/ownerDetails.ts).
  const owner = (await loadOwnerDetails(supabase, businessId))?.details ?? null;
  const shownName = await withOwnerDetailsFor(supabase, businessId, { name: data.name as string | null, address: data.address as string | null });

  return {
    status: "ok",
    data: {
      businessName: shownName.name,
      address: shownName.address,
      category: data.category,
      categories: data.categories,
      primaryType: data.primary_type,
      businessTypeOverride: data.business_type_override,
      bizTypeResolved: data.biz_type_resolved ?? null,
      language: data.language,
      phone: live.phone ?? null,
      ownerPhone: owner?.phone || null,
      openingHours: live.opening_hours ?? null,
      openingHoursPeriods: live.opening_hours_periods ?? null,
      rating: live.rating ?? null,
      reviewCount: live.review_count ?? null,
      liveUnavailable: live.live_unavailable === true,
      website: data.website,
      verifiedWebsiteUrl,
      gradedSite,
      notOnListing,
      googleListingMissingWebsiteSince: data.google_listing_missing_website_since,
      googleListingWebsiteRemovedSince: data.google_listing_website_removed_since,
      googleListingLastKnownWebsiteAt: data.google_listing_last_known_website_at,
      googleMapsUri: live.google_maps_uri ?? null,
      websiteAnalysis: realInput.websiteAnalysis,
      websiteCategory,
      categoryPoints: (() => {
        const w = websiteWholePoints(realBreakdown.categories);
        if (!w) return null;
        const speed = websiteCategory?.checks.find((c) => c.id === "website.performance_mobile");
        return { ...w, speedPending: !!speed && speed.earnedPoints === null };
      })(),
      scoreBasis: scoreBasisPoints(realBreakdown.categories),
      timeZone,
      websiteSuggestions,
      starterSiteHours,
      starterSiteHoursEnabled,
      starterSiteDetails,
      starterSiteDetailsEnabled,
      priceLevel: (data as { price_level?: string | null }).price_level ?? null,
      storefront: hasStorefront({ listingMode: await getListingMode(supabase, businessId), placeId: data.place_id, address: data.address }),
      placeId: data.place_id || null,
      verifiedSocialLinks: (realInput.websiteAnalysis?.content?.socialProfiles ?? [])
        .filter((p) => p.check?.result === "profile")
        .map((p) => ({ platform: p.platform, url: p.url })),
    },
    builderOffer,
  };
}
