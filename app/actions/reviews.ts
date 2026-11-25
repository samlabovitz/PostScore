"use server";

import { wholeCategoryPoints } from "@/lib/categoryPoints";
import { emptyListingColumns } from "@/lib/listingScoringRow";
import { withOwnerDetailsFor } from "@/lib/ownerDetails.server";
import { withTimeZone } from "@/lib/businessTimeZone";
import { createClient } from "@/lib/supabase/server";
import {
  businessRowToScoringInput,
  parseWebsiteAnalysis,
  scoreBusiness,
  type BusinessScoringRow,
  type CategoryResult,
  OWNER_SCORING_COLUMNS,
} from "@/lib/scoring";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { normalizeLocale } from "@/lib/i18n";
import { withSavedScore } from "@/lib/savedScore";
import { latestSavedScore } from "@/lib/savedScore.server";
import { withLiveListingFor } from "@/lib/ownerListing.server";

export interface ReviewsPageData {
  businessName: string | null;
  address: string | null;
  category: string | null;
  primaryType: string | null;
  /** The business's own real language column — display-only, passed
   * straight through to DashboardShell (which normalizes it). */
  language: string | null;
  /** The business's own time zone (lib/businessTimeZone.ts). */
  timeZone: string;
  /** Google's own place_id — the review link/QR are only ever built
   * from this real value, never guessed. */
  placeId: string | null;
  rating: number | null;
  reviewCount: number | null;
  /** Google couldn't be read for this page (Day 23 2d-2): rating and count are empty. */
  liveUnavailable?: boolean;
  /** The real "Visibility & Reputation" category from a live
   * scoreBusiness() run — rating, review count, review recency, with
   * their actual earned/max points and confidence. Never re-derived or
   * re-styled here; the Reviews page renders this exact object. */
  visibilityCategory: CategoryResult;
  /** The title's "21 / 40 pts": Visibility & Reputation's whole points from the saved scan, rounded as the
   * Overview's breakdown rounds them (lib/categoryPoints.ts) so the three pages add up to the score. */
  categoryPoints?: { earned: number; of: number } | null;
  /** Whether this business has connected its Google Business Profile —
   * gates the reply-assistant card between "connect to unlock" and an
   * honest "connected, syncing soon" state (see app/actions/gbp.ts). */
  gbpConnected: boolean;
  /** Social profiles on the business's website whose link check found a
   * real profile — the only ones a review sign may print as "Follow us". */
  verifiedSocials: Array<{ platform: string; url: string }>;
}

export type GetReviewsPageDataResult =
  | { status: "ok"; data: ReviewsPageData }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/** Profiles verified as real: their one-request check landed on an
 * actual profile ("unconfirmed" — blocked by the platform — isn't). */
function verifiedSocialProfiles(json: unknown): Array<{ platform: string; url: string }> {
  const profiles = parseWebsiteAnalysis(json)?.content?.socialProfiles ?? [];
  return profiles.filter((p) => p.check?.result === "profile").map((p) => ({ platform: p.platform, url: p.url }));
}

/**
 * Loads a saved business (RLS-scoped) and scores it live, the same way
 * scoreBusinessById does — never writes to the database, so this is
 * free to view as often as you like. Returns exactly the fields the
 * Reviews page needs: real rating/review count/place_id, plus the real
 * visibility-category breakdown for the rubric section.
 */
/** `live: false` (Free's locked-tab showroom): no Google call — the
 * listing's values are left empty. */
export async function getReviewsPageData(businessId: string, options: { live?: boolean } = {}): Promise<GetReviewsPageDataResult> {
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
      `business_type_override, biz_type_resolved, place_id, listing_mode, https_status, website_analysis_json, verified_website_url, website_trust_overrides_json, language, lat, lng, ${OWNER_SCORING_COLUMNS}`
    )
    .eq("id", businessId)
    .single();

  if (error || !data) {
    return { status: "not_found" };
  }

  // Day 23 2d-4: scored from Google's values as read now (never the saved
  // columns); Free's locked-tab showroom (`live: false`) makes no call and
  // shows no Google values.
  const liveRow =
    options.live === false
      ? { ...data, ...emptyListingColumns(), live_unavailable: false }
      : await withLiveListingFor(supabase, businessId, data as typeof data & { listing_mode?: string | null });
  const row = withTimeZone(liveRow) as unknown as BusinessScoringRow & {
    time_zone: string;
    name: string | null;
    address: string | null;
    category: string | null;
    primary_type: string | null;
    place_id: string | null;
    language: string | null;
  };

  const locale = normalizeLocale(row.language);
  // Day 23 2d-1: the saved scan's points (lib/savedScore.ts), today's words.
  const now = scoreBusiness(businessRowToScoringInput(row), locale);
  const breakdown = withSavedScore(now, await latestSavedScore(supabase, businessId), { liveUnavailable: (liveRow as { live_unavailable?: boolean }).live_unavailable === true }) ?? now;
  const visibilityCategory = breakdown.categories.find((c) => c.id === "visibility");

  if (!visibilityCategory) {
    // Never actually reachable — "visibility" is always one of the
    // three fixed categories scoreBusiness() returns — but fail
    // honestly rather than silently rendering nothing if the engine's
    // category set ever changes shape.
    return { status: "error", message: "Could not load the review scoring breakdown." };
  }

  const gbpStatus = await getGbpConnectionStatus(businessId);
  const owner = await withOwnerDetailsFor(supabase, businessId, { name: row.name, address: row.address }, { live: options.live !== false });
  const live = liveRow as typeof liveRow & { rating?: number | null; review_count?: number | null; live_unavailable?: boolean };

  return {
    status: "ok",
    data: {
      // Day 23 2d-3: the owner's confirmed name and address.
      businessName: owner.name,
      address: owner.address,
      category: row.category,
      primaryType: row.primary_type,
      language: row.language,
      timeZone: row.time_zone,
      placeId: row.place_id,
      // Day 23 2d-2: as Google shows them now (lib/ownerListing.ts).
      rating: live.rating ?? null,
      reviewCount: live.review_count ?? null,
      liveUnavailable: live.live_unavailable === true,
      visibilityCategory,
      categoryPoints: (() => {
        const i = breakdown.categories.findIndex((c) => c.id === "visibility");
        const earned = wholeCategoryPoints(breakdown.categories)[i];
        return earned === null || earned === undefined ? null : { earned, of: breakdown.categories[i].weight };
      })(),
      gbpConnected: gbpStatus.status === "ok" && gbpStatus.connected,
      verifiedSocials: verifiedSocialProfiles(row.website_analysis_json),
    },
  };
}
