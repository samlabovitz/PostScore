// Niche detection (pure). A business's niche is found WITHIN its parent
// business type (config/bizProfiles.ts resolveBizProfile — unchanged), so
// detecting a niche never changes a business's scoring or content:
//   1. the owner's saved niche (or an approved correction), if it belongs
//      to the parent;
//   2. Google's primary type, then secondary types;
//   3. whole-word keywords in the name, Google category and intake trade;
//   4. the parent's "general" niche (same id as the parent).
// A niche from a DIFFERENT parent is only ever a suggestion ("We think
// you're an Ice cream shop — Change"), never applied silently.

import { getBizProfileOptions } from "@/config/bizProfiles";
import { NICHE_PARENTS, SPECIFIC_NICHES, generalNicheSignals, type NicheDef } from "@/config/niches";
import type { BusinessTypeId } from "@/lib/tradeSearch";
import type { Locale } from "@/lib/i18n";

let cache: { all: NicheDef[]; byId: Map<string, NicheDef> } | null = null;

function build(): { all: NicheDef[]; byId: Map<string, NicheDef> } {
  if (cache) return cache;
  const en = new Map(getBizProfileOptions("en").map((o) => [o.id, o.label]));
  const es = new Map(getBizProfileOptions("es").map((o) => [o.id, o.label]));
  const general: NicheDef[] = NICHE_PARENTS.map((parent) => ({
    id: parent,
    parent,
    label: { en: en.get(parent) ?? parent, es: es.get(parent) ?? en.get(parent) ?? parent },
    ...generalNicheSignals(parent),
  }));
  const all = [...general, ...SPECIFIC_NICHES];
  cache = { all, byId: new Map(all.map((n) => [n.id, n])) };
  return cache;
}

export function allNiches(): NicheDef[] {
  return build().all;
}

export function nicheById(id: string | null | undefined): NicheDef | null {
  return id ? build().byId.get(id) ?? null : null;
}

export function nicheLabel(id: string, locale: Locale): string {
  const n = nicheById(id);
  return n ? n.label[locale] : id;
}

/** True for a parent's own "general" niche. */
export function isGeneralNiche(id: string): boolean {
  const n = nicheById(id);
  return !!n && n.id === n.parent;
}

export function nichesOfParent(parent: string): NicheDef[] {
  return allNiches().filter((n) => n.parent === parent && n.id !== parent);
}

function norm(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’′]/g, "'");
}

function hasKeyword(text: string, keyword: string): boolean {
  if (!text) return false;
  const kw = norm(keyword).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`).test(norm(text));
}

export interface NicheInput {
  name: string | null;
  category: string | null;
  primaryType: string | null;
  types: string[] | null;
  /** The trade picked at intake (lib/tradeSearch.ts), as its name. */
  tradeName?: string | null;
}

/** Google types that say nothing about the niche on their own. */
const GENERIC_TYPES = new Set(["restaurant", "store", "service", "establishment", "point_of_interest", "food", "health", "shopping_mall"]);

/** How strongly a niche matches. The business's own name says most
 * ("Switch Skate & Snow"), then Google's primary type, then the category
 * or intake trade. Secondary types count only when the primary type is
 * generic ("restaurant", "store"), earlier ones first. */
function score(n: NicheDef, input: NicheInput): number {
  let s = 0;
  if (n.keywords.some((k) => hasKeyword(input.name ?? "", k))) s += 120;
  const primaryHit = !!input.primaryType && n.googleTypes.includes(input.primaryType);
  if (primaryHit) s += 100;
  // Google's category text is its primary type in words — count it only
  // when the primary type didn't already match (never twice).
  else if (n.keywords.some((k) => hasKeyword(input.category ?? "", k) || hasKeyword(input.tradeName ?? "", k))) s += 50;
  if (!input.primaryType || GENERIC_TYPES.has(input.primaryType)) {
    const i = (input.types ?? []).findIndex((t) => t !== input.primaryType && n.googleTypes.includes(t));
    if (i >= 0) s += 20 - Math.min(i, 9);
  }
  return s;
}

export type NicheConfidence = "google" | "keyword" | "general";

/** The best niche within `parent` (its general niche when nothing fits). */
export function detectNiche(input: NicheInput, parent: string): { nicheId: string; confidence: NicheConfidence } {
  let best: { n: NicheDef; s: number } | null = null;
  for (const n of nichesOfParent(parent)) {
    const s = score(n, input);
    if (s > 0 && (!best || s > best.s)) best = { n, s };
  }
  if (!best) return { nicheId: nicheById(parent) ? parent : "default", confidence: "general" };
  const primaryHit = !!input.primaryType && best.n.googleTypes.includes(input.primaryType);
  return { nicheId: best.n.id, confidence: primaryHit ? "google" : "keyword" };
}

/** A niche under a DIFFERENT parent that Google's own primary type points
 * to — offered as a suggestion only (e.g. an owner who set "Café" while
 * Google lists an ice cream shop). */
export function suggestNiche(input: NicheInput, parent: string): string | null {
  if (!input.primaryType) return null;
  const hit = SPECIFIC_NICHES.find((n) => n.parent !== parent && n.googleTypes.includes(input.primaryType as string));
  return hit ? hit.id : null;
}

/** The niche a saved competitor most likely is: from Google's types when
 * the scan saved them (newer scans), else from its NAME. Ties prefer the
 * business's own niche, then its "also competes with" areas, then its
 * parent. null = can't tell. */
export function classifyCompetitor(name: string | null, ctx: { nicheId: string; areas: string[]; parent: string }, types?: string[] | null): string | null {
  const rank = (n: NicheDef) => (n.id === ctx.nicheId ? 3 : ctx.areas.includes(n.id) ? 2 : n.parent === ctx.parent ? 1 : 0);
  // A keyword in the name is the most specific signal ("Zumiez Skate
  // Shop" listed as a clothing store); Google's types decide the rest.
  const byName = name ? classifyByName(name, rank) : null;
  if (byName || !types?.length) return byName;
  for (const t of types) {
    const hits = allNiches().filter((n) => n.id !== n.parent && n.googleTypes.includes(t)).sort((a, b) => rank(b) - rank(a));
    if (hits.length) return hits[0].id;
  }
  return null;
}

function classifyByName(name: string, rank: (n: NicheDef) => number): string | null {
  let best: { n: NicheDef; len: number; r: number } | null = null;
  for (const n of allNiches()) {
    const hit = n.keywords.filter((k) => hasKeyword(name, k)).sort((a, b) => b.length - a.length)[0];
    if (!hit) continue;
    const cand = { n, len: hit.length, r: rank(n) };
    // A longer (more specific) keyword wins; then the business's own context.
    if (!best || cand.len > best.len || (cand.len === best.len && cand.r > best.r)) best = cand;
  }
  return best ? best.n.id : null;
}

/** Ids for a parent business type that's valid for niches. */
export function isNicheParent(id: string): id is BusinessTypeId {
  return (NICHE_PARENTS as string[]).includes(id);
}

/** "a" / "an" before an English niche name ("an Ice cream…", "a Skate…"). */
export function articleFor(label: string): "a" | "an" {
  return /^[aeiou]/i.test(label.trim()) ? "an" : "a";
}
