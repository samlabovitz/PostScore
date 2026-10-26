// PostAI's map of where every feature lives on the owner's plan, and
// whether they can use it there — built from the configs that drive the
// app itself, never a separate hand-written list:
// - which tabs are locked (the sidebar lock + showroom): lib/freeTabs.ts;
// - the Free Overview's sections: lib/freeOverviewSections.ts;
// - which plan unlocks a feature: lib/upgradePromos.ts featurePlan and
//   lib/planFeatures.ts;
// - this business type's tools (coupons, referrals, price check):
//   config/bizProfiles.ts flags;
// - the limits: lib/reviewReplies.ts, lib/freeAiAllowance.ts,
//   lib/rescanPolicy.ts, lib/competitorScanPolicy.ts.
// Labels are the app's own English labels (t("en", …)) — PostAI answers in
// the owner's language. Pure.

import { featurePlan, type PromoFeature } from "@/lib/upgradePromos";
import { tabLocked, type ShowroomTab } from "@/lib/freeTabs";
import { freeSectionOf, type FreeOverviewItem } from "@/lib/freeOverviewSections";
import { isExtraSoon, planExtraBadge, PLAN_EXTRAS } from "@/lib/planFeatures";
import { replyDraftLimit } from "@/lib/reviewReplies";
import { FREE_AI_WEEKLY } from "@/lib/freeAiAllowance";
import { FREE_RESCAN_DAYS, RESCAN_COOLDOWN_HOURS } from "@/lib/rescanPolicy";
import { GROW_RESCAN_COMPETITOR_DAYS } from "@/lib/competitorScanPolicy";
import { postStudioPriceKey } from "@/lib/navPlans";
import { t, type MessageKey } from "@/lib/i18n";
import type { Plan } from "@/lib/plan";

/** usable: works on this plan. preview: can be tried (designed,
 * previewed) but saving/printing needs the plan named. locked: not on
 * this plan. soon: not built yet. */
export type FeatureStatus = "usable" | "preview" | "locked" | "soon";

export interface FeatureEntry {
  id: string;
  name: string;
  status: FeatureStatus;
  /** Where it lives — only ever stated as a place to go when usable/preview. */
  where: string;
  /** The plan that unlocks it (locked/preview/soon), or the add-on. */
  unlocks: "grow" | "premium" | "add-on" | null;
  note?: string;
}

export interface FeatureMapOptions {
  couponsOk: boolean;
  referralOk: boolean;
  pricingOk: boolean;
  hasWebsite: boolean;
  /** isMonthlyReportsLive() — the monthly report email is coming soon until then. */
  monthlyReportsLive?: boolean;
}

const en = (key: MessageKey, params?: Record<string, string | number>) => t("en", key, params);
const NAV: Record<ShowroomTab | "overview" | "website" | "competitors" | "settings", MessageKey> = {
  overview: "dashboard.nav.overview",
  growth: "dashboard.nav.growth",
  campaigns: "dashboard.nav.campaigns",
  reviews: "dashboard.nav.reviews",
  website: "dashboard.nav.website",
  competitors: "dashboard.nav.competitors",
  pricing: "dashboard.nav.pricing",
  reports: "dashboard.nav.reports",
  settings: "dashboard.nav.settings",
};
const tab = (id: keyof typeof NAV) => `the ${en(NAV[id])} tab`;
const onFreeOverview = (item: FreeOverviewItem, card?: MessageKey) => {
  const section = freeSectionOf(item);
  return `the ${en(NAV.overview)} tab, in the "${en(section.titleKey)}" section${card ? ` (the "${en(card)}" card)` : ""}`;
};
const lockedOn = (plan: Plan, t: ShowroomTab) => tabLocked(plan, t);
const planOf = (feature: PromoFeature) => featurePlan(feature);
const paid = (plan: Plan) => plan === "premium" || plan === "multi";

