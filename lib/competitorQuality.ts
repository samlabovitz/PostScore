// Which nearby listings make a meaningful competitor — not just the right
// type (lib/competitors.ts isSameCategory) but an established business:
// open, with real reviews, a shop of its own rather than a counter inside
// a supermarket. Pure.
//
// The real Kee's Cookies & Cupcakes case (Clayton, DE): its 4 "competitors"
// were all bakeries, but every one had 0 reviews — home bakers and a Food
// Lion bakery counter — so "#1 of 5" meant nothing.

import type { NearbyCandidate } from "@/lib/google/places";

/** At least this many Google reviews makes a listing "established". */
export const ESTABLISHED_MIN_REVIEWS = 5;
/** Fewer established competitors than this → widen (up to the small-town radius). */
export const MIN_ESTABLISHED_COMPETITORS = 3;
/** Fewer competitors than this is a small sample (and the only case
 * listings with few or no reviews, then department counters, fill in). */
export const SMALL_SAMPLE_BELOW = 5;

export function reviewCountOf(c: NearbyCandidate): number {
  return c.details?.userRatingCount ?? 0;
}

/** Open, with ESTABLISHED_MIN_REVIEWS+ reviews. */
export function isEstablishedListing(c: NearbyCandidate): boolean {
  return (c.businessStatus ?? c.details?.businessStatus) === "OPERATIONAL" && reviewCountOf(c) >= ESTABLISHED_MIN_REVIEWS;
}

/** "Few or no reviews yet" — shown on such a competitor. */
export function hasFewReviews(reviewCount: number | null | undefined): boolean {
  return (reviewCount ?? 0) < ESTABLISHED_MIN_REVIEWS;
}

/** Big retailers whose departments have their own Google listings ("Food
 * Lion Bakery", "Walmart Deli", "ShopRite Pharmacy"). */
const STORE_BRANDS = [
  "food lion", "walmart", "target", "safeway", "giant", "giant eagle", "shoprite", "shop rite", "acme", "weis", "kroger", "publix",
  "wegmans", "costco", "sam's club", "sams club", "bj's", "bjs", "stop & shop", "stop and shop", "harris teeter", "albertsons",
  "whole foods", "whole foods market", "aldi", "lidl", "meijer", "h-e-b", "heb", "hy-vee", "winn-dixie", "ingles", "food city",
  "redner's", "redners", "save a lot", "save-a-lot", "price chopper", "market basket", "hannaford", "piggly wiggly", "sprouts",
  "trader joe's", "fresh market", "the fresh market", "kmart", "cvs", "walgreens", "rite aid", "dollar general",
];
const DEPARTMENT_WORDS = ["bakery", "bakery department", "deli", "deli & bakery", "bakery & deli", "pharmacy", "floral", "florist", "meat", "meat department", "seafood", "cafe", "café", "photo center", "optical", "vision center", "auto center", "tire & lube", "liquor", "wine & spirits", "beer & wine", "starbucks"];
/** Store types that, carried alongside another type, mean "inside a store". */
const HOST_STORE_TYPES = ["supermarket", "grocery_store", "department_store", "warehouse_store", "discount_store", "hypermarket", "discount_supermarket"];
const CHAIN_DOMAINS = ["foodlion.com", "walmart.com", "target.com", "safeway.com", "giantfood.com", "shoprite.com", "acmemarkets.com", "weismarkets.com", "kroger.com", "publix.com", "wegmans.com", "costco.com", "samsclub.com", "bjs.com", "stopandshop.com", "harristeeter.com", "albertsons.com", "wholefoodsmarket.com", "aldi.us", "lidl.com", "meijer.com", "heb.com", "hy-vee.com"];

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

/**
 * A department of a bigger store with its own listing — a supermarket's
 * bakery counter, a pharmacy inside a Walmart. Ranked below standalone
 * shops and used only when there aren't enough of those. Signals (any):
 * the name is a big-store brand + a department word; the listing also
 * carries a host-store type (supermarket, department store…); or its
 * website is a big chain's own site.
 */
