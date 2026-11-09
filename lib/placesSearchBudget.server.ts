// Counts and logs the month's Places search calls (whole project — the
// admin client, since Google bills the project, not one owner). The log is
// supabase/places-calls.sql; until it's run, the count is a conservative
// estimate: every competitor scan saved this month × the most a scan can
// make (4).
//
// Any other read error is "unreadable" (logged): the monthly job,
// rescan-all and other batch callers stop, and only a single interactive
// owner action still runs (lib/placesSearchBudget.ts countUnreadableAllows).

import { createAdminClient } from "@/lib/supabase/admin";
import { COMPETITOR_NAME_SEARCH_KIND, MAX_CALLS_PER_SCAN, monthStartUtc } from "@/lib/placesSearchBudget";

/** places_calls isn't there yet (supabase/places-calls.sql not run — development). */
export function placesCallsTableMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /places_calls/.test(error.message ?? ""));
}

export type PlacesSearchCount =
  | { used: number; estimated: boolean; unreadable?: undefined }
  /** A database error (not a missing table): the count is unknown. */
  | { used: null; estimated: false; unreadable: true };

export async function placesSearchCallsThisMonth(now: Date = new Date()): Promise<PlacesSearchCount> {
  const since = monthStartUtc(now);
  let logged;
  try {
    // Competitor searches only (owner re-scans are Details calls, logged as "owner_rescan").
    logged = await createAdminClient().from("places_calls").select("calls").eq("kind", "competitor_scan").gte("created_at", since);
  } catch (err) {
    console.error("[places-search] couldn't read this month's search count:", err instanceof Error ? err.message : err);
    return { used: null, estimated: false, unreadable: true };
  }
  if (!logged.error) return { used: (logged.data ?? []).reduce((sum, r) => sum + (Number((r as { calls: number }).calls) || 0), 0), estimated: false };
  if (!placesCallsTableMissing(logged.error)) {
    console.error(`[places-search] couldn't read this month's search count: ${logged.error.code ?? ""} ${logged.error.message ?? ""}`.trim());
    return { used: null, estimated: false, unreadable: true };
  }
  const admin = createAdminClient();
  const scans = await admin.from("competitor_scans").select("scan_id").eq("is_subject", true).gte("created_at", since);
  const distinct = new Set((scans.data ?? []).map((r) => (r as { scan_id: string }).scan_id)).size;
  return { used: distinct * MAX_CALLS_PER_SCAN, estimated: true };
}

/**
 * Marks one "Add a competitor" name search for this business — BEFORE
 * Google is called — then counts this business's marks in the last 24
 * hours, this one included. Insert-then-count: two submits at once both
 * see each other, so neither slips past the limit. Returns the count and
 * a `release` that removes this mark (a refused search doesn't count);
 * null when it can't be written or read (the monthly cap still holds).
 */
export async function recordCompetitorNameSearch(businessId: string, now: Date = new Date()): Promise<{ count: number; release: () => Promise<void> } | null> {
  try {
    const admin = createAdminClient();
    const { data: mark, error: insertError } = await admin.from("places_calls").insert({ business_id: businessId, kind: COMPETITOR_NAME_SEARCH_KIND, calls: 0 }).select("id").single();
    if (insertError || !mark) {
      if (!placesCallsTableMissing(insertError)) console.error(`[places-search] couldn't record a competitor name search: ${insertError?.code ?? ""} ${insertError?.message ?? ""}`.trim());
      return null;
    }
    const { count, error } = await admin
      .from("places_calls")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("kind", COMPETITOR_NAME_SEARCH_KIND)
      .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
    if (error) {
      console.error(`[places-search] couldn't count competitor name searches: ${error.code ?? ""} ${error.message ?? ""}`.trim());
      return null;
    }
    const id = (mark as { id: string }).id;
    return {
      count: count ?? 1,
      release: async () => {
        await admin.from("places_calls").delete().eq("id", id);
      },
    };
  } catch (err) {
    console.error("[places-search] couldn't record a competitor name search:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function logPlacesSearchCalls(businessId: string, calls: number): Promise<void> {
  if (calls <= 0) return;
  try {
    await createAdminClient().from("places_calls").insert({ business_id: businessId, kind: "competitor_scan", calls });
  } catch {
    // Logging must never fail a scan (the table may not exist yet).
  }
}

/** When this business's owner last re-scanned (an owner re-scan is one
 * Places Details call, logged as kind "owner_rescan"); null when never
 * logged or the log isn't there. Free's monthly limit reads this. */
export async function lastOwnerRescanAt(businessId: string): Promise<string | null> {
  try {
    const { data, error } = await createAdminClient()
      .from("places_calls")
      .select("created_at")
      .eq("business_id", businessId)
      .eq("kind", "owner_rescan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return error || !data ? null : (data as { created_at: string }).created_at;
  } catch {
    return null;
  }
}
