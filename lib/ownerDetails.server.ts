// Server-only. Day 23 2d-3: reads the owner-confirmed business details
// (lib/ownerDetails.ts). Read on their own, so every page still works
// before supabase/owner-details.sql is run (an error reads as "not
// confirmed").
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedOwnerListing, liveListingForRow, ownerListingLive } from "@/lib/ownerListing.server";
import { sanitizeOwnerDetails, withOwnerDetails, type OwnerDetails } from "@/lib/ownerDetails";

export interface SavedOwnerDetails {
  details: OwnerDetails;
  confirmedAt: string;
}

/**
 * How a page gets the listing's name and address before the owner confirms:
 * - true (default): this visit's live read (one per 10 minutes, shared with
 *   the page's other parts — lib/ownerListing.server.ts);
 * - "cached": only when this visit already read it (the business switcher,
 *   the monthly email) — never a Google call;
 * - false: no Google call (Free's locked-tab showrooms).
 */
export type OwnerNameLive = boolean | "cached";

interface DetailsRow {
  id: string;
  owner_details: unknown;
  owner_details_confirmed_at: string | null;
}

async function readRows(db: SupabaseClient, businessIds: string[]): Promise<DetailsRow[]> {
  if (businessIds.length === 0) return [];
  try {
    const { data, error } = await db.from("businesses").select("id, owner_details, owner_details_confirmed_at").in("id", businessIds);
    return error || !data ? [] : (data as DetailsRow[]);
  } catch {
    // Not confirmed, as far as any page can tell.
    return [];
  }
}

const saved = (row: DetailsRow | undefined): SavedOwnerDetails | null => {
  const details = row ? sanitizeOwnerDetails(row.owner_details) : null;
  return details && row?.owner_details_confirmed_at ? { details, confirmedAt: row.owner_details_confirmed_at } : null;
};

/** The owner's confirmed details; null when not confirmed (or unreadable). */
export async function loadOwnerDetails(db: SupabaseClient, businessId: string): Promise<SavedOwnerDetails | null> {
  return saved((await readRows(db, [businessId]))[0]);
}

/** For several businesses at once (the business switcher). */
export async function loadOwnerDetailsMany(db: SupabaseClient, businessIds: string[]): Promise<Map<string, SavedOwnerDetails>> {
  const out = new Map<string, SavedOwnerDetails>();
  for (const row of await readRows(db, businessIds)) {
    const s = saved(row);
    if (s) out.set(row.id, s);
  }
  return out;
}

/** Lists of an owner's businesses (the home list, Settings → Businesses,
 * notifications) read each one live only for an account with at most this
 * many; above it, only reads already made (the cache) — so one account with
 * many businesses can't use up the month's live-read cap. */
export const LIVE_NAMES_MAX_BUSINESSES = 5;

/** How a list of `count` businesses reads their names. */
export function namesLiveFor(count: number): OwnerNameLive {
  return count <= LIVE_NAMES_MAX_BUSINESSES ? true : "cached";
}

export interface ShownName {
  name: string | null;
  address: string | null;
  /** Not confirmed, and Google couldn't be read just now: the page says so. */
  unavailable: boolean;
  /** Not confirmed, and no read was made (only the cache, or none): nothing to say about Google. */
  notRead?: boolean;
}

/**
 * Each business's name and address to show (the home list, the business
 * switcher, notifications): the owner's confirmed ones, else the listing
 * as Google shows it now — with `live: true` one read per business per 10
 * minutes (the shared live cache), "cached" only a read this visit already
 * made, false none. Never the saved Google columns: null when unknown.
 */
