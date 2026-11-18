// Day 23 2d-4: a Google listing as the scoring columns, in memory only.
// It's the exact mapping the scan's businesses upsert used before 2d-4
// (app/actions/businesses.ts), so a score built from it is the score that
// upsert-then-read-back gave — but none of it is saved. A scan scores
// `{ ...savedOwnColumns, ...listingScoringRow(place) }`; pages do the same
// with the visit's live read (lib/ownerListing.server.ts). Pure.

import { hasRecentReviewFrom, recentReviewsSeenFrom, type OpeningHoursPeriod, type PlaceDetails, type ServiceOptions } from "@/lib/google/places";

/** The businesses columns Google's listing fills (none of them saved since 2d-4). */
export interface ListingScoringColumns {
  name: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  primary_type: string | null;
  categories: string[] | null;
  opening_hours: string[] | null;
  opening_hours_periods: OpeningHoursPeriod[] | null;
  business_status: string | null;
  photo_count: number | null;
  google_maps_uri: string | null;
  price_level: string | null;
  google_service_options?: ServiceOptions;
  // Scoring v1.12.0's yes/no facts — only when the read included reviews
  // (the upsert left them untouched otherwise).
  has_recent_review?: boolean | null;
  recent_reviews_seen?: 0 | 1 | 2 | 3 | null;
  listing_has_accessibility?: boolean | null;
  listing_has_payment?: boolean | null;
  listing_has_parking?: boolean | null;
  pure_service_area_business?: boolean | null;
}

/** Every Google column, for "a scan writes none of these" (tests) and the readers' fallback. */
export const LISTING_SCORING_COLUMN_NAMES = [
  "name",
  "address",
  "phone",
  "website",
  "rating",
  "review_count",
  "category",
  "primary_type",
  "categories",
  "opening_hours",
  "opening_hours_periods",
  "business_status",
  "photo_count",
  "google_maps_uri",
  "price_level",
  "google_service_options",
  "has_recent_review",
  "recent_reviews_seen",
  "listing_has_accessibility",
  "listing_has_payment",
  "listing_has_parking",
  "pure_service_area_business",
] as const;

export function listingScoringRow(place: PlaceDetails, now: Date = new Date()): ListingScoringColumns {
  return {
    name: place.name,
    address: place.formattedAddress,
    phone: place.phone,
    website: place.website,
    rating: place.rating,
    review_count: place.userRatingCount,
    category: place.primaryCategory,
    primary_type: place.primaryType,
    categories: place.categories,
    opening_hours: place.openingHours,
    opening_hours_periods: place.openingHoursPeriods,
    business_status: place.businessStatus,
    photo_count: place.photoCount,
    google_maps_uri: place.googleMapsUri,
    price_level: place.priceLevel,
    ...(place.serviceOptions !== undefined ? { google_service_options: place.serviceOptions } : {}),
    ...(place.reviewPublishTimes === undefined
      ? {}
      : {
          has_recent_review: hasRecentReviewFrom(place.reviewPublishTimes, now),
          recent_reviews_seen: recentReviewsSeenFrom(place.reviewPublishTimes, now),
          listing_has_accessibility: place.listingHasAccessibility ?? null,
          listing_has_payment: place.listingHasPayment ?? null,
          listing_has_parking: place.listingHasParking ?? null,
          pure_service_area_business: place.pureServiceAreaBusiness ?? null,
        }),
  };
}

/** No Google values: what a page scores with when Google couldn't be read
 * (the saved columns are never used — Day 23). */
export function emptyListingColumns(): ListingScoringColumns {
  return {
    name: null,
    address: null,
    phone: null,
    website: null,
    rating: null,
    review_count: null,
    category: null,
    primary_type: null,
    categories: null,
    opening_hours: null,
    opening_hours_periods: null,
    business_status: null,
    photo_count: null,
    google_maps_uri: null,
    price_level: null,
  };
}
