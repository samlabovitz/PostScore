// Server-only. Day 23 2d-1: fills businesses.biz_type_resolved (our own
// saved business type) from today's saved Google category/types, the
// same reading a scan now saves (savedBizTypeId). Also checks that every
// business resolves to the same type with the saved value as without it,
// so pages show the same type before and after, even once Google's
// category and types are no longer kept. Writes only that column.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBizProfile, savedBizTypeId } from "@/config/bizProfiles";

interface Row {
  id: string;
  name: string | null;
  category: string | null;
  primary_type: string | null;
  categories: string[] | null;
  business_type_override: string | null;
  biz_type_resolved: string | null;
}

export interface BizTypeResolvedCounts {
  businesses: number;
  /** Already saved with today's value. */
  current: number;
  /** Would be (or were) filled or updated. */
  due: number;
  written: number;
  /** Businesses whose shown type would differ with the saved value (must be 0). */
  mismatches: Array<{ id: string; before: string; after: string }>;
}

export async function backfillBizTypeResolved(db: SupabaseClient, options: { dryRun: boolean }): Promise<BizTypeResolvedCounts> {
  const { data, error } = await db.from("businesses").select("id, name, category, primary_type, categories, business_type_override, biz_type_resolved").order("id");
  if (error) throw new Error(`businesses: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const counts: BizTypeResolvedCounts = { businesses: rows.length, current: 0, due: 0, written: 0, mismatches: [] };
  const updates: Array<{ id: string; type: string }> = [];
  for (const r of rows) {
    const type = savedBizTypeId(r.category, r.primary_type, r.categories);
    const before = resolveBizProfile(r.category, r.primary_type, r.business_type_override, "en", r.categories, r.name).id;
    // With Google's category and types gone (2d-5): the saved value alone.
    const after = resolveBizProfile(null, null, r.business_type_override, "en", null, r.name, type).id;
    if (before !== after) counts.mismatches.push({ id: r.id, before, after });
    if (r.biz_type_resolved === type) counts.current++;
    else updates.push({ id: r.id, type });
  }
  counts.due = updates.length;
  if (options.dryRun || counts.mismatches.length > 0) return counts;
  for (const u of updates) {
    const { error: e } = await db.from("businesses").update({ biz_type_resolved: u.type }).eq("id", u.id);
    if (e) throw new Error(`businesses ${u.id}: ${e.message}`);
    counts.written++;
  }
  return counts;
}