/** Every feature PostAI might mention, as it is on this plan. */
export function featureMapFor(plan: Plan, o: FeatureMapOptions): FeatureEntry[] {
  const free = plan === "free";
  const out: FeatureEntry[] = [];
  const add = (e: FeatureEntry) => out.push(e);

  add({ id: "score", name: "PostScore and the score breakdown", status: "usable", where: free ? onFreeOverview("breakdown") : `the ${en(NAV.overview)} tab ("Score breakdown")`, unlocks: null });
  add({
    id: "rescan",
    name: "Re-scan (refresh the score and Google listing)",
    status: "usable",
    where: `the ${en(NAV.overview)} tab ("Re-scan now", top right)`,
    unlocks: null,
    note: free ? `once every ${FREE_RESCAN_DAYS} days on Free` : `once every ${RESCAN_COOLDOWN_HOURS} hours`,
  });
  // Review link + QR: the Reviews tab, or — where it's locked — the Free Overview's Reviews card.
  const reviewsLocked = lockedOn(plan, "reviews");
  add({
    id: "reviewLinkQr",
    name: "Review link and QR code (copy, open, download the QR)",
    status: "usable",
    where: reviewsLocked ? onFreeOverview("reviewLink", "dashboard.free.reviewHeading") : `${tab("reviews")} ("${en("dashboard.websiteReviews.growthLeverHeading")}")`,
    unlocks: null,
    note: reviewsLocked ? "a QR code image (PNG) the owner prints themselves — the printable review sign designer is on Grow" : undefined,
  });
  const drafts = replyDraftLimit(plan);
  add({
    id: "replyDrafts",
    name: "AI review reply drafts (paste a review, PostAI drafts a reply)",
    status: "usable",
    where: reviewsLocked ? onFreeOverview("replyDrafts", "dashboard.free.reviewHeading") : `${tab("reviews")} ("${en("dashboard.replies.heading")}")`,
    unlocks: drafts === null ? null : "premium",
    note: drafts === null ? "unlimited" : `${drafts} a week; unlimited on Premium`,
  });
  add({
    id: "postai",
    name: "PostAI questions",
    status: "usable",
    where: free ? onFreeOverview("postai", "dashboard.free.postaiTitle") : `the ${en(NAV.overview)} tab ("${en("dashboard.overview.askPostAI")}")`,
    unlocks: paid(plan) ? null : free ? "grow" : "premium",
    note: free ? `${FREE_AI_WEEKLY} a week on Free; more on Grow, unlimited on Premium` : paid(plan) ? "unlimited" : "a monthly limit on Grow; unlimited on Premium",
  });
  const reviewSign = planOf("reviewSign");
  add({ id: "reviewSign", name: "Review sign designer (print a QR sign)", status: reviewsLocked ? "locked" : "usable", where: `${tab("reviews")} ("Design your review sign")`, unlocks: reviewsLocked ? reviewSign : null, note: plan === "grow" ? "basic sign on Grow; every option on Premium" : undefined });

  const campaignsLocked = lockedOn(plan, "campaigns");
  if (o.couponsOk)
    add({
      id: "coupons",
      name: "Coupon designer (the owner writes the offer — any wording, any amount; quick picks are only examples)",
      status: campaignsLocked ? "preview" : "usable",
      where: `${tab("campaigns")} → ${en("dashboard.campaigns.tabCoupons")}`,
      unlocks: campaignsLocked ? "grow" : null,
      note: campaignsLocked ? "on Free you can design and preview only; saving, printing and tracking are on Grow" : undefined,
    });
  if (o.referralOk)
    add({
      id: "referrals",
      name: "Referral card designer (the owner writes BOTH rewards — any wording, any amount; quick picks are only examples)",
      status: campaignsLocked ? "preview" : "usable",
      where: `${tab("campaigns")} → ${en("dashboard.campaigns.tabReferrals")}`,
      unlocks: campaignsLocked ? "grow" : null,
      note: campaignsLocked ? "on Free you can design and preview only; saving, printing and tracking are on Grow" : undefined,
    });
  add({ id: "campaignTracking", name: "Tracking every coupon and referral (+1 each use)", status: campaignsLocked ? "locked" : "usable", where: `${tab("campaigns")} → ${en("dashboard.campaigns.tabAll")}`, unlocks: campaignsLocked ? "grow" : null });
  add({ id: "channels", name: "Email, text and social campaigns", status: "soon", where: tab("campaigns"), unlocks: planOf("campaignHub") });

  const growthLocked = lockedOn(plan, "growth");
  add({ id: "fixSteps", name: "Step-by-step fix guides and the weekly action plan", status: growthLocked ? "locked" : "usable", where: tab("growth"), unlocks: growthLocked ? "grow" : null });
  add({ id: "routine", name: en("dashboard.growth.checklist.sectionHeading"), status: growthLocked ? "locked" : "usable", where: `${tab("growth")} ("${en("dashboard.growth.checklist.sectionHeading")}")`, unlocks: growthLocked ? "grow" : null });

  if (o.pricingOk) {
    const pricingLocked = lockedOn(plan, "pricing");
    add({ id: "priceCheck", name: en("dashboard.nav.pricing"), status: pricingLocked ? "locked" : "usable", where: tab("pricing"), unlocks: pricingLocked ? "grow" : null });
  }
  add({
    id: "competitors",
    name: "Competitor comparison and rank",
    status: "usable",
    where: tab("competitors"),
    unlocks: null,
    note: free ? "competitors are not refreshed on Free after the first scan" : plan === "grow" ? `a re-scan refreshes competitors at most once every ${GROW_RESCAN_COMPETITOR_DAYS} days` : "every re-scan refreshes competitors",
  });
  add({ id: "websiteAudit", name: "Website audit (the website checks)", status: "usable", where: tab("website"), unlocks: null });
  add({ id: "starterSite", name: "Starter website builder", status: free ? "preview" : "usable", where: tab("website"), unlocks: free ? "grow" : null, note: free ? "on Free you can design and preview it; downloading it is on Grow" : undefined });

  // Everything else each plan adds (the Free Overview's "See everything in each plan").
  // Only the extras not described elsewhere in this map (website fixes, the
  // Google connection, PostStudio, the monthly report email); the rest have
  // their own entries above.
  const MAPPED = new Set(["fixGuides", "recheck", "monthlyEmail", "googleProfile", "postStudio"]);
  for (const extra of PLAN_EXTRAS) {
    if (!MAPPED.has(extra.id)) continue;
    if (extra.needs === "website" && !o.hasWebsite) continue;
    const badge = planExtraBadge(extra);
    const unlocked = badge === "grow" ? plan !== "free" : badge === "premium" ? paid(plan) : plan === "multi";
    const soon = isExtraSoon(extra, o.monthlyReportsLive);
    const where = extra.id === "monthlyEmail" ? `the owner's email inbox (on/off in ${tab("settings")} → Email & notifications)` : extra.id === "reports" ? tab("reports") : extra.id === "googleProfile" ? "the Google Profile page" : extra.id === "campaignHub" ? tab("campaigns") : extra.id === "postStudio" ? "PostStudio" : tab("website");
    add({
      id: extra.id,
      name: en(extra.titleKey, { builder: "their website builder" }),
      status: soon ? "soon" : unlocked ? "usable" : "locked",
      where,
      unlocks: unlocked && !soon ? null : badge === "addOn" ? "add-on" : badge,
      note:
        extra.id === "postStudio"
          ? en(postStudioPriceKey(plan))
          : extra.id === "monthlyEmail"
            ? `included with Grow, Premium and Multi; not on Free${soon ? " — not sending yet" : ""}`
            : undefined,
    });
  }
  const reportsLocked = lockedOn(plan, "reports");
  add({
    id: "reports",
    name: "Reports (score history and the weekly recap)",
    status: reportsLocked ? "locked" : "usable",
    where: tab("reports"),
    unlocks: reportsLocked ? "grow" : null,
    note: reportsLocked ? "no monthly report emails on Free — those come with Grow and Premium" : plan === "grow" ? "the weekly recap; the PDF report is on Premium" : "the weekly recap and the PDF report",
  });
  add({ id: "repliesPosted", name: en("dashboard.free.tile.repliesPostedForYou"), status: "soon", where: "the Google Profile page", unlocks: "premium" });
  add({ id: "plans", name: "Plans and prices (Compare plans)", status: "usable", where: `${tab("settings")} → Plan & billing → "Compare plans"`, unlocks: null });
  return out;
}

const STATUS_WORD: Record<FeatureStatus, string> = { usable: "USABLE", preview: "PREVIEW", locked: "LOCKED", soon: "COMING SOON" };

/** The map as context lines for the prompt. */
export function featureMapText(plan: Plan, entries: FeatureEntry[]): string {
  const lines = [`PLAN & WHERE THINGS ARE — this owner is on the ${plan === "multi" ? "Multi" : plan[0].toUpperCase() + plan.slice(1)} plan. Authoritative for this owner:`];
  for (const e of entries) {
    const unlocks = e.unlocks ? ` — ${e.unlocks === "add-on" ? "an add-on" : `on ${e.unlocks[0].toUpperCase()}${e.unlocks.slice(1)}`}` : "";
    lines.push(`- ${e.name}: ${STATUS_WORD[e.status]}${e.status === "usable" || e.status === "preview" ? ` at ${e.where}` : unlocks}${e.status === "preview" || e.status === "soon" ? unlocks : ""}${e.note ? ` (${e.note})` : ""}`);
  }
  return lines.join("\n");
}
