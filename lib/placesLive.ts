// Google Places values fetched fresh when shown and never saved (Day 23
// 2b–2d): the in-memory cache that keeps one visit to one call, the live
// read caps, and merging live values into our own saved results. Pure.
//
//   live_list  Text Search (or Nearby Search) Enterprise — a page's list of
//              competitors (one call, up to 20 places):
//              PLACES_LIVE_LIST_MONTHLY_CAP
//   live_read  Place Details Enterprise — one listing:
//              PLACES_LIVE_READ_MONTHLY_CAP
// Both default to 1,000, Google's free monthly amount for each SKU. Over a
// cap the page shows our own results and "Couldn't load from Google right
// now" — it never fails.

import type { SavedCompetitorEntry, SavedCompetitorScan } from "@/lib/savedCompetitorScans";

/** How long a live value may be reused: one visit. Memory only — never the database. */
export const LIVE_CACHE_MS = 10 * 60 * 1000;
export const LIVE_CACHE_MAX_ENTRIES = 500;
export const DEFAULT_PLACES_LIVE_LIST_MONTHLY_CAP = 1000;
export const DEFAULT_PLACES_LIVE_READ_MONTHLY_CAP = 1000;
/** Saved competitors the list call didn't return, read one by one — at most this many per page load. */
export const MAX_LIVE_DETAILS_PER_LOAD = 5;
/** More places the page names ("Also nearby", "Removed by you") get their
 * own few reads, so a name is never left as "—" because the ranked list
 * used the allowance. Same cache, same monthly cap. */
export const MAX_LIVE_EXTRA_DETAILS_PER_LOAD = 5;

export type LiveKind = "live_list" | "live_read";