export async function shownNamesFor(db: SupabaseClient, businessIds: string[], options: { live?: OwnerNameLive } = {}): Promise<Map<string, ShownName>> {
  const ids = Array.from(new Set(businessIds));
  const out = new Map<string, ShownName>();
  const owners = await loadOwnerDetailsMany(db, ids);
  const rest: string[] = [];
  for (const id of ids) {
    const owner = owners.get(id);
    if (owner) out.set(id, { name: owner.details.name, address: owner.details.address || null, unavailable: false });
    else rest.push(id);
  }
  const live = options.live ?? true;
  if (live !== true) {
    for (const id of rest) {
      const cached = live === "cached" ? cachedOwnerListing(id) : null;
      out.set(id, cached?.status === "ok" ? pick(cached) : { name: null, address: null, unavailable: false, notRead: true });
    }
    return out;
  }
  const [listings, connected] = await Promise.all([listingRows(db, rest), connectedIds(db, rest)]);
  await Promise.all(
    rest.map(async (id) => {
      const row = listings.get(id);
      const read = row
        ? await ownerListingLive(id, { placeId: row.place_id, websiteOnly: row.listing_mode === "website_only", connected: connected.has(id) }).catch(() => null)
        : null;
      out.set(id, pick(read));
    })
  );
  return out;
}

const pick = (live: Parameters<typeof withOwnerDetails>[2]): ShownName => {
  const shown = withOwnerDetails<{ name?: string | null; address?: string | null }>({}, null, live);
  return { name: shown.name ?? null, address: shown.address ?? null, unavailable: live?.status !== "ok" };
};

async function listingRows(db: SupabaseClient, businessIds: string[]): Promise<Map<string, { place_id: string | null; listing_mode: string | null }>> {
  const out = new Map<string, { place_id: string | null; listing_mode: string | null }>();
  if (businessIds.length === 0) return out;
  try {
    const { data } = await db.from("businesses").select("id, place_id, listing_mode").in("id", businessIds);
    for (const r of (data ?? []) as Array<{ id: string; place_id: string | null; listing_mode: string | null }>) out.set(r.id, r);
  } catch {
    // Unknown: no read, no name.
  }
  return out;
}

/** The businesses that read their listing from Business Profile (0 Places calls). */
async function connectedIds(db: SupabaseClient, businessIds: string[]): Promise<Set<string>> {
  if (businessIds.length === 0) return new Set();
  try {
    const { data } = await db.from("gbp_connections").select("business_id, status, google_location_id").in("business_id", businessIds);
    return new Set(((data ?? []) as Array<{ business_id: string; status?: string; google_location_id?: string | null }>).filter((c) => c.status === "connected" && !!c.google_location_id).map((c) => c.business_id));
  } catch {
    return new Set();
  }
}

/** The listing's place and mode, for the live read. */
async function listingRow(db: SupabaseClient, businessId: string): Promise<{ place_id: string | null; listing_mode: string | null } | null> {
  try {
    const { data } = await db.from("businesses").select("place_id, listing_mode").eq("id", businessId).maybeSingle();
    return (data as { place_id: string | null; listing_mode: string | null } | null) ?? null;
  } catch {
    return null;
  }
}

/** `row` with the name and address to show (lib/ownerDetails.ts withOwnerDetails). */
export async function withOwnerDetailsFor<T extends { name?: string | null; address?: string | null }>(db: SupabaseClient, businessId: string, row: T, options: { live?: OwnerNameLive } = {}): Promise<T> {
  const owner = await loadOwnerDetails(db, businessId);
  if (owner) return withOwnerDetails(row, owner.details);
  const live = options.live ?? true;
  if (live === false) return withOwnerDetails(row, null, null);
  if (live === "cached") return withOwnerDetails(row, null, cachedOwnerListing(businessId));
  const listing = await listingRow(db, businessId);
  return withOwnerDetails(row, null, listing ? await liveListingForRow(db, businessId, listing) : null);
}

/** The phone a coupon or referral card prints: the owner's confirmed one
 * (none when they left it empty), else the listing's as Google shows it
 * now — null when it couldn't be read (or `live: false`: no Google call). */
export async function ownerPrintPhone(db: SupabaseClient, businessId: string, options: { live?: boolean } = {}): Promise<string | null> {
  const owner = await loadOwnerDetails(db, businessId);
  if (owner) return owner.details.phone || null;
  if (options.live === false) return null;
  const listing = await listingRow(db, businessId);
  if (!listing) return null;
  // No phone on the card rather than a failed page.
  const live = await liveListingForRow(db, businessId, listing).catch(() => null);
  return live?.status === "ok" ? live.values.phone : null;
}
