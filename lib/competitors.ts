// Competitors feature: find real nearby same-category businesses via
// Google Places (New) Nearby Search, score each one with the exact same
// deterministic engine used for a saved business (lib/scoring.ts), and
// rank them by real PostScore. No invented competitors, no invented
// scores, no invented "rank" metric other than PostScore itself.

import { MAX_SEARCH_RADIUS_MILES, SMALL_TOWN_RADIUS_MILES } from "@/lib/competitorScanPolicy";
import { alsoNearby, establishedCount, MIN_ESTABLISHED_COMPETITORS, selectCompetitors, temporarilyClosedNearby, type AlsoNearbyListing, type PoolEntry } from "@/lib/competitorQuality";
import { MAX_CALLS_PER_SCAN } from "@/lib/placesSearchBudget";
import { GOOGLE_TABLE_A_TYPES } from "@/lib/google/placeTypesTableA";
import {
  businessRowToScoringInput,
  isRealWebsite,
  scoreBusiness,
  type BusinessScoringRow,
  type ScoreBreakdown,
} from "@/lib/scoring";
import {
  searchNearbyPlaces,
  type NearbyCandidate,
  type PlaceDetails,
} from "@/lib/google/places";
import { t, tPlural, type Locale } from "@/lib/i18n";

/** How many nearest comparable competitors to score and show, at most —
 * never padded to this number: `comparable` below is built by filtering
 * for genuine category matches FIRST (isSameCategory), then slicing to
 * this cap, so a sparse area still honestly shows fewer. Kept bounded on
 * purpose since every entry costs one Places Details call, but raised
 * from 5 to 10 so a dense area can show a fuller, still-genuine picture. */
export const MAX_COMPETITORS = 10;

/**
 * Diagnostic-only, off by default. Set the DEBUG_COMPETITORS=1
 * environment variable (server-side — this never runs in the browser)
 * to print, for every findAndScoreCompetitors() call: the subject's
 * name/primaryType/types[], and for every raw Nearby Search candidate
 * at every radius tier actually searched, its name/primaryType/types[]/
 * distance and the exact isSameCategory verdict + reason (see
 * categorizeMatch below) — never a guess, always the real rule that
 * matched or failed. This never changes matching behavior, only
 * observes it; output goes to the server console (the `next dev`
 * terminal), since this runs inside a server action.
 */
const DEBUG_COMPETITORS = process.env.DEBUG_COMPETITORS === "1";

function debugLog(...args: unknown[]): void {
  if (DEBUG_COMPETITORS) console.log("[competitors]", ...args);
}

const METERS_PER_MILE = 1609.34;

/**
 * Search radius tiers, narrowest first — like Google Maps, we start by
 * asking "who is actually nearby" (~1.5 mi) and only widen if that
 * genuinely doesn't turn up enough comparable businesses. Each tier is a
 * separate Nearby Search call (~$0.035, and it carries every listing
 * field competitors are scored on — no per-competitor Details call), so this
 * only costs more when the narrow search really did come up short — never
 * more than one call per tier, capped at three tiers total.
 */
