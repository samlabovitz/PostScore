// PostStudio's full-screen page (Day 5): "Your site checklist" from the
// business's REAL data — ✓ what's ready from the Google listing, ○ what
// the owner will add (never pre-filled) — the four page outlines, and
// where "Leave PostStudio" goes back to. Pure.

import type { MessageKey } from "./i18n";
import type { Plan } from "./plan";

export interface ChecklistFacts {
  businessName: string | null;
  category: string | null;
  phone: string | null;
  address: string | null;
  /** A real storefront (hasStorefront) — else the site shows the area served. */
  storefront: boolean;
  /** "Irvington, NY", when the address shows it. */
  city: string | null;
  /** Google's hours or the owner's hours for the website. */
  hasHours: boolean;
  rating: number | null;
  verifiedSocialCount: number;
  profileId: string;
}

export interface ChecklistItem {
  key: MessageKey;
  ready: boolean;
}

/** Food and drink types get a Menu page instead of Services. */
const MENU_TYPES = new Set(["restaurant", "cafe", "bar", "bakery", "dessert_shop", "cafe_bakery"]);

export function usesMenu(profileId: string): boolean {
  return MENU_TYPES.has(profileId);
}

export function siteChecklist(f: ChecklistFacts): ChecklistItem[] {
  const P = "dashboard.postStudio.";
  const k = (s: string) => `${P}${s}` as MessageKey;
  return [
    { key: k("itemName"), ready: !!f.businessName?.trim() },
    { key: k("itemCategory"), ready: !!f.category },
    { key: k("itemPhone"), ready: !!f.phone },
    f.storefront ? { key: k("itemAddress"), ready: !!f.address } : { key: k("itemArea"), ready: !!f.city },
    { key: k("itemHours"), ready: f.hasHours },
    { key: k("itemRating"), ready: f.rating !== null },
    { key: k("itemSocial"), ready: f.verifiedSocialCount > 0 },
    // Always the owner's own: never pulled from Google or invented.
    { key: k("itemPhotos"), ready: false },
    { key: k("itemAbout"), ready: false },
    { key: usesMenu(f.profileId) ? k("itemMenu") : k("itemServices"), ready: false },
    { key: k("itemBrand"), ready: false },
  ];
}

/** The four pages and what each will hold (outlines, not a real site). */
export function pageOutlines(profileId: string, storefront: boolean): Array<{ title: MessageKey; blocks: MessageKey[] }> {
  const k = (s: string) => `dashboard.postStudio.${s}` as MessageKey;
  return [
    { title: k("pageHome"), blocks: [k("blockHero"), k("blockGlance"), k("blockReviews"), ...(storefront ? [k("blockMap")] : [])] },
    { title: k("pageAbout"), blocks: [k("blockStory"), k("blockPhotos")] },
    { title: usesMenu(profileId) ? k("pageMenu") : k("pageServices"), blocks: [usesMenu(profileId) ? k("blockMenuList") : k("blockServiceList"), k("blockCall")] },
    { title: k("pageContact"), blocks: [k("blockContact"), ...(storefront ? [k("blockMap")] : []), k("blockSocial")] },
  ];
}

/** Until the add-on can be bought, only Multi includes PostStudio. */
export function hasPostStudio(plan: Plan): boolean {
  return plan === "multi";
}

/** Where "Leave PostStudio" goes: the page they came from (?from=), only
 * if it's one of this business's own pages; otherwise the Overview. */
export function leaveHref(businessId: string, from: string | null | undefined): string {
  const home = `/business/${businessId}`;
  if (!from || typeof from !== "string") return home;
  const ok = from === home || (from.startsWith(`${home}/`) && /^[A-Za-z0-9/_\-?=&#.]+$/.test(from) && !from.includes("//") && !from.startsWith(`${home}/studio`));
  return ok ? from : home;
}

export function studioHref(businessId: string, from: string): string {
  return `/business/${businessId}/studio?from=${encodeURIComponent(from)}`;
}