export function isDepartmentListing(c: Pick<NearbyCandidate, "name" | "primaryType" | "types"> & { details?: { name?: string | null; website?: string | null } | null }): boolean {
  const name = norm(c.details?.name ?? c.name ?? "");
  for (const brand of STORE_BRANDS) {
    if (!name.startsWith(`${brand} `)) continue;
    const rest = name.slice(brand.length + 1).replace(/^(store|market|supermarket|supercenter)\s+/, "");
    if (DEPARTMENT_WORDS.some((w) => rest === w || rest.startsWith(`${w} `))) return true;
  }
  const hostType = (c.types ?? []).find((t) => HOST_STORE_TYPES.includes(t));
  if (hostType && c.primaryType && !HOST_STORE_TYPES.includes(c.primaryType)) return true;
  const website = c.details?.website;
  if (website) {
    try {
      const host = new URL(website).hostname.replace(/^www\./, "");
      if (CHAIN_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return true;
    } catch {
      // Not a URL: no signal.
    }
  }
  return false;
}

export interface PoolEntry {
  candidate: NearbyCandidate;
  distanceMeters: number;
  /** Found by the broader family (e.g. a café for a bakery), not the
   * business's own kind — ranked after the same kind. */
  broader?: boolean;
  /** Within the broader family, how close a kind it is (0 = closest) —
   * a cupcake shop before a coffee chain. */
  kin?: number;
  /** One of the owner's own ticked "also competes with" areas. */
  area?: boolean;
}

/**
 * The competitors to show — never more than `max` (10):
 * 1. established standalone shops of the same kind, nearest first;
 * 2. then established shops in the owner's own "also competes with"
 *    areas, nearest first — still up to `max`;
 * 3. only while that's fewer than SMALL_SAMPLE_BELOW, in this order:
 *    established shops of the broader family (closest kin, then
 *    nearest), then listings with few or no reviews (same kind first),
 *    then department counters.
 * So a full list is always the business's own kind; other kinds and thin
 * listings only round out a small sample. Returned nearest first.
 */
export function selectCompetitors(pool: PoolEntry[], max: number): PoolEntry[] {
  const seen = new Set<string>();
  // Never farther than MAX_COMPETITOR_DISTANCE_MILES — a shorter list (a
  // small sample) rather than a far-away one.
  const unique = pool
    .filter((p) => withinMaxDistance(p.distanceMeters))
    .filter((p) => (seen.has(p.candidate.placeId) ? false : (seen.add(p.candidate.placeId), true)));
  const nearest = (a: PoolEntry, b: PoolEntry) => a.distanceMeters - b.distanceMeters;
  const closestKin = (a: PoolEntry, b: PoolEntry) => (a.kin ?? 99) - (b.kin ?? 99) || nearest(a, b);
  const department = (p: PoolEntry) => isDepartmentListing(p.candidate);
  const standalone = unique.filter((p) => !department(p));
  const established = (p: PoolEntry) => isEstablishedListing(p.candidate);

  const sameKind = (p: PoolEntry) => !p.broader && !p.area;
  const picked = [
    ...standalone.filter((p) => sameKind(p) && established(p)).sort(nearest),
    ...standalone.filter((p) => p.area && established(p)).sort(nearest),
  ].slice(0, max);
  const fillers = [
    ...standalone.filter((p) => p.broader && established(p)).sort(closestKin),
    ...standalone.filter((p) => sameKind(p) && !established(p)).sort(nearest),
    ...standalone.filter((p) => !sameKind(p) && !established(p)).sort(closestKin),
    ...unique.filter(department).sort((a, b) => Number(established(b)) - Number(established(a)) || nearest(a, b)),
  ];
  for (const p of fillers) {
    if (picked.length >= Math.min(SMALL_SAMPLE_BELOW, max)) break;
    picked.push(p);
  }
  return picked.sort(nearest);
}

/** How many established standalone competitors a pool holds. */
export function establishedCount(pool: PoolEntry[]): number {
  return new Set(pool.filter((p) => !isDepartmentListing(p.candidate) && isEstablishedListing(p.candidate)).map((p) => p.candidate.placeId)).size;
}

/** When the established-competitor rules above shipped (Day 19). A scan
 * from before and one from after weren't picked the same way, so a rank
 * change between them isn't movement: no "moved up/down" across it, and a
 * one-time note instead. */
export const COMPETITOR_SELECTION_UPDATED_AT = "2026-10-27T18:49:00Z";
/** The note's dismissal key (promo_dismissals; never expires). */
export const SELECTION_NOTE_KEY = "competitor-selection-2026-10";

/** The two scans were picked by different rules. */
export function selectionChangedBetween(previousScanAt: string | null | undefined, currentScanAt: string | null | undefined): boolean {
  if (!previousScanAt || !currentScanAt) return false;
  const cut = Date.parse(COMPETITOR_SELECTION_UPDATED_AT);
  return Date.parse(previousScanAt) < cut && Date.parse(currentScanAt) >= cut;
}

/** Show "We updated how we pick your competitors": the list shown now was
 * picked by the new rules, an earlier one by the old, and they differ. */
export function selectionNoteApplies(args: {
  currentScanAt: string | null;
  previousScanAt: string | null;
  currentPlaceIds: string[];
  previousPlaceIds: string[];
}): boolean {
  if (!selectionChangedBetween(args.previousScanAt, args.currentScanAt)) return false;
  const a = new Set(args.currentPlaceIds);
  const b = new Set(args.previousPlaceIds);
  return a.size !== b.size || Array.from(a).some((id) => !b.has(id));
}

const METERS_PER_MILE = 1609.34;
/** No competitor is ever farther than this, for any business type. */
export const MAX_COMPETITOR_DISTANCE_MILES = 15;
export const MAX_COMPETITOR_DISTANCE_METERS = MAX_COMPETITOR_DISTANCE_MILES * METERS_PER_MILE;
/** Ranked competitors mostly farther than this → the distance note. */
export const FAR_COMPETITOR_MILES = 5;

export function withinMaxDistance(distanceMeters: number | null | undefined): boolean {
  return distanceMeters === null || distanceMeters === undefined || distanceMeters <= MAX_COMPETITOR_DISTANCE_METERS;
}

/**
 * "The nearest established {bakeries} are {min}–{max} miles away…" — when
 * more than half the ranked competitors are over FAR_COMPETITOR_MILES
 * away. Real straight-line distances only (no drive times), in whole
 * miles, from the established ones (all of them if none is).
 */
export function distanceNote(competitors: Array<{ distanceMeters: number | null; reviewCount: number | null }>): { min: number; max: number } | null {
  const located = competitors.filter((c): c is { distanceMeters: number; reviewCount: number | null } => typeof c.distanceMeters === "number");
  if (located.length === 0) return null;
  const far = located.filter((c) => c.distanceMeters > FAR_COMPETITOR_MILES * METERS_PER_MILE).length;
  if (far * 2 <= located.length) return null;
  const established = located.filter((c) => (c.reviewCount ?? 0) >= ESTABLISHED_MIN_REVIEWS);
  const miles = (established.length > 0 ? established : located).map((c) => Math.round(c.distanceMeters / METERS_PER_MILE));
  return { min: Math.min(...miles), max: Math.max(...miles) };
}

/** A same-type listing skipped for having few or no reviews — shown under
 * "Also nearby", never ranked or scored. */
export interface AlsoNearbyListing {
  placeId: string;
  name: string;
  distanceMeters: number;
  reviewCount: number;
}

export const ALSO_NEARBY_MAX = 3;

/**
 * Up to ALSO_NEARBY_MAX listings of the business's own type that weren't
 * picked for having few or no reviews and are closer than the nearest
 * ranked competitor — nearest first. Department counters aren't listed
 * (they're a store's department, not a shop).
 */
export function alsoNearby(
  candidates: Array<{ placeId: string; name: string | null; type: string | null; distanceMeters: number | null; reviewCount: number | null; website?: string | null; types?: string[] | null }>,
  opts: { ownTypes: string[]; rankedPlaceIds: string[]; nearestRankedMeters: number | null }
): AlsoNearbyListing[] {
  const own = new Set(opts.ownTypes);
  const ranked = new Set(opts.rankedPlaceIds);
  const seen = new Set<string>();
  return candidates
    .filter((c) => {
      if (ranked.has(c.placeId) || seen.has(c.placeId) || !c.type || !own.has(c.type)) return false;
      if (!hasFewReviews(c.reviewCount) || typeof c.distanceMeters !== "number" || !withinMaxDistance(c.distanceMeters)) return false;
      if (opts.nearestRankedMeters !== null && c.distanceMeters >= opts.nearestRankedMeters) return false;
      if (isDepartmentListing({ name: c.name, primaryType: c.type, types: c.types ?? [c.type], details: { name: c.name, website: c.website ?? null } })) return false;
      seen.add(c.placeId);
      return true;
    })
    .sort((a, b) => (a.distanceMeters as number) - (b.distanceMeters as number))
    .slice(0, ALSO_NEARBY_MAX)
    .map((c) => ({ placeId: c.placeId, name: c.name ?? "", distanceMeters: c.distanceMeters as number, reviewCount: c.reviewCount ?? 0 }));
}