const RADIUS_TIERS_METERS = [
  1.5 * METERS_PER_MILE,
  3 * METERS_PER_MILE,
  MAX_SEARCH_RADIUS_MILES * METERS_PER_MILE,
];
/** The one small-town search (lib/competitorQuality.ts). */
const SMALL_TOWN_RADIUS_METERS = SMALL_TOWN_RADIUS_MILES * METERS_PER_MILE;
/** Nearby Search returns at most 20 places per call. */
const NEARBY_PAGE_SIZE = 20;

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
  /** Google place types for the owner's own PostScore business type
   * (business_type_override → that type's `placesType` in
   * config/bizProfiles.ts). Used ONLY when every Google type on the
   * listing is generic ("store", "service"); Google's own types win
   * whenever one is specific. */
  fallbackPlaceTypes?: string[] | null;
  /** The business's niche (config/niches.ts), when it has one: `directTypes`
   * are the niche's own Google types (the direct search — they win over a
   * generic listing), `wideTypes` the ticked "also competes with" areas'
   * types (ONE extra search at 3 mi). Absent = the search as before. */
  niche?: { directTypes: string[]; wideTypes: string[] } | null;
  /** The subject's own cached Google price-level enum (e.g.
   * "PRICE_LEVEL_MODERATE"), for the Pricing page's price-level
   * comparison. Optional/undefined for callers (like the Competitors
   * page) that don't select it — never fabricated when absent. */
  priceLevel?: string | null;
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
  /** The listing's website address as Google gives it — a real site or a
   * social page (Facebook etc.; hasWebsite is false then), or null. */
  websiteUrl?: string | null;
  /** The listing facts this scan already got from Google — saved so the
   * competitor's full score (lib/competitorFullScoring.ts) can check them
   * and "matches your Google listing". Competitors only. */
  listing?: {
    phone: string | null;
    openingHours: string[] | null;
    openingHoursPeriods: PlaceDetails["openingHoursPeriods"];
    categories: string[] | null;
    businessStatus: string | null;
  };
  googleMapsUri: string | null;
  breakdown: ScoreBreakdown;
  /** Google's raw price-level enum for this listing (e.g.
   * "PRICE_LEVEL_MODERATE"), or null when Google has no price data for
   * it — see lib/priceLevel.ts for the display mapping. */
  priceLevel: string | null;
  /** Google's real photo count for this listing — surfaced (not just
   * folded into `breakdown`'s completeness.photos check) so a caller
   * like lib/growthMoves.ts's add_photos_vs_competitors move can show
   * the real "nearby competitors have N, you have M" comparison rather
   * than trying to back it out of a points gap. Null when Google
   * reports none. */
  photoCount: number | null;
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
  status: "ok" | "no_location" | "no_category" | "category_too_generic" | "error";
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
  /** Google Places search calls this scan made (Nearby Search). */
  placesCalls?: number;
  /** Subject + successfully scored competitors, sorted by real PostScore
   * descending. Empty when status !== "ok". */
  ranked: RankedCompetitor[];
  /** 1-indexed position of the subject within `ranked`, by PostScore. */
  subjectRank: number | null;
  unscored: UnscoredCompetitor[];
  /** "Also nearby, with few or no reviews yet": closer listings of the
   * same kind that weren't picked — never ranked or scored. */
  alsoNearby?: AlsoNearbyListing[];
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
    // Competitors are scored from a fresh, real-time Places fetch, not
    // our own saved businesses table — there's no cached HTTPS probe
    // for them, and doing a live network check of every competitor's
    // site here would meaningfully slow down a scan. null is honest:
    // the check is excluded for competitors, never guessed from their
    // URL string (the exact bug this fix removes for the main flow).
    https_status: null,
    // Same reasoning: a real PageSpeed/HTML/screenshot analysis per
    // competitor would be slow and isn't something PostScore runs for
    // businesses it doesn't own — excluded, never estimated.
    website_analysis_json: null,
  };
}

/**
 * Too-broad Google place types that must NEVER be the sole basis for a
 * category match. Virtually every retail, food, or service business
 * carries one or more of these alongside its real type — "store",
 * "point_of_interest", and "establishment" show up on almost everything
 * Google indexes — so matching on one of these alone would treat
 * completely unrelated businesses as comparable (a variety store and a
 * burrito place both carry "store"/"food"). A comparison always requires
 * a shared SPECIFIC type (e.g. "mexican_restaurant", "book_store",
 * "hair_salon"); these are filtered out before any match is attempted.
 * Add to this list as more over-broad matches turn up.
 */
const GENERIC_TYPES = new Set([
  "store",
  "point_of_interest",
  "establishment",
  "service",
  "food",
  "food_store",
  "health",
]);

export function isGenericType(type: string): boolean {
  return GENERIC_TYPES.has(type);
}

/**
 * Broad food tags: real Google types, but they say HOW a place serves
 * (takeout, delivery) or that it's "a restaurant", not WHAT it serves —
 * nearby competitors carry their cuisine as the primary type
 * ("sushi_restaurant", "pizza_restaurant") with takeout as a secondary
 * tag. A listing whose only specific types are these (Umami Express,
 * primary "meal_takeaway") is compared with nearby food places of any
 * cuisine instead of requiring the same primary tag — the real bug that
 * found no competitors for a takeout sushi shop.
 */
const BROAD_FOOD_TYPES = new Set(["restaurant", "meal_takeaway", "meal_delivery"]);
/** What a broad food search asks Nearby Search for. */
export const BROAD_FOOD_SEARCH_TYPES = ["restaurant", "meal_takeaway", "meal_delivery"];

/** A place whose primary type makes it a food-service competitor. */
export function isFoodServiceType(type: string | null | undefined): boolean {
  return !!type && (BROAD_FOOD_TYPES.has(type) || type.endsWith("_restaurant") || type === "fast_food_restaurant");
}

/** The first specific type that ISN'T a broad food tag (a listing's
 * secondary "sushi_restaurant" beats its primary "meal_takeaway"). */
function firstNonBroadType(types: Array<string | null | undefined>): string | null {
  for (const t of types) {
    if (t && !isGenericType(t) && !BROAD_FOOD_TYPES.has(t)) return t;
  }
  return null;
}

/** Broadening only (never a direct match): sweets, bakeries and cafés
 * compete for the same treat/coffee visit — a donut shop with no other
 * donut shop nearby is compared with bakeries, dessert and coffee places.
 * Closest kin first: a bakery is compared with cake, dessert and cookie
 * shops before cafés, and with coffee chains last (competitorQuality.ts). */
const BROADER_FAMILIES: string[][] = [
  ["bakery", "cake_shop", "dessert_shop", "donut_shop", "confectionery", "chocolate_shop", "candy_store", "bagel_shop", "ice_cream_shop", "cafe", "coffee_shop", "tea_house", "juice_shop"],
];

