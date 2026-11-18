// Server-only. Day 23 2d-2: reads the owner's own Google listing when a
// page is shown (lib/ownerListing.ts) — never saved, kept in memory for
// one visit (10 minutes, the shared live cache):
//   - connected to Google: Business Profile — the location (cached an hour,
//     lib/gbpRealListing.server.ts) and three one-item calls for the
//     rating, review count and photo count. No Places call.
//   - otherwise (Free and paid): one Place Details call, logged and capped
//     as a live_read (lib/placesLive.ts).
// Any failure or the cap: "unavailable", and the page says so.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOwnerListingLive } from "@/lib/google/places";
import { canMakeLiveCall, placesLiveMonthlyCap } from "@/lib/placesLive";
import { liveCache, liveCallsThisMonth } from "@/lib/placesLive.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { liveValuesFromBusinessProfile, liveValuesFromPlaces, withLiveListing, type ListingColumns, type LiveListing } from "@/lib/ownerListing";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { getValidAccessTokenWithClient, markGbpReconnect } from "@/lib/gbpTokens.server";

const V4 = "https://mybusiness.googleapis.com/v4";

export interface OwnerListingDeps {
  places: typeof getOwnerListingLive;
  gbp: (admin: SupabaseClient, businessId: string) => Promise<LiveListing>;
  used: () => Promise<number | "missing" | "unreadable">;
  log: (businessId: string, kind: "live_read" | "live_read_skipped", calls: number) => Promise<void>;
  admin: () => SupabaseClient;
  now: () => number;
}

async function logCall(businessId: string, kind: "live_read" | "live_read_skipped", calls: number): Promise<void> {
  try {
    await createAdminClient().from("places_calls").insert({ business_id: businessId, kind, calls });
  } catch {
    // Logging never fails a page.
  }
}

interface ListingSummary {
  averageRating: number | null;
  totalReviewCount: number | null;
  /** The owner's photos and customers' together, as Google shows them on the listing. */
  photoCount: number | null;
}

/** The connected owner's reviews and photos totals: three small calls
 * (one item each), the numbers only. */
