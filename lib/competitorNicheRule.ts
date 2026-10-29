// Competitor selection v2: what a business's niche adds to the search —
// the customer's query words and who counts as "the same kind". Pure;
// every scan (app/actions/competitors.ts) and the scripts use it.
//
// - A niche with no Google type of its own (skate & snow shop, blow-dry
//   bar): a place is the same kind only when its name or types say so —
//   never just because it shares a broad Google type (the real Switch
//   Skate & Snow case: pool supplies and saddlery as "sporting goods").
// - A professional practice (criminal defense, family law, tax prep…):
//   Google's own type decides, minus places whose name says a DIFFERENT
//   practice of the same profession ("… Personal Injury Lawyers").
// - A general professional niche ("Lawyer") takes its practice from the
//   website address when it says one (the real Gregg L. Smith case:
//   glscrimlaw.com → criminal defense).

import { allNiches, isGeneralNiche, nicheById } from "@/lib/niches";
import { nicheNamesQuery } from "@/lib/competitorQuery";
import type { CompetitorScope } from "@/lib/competitorScope";

/** Professions whose niches are practices, not shop kinds. */
export const PROFESSIONAL_PARENTS = new Set(["lawyer", "accountant", "real_estate", "consultant", "coach", "dentist", "medical_clinic", "practitioner"]);

export interface NicheRule {
  nicheId: string;
  parent: string;
  areas: string[];
  googleTypes: string[];
  professional: boolean;
}

/** A practice niche of `parent` named in the website address (word stems
 * of its keywords, e.g. "crim" for "criminal"), or null. */
export function practiceFromWebsite(website: string | null | undefined, parent: string): string | null {
  if (!website || !PROFESSIONAL_PARENTS.has(parent)) return null;
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const label = host.split(".")[0].replace(/[^a-z]/g, "");
  for (const n of allNiches()) {
    if (n.parent !== parent || n.id === parent) continue;
    const stems = n.keywords.filter((k) => !k.includes(" ") && k.length >= 6).map((k) => k.slice(0, 4));
    if (stems.some((s) => label.includes(s))) return n.id;
  }
  return null;
}

/** The scan's niche fields: the query's words and the same-kind rule. */
export function nicheScanFields(
  resolved: { nicheId: string; parent: string; source: string; confidence: string } | null | undefined,
  scope: Pick<CompetitorScope, "areas"> | null | undefined,
  website: string | null | undefined
): { queryNiche: { labelEn: string; parent: string } | null; nicheRule: NicheRule | null } {
  if (!resolved) return { queryNiche: null, nicheRule: null };
  let id = resolved.nicheId;
  let names = nicheNamesQuery(resolved);
  if (isGeneralNiche(id)) {
    const practice = practiceFromWebsite(website, resolved.parent);
    if (practice) {
      id = practice;
      names = true;
    }
  }
  const def = nicheById(id);
  if (!def) return { queryNiche: null, nicheRule: null };
  const queryNiche = names ? { labelEn: def.label.en, parent: def.parent } : null;
  // A general niche ("Salon", "Lawyer") narrows nothing.
  if (isGeneralNiche(def.id) || !names) return { queryNiche, nicheRule: null };
  return {
    queryNiche,
    nicheRule: { nicheId: def.id, parent: def.parent, areas: scope?.areas ?? [], googleTypes: def.googleTypes, professional: PROFESSIONAL_PARENTS.has(def.parent) },
  };
}
