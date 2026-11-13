import "server-only";

// Detects and saves a business's type (lib/businessTypeDetect.ts) — right
// after it's added, before its first score and competitor scan (so both use
// the type), and once for saved businesses with none
// (scripts/detect-business-types.ts). Saved as niche_source "auto"
// (supabase/niche-source-auto.sql): the Overview shows "We picked … —
// Change" until the owner confirms or changes it. Only when confident, only
// when no type is set — never over a type the owner chose. One plain fetch
// of the homepage for its words; no Google call.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBizProfile } from "@/config/bizProfiles";
import { nicheById } from "@/lib/niches";
import { detectBusinessType, type DetectResult } from "@/lib/businessTypeDetect";

export type DetectSaveResult =
  | { status: "saved" | "would_save"; nicheId: string; override: string | null; result: DetectResult }
  | { status: "unsure"; result: DetectResult }
  | { status: "already_set"; nicheId: string; source: string | null }
  | { status: "not_found" }
  /** supabase/niche-source-auto.sql isn't run yet: nothing saved. */
  | { status: "not_enabled"; nicheId: string; result: DetectResult }
  | { status: "error"; message: string };

/** The homepage's title, description and visible text (null when unreadable). */
export async function websiteWords(url: string | null, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!url) return null;
  try {
    const [{ fetchWebsiteHtml }, { extractVisibleText }] = await Promise.all([import("@/lib/websiteAnalysis"), import("@/lib/pagePresenceDetection")]);
    const { html } = await fetchWebsiteHtml(url, fetchImpl);
    if (!html) return null;
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const description = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? "";
    return `${title} ${description} ${extractVisibleText(html)}`.slice(0, 50_000);
  } catch {
    return null;
  }
}

export async function detectAndSaveBusinessTypeWithClient(
  db: SupabaseClient,
  businessId: string,
  options: { apply?: boolean; fetchImpl?: typeof fetch; readWebsite?: typeof websiteWords } = {}
): Promise<DetectSaveResult> {
  const apply = options.apply ?? true;
  const { data: row, error } = await db
    .from("businesses")
    .select("name, category, primary_type, categories, website, verified_website_url, niche_id, niche_source")
    .eq("id", businessId)
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!row) return { status: "not_found" };
  // A type is already set (by the owner, or picked before): never touched.
  if (row.niche_id || row.niche_source === "owner") return { status: "already_set", nicheId: row.niche_id ?? "", source: row.niche_source ?? null };

  const websiteText = await (options.readWebsite ?? websiteWords)(row.verified_website_url ?? row.website ?? null, options.fetchImpl);
  const result = detectBusinessType({ name: row.name, category: row.category, primaryType: row.primary_type, types: row.categories, websiteText });
  if (!result.confident || !result.nicheId) return { status: "unsure", result };
  const niche = nicheById(result.nicheId);
  if (!niche) return { status: "unsure", result };
  // Like the owner's own pick (setBusinessNiche): the parent type follows
  // the niche when Google's category points elsewhere.
  const autoParent = resolveBizProfile(row.category, row.primary_type, null, "en", row.categories, row.name).id;
  const override = niche.parent !== autoParent ? niche.parent : null;
  if (!apply) return { status: "would_save", nicheId: niche.id, override, result };

  const update = await db
    .from("businesses")
    .update({ niche_id: niche.id, niche_source: "auto", niche_confirmed_at: null, business_type_override: override, competitor_areas: null })
    .eq("id", businessId)
    // Never over a type set in the meantime.
    .is("niche_id", null);
  if (update.error) {
    if (update.error.code === "23514" || /niche_source_check/.test(update.error.message)) return { status: "not_enabled", nicheId: niche.id, result };
    return { status: "error", message: update.error.message };
  }
  return { status: "saved", nicheId: niche.id, override, result };
}
