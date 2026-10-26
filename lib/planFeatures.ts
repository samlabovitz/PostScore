// What each plan adds — the "See everything in each plan" list at the
// bottom of the Free Overview's combined upgrade card: an outcome
// headline and one plain line of what the owner actually gets, grouped by
// plan. Only features that exist today, or are honestly marked coming
// soon (see ~/Desktop/plan-facts.md and lib/planComparison.ts). Which plan
// unlocks each one comes from the same rule the promo boxes use
// (lib/upgradePromos.ts featurePlan), never a second list. Pure.

import { featurePlan, type PromoFeature } from "@/lib/upgradePromos";
import type { MessageKey } from "@/lib/i18n";

export interface PlanExtra {
  id: string;
  /** The outcome headline and the one plain line under it. */
  headlineKey: MessageKey;
  lineKey: MessageKey;
  /** The plain feature name (PostAI's feature map). */
  titleKey: MessageKey;
  /** The promo feature that decides the plan badge; "addOn" = PostStudio. */
  feature: PromoFeature | "addOn";
  soon: boolean;
  /** Coming soon only until the monthly report emails are live
   * (MONTHLY_REPORTS_LIVE — lib/monthlyReportsFeatureFlag.ts). */
  soonUntilReportsLive?: true;
  /** Only when the business has a website / this business type has the tool. */
  needs?: "website" | "pricing" | "campaigns";
}

const k = (id: string, part: "h" | "l") => `dashboard.free.planList.${id}.${part}` as MessageKey;
const extra = (id: string, titleKey: MessageKey, feature: PlanExtra["feature"], soon = false, needs?: PlanExtra["needs"]): PlanExtra => ({
  id,
  headlineKey: k(id, "h"),
  lineKey: k(id, "l"),
  titleKey,
  feature,
  soon,
  ...(needs ? { needs } : {}),
});

export const PLAN_EXTRAS: PlanExtra[] = [
  // Grow
  extra("fixGuides", "dashboard.free.tile.fixGuides", "grow", false, "website"),
  extra("recheck", "dashboard.websiteRecheck.button", "recheck", false, "website"),
  extra("starterSite", "dashboard.free.showroom.starterSite", "grow"),
  extra("priceCheck", "dashboard.nav.pricing", "grow", false, "pricing"),
  extra("reviewScripts", "dashboard.websiteReviews.guide.scriptTitle", "grow"),
  extra("campaigns", "dashboard.campaigns.guide.heading", "grow", false, "campaigns"),
  extra("recap", "dashboard.free.tile.reports", "grow"),
  // Grow, Premium and Multi (lib/plan.ts planIncludesMonthlyReports).
  { ...extra("monthlyEmail", "dashboard.settings.plans.row.monthlyEmail", "grow"), soonUntilReportsLive: true },
  extra("moreDrafts", "dashboard.replies.heading", "grow"),
  // Premium
  extra("postaiUnlimited", "dashboard.free.tile.postaiUnlimited", "premium"),
  extra("unlimitedDrafts", "dashboard.replies.unlimited", "premium"),
  extra("designs", "dashboard.settings.plans.row.designs", "designs"),
  extra("pdfReports", "dashboard.settings.plans.row.reports", "premium"),
  extra("googleProfile", "dashboard.free.tile.google", "googleProfile", true),
  extra("aiReplies", "dashboard.free.tile.repliesPostedForYou", "replies", true),
  extra("campaignHub", "dashboard.free.tile.hub", "campaignHub", true),
  // Add-on
  extra("postStudio", "dashboard.overview.postStudio.title", "addOn", true),
];

/** The badge on each row: the plan that unlocks it, or "addOn". */
export function planExtraBadge(extra: PlanExtra): "grow" | "premium" | "addOn" {
  return extra.feature === "addOn" ? "addOn" : featurePlan(extra.feature);
}

export interface PlanExtraOptions {
  hasWebsite: boolean;
  pricingOk?: boolean;
  campaignsOk?: boolean;
  /** isMonthlyReportsLive() on the server; not live when left out. */
  monthlyReportsLive?: boolean;
}

/** Whether a row shows "Coming soon" right now. */
export function isExtraSoon(extra: PlanExtra, monthlyReportsLive = false): boolean {
  return extra.soon || (extra.soonUntilReportsLive === true && !monthlyReportsLive);
}

export function planExtrasFor(o: PlanExtraOptions | boolean): PlanExtra[] {
  const opts: PlanExtraOptions = typeof o === "boolean" ? { hasWebsite: o } : o;
  return PLAN_EXTRAS.filter(
    (e) =>
      (e.needs !== "website" || opts.hasWebsite) &&
      (e.needs !== "pricing" || opts.pricingOk !== false) &&
      (e.needs !== "campaigns" || opts.campaignsOk !== false)
  ).map((e) => ({ ...e, soon: isExtraSoon(e, opts.monthlyReportsLive) }));
}

/** The list in plan groups, in order: Grow, Premium, Add-on. */
export function planExtraGroups(o: PlanExtraOptions): Array<{ group: "grow" | "premium" | "addOn"; extras: PlanExtra[] }> {
  const list = planExtrasFor(o);
  return (["grow", "premium", "addOn"] as const).map((group) => ({ group, extras: list.filter((e) => planExtraBadge(e) === group) })).filter((g) => g.extras.length > 0);
}
