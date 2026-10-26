// Server-only. Finds which Google Business Profile location is this
// PostScore business: list the Google user's accounts, page through each
// account's locations, and match metadata.placeId to businesses.place_id.
// Never falls back to "some other location" — no match means no connect.
//
// Runs once, in the connect callback; the matched IDs are saved on
// gbp_connections so later steps never re-list. Hard-capped at
// MAX_LIST_CALLS requests per connect — far inside Google's 300/min quota.
import "server-only";

const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const LOCATIONS_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const READ_MASK = "name,title,storefrontAddress,metadata";
export const MAX_LIST_CALLS = 40;

export interface GbpLocationMatch {
  /** "accounts/123" */
  accountName: string;
  /** "locations/456" */
  locationName: string;
  title: string | null;
  /** One line, from storefrontAddress (null for service-area businesses). */
  address: string | null;
}

export type GbpLocationResult =
  | { kind: "match"; match: GbpLocationMatch }
  /** `unverified`: some location the account manages has no placeId (not
   * verified / not on Maps), or our business has no place ID — the owner
   * may need to verify the listing on Google first. */
  | { kind: "no_match"; unverified: boolean }
  /** A Google API call failed: which one, its HTTP status and Google's own
   * reason (e.g. SERVICE_DISABLED, RATE_LIMIT_EXCEEDED) — for the log. */
  | { kind: "error"; step: "accounts" | "locations" | "cap"; status: number | null; reason: string | null };

interface RawAddress {
  addressLines?: string[];
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
}
interface RawLocation {
  name?: string;
  title?: string;
  storefrontAddress?: RawAddress;
  metadata?: { placeId?: string; hasVoiceOfMerchant?: boolean };
}

interface GoogleErrorBody {
  error?: { status?: string; message?: string; details?: Array<{ reason?: string }> };
}
/** Google's machine-readable reason only (no message text, which can echo input). */
function googleReason(body: GoogleErrorBody | null): string | null {
  const detail = body?.error?.details?.find((d) => typeof d.reason === "string")?.reason;
  return detail ?? body?.error?.status ?? null;
}

export function formatGbpAddress(a: RawAddress | undefined): string | null {
  if (!a) return null;
  const cityLine = [a.locality, [a.administrativeArea, a.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const parts = [...(a.addressLines ?? []), cityLine].map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export async function findGbpLocation(
  accessToken: string,
  placeId: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<GbpLocationResult> {
  if (!placeId) return { kind: "no_match", unverified: true };

  let calls = 0;
  let lastFailure: { status: number | null; reason: string | null; capped: boolean } = { status: null, reason: null, capped: false };
  async function get<T>(url: string): Promise<T | null> {
    if (calls >= MAX_LIST_CALLS) {
      lastFailure = { status: null, reason: null, capped: true };
      return null;
    }
    calls++;
    try {
      const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as GoogleErrorBody | null;
        lastFailure = { status: res.status, reason: googleReason(body), capped: false };
        return null;
      }
      return (await res.json()) as T;
    } catch {
      lastFailure = { status: null, reason: "network", capped: false };
      return null;
    }
  }
  const fail = (step: "accounts" | "locations"): GbpLocationResult => ({
    kind: "error",
    step: lastFailure.capped ? "cap" : step,
    status: lastFailure.status,
    reason: lastFailure.reason,
  });

  // 1. Every account this Google user can manage (personal + groups).
  const accounts: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(ACCOUNTS_URL);
    url.searchParams.set("pageSize", "20");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await get<{ accounts?: Array<{ name?: string }>; nextPageToken?: string }>(url.toString());
    if (!page) return fail("accounts");
    for (const a of page.accounts ?? []) if (a.name) accounts.push(a.name);
    pageToken = page.nextPageToken;
  } while (pageToken);

  // 2. Page through each account's locations, collecting matches. The same
  // listing can appear under a personal account and a location group.
  const matches: Array<GbpLocationMatch & { voice: boolean }> = [];
  let unverified = false;
  for (const account of accounts) {
    let locToken: string | undefined;
    do {
      const url = new URL(`${LOCATIONS_BASE}/${account}/locations`);
      url.searchParams.set("readMask", READ_MASK);
      url.searchParams.set("pageSize", "100");
      if (locToken) url.searchParams.set("pageToken", locToken);
      const page = await get<{ locations?: RawLocation[]; nextPageToken?: string }>(url.toString());
      if (!page) return matches.length ? pick(matches) : fail("locations");
      for (const loc of page.locations ?? []) {
        if (!loc.metadata?.placeId) {
          unverified = true;
          continue;
        }
        if (loc.metadata.placeId === placeId && loc.name) {
          matches.push({
            accountName: account,
            locationName: loc.name,
            title: loc.title ?? null,
            address: formatGbpAddress(loc.storefrontAddress),
            voice: loc.metadata.hasVoiceOfMerchant === true,
          });
        }
      }
      locToken = page.nextPageToken;
    } while (locToken);
    // A verified match is the best there can be — stop listing.
    if (matches.some((m) => m.voice)) break;
  }

  return matches.length ? pick(matches) : { kind: "no_match", unverified };
}

/** Same place under two accounts: prefer the one with Voice of Merchant. */
function pick(matches: Array<GbpLocationMatch & { voice: boolean }>): GbpLocationResult {
  const best = matches.find((m) => m.voice) ?? matches[0];
  return { kind: "match", match: { accountName: best.accountName, locationName: best.locationName, title: best.title, address: best.address } };
}