/** The broader types to try when too few competitors turned up. */
export function broaderTypesFor(referenceType: string | null, food: boolean): string[] {
  if (food) return BROAD_FOOD_SEARCH_TYPES;
  if (!referenceType) return [];
  return BROADER_FAMILIES.find((f) => f.includes(referenceType)) ?? comparableTypesFor(referenceType);
}

/** Fewer comparable competitors than this after the radius tiers → one
 * broader-type search (within the per-scan call limit). */
export const MIN_COMPETITORS_BEFORE_BROADENING = 3;

/** The first type in `types` that isn't in GENERIC_TYPES, or null if
 * every type present is too generic to match on (or the list is empty).
 * Order matters: pass the most-authoritative type first (e.g.
 * primaryType) so it wins when it's specific. */
function firstSpecificType(types: Array<string | null | undefined>): string | null {
  for (const t of types) {
    if (t && !isGenericType(t)) return t;
  }
  return null;
}

/**
 * Curated groups of Google place-type slugs that are genuinely
 * comparable even when they're not the exact same type — e.g. a real
 * "beauty_salon" that does hair is a true competitor to a "hair_salon"
 * the way a customer (or Google Maps itself) would see it, and a
 * "burrito_restaurant" is a real competitor to a "mexican_restaurant"
 * even though Google filed them under different specific type slugs.
 * This is a disciplined allowlist, not a fuzzy match: a candidate only
 * counts as comparable if it shares a type with the subject directly, OR
 * both the subject's and the candidate's types fall in the SAME curated
 * group here — and every member of every group here is itself a SPECIFIC
 * type, never one of GENERIC_TYPES. Anything not in one of these groups
 * still requires an exact type match — a barbershop (a distinct, more
 * male-grooming-focused business model) or an unrelated type like a gym
 * stays excluded, on purpose.
 */
const CATEGORY_FAMILIES: string[][] = [
  ["hair_salon", "beauty_salon", "hair_care"],
  [
    "mexican_restaurant",
    "tex_mex_restaurant",
    "burrito_restaurant",
    "taco_restaurant",
    // Real, live Google data (see DEBUG_COMPETITORS): a genuine burrito
    // place — El Diablo Burritos, Newark DE — comes back with
    // primaryType "southwestern_us_restaurant" and "burrito_restaurant"
    // only as a secondary type. Since categorizeMatch() requires the
    // family match on primaryType (a secondary tag isn't enough — see
    // its doc comment), that business never matched "mexican_restaurant"
    // subjects (e.g. Chipotle) in either direction until this was added.
    "southwestern_us_restaurant",
  ],
];

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

/**
 * A business currently isn't a real competitor if it isn't currently
 * open for business — Google's businessStatus enum is OPERATIONAL,
 * CLOSED_TEMPORARILY, or CLOSED_PERMANENTLY, and both closed states mean
 * "not who this business is competing with right now." Checked both
 * before scoring (from Nearby Search's thinner data) and again after
 * fetching full Details, since Nearby Search data can be slightly stale.
 */
const CLOSED_BUSINESS_STATUSES = new Set(["CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY"]);

function isClosedStatus(status: string | null): boolean {
  return !!status && CLOSED_BUSINESS_STATUSES.has(status);
}

/** Every type slug Google has on file for a candidate — its primaryType
 * plus its full types list, deduplicated. */
function candidateTypeSet(candidate: NearbyCandidate): string[] {
  const set = new Set<string>();
  if (candidate.primaryType) set.add(candidate.primaryType);
  if (candidate.types) for (const t of candidate.types) set.add(t);
  return Array.from(set);
}

/**
 * The actual decision logic, with a human-readable reason attached for
 * debuggability — isSameCategory() below is a thin wrapper around this
 * so the real matching behavior and any future diagnostic can never
 * drift apart from each other.
 *
 * A candidate only counts as comparable when being the subject's type
 * IS the candidate's own primary identity, not a sideline: either
 * candidate.primaryType exactly equals the subject's reference type, or
 * (for reference types in a curated CATEGORY_FAMILIES group)
 * candidate.primaryType is itself a member of that same family — AND,
 * in the family case, the candidate carries no clearly-different
 * NON_HAIR_SERVICE_EXCLUSIONS type anywhere on it. A type appearing only
 * in candidate.types[] (never as its primaryType) is NEVER enough on its
 * own — that's exactly how a convenience store that happens to sell
 * liquor (primaryType "convenience_store", "liquor_store" buried in
 * types[]) used to slip in as a competitor to an actual liquor store.
 * Requiring primaryType identity also means a generic or differently-
 * specific primaryType (a supermarket's bakery aisle, a drugstore that
 * also carries liquor) is automatically excluded without needing to
 * hand-list every broad/unrelated type — see GENERIC_TYPES for the one
 * remaining defense-in-depth check that still applies. The only other
 * path is (when no machine type is available on the subject at all) an
 * exact human-readable category label match. Never a fuzzy guess.
 */
