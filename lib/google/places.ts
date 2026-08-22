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
  "primaryTypeDisplayName",
  "location",
  "businessStatus",
  "googleMapsUri",
  "photos",
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
  location: { lat: number; lng: number } | null;
  businessStatus: string | null;
  googleMapsUri: string | null;
  /** Number of photos Google has for this listing. Used by the scoring engine's photos check. */
  photoCount: number | null;
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
  primaryTypeDisplayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
  googleMapsUri?: string;
  photos?: unknown[];
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
    location:
      raw.location?.latitude != null && raw.location?.longitude != null
        ? { lat: raw.location.latitude, lng: raw.location.longitude }
        : null,
    businessStatus: raw.businessStatus ?? null,
    googleMapsUri: raw.googleMapsUri ?? null,
    photoCount: Array.isArray(raw.photos) ? raw.photos.length : null,
  };
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
