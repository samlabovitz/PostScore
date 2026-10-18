import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFirstPhotoRef, resolvePhotoUri } from "@/lib/google/places";
import {
  canLoadPlacePhoto,
  LISTING_PHOTO_MAX_WIDTH_PX,
  placePhotoMonthlyCap,
  utcMonthStart,
} from "@/lib/placePhotoBudget";

// The Overview header's Google listing photo. The API key stays here on
// the server; the browser gets only Google's short-lived, key-free image
// URL plus the author attribution it must show. Nothing is stored or
// cached (Google doesn't allow caching photo names or photos) — every
// view fetches a fresh photo name (free) and one image URL (paid, capped
// monthly — lib/placePhotoBudget.ts).

export const dynamic = "force-dynamic";

export type ListingPhotoResponse = {
  photo: {
    uri: string;
    attributions: { displayName: string; uri: string | null }[];
    googleMapsUri: string | null;
  } | null;
};

function reply(body: ListingPhotoResponse, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return reply({ photo: null }, 401);

  // RLS: only the owner's own business comes back.
  const { data: business } = await supabase
    .from("businesses")
    .select("id, place_id, listing_mode")
    .eq("id", params.id)
    .maybeSingle();
  if (!business) return reply({ photo: null }, 404);
  if (!business.place_id || business.listing_mode === "website_only") return reply({ photo: null });

  try {
    // Free (IDs Only SKU). No photos on the listing → no image at all.
    const ref = await getFirstPhotoRef(business.place_id);
    if (!ref) return reply({ photo: null });

    const admin = createAdminClient();
    const { count, error } = await admin
      .from("place_photo_loads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", utcMonthStart(new Date()));
    // Fails closed: no log (e.g. table not created yet) → no paid call.
    // Say why in the server log, so a missing photo is easy to trace.
    if (error || count === null) {
      console.warn(
        `[listing-photo] no photo shown: the place_photo_loads usage log isn't available (${error?.code ?? "no count"}). Run supabase/schema.sql's place_photo_loads section.`
      );
      return reply({ photo: null });
    }
    if (!canLoadPlacePhoto(count, placePhotoMonthlyCap())) return reply({ photo: null });
    const { error: logError } = await admin.from("place_photo_loads").insert({ business_id: business.id });
    if (logError) return reply({ photo: null });

    const uri = await resolvePhotoUri(ref.name, LISTING_PHOTO_MAX_WIDTH_PX);
    if (!uri) return reply({ photo: null });
    return reply({ photo: { uri, attributions: ref.attributions, googleMapsUri: ref.googleMapsUri } });
  } catch {
    return reply({ photo: null });
  }
}
