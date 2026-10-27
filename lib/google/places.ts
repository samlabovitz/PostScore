// Server-only. Never import this from a "use client" component — the API
// key must never reach the browser. Route handlers should call these
// functions and pass the (normalized, key-free) result down to the client.

const PLACES_API_BASE = "https://places.googleapis.com/v1";

// pureServiceAreaBusiness is in the same (Pro) tier as the address —
// no extra cost — and lets the results say "no storefront".
const SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.pureServiceAreaBusiness";

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "regularOpeningHours.weekdayDescriptions",
  "regularOpeningHours.periods",
  "rating",
  "userRatingCount",
  "types",
  "primaryType",
  "primaryTypeDisplayName",
  "location",
  "businessStatus",
  "googleMapsUri",
  "photos",
  "priceLevel",
  // Scoring v1.12.0 Stage 1 (docs/review-scoring-plan.md): measured now,
  // scored later — Place Details only, never Nearby Search (competitors).
  "accessibilityOptions",
  "pureServiceAreaBusiness",
].join(",");

// Nearby Search returns every listing field competitors are scored on
// (Part B, cost-first competitor scan): one Nearby Search Enterprise call
// (~$0.035) replaces the old search + up to 10 Place Details calls
// (~$0.24). Confirmed on a real Modern Liquors call (Oct 16, 2026):
// rating, review count, website, phone, hours, photos (up to 10, the
// same cap as Details), price level and business status all come back.
// `priceLevel` already made this the Enterprise tier; no Atmosphere
// fields are requested.
const NEARBY_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.regularOpeningHours.weekdayDescriptions",
  "places.regularOpeningHours.periods",
  "places.rating",
  "places.userRatingCount",
  "places.types",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "places.location",
  "places.googleMapsUri",
  "places.photos",
  "places.priceLevel",
].join(",");

function getApiKey(): string {
  if (typeof window !== "undefined") {
    throw new Error("Google Places lookups must run on the server.");
  }
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || key === "YOUR_KEY_HERE") {
    throw new Error(
      "GOOGLE_PLACES_API_KEY is not set. Add your real key to .env.local."
    );
  }
  return key;
}

// Every real network call this module makes (search, details, nearby
// search) goes through fetchPlacesApi below — bounded by a real
// AbortController timeout, never able to hang indefinitely the way a
// bare fetch() can on a stalled connection. A business's own re-scan
// (app/actions/scoring.ts's rescanBusinessWithClient) used to be able to
// sit blocked on exactly this for a very long time (a real incident,
// not hypothetical) before finally throwing a generic "fetch failed" —
// unlike every other probe in this codebase (lib/websiteHttps.ts,
// lib/websiteAnalysis.ts, lib/pagePresenceDetection.ts), which already
// bound every fetch this same way.
const PLACES_TIMEOUT_MS = 10000;
/** One retry — only on a timeout or a retryable (5xx) HTTP status,
 * never on a 4xx (a bad request/key would just fail identically again)
 * and never on any other thrown error (DNS failure, connection refused
 * — also unlikely to resolve on an immediate retry). On final failure
 * this throws a real Error; every caller here already has, or gets, a
 * try/catch that turns this into an honest stored failure — never a
 * hang, and never partial/fabricated data saved as if the call
 * succeeded. */
const PLACES_MAX_ATTEMPTS = 2;
const PLACES_RETRY_DELAY_MS = 500;

function isRetryablePlacesStatus(status: number): boolean {
  return status >= 500;
}

type PlacesAttemptOutcome =
  | { kind: "ok"; res: Response }
  | { kind: "timed_out" }
  | { kind: "http_error"; status: number; body: string }
  | { kind: "network_error"; message: string };

