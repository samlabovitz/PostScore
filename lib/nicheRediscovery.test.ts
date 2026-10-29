import { beforeEach, describe, expect, test, vi } from "vitest";

// Changing a business's niche: ONE competitor search for that business —
// the niche's own types (direct, up to 3 radius tiers) + ONE call for the
// ticked "also competes with" areas — at most 4 Google calls.
const nearbyCalls: Array<{ includedTypes?: string[]; radiusMeters: number }> = [];
let respond: (params: { includedTypes?: string[] }) => unknown[] = () => [];
vi.mock("@/lib/google/places", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google/places")>("@/lib/google/places");
  return {
    ...actual,
    // Competitor selection v2's Text Search finds nothing here: these
    // tests cover the Nearby Search fallback.
    searchTextCompetitors: async () => [],
    searchNearbyPlaces: async (params: { includedTypes?: string[]; radiusMeters: number }) => {
      nearbyCalls.push(params);
      return respond(params);
    },
  };
});

import { findAndScoreCompetitors, type CompetitorSourceBusiness } from "./competitors";
import { defaultAreas, nicheSearchTypes } from "./competitorScope";
import { canRunScan, MAX_CALLS_PER_SCAN, nextMonthStartUtc, placesSearchMonthlyCap } from "./placesSearchBudget";
import { runAndSaveCompetitorScanWithClient } from "@/app/actions/competitors";
import type { SupabaseClient } from "@supabase/supabase-js";

function place(id: string, primaryType: string, lat = 39.681) {
  const details = {
    placeId: id, name: id, formattedAddress: null, phone: "555", website: null, openingHours: null, openingHoursPeriods: null,
    rating: 4.5, userRatingCount: 50, categories: [primaryType], primaryCategory: primaryType, primaryType,
    location: { lat, lng: -75.75 }, businessStatus: "OPERATIONAL", googleMapsUri: null, photoCount: 5, priceLevel: null,
  };
  return { placeId: id, name: id, formattedAddress: null, types: [primaryType], primaryType, primaryTypeDisplayName: null, businessStatus: "OPERATIONAL", location: { lat, lng: -75.75 }, priceLevel: null, details };
}

// Mini Shop in Delaware: Google lists it only as "service".
const MINI_SHOP: CompetitorSourceBusiness = {
  placeId: "mini-shop", name: "Mini Shop in Delaware", address: "700 Capitol Tr, Newark, DE 19711, USA", lat: 39.68, lng: -75.75,
  primaryType: "service", categories: ["service", "point_of_interest", "establishment"], category: "Services",
  rating: 4.9, review_count: 30, phone: "555", opening_hours: null, website: null, photo_count: 8, business_status: "OPERATIONAL",
  https_status: null, website_analysis_json: null, verified_website_url: null, website_trust_overrides_json: null,
};
const TOY_SCOPE = { nicheId: "toy_hobby", parent: "specialty_store", areas: defaultAreas("toy_hobby"), mode: "auto" as const };

beforeEach(() => {
  nearbyCalls.length = 0;
  respond = () => [];
});

describe("niche-aware competitor search", () => {
  test("Mini Shop → Toy, game & hobby store: toy stores only — the retired 'also competes with' areas are never searched (Oct 29)", async () => {
    respond = (p) => (p.includedTypes?.includes("toy_store") ? [place("Toy Barn", "toy_store"), place("Game Spot", "toy_store", 39.69)] : [place("Gift Corner", "gift_shop"), place("Big Store", "department_store")]);
    const types = nicheSearchTypes(TOY_SCOPE)!;
    expect(types.directTypes).toEqual(["toy_store"]);
    expect(types.wideTypes).toEqual([]);
    const result = await findAndScoreCompetitors({ ...MINI_SHOP, niche: types }, "en");
    expect(result.status).toBe("ok");
    // Every search counts: the Text Search (v2) plus the Nearby fallback.
    expect(result.placesCalls).toBe(nearbyCalls.length + (result.textSearchCalls ?? 0));
    expect(nearbyCalls.length).toBeLessThanOrEqual(MAX_CALLS_PER_SCAN);
    // No search for gift shops or any other area type.
    expect(nearbyCalls.some((c) => c.includedTypes?.includes("gift_shop"))).toBe(false);
    expect(result.ranked.map((r) => r.name).sort()).toEqual(["Game Spot", "Mini Shop in Delaware", "Toy Barn"]);
    // Each competitor keeps its Google types, so later grouping is exact.
    expect(result.ranked.find((r) => r.name === "Toy Barn")?.listing?.categories).toEqual(["toy_store"]);
  });

  test("without a niche the search is exactly as before (a generic listing still can't be searched)", async () => {
    const result = await findAndScoreCompetitors(MINI_SHOP, "en");
    expect(result.status).toBe("category_too_generic");
    expect(nearbyCalls).toHaveLength(0);
  });

  test("a niche with no Google type of its own (skate shop) searches its parent's types; no area call when no area has types", () => {
    expect(nicheSearchTypes({ nicheId: "skate_snow", parent: "specialty_store", areas: ["specialty_store"], mode: "auto" })).toEqual({ directTypes: [], wideTypes: [] });
    expect(nicheSearchTypes({ nicheId: "specialty_store", parent: "specialty_store", areas: [], mode: "auto" })).toBeNull();
  });
});

describe("the month's cap and the 30-day cooldown", () => {
  test("cap: a scan runs only when its worst case fits; default 800, set by PLACES_SEARCH_MONTHLY_CAP", () => {
    expect(placesSearchMonthlyCap({})).toBe(800);
    expect(placesSearchMonthlyCap({ PLACES_SEARCH_MONTHLY_CAP: "900" })).toBe(900);
    // Worst case 5: the Text Search + 4 Nearby fallback calls.
    expect(canRunScan(795, 800)).toBe(true);
    expect(canRunScan(796, 800)).toBe(false);
    expect(nextMonthStartUtc(new Date("2026-10-20T12:00:00Z"))).toBe("2026-11-01T00:00:00.000Z");
  });

  const db = (latestScanAt: string | null) =>
    ({
      from: () => {
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: latestScanAt ? { created_at: latestScanAt } : null, error: null }),
          single: async () => ({ data: null, error: { message: "not needed" } }),
          then: (resolve: (v: unknown) => void) => resolve({ data: latestScanAt ? [{ created_at: latestScanAt }] : [], error: null }),
        });
        return chain;
      },
    }) as unknown as SupabaseClient;

  test("over the cap: no Google call, an honest date", async () => {
    const result = await runAndSaveCompetitorScanWithClient(db(null), "b1", { enforceCooldown: true, now: new Date("2026-10-20T12:00:00Z"), budget: async () => ({ used: 798 }), logCalls: async () => {} });
    expect(result).toEqual({ status: "capped", nextAvailableAt: "2026-11-01T00:00:00.000Z" });
    expect(nearbyCalls).toHaveLength(0);
  });

  test("within the 30-day cooldown: no Google call, the date it can run", async () => {
    const result = await runAndSaveCompetitorScanWithClient(db("2026-10-10T12:00:00Z"), "b1", { enforceCooldown: true, now: new Date("2026-10-20T12:00:00Z"), budget: async () => ({ used: 0 }), logCalls: async () => {} });
    expect(result.status).toBe("too_soon");
    expect(nearbyCalls).toHaveLength(0);
  });
});
