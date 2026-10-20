// What each plan sees on the tabs whose features aren't built yet
// (Campaigns, Google Profile, PostStudio). Prices are the Day 5 decisions
// in docs/product-structure.md; there's no checkout yet, so these pages
// only ever describe the plan needed — nothing is sold from them. Pure.

import { isPremiumPlan, type Plan } from "./plan";
import type { MessageKey } from "./i18n";

/** The PostStudio add-on line for this plan. */
export function postStudioPriceKey(plan: Plan): MessageKey {
  if (plan === "multi") return "dashboard.postStudio.priceMulti";
  if (plan === "premium") return "dashboard.postStudio.pricePremium";
  if (plan === "grow") return "dashboard.postStudio.priceGrow";
  return "dashboard.postStudio.priceFree";
}

/** Google Profile's connect features are Premium (and Multi). */
export function googleProfileAccessKey(plan: Plan): MessageKey {
  return isPremiumPlan(plan) ? "dashboard.googleProfile.inPlanSoon" : "dashboard.googleProfile.needsPremium";
}