async function gbpListingSummary(admin: SupabaseClient, businessId: string, account: string, location: string, fetchImpl: typeof fetch = fetch): Promise<ListingSummary | null> {
  const counter = { calls: 0 };
  const f = gbpFetch(counter, fetchImpl);
  const one = async (token: string, path: string) => {
    const url = new URL(`${V4}/${account}/${location}/${path}`);
    url.searchParams.set("pageSize", "1");
    const res = await f(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw Object.assign(new Error("gbp"), { status: res.status });
    return (await res.json().catch(() => ({}))) as { averageRating?: number; totalReviewCount?: number; totalMediaItemCount?: number };
  };
  const read = async (token: string) => {
    try {
      const [reviews, own, customers] = await Promise.all([one(token, "reviews"), one(token, "media"), one(token, "media/customers").catch(() => null)]);
      return {
        averageRating: typeof reviews.averageRating === "number" ? reviews.averageRating : null,
        totalReviewCount: typeof reviews.totalReviewCount === "number" ? reviews.totalReviewCount : 0,
        photoCount: (own.totalMediaItemCount ?? 0) + (customers?.totalMediaItemCount ?? 0),
      };
    } catch (err) {
      return { status: (err as { status?: number }).status ?? null } as const;
    }
  };
  try {
    let token = await getValidAccessTokenWithClient(admin, businessId, fetchImpl);
    if (token.status !== "ok") return null;
    let r = await read(token.accessToken);
    if ("status" in r && r.status === 401) {
      // Refresh first; a refused refresh is the only thing that loses the connection.
      const checked = await markGbpReconnect(admin, businessId, fetchImpl);
      if (checked.status === "error" && checked.reason === "reconnect") return null;
      token = await getValidAccessTokenWithClient(admin, businessId, fetchImpl);
      if (token.status !== "ok") return null;
      r = await read(token.accessToken);
    }
    return "status" in r ? null : r;
  } finally {
    logGbpCalls("listing-reviews", counter);
  }
}

/** Business Profile: the listing a connected owner sees on Google. */
export async function gbpOwnerListing(admin: SupabaseClient, businessId: string): Promise<LiveListing> {
  const { data: conn } = await admin.from("gbp_connections").select("status, google_account_id, google_location_id").eq("business_id", businessId).maybeSingle();
  const c = conn as { status?: string; google_account_id?: string | null; google_location_id?: string | null } | null;
  if (c?.status !== "connected" || !c.google_account_id || !c.google_location_id) return { status: "unavailable" };
  const { readRealListingCached } = await import("@/lib/gbpRealListing.server");
  const [listing, summary] = await Promise.all([
    readRealListingCached(admin, businessId).catch(() => null),
    gbpListingSummary(admin, businessId, c.google_account_id, c.google_location_id).catch(() => null),
  ]);
  if (!listing?.ok || !summary) return { status: "unavailable" };
  return {
    status: "ok",
    source: "business_profile",
    values: liveValuesFromBusinessProfile({ location: listing.listing.location, reviews: summary, photoCount: summary.photoCount }),
  };
}

const defaultDeps = (): OwnerListingDeps => ({
  places: getOwnerListingLive,
  gbp: gbpOwnerListing,
  used: () => liveCallsThisMonth("live_read"),
  log: logCall,
  admin: createAdminClient,
  now: Date.now,
});

const key = (businessId: string) => `owner-listing:${businessId}`;

/**
 * The owner's listing now — once per visit. `connected`: read from
 * Business Profile (never Places). The result, an unavailable one too,
 * is kept for the visit, so a page full of parts makes one read.
 */
export async function ownerListingLive(
  businessId: string,
  listing: { placeId: string | null; websiteOnly: boolean; connected: boolean },
  deps: OwnerListingDeps = defaultDeps()
): Promise<LiveListing> {
  if (!listing.placeId || listing.websiteOnly) return { status: "none" };
  const cache = liveCache();
  const hit = cache.get<LiveListing>(key(businessId), deps.now());
  if (hit) return hit;
  // Parts of one page asking at the same moment share the one read.
  const pending = inFlight.get(businessId);
  if (pending) return pending;
  const read = readOwnerListing(businessId, listing as { placeId: string; connected: boolean }, deps).finally(() => inFlight.delete(businessId));
  inFlight.set(businessId, read);
  return read;
}

// On globalThis like the live cache, so a dev reload keeps one map.
const inFlight: Map<string, Promise<LiveListing>> = ((globalThis as { __ownerListingInFlight?: Map<string, Promise<LiveListing>> }).__ownerListingInFlight ??= new Map());

/** The listing from this visit's read when there is one — never a Google call. */
export function cachedOwnerListing(businessId: string, now: number = Date.now()): LiveListing | null {
  return liveCache().get<LiveListing>(key(businessId), now) ?? null;
}

async function readOwnerListing(businessId: string, listing: { placeId: string; connected: boolean }, deps: OwnerListingDeps): Promise<LiveListing> {
  const cache = liveCache();
  let result: LiveListing;
  if (listing.connected) {
    result = await deps.gbp(deps.admin(), businessId).catch((): LiveListing => ({ status: "unavailable" }));
  } else if (!canMakeLiveCall(await deps.used(), placesLiveMonthlyCap("live_read"))) {
    await deps.log(businessId, "live_read_skipped", 0);
    result = { status: "unavailable" };
  } else {
    const place = await deps.places(listing.placeId).catch(() => null);
    await deps.log(businessId, "live_read", 1);
    result = place ? { status: "ok", source: "places", values: liveValuesFromPlaces(place) } : { status: "unavailable" };
  }
  cache.set(key(businessId), result, deps.now());
  return result;
}

/** After a write from PostScore to the listing: the next view reads Google again. */
export function forgetOwnerListing(businessId: string): void {
  liveCache().delete(key(businessId));
}

/** Whether the business reads its listing from Business Profile. */
export async function isGbpConnected(db: SupabaseClient, businessId: string): Promise<boolean> {
  try {
    const { data } = await db.from("gbp_connections").select("status, google_location_id").eq("business_id", businessId).maybeSingle();
    const c = data as { status?: string; google_location_id?: string | null } | null;
    return c?.status === "connected" && !!c.google_location_id;
  } catch {
    return false;
  }
}

/** The listing as Google shows it now, for a row read by a page itself
 * (needs place_id; listing_mode when it has one). */
export async function liveListingForRow(db: SupabaseClient, businessId: string, row: { place_id?: string | null; listing_mode?: string | null }): Promise<LiveListing> {
  return ownerListingLive(businessId, {
    placeId: row.place_id ?? null,
    websiteOnly: row.listing_mode === "website_only",
    connected: await isGbpConnected(db, businessId),
  }).catch((): LiveListing => ({ status: "unavailable" }));
}

/** `row` with Google's values as read now (lib/ownerListing.ts withLiveListing). */
export async function withLiveListingFor<T extends ListingColumns & { place_id?: string | null; listing_mode?: string | null }>(db: SupabaseClient, businessId: string, row: T) {
  return withLiveListing(row, await liveListingForRow(db, businessId, row));
}

interface GbpMediaItem {
  mediaFormat?: string;
  googleUrl?: string;
  locationAssociation?: { category?: string };
}

/** The header photo for a connected owner: their own Business Profile
 * cover (else profile, else first) photo — one media call, kept for the
 * visit. Never a Places call. Null when none or on any failure. */
export async function gbpHeaderPhoto(admin: SupabaseClient, businessId: string, fetchImpl: typeof fetch = fetch, now: number = Date.now()): Promise<{ uri: string } | null> {
  const cache = liveCache();
  const k = `owner-photo:${businessId}`;
  const hit = cache.get<{ uri: string } | null>(k, now);
  if (hit !== undefined) return hit;
  const { data: conn } = await admin.from("gbp_connections").select("status, google_account_id, google_location_id").eq("business_id", businessId).maybeSingle();
  const c = conn as { status?: string; google_account_id?: string | null; google_location_id?: string | null } | null;
  if (c?.status !== "connected" || !c.google_account_id || !c.google_location_id) return null;
  const counter = { calls: 0 };
  const f = gbpFetch(counter, fetchImpl);
  const read = async (token: string) => {
    try {
      const url = new URL(`${V4}/${c.google_account_id}/${c.google_location_id}/media`);
      url.searchParams.set("pageSize", "100");
      const res = await f(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return { status: res.status } as const;
      return { items: (((await res.json().catch(() => ({}))) as { mediaItems?: GbpMediaItem[] }).mediaItems ?? []) };
    } catch {
      return { status: null } as const;
    }
  };
  try {
    let token = await getValidAccessTokenWithClient(admin, businessId, fetchImpl);
    if (token.status !== "ok") return null;
    let r = await read(token.accessToken);
    if ("status" in r && r.status === 401) {
      const checked = await markGbpReconnect(admin, businessId, fetchImpl);
      if (checked.status === "error" && checked.reason === "reconnect") return null;
      token = await getValidAccessTokenWithClient(admin, businessId, fetchImpl);
      if (token.status !== "ok") return null;
      r = await read(token.accessToken);
    }
    if ("status" in r) return null;
    const photo = pickHeaderPhoto(r.items);
    const result = photo ? { uri: photo } : null;
    cache.set(k, result, now);
    return result;
  } finally {
    logGbpCalls("header-photo", counter);
  }
}

/** Cover, else profile, else the first photo. */
export function pickHeaderPhoto(items: GbpMediaItem[]): string | null {
  const photos = items.filter((m) => (m.mediaFormat ?? "PHOTO") === "PHOTO" && typeof m.googleUrl === "string" && m.googleUrl !== "");
  const by = (cat: string) => photos.find((m) => m.locationAssociation?.category === cat);
  return (by("COVER") ?? by("PROFILE") ?? photos[0])?.googleUrl ?? null;
}
