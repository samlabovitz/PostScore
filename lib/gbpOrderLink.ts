// The "Order online" / "Booking link" card (Premium, Edit on Google): the
// owner's own ordering or booking link on Google (Place Actions API —
// lib/gbpOrderLink.server.ts). Pure: which wording a business gets, which
// links are accepted, which link on Google is the owner's to change, and
// what gbp_changes keeps for Undo.
//
// Wording: food businesses get "Order online" (FOOD_ORDERING); salons and
// other appointment businesses get "Booking link" (APPOINTMENT). Others
// get no card.
//
// A link is accepted only when it's https and goes to a real ordering or
// booking platform (the right kind for the business) or to the business's
// own website — never a parked one.

import { isFoodBusiness } from "@/lib/serviceOptions";
import { orderingPlatformFor } from "@/lib/orderingPlatforms";
import { platformPage } from "@/lib/socialLinkCheck";
import { isPublicWebUrl } from "@/lib/linkProblems";
import { sectionOf, type PlaceActionLink, type PlaceActionSection } from "@/lib/gbpPlaceActions";

export type OrderLinkKind = "order" | "booking";

const ORDER_PROFILES = new Set(["cafe_bakery"]);
/** lib/bizProfiles ids of businesses customers book (resolveBizProfile). */
export const BOOKING_PROFILE_IDS: readonly string[] = ["salon", "barbershop", "nail_salon", "spa", "gym_fitness", "tattoo_body_art", "dentist", "medical_clinic", "practitioner", "pet_services"];

/** Which card a business gets — from its resolved business type; null: none. */
export function orderLinkKindFor(profileId: string | null | undefined): OrderLinkKind | null {
  if (!profileId) return null;
  if (isFoodBusiness(profileId) || ORDER_PROFILES.has(profileId)) return "order";
  if (BOOKING_PROFILE_IDS.includes(profileId)) return "booking";
  return null;
}

/** Google's section, and the link type a new link gets. */
export function sectionForOrderKind(kind: OrderLinkKind): PlaceActionSection {
  return kind === "order" ? "order" : "appointments";
}
export function newLinkTypeFor(section: PlaceActionSection): "FOOD_ORDERING" | "DINING_RESERVATION" | "APPOINTMENT" {
  return section === "order" ? "FOOD_ORDERING" : section === "reservations" ? "DINING_RESERVATION" : "APPOINTMENT";
}

/** Booking platforms (hosts; `path`: the platform also hosts other things). */
export const BOOKING_PLATFORMS: ReadonlyArray<{ name: string; hosts: string[]; path?: RegExp }> = [
  { name: "Square Appointments", hosts: ["squareup.com"], path: /^\/appointments\b/i },
  { name: "Square Appointments", hosts: ["square.site"] },
  { name: "Vagaro", hosts: ["vagaro.com"] },
  { name: "Booksy", hosts: ["booksy.com"] },
  { name: "Fresha", hosts: ["fresha.com"] },
  { name: "StyleSeat", hosts: ["styleseat.com"] },
  { name: "GlossGenius", hosts: ["glossgenius.com"] },
  { name: "Schedulicity", hosts: ["schedulicity.com"] },
  { name: "Mindbody", hosts: ["mindbodyonline.com", "mindbody.io"] },
  { name: "Boulevard", hosts: ["joinblvd.com", "blvd.co"] },
  { name: "Acuity Scheduling", hosts: ["acuityscheduling.com", "as.me"] },
  { name: "Calendly", hosts: ["calendly.com"] },
  { name: "Setmore", hosts: ["setmore.com"] },
  { name: "SimplyBook.me", hosts: ["simplybook.me"] },
  { name: "Zenoti", hosts: ["zenoti.com"] },
  { name: "Phorest", hosts: ["phorest.com"] },
  { name: "Booker", hosts: ["booker.com"] },
  { name: "Timely", hosts: ["gettimely.com"] },
  { name: "Momence", hosts: ["momence.com"] },
];

const MAX_URL_LENGTH = 2000;

function hostMatches(host: string, h: string): boolean {
  return host === h || host.endsWith(`.${h}`);
}

function bare(host: string): string {
  return host.replace(/^www\./i, "").toLowerCase();
}

/** The booking platform a link goes to, or null. */
export function bookingPlatformFor(url: URL): string | null {
  const host = bare(url.hostname);
  return BOOKING_PLATFORMS.find((p) => p.hosts.some((h) => hostMatches(host, h)) && (!p.path || p.path.test(url.pathname) || host.startsWith("book.")))?.name ?? null;
}

