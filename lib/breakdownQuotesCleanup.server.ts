// Server-only. Day 23 2c-3: removes the text quoting Google's values from
// breakdowns already saved (lib/breakdownStorage.ts) — the owner's scans
// (scores.breakdown_json) and competitors' (competitor_scans.breakdown_json
// and pending_breakdown_json, whose category lists 2b-3 left untouched).
// Points, confidence, flags and gaps stay. New scans already save this way.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { breakdownHasQuotes, breakdownWithoutQuotes } from "@/lib/breakdownStorage";

export interface BreakdownQuotesCounts {
  scores: number;
  scoresWithQuotes: number;
  competitorRows: number;
  competitorRowsWithQuotes: number;
}

async function eachPage(db: SupabaseClient, table: string, columns: string, visit: (rows: Array<Record<string, unknown>>) => Promise<void>) {
  for (let page = 0; ; page++) {
    const { data, error } = await db.from(table).select(columns).order("id").range(page * 500, page * 500 + 499);
    if (error) throw new Error(`${table}: ${error.message}`);
    await visit((data ?? []) as unknown as Array<Record<string, unknown>>);
    if ((data ?? []).length < 500) break;
  }
}

export async function cleanBreakdownQuotes(db: SupabaseClient, options: { dryRun: boolean }): Promise<BreakdownQuotesCounts> {
  const counts: BreakdownQuotesCounts = { scores: 0, scoresWithQuotes: 0, competitorRows: 0, competitorRowsWithQuotes: 0 };
  await eachPage(db, "scores", "id, breakdown_json", async (rows) => {
    for (const r of rows) {
      counts.scores++;
      if (!breakdownHasQuotes(r.breakdown_json)) continue;
      counts.scoresWithQuotes++;
      if (options.dryRun) continue;
      const { error } = await db.from("scores").update({ breakdown_json: breakdownWithoutQuotes(r.breakdown_json) }).eq("id", r.id);
      if (error) throw new Error(`scores: ${error.message}`);
    }
  });
  await eachPage(db, "competitor_scans", "id, breakdown_json, pending_breakdown_json", async (rows) => {
    for (const r of rows) {
      counts.competitorRows++;
      if (!breakdownHasQuotes(r.breakdown_json) && !breakdownHasQuotes(r.pending_breakdown_json)) continue;
      counts.competitorRowsWithQuotes++;
      if (options.dryRun) continue;
      const patch: Record<string, unknown> = { breakdown_json: breakdownWithoutQuotes(r.breakdown_json) };
      if (r.pending_breakdown_json) patch.pending_breakdown_json = breakdownWithoutQuotes(r.pending_breakdown_json);
      const { error } = await db.from("competitor_scans").update(patch).eq("id", r.id);
      if (error) throw new Error(`competitor_scans: ${error.message}`);
    }
  });
  return counts;
}
