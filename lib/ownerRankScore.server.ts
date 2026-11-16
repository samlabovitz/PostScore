// Server-only. The one rule every rank follows (the Competitors page, the
// Overview, the Reports page, the weekly recap, the monthly email): the
// owner is ranked by their latest saved score at that moment — never the
// score frozen into the competitor scan when it ran, which can be weeks
// older (Nov 16: 17 of 68 businesses' emails would have shown a different
// rank from their Competitors page).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withLatestOwnerScore, type SavedCompetitorScan } from "@/lib/savedCompetitorScans";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/** The business's newest `scores` breakdown (at or before `at`), or null. */
export async function latestScoreBreakdown(db: SupabaseClient, businessId: string, at?: string): Promise<unknown> {
  try {
    let q = db.from("scores").select("breakdown_json").eq("business_id", businessId);
    if (at) q = q.lte("created_at", at);
    const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    return (data as { breakdown_json: unknown } | null)?.breakdown_json ?? null;
  } catch {
    return null;
  }
}

/** The scan with the owner on that score (unchanged when there's none). */
export async function withOwnerScoreAt(db: SupabaseClient, businessId: string, scan: SavedCompetitorScan, at?: string, locale: Locale = DEFAULT_LOCALE): Promise<SavedCompetitorScan> {
  return withLatestOwnerScore(scan, await latestScoreBreakdown(db, businessId, at), locale);
}
