// Server-only. A business's Google service options (dine-in, takeout,
// delivery…) as Google shows them now — Day 23 2d-4: from the visit's live
// read (lib/ownerListing.server.ts), never saved.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceOptions } from "@/lib/google/places";
import { parseServiceOptions } from "@/lib/serviceOptions";

/** null = Google couldn't be read, or shows none. */
export async function readServiceOptions(supabase: SupabaseClient, businessId: string): Promise<ServiceOptions | null> {
  try {
    const { data, error } = await supabase.from("businesses").select("place_id, listing_mode").eq("id", businessId).maybeSingle();
    if (error || !data) return null;
    const { liveListingForRow } = await import("@/lib/ownerListing.server");
    const live = await liveListingForRow(supabase, businessId, data as { place_id: string | null; listing_mode: string | null });
    return live.status === "ok" ? parseServiceOptions(live.columns.google_service_options ?? null) : null;
  } catch {
    return null;
  }
}