async function fetchPlacesOnce(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<PlacesAttemptOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLACES_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal });
    if (res.ok) return { kind: "ok", res };
    const body = await res.text();
    return { kind: "http_error", status: res.status, body };
  } catch (err) {
    const isTimeout = (err as { name?: string } | null)?.name === "AbortError";
    return isTimeout
      ? { kind: "timed_out" }
      : { kind: "network_error", message: err instanceof Error ? err.message : "Unknown error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The one real place every Places API fetch goes through — see
 * PLACES_MAX_ATTEMPTS's own doc for the retry rule. `label` is just for
 * an honest, specific thrown message (e.g. "Google Places details").
 */
async function fetchPlacesApi(
  url: string,
  init: RequestInit,
  label: string,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  let last: PlacesAttemptOutcome = { kind: "network_error", message: "Unknown error" };
  for (let attempt = 1; attempt <= PLACES_MAX_ATTEMPTS; attempt++) {
    last = await fetchPlacesOnce(url, init, fetchImpl);
    if (last.kind === "ok") return last.res;
    const shouldRetry = last.kind === "timed_out" || (last.kind === "http_error" && isRetryablePlacesStatus(last.status));
    if (!shouldRetry || attempt >= PLACES_MAX_ATTEMPTS) break;
    await new Promise((resolve) => setTimeout(resolve, PLACES_RETRY_DELAY_MS));
  }
  if (last.kind === "timed_out") {
    throw new Error(`${label} timed out after ${PLACES_MAX_ATTEMPTS} attempt(s).`);
  }
  if (last.kind === "http_error") {
    throw new Error(`${label} failed (${last.status}): ${last.body}`);
  }
  throw new Error(`${label} failed: ${last.message}`);
}

export interface PlaceCandidate {
  placeId: string;
  name: string;
  formattedAddress: string | null;
  /** Google's own flag for a service-area business with no storefront
   * (its address is hidden) — Day 2b. Absent on older results. */
  serviceArea?: boolean;
}

/**
 * One open/close period from Google's regularOpeningHours.periods, kept
 * exactly as Google shapes it — `day` (0-6, Sunday first), `hour`,
 * `minute` — with no inferred or filled-in values. `close` is absent for
 * a period Google reports as never closing that day, and a period that
 * runs past midnight has `close.day` different from `open.day` — both
 * stored as-is, never normalized.
 */
export interface OpeningHoursPeriod {
  open?: { day?: number; hour?: number; minute?: number };
  close?: { day?: number; hour?: number; minute?: number };
}

export interface PlaceDetails {
  placeId: string;
  name: string | null;
  formattedAddress: string | null;
  phone: string | null;
  website: string | null;
  openingHours: string[] | null;
  /**
   * Google's structured regularOpeningHours.periods — separate from the
   * English-formatted `openingHours` weekday descriptions above, so hours
   * can eventually be displayed in the business's own language. Stored
   * exactly as Google returns it; null when Google returns no periods.
   * Not yet read anywhere else in the app.
   */
  openingHoursPeriods: OpeningHoursPeriod[] | null;
  rating: number | null;
  userRatingCount: number | null;
  categories: string[] | null;
  primaryCategory: string | null;
  /**
   * Google's machine-readable primary type slug (e.g. "hair_salon"), as
   * opposed to `primaryCategory`'s human-readable display text (e.g. "Hair
   * Salon"). Used to find genuinely same-category competitors via Nearby
   * Search, where the API expects a type slug, not a display label.
   */
  primaryType: string | null;
  location: { lat: number; lng: number } | null;
  businessStatus: string | null;
  googleMapsUri: string | null;
  /** Number of photos Google has for this listing. Used by the scoring engine's photos check. */
  photoCount: number | null;
  /**
   * Google's raw price-level enum (e.g. "PRICE_LEVEL_MODERATE"), or null
   * when Google has no price data for this listing — common for
   * service businesses (salons, lawyers) that aren't restaurants/bars.
   * Never used by the scoring engine; see lib/priceLevel.ts for the
   * display mapping used by the Pricing page.
   */
  priceLevel: string | null;
  /** Google's accessibility flags (wheelchair entrance, parking, restroom,
   * seating), as returned; null when Google has none or the call didn't
   * ask (Nearby Search). Not scored yet (v1.12.0 Stage 2). */
  accessibilityOptions?: Record<string, boolean> | null;
  /** True for a service-area business with no storefront; null = unknown. */
  pureServiceAreaBusiness?: boolean | null;
}

export type PlaceLookupResult =
  | { status: "found"; place: PlaceDetails; raw: unknown }
  | { status: "no_results" }
  | { status: "multiple"; candidates: PlaceCandidate[] }
  | { status: "error"; message: string };

interface RawSearchPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  pureServiceAreaBusiness?: boolean;
}

export interface RawDetailsPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[]; periods?: OpeningHoursPeriod[] };
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
  googleMapsUri?: string;
  photos?: unknown[];
  priceLevel?: string;
  /** Place Details only (not in the Nearby Search mask). */
  accessibilityOptions?: Record<string, boolean | undefined>;
  pureServiceAreaBusiness?: boolean;
}

/** Nearby Search now requests the same listing fields as Place
 * Details, so a result has the same raw shape. */
type RawNearbyPlace = RawDetailsPlace;