/** The ordering platform a link goes to (marketplaces and ordering builders), or null. */
export function orderPlatformFor(url: URL): string | null {
  return orderingPlatformFor(url.href)?.name ?? null;
}

/** The business's own site host — not when its "website" is a platform, social or directory page. */
export function ownSiteHost(website: string | null | undefined): string | null {
  if (!website || !website.trim() || platformPage(website)) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`);
    return isPublicWebUrl(u.href) ? bare(u.hostname) : null;
  } catch {
    return null;
  }
}

export type OrderLinkProblem = "invalid" | "not_https" | "not_allowed" | "parked" | "too_long";

export interface OwnSite {
  /** ownSiteHost(business website); null: none. */
  host: string | null;
  /** The last scan found it parked (a "coming soon" / for-sale page). */
  parked: boolean;
}

/** Is this link one the card may send? The same check runs in the browser and on the server. */
export function checkOrderLink(raw: unknown, kind: OrderLinkKind, own: OwnSite): { ok: true; url: string; platform: string | null } | { ok: false; problem: OrderLinkProblem } {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, problem: "invalid" };
  const text = raw.trim();
  if (text.length > MAX_URL_LENGTH) return { ok: false, problem: "too_long" };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    // "doordash.com/store/1" — say what's missing, not "invalid".
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(text) ? { ok: false, problem: "not_https" } : { ok: false, problem: "invalid" };
  }
  if (url.protocol === "http:") return { ok: false, problem: "not_https" };
  if (url.protocol !== "https:" || !isPublicWebUrl(url.href)) return { ok: false, problem: "invalid" };
  const platform = kind === "order" ? orderPlatformFor(url) : bookingPlatformFor(url);
  if (platform) return { ok: true, url: url.href, platform };
  const host = bare(url.hostname);
  if (own.host && hostMatches(host, own.host)) return own.parked ? { ok: false, problem: "parked" } : { ok: true, url: url.href, platform: null };
  return { ok: false, problem: "not_allowed" };
}

/** Same link, ignoring a trailing slash and the host's case. */
export function sameLink(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) => {
    if (!v) return "";
    try {
      const u = new URL(v.trim());
      return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}${u.hash}`;
    } catch {
      return v.trim().replace(/\/+$/, "");
    }
  };
  return norm(a) !== "" && norm(a) === norm(b);
}

/** A link in the card's section, as the card shows it. */
export interface OrderLinkOnGoogle {
  name: string;
  uri: string;
  type: string;
  /** The owner's own link (may be changed or removed); false: added by a Google partner. */
  editable: boolean;
  preferred: boolean;
}

/** Google's links in one section — the owner's own first. Partner links
 * (providerType AGGREGATOR_3P, or isEditable false) are shown, never changed. */
export function linksInSection(links: PlaceActionLink[], section: PlaceActionSection): OrderLinkOnGoogle[] {
  return links
    .filter((l) => typeof l.name === "string" && typeof l.uri === "string" && sectionOf(l.placeActionType) === section)
    .map((l) => ({
      name: l.name!,
      uri: l.uri!,
      type: l.placeActionType!,
      editable: l.isEditable !== false && l.providerType !== "AGGREGATOR_3P",
      preferred: (l as { isPreferred?: boolean }).isPreferred === true,
    }))
    .sort((a, b) => Number(b.editable) - Number(a.editable) || Number(b.preferred) - Number(a.preferred));
}

/** One link as gbp_changes keeps it (before_value / after_value): never more than Google has. */
export interface StoredLink {
  name: string | null;
  uri: string;
  type: string;
}

export function storeLink(v: StoredLink | null): string | null {
  return v ? JSON.stringify({ name: v.name, uri: v.uri, type: v.type }) : null;
}

export function readStoredLink(v: string | null | undefined): StoredLink | null {
  if (!v) return null;
  try {
    const o = JSON.parse(v) as Record<string, unknown>;
    if (typeof o.uri !== "string" || typeof o.type !== "string") return null;
    return { name: typeof o.name === "string" ? o.name : null, uri: o.uri, type: o.type };
  } catch {
    return null;
  }
}

export const ORDER_LINK_FIELD = "order_link";
export const ORDER_LINK_KIND = "order_link";
export const ORDER_LINK_KIND_PRACTICE = "order_link_practice";

export type OrderLinkOp = { op: "add"; url: string; section: PlaceActionSection } | { op: "change"; name: string; url: string } | { op: "remove"; name: string };
