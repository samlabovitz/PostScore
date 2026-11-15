// Server-only. One READ of a connected business's real Google listing:
// the Business Information location (title, address, phone, website,
// categories, regular + special hours, services, description), its
// customer details (attributes) and its Place Actions links (booking /
// ordering, from the owner, booking partners or Google). Never writes.
//
// Used to seed practice mode's fake Google from the real listing
// (lib/gbpProfilePractice.server.ts), for the booking-link row, holiday
// hours, services and the Hair Express live check. Uses the stored tokens
// (a 401 is refreshed once; a refused refresh is the only thing that loses
// the connection) and the shared 300/min limiter.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessTokenWithClient, markGbpReconnect } from "@/lib/gbpTokens.server";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import type { PlaceActionLink } from "@/lib/gbpPlaceActions";

const INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const ACTIONS = "https://mybusinessplaceactions.googleapis.com/v1";
export const REAL_LISTING_READ_MASK = "name,title,phoneNumbers,categories,storefrontAddress,websiteUri,regularHours,specialHours,serviceItems,profile,metadata";

export interface RealLocation {
  name?: string;
  title?: string;
  phoneNumbers?: { primaryPhone?: string; additionalPhones?: string[] };
  categories?: { primaryCategory?: { name?: string; displayName?: string }; additionalCategories?: Array<{ name?: string; displayName?: string }> };
  storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string; regionCode?: string };
  websiteUri?: string;
  regularHours?: { periods?: unknown[] };
  specialHours?: { specialHourPeriods?: unknown[] };
  serviceItems?: unknown[];
  profile?: { description?: string };
  metadata?: { placeId?: string; mapsUri?: string; hasVoiceOfMerchant?: boolean };
}

export interface RealListing {
  location: RealLocation;
  /** Customer details: yes / no values by attribute id ("attributes/pay_credit_card"). */
  attributes: Array<{ name: string; valueType?: string; values?: unknown[] }>;
  placeActionLinks: PlaceActionLink[];
  /** The yes/no details Google offers for this listing's category (attributes.list); [] when the read failed. */
  offered?: import("@/lib/gbpAttributes").GbpAttributeMetadata[];
}

export type RealListingResult = { ok: true; listing: RealListing } | { ok: false; error: string };

async function get<T>(f: typeof fetch, token: string, url: string): Promise<{ ok: true; data: T } | { ok: false; status: number | null }> {
  try {
    const res = await f(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: ((await res.json().catch(() => ({}))) ?? {}) as T };
  } catch {
    return { ok: false, status: null };
  }
}

async function readWith(f: typeof fetch, token: string, location: string): Promise<{ ok: true; listing: RealListing } | { ok: false; status: number | null; step: string }> {
  const info = new URL(`${INFO}/${location}`);
  info.searchParams.set("readMask", REAL_LISTING_READ_MASK);
  const { listOffered } = await import("@/lib/gbpAttributes.server");
  const [loc, attrs, links, offered] = await Promise.all([
    get<RealLocation>(f, token, info.toString()),
    get<{ attributes?: RealListing["attributes"] }>(f, token, `${INFO}/${location}/attributes`),
    get<{ placeActionLinks?: PlaceActionLink[] }>(f, token, `${ACTIONS}/${location}/placeActionLinks`),
    listOffered(f, token, location),
  ]);
  if (!loc.ok) return { ok: false, status: loc.status, step: "location" };
  return {
    ok: true,
    listing: {
      location: loc.data,
      // Customer details and links are extras: a failed read leaves them empty.
      attributes: attrs.ok ? (attrs.data.attributes ?? []) : [],
      placeActionLinks: links.ok ? (links.data.placeActionLinks ?? []) : [],
      offered: offered.ok ? offered.data : [],
    },
  };
}