/** A candidate returned by Nearby Search — deliberately thin (Basic fields
 * only). Callers filter/rank these and only fetch full Details for the
 * handful that survive filtering. */
export interface NearbyCandidate {
  placeId: string;
  name: string | null;
  formattedAddress: string | null;
  types: string[] | null;
  primaryType: string | null;
  primaryTypeDisplayName: string | null;
  businessStatus: string | null;
  location: { lat: number; lng: number } | null;
  priceLevel: string | null;
  /** The full listing, exactly as Place Details would map it — so a
   * competitor is scored from this one search, never a second paid call. */
  details: PlaceDetails;
}

/** Text Search calls made by this process (each ~$0.032, Pro tier). */
let textSearchCalls = 0;
export function textSearchCallCount(): number {
  return textSearchCalls;
}

export interface TextSearchOptions {
  /** Prefer results near a point (the owner's town) — a bias, not a filter. */
  locationBias?: { lat: number; lng: number; radiusMeters: number } | null;
}

export async function searchPlaces(
  textQuery: string,
  fetchImpl: typeof fetch = fetch,
  options: TextSearchOptions = {}
): Promise<RawSearchPlace[]> {
  textSearchCalls++;
  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount: 5,
    // Day 2b: Google leaves out service-area businesses (no storefront —
    // tutors, cleaners, mobile services) unless asked. Same price.
    includePureServiceAreaBusinesses: true,
  };
  if (options.locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: options.locationBias.lat, longitude: options.locationBias.lng },
        radius: options.locationBias.radiusMeters,
      },
    };
  }
  const res = await fetchPlacesApi(
    `${PLACES_API_BASE}/places:searchText`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask": SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(body),
    },
    "Google Places search",
    fetchImpl
  );

  const data = (await res.json()) as { places?: RawSearchPlace[] };
  return data.places ?? [];
}

