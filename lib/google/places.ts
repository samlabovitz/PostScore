// Server-only. Never import this from a "use client" component — the API
// key must never reach the browser. Route handlers should call these
// functions and pass the (normalized, key-free) result down to the client.

const PLACES_API_BASE = "https://places.googleapis.com/v1";

const SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress";

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "regularOpeningHours.weekdayDescriptions",
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
].join(",");

// Nearby Search is used only to find candidate competitors near a saved
// business's coordinates, so the mask stays deliberately narrow (Basic-tier
// fields only) — we don't pay for contact/atmosphere data on places we may
// filter out before ever fetching their full Details.
const NEARBY_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.types",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "places.location",
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

export interface PlaceCandidate {
  placeId: string;
  name: string;
  formattedAddress: string | null;
}

export interface PlaceDetails {
  placeId: string;
  name: string | null;
  formattedAddress: string | null;
  phone: string | null;
  website: string | null;
  openingHours: string[] | null;
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
}

interface RawDetailsPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
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
}

interface RawNearbyPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  businessStatus?: string;
  location?: { latitude?: number; longitude?: number };
  priceLevel?: string;
}

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
}

async function searchPlaces(textQuery: string): Promise<RawSearchPlace[]> {
  const res = await fetch(`${PLACES_API_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask": SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery, maxResultCount: 5 }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Places search failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { places?: RawSearchPlace[] };
  return data.places ?? [];
}

async function getPlaceDetails(
  placeId: string
): Promise<{ place: PlaceDetails; raw: RawDetailsPlace }> {
  const res = await fetch(
    `${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Places details failed (${res.status}): ${body}`);
  }

  const raw = (await res.json()) as RawDetailsPlace;
  return { place: normalizeDetails(raw), raw };
}

function normalizeDetails(raw: RawDetailsPlace): PlaceDetails {
  return {
    placeId: raw.id,
    name: raw.displayName?.text ?? null,
    formattedAddress: raw.formattedAddress ?? null,
    phone: raw.internationalPhoneNumber ?? raw.nationalPhoneNumber ?? null,
    website: raw.websiteUri ?? null,
    openingHours: raw.regularOpeningHours?.weekdayDescriptions ?? null,
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
  };
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
  maxResultCount?: number;
  /**
   * Google defaults Nearby Search to POPULARITY ranking, which can return
   * a farther-but-popular place ahead of a genuinely closer one. Callers
   * that care about real proximity (e.g. "who does this business actually
   * compete with locally") should pass "DISTANCE" explicitly.
   */
  rankPreference?: "DISTANCE" | "POPULARITY";
}): Promise<NearbyCandidate[]> {
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
  if (params.rankPreference) {
    body.rankPreference = params.rankPreference;
  }

  const res = await fetch(`${PLACES_API_BASE}/places:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask": NEARBY_SEARCH_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Places nearby search failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { places?: RawNearbyPlace[] };
  return (data.places ?? []).map(normalizeNearby);
}

/** Look up a business by name + free-form location (e.g. "Blue Bottle Coffee", "Oakland, CA"). */
export async function lookupBusiness(
  name: string,
  location: string
): Promise<PlaceLookupResult> {
  try {
    const candidates = await searchPlaces(`${name} ${location}`.trim());

    if (candidates.length === 0) {
      return { status: "no_results" };
    }

    if (candidates.length === 1) {
      const { place, raw } = await getPlaceDetails(candidates[0].id);
      return { status: "found", place, raw };
    }

    return {
      status: "multiple",
      candidates: candidates.map((c) => ({
        placeId: c.id,
        name: c.displayName?.text ?? "(unnamed listing)",
        formattedAddress: c.formattedAddress ?? null,
      })),
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/** Fetch full details for a specific place, e.g. after the caller picks one of several matches. */
export async function lookupBusinessByPlaceId(
  placeId: string
): Promise<PlaceLookupResult> {
  try {
    const { place, raw } = await getPlaceDetails(placeId);
    return { status: "found", place, raw };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
