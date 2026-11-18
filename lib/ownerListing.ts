// Day 23 2d-2: the owner's own Google listing values, read live when a
// page is shown and never saved — from Business Profile when the owner
// connected Google (no Places call), else one Place Details call per
// visit (lib/ownerListing.server.ts). Pages put them in place of the
// saved columns (withLiveListing); when Google can't be reached the
// values are left empty and the page says "Couldn't load from Google
// right now". Pure.

import type { OpeningHoursPeriod, PlaceDetails } from "@/lib/google/places";
import { formatOpeningHours } from "@/lib/hours";
import { emptyListingColumns, listingScoringRow, type ListingScoringColumns } from "@/lib/listingScoringRow";
import { partOfAttribute } from "@/lib/gbpAttributes";

export interface LiveListingValues {
  /** The listing's name and address: only the "Your business details"
   * card's pre-fill reads them (lib/ownerDetails.ts). */
  name?: string | null;
  address?: string | null;
  rating: number | null;
  reviewCount: number | null;
  phone: string | null;
  website: string | null;
  /** Google's own weekday lines ("Monday: 9:00 AM – 5:00 PM"). */
  openingHours: string[] | null;
  openingHoursPeriods: OpeningHoursPeriod[] | null;
  businessStatus: string | null;
  photoCount: number | null;
  googleMapsUri: string | null;
}

export type LiveListing =
  /** `columns`: every scoring input Google's listing gives (Day 23 2d-4), for the page's words. */
  | { status: "ok"; source: "business_profile" | "places"; values: LiveListingValues; columns: ListingScoringColumns }
  /** Google couldn't be reached (or a cap): show our results and the fallback line. */
  | { status: "unavailable" }
  /** No Google listing (website only, or no place id): nothing to read. */
  | { status: "none" };

/** From a Place Details answer (OWNER_LISTING_FIELD_MASK). */
export function liveValuesFromPlaces(place: PlaceDetails): LiveListingValues {
  return {
    name: place.name ?? null,
    address: place.formattedAddress ?? null,
    rating: place.rating,
    reviewCount: place.userRatingCount,
    phone: place.phone,
    website: place.website,
    openingHours: place.openingHours,
    openingHoursPeriods: place.openingHoursPeriods,
    businessStatus: place.businessStatus,
    photoCount: place.photoCount,
    googleMapsUri: place.googleMapsUri,
  };
}

const GBP_DAYS: Record<string, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 };

interface GbpPeriod {
  openDay?: string;
  openTime?: { hours?: number; minutes?: number };
  closeDay?: string;
  closeTime?: { hours?: number; minutes?: number };
}

/** Business Profile's regular hours as Places periods (the shape every
 * hours line on the pages reads). Null when there are none or one doesn't parse. */
export function placesPeriodsFromGbp(periods: unknown[] | null | undefined): OpeningHoursPeriod[] | null {
  if (!periods || periods.length === 0) return null;
  const out: OpeningHoursPeriod[] = [];
  for (const raw of periods as GbpPeriod[]) {
    const open = raw.openDay ? GBP_DAYS[raw.openDay] : undefined;
    const close = raw.closeDay ? GBP_DAYS[raw.closeDay] : undefined;
    if (open === undefined || close === undefined) return null;
    // Google's 24:00 close is midnight at the start of the next day.
    const closeHour = raw.closeTime?.hours ?? 0;
    out.push({
      open: { day: open, hour: raw.openTime?.hours ?? 0, minute: raw.openTime?.minutes ?? 0 },
      close: closeHour === 24 ? { day: (close + 1) % 7, hour: 0, minute: 0 } : { day: close, hour: closeHour, minute: raw.closeTime?.minutes ?? 0 },
    });
  }
  return out;
}

/** A US number as Places writes it ("+1 914-320-3012"), so it reads the
 * same whichever API it came from; any other number as given. */
export function placesStylePhone(phone: string | null | undefined): string | null {
  const p = phone?.trim();
  if (!p) return null;
  const m = /^(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})$/.exec(p);
  return m ? `+1 ${m[1]}-${m[2]}-${m[3]}` : p;
}

/** Business Profile's storefront address as one line, the way Places
 * writes it ("12 Main St, Springfield, NJ 07081"). Null when there's none. */
