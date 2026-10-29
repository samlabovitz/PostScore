// "Order online" awareness (Place Actions API): is the ordering / booking
// platform that sits in the Google listing's WEBSITE spot already in its
// proper Google section ("Order online", "Reservations", "Appointments")?
// Pure — the Google calls are lib/gbpPlaceActions.server.ts.

import { placeActionTypeFor, platformPage, type PlatformKind } from "@/lib/socialLinkCheck";

/** Google's PlaceActionLink (the fields read). */
export interface PlaceActionLink {
  name?: string;
  uri?: string;
  placeActionType?: string;
  providerType?: string;
  isEditable?: boolean;
}

/** The Google section for a link type (all three food types are "Order online"). */
export type PlaceActionSection = "order" | "reservations" | "appointments";
export function sectionOf(type: string | undefined): PlaceActionSection | null {
  if (type === "FOOD_ORDERING" || type === "FOOD_DELIVERY" || type === "FOOD_TAKEOUT" || type === "SHOP_ONLINE") return "order";
  if (type === "DINING_RESERVATION") return "reservations";
  if (type === "APPOINTMENT" || type === "ONLINE_APPOINTMENT") return "appointments";
  return null;
}

export function sectionForKind(kind: PlatformKind): PlaceActionSection | null {
  const type = placeActionTypeFor(kind);
  return type ? sectionOf(type) : null;
}

/** The platform in the website spot, and where it belongs on Google. */
export interface WebsitePlatform {
  name: string;
  kind: PlatformKind;
  url: string;
  /** Google's section for it; null for social, link-in-bio and review pages. */
  section: PlaceActionSection | null;
}

export function websitePlatform(website: string | null | undefined): WebsitePlatform | null {
  const p = platformPage(website);
  if (!p || !website) return null;
  return { name: p.name, kind: p.kind, url: website.trim(), section: sectionForKind(p.kind) };
}

/** A link already on Google for the same platform (any link to it, in any
 * of Google's ordering / booking sections). */
export function existingLinkFor(platform: WebsitePlatform, links: PlaceActionLink[]): PlaceActionLink | null {
  return links.find((l) => sectionOf(l.placeActionType) !== null && platformPage(l.uri)?.name === platform.name) ?? null;
}
