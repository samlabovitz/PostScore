// Counts and logs the month's Place Details calls in places_calls
// (supabase/places-calls.sql — `kind` is free text, so no table change),
// whole project (the admin client: Google bills the project). Never fails
// the caller: a read error allows the call, a write error is ignored.

import { createAdminClient } from "@/lib/supabase/admin";
import { monthStartUtc } from "@/lib/placesSearchBudget";
import { BILLED_DETAILS_KINDS, canMakeDetailsCall, placesDetailsMonthlyCap, skippedKind, type PlacesDetailsKind } from "@/lib/placesDetailsBudget";

/** Billed Details calls logged this calendar month (UTC). */
export async function placesDetailsCallsThisMonth(now: Date = new Date()): Promise<number | null> {
  try {
    const { data, error } = await createAdminClient()
      .from("places_calls")
      .select("calls")
      .in("kind", BILLED_DETAILS_KINDS as string[])
      .gte("created_at", monthStartUtc(now));
    if (error) return null;
    return (data ?? []).reduce((sum, r) => sum + (Number((r as { calls: number }).calls) || 0), 0);
  } catch {
    return null;
  }
}

/** Whether this call may run now. A failed count allows it (never blocks a scan on a read error). */
export async function detailsCallAllowed(kind: PlacesDetailsKind, now: Date = new Date()): Promise<boolean> {
  const used = await placesDetailsCallsThisMonth(now);
  return used === null || canMakeDetailsCall(kind, used, placesDetailsMonthlyCap());
}

/** One row per call (or `calls` for several made together). */
export async function logPlacesDetailsCall(businessId: string | null, kind: PlacesDetailsKind, calls = 1): Promise<void> {
  if (calls <= 0) return;
  try {
    await createAdminClient().from("places_calls").insert({ business_id: businessId, kind, calls });
  } catch {
    // Logging must never fail a scan or a page.
  }
}

/** The cap skipped a call: a 0-call row ("monthly_skipped"…) and a server log line. */
export async function logPlacesDetailsSkip(businessId: string | null, kind: PlacesDetailsKind): Promise<void> {
  console.warn(`[places-details] skipped a ${kind} call for ${businessId ?? "(no business)"}: PLACES_DETAILS_MONTHLY_CAP (${placesDetailsMonthlyCap()}) reached — keeping the saved listing data.`);
  try {
    await createAdminClient().from("places_calls").insert({ business_id: businessId, kind: skippedKind(kind), calls: 0 });
  } catch {
    // Never fail on a log.
  }
}