function categorizeMatch(
  candidate: NearbyCandidate,
  ref: { type: string | null; displayName: string | null }
): { matches: boolean; reason: string } {
  if (ref.type) {
    const family = categoryFamilyFor(ref.type);
    if (family) {
      const primaryIsFamilyMember = !!candidate.primaryType && family.includes(candidate.primaryType);
      if (!primaryIsFamilyMember) {
        const secondaryFamilyHit = candidate.types?.find((t) => family.includes(t));
        return {
          matches: false,
          reason: secondaryFamilyHit
            ? `primaryType "${candidate.primaryType ?? "—"}" is not in subject's curated family [${family.join(", ")}], even though "${secondaryFamilyHit}" appears in candidate.types[] — a secondary tag isn't enough; a business must have this as its actual primary identity`
            : `primaryType "${candidate.primaryType ?? "—"}" is not in subject's curated family [${family.join(", ")}], and candidate.types[] [${(candidate.types ?? []).join(", ")}] has no overlap either`,
        };
      }
      // primaryType confirmed a family member — still check the full
      // type set for a disqualifying secondary tag (e.g. a shop Google
      // primary-typed as "beauty_salon" that also carries "nail_salon").
      const candidateTypes = candidateTypeSet(candidate);
      const excludedHit = candidateTypes.find((t) => NON_HAIR_SERVICE_EXCLUSIONS.includes(t));
      if (excludedHit) {
        return {
          matches: false,
          reason: `excluded: candidate carries "${excludedHit}" (NON_HAIR_SERVICE_EXCLUSIONS), even though its primaryType "${candidate.primaryType}" is in a curated family [${family.join(", ")}]`,
        };
      }
      return {
        matches: true,
        reason: `primaryType "${candidate.primaryType}" is in the same curated family [${family.join(", ")}] as subject type "${ref.type}"`,
      };
    }
    // Defense in depth: findAndScoreCompetitors() is expected to only
    // ever pass a specific type here (see firstSpecificType), but if a
    // generic type ever slipped through, refuse to match on it rather
    // than silently treating half the map as comparable.
    if (isGenericType(ref.type)) {
      return {
        matches: false,
        reason: `refused: subject type "${ref.type}" is in GENERIC_TYPES and can never be a match basis on its own`,
      };
    }
    // Not part of any curated family — the candidate's PRIMARY identity
    // must equal the subject's type. A match via candidate.types[] alone
    // is deliberately not enough (see the function doc comment above).
    if (candidate.primaryType === ref.type) {
      return { matches: true, reason: `exact primaryType match ("${ref.type}")` };
    }
    const secondaryHit = candidate.types?.includes(ref.type) ?? false;
    return {
      matches: false,
      reason: secondaryHit
        ? `primaryType "${candidate.primaryType ?? "—"}" doesn't match subject type "${ref.type}", even though "${ref.type}" appears in candidate.types[] — a secondary tag isn't enough; primaryType must be the actual identity`
        : `no match: subject type "${ref.type}" not found in candidate primaryType ("${candidate.primaryType ?? "—"}") or types [${(candidate.types ?? []).join(", ")}], and "${ref.type}" is not in any curated CATEGORY_FAMILIES group`,
    };
  }
  if (ref.displayName) {
    const matches =
      !!candidate.primaryTypeDisplayName &&
      candidate.primaryTypeDisplayName.trim().toLowerCase() === ref.displayName.trim().toLowerCase();
    return {
      matches,
      reason: matches
        ? `display-name match ("${ref.displayName}") — no machine type was available on the subject`
        : `no machine type on subject, and candidate's display name ("${candidate.primaryTypeDisplayName ?? "—"}") doesn't exactly match subject's ("${ref.displayName}")`,
    };
  }
  return { matches: false, reason: "no reference category available on the subject at all" };
}

/** True only when we can verify the candidate shares the subject's
 * category — see categorizeMatch() for the full rule and reasoning. */
function isSameCategory(
  candidate: NearbyCandidate,
  ref: { type: string | null; displayName: string | null }
): boolean {
  return categorizeMatch(candidate, ref).matches;
}

