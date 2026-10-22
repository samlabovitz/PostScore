import { beforeEach, describe, expect, test, vi } from "vitest";

// The Umami Express bug: a takeout sushi shop (Google primary type
// "meal_takeaway") found no competitors, because nearby food places carry
// their cuisine as the primary type. Broad food types now compare with
// food places of any cuisine; too few results trigger one broader search;
// a search that didn't run is never shown as "found none".

const nearbyCalls: Array<{ includedTypes?: string[]; radiusMeters: number }> = [];
let nearbyResults: unknown[][] = [];
vi.mock("@/lib/google/places", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google/places")>("@/lib/google/places");
  return {
    ...actual,
    searchNearbyPlaces: async (params: { includedTypes?: string[]; radiusMeters: number }) => {
      nearbyCalls.push(params);
      // A wider radius includes everything nearer: repeat the last result.
      return nearbyResults[nearbyCalls.length - 1] ?? nearbyResults[nearbyResults.length - 1] ?? [];
    },
  };
});

import { BROAD_FOOD_SEARCH_TYPES, findAndScoreCompetitors, isFoodServiceType, MIN_COMPETITORS_BEFORE_BROADENING, type CompetitorSourceBusiness } from "./competitors";
import { MAX_CALLS_PER_SCAN } from "./placesSearchBudget";

const UMAMI: CompetitorSourceBusiness = {
  placeId: "umami",
  name: "Umami Express LLC Sushi to Go",
  address: "7 Chesmar Plaza, Newark, DE 19713",
  lat: 39.6619,
  lng: -75.7272,
  primaryType: "meal_takeaway",
  categories: ["meal_takeaway", "restaurant", "food", "point_of_interest", "establishment"],
  category: "Takeout Restaurant",
  rating: 4,
  review_count: 80,
  phone: "555",
  opening_hours: null,
  website: null,
  photo_count: 10,
  business_status: "OPERATIONAL",
  https_status: null,
  website_analysis_json: null,
  verified_website_url: null,
  website_trust_overrides_json: null,
};

function place(id: string, primaryType: string, opts: { lat?: number; status?: string } = {}) {
  const lat = opts.lat ?? 39.665;
  const details = {
    placeId: id, name: id, formattedAddress: null, phone: "555", website: null, openingHours: null, openingHoursPeriods: null,
    rating: 4.3, userRatingCount: 60, categories: [primaryType, "meal_takeaway", "restaurant", "food"], primaryCategory: primaryType, primaryType,
    location: { lat, lng: -75.727 }, businessStatus: opts.status ?? "OPERATIONAL", googleMapsUri: null, photoCount: 5, priceLevel: null,
  };
  return { placeId: id, name: id, formattedAddress: null, types: details.categories, primaryType, primaryTypeDisplayName: null, businessStatus: details.businessStatus, location: { lat, lng: -75.727 }, priceLevel: null, details };
}

beforeEach(() => {
  nearbyCalls.length = 0;
  nearbyResults = [];
});

