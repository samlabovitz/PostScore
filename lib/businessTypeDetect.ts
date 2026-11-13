// Business type detection when a business is added (and once for saved
// businesses with none — scripts/detect-business-types.ts): the closest
// niche across EVERY type, from the business's own name, Google's primary
// type and category, and the words on its website — not only within the
// broad type Google's category points to (a "Store" can be a gift shop,
// an "Educational Institution" a pottery studio). Confident → saved as
// PostScore's pick ("We picked … — Change"); not confident → nothing is
// saved and the Overview keeps asking the owner. Never overrides a type
// the owner chose. Pure.

import { allNiches, hasKeyword, isGeneralNiche } from "@/lib/niches";
import type { NicheDef } from "@/config/niches";

export interface DetectInput {
  name: string | null;
  category: string | null;
  primaryType: string | null;
  types: string[] | null;
  /** The homepage's title, description and visible text, when it could be read. */
  websiteText?: string | null;
}

export interface DetectResult {
  /** The best niche, or null when nothing matched at all. */
  nicheId: string | null;
  confident: boolean;
  /** What matched, in plain words ("name says “clay studio”"). */
  evidence: string[];
  /** The runner-up, when it was close (why it's not confident). */
  runnerUp: string | null;
  score: number;
}

/** Google types that say nothing about the kind of business. */
const GENERIC = new Set(["store", "service", "establishment", "point_of_interest", "food", "health", "shopping_mall", "restaurant", "educational_institution", "school", "local_business"]);

const NAME_POINTS = 120;
const PRIMARY_TYPE_POINTS = 100;
const CATEGORY_POINTS = 50;
const SECONDARY_TYPE_POINTS = 20;
/** Each distinct keyword found on the website, up to WEBSITE_MAX. */
const WEBSITE_POINTS = 15;
const WEBSITE_MAX = 45;

/** Confident: the name or Google's own type says it (or the website says it
 * three ways), and nothing else comes within CLEAR_MARGIN. */
export const CONFIDENT_SCORE = 100;
const WEBSITE_ONLY_CONFIDENT = WEBSITE_MAX;
const CLEAR_MARGIN = 30;

function scoreNiche(n: NicheDef, input: DetectInput): { score: number; evidence: string[] } {
  const evidence: string[] = [];
  let score = 0;
  const nameHit = n.keywords.filter((k) => hasKeyword(input.name ?? "", k)).sort((a, b) => b.length - a.length)[0];
  if (nameHit) {
    score += NAME_POINTS;
    evidence.push(`name says “${nameHit}”`);
  }
  const primary = input.primaryType && !GENERIC.has(input.primaryType) && n.googleTypes.includes(input.primaryType) ? input.primaryType : null;
  if (primary) {
    score += PRIMARY_TYPE_POINTS;
    evidence.push(`Google type “${primary}”`);
  } else {
    const categoryHit = n.keywords.find((k) => hasKeyword(input.category ?? "", k));
    if (categoryHit) {
      score += CATEGORY_POINTS;
      evidence.push(`Google category says “${categoryHit}”`);
    }
    const secondary = (input.types ?? []).find((t) => t !== input.primaryType && !GENERIC.has(t) && n.googleTypes.includes(t));
    if (secondary) {
      score += SECONDARY_TYPE_POINTS;
      evidence.push(`Google also lists “${secondary}”`);
    }
  }
  if (input.websiteText) {
    const hits = Array.from(new Set(n.keywords.filter((k) => k.length >= 4 && hasKeyword(input.websiteText as string, k))));
    if (hits.length > 0) {
      score += Math.min(WEBSITE_MAX, hits.length * WEBSITE_POINTS);
      evidence.push(`website says ${hits.slice(0, 3).map((h) => `“${h}”`).join(", ")}`);
    }
  }
  return { score, evidence };
}

export function detectBusinessType(input: DetectInput): DetectResult {
  const scored = allNiches()
    .map((n) => ({ n, ...scoreNiche(n, input) }))
    .filter((x) => x.score > 0)
    // A specific niche beats its own general parent on a tie.
    .sort((a, b) => b.score - a.score || Number(isGeneralNiche(a.n.id)) - Number(isGeneralNiche(b.n.id)));
  let best = scored[0];
  if (!best) return { nicheId: null, confident: false, evidence: [], runnerUp: null, score: 0 };
  // Google's own specific type points to a niche: a general pick takes
  // that niche when it's one of its own ("Retail / Boutique" → "Women's
  // clothing"); a pick under the same broad type keeps the name's word
  // ("Switch Skate & Snow" is a skate shop though Google says sporting
  // goods). A pick under a DIFFERENT broad type disagrees with Google and
  // isn't confident — unless the name says a specific phrase of it ("Kung
  // Fu Tea", "Shoe repair"), never one word ("Law" for a consultant).
  const googleNiches = input.primaryType && !GENERIC.has(input.primaryType) ? allNiches().filter((n) => n.googleTypes.includes(input.primaryType as string)) : [];
  let disagrees: string | null = null;
  const sameFamily = (n: NicheDef) => n.id === best.n.id || n.parent === best.n.parent || n.id === best.n.parent || n.parent === best.n.id;
  if (googleNiches.length > 0 && !googleNiches.some((n) => n.id === best.n.id)) {
    const child = isGeneralNiche(best.n.id) ? googleNiches.find((n) => n.parent === best.n.id) : undefined;
    if (child) best = scored.find((x) => x.n.id === child.id) ?? { n: child, ...scoreNiche(child, input) };
    else if (!googleNiches.some(sameFamily) && !best.evidence.some((e) => /^name says “[^”]+ [^”]+”/.test(e))) disagrees = googleNiches[0].id;
  }
  // A general type is its own specific niches' parent: those aren't rivals.
  const rival = scored.find((x) => x.n.id !== best.n.id && x.n.id !== best.n.parent && x.n.parent !== best.n.id);
  const close = !!rival && best.score - rival.score < CLEAR_MARGIN;
  const strongEnough = best.score >= CONFIDENT_SCORE || (best.score >= WEBSITE_ONLY_CONFIDENT && best.evidence.every((e) => e.startsWith("website")) && best.evidence.length > 0);
  return {
    nicheId: best.n.id,
    confident: strongEnough && !close && !disagrees,
    evidence: best.evidence,
    runnerUp: disagrees ?? (close && rival ? rival.n.id : null),
    score: best.score,
  };
}
