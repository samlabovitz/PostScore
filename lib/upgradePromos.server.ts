// The real facts behind the upgrade promos, and the showcase strip's
// state for one page. DB reads only (the score and the competitor
// benchmark are request-cached, so a page that already loads them pays
// nothing extra). Premium and Multi load nothing — they see no promos.

import { getPlan } from "@/lib/premium";
import { createClient } from "@/lib/supabase/server";
import { scoreBusinessById } from "@/app/actions/scoring";
import { getLocalBenchmark } from "@/app/actions/competitors";
import { factsFromScore } from "@/lib/upgradeFacts";
import { isPremiumPlan, type Plan } from "@/lib/plan";
import { cardPromoKey, NO_FACTS, promoCardsFor, type PromoCardKind, type PromoFacts, type ShowcasePage } from "@/lib/upgradePromos";

export interface UpgradeCard {
  kind: PromoCardKind;
  page: ShowcasePage;
  /** The hide key (lib/upgradePromos.ts cardPromoKey). */
  key: string;
  /** Hidden until this time (database copy); null = showing. */
  hiddenUntil: string | null;
}

export interface UpgradeContextData {
  businessId: string;
  plan: Plan;
  facts: PromoFacts;
  /** The promo cards at the bottom of this page (empty off the main pages). */
  cards: UpgradeCard[];
}

async function loadFacts(businessId: string): Promise<PromoFacts> {
  try {
    const [scored, benchmark] = await Promise.all([scoreBusinessById(businessId, "business"), getLocalBenchmark(businessId)]);
    if (scored.status !== "ok") return NO_FACTS;
    return factsFromScore(scored.business, scored.result, benchmark.status === "ok" ? benchmark.benchmark : null);
  } catch {
    return NO_FACTS;
  }
}

/** Hidden-until for each key (one query); a missing table (SQL not run)
 * or any error reads as "not hidden". */
async function loadHiddenUntil(businessId: string, keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  try {
    const { data, error } = await createClient().from("promo_dismissals").select("promo_key, hidden_until").eq("business_id", businessId).in("promo_key", keys);
    if (error || !data) return {};
    return Object.fromEntries(data.map((r) => [r.promo_key as string, r.hidden_until as string]));
  } catch {
    return {};
  }
}

/** Everything a page's promos need. `page` = a main page with the strip. */
export async function loadUpgradeContext(businessId: string, page: ShowcasePage | null = null, plan: Plan = getPlan()): Promise<UpgradeContextData> {
  const kinds = page ? promoCardsFor(plan) : [];
  const keys = page ? kinds.map((kind) => cardPromoKey(kind, page)) : [];
  // Premium and Multi load no facts — they see no upgrade promos.
  const [facts, hidden] = await Promise.all([isPremiumPlan(plan) ? Promise.resolve(NO_FACTS) : loadFacts(businessId), loadHiddenUntil(businessId, keys)]);
  const cards = page ? kinds.map((kind) => ({ kind, page, key: cardPromoKey(kind, page), hiddenUntil: hidden[cardPromoKey(kind, page)] ?? null })) : [];
  return { businessId, plan, facts, cards };
}
