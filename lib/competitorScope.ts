// Which competitors a business is ranked against (pure — saved scans only,
// never a Google call). A saved scan's competitors are sorted by name into:
//   • direct — the business's own niche (all of them when the business's
//     niche is its parent's general one, which is today's behavior);
//   • each "also competes with" area of the niche;
//   • "other similar businesses" — the rest of the scan (the parent's
//     general niche id), which the scan already found as same-category.
// The owner ticks which areas count. Ranking scope:
//   • "auto" (default): direct only when there are 3+ direct competitors,
//     otherwise direct + the ticked areas (with an honest line saying so);
//   • "direct" / "wide": the owner's explicit choice.
// rankBy / ownerStanding take this scope, so the Overview, reports, PDF,
// "Since your last visit", PostAI and the Competitors page all agree.

import { sameKindByTypes } from "@/lib/categoryFamily";
import type { SavedCompetitorEntry, SavedCompetitorScan } from "@/lib/savedCompetitorScans";
import { classifyCompetitor, isGeneralNiche, nicheById, nicheLabel } from "@/lib/niches";
import type { Locale } from "@/lib/i18n";

export type ScopeMode = "auto" | "direct" | "wide";
export const SCOPE_MODES: ScopeMode[] = ["auto", "direct", "wide"];
/** Auto uses direct only when at least this many direct competitors exist. */
export const MIN_DIRECT = 3;

export interface CompetitorScope {
  nicheId: string;
  parent: string;
  /** Ticked areas (niche ids, incl. the parent's general id for "other similar"). */
  areas: string[];
  mode: ScopeMode;
}

/** Every area a niche can tick: its own "also competes with" list plus the
 * parent's general niche ("other similar businesses"). */
export function availableAreas(nicheId: string): string[] {
  const n = nicheById(nicheId);
  if (!n || n.id === n.parent) return [];
  return Array.from(new Set([...n.areas.filter((a) => a !== n.id), n.parent]));
}

/** The ticks a business starts with: every area. */
export function defaultAreas(nicheId: string): string[] {
  return availableAreas(nicheId);
}

/** Saved ticks, kept only when they're real areas of this niche; none
 * saved → the defaults. */
export function effectiveAreas(nicheId: string, saved: string[] | null | undefined): string[] {
  const allowed = availableAreas(nicheId);
  if (!saved) return allowed;
  return saved.filter((a) => allowed.includes(a));
}

export function safeScopeMode(value: unknown): ScopeMode {
  return value === "direct" || value === "wide" ? value : "auto";
}

export interface ScopeGroups {
  direct: SavedCompetitorEntry[];
  /** Area id → its competitors (only areas with at least one). */
  byArea: Map<string, SavedCompetitorEntry[]>;
}

export function groupCompetitors(entries: SavedCompetitorEntry[], scope: Pick<CompetitorScope, "nicheId" | "parent">): ScopeGroups {
  const competitors = entries.filter((e) => !e.isSubject);
  const general = isGeneralNiche(scope.nicheId) || !nicheById(scope.nicheId);
  if (general) return { direct: competitors, byArea: new Map() };
  const areas = availableAreas(scope.nicheId);
  const otherId = scope.parent;
  const direct: SavedCompetitorEntry[] = [];
  const byArea = new Map<string, SavedCompetitorEntry[]>();
  const nicheTypes = nicheById(scope.nicheId)?.googleTypes ?? [];
  for (const e of competitors) {
    // The same kind as the search decided (lib/categoryFamily.ts): by
    // Google's types first — "Hair and Makeup Lounge" (hair_salon) and
    // Ilda's Salon (beauty_salon) are hair salons, whatever a name keyword
    // suggests. Names decide only when the types don't.
    const byTypes = nicheTypes.some((t) => sameKindByTypes(e.types?.[0], e.types, t));
    const niche = byTypes ? scope.nicheId : classifyCompetitor(e.name, { nicheId: scope.nicheId, areas, parent: scope.parent }, e.types);
    if (niche === scope.nicheId) direct.push(e);
    else {
      const area = niche && areas.includes(niche) ? niche : otherId;
      byArea.set(area, [...(byArea.get(area) ?? []), e]);
    }
  }
  return { direct, byArea };
}

export interface ScopedScan {
  scan: SavedCompetitorScan;
  /** What the ranking actually used. */
  effective: "direct" | "wide";
  directCount: number;
  /** Ticked areas that had competitors in the ranking (wide only). */
  areasUsed: string[];
  /** Auto switched to the wider set because direct competitors were few. */
  autoWidened: boolean;
}