/** The connected business's real listing, read once. */
export async function readRealListing(admin: SupabaseClient, businessId: string, fetchImpl: typeof fetch = fetch): Promise<RealListingResult> {
  const { data: conn } = await admin.from("gbp_connections").select("status, google_location_id").eq("business_id", businessId).maybeSingle();
  const location = (conn as { status?: string; google_location_id?: string | null } | null)?.google_location_id;
  if ((conn as { status?: string } | null)?.status !== "connected" || typeof location !== "string" || !location.startsWith("locations/")) return { ok: false, error: "not connected" };
  const counter = { calls: 0 };
  const f = gbpFetch(counter, fetchImpl);
  try {
    let token = await getValidAccessTokenWithClient(admin, businessId, fetchImpl);
    if (token.status !== "ok") return { ok: false, error: `token ${token.reason}` };
    let read = await readWith(f, token.accessToken, location);
    if (!read.ok && read.status === 401) {
      const checked = await markGbpReconnect(admin, businessId, fetchImpl);
      if (checked.status === "error" && checked.reason === "reconnect") return { ok: false, error: "reconnect" };
      token = await getValidAccessTokenWithClient(admin, businessId, fetchImpl);
      if (token.status !== "ok") return { ok: false, error: `token ${token.reason}` };
      read = await readWith(f, token.accessToken, location);
    }
    if (!read.ok) {
      console.warn(`[gbp-listing] read failed`, JSON.stringify({ step: read.step, status: read.status }));
      return { ok: false, error: `${read.step} ${read.status ?? "network"}` };
    }
    return { ok: true, listing: read.listing };
  } finally {
    logGbpCalls("listing-read", counter);
  }
}

// The pages read the listing often (the Google Profile tab, the Growth
// recap's booking task): one read per business per hour per server, so a
// page view doesn't call Google each time. A failed read isn't kept.
const CACHE_MS = 60 * 60 * 1000;
const g = globalThis as unknown as { __realListingCache?: Map<string, { at: number; listing: RealListing }> };
const cache = (g.__realListingCache ??= new Map());

export async function readRealListingCached(admin: SupabaseClient, businessId: string, fetchImpl: typeof fetch = fetch, now: number = Date.now()): Promise<RealListingResult> {
  const hit = cache.get(businessId);
  if (hit && now - hit.at < CACHE_MS) return { ok: true, listing: hit.listing };
  const read = await readRealListing(admin, businessId, fetchImpl);
  if (read.ok) cache.set(businessId, { at: now, listing: read.listing });
  return read;
}

/** After a write from PostScore: the next page view reads Google again. */
export function forgetRealListing(businessId: string) {
  cache.delete(businessId);
}

/** What the tab's rows need from the real listing: special hours, the
 * service names, the categories (null when the read fails). */
export async function listingExtras(admin: SupabaseClient, businessId: string): Promise<import("@/lib/googleProfileTab").ListingExtras | null> {
  const read = await readRealListingCached(admin, businessId).catch(() => null);
  if (!read?.ok) return null;
  const { serviceNames } = await import("@/lib/gbpListingFields");
  type Cat = { displayName?: string; serviceTypes?: Array<{ serviceTypeId?: string; displayName?: string }> };
  const cats = read.listing.location.categories as { primaryCategory?: Cat; additionalCategories?: Cat[] } | undefined;
  const types = [...(cats?.primaryCategory?.serviceTypes ?? []), ...(cats?.additionalCategories ?? []).flatMap((c) => c.serviceTypes ?? [])];
  return {
    specialPeriods: (read.listing.location.specialHours?.specialHourPeriods ?? []) as import("@/lib/gbpListingFields").SpecialHourPeriod[],
    services: serviceNames((read.listing.location.serviceItems ?? []) as import("@/lib/gbpListingFields").ServiceItem[], types),
    categories: [cats?.primaryCategory?.displayName, ...(cats?.additionalCategories ?? []).map((c) => c.displayName)].filter((x): x is string => !!x),
    verified: typeof read.listing.location.metadata?.hasVoiceOfMerchant === "boolean" ? read.listing.location.metadata.hasVoiceOfMerchant : null,
    description: read.listing.location.profile?.description ?? null,
    attributeIds: read.listing.attributes.filter((a) => (a.values ?? []).length > 0).map((a) => a.name),
    details: await (async () => {
      // Customer details: the 3 scored groups and the extras Google offers (suggestions only, no points).
      const offered = read.listing.offered ?? [];
      if (offered.length === 0) return null;
      const [{ customerDetailsEditorRows, suggestedExtras }, { ideaTypeOf }] = await Promise.all([import("@/lib/gbpAttributes"), import("@/lib/listingIdeas")]);
      const rows = customerDetailsEditorRows(offered, read.listing.attributes as never, []);
      const { data: biz } = await admin.from("businesses").select("niche_id").eq("id", businessId).maybeSingle();
      const type = ideaTypeOf((biz as { niche_id?: string | null } | null)?.niche_id ?? null, []);
      const set = (part: string) => rows.some((r) => r.part === part && r.current !== null);
      return {
        payment: set("payment"),
        parking: set("parking"),
        accessibility: set("accessibility"),
        open: rows.filter((r) => (r.part === "extra" || r.part === "service") && r.current === null).length,
        suggest: suggestedExtras(rows, type).map((r) => ({ id: r.id, label: r.label })),
      };
    })(),
  };
}
