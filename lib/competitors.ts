// Competitors feature: find real nearby same-category businesses via
// Google Places (New) Nearby Search, score each one with the exact same
// deterministic engine used for a saved business (lib/scoring.ts), and
// rank them by real PostScore. No invented competitors, no invented
// scores, no invented "rank" metric other than PostScore itself.

import {
  businessRowToScoringInput,
  scoreBusiness,
  type BusinessScoringRow,
  type ScoreBreakdown,
} from "@/lib/scoring";
import {
  lookupBusinessByPlaceId,
  searchNearbyPlaces,
  type NearbyCandidate,
  type PlaceDetails,
} from "@/lib/google/places";

/** How many nearest comparable competitors to score and show. Kept small
 * on purpose — every entry costs one Places Details call. */
export const MAX_COMPETITORS = 5;

const METERS_PER_MILE = 1609.34;

/**
 * Search radius tiers, narrowest first — like Google Maps, we start by
 * asking "who is actually nearby" (~1.5 mi) and only widen if that
 * genuinely doesn't turn up enough comparable businesses. Each tier is a
 * separate Nearby Search call (cheap, Basic-tier fields only), so this
 * only costs more when the narrow search really did come up short — never
 * more than one call per tier, capped at three tiers total.
 */
const RADIUS_TIERS_METERS = [
  1.5 * METERS_PER_MILE,
  3 * METERS_PER_MILE,
  5 * METERS_PER_MILE,
];

function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

function formatMiles(meters: number): string {
  const mi = metersToMiles(meters);
  return Number.isInteger(mi) ? String(mi) : mi.toFixed(1);
}

const EARTH_RADIUS_METERS = 6371000;

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The saved business we're finding competitors for — everything scoring
 * needs, plus the location/category fields competitor search needs. */
export interface CompetitorSourceBusiness extends BusinessScoringRow {
  placeId: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** Google's machine-readable primary type slug, e.g. "hair_salon". */
  primaryType: string | null;
}

export interface RankedCompetitor {
  placeId: string;
  name: string;
  isSubject: boolean;
  address: string | null;
  /** null only for the subject itself. */
  distanceMeters: number | null;
  rating: number | null;
  reviewCount: number | null;
  hasWebsite: boolean;
  googleMapsUri: string | null;
  breakdown: ScoreBreakdown;
}

/** A nearby, genuinely same-category place we found but couldn't score —
 * shown honestly rather than dropped silently or scored as a zero. */
export interface UnscoredCompetitor {
  placeId: string;
  name: string;
  address: string | null;
  distanceMeters: number;
  reason: string;
}

export interface CompetitorScanResult {
  status: "ok" | "no_location" | "no_category" | "error";
  /** Always a plain-language, honest summary of what was found. */
  message: string;
  /** Human-readable category label used for comparability, when known. */
  categoryLabel: string | null;
  /**
   * The real distance (in miles) to the farthest competitor actually
   * shown in `ranked` — not a nominal search cutoff. Reflects exactly
   * what "within X mi" means in the UI. 0 when no competitors were found.
   */
  radiusMiles: number;
  /** True if the narrowest radius tier didn't find enough comparable
   * competitors and the search had to widen. */
  searchWidened: boolean;
  /** Subject + successfully scored competitors, sorted by real PostScore
   * descending. Empty when status !== "ok". */
  ranked: RankedCompetitor[];
  /** 1-indexed position of the subject within `ranked`, by PostScore. */
  subjectRank: number | null;
  unscored: UnscoredCompetitor[];
}

function placeDetailsToScoringRow(place: PlaceDetails): BusinessScoringRow {
  return {
    rating: place.rating,
    review_count: place.userRatingCount,
    phone: place.phone,
    address: place.formattedAddress,
    opening_hours: place.openingHours,
    website: place.website,
    categories: place.categories,
    category: place.primaryCategory,
    photo_count: place.photoCount,
    business_status: place.businessStatus,
  };
}

