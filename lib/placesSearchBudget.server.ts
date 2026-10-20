// Counts and logs the month's Places search calls (whole project — the
// admin client, since Google bills the project, not one owner). The log is
// supabase/places-calls.sql; until it's run, the count is a conservative
// estimate: every competitor scan saved this month × the most a scan can
// make (4). Never blocks on a read error — it estimates instead.

import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_CALLS_PER_SCAN, monthStartUtc } from "@/lib/placesSearchBudget";

function missingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /places_calls/.test(error.message ?? ""));
}

export async function placesSearchCallsThisMonth(now: Date = new Date()): Promise<{ used: number; estimated: boolean }> {
  const admin = createAdminClient();
  const since = monthStartUtc(now);
  // Competitor searches only (owner re-scans are Details calls, logged as "owner_rescan").
  const logged = await admin.from("places_calls").select("calls").eq("kind", "competitor_scan").gte("created_at", since);
  if (!logged.error) return { used: (logged.data ?? []).reduce((sum, r) => sum + (Number((r as { calls: number }).calls) || 0), 0), estimated: false };
  if (!missingTable(logged.error)) return { used: 0, estimated: true };
  const scans = await admin.from("competitor_scans").select("scan_id").eq("is_subject", true).gte("created_at", since);
  const distinct = new Set((scans.data ?? []).map((r) => (r as { scan_id: string }).scan_id)).size;
  return { used: distinct * MAX_CALLS_PER_SCAN, estimated: true };
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

export async function logOwnerRescan(businessId: string): Promise<void> {
  try {
    await createAdminClient().from("places_calls").insert({ business_id: businessId, kind: "owner_rescan", calls: 1 });
  } catch {
    // Logging must never fail a re-scan.
  }
}
