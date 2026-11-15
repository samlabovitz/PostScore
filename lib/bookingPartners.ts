// The "Book online" button on a Google listing, from Google's Place Actions
// links (lib/gbpRealListing.server.ts): who put it there, and whether Google
// can count the bookings it brings. Pure; the one list of booking partners.
//
// Three cases when Google has counted 0 bookings in every stored month:
//   A. a partner-added link (providerType AGGREGATOR_3P, e.g. Square's own
//      square.site page): the partner is already connected to Google, but
//      bookings finish on its site — an info note, never a task;
//   B. a link the owner typed (MERCHANT) to a partner's domain: the partner's
//      "Reserve with Google" isn't on — a one-time "Turn on Google booking"
//      action with that partner's steps;
//   C. any month with bookings > 0: tracked, nothing to say.
// No booking link at all: the existing "add a booking link" behavior.

import type { PlaceActionLink } from "@/lib/gbpPlaceActions";

export interface BookingPartner {
  id: string;
  name: string;
  domains: string[];
}

/** Booking partners that support booking inside Google ("Reserve with Google"). */
export const BOOKING_PARTNERS: readonly BookingPartner[] = [
  { id: "square", name: "Square", domains: ["square.site", "squareup.com", "book.squareup.com"] },
  { id: "vagaro", name: "Vagaro", domains: ["vagaro.com"] },
  { id: "booksy", name: "Booksy", domains: ["booksy.com"] },
  { id: "fresha", name: "Fresha", domains: ["fresha.com"] },
  { id: "mindbody", name: "Mindbody", domains: ["mindbodyonline.com", "mindbody.io"] },
  { id: "styleseat", name: "StyleSeat", domains: ["styleseat.com"] },
  { id: "glossgenius", name: "GlossGenius", domains: ["glossgenius.com"] },
  { id: "acuity", name: "Acuity", domains: ["acuityscheduling.com", "as.me"] },
  { id: "setmore", name: "Setmore", domains: ["setmore.com"] },
  { id: "simplybook", name: "SimplyBook", domains: ["simplybook.me", "simplybook.it"] },
  { id: "schedulicity", name: "Schedulicity", domains: ["schedulicity.com"] },
  { id: "boulevard", name: "Boulevard", domains: ["joinblvd.com", "blvd.co"] },
];

function host(uri: string | undefined): string | null {
  try {
    return uri ? new URL(uri).hostname.toLowerCase().replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

export function partnerFor(uri: string | undefined): BookingPartner | null {
  const h = host(uri);
  if (!h) return null;
  return BOOKING_PARTNERS.find((p) => p.domains.some((d) => h === d || h.endsWith(`.${d}`))) ?? null;
}

const BOOKING_TYPES = new Set(["APPOINTMENT", "ONLINE_APPOINTMENT", "DINING_RESERVATION"]);

export type BookingLink =
  | { kind: "none" }
  /** merchant: the owner's own link (editable here); partner: added by a booking partner or Google (read-only). */
  | { kind: "merchant" | "partner"; uri: string; provider: string; partnerId: string | null };

/** The listing's booking button: the owner's own link first, else a partner's. */
export function bookingLink(links: PlaceActionLink[]): BookingLink {
  const booking = links.filter((l) => l.uri && BOOKING_TYPES.has(String(l.placeActionType)));
  const isMerchant = (l: PlaceActionLink) => l.providerType === "MERCHANT" || (l.providerType === undefined && l.isEditable === true);
  const pick = booking.find(isMerchant) ?? booking[0];
  if (!pick?.uri) return { kind: "none" };
  const partner = partnerFor(pick.uri);
  return { kind: isMerchant(pick) ? "merchant" : "partner", uri: pick.uri, provider: partner?.name ?? host(pick.uri) ?? pick.uri, partnerId: partner?.id ?? null };
}

export type BookingTracking =
  | { kind: "none" }
  /** A: the partner's button is on Google; bookings finish on its site. */
  | { kind: "partner_not_counted"; provider: string }
  /** B: the owner's link to a partner; Google booking isn't turned on. "still": snoozed before, still 0. */
  | { kind: "turn_on"; provider: string; partnerId: string; still: boolean };

export const BOOKING_SNOOZE_DAYS = 14;
const DAY_MS = 86_400_000;

/** A, B or C (see the top of this file), from the real link and the stored
 * months' bookings. Nothing without stored months (nothing to go on). */
export function bookingTracking(link: BookingLink, monthlyBookings: number[], snoozedAt: string | null, now: number): BookingTracking {
  if (link.kind === "none" || monthlyBookings.length === 0 || monthlyBookings.some((b) => b > 0)) return { kind: "none" };
  if (link.kind === "partner") return { kind: "partner_not_counted", provider: link.provider };
  if (!link.partnerId) return { kind: "none" };
  // "I turned it on": hidden for 14 days; after that, still 0 → "Still not tracked".
  const snoozed = snoozedAt ? Date.parse(snoozedAt) : NaN;
  if (Number.isFinite(snoozed) && now - snoozed < BOOKING_SNOOZE_DAYS * DAY_MS) return { kind: "none" };
  return { kind: "turn_on", provider: link.provider, partnerId: link.partnerId, still: Number.isFinite(snoozed) };
}