/**
 * Curated groups of Google place-type slugs that are genuinely
 * comparable even when they're not the exact same type — e.g. a real
 * "beauty_salon" that does hair is a true competitor to a "hair_salon"
 * the way a customer (or Google Maps itself) would see it. This is a
 * disciplined allowlist, not a fuzzy match: a candidate only counts as
 * comparable if it shares a type with the subject directly, OR both the
 * subject's and the candidate's types fall in the SAME curated group
 * here. Anything not in one of these groups still requires an exact type
 * match — a barbershop (a distinct, more male-grooming-focused business
 * model) or an unrelated type like a gym stays excluded, on purpose.
 */
const CATEGORY_FAMILIES: string[][] = [["hair_salon", "beauty_salon", "hair_care"]];

function categoryFamilyFor(type: string): string[] | null {
  return CATEGORY_FAMILIES.find((family) => family.includes(type)) ?? null;
}

/**
 * The full set of type slugs that should count as "comparable" to the
 * subject's reference type — just the type itself if it's not part of
 * any curated family, or every member of its family when it is. Used
 * both to ask Nearby Search for the right types server-side and to
 * double-check comparability once results come back.
 */
function comparableTypesFor(referenceType: string): string[] {
  return categoryFamilyFor(referenceType) ?? [referenceType];
}

/**
 * Google tags many nail salons, day spas, and massage studios with
 * "beauty_salon" alongside their own more specific type — that's real
 * Google data, not a mistake on Google's part, but it means the
 * hair/salon family match above would otherwise wave through a nail spa
 * as if it were a hair salon. A candidate carrying ANY of these clearly
 * different personal-care service types is excluded from a family match
 * even when it also carries a family type — e.g. a place tagged
 * [beauty_salon, nail_salon] is a nail place, not a hair-salon
 * competitor. This only applies to family matches (see isSameCategory);
 * it never touches an exact-type match outside the family. Add to this
 * list as more false positives turn up.
 */
const NON_HAIR_SERVICE_EXCLUSIONS = [
  "nail_salon",
  "spa",
  "day_spa",
  "massage",
  "massage_spa",
  "barber_shop",
  "tanning_studio",
];

/** Every type slug Google has on file for a candidate — its primaryType
 * plus its full types list, deduplicated. */
function candidateTypeSet(candidate: NearbyCandidate): string[] {
  const set = new Set<string>();
  if (candidate.primaryType) set.add(candidate.primaryType);
  if (candidate.types) for (const t of candidate.types) set.add(t);
  return Array.from(set);
}

/** True only when we can verify the candidate shares the subject's
 * category — either an exact machine type slug match, or (for reference
 * types in a curated CATEGORY_FAMILIES group) membership in that same
 * family AND no clearly-different NON_HAIR_SERVICE_EXCLUSIONS type on
 * the candidate, or (only when no machine type is available at all) an
 * exact human-readable category label match. Never a fuzzy guess. */
function isSameCategory(
  candidate: NearbyCandidate,
  ref: { type: string | null; displayName: string | null }
): boolean {
  if (ref.type) {
    const family = categoryFamilyFor(ref.type);
    if (family) {
      const candidateTypes = candidateTypeSet(candidate);
      if (candidateTypes.some((t) => NON_HAIR_SERVICE_EXCLUSIONS.includes(t))) {
        return false;
      }
      return candidateTypes.some((t) => family.includes(t));
    }
    // Not part of any curated family — exact type match only, same
    // discipline as before.
    if (candidate.primaryType === ref.type) return true;
    if (candidate.types && candidate.types.includes(ref.type)) return true;
    return false;
  }
  if (ref.displayName) {
    return (
      !!candidate.primaryTypeDisplayName &&
      candidate.primaryTypeDisplayName.trim().toLowerCase() ===
        ref.displayName.trim().toLowerCase()
    );
  }
  return false;
}

