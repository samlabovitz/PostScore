// Server-only. Day 2b: finding a business that the plain "name + town"
// search misses — a service-area business based in the next town, a
// listing named after the owner, or one we can identify from the owner's
// own website. Fallbacks run ONLY when the normal search finds nothing,
// and at most MAX_FALLBACK_SEARCHES extra paid searches run per lookup.
// Fallback search results are always shown as a list to pick from —
// never auto-picked — because they're less certain than a direct match.
// (A place id linked from the owner's own website is exact, so that one
// is shown directly; the owner still confirms it.)

import { parsePublicWebsiteUrl } from "@/lib/publicUrl";
import {
  geocodeTown,
  lookupBusinessByPlaceId,
  searchPlaces,
  toCandidate,
  type PlaceCandidate,
  type PlaceLookupResult,
} from "@/lib/google/places";

/** Extra Text Searches (~$0.032 each) allowed after the first one. */
export const MAX_FALLBACK_SEARCHES = 2;
/** How far around the owner's town a name-only search leans (a bias, not a cut-off). */
export const TOWN_BIAS_RADIUS_METERS = 25_000;

export type SearchRoute = "name_town" | "website_place_id" | "website_phone" | "owner_name" | "town_bias";

export interface BusinessSearchInput {
  name: string;
  location: string;
  ownerName?: string | null;
  websiteUrl?: string | null;
}

export type BusinessSearchResult = PlaceLookupResult & {
  /** Which search found it (null when nothing was found). */
  route: SearchRoute | null;
  /** True when nothing was found but the owner gave a website — the UI
   * offers the honest "Website score — no Google listing" mode. */
  websiteOnlyAvailable: boolean;
  /** Paid Google calls this lookup made, for the cost log. */
  paidCalls: { textSearch: number; details: number; geocode: number };
};

/** Google place ids and phone numbers a business's own homepage links
 * to — a "View on Google Maps" link often carries the exact place id.
 * Pure; exported for tests. */
export function extractListingHints(html: string): { placeIds: string[]; phones: string[] } {
  const placeIds = new Set<string>();
  const idRe = /(?:query_place_id|place_id|placeid)(?:=|%3D|:|%3A)\s*(ChIJ[\w-]{16,})/gi;
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(html)) !== null) placeIds.add(m[1]);
  const phones = new Set<string>();
  const telRe = /href\s*=\s*["']tel:([^"']+)["']/gi;
  while ((m = telRe.exec(html)) !== null) {
    const digits = decodeURIComponent(m[1]).replace(/[^\d+]/g, "");
    if (digits.replace(/\D/g, "").length >= 10) phones.add(digits);
  }
  return { placeIds: Array.from(placeIds).slice(0, 3), phones: Array.from(phones).slice(0, 2) };
}

async function fetchHomepageHtml(url: URL, fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(url.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PostScore/1.0; +https://postscore.app)" },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type && !type.includes("html")) return null;
    const text = await res.text();
    return text.slice(0, 2_000_000);
  } catch {
    return null;
  }
}

function asCandidates(result: PlaceCandidate[], route: SearchRoute, paidCalls: BusinessSearchResult["paidCalls"]): BusinessSearchResult {
  return { status: "multiple", candidates: result, route, websiteOnlyAvailable: false, paidCalls };
}

/**
 * The full lookup: the normal "name + town" search first (unchanged
 * cost: one search, then Details once a listing is picked). Only if it
 * finds nothing, in order — stopping at the first that finds something:
 *   1. the owner's website: a Google place id on it → that listing
 *      directly (no search); else a phone number on it → search by phone;
 *   2. the owner's name + town;
 *   3. the business name alone, leaning toward the town (geocoded).
 */
export async function findBusiness(
  input: BusinessSearchInput,
  fetchImpl: typeof fetch = fetch,
  log: (line: string) => void = (line) => console.log(`[business-search] ${line}`)
): Promise<BusinessSearchResult> {
  const paidCalls = { textSearch: 0, details: 0, geocode: 0 };
  const name = input.name.trim();
  const location = input.location.trim();
  const website = parsePublicWebsiteUrl(input.websiteUrl);
  const fail = (message: string): BusinessSearchResult => ({ status: "error", message, route: null, websiteOnlyAvailable: false, paidCalls });

  try {
    paidCalls.textSearch++;
    log(`paid call: text search (name + town)`);
    const first = await searchPlaces(`${name} ${location}`.trim(), fetchImpl);
    if (first.length === 1) {
      paidCalls.details++;
      log(`paid call: place details`);
      const found = await lookupBusinessByPlaceId(first[0].id, fetchImpl);
      return { ...found, route: found.status === "found" ? "name_town" : null, websiteOnlyAvailable: false, paidCalls };
    }
    if (first.length > 1) return asCandidates(first.map(toCandidate), "name_town", paidCalls);

    let fallbacksLeft = MAX_FALLBACK_SEARCHES;

    if (website) {
      const html = await fetchHomepageHtml(website, fetchImpl);
      const hints = html ? extractListingHints(html) : { placeIds: [], phones: [] };
      for (const placeId of hints.placeIds) {
        paidCalls.details++;
        log(`paid call: place details (place id found on the owner's website)`);
        const found = await lookupBusinessByPlaceId(placeId, fetchImpl);
        // Shown as the found listing (Details are already paid for); the
        // owner still confirms it with "Add this business".
        if (found.status === "found") return { ...found, route: "website_place_id", websiteOnlyAvailable: false, paidCalls };
      }
      if (hints.phones.length > 0 && fallbacksLeft > 0) {
        fallbacksLeft--;
        paidCalls.textSearch++;
        log(`paid call: text search (phone number from the owner's website)`);
        const byPhone = await searchPlaces(hints.phones[0], fetchImpl);
        if (byPhone.length > 0) return asCandidates(byPhone.map(toCandidate), "website_phone", paidCalls);
      }
    }

    const ownerName = (input.ownerName ?? "").trim();
    if (ownerName && fallbacksLeft > 0) {
      fallbacksLeft--;
      paidCalls.textSearch++;
      log(`paid call: text search (owner name + town)`);
      const byOwner = await searchPlaces(`${ownerName} ${location}`.trim(), fetchImpl);
      if (byOwner.length > 0) return asCandidates(byOwner.map(toCandidate), "owner_name", paidCalls);
    }

    if (fallbacksLeft > 0 && location) {
      paidCalls.geocode++;
      log(`paid call: geocode town`);
      const town = await geocodeTown(location, fetchImpl);
      if (town) {
        fallbacksLeft--;
        paidCalls.textSearch++;
        log(`paid call: text search (name, leaning toward the town)`);
        const nearby = await searchPlaces(name, fetchImpl, { locationBias: { ...town, radiusMeters: TOWN_BIAS_RADIUS_METERS } });
        if (nearby.length > 0) return asCandidates(nearby.map(toCandidate), "town_bias", paidCalls);
      }
    }

    return { status: "no_results", route: null, websiteOnlyAvailable: website !== null, paidCalls };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unknown error");
  }
}
