import "server-only";

// What happens right after an owner adds a business (saveBusiness in
// app/actions/businesses.ts), in order:
// 1. Its first saved score — so history, "Since your last scan" and
//    Competitors work from day one. Adding a business used to save only
//    the listing, and the first `scores` row waited for a re-scan (the
//    real JT's, Finders Keepers, Monkey's Uncle and You've Been Framed
//    cases). It scores the add's own Google read, in memory (Day 23 2d-4:
//    none of it is saved) — no second Google call — and
//    is a no-op when the business already has a saved scan (re-adding
//    the same listing).
//    Before it: its business type, when none is set and we're confident
//    (lib/businessTypeDetect.server.ts) — so the first score and the
//    competitor scan use it.
// 2. Its first competitor scan (once ever), which ranks it.
// Neither step ever fails the save.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingScoringColumns } from "@/lib/listingScoringRow";

type SaveFirst = (supabase: SupabaseClient, businessId: string, listing?: ListingScoringColumns) => Promise<{ status: string; message?: string }>;
type DetectType = (supabase: SupabaseClient, businessId: string, listing?: ListingScoringColumns) => Promise<{ status: string }>;
type EnsureCompetitors = (supabase: SupabaseClient, businessId: string) => Promise<unknown>;

/** Saves the business's first score snapshot unless it already has one. */
export async function saveFirstScoreSnapshotWithClient(
  supabase: SupabaseClient,
  businessId: string,
  // Loaded on demand: app/actions/scoring.ts imports app/actions/businesses.ts.
  // Day 23 2d-4: the add's own Google read, in memory (nothing of it was saved).
  listing?: ListingScoringColumns,
  save: (supabase: SupabaseClient, businessId: string, listing?: ListingScoringColumns) => Promise<{ status: string; message?: string }> = async (s, id, l) =>
    (await import("@/app/actions/scoring")).saveScoreSnapshotWithClient(s, id, undefined, { listing: l })
): Promise<{ status: string; message?: string }> {
  const { data, error } = await supabase.from("scores").select("id").eq("business_id", businessId).limit(1);
  if (error) return { status: "error", message: error.message };
  if ((data ?? []).length > 0) return { status: "already_saved" };
  return save(supabase, businessId, listing);
}

export async function afterBusinessAdded(
  supabase: SupabaseClient,
  businessId: string,
  deps: { saveFirst?: SaveFirst; ensureCompetitors?: EnsureCompetitors; detectType?: DetectType; listing?: ListingScoringColumns } = {}
): Promise<void> {
  const saveFirst = deps.saveFirst ?? ((s: SupabaseClient, id: string, l?: ListingScoringColumns) => saveFirstScoreSnapshotWithClient(s, id, l));
  const detectType = deps.detectType ?? (async (s: SupabaseClient, id: string, l?: ListingScoringColumns) => (await import("@/lib/businessTypeDetect.server")).detectAndSaveBusinessTypeWithClient(s, id, { listing: l }));
  try {
    const detected = await detectType(supabase, businessId, deps.listing);
    if (detected.status === "error" || detected.status === "not_enabled") console.error(`[businessAdded] business type for ${businessId}: ${detected.status}`);
  } catch (err) {
    console.error(`[businessAdded] business type for ${businessId}:`, err instanceof Error ? err.message : err);
  }
  try {
    const first = await saveFirst(supabase, businessId, deps.listing);
    if (first.status === "error") console.error(`[businessAdded] first score for ${businessId}: ${first.message}`);
  } catch (err) {
    console.error(`[businessAdded] first score for ${businessId}:`, err instanceof Error ? err.message : err);
  }
  const ensureCompetitors = deps.ensureCompetitors ?? (async (s: SupabaseClient, id: string) => (await import("@/app/actions/competitors")).ensureFirstCompetitorScanWithClient(s, id));
  await ensureCompetitors(supabase, businessId);
}