export function placesLiveMonthlyCap(kind: LiveKind, env: Record<string, string | undefined> = process.env): number {
  const raw = Number.parseInt((kind === "live_list" ? env.PLACES_LIVE_LIST_MONTHLY_CAP : env.PLACES_LIVE_READ_MONTHLY_CAP) ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return kind === "live_list" ? DEFAULT_PLACES_LIVE_LIST_MONTHLY_CAP : DEFAULT_PLACES_LIVE_READ_MONTHLY_CAP;
}

/** A page view is one owner's action: an unreadable count still lets it run (the cap holds otherwise). */
export function canMakeLiveCall(usedThisMonth: number | "missing" | "unreadable", cap: number, calls = 1): boolean {
  if (usedThisMonth === "missing" || usedThisMonth === "unreadable") return true;
  return usedThisMonth + calls <= cap;
}

/** One place as Google lists it right now — shown, never saved. */
export interface LivePlace {
  placeId: string;
  name: string | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: string | null;
  /** Up to Google's 10 photo references. */
  photoCount: number | null;
  /** Google lists a website for it. */
  hasWebsite: boolean;
  types: string[] | null;
}

interface CacheEntry {
  at: number;
  value: unknown;
}

/** A small time-limited map: expired entries are swept on every read and
 * write, and the oldest go first past the size cap. */
export class LiveCache {
  private readonly map = new Map<string, CacheEntry>();
  constructor(
    private readonly ttlMs: number = LIVE_CACHE_MS,
    private readonly maxEntries: number = LIVE_CACHE_MAX_ENTRIES
  ) {}

  private sweep(now: number): void {
    for (const [key, entry] of Array.from(this.map)) if (now - entry.at >= this.ttlMs) this.map.delete(key);
  }

  get<T>(key: string, now: number = Date.now()): T | undefined {
    this.sweep(now);
    return this.map.get(key)?.value as T | undefined;
  }

  set(key: string, value: unknown, now: number = Date.now()): void {
    this.sweep(now);
    this.map.delete(key);
    this.map.set(key, { at: now, value });
    while (this.map.size > this.maxEntries) this.map.delete(this.map.keys().next().value as string);
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** Until the live value arrives (or when Google can't be reached): our
 * own website.has_website check result, never Google's saved field. */
function hasWebsiteFromCheck(entry: SavedCompetitorEntry): boolean | null {
  const check = entry.breakdown?.checks.find((c) => c.id === "website.has_website");
  if (!check || check.earnedPoints === null || check.earnedPoints === undefined) return null;
  if (check.confidence !== "VERIFIED" && check.confidence !== "LIKELY") return null;
  return check.earnedPoints > 0;
}

/** An entry with only our own results: Google's values are left out
 * (name, address, rating, reviews, price, photos, website, types) and
 * filled in live when the page is shown. The owner's own row keeps the
 * name the page already shows. */
export function withoutPlacesValues(entry: SavedCompetitorEntry, ownName: string | null = null): SavedCompetitorEntry {
  return {
    ...entry,
    name: entry.isSubject ? ownName : null,
    address: null,
    rating: null,
    reviewCount: null,
    priceLevel: null,
    photoCount: null,
    websiteUrl: null,
    types: null,
    hasWebsite: hasWebsiteFromCheck(entry),
    liveMissing: true,
  };
}

export function scanWithoutPlacesValues(scan: SavedCompetitorScan, ownName: string | null = null): SavedCompetitorScan {
  return { ...scan, entries: scan.entries.map((e) => withoutPlacesValues(e, ownName)) };
}

/** Live values in place: a place Google didn't return keeps nulls (the page shows "—"). */
export function withLivePlaces(scan: SavedCompetitorScan, live: Record<string, LivePlace>): SavedCompetitorScan {
  return {
    ...scan,
    entries: scan.entries.map((e) => {
      const p = live[e.placeId];
      if (!p) return e;
      return {
        ...e,
        name: e.isSubject ? (e.name ?? p.name) : p.name,
        rating: p.rating,
        reviewCount: p.reviewCount,
        priceLevel: p.priceLevel,
        photoCount: p.photoCount,
        hasWebsite: p.hasWebsite,
        types: p.types,
        liveMissing: false,
      };
    }),
  };
}

/** The circle the list call searches: just past the farthest saved
 * competitor (Google allows 1–50,000 m). */
export function liveSearchRadius(entries: SavedCompetitorEntry[]): number {
  const farthest = Math.max(0, ...entries.map((e) => e.distanceMeters ?? 0));
  return Math.round(Math.min(50_000, Math.max(500, farthest * 1.1 + 100)));
}

/** Which place IDs still need a live value, in page order (the owner's
 * row first, then highest score). */
export function placesToFetch(scan: SavedCompetitorScan): string[] {
  const subject = scan.entries.filter((e) => e.isSubject).map((e) => e.placeId);
  const others = scan.entries.filter((e) => !e.isSubject).map((e) => e.placeId);
  return Array.from(new Set([...subject, ...others]));
}

/** A head-to-head whose rival names Google couldn't give right now: "—",
 * never "(unnamed listing)". */
export function withMissingNames<T extends { rivals: Array<{ placeId: string; name: string | null }> }>(h2h: T, scan: SavedCompetitorScan): T {
  const missing = new Set(scan.entries.filter((e) => e.liveMissing).map((e) => e.placeId));
  return { ...h2h, rivals: h2h.rivals.map((r) => ({ ...r, name: r.name ?? (missing.has(r.placeId) ? MISSING_NAME : null) })) };
}

export const MISSING_NAME = "—";

/** An "Also nearby" listing with Google's name and review count read
 * live (the saved list keeps only place ID and distance); missing → "—". */
export function withLiveListing<T extends { placeId: string; name: string | null; reviewCount: number | null }>(listing: T, live: LivePlace | undefined): T & { liveMissing: boolean } {
  return live ? { ...listing, name: live.name, reviewCount: live.reviewCount, liveMissing: false } : { ...listing, name: null, reviewCount: null, liveMissing: true };
}
