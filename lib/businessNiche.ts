// A business's niche and competitor scope, from its saved row (pure).
// The niche must belong to the business's parent type (resolveBizProfile,
// unchanged); a saved niche that doesn't (e.g. the owner later changed the
// type) is ignored rather than trusted. Nothing is guessed silently: until
// the owner confirms or changes it, a detected or approved niche shows the
// one-time "We think you're a … — Change" banner.

import { resolveBizProfile } from "@/config/bizProfiles";
import { detectNiche, isGeneralNiche, nicheById, nichesOfParent, suggestNiche, type NicheConfidence } from "@/lib/niches";
import { effectiveAreas, safeScopeMode, type CompetitorScope } from "@/lib/competitorScope";
import { tradeLabel } from "@/lib/tradeSearch";

export interface BusinessNicheRow {
  name: string | null;
  category: string | null;
  primary_type: string | null;
  categories: string[] | null;
  business_type_override: string | null;
  trade_id?: string | null;
  /** Columns from supabase/business-niches.sql — undefined until it's run. */
  niche_id?: string | null;
  niche_source?: string | null;
  niche_confirmed_at?: string | null;
  competitor_areas?: string[] | null;
  competitor_scope?: string | null;
}

export type NicheSource = "owner" | "approved" | "detected";

export interface ResolvedNiche {
  nicheId: string;
  parent: string;
  source: NicheSource;
  confidence: NicheConfidence | "saved";
  /** A niche under a different parent that Google points to (suggestion only). */
  suggestion: string | null;
  /** We couldn't place it more precisely than the parent: ask the owner. */
  needsOwner: boolean;
  confirmed: boolean;
  /** Show the one-time "We think you're…" banner. */
  showBanner: boolean;
}

export function resolveBusinessNiche(row: BusinessNicheRow): ResolvedNiche {
  const parent = resolveBizProfile(row.category, row.primary_type, row.business_type_override, "en", row.categories, row.name).id;
  const saved = nicheById(row.niche_id);
  const confirmed = !!row.niche_confirmed_at;
  const input = {
    name: row.name,
    category: row.category,
    primaryType: row.primary_type,
    types: row.categories,
    tradeName: row.trade_id ? tradeLabel(row.trade_id, "en") : null,
  };
  if (saved && saved.parent === parent) {
    const source: NicheSource = row.niche_source === "approved" ? "approved" : "owner";
    return { nicheId: saved.id, parent, source, confidence: "saved", suggestion: null, needsOwner: false, confirmed, showBanner: !confirmed && source !== "owner" };
  }
  const detected = detectNiche(input, parent);
  const suggestion = suggestNiche(input, parent);
  const needsOwner = detected.confidence === "general" && !suggestion && nichesOfParent(parent).length > 0;
  return { nicheId: detected.nicheId, parent, source: "detected", confidence: detected.confidence, suggestion, needsOwner, confirmed, showBanner: !confirmed };
}

/** The ranking scope for this business (defaults until the owner changes them). */
export function competitorScopeFor(resolved: ResolvedNiche, row: Pick<BusinessNicheRow, "competitor_areas" | "competitor_scope">): CompetitorScope {
  return {
    nicheId: resolved.nicheId,
    parent: resolved.parent,
    areas: effectiveAreas(resolved.nicheId, row.competitor_areas ?? null),
    mode: isGeneralNiche(resolved.nicheId) ? "direct" : safeScopeMode(row.competitor_scope),
  };
}

export type NicheBannerKind = "weThink" | "suggest" | "needsOwner";

/** Which one-time banner (if any) a business gets. */
export function nicheBannerKind(resolved: Pick<ResolvedNiche, "showBanner" | "suggestion" | "needsOwner">): NicheBannerKind | null {
  if (!resolved.showBanner) return null;
  if (resolved.suggestion) return "suggest";
  if (resolved.needsOwner) return "needsOwner";
  return "weThink";
}
