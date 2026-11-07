// Reads and writes the onboarding lookup's budget in places_calls (whole
// project — the admin client: Google bills the project). See
// lib/onboardingLookupBudget.ts for the rules.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { monthStartUtc } from "@/lib/placesSearchBudget";
import { ONBOARDING_CALL_KINDS, ONBOARDING_LOOKUP_KIND, onboardingCallRows } from "@/lib/onboardingLookupBudget";

/** Onboarding's Google calls this calendar month (UTC); null when the count can't be read. */
export async function onboardingCallsThisMonth(now: Date = new Date()): Promise<number | null> {
  try {
    const { data, error } = await createAdminClient()
      .from("places_calls")
      .select("calls")
      .in("kind", ONBOARDING_CALL_KINDS as unknown as string[])
      .gte("created_at", monthStartUtc(now));
    if (error) return null;
    return (data ?? []).reduce((sum, r) => sum + (Number((r as { calls: number }).calls) || 0), 0);
  } catch {
    return null;
  }
}

/** The places_calls.user_id column isn't there yet (supabase/onboarding-lookup-limit.sql). */
function missingUserColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || error.code === "PGRST204" || /user_id/.test(error.message ?? "");
}

/**
 * This user's lookups in the last 24 hours. null = the per-user log isn't
 * set up yet (the ceiling still applies); "error" = it couldn't be read.
 */
export async function onboardingLookupsToday(userId: string, now: Date = new Date()): Promise<number | null | "error"> {
  try {
    const { count, error } = await createAdminClient()
      .from("places_calls")
      .select("id", { count: "exact", head: true })
      .eq("kind", ONBOARDING_LOOKUP_KIND)
      .eq("user_id", userId)
      .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
    if (error) return missingUserColumn(error) ? null : "error";
    return count ?? 0;
  } catch {
    return "error";
  }
}

/** Marks one lookup for the per-user limit — written BEFORE calling Google. */
export async function recordOnboardingLookup(userId: string): Promise<void> {
  try {
    await createAdminClient().from("places_calls").insert({ business_id: null, kind: ONBOARDING_LOOKUP_KIND, calls: 0, user_id: userId });
  } catch {
    // The column may not exist yet; the ceiling still applies.
  }
}

/** Logs the Google calls one lookup made (each kind its own row). */
export async function logOnboardingCalls(paidCalls: { textSearch: number; details: number; geocode: number }): Promise<void> {
  const rows = onboardingCallRows(paidCalls).map((r) => ({ business_id: null, kind: r.kind, calls: r.calls }));
  if (rows.length === 0) return;
  try {
    await createAdminClient().from("places_calls").insert(rows);
  } catch {
    // Logging must never fail the lookup.
  }
}
