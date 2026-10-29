"use server";

// Niche + competitor-scope choices (Settings, the one-time banner, the
// Competitors page). Database only — never a Google call. Before
// supabase/business-niches.sql is run these return "not_enabled".

import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/premium";
import { resolveBizProfile } from "@/config/bizProfiles";
import { nicheById } from "@/lib/niches";
import { isMissingNicheColumns, loadBusinessNiche } from "@/lib/businessNiche.server";

export type NicheActionResult = { status: "ok" } | { status: "unauthenticated" } | { status: "not_enabled" } | { status: "not_found" } | { status: "error"; message: string };
export type SetNicheResult = { status: "ok"; changed: boolean; nicheId: string } | Exclude<NicheActionResult, { status: "ok" }>;

async function authed() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

/** The owner picks a niche (null = back to automatic). Also sets the parent
 * business type when it differs from what Google's listing suggests, so the
 * niche and the rest of the app always agree. */
export async function setBusinessNiche(businessId: string, nicheId: string | null): Promise<SetNicheResult> {
  const supabase = await authed();
  if (!supabase) return { status: "unauthenticated" };
  const niche = nicheId === null ? null : nicheById(nicheId);
  if (nicheId !== null && !niche) return { status: "error", message: "Unknown business type." };
  const { data: row, error } = await supabase.from("businesses").select("name, category, primary_type, categories").eq("id", businessId).maybeSingle();
  if (error || !row) return { status: "not_found" };
  const before = await loadBusinessNiche(supabase, businessId);
  const autoParent = resolveBizProfile(row.category, row.primary_type, null, "en", row.categories, row.name).id;
  const override = niche && niche.parent !== autoParent ? niche.parent : null;
  const update = await supabase
    .from("businesses")
    .update({
      niche_id: niche?.id ?? null,
      niche_source: niche ? "owner" : null,
      niche_confirmed_at: new Date().toISOString(),
      business_type_override: override,
      // A different type means the old area ticks no longer apply.
      competitor_areas: null,
    })
    .eq("id", businessId);
  if (update.error) {
    if (isMissingNicheColumns(update.error)) {
      // The type itself can still change before the SQL is run.
      const fallback = await supabase.from("businesses").update({ business_type_override: override }).eq("id", businessId);
      return fallback.error ? { status: "error", message: fallback.error.message } : { status: "not_enabled" };
    }
    return { status: "error", message: update.error.message };
  }
  const after = await loadBusinessNiche(supabase, businessId);
  const nowId = after?.resolved.nicheId ?? niche?.id ?? "default";
  return { status: "ok", changed: before?.resolved.nicheId !== nowId, nicheId: nowId };
}

export type UpdateCompetitorsResult =
  | { status: "updated"; placesCalls: number }
  | { status: "too_soon"; nextAvailableAt: string }
  | { status: "capped"; nextAvailableAt: string }
  | { status: "none_found" }
  /** Free: no competitor search — the saved list is narrowed to the new type. */
  | { status: "locked" }
  | { status: "error" };

/** After a niche change: ONE competitor search for this business only
 * (the niche's direct types + its ticked areas), counted against the
 * 30-day refresh cooldown and PLACES_SEARCH_MONTHLY_CAP. When either
 * blocks it, the saved competitors are already narrowed to the new niche
 * (lib/competitorScope.ts) — no call needed for that. */
export async function updateCompetitorsForNiche(businessId: string): Promise<UpdateCompetitorsResult> {
  const supabase = await authed();
  if (!supabase) return { status: "error" };
  if ((await getPlan()) === "free") return { status: "locked" };
  const { runAndSaveCompetitorScanWithClient } = await import("@/app/actions/competitors");
  const result = await runAndSaveCompetitorScanWithClient(supabase, businessId, { enforceCooldown: true, plan: await getPlan() });
  if (result.status === "saved") return { status: "updated", placesCalls: result.placesCalls ?? 0 };
  if (result.status === "too_soon" || result.status === "capped") return { status: result.status, nextAvailableAt: result.nextAvailableAt };
  if (result.status === "no_data") return { status: "none_found" };
  return { status: "error" };
}

/** "Looks right" on the banner: keep the detected niche, stop asking. */
export async function confirmBusinessNiche(businessId: string): Promise<NicheActionResult> {
  const supabase = await authed();
  if (!supabase) return { status: "unauthenticated" };
  const state = await loadBusinessNiche(supabase, businessId);
  if (!state) return { status: "not_found" };
  if (!state.enabled) return { status: "not_enabled" };
  const { error } = await supabase
    .from("businesses")
    .update({ niche_id: state.resolved.nicheId, niche_source: "owner", niche_confirmed_at: new Date().toISOString() })
    .eq("id", businessId);
  if (error) return isMissingNicheColumns(error) ? { status: "not_enabled" } : { status: "error", message: error.message };
  return { status: "ok" };
}

