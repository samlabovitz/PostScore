// Server-only. The scoring job's live re-read of one competitor's listing
// (lib/competitorReread.ts): counted, capped, logged — never saved.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { monthStartUtc } from "@/lib/placesSearchBudget";
import { placesCallsTableMissing } from "@/lib/placesSearchBudget.server";
import { getCompetitorScoringListing } from "@/lib/google/places";
import { listingInputFromPlace, type CompetitorListingInput } from "@/lib/competitorFullScoring";
import { canReread, COMPETITOR_REREAD_KIND, competitorRereadMonthlyCap } from "@/lib/competitorReread";

async function rereadsThisMonth(now: Date): Promise<number | "missing" | "unreadable"> {
  try {
    const { data, error } = await createAdminClient().from("places_calls").select("calls").eq("kind", COMPETITOR_REREAD_KIND).gte("created_at", monthStartUtc(now));
    if (error) return placesCallsTableMissing(error) ? "missing" : "unreadable";
    return (data ?? []).reduce((sum, r) => sum + (Number((r as { calls: number }).calls) || 0), 0);
  } catch {
    return "unreadable";
  }
}

async function log(businessId: string, kind: string, calls: number): Promise<void> {
  try {
    await createAdminClient().from("places_calls").insert({ business_id: businessId, kind, calls });
  } catch {
    // Logging never fails a job.
  }
}

/** One competitor's listing now, or null (over the cap, count unreadable, or Google unreachable). */
export async function rereadCompetitorListing(placeId: string, businessId: string, now: Date = new Date()): Promise<CompetitorListingInput | null> {
  if (!canReread(await rereadsThisMonth(now), competitorRereadMonthlyCap())) {
    await log(businessId, `${COMPETITOR_REREAD_KIND}_skipped`, 0);
    return null;
  }
  const place = await getCompetitorScoringListing(placeId).catch(() => null);
  await log(businessId, COMPETITOR_REREAD_KIND, 1);
  return place ? listingInputFromPlace(place) : null;
}
