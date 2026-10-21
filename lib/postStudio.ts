// PostStudio's full-screen page (Day 5): "Your site checklist" from the
// business's REAL data — ✓ what's ready from the Google listing, ○ what
// the owner will add (never pre-filled) — the four page outlines, and
// where "Leave PostStudio" goes back to. Pure.

import type { MessageKey } from "./i18n";
import type { Addon, Plan } from "./plan";

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

/** PostStudio is in the account: Multi includes it; any other plan has it
 * with the "poststudio" add-on — Free + add-on is "PostStudio only". Until
 * checkout ships no account has an add-on (lib/premium.ts getAddons). */
export function hasPostStudio(plan: Plan, addons: readonly Addon[] = []): boolean {
  return plan === "multi" || addons.includes("poststudio");
}

// ---------------------------------------------------------------------------
// The ways to get PostStudio (coming soon — nothing can be bought yet).
// ---------------------------------------------------------------------------

/** "solo" = PostStudio only (the free audit + PostStudio). */
export type PostStudioOption = "solo" | "grow" | "premium" | "multi";
export const POSTSTUDIO_OPTIONS: PostStudioOption[] = ["solo", "grow", "premium", "multi"];

/** Monthly prices in dollars: the add-on on top of each plan and the total.
 * Multi includes PostStudio (no add-on price). */
export const POSTSTUDIO_PRICES: Record<Exclude<PostStudioOption, "multi">, { addOn: number; total: number }> = {
  solo: { addOn: 30, total: 30 },
  grow: { addOn: 15, total: 40 },
  premium: { addOn: 8, total: 58 },
};

/** The option that matches the plan they're on (Free → PostStudio only). */
export function postStudioOptionFor(plan: Plan): PostStudioOption {
  return plan === "free" ? "solo" : plan;
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
