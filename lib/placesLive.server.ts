// Server-only. Google Places values fetched fresh when a page is shown and
// never saved (lib/placesLive.ts): one in-memory cache per server instance
// (10 minutes, so one visit makes one call), the live caps, and each call
// logged in places_calls (counts only).
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { monthStartUtc } from "@/lib/placesSearchBudget";
import { placesCallsTableMissing } from "@/lib/placesSearchBudget.server";
import { getPlaceLive, searchNearbyLive, searchTextLive } from "@/lib/google/places";
import {
  LiveCache,
  MAX_LIVE_DETAILS_PER_LOAD,
  MAX_LIVE_EXTRA_DETAILS_PER_LOAD,
  canMakeLiveCall,
  liveSearchRadius,
  placesLiveMonthlyCap,
  placesToFetch,
  scanWithoutPlacesValues,
  withLivePlaces,
  type LiveKind,
  type LivePlace,
} from "@/lib/placesLive";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedCompetitorScan } from "@/lib/savedCompetitorScans";
import { loadBusinessNiche } from "@/lib/businessNiche.server";
import { LIVE_QUERY_COLUMNS, liveQueryFromRow, type LiveQueryBusinessRow } from "@/lib/competitorLiveQuery";

const g = globalThis as { __placesLiveCache?: LiveCache };
export function liveCache(): LiveCache {
  return (g.__placesLiveCache ??= new LiveCache());
}

export async function liveCallsThisMonth(kind: LiveKind, now: Date = new Date()): Promise<number | "missing" | "unreadable"> {
  try {
    const { data, error } = await createAdminClient().from("places_calls").select("calls").eq("kind", kind).gte("created_at", monthStartUtc(now));
    if (error) return placesCallsTableMissing(error) ? "missing" : "unreadable";
    return (data ?? []).reduce((sum, r) => sum + (Number((r as { calls: number }).calls) || 0), 0);
  } catch {
    return "unreadable";
  }
}

async function logLiveCall(businessId: string, kind: LiveKind | `${LiveKind}_skipped`, calls: number): Promise<void> {
  try {
    await createAdminClient().from("places_calls").insert({ business_id: businessId, kind, calls });
  } catch {
    // Logging never fails a page.
  }
}

export interface LiveDeps {
  text: typeof searchTextLive;
  nearby: typeof searchNearbyLive;
  details: typeof getPlaceLive;
  used: (kind: LiveKind) => Promise<number | "missing" | "unreadable">;
  log: (businessId: string, kind: LiveKind | `${LiveKind}_skipped`, calls: number) => Promise<void>;
  cache: LiveCache;
  now: () => number;
}

const defaultDeps = (): LiveDeps => ({
  text: searchTextLive,
  nearby: searchNearbyLive,
  details: getPlaceLive,
  used: (kind) => liveCallsThisMonth(kind),
  log: logLiveCall,
  cache: liveCache(),
  now: Date.now,
});

export type LiveCompetitorsResult =
  /** Live values by place ID; a place missing here shows "—". */
  | { status: "ok"; places: Record<string, LivePlace> }
  /** Nothing could be read (Google unreachable, or a cap): our own results only. */
  | { status: "unavailable" };

const placeKey = (placeId: string) => `place:${placeId}`;
const listKey = (businessId: string) => `list:${businessId}`;

/**
 * A page's competitors, live: what's cached from this visit first, then
 * one list call — the scan's own Text Search phrase, or without one a
 * Nearby Search around the business (closest first, its own search
 * types; skipped when it has none specific, since the nearest anything
 * wouldn't find them) — just past the farthest saved competitor, then a
 * Place Details call for each saved place it didn't return (at most
 * MAX_LIVE_DETAILS_PER_LOAD, in page order). Nothing is written to the
 * database except the count of calls.
 */