/** Who the owner is ranked against: since competitor selection v2 (Oct 29)
 * the WHOLE saved list — the search already picked the right businesses
 * (Text Search, same kind, the owner's ticked areas, Remove / Add), so the
 * old "Rank against" narrowing (Automatic / Direct only / Direct + areas)
 * is gone. The groups are still counted, for PostAI's wording. */
export function applyScope(scan: SavedCompetitorScan, scope: CompetitorScope): ScopedScan {
  const groups = groupCompetitors(scan.entries, scope);
  return { scan, effective: "wide", directCount: groups.direct.length, areasUsed: [], autoWidened: false };
}

/** An area's name in a sentence ("sporting goods", "other similar businesses"). */
export function areaPhrase(areaId: string, scope: Pick<CompetitorScope, "parent">, locale: Locale): string {
  if (areaId === scope.parent) return locale === "es" ? "otros negocios similares cercanos" : "other similar businesses nearby";
  const label = nicheLabel(areaId, locale);
  return locale === "es" ? label.charAt(0).toLowerCase() + label.slice(1) : label.charAt(0).toLowerCase() + label.slice(1);
}

function joinList(items: string[], locale: Locale): string {
  if (items.length <= 1) return items.join("");
  const and = locale === "es" ? " y " : " and ";
  return `${items.slice(0, -1).join(", ")}${and}${items[items.length - 1]}`;
}

/** The honest line when auto widened the comparison; null otherwise. */
export function scopeNote(result: ScopedScan, scope: CompetitorScope, locale: Locale): string | null {
  if (!result.autoWidened) return null;
  const niche = nicheLabel(scope.nicheId, locale).toLowerCase();
  const areas = joinList(result.areasUsed.map((a) => areaPhrase(a, scope, locale)), locale);
  if (!areas) {
    return locale === "es"
      ? `Hay pocos competidores directos cerca (${niche}: ${result.directCount}). Marque otras áreas abajo para compararse con más negocios.`
      : `Few direct competitors nearby (${niche}: ${result.directCount}). Tick other areas below to compare with more businesses.`;
  }
  return locale === "es"
    ? `Hay pocos competidores directos cerca (${niche}: ${result.directCount}), así que también lo comparamos con ${areas}.`
    : `Few direct competitors nearby (${niche}: ${result.directCount}), so we're also comparing you with ${areas}.`;
}

/** One line on who the rank is against (PostAI's context; English). */
export function scopeSummary(result: ScopedScan): string {
  const n = result.scan.entries.filter((e) => !e.isSubject).length;
  return `all ${n} saved competitors — the businesses Google shows when customers search for this kind of business nearby`;
}

/** The Google types a niche-aware competitor search uses: the niche's own
 * (direct) and the ticked areas' (one wider search). A general niche
 * searches as before (no types). */
export function nicheSearchTypes(scope: CompetitorScope): { directTypes: string[]; wideTypes: string[] } | null {
  const n = nicheById(scope.nicheId);
  if (!n || n.id === n.parent) return null;
  // The ticked "also competes with" areas are retired (Oct 29): competitor
  // selection v2 finds who customers see, and owners Add / Remove the rest.
  // No wider "areas" search any more.
  return { directTypes: n.googleTypes, wideTypes: [] };
}

/** The comparison group the scope actually uses, in words, for review and
 * rank lines: "skate & snow shop and sporting goods businesses nearby" —
 * the niche plus the areas in use — or, without a niche, the business
 * type's own noun ("nearby salons"). */
export function scopeGroupLabel(scan: SavedCompetitorScan, scope: CompetitorScope | null | undefined, locale: Locale, fallbackNoun: string): string {
  const fallback = locale === "es" ? `${fallbackNoun} cercanos` : `nearby ${fallbackNoun}`;
  if (!scope || isGeneralNiche(scope.nicheId) || !nicheById(scope.nicheId)) return fallback;
  const result = applyScope(scan, scope);
  const niche = nicheLabel(scope.nicheId, locale).toLowerCase();
  const parts = [niche, ...(result.effective === "wide" ? result.areasUsed.filter((a) => a !== scope.parent).map((a) => areaPhrase(a, scope, locale)) : [])];
  const list = joinList(parts, locale) ?? niche;
  return locale === "es" ? `negocios cercanos de ${list}` : `${list} businesses nearby`;
}
