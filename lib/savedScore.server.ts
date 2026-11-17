// Server-only. Day 23 2d-1: reads the latest saved scan per business for
// lib/savedScore.ts. RLS applies with an owner's client. A failed read
// returns nothing (callers then show today's breakdown, as before).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SAVED_SCORE_COLUMNS, type SavedScoreRow } from "@/lib/savedScore";

export async function latestSavedScore(db: SupabaseClient, businessId: string): Promise<SavedScoreRow | null> {
  try {
    const { data, error } = await db.from("scores").select(SAVED_SCORE_COLUMNS).eq("business_id", businessId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return error || !data ? null : (data as SavedScoreRow);
  } catch {
    return null;
  }
}

/** The latest saved scan of each business (one read; newest first wins). */
export async function latestSavedScores(db: SupabaseClient, businessIds: string[]): Promise<Map<string, SavedScoreRow>> {
  const latest = new Map<string, SavedScoreRow>();
  if (businessIds.length === 0) return latest;
  let read;
  try {
    read = await db.from("scores").select(`business_id, ${SAVED_SCORE_COLUMNS}`).in("business_id", businessIds).order("created_at", { ascending: false }).limit(5000);
  } catch {
    return latest;
  }
  const { data, error } = read;
  if (error) return latest;
  for (const r of (data ?? []) as Array<SavedScoreRow & { business_id: string }>) if (!latest.has(r.business_id)) latest.set(r.business_id, r);
  return latest;
}
