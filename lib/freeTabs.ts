// Free = the Overview audit + Competitors (read-only) + Website (audit +
// starter site, download locked) + Settings. Every other tab is locked on Free: the sidebar shows a small lock, and the
// tab's own page shows its SHOWROOM (components/plan/TabShowroom.tsx)
// instead of the real page — so old deep links land there too. Grow,
// Premium and Multi open every tab as normal. Pure.

import type { MessageKey } from "./i18n";
import type { Plan } from "./plan";
import type { ShowcasePage } from "./upgradePromos";

export type ShowroomTab = "growth" | "campaigns" | "reviews" | "pricing" | "reports";
/** The tabs locked on Free. Website is OPEN on Free: the audit, the
 * screenshot card and the starter-site generator (download locked). */
export const SHOWROOM_TABS: ShowroomTab[] = ["growth", "campaigns", "reviews", "pricing", "reports"];

/** The sidebar entry for each locked tab. */
export const SHOWROOM_NAV: Record<ShowroomTab, MessageKey> = {
  growth: "dashboard.nav.growth",
  campaigns: "dashboard.nav.campaigns",
  reviews: "dashboard.nav.reviews",
  pricing: "dashboard.nav.pricing",
  reports: "dashboard.nav.reports",
};

/** The showroom's page key for its promo cards. */
export const SHOWROOM_PAGE: Record<ShowroomTab, ShowcasePage> = {
  growth: "growth",
  campaigns: "campaigns",
  reviews: "reviews",
  pricing: "pricing",
  reports: "reports",
};

/** Whether this tab shows its showroom (and a lock in the sidebar). */
export function tabLocked(plan: Plan | null | undefined, tab: ShowroomTab): boolean {
  return plan === "free" && SHOWROOM_TABS.includes(tab);
}

/** The same, from a sidebar entry. */
export function navLocked(plan: Plan | null | undefined, labelKey: MessageKey): boolean {
  return plan === "free" && SHOWROOM_TABS.some((tab) => SHOWROOM_NAV[tab] === labelKey);
}
