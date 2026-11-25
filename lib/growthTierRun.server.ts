// Server-only. Day 25B step 6: the Monday recompute — every business's Growth
// tier from the week that just closed (lib/growthTier.ts), saved as our own
// facts in growth_weeks and growth_tiers (supabase/growth-tiers.sql). Dry run
// unless GROWTH_TIERS_LIVE is "true" (off until Sam approves). Never emails or
// notifies anyone; never writes a Google value.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, computeTiers, localDate, mondayOf } from "@/lib/growthTier";
import { loadGrowthFacts, loadInternalAccounts } from "@/lib/growthTier.server";

export function growthTiersLive(env: Record<string, string | undefined> = process.env): boolean {
  return env.GROWTH_TIERS_LIVE === "true";
}

export interface GrowthRunSummary {
  dryRun: boolean;
  monday: string;
  businesses: number;
  byTier: Record<number, number>;
  ups: number;
  downs: number;
  warnings: number;
  written: number;
}

/** The weeks behind each tier: the tier starts at 1 this many weeks back, so every window has history. */
const HISTORY_WEEKS = 24;

export async function runGrowthTiers(admin: SupabaseClient, opts: { dryRun: boolean; now?: Date }): Promise<GrowthRunSummary> {
  const now = opts.now ?? new Date();
  const monday = mondayOf(localDate(now.toISOString(), "America/New_York"));
  const internal = await loadInternalAccounts(admin);
  const { data: businesses } = await admin.from("businesses").select("id, listing_mode").is("archived_at", null);
  const summary: GrowthRunSummary = { dryRun: opts.dryRun, monday, businesses: 0, byTier: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, ups: 0, downs: 0, warnings: 0, written: 0 };
  for (const b of (businesses ?? []) as Array<{ id: string; listing_mode: string | null }>) {
    if (b.listing_mode === "website_only") continue;
    const loaded = await loadGrowthFacts(admin, b.id, internal);
    if (!loaded) continue;
    const tiers = computeTiers(loaded.facts, addDays(monday, -7 * HISTORY_WEEKS), monday);
    const latest = tiers[tiers.length - 1];
    if (!latest) continue;
    summary.businesses++;
    summary.byTier[latest.tier]++;
    if (latest.change === "up" || latest.change === "restored") summary.ups++;
    if (latest.change.startsWith("down")) summary.downs++;
    if (latest.warning) summary.warnings++;
    if (opts.dryRun) continue;
    const counts = loaded.facts.countTestRows;
    const weeks = tiers.slice(-12).map((t) => ({ business_id: b.id, week_start: t.week.weekStart, active: t.week.active, verified_actions: t.week.verified, told_actions: t.week.told, neutral_reason: t.week.neutral, counts_test_rows: counts, computed_at: now.toISOString() }));
    const { error: wErr } = await admin.from("growth_weeks").upsert(weeks, { onConflict: "business_id,week_start" });
    const { error: tErr } = await admin.from("growth_tiers").upsert(
      { business_id: b.id, monday: latest.monday, tier: latest.tier, change: latest.change, reason: latest.reason, warning: latest.warning, counts_test_rows: counts, computed_at: now.toISOString() },
      { onConflict: "business_id,monday" }
    );
    if (!wErr && !tErr) summary.written++;
  }
  return summary;
}
