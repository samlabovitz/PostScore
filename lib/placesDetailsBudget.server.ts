// Counts and logs the month's Place Details calls in places_calls
// (supabase/places-calls.sql — `kind` is free text, so no table change),
// whole project (the admin client: Google bills the project). A write
// error is ignored. Before the table exists (development) every call is
// allowed; a database read error is logged and blocks batch callers —
// only a single interactive owner action still runs.

import { createAdminClient } from "@/lib/supabase/admin";
import { countUnreadableAllows, monthStartUtc } from "@/lib/placesSearchBudget";
import { placesCallsTableMissing } from "@/lib/placesSearchBudget.server";
import { BILLED_DETAILS_KINDS, canMakeDetailsCall, isInteractiveDetailsKind, placesDetailsMonthlyCap, skippedKind, type PlacesDetailsKind } from "@/lib/placesDetailsBudget";

/** Billed Details calls logged this calendar month (UTC); "missing" before
 * supabase/places-calls.sql, "unreadable" on any other read error. */
export async function placesDetailsCallsThisMonth(now: Date = new Date()): Promise<number | "missing" | "unreadable"> {
  try {
    const { data, error } = await createAdminClient()
      .from("places_calls")
      .select("calls")
      .in("kind", BILLED_DETAILS_KINDS as string[])
      .gte("created_at", monthStartUtc(now));
    if (error) {
      if (placesCallsTableMissing(error)) return "missing";
      console.error(`[places-details] couldn't read this month's Details count: ${error.code ?? ""} ${error.message ?? ""}`.trim());
      return "unreadable";
    }
    return (data ?? []).reduce((sum, r) => sum + (Number((r as { calls: number }).calls) || 0), 0);
  } catch (err) {
    console.error("[places-details] couldn't read this month's Details count:", err instanceof Error ? err.message : err);
    return "unreadable";
  }
}

/**
 * Whether this call may run now. `interactive`: a single owner action (by
 * default, from the kind — "owner_rescan", "competitor_added"); a
 * "website_retry" passes its re-scan's. An unreadable count allows only
 * an interactive call.
 */
export async function detailsCallAllowed(kind: PlacesDetailsKind, opts: { interactive?: boolean; now?: Date } = {}): Promise<boolean> {
  const used = await placesDetailsCallsThisMonth(opts.now ?? new Date());
  if (used === "missing") return true;
  // "photos" is never blocked (free SKU), counted or not.
  if (used === "unreadable") return canMakeDetailsCall(kind, Infinity, 0) || countUnreadableAllows(opts.interactive ?? isInteractiveDetailsKind(kind));
  return canMakeDetailsCall(kind, used, placesDetailsMonthlyCap());
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
