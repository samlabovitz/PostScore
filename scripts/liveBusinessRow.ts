// Day 23 2d-5: for the dev scripts that mirror the app's own reads
// (scripts/live-check-postai.ts, scripts/preview-assistant-context.ts):
// a business row with Google's values as Google shows them now and the
// owner's confirmed name and address over them — exactly what pages show.
// Google's values aren't saved, so this costs one counted, capped Places
// read per business (cached 10 minutes; Business Profile when connected).
import type { SupabaseClient } from "@supabase/supabase-js";
import { allowServerOnly } from "./allowServerOnly";

export async function liveBusinessRow<T extends { place_id?: string | null; listing_mode?: string | null }>(db: SupabaseClient, businessId: string, row: T) {
  allowServerOnly();
  const [{ withLiveListingFor }, { withOwnerDetailsFor }] = await Promise.all([import("../lib/ownerListing.server"), import("../lib/ownerDetails.server")]);
  return withOwnerDetailsFor(db, businessId, await withLiveListingFor(db, businessId, row));
}

/** The first business whose shown name contains `match` (case-insensitive), or null. */
export async function findBusinessByName(db: SupabaseClient, match: string): Promise<{ id: string; name: string | null; owner_id: string } | null> {
  allowServerOnly();
  const { data } = await db.from("businesses").select("id, owner_id").is("archived_at", null);
  const rows = (data ?? []) as Array<{ id: string; owner_id: string }>;
  const { shownNamesFor } = await import("../lib/ownerDetails.server");
  const names = await shownNamesFor(db, rows.map((r) => r.id));
  const want = match.toLowerCase();
  const hit = rows.find((r) => (names.get(r.id)?.name ?? "").toLowerCase().includes(want));
  return hit ? { ...hit, name: names.get(hit.id)?.name ?? null } : null;
}
