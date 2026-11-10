import "server-only";

// What happens right after an owner adds a business (saveBusiness in
// app/actions/businesses.ts), in order:
// 1. Its first saved score — so history, "Since your last scan" and
//    Competitors work from day one. Adding a business used to save only
//    the listing, and the first `scores` row waited for a re-scan (the
//    real JT's, Finders Keepers, Monkey's Uncle and You've Been Framed
//    cases). It scores the data the add just saved — no Google call — and
//    is a no-op when the business already has a saved scan (re-adding
//    the same listing).
// 2. Its first competitor scan (once ever), which ranks it.
// Neither step ever fails the save.

import type { SupabaseClient } from "@supabase/supabase-js";

type SaveFirst = (supabase: SupabaseClient, businessId: string) => Promise<{ status: string; message?: string }>;
type EnsureCompetitors = (supabase: SupabaseClient, businessId: string) => Promise<unknown>;

/** Saves the business's first score snapshot unless it already has one. */
export async function saveFirstScoreSnapshotWithClient(
  supabase: SupabaseClient,
  businessId: string,
  // Loaded on demand: app/actions/scoring.ts imports app/actions/businesses.ts.
  save: (supabase: SupabaseClient, businessId: string) => Promise<{ status: string; message?: string }> = async (s, id) =>
    (await import("@/app/actions/scoring")).saveScoreSnapshotWithClient(s, id)
): Promise<{ status: string; message?: string }> {
  const { data, error } = await supabase.from("scores").select("id").eq("business_id", businessId).limit(1);
  if (error) return { status: "error", message: error.message };
  if ((data ?? []).length > 0) return { status: "already_saved" };
  return save(supabase, businessId);
}

export async function afterBusinessAdded(
  supabase: SupabaseClient,
  businessId: string,
  deps: { saveFirst?: SaveFirst; ensureCompetitors?: EnsureCompetitors } = {}
): Promise<void> {
  const saveFirst = deps.saveFirst ?? saveFirstScoreSnapshotWithClient;
  try {
    const first = await saveFirst(supabase, businessId);
    if (first.status === "error") console.error(`[businessAdded] first score for ${businessId}: ${first.message}`);
  } catch (err) {
    console.error(`[businessAdded] first score for ${businessId}:`, err instanceof Error ? err.message : err);
  }
  const ensureCompetitors = deps.ensureCompetitors ?? (async (s: SupabaseClient, id: string) => (await import("@/app/actions/competitors")).ensureFirstCompetitorScanWithClient(s, id));
  await ensureCompetitors(supabase, businessId);
}