describe("restaurant types get competitors", () => {
  test("meal_takeaway (an unmapped, broad primary type): searches restaurants + takeout + delivery and keeps food places of any cuisine", async () => {
    nearbyResults = [[place("sushi-1", "sushi_restaurant"), place("pizza-1", "pizza_restaurant"), place("chinese-1", "chinese_restaurant"), place("takeout-1", "meal_takeaway"), place("gym", "gym")]];
    const result = await findAndScoreCompetitors(UMAMI, "en");
    expect(nearbyCalls[0].includedTypes).toEqual(BROAD_FOOD_SEARCH_TYPES);
    const names = result.ranked.filter((r) => !r.isSubject).map((r) => r.name);
    expect(names.sort()).toEqual(["chinese-1", "pizza-1", "sushi-1", "takeout-1"]);
    expect(result.status).toBe("ok");
  });

  test("a more specific secondary type wins over a broad primary one (fall back to the listing's other types)", async () => {
    nearbyResults = [[place("sushi-1", "sushi_restaurant"), place("sushi-2", "sushi_restaurant"), place("sushi-3", "japanese_restaurant")]];
    await findAndScoreCompetitors({ ...UMAMI, categories: ["meal_takeaway", "sushi_restaurant", "restaurant", "food"] }, "en");
    expect(nearbyCalls[0].includedTypes).toEqual(["sushi_restaurant"]);
  });

  test("sushi_restaurant gets competitors; the business itself and closed places are never in its own list", async () => {
    const self = place("umami", "sushi_restaurant");
    nearbyResults = [[self, place("sushi-1", "sushi_restaurant"), place("sushi-2", "sushi_restaurant"), place("closed", "sushi_restaurant", { status: "CLOSED_PERMANENTLY" }), place("sushi-3", "sushi_restaurant")]];
    const result = await findAndScoreCompetitors({ ...UMAMI, primaryType: "sushi_restaurant", categories: ["sushi_restaurant", "restaurant"] }, "en");
    const others = result.ranked.filter((r) => !r.isSubject).map((r) => r.placeId);
    expect(others.sort()).toEqual(["sushi-1", "sushi-2", "sushi-3"]);
    expect(isFoodServiceType("meal_takeaway")).toBe(true);
    expect(isFoodServiceType("sushi_restaurant")).toBe(true);
    expect(isFoodServiceType("gym")).toBe(false);
  });
});

describe("widening", () => {
  test(`fewer than ${MIN_COMPETITORS_BEFORE_BROADENING} after every radius → one broader search (any cuisine) at the widest radius, within the per-scan call limit`, async () => {
    const niche = { directTypes: ["japanese_restaurant", "sushi_restaurant"], wideTypes: ["ramen_restaurant"] };
    // Three radius tiers find just one sushi place; the broader search finds more food places.
    nearbyResults = [[place("sushi-1", "sushi_restaurant")], [place("sushi-1", "sushi_restaurant")], [place("sushi-1", "sushi_restaurant")], [place("pizza-1", "pizza_restaurant"), place("thai-1", "thai_restaurant"), place("umami", "meal_takeaway")]];
    const result = await findAndScoreCompetitors({ ...UMAMI, niche }, "en");
    expect(nearbyCalls).toHaveLength(MAX_CALLS_PER_SCAN);
    expect(nearbyCalls[3].includedTypes).toEqual(BROAD_FOOD_SEARCH_TYPES);
    expect(nearbyCalls[3].radiusMeters).toBe(nearbyCalls[2].radiusMeters);
    expect(result.ranked.filter((r) => !r.isSubject).map((r) => r.placeId).sort()).toEqual(["pizza-1", "sushi-1", "thai-1"]);
    expect(result.searchWidened).toBe(true);
  });

  test("a donut shop with no other donut shop nearby is broadened to bakeries, dessert and coffee places", async () => {
    nearbyResults = [[], [], [], [place("bakery-1", "bakery"), place("cafe-1", "coffee_shop"), place("gym", "gym")]];
    const result = await findAndScoreCompetitors({ ...UMAMI, name: "Mochinut", primaryType: "donut_shop", categories: ["donut_shop", "food"] }, "en");
    expect(nearbyCalls[3].includedTypes).toEqual(expect.arrayContaining(["bakery", "coffee_shop", "ice_cream_shop"]));
    expect(nearbyCalls[3].includedTypes).not.toContain("donut_shop");
    expect(result.ranked.filter((r) => !r.isSubject).map((r) => r.placeId).sort()).toEqual(["bakery-1", "cafe-1"]);
  });

  test("enough after the first radius: no widening, no extra calls", async () => {
    nearbyResults = [Array.from({ length: 10 }, (_, i) => place(`s${i}`, "sushi_restaurant"))];
    await findAndScoreCompetitors({ ...UMAMI, primaryType: "sushi_restaurant", categories: ["sushi_restaurant"] }, "en");
    expect(nearbyCalls).toHaveLength(1);
  });
});
