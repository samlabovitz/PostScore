"use server";

import { createClient } from "@/lib/supabase/server";
import type { PlaceDetails } from "@/lib/google/places";

export type SaveBusinessResult =
  | { status: "saved" }
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

  const { error } = await supabase.from("businesses").upsert(
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
      lat: place.location?.lat ?? null,
      lng: place.location?.lng ?? null,
    },
    { onConflict: "owner_id,place_id" }
  );

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "saved" };
}
