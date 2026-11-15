// Server-only. A business's lat/lng, read again from Places when a feature
// needs them after the nightly cleanup cleared them (Google's Places terms
// allow keeping coordinates at most 30 days — lib/storageCleanup.server.ts).
// One location-only Details call, counted against the Details budget
// (kind "location"); a rescan refreshes them anyway.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlaceLocation } from "@/lib/google/places";
import { detailsCallAllowed, logPlacesDetailsCall, logPlacesDetailsSkip } from "@/lib/placesDetailsBudget.server";

export async function ensureLatLng(
  db: SupabaseClient,
  business: { id: string; place_id: string | null; lat: number | null; lng: number | null },
  fetchImpl: typeof fetch = fetch
): Promise<{ lat: number; lng: number } | null> {
  if (business.lat !== null && business.lng !== null) return { lat: business.lat, lng: business.lng };
  if (!business.place_id) return null;
  if (!(await detailsCallAllowed("location", { interactive: true }))) {
    await logPlacesDetailsSkip(business.id, "location");
    return null;
  }
  const location = await getPlaceLocation(business.place_id, fetchImpl).catch(() => null);
  await logPlacesDetailsCall(business.id, "location");
  if (!location) return null;
  try {
    await db.from("businesses").update({ lat: location.lat, lng: location.lng, lat_lng_fetched_at: new Date().toISOString() }).eq("id", business.id);
  } catch {
    // Saved next time; the caller still has them for this request.
  }
  return location;
}