function emptyResult(
  status: "no_location" | "no_category" | "error",
  message: string,
  categoryLabel: string | null
): CompetitorScanResult {
  return {
    status,
    message,
    categoryLabel,
    radiusMiles: 0,
    searchWidened: false,
    ranked: [],
    subjectRank: null,
    unscored: [],
  };
}

/**
 * Finds real nearby same-category competitors for `subject`, scores each
 * one (and the subject) with scoreBusiness() from lib/scoring.ts, and
 * returns them ranked strictly by that real PostScore — never a fabricated
 * "maps rank" or SEO metric.
 */
export async function findAndScoreCompetitors(
  subject: CompetitorSourceBusiness
): Promise<CompetitorScanResult> {
  const categoryLabel = subject.category ?? subject.primaryType ?? null;

  if (subject.lat === null || subject.lng === null) {
    return emptyResult(
      "no_location",
      "This business has no saved coordinates, so we can't search nearby. Re-save it from a fresh Google Places lookup to pick up its location.",
      categoryLabel
    );
  }

  const referenceType = subject.primaryType ?? subject.categories?.[0] ?? null;
  const referenceDisplayName = subject.category ?? null;

  if (!referenceType && !referenceDisplayName) {
    return emptyResult(
      "no_category",
      "This business has no category on file, so we can't tell which nearby businesses are genuinely comparable. Re-save it from Google Places to pick up its category.",
      categoryLabel
    );
  }

  const subjectLocation = { lat: subject.lat, lng: subject.lng };
  const subjectBreakdown = scoreBusiness(businessRowToScoringInput(subject));

  type Comparable = { candidate: NearbyCandidate; distanceMeters: number };
  let comparable: Comparable[] = [];
  let searchWidened = false;

  // Ask Google for every type in the subject's comparable family (not
  // just its exact type), so a genuine "beauty_salon" competitor to a
  // "hair_salon" isn't filtered out server-side before isSameCategory()
  // ever sees it.
  const includedTypes = referenceType ? comparableTypesFor(referenceType) : undefined;

  // Start at the narrowest radius tier ("who is actually nearby") and
  // only widen if it genuinely doesn't turn up enough comparable
  // competitors — one Nearby Search call per tier, distance-ranked so the
  // results really are the closest matches, not just the most popular
  // ones within a wide circle.
  for (let tier = 0; tier < RADIUS_TIERS_METERS.length; tier++) {
    let candidates: NearbyCandidate[];
    try {
      candidates = await searchNearbyPlaces({
        lat: subjectLocation.lat,
        lng: subjectLocation.lng,
        radiusMeters: RADIUS_TIERS_METERS[tier],
        includedTypes,
        maxResultCount: 20,
        rankPreference: "DISTANCE",
      });
    } catch (err) {
      return emptyResult(
        "error",
        err instanceof Error ? err.message : "Nearby search failed.",
        categoryLabel
      );
    }

    comparable = candidates
      .filter((c) => c.placeId !== subject.placeId)
      .filter((c) => c.businessStatus !== "CLOSED_PERMANENTLY")
      .filter((c) => c.location !== null)
      .filter((c) => isSameCategory(c, { type: referenceType, displayName: referenceDisplayName }))
      .map((c) => ({
        candidate: c,
        distanceMeters: haversineMeters(subjectLocation, c.location as { lat: number; lng: number }),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, MAX_COMPETITORS);

    if (comparable.length >= MAX_COMPETITORS) break;
    if (tier < RADIUS_TIERS_METERS.length - 1) searchWidened = true;
  }

  const scoredCompetitors: RankedCompetitor[] = [];
  const unscored: UnscoredCompetitor[] = [];

  // Sequential on purpose: at most MAX_COMPETITORS Details calls, and
  // keeping them sequential makes a single failed lookup easy to isolate
  // and report honestly rather than tangling error handling across a
  // Promise.all batch.
  for (const { candidate, distanceMeters } of comparable) {
    const result = await lookupBusinessByPlaceId(candidate.placeId);

    if (result.status !== "found") {
      unscored.push({
        placeId: candidate.placeId,
        name: candidate.name ?? "(unnamed listing)",
        address: candidate.formattedAddress,
        distanceMeters,
        reason:
          result.status === "error"
            ? result.message
            : "Google Places returned no usable details for this listing.",
      });
      continue;
    }

    // Re-check status at Details time too — Nearby Search data can be
    // slightly stale, and we never want to score a closed business. This
    // candidate was already counted in `comparable` (and so in the "we
    // found N comparable businesses" message below), so it goes to
    // `unscored` rather than a silent continue — dropping it with no
    // record would let the reported count and radius overstate what's
    // actually shown, with no footnote explaining the gap.
    if (result.place.businessStatus === "CLOSED_PERMANENTLY") {
      unscored.push({
        placeId: candidate.placeId,
        name: result.place.name ?? candidate.name ?? "(unnamed listing)",
        address: result.place.formattedAddress ?? candidate.formattedAddress,
        distanceMeters,
        reason: "Google shows this listing as permanently closed.",
      });
      continue;
    }

    const row = placeDetailsToScoringRow(result.place);
    const breakdown = scoreBusiness(businessRowToScoringInput(row));

    scoredCompetitors.push({
      placeId: candidate.placeId,
      name: result.place.name ?? candidate.name ?? "(unnamed listing)",
      isSubject: false,
      address: result.place.formattedAddress,
      distanceMeters,
      rating: result.place.rating,
      reviewCount: result.place.userRatingCount,
      hasWebsite: !!result.place.website && result.place.website.trim().length > 0,
      googleMapsUri: result.place.googleMapsUri,
      breakdown,
    });
  }

  const subjectEntry: RankedCompetitor = {
    placeId: subject.placeId,
    name: subject.name ?? "This business",
    isSubject: true,
    address: subject.address,
    distanceMeters: null,
    rating: subject.rating,
    reviewCount: subject.review_count,
    hasWebsite: !!subject.website && subject.website.trim().length > 0,
    googleMapsUri: null,
    breakdown: subjectBreakdown,
  };

  const ranked = [subjectEntry, ...scoredCompetitors].sort(
    (a, b) => b.breakdown.total - a.breakdown.total
  );
  const subjectRank = ranked.findIndex((r) => r.isSubject) + 1;

  // "Within X mi" always describes the real distance to the farthest
  // competitor actually found and shown — not the (possibly wider) radius
  // we had to search to find them.
  const comparableCount = comparable.length;
  const farthestMeters =
    comparableCount > 0 ? Math.max(...comparable.map((c) => c.distanceMeters)) : 0;
  const radiusMiles = metersToMiles(farthestMeters);
  const radiusLabel = formatMiles(farthestMeters);
  const label = categoryLabel ?? "same-category";

  let message: string;
  if (comparableCount === 0) {
    const searchedLabel = formatMiles(RADIUS_TIERS_METERS[RADIUS_TIERS_METERS.length - 1]);
    message = `We found 0 comparable ${label} businesses within ${searchedLabel} mi of this listing.`;
  } else if (comparableCount < MAX_COMPETITORS) {
    message = `We found only ${comparableCount} comparable ${label} business${comparableCount === 1 ? "" : "es"} — the nearest are within ${radiusLabel} mi.`;
  } else {
    message = `Showing the ${comparableCount} nearest comparable ${label} businesses, all within ${radiusLabel} mi.`;
  }
  if (searchWidened && comparableCount > 0) {
    message += ` We widened the search area to find them.`;
  }
  if (unscored.length > 0) {
    message += ` ${unscored.length} of them couldn't be scored — Google returned no usable details.`;
  }

  return {
    status: "ok",
    message,
    categoryLabel,
    radiusMiles,
    searchWidened,
    ranked,
    subjectRank,
    unscored,
  };
}
