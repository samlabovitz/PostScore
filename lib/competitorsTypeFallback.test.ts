import { beforeEach, describe, expect, test, vi } from "vitest";

// The owner's PostScore business type is used for competitor search ONLY
// when every Google type on the listing is generic (the Shoe Tech case).
const nearbyCalls: Array<{ includedTypes?: string[] }> = [];
let nearbyResult: unknown[] = [];
vi.mock("@/lib/google/places", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google/places")>("@/lib/google/places");
  return {
    ...actual,
    // Competitor selection v2's Text Search finds nothing here: these
    // tests cover the Nearby Search fallback.
    searchTextCompetitors: async () => [],
    searchNearbyPlaces: async (params: { includedTypes?: string[] }) => {
      nearbyCalls.push(params);
      return nearbyResult;
    },
  };
});

import { competitorScanBlocker, findAndScoreCompetitors, type CompetitorSourceBusiness } from "./competitors";
import { bizProfileById } from "../config/bizProfiles";

const SHOE_TECH: CompetitorSourceBusiness = {
  placeId: "shoe-tech",
  name: "Shoe Tech Shoe Repair",
  address: "1 Main St",
  lat: 41.0,
  lng: -73.8,
  primaryType: "service",
  categories: ["service", "point_of_interest", "establishment"],
  category: "Services",
  rating: 4.8,
  review_count: 120,
  phone: "555",
  opening_hours: null,
  website: null,
  photo_count: 10,
  business_status: "OPERATIONAL",
  https_status: null,
  website_analysis_json: null,
  verified_website_url: null,
  website_trust_overrides_json: null,
  fallbackPlaceTypes: bizProfileById("repair_dropoff")!.placesType,
};

function place(id: string, primaryType: string, lat = 41.001) {
  const details = {
    placeId: id, name: id, formattedAddress: null, phone: "555", website: null, openingHours: null, openingHoursPeriods: null,
    rating: 4.5, userRatingCount: 50, categories: [primaryType], primaryCategory: primaryType, primaryType,
    location: { lat, lng: -73.8 }, businessStatus: "OPERATIONAL", googleMapsUri: null, photoCount: 5, priceLevel: null,
  };
  return { placeId: id, name: id, formattedAddress: null, types: [primaryType], primaryType, primaryTypeDisplayName: null, businessStatus: "OPERATIONAL", location: { lat, lng: -73.8 }, priceLevel: null, details };
}

beforeEach(() => {
  nearbyCalls.length = 0;
  nearbyResult = [];
});

describe("PostScore business type → Google place types", () => {
  test("repair_dropoff maps to Google's real 'laundry' and 'tailor' types", () => {
    expect(bizProfileById("repair_dropoff")!.placesType).toEqual(["laundry", "tailor"]);
  });

  test("blocker: generic Google types + an owner type → can search; with no owner type → still 'too general'", () => {
    expect(competitorScanBlocker(SHOE_TECH)).toBeNull();
    expect(competitorScanBlocker({ ...SHOE_TECH, fallbackPlaceTypes: null })).toBe("category_too_generic");
    expect(competitorScanBlocker({ ...SHOE_TECH, fallbackPlaceTypes: ["store"] })).toBe("category_too_generic");
  });

  test("Shoe Tech: searches the owner's types and keeps only candidates whose PRIMARY type is one of them", async () => {
    nearbyResult = [place("Clean Rite Laundry", "laundry"), place("Tony's Tailor", "tailor"), place("Corner Deli", "deli"), place("Shoe Mart", "shoe_store")];
    const result = await findAndScoreCompetitors(SHOE_TECH, "en");
    expect(nearbyCalls[0].includedTypes).toEqual(["laundry", "tailor"]);
    expect(result.status).toBe("ok");
    expect(result.ranked.filter((r) => !r.isSubject).map((r) => r.name).sort()).toEqual(["Clean Rite Laundry", "Tony's Tailor"]);
  });

  test("Google's own specific type still wins over the owner's type", async () => {
    nearbyResult = [place("Other Liquor", "liquor_store")];
    await findAndScoreCompetitors({ ...SHOE_TECH, primaryType: "liquor_store", categories: ["liquor_store", "store"] }, "en");
    expect(nearbyCalls[0].includedTypes).toContain("liquor_store");
    expect(nearbyCalls[0].includedTypes).not.toContain("laundry");
  });

  test("no owner type and only generic Google types → 'too general', no search at all", async () => {
    const result = await findAndScoreCompetitors({ ...SHOE_TECH, fallbackPlaceTypes: null }, "en");
    expect(result.status).toBe("category_too_generic");
    expect(nearbyCalls).toHaveLength(0);
  });
});
