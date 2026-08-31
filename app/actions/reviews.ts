"use server";

import { createClient } from "@/lib/supabase/server";
import {
  businessRowToScoringInput,
  scoreBusiness,
  type BusinessScoringRow,
  type CategoryResult,
} from "@/lib/scoring";

export interface ReviewsPageData {
  businessName: string | null;
  address: string | null;
  category: string | null;
  primaryType: string | null;
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
}

export type GetReviewsPageDataResult =
  | { status: "ok"; data: ReviewsPageData }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

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
      "name, address, category, primary_type, place_id, rating, review_count, phone, opening_hours, website, categories, photo_count, business_status, https_status"
    )
    .eq("id", businessId)
    .single();

  if (error || !data) {
    return { status: "not_found" };
  }

  const row = data as BusinessScoringRow & {
    name: string | null;
    address: string | null;
    category: string | null;
    primary_type: string | null;
    place_id: string | null;
  };

  const breakdown = scoreBusiness(businessRowToScoringInput(row));
  const visibilityCategory = breakdown.categories.find((c) => c.id === "visibility");

  if (!visibilityCategory) {
    // Never actually reachable — "visibility" is always one of the
    // three fixed categories scoreBusiness() returns — but fail
    // honestly rather than silently rendering nothing if the engine's
    // category set ever changes shape.
    return { status: "error", message: "Could not load the review scoring breakdown." };
  }

  return {
    status: "ok",
    data: {
      businessName: row.name,
      address: row.address,
      category: row.category,
      primaryType: row.primary_type,
      placeId: row.place_id,
      rating: row.rating,
      reviewCount: row.review_count,
      visibilityCategory,
    },
  };
}