async function getPlaceDetails(
  placeId: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ place: PlaceDetails; raw: RawDetailsPlace }> {
  const res = await fetchPlacesApi(
    `${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
    },
    "Google Places details",
    fetchImpl
  );

  const raw = (await res.json()) as RawDetailsPlace;
  return { place: normalizeDetails(raw), raw };
}

/** Exported for lib/google/places.test.ts — this is a pure mapping
 * function, so it's tested directly rather than through a mocked fetch. */
export function normalizeDetails(raw: RawDetailsPlace): PlaceDetails {
  return {
    placeId: raw.id,
    name: raw.displayName?.text ?? null,
    formattedAddress: raw.formattedAddress ?? null,
    phone: raw.internationalPhoneNumber ?? raw.nationalPhoneNumber ?? null,
    website: raw.websiteUri ?? null,
    openingHours: raw.regularOpeningHours?.weekdayDescriptions ?? null,
    openingHoursPeriods:
      raw.regularOpeningHours?.periods && raw.regularOpeningHours.periods.length > 0
        ? raw.regularOpeningHours.periods
        : null,
    rating: typeof raw.rating === "number" ? raw.rating : null,
    userRatingCount:
      typeof raw.userRatingCount === "number" ? raw.userRatingCount : null,
    categories: raw.types && raw.types.length > 0 ? raw.types : null,
    primaryCategory: raw.primaryTypeDisplayName?.text ?? null,
    primaryType: raw.primaryType ?? null,
    location:
      raw.location?.latitude != null && raw.location?.longitude != null
        ? { lat: raw.location.latitude, lng: raw.location.longitude }
        : null,
    businessStatus: raw.businessStatus ?? null,
    googleMapsUri: raw.googleMapsUri ?? null,
    photoCount: Array.isArray(raw.photos) ? raw.photos.length : null,
    priceLevel: raw.priceLevel ?? null,
    accessibilityOptions: accessibilityFlags(raw.accessibilityOptions),
    pureServiceAreaBusiness: typeof raw.pureServiceAreaBusiness === "boolean" ? raw.pureServiceAreaBusiness : null,
  };
}

/** Only real true/false flags; null when there are none. */
function accessibilityFlags(raw: RawDetailsPlace["accessibilityOptions"]): Record<string, boolean> | null {
  if (!raw || typeof raw !== "object") return null;
  const flags = Object.fromEntries(Object.entries(raw).filter((e): e is [string, boolean] => typeof e[1] === "boolean"));
  return Object.keys(flags).length > 0 ? flags : null;
}

/** Real Nearby Search calls made by this process — lets the bulk
 * competitor backfill (scripts/rescan-all.ts) stop at a call budget. */
let nearbySearchCalls = 0;
export function nearbySearchCallCount(): number {
  return nearbySearchCalls;
}

function normalizeNearby(raw: RawNearbyPlace): NearbyCandidate {
  return {
    placeId: raw.id,
    name: raw.displayName?.text ?? null,
    formattedAddress: raw.formattedAddress ?? null,
    types: raw.types && raw.types.length > 0 ? raw.types : null,
    primaryType: raw.primaryType ?? null,
    primaryTypeDisplayName: raw.primaryTypeDisplayName?.text ?? null,
    businessStatus: raw.businessStatus ?? null,
    location:
      raw.location?.latitude != null && raw.location?.longitude != null
        ? { lat: raw.location.latitude, lng: raw.location.longitude }
        : null,
    priceLevel: raw.priceLevel ?? null,
    details: normalizeDetails(raw),
  };
}

/**
 * Nearby Search (New) — finds real places within a radius of a point,
 * optionally restricted to Google's own place-type slugs. One API call
 * regardless of how many results come back (up to maxResultCount), and the
 * field mask stays Basic-tier so this is cheap to call even though callers
 * will discard most candidates during filtering.
 */
export async function searchNearbyPlaces(params: {
  lat: number;
  lng: number;
  radiusMeters: number;
  includedTypes?: string[];
  /** Only places whose PRIMARY type is one of these (Google's own filter)
   * — so a popularity-ranked search isn't filled by places that merely
   * carry the type as a sideline (a diner tagged "cafe"). */
  includedPrimaryTypes?: string[];
  maxResultCount?: number;
  /**
   * Google defaults Nearby Search to POPULARITY ranking, which can return
   * a farther-but-popular place ahead of a genuinely closer one. Callers
   * that care about real proximity (e.g. "who does this business actually
   * compete with locally") should pass "DISTANCE" explicitly.
   */
  rankPreference?: "DISTANCE" | "POPULARITY";
  },
  fetchImpl: typeof fetch = fetch
): Promise<NearbyCandidate[]> {
  const body: Record<string, unknown> = {
    maxResultCount: params.maxResultCount ?? 20,
    locationRestriction: {
      circle: {
        center: { latitude: params.lat, longitude: params.lng },
        radius: params.radiusMeters,
      },
    },
  };
  if (params.includedTypes && params.includedTypes.length > 0) {
    body.includedTypes = params.includedTypes;
  }
  if (params.includedPrimaryTypes && params.includedPrimaryTypes.length > 0) {
    body.includedPrimaryTypes = params.includedPrimaryTypes;
  }
  if (params.rankPreference) {
    body.rankPreference = params.rankPreference;
  }

  nearbySearchCalls += 1;
  const res = await fetchPlacesApi(
    `${PLACES_API_BASE}/places:searchNearby`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask": NEARBY_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(body),
    },
    "Google Places nearby search",
    fetchImpl
  );

  const data = (await res.json()) as { places?: RawNearbyPlace[] };
  return (data.places ?? []).map(normalizeNearby);
}

/** Look up a business by name + free-form location (e.g. "Blue Bottle Coffee", "Oakland, CA"). */
export async function lookupBusiness(
  name: string,
  location: string,
  fetchImpl: typeof fetch = fetch
): Promise<PlaceLookupResult> {
  try {
    const candidates = await searchPlaces(`${name} ${location}`.trim(), fetchImpl);

    if (candidates.length === 0) {
      return { status: "no_results" };
    }

    if (candidates.length === 1) {
      const { place, raw } = await getPlaceDetails(candidates[0].id, fetchImpl);
      return { status: "found", place, raw };
    }

    return { status: "multiple", candidates: candidates.map(toCandidate) };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export function toCandidate(c: RawSearchPlace): PlaceCandidate {
  return {
    placeId: c.id,
    name: c.displayName?.text ?? "(unnamed listing)",
    formattedAddress: c.formattedAddress ?? null,
    serviceArea: c.pureServiceAreaBusiness === true,
  };
}

/**
 * The owner's town as coordinates, for biasing a name-only search there
 * (Geocoding API, ~$0.005). Null when the API isn't enabled for this
 * key, finds nothing, or fails — the caller then just skips the bias.
 */
export async function geocodeTown(
  location: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${encodeURIComponent(getApiKey())}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string; results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }> };
    const loc = data.status === "OK" ? data.results?.[0]?.geometry?.location : undefined;
    return typeof loc?.lat === "number" && typeof loc?.lng === "number" ? { lat: loc.lat, lng: loc.lng } : null;
  } catch {
    return null;
  }
}

/** Fetch full details for a specific place, e.g. after the caller picks one of several matches. */
export async function lookupBusinessByPlaceId(
  placeId: string,
  fetchImpl: typeof fetch = fetch
): Promise<PlaceLookupResult> {
  try {
    const { place, raw } = await getPlaceDetails(placeId, fetchImpl);
    return { status: "found", place, raw };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ---------------------------------------------------------------------------
// The listing's main photo (Overview header). Google's rules (Places API
// policies + Place Photos docs, checked Oct 16, 2026): a photo name can't
// be cached or stored — always use one from a fresh Place Details
// response; the photo itself is Places content and isn't stored either;
// the author attribution must be shown wherever the photo is, with a
// way to see the source photo on Google Maps.
//
// Cost: a Details call asking ONLY for `photos` is the "Place Details
// Essentials (IDs Only)" SKU — unlimited free. The photo request is the
// "Place Details Photos" SKU — 1,000 free a month, then $7.00 / 1,000.
// ---------------------------------------------------------------------------

export interface PhotoAttribution {
  displayName: string;
  uri: string | null;
}

export interface ListingPhotoRef {
  /** The photo resource name — use right away, never store. */
  name: string;
  attributions: PhotoAttribution[];
  /** Google Maps page for this exact photo (required: users can view the source). */
  googleMapsUri: string | null;
}

interface RawPhoto {
  name?: string;
  authorAttributions?: { displayName?: string; uri?: string }[];
  googleMapsUri?: string;
}

/** Pure: the listing's first photo from a Details `photos` array, or null. */
export function firstPhotoRef(photos: unknown): ListingPhotoRef | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const photo = photos[0] as RawPhoto;
  if (typeof photo?.name !== "string" || !/^places\/[^/]+\/photos\/[^/]+$/.test(photo.name)) return null;
  return {
    name: photo.name,
    attributions: (photo.authorAttributions ?? [])
      .filter((a) => typeof a.displayName === "string" && a.displayName.trim() !== "")
      .map((a) => ({ displayName: a.displayName!.trim(), uri: typeof a.uri === "string" && /^https:\/\//.test(a.uri) ? a.uri : null })),
    googleMapsUri: typeof photo.googleMapsUri === "string" && /^https:\/\//.test(photo.googleMapsUri) ? photo.googleMapsUri : null,
  };
}

/** Free (IDs Only SKU): the listing's first photo reference, fresh. */
export async function getFirstPhotoRef(placeId: string, fetchImpl: typeof fetch = fetch): Promise<ListingPhotoRef | null> {
  const res = await fetchPlacesApi(
    `${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}`,
    { headers: { "X-Goog-Api-Key": getApiKey(), "X-Goog-FieldMask": "photos" }, cache: "no-store" },
    "Google Places photos",
    fetchImpl
  );
  const raw = (await res.json()) as { photos?: unknown };
  return firstPhotoRef(raw.photos);
}

/** Paid (Place Details Photos SKU): a short-lived, key-free image URL for
 * the photo. One attempt only — a retry could be billed twice. */
export async function resolvePhotoUri(photoName: string, maxWidthPx: number, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const url = `${PLACES_API_BASE}/${photoName}/media?maxWidthPx=${Math.round(maxWidthPx)}&skipHttpRedirect=true`;
  const outcome = await fetchPlacesOnce(url, { headers: { "X-Goog-Api-Key": getApiKey() }, cache: "no-store" }, fetchImpl);
  if (outcome.kind !== "ok") return null;
  const data = (await outcome.res.json()) as { photoUri?: string };
  return typeof data.photoUri === "string" && /^https:\/\//.test(data.photoUri) ? data.photoUri : null;
}

/** A place's website address only (Place Details, FieldMask websiteUri —
 * Enterprise SKU). One attempt, never retried, so each call is billed at
 * most once. null when Google lists no website or the call fails. */
export async function getPlaceWebsiteUri(placeId: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const outcome = await fetchPlacesOnce(
    `${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}`,
    { headers: { "X-Goog-Api-Key": getApiKey(), "X-Goog-FieldMask": "websiteUri" }, cache: "no-store" },
    fetchImpl
  );
  if (outcome.kind !== "ok") return null;
  const data = (await outcome.res.json()) as { websiteUri?: unknown };
  return typeof data.websiteUri === "string" && /^https?:\/\//i.test(data.websiteUri) ? data.websiteUri : null;
}
