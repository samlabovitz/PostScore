// Day 25B step 4 (docs/plans/day25a-spec.md §1): the sidebar's two tabs.
// Presence (the 0–100 score) and Growth (the tier), each with its pages;
// then PostStudio and Reports; Account is pinned below. The open tab follows
// the URL; shared pages (Reports, Settings, Connect Google, PostStudio) keep
// the tab open last. Pages not built yet link to today's pages until their
// step (5–6). Pure.

import type { MessageKey } from "@/lib/i18n";
import type { Plan } from "@/lib/plan";
import { campaignsPageHref, fixPlanHref, getReviewsHref, googleListingHref, googleResultsHref, growthPlanHref, offersHref, reviewsHref } from "@/lib/routes";

export type NavTab = "presence" | "growth";

export type NavItemId =
  | "overview"
  | "fixPlan"
  | "googleListing"
  | "reviews"
  | "website"
  | "competitors"
  | "pricing"
  | "growthPlan"
  | "googleResults"
  | "getReviews"
  | "offers"
  | "campaigns"
  | "printKit"
  | "localEvents"
  | "postStudio"
  | "reports";

export interface NavItem {
  id: NavItemId;
  labelKey: MessageKey;
  /** null: nothing to open yet ("Coming soon", not a link). */
  href: (businessId: string) => string | null;
  comingSoon?: boolean;
  /** Links to another page until its own is built (steps 5–6): never the highlighted item. */
  standIn?: boolean;
}

const biz = (id: string) => `/business/${id}`;

export const PRESENCE_ITEMS: NavItem[] = [
  { id: "overview", labelKey: "dashboard.nav.overview", href: (id) => biz(id) },
  { id: "fixPlan", labelKey: "dashboard.nav.fixPlan", href: (id) => fixPlanHref(id) },
  { id: "googleListing", labelKey: "dashboard.nav.googleListing", href: (id) => googleListingHref(id) },
  { id: "reviews", labelKey: "dashboard.nav.reviews", href: (id) => reviewsHref(id) },
  { id: "website", labelKey: "dashboard.nav.website", href: (id) => `${biz(id)}/website` },
  { id: "competitors", labelKey: "dashboard.nav.competitors", href: (id) => `${biz(id)}/competitors` },
  { id: "pricing", labelKey: "dashboard.nav.pricing", href: (id) => `${biz(id)}/pricing` },
];

export const GROWTH_ITEMS: NavItem[] = [
  { id: "growthPlan", labelKey: "dashboard.nav.growthPlan", href: (id) => growthPlanHref(id) },
  { id: "googleResults", labelKey: "dashboard.nav.googleResults", href: (id) => googleResultsHref(id) },
  // Until step 5: today's Reviews page, its asking part.
  { id: "getReviews", labelKey: "dashboard.nav.getReviews", href: (id) => getReviewsHref(id, { hash: "get-more-reviews" }), standIn: true },
  // Until step 5: today's Campaigns page (coupons and referrals).
  { id: "offers", labelKey: "dashboard.nav.offers", href: (id) => offersHref(id), standIn: true },
  { id: "campaigns", labelKey: "dashboard.nav.campaigns", href: (id) => campaignsPageHref(id) },
  // Until step 5: the review QR on today's Reviews page.
  { id: "printKit", labelKey: "dashboard.nav.printKit", href: (id) => reviewsHref(id, { hash: "get-more-reviews" }), standIn: true },
  { id: "localEvents", labelKey: "dashboard.nav.localEvents", href: () => null, comingSoon: true },
];

/** After the open tab's pages and a thin divider, on both tabs. */
export const AFTER_ITEMS: NavItem[] = [
  { id: "postStudio", labelKey: "dashboard.nav.postStudio", href: (id) => `${biz(id)}/studio`, comingSoon: true },
  { id: "reports", labelKey: "dashboard.nav.reports", href: (id) => `${biz(id)}/reports` },
];

export const TAB_ITEMS: Record<NavTab, NavItem[]> = { presence: PRESENCE_ITEMS, growth: GROWTH_ITEMS };

/** Each route's tab; null for the shared pages (Reports, Settings, Connect Google, PostStudio). */
export function tabForPath(pathname: string): NavTab | null {
  const m = pathname.match(/^\/business\/[^/]+(?:\/([^/?#]+))?/);
  if (!m) return null;
  const page = m[1] ?? "";
  if (["", "fix-plan", "google-listing", "website-reviews", "website", "competitors", "pricing"].includes(page)) return "presence";
  if (["growth", "google-results", "get-reviews", "offers", "campaigns", "print-kit", "local-events", "google-profile", "search-demand"].includes(page)) return "growth";
  return null;
}

/** The one item the page belongs to (first match; Overview only on its own URL). */
export function activeItem(pathname: string, businessId: string, items: NavItem[]): NavItemId | null {
  const path = pathname.replace(/\/$/, "");
  for (const item of items) {
    if (item.standIn) continue;
    const href = item.href(businessId)?.split(/[?#]/)[0];
    if (!href) continue;
    if (path === href || (href !== biz(businessId) && path.startsWith(`${href}/`))) return item.id;
  }
  return null;
}

/** Free (spec §1, §5): every Growth page and Reports are locked; on
 * Presence, Reviews and Price check keep today's locks. "Coming soon" items
 * show that instead of a lock. */
export function navItemLocked(plan: Plan | null | undefined, id: NavItemId): boolean {
  if (plan !== "free") return false;
  if (id === "localEvents" || id === "postStudio") return false;
  return GROWTH_ITEMS.some((i) => i.id === id) || id === "reports" || id === "reviews" || id === "pricing";
}

/** The five Growth tiers (spec §6). Everyone shows "1 Starting out" until step 6. */
export const TIER_NAME_KEYS: MessageKey[] = [1, 2, 3, 4, 5].map((n) => `dashboard.growthTier.${n}` as MessageKey);
