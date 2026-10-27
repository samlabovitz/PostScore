"use server";

import { withTimeZone } from "@/lib/businessTimeZone";
import { createClient } from "@/lib/supabase/server";
import {
  businessRowToScoringInput,
  parseWebsiteAnalysis,
  scoreBusiness,
  type BusinessScoringRow,
  type CategoryResult,
  V112_SCORING_COLUMNS,
} from "@/lib/scoring";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { normalizeLocale } from "@/lib/i18n";

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
  /** The real "Visibility & Reputation" category from a live
   * scoreBusiness() run — rating, review count, review recency, with
   * their actual earned/max points and confidence. Never re-derived or
   * re-styled here; the Reviews page renders this exact object. */
  visibilityCategory: CategoryResult;
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
export async function getReviewsPageData(businessId: string): Promise<GetReviewsPageDataResult> {
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
      `name, address, category, primary_type, business_type_override, place_id, rating, review_count, phone, opening_hours, website, categories, photo_count, business_status, https_status, website_analysis_json, verified_website_url, website_trust_overrides_json, language, lat, lng, ${V112_SCORING_COLUMNS}`
    )
    .eq("id", businessId)
    .single();

  if (error || !data) {
    return { status: "not_found" };
  }

  const row = withTimeZone(data) as BusinessScoringRow & {
    time_zone: string;
    name: string | null;
    address: string | null;
    category: string | null;
    primary_type: string | null;
    place_id: string | null;
    language: string | null;
  };

  const locale = normalizeLocale(row.language);
  const breakdown = scoreBusiness(businessRowToScoringInput(row), locale);
  const visibilityCategory = breakdown.categories.find((c) => c.id === "visibility");

  if (!visibilityCategory) {
    // Never actually reachable — "visibility" is always one of the
    // three fixed categories scoreBusiness() returns — but fail
    // honestly rather than silently rendering nothing if the engine's
    // category set ever changes shape.
    return { status: "error", message: "Could not load the review scoring breakdown." };
  }

  const gbpStatus = await getGbpConnectionStatus(businessId);

  return {
    status: "ok",
    data: {
      businessName: row.name,
      address: row.address,
      category: row.category,
      primaryType: row.primary_type,
      language: row.language,
      timeZone: row.time_zone,
      placeId: row.place_id,
      rating: row.rating,
      reviewCount: row.review_count,
      visibilityCategory,
      gbpConnected: gbpStatus.status === "ok" && gbpStatus.connected,
      verifiedSocials: verifiedSocialProfiles(row.website_analysis_json),
    },
  };
}