export function gbpAddressLine(a: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string } | undefined): string | null {
  if (!a) return null;
  const region = [a.administrativeArea, a.postalCode].map((v) => v?.trim()).filter(Boolean).join(" ");
  const parts = [...(a.addressLines ?? []), a.locality, region].map((v) => v?.trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** From the connected owner's Business Profile: the location (phone,
 * website, hours, maps link, open/closed), its reviews summary and the
 * photos summary the last scan or Google tab read. */
export function liveValuesFromBusinessProfile(input: {
  location: {
    title?: string;
    storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string };
    phoneNumbers?: { primaryPhone?: string };
    websiteUri?: string;
    regularHours?: { periods?: unknown[] };
    metadata?: { mapsUri?: string };
    openInfo?: { status?: string };
  };
  reviews: { averageRating: number | null; totalReviewCount: number | null } | null;
  photoCount: number | null;
}): LiveListingValues {
  const periods = placesPeriodsFromGbp(input.location.regularHours?.periods);
  const status = input.location.openInfo?.status;
  return {
    name: input.location.title?.trim() || null,
    address: gbpAddressLine(input.location.storefrontAddress),
    rating: input.reviews?.averageRating ?? null,
    reviewCount: input.reviews?.totalReviewCount ?? null,
    phone: placesStylePhone(input.location.phoneNumbers?.primaryPhone),
    website: input.location.websiteUri?.trim() || null,
    openingHours: periods ? formatOpeningHours(periods, "en") : null,
    openingHoursPeriods: periods,
    // Business Profile says OPEN; Places (and our checks) say OPERATIONAL.
    businessStatus: status === "OPEN" ? "OPERATIONAL" : status === "CLOSED_PERMANENTLY" || status === "CLOSED_TEMPORARILY" ? status : null,
    photoCount: input.photoCount,
    googleMapsUri: input.location.metadata?.mapsUri ?? null,
  };
}

/** Business Profile's category id without its prefix ("categories/gcid:hair_salon" → "hair_salon"). */
const categoryId = (name: string | undefined) => (name ?? "").replace(/^categories\//, "").replace(/^gcid:/, "") || null;

/**
 * A connected owner's scoring inputs from Business Profile (Day 23 2d-4,
 * D4): 0 Places calls. Categories as ids (the categories check needs a
 * list), the customer details Google shows from the owner's attributes
 * (any yes or no set counts, like Places), service area when there's no
 * storefront. Review recency comes from the owner's own reply counts.
 */
export function columnsFromBusinessProfile(input: {
  location: Parameters<typeof liveValuesFromBusinessProfile>[0]["location"] & {
    categories?: { primaryCategory?: { name?: string; displayName?: string }; additionalCategories?: Array<{ name?: string; displayName?: string }> };
    serviceArea?: unknown;
  };
  attributes: Array<{ name: string; values?: unknown[] }>;
  values: LiveListingValues;
}): ListingScoringColumns {
  const v = input.values;
  const cats = [input.location.categories?.primaryCategory, ...(input.location.categories?.additionalCategories ?? [])].map((c) => categoryId(c?.name)).filter((c): c is string => !!c);
  const shown = (part: "payment" | "parking" | "accessibility") => input.attributes.some((a) => partOfAttribute(a.name) === part && (a.values ?? []).some((x) => typeof x === "boolean"));
  return {
    ...emptyListingColumns(),
    name: v.name ?? null,
    address: v.address ?? null,
    phone: v.phone,
    website: v.website,
    rating: v.rating,
    review_count: v.reviewCount,
    category: input.location.categories?.primaryCategory?.displayName?.trim() || null,
    primary_type: categoryId(input.location.categories?.primaryCategory?.name),
    categories: cats.length ? cats : null,
    opening_hours: v.openingHours,
    opening_hours_periods: v.openingHoursPeriods,
    business_status: v.businessStatus,
    photo_count: v.photoCount,
    google_maps_uri: v.googleMapsUri,
    listing_has_accessibility: shown("accessibility"),
    listing_has_payment: shown("payment"),
    listing_has_parking: shown("parking"),
    pure_service_area_business: !input.location.storefrontAddress && !!input.location.serviceArea,
  };
}

/** Places' answer as the live read: the values pages show and every scoring input. */
export function liveListingFromPlaces(place: PlaceDetails, now: Date = new Date()): LiveListing {
  return { status: "ok", source: "places", values: liveValuesFromPlaces(place), columns: listingScoringRow(place, now) };
}

/** The listing columns a page shows (businesses row names). */
export interface ListingColumns {
  rating?: number | null;
  review_count?: number | null;
  phone?: string | null;
  website?: string | null;
  opening_hours?: string[] | null;
  opening_hours_periods?: OpeningHoursPeriod[] | null;
  business_status?: string | null;
  photo_count?: number | null;
  google_maps_uri?: string | null;
}

/**
 * A business row with Google's values as Google shows them now, in place
 * of the saved columns. Unavailable: those values are left empty (never
 * the saved ones) and `live_unavailable` tells the page to say so. No
 * listing: the row as it is.
 */
export function withLiveListing<T extends ListingColumns>(row: T, live: LiveListing): T & { live_unavailable?: boolean; live_source?: "business_profile" | "places" } {
  if (live.status === "none") return row;
  if (live.status === "unavailable") {
    // Every Google value empty; the name and address stay for the header
    // (lib/ownerDetails.ts withOwnerDetails) until 2d-5.
    const { name: _n, address: _a, ...empty } = emptyListingColumns();
    void _n;
    void _a;
    return { ...row, ...empty, live_unavailable: true };
  }
  // Day 23 2d-4: every Google value as Google shows it now — the name and
  // address too (what the website-vs-Google checks compare with); the
  // header shows the owner's confirmed ones over them (withOwnerDetails).
  return { ...row, ...live.columns, live_source: live.source };
}
