// What each plan adds, beyond the combined upgrade card's plans and tools —
// the "See everything in each plan" list at the bottom of that card on the
// Free Overview. Which plan unlocks each one comes from the same rule the
// promo boxes use (lib/upgradePromos.ts featurePlan), never a second list.
// Pure.

import { featurePlan, type PromoFeature } from "@/lib/upgradePromos";
import type { MessageKey } from "@/lib/i18n";

export interface PlanExtra {
  id: string;
  titleKey: MessageKey;
  /** The promo feature that decides the plan badge; "addOn" = PostStudio. */
  feature: PromoFeature | "addOn";
  soon: boolean;
  /** Only shown when the business has a website. */
  needsWebsite?: boolean;
}

export const PLAN_EXTRAS: PlanExtra[] = [
  { id: "fixGuides", titleKey: "dashboard.free.tile.fixGuides", feature: "grow", soon: false, needsWebsite: true },
  { id: "recheck", titleKey: "dashboard.websiteRecheck.button", feature: "recheck", soon: false, needsWebsite: true },
  { id: "starterSite", titleKey: "dashboard.free.showroom.starterSite", feature: "grow", soon: false },
  { id: "reports", titleKey: "dashboard.free.tile.reports", feature: "premium", soon: false },
  { id: "campaignHub", titleKey: "dashboard.free.tile.hub", feature: "campaignHub", soon: true },
  { id: "googleProfile", titleKey: "dashboard.free.tile.google", feature: "googleProfile", soon: true },
  { id: "aiReplies", titleKey: "dashboard.free.tile.repliesPostedForYou", feature: "premium", soon: true },
  { id: "postaiUnlimited", titleKey: "dashboard.free.tile.postaiUnlimited", feature: "premium", soon: false },
  { id: "postStudio", titleKey: "dashboard.overview.postStudio.title", feature: "addOn", soon: true },
];

/** The badge on each row: the plan that unlocks it, or "addOn". */
export function planExtraBadge(extra: PlanExtra): "grow" | "premium" | "addOn" {
  return extra.feature === "addOn" ? "addOn" : featurePlan(extra.feature);
}

export function planExtrasFor(hasWebsite: boolean): PlanExtra[] {
  return PLAN_EXTRAS.filter((extra) => hasWebsite || !extra.needsWebsite);
}
