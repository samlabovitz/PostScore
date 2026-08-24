"use server";

import { createClient } from "@/lib/supabase/server";
import type { PlaceDetails } from "@/lib/google/places";

export type SaveBusinessResult =
  | { status: "saved"; businessId: string }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/** Persists a looked-up Google place as a business owned by the current user. */
export async function saveBusiness(
  place: PlaceDetails
): Promise<SaveBusinessResult> {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("businesses")
    .upsert(
      {
        owner_id: user.id,
        place_id: place.placeId,
        name: place.name,
        address: place.formattedAddress,
        phone: place.phone,
        website: place.website,
        rating: place.rating,
        review_count: place.userRatingCount,
        category: place.primaryCategory,
        primary_type: place.primaryType,
        categories: place.categories,
        opening_hours: place.openingHours,
        business_status: place.businessStatus,
        photo_count: place.photoCount,
        google_maps_uri: place.googleMapsUri,
        lat: place.location?.lat ?? null,
        lng: place.location?.lng ?? null,
      },
      { onConflict: "owner_id,place_id" }
    )
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", message: error?.message ?? "Save failed." };
  }

  return { status: "saved", businessId: data.id };
}

export interface BusinessSummary {
  id: string;
  name: string | null;
  address: string | null;
}

export type GetBusinessSummaryResult =
  | { status: "ok"; business: BusinessSummary }
  | { status: "not_found" }
  | { status: "unauthenticated" };

/**
 * A minimal, RLS-scoped lookup for pages that only need to know which
 * business they're for — the sidebar header and not-yet-built section
 * placeholders — without paying for a full score computation.
 */
export async function getBusinessSummary(businessId: string): Promise<GetBusinessSummaryResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, address")
    .eq("id", businessId)
    .single();

  if (error || !data) {
    return { status: "not_found" };
  }

  return { status: "ok", business: data as BusinessSummary };
}