function emptyResult(
  status: "no_location" | "no_category" | "category_too_generic" | "error",
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
/**
 * Why a competitor scan can't search at all, decided from saved data
 * alone (no network, no cost) with the exact rule findAndScoreCompetitors
 * applies before searching: no saved coordinates, or only generic Google
 * types ("store", "service", …) to match on. null = a scan can search.
 */
export function competitorScanBlocker(
  subject: Pick<CompetitorSourceBusiness, "lat" | "lng" | "primaryType" | "categories" | "fallbackPlaceTypes">
): "no_location" | "category_too_generic" | null {
  if (subject.lat === null || subject.lng === null) return "no_location";
  const hasAnyTypeData = !!subject.primaryType || !!(subject.categories && subject.categories.length > 0);
  const specificType = firstSpecificType([subject.primaryType, ...(subject.categories ?? [])]);
  if (!hasAnyTypeData || specificType) return null;
  return usableFallbackTypes(subject.fallbackPlaceTypes).length > 0 ? null : "category_too_generic";
}

/** The owner's business-type place types a scan searches INSTEAD of
 * Google's own types — non-empty only when every type on the listing is
 * generic (the real Shoe Tech case: "service" → laundry, tailor). Same
 * rule as findAndScoreCompetitors; the Competitors page names them. */
export function competitorFallbackTypes(
  subject: Pick<CompetitorSourceBusiness, "primaryType" | "categories" | "fallbackPlaceTypes">
): string[] {
  const hasAnyTypeData = !!subject.primaryType || !!(subject.categories && subject.categories.length > 0);
  if (!hasAnyTypeData || firstSpecificType([subject.primaryType, ...(subject.categories ?? [])])) return [];
  return usableFallbackTypes(subject.fallbackPlaceTypes);
}

/** The owner's business-type place types that are real, specific search
 * types (never generic ones like "store"), and that Google's Nearby
 * Search accepts — one unsupported type fails the whole search with a 400
 * (the real Main Street Cleaners case: a niche typed "dry_cleaner"). */
function usableFallbackTypes(types: string[] | null | undefined): string[] {
  return searchableTypes(types).filter((t) => !isGenericType(t));
}

/** Only types Google's Nearby Search supports (Table A). */
export function searchableTypes(types: readonly (string | null | undefined)[] | null | undefined): string[] {
  return (types ?? []).filter((t): t is string => !!t && GOOGLE_TABLE_A_TYPES.has(t));
}

export async function findAndScoreCompetitors(
  subject: CompetitorSourceBusiness,
  locale: Locale
): Promise<CompetitorScanResult> {
  const categoryLabel = subject.category ?? subject.primaryType ?? null;

  if (subject.lat === null || subject.lng === null) {
    return emptyResult("no_location", t(locale, "dashboard.competitors.noCoordinatesError"), categoryLabel);
  }

  // primaryType is checked first (Google's own most-authoritative type),
  // then the full types list, in order — the first one that isn't in
  // GENERIC_TYPES wins.
  const hasAnyTypeData =
    !!subject.primaryType || !!(subject.categories && subject.categories.length > 0);
  const googleSpecificType = firstSpecificType([subject.primaryType, ...(subject.categories ?? [])]);
  // Google's own types win when one is specific. Only when every type on
  // the listing is generic do we fall back to the owner's PostScore
  // business type (the real Shoe Tech case: Google says only "service";
  // the owner set "repair & drop-off" → laundry / tailor).
  // A niche's own Google types are the direct search (e.g. a "Toy, game &
  // hobby store" Google lists only as "service"); else the owner's type
  // when Google's own types are all generic.
  const nicheDirect = usableFallbackTypes(subject.niche?.directTypes);
  const fallbackTypes = nicheDirect.length > 0 ? nicheDirect : hasAnyTypeData && !googleSpecificType ? usableFallbackTypes(subject.fallbackPlaceTypes) : [];
  // A broad food tag as the primary type: prefer a more specific type
  // further down the listing; with none, compare with food places of any
  // cuisine (broadFood).
  const googleNonBroad = firstNonBroadType([subject.primaryType, ...(subject.categories ?? [])]);
  const broadFood = nicheDirect.length === 0 && fallbackTypes.length === 0 && !!googleSpecificType && BROAD_FOOD_TYPES.has(googleSpecificType) && !googleNonBroad;
  const specificType = nicheDirect[0] ?? (googleSpecificType && BROAD_FOOD_TYPES.has(googleSpecificType) ? (googleNonBroad ?? googleSpecificType) : googleSpecificType) ?? fallbackTypes[0] ?? null;
  const referenceDisplayName = subject.category ?? null;

  if (hasAnyTypeData && !specificType) {
    // The subject has real Google type data, but every type on it is too
    // generic to match on (e.g. only "store"/"point_of_interest"/
    // "establishment" — no specific type like "book_store" or
    // "hair_salon"). Matching on a generic type would return a random
    // mix of unrelated nearby businesses that all happen to share that
    // same broad tag, so we bail out honestly instead of padding the
    // list with businesses that aren't genuinely comparable.
    return emptyResult(
      "category_too_generic",
      t(locale, "dashboard.competitors.categoryTooGenericError", {
        name: subject.name ?? t(locale, "dashboard.competitors.thisBusinessFallback"),
      }),
      categoryLabel
    );
  }

  const referenceType = specificType;

  debugLog("SUBJECT", {
    name: subject.name,
    primaryType: subject.primaryType,
    types: subject.categories ?? [],
    category: subject.category,
    resolvedReferenceType: referenceType,
    resolvedReferenceDisplayName: referenceDisplayName,
  });

  if (!referenceType && !referenceDisplayName) {
    return emptyResult("no_category", t(locale, "dashboard.competitors.noCategoryError"), categoryLabel);
  }

  const subjectLocation = { lat: subject.lat, lng: subject.lng };
  const subjectBreakdown = scoreBusiness(businessRowToScoringInput(subject), locale);

  type Comparable = { candidate: NearbyCandidate; distanceMeters: number };
  let comparable: Comparable[] = [];
  let searchWidened = false;
  let placesCalls = 0;

  // Ask Google for every type in the subject's comparable family (not
  // just its exact type), so a genuine "beauty_salon" competitor to a
  // "hair_salon" isn't filtered out server-side before isSameCategory()
  // ever sees it.
  const includedTypes =
    fallbackTypes.length > 0 ? fallbackTypes : broadFood ? BROAD_FOOD_SEARCH_TYPES : referenceType ? searchableTypes(comparableTypesFor(referenceType)) : undefined;
  // With the owner's fallback types, a candidate is comparable when its
  // PRIMARY Google type is one of them (same "primary identity" rule as
  // always, over the owner's whole type set).
  const matchesCategory = (c: NearbyCandidate) =>
    fallbackTypes.length > 0
      ? !!c.primaryType && fallbackTypes.includes(c.primaryType)
      : broadFood
        ? isFoodServiceType(c.primaryType)
        : isSameCategory(c, { type: referenceType, displayName: referenceDisplayName });
  debugLog("includedTypes requested from Nearby Search:", includedTypes ?? "(none — no specific reference type)");

  // Every comparable listing any search turned up; which ones become
  // competitors is decided at the end (selectCompetitors: established
  // standalone shops first — lib/competitorQuality.ts).
  const pool: PoolEntry[] = [];
  // Same-kind places Google shows as temporarily closed: listed under
  // "Also nearby" as "Temporarily closed", never ranked. Permanently
  // closed ones are dropped entirely.
  const closedForNow: Array<{ placeId: string; name: string | null; distanceMeters: number; reviewCount: number | null }> = [];
  const addToPool = (candidates: NearbyCandidate[], accept: (c: NearbyCandidate) => boolean, broader: boolean, kinOrder: string[] = []) => {
    for (const c of candidates) {
      if (!broader && c.businessStatus === "CLOSED_TEMPORARILY" && c.placeId !== subject.placeId && c.location !== null && accept(c)) {
        closedForNow.push({ placeId: c.placeId, name: c.details?.name ?? c.name, distanceMeters: haversineMeters(subjectLocation, c.location), reviewCount: c.details?.userRatingCount ?? null });
      }
      if (c.placeId === subject.placeId || isClosedStatus(c.businessStatus) || c.location === null || !accept(c)) continue;
      if (pool.some((p) => p.candidate.placeId === c.placeId)) continue;
      const kin = broader && c.primaryType ? kinOrder.indexOf(c.primaryType) : -1;
      pool.push({ candidate: c, distanceMeters: haversineMeters(subjectLocation, c.location), broader, kin: kin >= 0 ? kin : undefined });
    }
  };
  let searchedMeters = 0;

  // Start at the narrowest radius tier ("who is actually nearby") and
  // only widen while there aren't enough ESTABLISHED competitors (open,
  // 5+ reviews, a shop of its own). Nearest first — but once a search
  // comes back full, the same 20 nearest would just repeat in a wider
  // circle, so the next tier asks Google for the most popular instead.
  let lastFull = false;
  for (let tier = 0; tier < RADIUS_TIERS_METERS.length; tier++) {
    let candidates: NearbyCandidate[];
    const rankPreference = tier > 0 && lastFull ? "POPULARITY" : "DISTANCE";
    try {
      placesCalls++;
      candidates = await searchNearbyPlaces({
        lat: subjectLocation.lat,
        lng: subjectLocation.lng,
        radiusMeters: RADIUS_TIERS_METERS[tier],
        includedTypes,
        maxResultCount: NEARBY_PAGE_SIZE,
        rankPreference,
      });
    } catch (err) {
      // Never silent: logged on the server, and the scan says it failed.
      console.error(`[competitors] Nearby Search failed for ${subject.name ?? subject.placeId} (tier ${tier}):`, err instanceof Error ? err.message : err);
      return { ...emptyResult("error", err instanceof Error ? err.message : t(locale, "dashboard.competitors.nearbySearchFailedFallback"), categoryLabel), placesCalls };
    }
    searchedMeters = RADIUS_TIERS_METERS[tier];
    lastFull = candidates.length >= NEARBY_PAGE_SIZE;

    if (DEBUG_COMPETITORS) {
      debugLog(
        `tier ${tier} (radius ${formatMiles(RADIUS_TIERS_METERS[tier])} mi, ${rankPreference}): ${candidates.length} raw candidate(s) from Nearby Search`
      );
      for (const c of candidates) {
        const verdict = categorizeMatch(c, { type: referenceType, displayName: referenceDisplayName });
        const distanceMeters = c.location ? haversineMeters(subjectLocation, c.location) : null;
        debugLog("  candidate", {
          name: c.name,
          primaryType: c.primaryType,
          types: c.types ?? [],
          distanceMi: distanceMeters !== null ? metersToMiles(distanceMeters).toFixed(2) : "— (no location)",
          businessStatus: c.businessStatus,
          reviews: c.details?.userRatingCount ?? null,
          isSameCategory: verdict.matches,
          reason: verdict.reason,
        });
      }
    }

    addToPool(candidates, matchesCategory, false);
    const established = establishedCount(pool);
    debugLog(`tier ${tier}: ${pool.length} comparable so far, ${established} established`);

    if (established >= MAX_COMPETITORS || (established >= MIN_ESTABLISHED_COMPETITORS && pool.length >= MAX_COMPETITORS)) break;
    if (tier < RADIUS_TIERS_METERS.length - 1) searchWidened = true;
  }

  // Small towns: still fewer than MIN_ESTABLISHED_COMPETITORS established
  // after the normal radius → ONE last search, out to the small-town
  // radius, most popular first, for the same kind AND its broader family
  // (a bakery: cake, dessert, donut shops, cafés; food: any cuisine) —
  // within the per-scan call limit, so the month's
  // PLACES_SEARCH_MONTHLY_CAP check before the scan still covers it.
  const foodSubject = broadFood || isFoodServiceType(referenceType) || fallbackTypes.some((x) => isFoodServiceType(x));
  const broaderTypes = foodSubject ? BROAD_FOOD_SEARCH_TYPES : broaderTypesFor(referenceType, false);
  const acceptBroader = (c: NearbyCandidate) => (foodSubject ? isFoodServiceType(c.primaryType) : !!c.primaryType && broaderTypes.includes(c.primaryType));
  // The owner's own ticked "also competes with" areas keep their call:
  // the small-town search only runs when a call is left beyond that.
  const wideTypes = usableFallbackTypes(subject.niche?.wideTypes).filter((t) => !fallbackTypes.includes(t)).slice(0, 50);
  const reservedForAreas = wideTypes.length > 0 ? 1 : 0;
  if (establishedCount(pool) < MIN_ESTABLISHED_COMPETITORS && placesCalls < MAX_CALLS_PER_SCAN - reservedForAreas) {
    const farTypes = searchableTypes(Array.from(new Set([...(includedTypes ?? []), ...broaderTypes]))).slice(0, 50);
    try {
      placesCalls++;
      const far = await searchNearbyPlaces({
        lat: subjectLocation.lat,
        lng: subjectLocation.lng,
        radiusMeters: SMALL_TOWN_RADIUS_METERS,
        // Primary type only: the most popular places that ARE one of
        // these, not ones that merely carry the tag.
        includedPrimaryTypes: farTypes.length > 0 ? farTypes : undefined,
        maxResultCount: NEARBY_PAGE_SIZE,
        rankPreference: "POPULARITY",
      });
      searchedMeters = SMALL_TOWN_RADIUS_METERS;
      const before = pool.length;
      addToPool(far, matchesCategory, false);
      addToPool(far, acceptBroader, true, broaderTypes);
      searchWidened = true;
      debugLog(`small-town search (${farTypes.join(", ")}): ${far.length} raw, ${pool.length - before} added, ${establishedCount(pool)} established`);
    } catch (err) {
      console.error(`[competitors] small-town Nearby Search failed for ${subject.name ?? subject.placeId}:`, err instanceof Error ? err.message : err);
    }
  }

  // The ticked "also competes with" areas: ONE extra search at 3 mi for
  // their Google types, nearest first, never repeating a direct result.
  if (wideTypes.length > 0 && placesCalls < MAX_CALLS_PER_SCAN) {
    try {
      placesCalls++;
      const wide = await searchNearbyPlaces({
        lat: subjectLocation.lat,
        lng: subjectLocation.lng,
        radiusMeters: RADIUS_TIERS_METERS[1],
        includedTypes: wideTypes,
        maxResultCount: 20,
        rankPreference: "DISTANCE",
      });
      // The owner's areas join the same choice: after established shops of
      // the same kind, never beyond MAX_COMPETITORS in all.
      for (const c of wide) {
        if (c.placeId === subject.placeId || isClosedStatus(c.businessStatus) || c.location === null) continue;
        if (!c.primaryType || !wideTypes.includes(c.primaryType) || pool.some((p) => p.candidate.placeId === c.placeId)) continue;
        pool.push({ candidate: c, distanceMeters: haversineMeters(subjectLocation, c.location), area: true });
      }
    } catch (err) {
      // The wider areas are extra: a failed search keeps the direct
      // results — but it's logged, never swallowed.
      console.error(`[competitors] "also competes with" Nearby Search failed for ${subject.name ?? subject.placeId}:`, err instanceof Error ? err.message : err);
    }
  }

  // Which of everything found become the competitors: the 10 most
  // relevant, established first (lib/competitorQuality.ts).
  comparable = selectCompetitors(pool, MAX_COMPETITORS);
  const sameKindSkipped = alsoNearby(
    pool
      .filter((p) => !p.broader && !p.area)
      .map((p) => ({
        placeId: p.candidate.placeId,
        name: p.candidate.details?.name ?? p.candidate.name,
        type: p.candidate.primaryType,
        types: p.candidate.types,
        distanceMeters: p.distanceMeters,
        reviewCount: p.candidate.details?.userRatingCount ?? null,
        website: p.candidate.details?.website ?? null,
      })),
    {
      ownTypes: Array.from(new Set([...(includedTypes ?? []), ...(referenceType ? [referenceType] : [])])),
      rankedPlaceIds: comparable.map((c) => c.candidate.placeId),
      nearestRankedMeters: comparable.length > 0 ? Math.min(...comparable.map((c) => c.distanceMeters)) : null,
    }
  );

  const scoredCompetitors: RankedCompetitor[] = [];
  const unscored: UnscoredCompetitor[] = [];

  // Every comparable candidate is scored from its own Nearby Search
  // listing — no network call inside this loop.
  for (const { candidate, distanceMeters } of comparable) {
    // Part B: the listing came back with the Nearby Search itself — no
    // per-competitor Place Details call (and no extra cost).
    const place = candidate.details;

    // Never score a closed business
    // (temporarily or permanently — neither is a current competitor).
    // This candidate was already counted in `comparable` (and so in the
    // "we found N comparable businesses" message below), so it goes to
    // `unscored` rather than a silent continue — dropping it with no
    // record would let the reported count and radius overstate what's
    // actually shown, with no footnote explaining the gap.
    if (isClosedStatus(place.businessStatus)) {
      const closedLabel =
        place.businessStatus === "CLOSED_TEMPORARILY"
          ? t(locale, "dashboard.competitors.temporarilyClosed")
          : t(locale, "dashboard.competitors.permanentlyClosed");
      unscored.push({
        placeId: candidate.placeId,
        name: place.name ?? candidate.name ?? t(locale, "dashboard.competitors.unnamedListing"),
        address: place.formattedAddress ?? candidate.formattedAddress,
        distanceMeters,
        reason: t(locale, "dashboard.competitors.closedListingReason", { status: closedLabel }),
      });
      continue;
    }

    const row = placeDetailsToScoringRow(place);
    const breakdown = scoreBusiness(businessRowToScoringInput(row), locale);

    scoredCompetitors.push({
      placeId: candidate.placeId,
      name: place.name ?? candidate.name ?? "(unnamed listing)",
      isSubject: false,
      address: place.formattedAddress,
      distanceMeters,
      rating: place.rating,
      reviewCount: place.userRatingCount,
      // v1.11.0: a Facebook/Instagram/Yelp page is not a website.
      hasWebsite: isRealWebsite(place.website),
      websiteUrl: place.website ?? null,
      listing: {
        phone: place.phone,
        openingHours: place.openingHours,
        openingHoursPeriods: place.openingHoursPeriods,
        categories: place.categories,
        businessStatus: place.businessStatus,
      },
      googleMapsUri: place.googleMapsUri,
      breakdown,
      priceLevel: place.priceLevel,
      photoCount: place.photoCount,
    });
  }

  const subjectEntry: RankedCompetitor = {
    placeId: subject.placeId,
    name: subject.name ?? t(locale, "dashboard.competitors.thisBusinessNameFallback"),
    isSubject: true,
    address: subject.address,
    distanceMeters: null,
    rating: subject.rating,
    reviewCount: subject.review_count,
    hasWebsite: isRealWebsite(subject.website) || isRealWebsite(subject.verified_website_url),
    websiteUrl: isRealWebsite(subject.website) ? subject.website : isRealWebsite(subject.verified_website_url) ? subject.verified_website_url : null,
    googleMapsUri: null,
    breakdown: subjectBreakdown,
    priceLevel: subject.priceLevel ?? null,
    photoCount: subject.photo_count,
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
  const label = categoryLabel ?? t(locale, "dashboard.competitors.sameCategoryFallback");

  let message: string;
  if (comparableCount === 0) {
    const searchedLabel = formatMiles(searchedMeters || RADIUS_TIERS_METERS[RADIUS_TIERS_METERS.length - 1]);
    message = t(locale, "dashboard.competitors.foundNoneMessage", { label, searchedLabel });
  } else if (comparableCount < MAX_COMPETITORS) {
    message = tPlural(locale, "dashboard.competitors.foundFewMessage", comparableCount, { label, radiusLabel });
  } else {
    message = t(locale, "dashboard.competitors.showingNearestMessage", { count: comparableCount, label, radiusLabel });
  }
  if (searchWidened && comparableCount > 0) {
    message += t(locale, "dashboard.competitors.searchWidenedSuffix");
  }
  if (unscored.length > 0) {
    message += tPlural(locale, "dashboard.competitors.unscoredSuffix", unscored.length);
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
    placesCalls,
    alsoNearby: [...sameKindSkipped, ...temporarilyClosedNearby(closedForNow)],
  };
}
