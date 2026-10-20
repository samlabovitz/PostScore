// Loads a business's niche + competitor scope from the database. The
// niche columns come from supabase/business-niches.sql; until it's run,
// they read as "not set" (detection + default scope) — never an error.

import type { SupabaseClient } from "@supabase/supabase-js";
import { competitorScopeFor, resolveBusinessNiche, type BusinessNicheRow, type ResolvedNiche } from "@/lib/businessNiche";
import type { CompetitorScope } from "@/lib/competitorScope";

const BASE = "name, category, primary_type, categories, business_type_override, trade_id";
const NICHE = "niche_id, niche_source, niche_confirmed_at, competitor_areas, competitor_scope";

export interface BusinessNicheState {
  resolved: ResolvedNiche;
  scope: CompetitorScope;
  /** false until supabase/business-niches.sql has been run (choices can't be saved). */
  enabled: boolean;
}

export function isMissingNicheColumns(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || /niche_|competitor_areas|competitor_scope/.test(error.message ?? ""));
}

export async function loadBusinessNiche(supabase: SupabaseClient, businessId: string): Promise<BusinessNicheState | null> {
  try {
    return await load(supabase, businessId);
  } catch {
    // An unreadable row means "no scope": ranking falls back to the whole scan.
    return null;
  }
}

async function load(supabase: SupabaseClient, businessId: string): Promise<BusinessNicheState | null> {
  const full = await supabase.from("businesses").select(`${BASE}, ${NICHE}`).eq("id", businessId).maybeSingle();
  let row = full.data as BusinessNicheRow | null;
  let enabled = !full.error;
  if (full.error) {
    if (!isMissingNicheColumns(full.error)) return null;
    const base = await supabase.from("businesses").select(BASE).eq("id", businessId).maybeSingle();
    if (base.error || !base.data) return null;
    row = base.data as BusinessNicheRow;
    enabled = false;
  }
  if (!row) return null;
  const resolved = resolveBusinessNiche(row);
  return { resolved, scope: competitorScopeFor(resolved, row), enabled };
}

/** Just the ranking scope (null when the business can't be read). */
export async function loadCompetitorScope(supabase: SupabaseClient, businessId: string): Promise<CompetitorScope | null> {
  return (await loadBusinessNiche(supabase, businessId))?.scope ?? null;
}