export async function liveCompetitorPlaces(
  input: {
    businessId: string;
    placeIds: string[];
    lat: number | null;
    lng: number | null;
    radiusMeters: number;
    includedTypes: string[];
    /** The phrase the scan searched ("hair salons in Westfield, NJ"), or null. */
    textQuery?: string | null;
    /** More places the page names ("Also nearby", "Removed by you") — their own allowance. */
    extraPlaceIds?: string[];
  },
  deps: LiveDeps = defaultDeps()
): Promise<LiveCompetitorsResult> {
  const { cache } = deps;
  const places: Record<string, LivePlace> = {};
  const fromCache = () => {
    for (const id of allIds) {
      const hit = cache.get<LivePlace>(placeKey(id), deps.now());
      if (hit) places[id] = hit;
    }
  };
  const extraIds = (input.extraPlaceIds ?? []).filter((id) => !input.placeIds.includes(id));
  const allIds = [...input.placeIds, ...extraIds];
  const missing = () => allIds.filter((id) => !places[id]);
  fromCache();
  if (missing().length === 0) return { status: "ok", places };

  let reachedGoogle = Object.keys(places).length > 0;
  // One list call per visit: a second load within the 10 minutes goes
  // straight to the few places the list didn't return.
  const { lat, lng } = input;
  const textQuery = input.textQuery?.trim() || null;
  const list = textQuery
    ? () => deps.text({ textQuery, lat, lng, radiusMeters: input.radiusMeters })
    : lat !== null && lng !== null && input.includedTypes.length > 0
      ? () => deps.nearby({ lat, lng, radiusMeters: input.radiusMeters, includedTypes: input.includedTypes })
      : null;
  if (list && !cache.get<boolean>(listKey(input.businessId), deps.now())) {
    if (canMakeLiveCall(await deps.used("live_list"), placesLiveMonthlyCap("live_list"))) {
      const found = await list().catch(() => null);
      await deps.log(input.businessId, "live_list", 1);
      if (found) {
        reachedGoogle = true;
        cache.set(listKey(input.businessId), true, deps.now());
        for (const p of found) cache.set(placeKey(p.placeId), p, deps.now());
        fromCache();
      }
    } else {
      await deps.log(input.businessId, "live_list_skipped", 0);
    }
  }

  const rest = [
    ...missing().filter((id) => input.placeIds.includes(id)).slice(0, MAX_LIVE_DETAILS_PER_LOAD),
    ...missing().filter((id) => extraIds.includes(id)).slice(0, MAX_LIVE_EXTRA_DETAILS_PER_LOAD),
  ];
  if (rest.length > 0) {
    const used = await deps.used("live_read");
    const cap = placesLiveMonthlyCap("live_read");
    let allowed = 0;
    while (allowed < rest.length && canMakeLiveCall(used, cap, allowed + 1)) allowed++;
    if (allowed < rest.length) await deps.log(input.businessId, "live_read_skipped", 0);
    const ids = rest.slice(0, allowed);
    const read = await Promise.all(ids.map((id) => deps.details(id).catch(() => null)));
    if (allowed > 0) await deps.log(input.businessId, "live_read", allowed);
    read.forEach((p, i) => {
      if (!p) return;
      reachedGoogle = true;
      // Keyed by the ID we saved (Google may answer with a newer one).
      cache.set(placeKey(ids[i]), { ...p, placeId: ids[i] }, deps.now());
    });
    fromCache();
  }

  return reachedGoogle ? { status: "ok", places } : { status: "unavailable" };
}

/** The Competitors page's latest scan with Google's values read live:
 * saved values are never shown, only our own results plus what Google
 * says right now. `unavailable`: Google couldn't be reached. */
export async function withLiveCompetitorValues(
  businessId: string,
  scan: SavedCompetitorScan,
  ownName: string | null,
  query: { lat: number | null; lng: number | null; includedTypes: string[]; textQuery?: string | null },
  deps?: LiveDeps,
  /** More places the page names ("Also nearby", "Removed by you"), after the ranked ones. */
  extraPlaceIds: string[] = []
): Promise<{ scan: SavedCompetitorScan; unavailable: boolean; extra: Record<string, LivePlace> }> {
  const base = scanWithoutPlacesValues(scan, ownName);
  const live = await liveCompetitorPlaces(
    {
      businessId,
      placeIds: placesToFetch(base),
      extraPlaceIds: Array.from(new Set(extraPlaceIds)),
      lat: query.lat,
      lng: query.lng,
      radiusMeters: liveSearchRadius(base.entries),
      includedTypes: query.includedTypes,
      textQuery: query.textQuery,
    },
    deps
  ).catch((): LiveCompetitorsResult => ({ status: "unavailable" }));
  // The order never changes: it's by our own scores.
  if (live.status === "unavailable") return { scan: base, unavailable: true, extra: {} };
  const merged = withLivePlaces(base, live.places);
  const extra = Object.fromEntries(extraPlaceIds.filter((id) => live.places[id]).map((id) => [id, live.places[id]]));
  return { scan: merged, unavailable: merged.entries.some((e) => e.liveMissing), extra };
}

/** The same, for a caller that has only the business ID (the shared
 * competitor snapshot, reports, the monthly job): reads where to search
 * from the business row and its niche. `db` may be a session or admin client. */
export async function withLiveCompetitorValuesFor(db: SupabaseClient, businessId: string, scan: SavedCompetitorScan, deps?: LiveDeps): Promise<{ scan: SavedCompetitorScan; unavailable: boolean; extra: Record<string, LivePlace> }> {
  const [{ data }, niche] = await Promise.all([
    db.from("businesses").select(`name, ${LIVE_QUERY_COLUMNS}`).eq("id", businessId).maybeSingle(),
    loadBusinessNiche(db, businessId),
  ]);
  const row = data as (LiveQueryBusinessRow & { name: string | null }) | null;
  if (!row) return { scan: scanWithoutPlacesValues(scan, null), unavailable: true, extra: {} };
  return withLiveCompetitorValues(businessId, scan, row.name, liveQueryFromRow(row, niche), deps);
}
