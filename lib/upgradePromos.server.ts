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
import { NO_FACTS, stripAudience, stripPromoKey, type PromoFacts, type ShowcasePage, type StripAudience } from "@/lib/upgradePromos";

export interface UpgradeStrip {
  page: ShowcasePage;
  audience: StripAudience;
  /** Hidden until this time (database copy); null = showing. */
  hiddenUntil: string | null;
}

export interface UpgradeContextData {
  businessId: string;
  plan: Plan;
  facts: PromoFacts;
  strip: UpgradeStrip | null;
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

async function loadHiddenUntil(businessId: string, key: string): Promise<string | null> {
  try {
    const { data, error } = await createClient().from("promo_dismissals").select("hidden_until").eq("business_id", businessId).eq("promo_key", key).maybeSingle();
    // A missing table (SQL not run yet) reads as "not hidden".
    return error || !data ? null : (data.hidden_until as string);
  } catch {
    return null;
  }
}

/** Everything a page's promos need. `page` = a main page with the strip. */
export async function loadUpgradeContext(businessId: string, page: ShowcasePage | null = null, plan: Plan = getPlan()): Promise<UpgradeContextData> {
  const audience = page ? stripAudience(plan, page) : null;
  if (isPremiumPlan(plan)) {
    // No upgrade promos; Premium may see the one PostStudio line.
    const strip = page && audience ? { page, audience, hiddenUntil: await loadHiddenUntil(businessId, stripPromoKey(page)) } : null;
    return { businessId, plan, facts: NO_FACTS, strip };
  }
  const [facts, hiddenUntil] = await Promise.all([loadFacts(businessId), page && audience ? loadHiddenUntil(businessId, stripPromoKey(page)) : Promise.resolve(null)]);
  return { businessId, plan, facts, strip: page && audience ? { page, audience, hiddenUntil } : null };
}
