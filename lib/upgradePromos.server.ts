// The real facts behind the upgrade promos, and the showcase strip's
// state for one page. DB reads only (the score and the competitor
// benchmark are request-cached, so a page that already loads them pays
// nothing extra). Premium and Multi load nothing — they see no promos.

import { getPlan } from "@/lib/premium";
import { scoreBusinessById } from "@/app/actions/scoring";
import { getLocalBenchmark } from "@/app/actions/competitors";
import { factsFromScore } from "@/lib/upgradeFacts";
import { isPremiumPlan, type Plan } from "@/lib/plan";
import { NO_FACTS, stripAudience, type PromoFacts, type ShowcasePage, type StripAudience } from "@/lib/upgradePromos";

export interface UpgradeStrip {
  page: ShowcasePage;
  audience: StripAudience;
  /** Hidden until this time; null = showing (kept on the device for now). */
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

/** Everything a page's promos need. `page` = a main page with the strip. */
export async function loadUpgradeContext(businessId: string, page: ShowcasePage | null = null, plan: Plan = getPlan()): Promise<UpgradeContextData> {
  const audience = page ? stripAudience(plan, page) : null;
  if (isPremiumPlan(plan)) {
    // No upgrade promos; Premium may see the one PostStudio line.
    const strip = page && audience ? { page, audience, hiddenUntil: null } : null;
    return { businessId, plan, facts: NO_FACTS, strip };
  }
  const facts = await loadFacts(businessId);
  return { businessId, plan, facts, strip: page && audience ? { page, audience, hiddenUntil: null } : null };
}
