import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// Competitor selection v2: Text Search for the customer's query first,
// Google's order in the ranking, Nearby Search only as the fallback, and
// the owner's own Remove / Add. Every Google call is mocked.

type Candidate = ReturnType<typeof place>;
const textCalls: Array<{ textQuery: string; lat: number; lng: number }> = [];
const nearbyCalls: unknown[] = [];
const detailsCalls: string[] = [];
let textResults: Candidate[] = [];
let nearbyResults: Candidate[] = [];
const detailsById = new Map<string, Candidate>();

vi.mock("@/lib/google/places", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google/places")>("@/lib/google/places");
  return {
    ...actual,
    searchTextCompetitors: async (params: { textQuery: string; lat: number; lng: number }) => {
      textCalls.push(params);
      return textResults;
    },
    searchNearbyPlaces: async (params: unknown) => {
      nearbyCalls.push(params);
      return nearbyResults;
    },
    lookupBusinessByPlaceId: async (placeId: string) => {
      detailsCalls.push(placeId);
      const c = detailsById.get(placeId);
      return c ? { status: "found", place: c.details, raw: {} } : { status: "no_results" };
    },
  };
});

import { findAndScoreCompetitors, type CompetitorSourceBusiness } from "@/lib/competitors";
import { competitorQueryNoun, competitorTextQuery, nicheNamesQuery, pluralPhrase, townStateFromAddress } from "@/lib/competitorQuery";
import { relevanceScore, selectCompetitors, type PoolEntry } from "@/lib/competitorQuality";
import { applyOverrides, overridesFromRows, scanOverrides } from "@/lib/competitorOverrides";
import { canRunScan, MAX_CALLS_PER_SCAN } from "@/lib/placesSearchBudget";
import { AddCompetitor, RemoveCompetitorButton, RemovedByOwner } from "@/app/business/[id]/competitors/CompetitorOwnerControls";

const LAT = 41.0759794;
const LNG = -73.8585374;
const MILE_LAT = 1 / 69;

/** A place, `miles` north of Hair express. */
function place(id: string, primaryType: string, opts: { miles?: number; reviews?: number; types?: string[]; status?: string } = {}) {
  const location = { lat: LAT + (opts.miles ?? 0.2) * MILE_LAT, lng: LNG };
  const types = opts.types ?? [primaryType, "point_of_interest", "service", "establishment"];
  const details = {
    placeId: id, name: id, formattedAddress: "Tarrytown, NY", phone: "555", website: null, openingHours: null, openingHoursPeriods: null,
    rating: 4.6, userRatingCount: opts.reviews ?? 50, categories: types, primaryCategory: primaryType, primaryType,
    location, businessStatus: opts.status ?? "OPERATIONAL", googleMapsUri: null, photoCount: 5, priceLevel: null,
  };
  return { placeId: id, name: id, formattedAddress: "Tarrytown, NY", types, primaryType, primaryTypeDisplayName: null, businessStatus: opts.status ?? "OPERATIONAL", location, priceLevel: null, details };
}

const HAIR_EXPRESS: CompetitorSourceBusiness = {
  placeId: "hair-express",
  name: "Hair express on Broadway",
  address: "9 S Broadway, Tarrytown, NY 10591, USA",
  lat: LAT,
  lng: LNG,
  primaryType: "hair_salon",
  categories: ["hair_salon", "hair_care", "point_of_interest", "service", "establishment"],
  category: "Hair Salon",
  rating: 5,
  review_count: 30,
  phone: "555",
  opening_hours: null,
  website: null,
  photo_count: 10,
  business_status: "OPERATIONAL",
  https_status: null,
  website_analysis_json: null,
  verified_website_url: null,
  website_trust_overrides_json: null,
  // The owner's saved niche: "Hair salon" (Google type hair_salon).
  niche: { directTypes: ["hair_salon"], wideTypes: [] },
  queryNiche: { labelEn: "Hair salon", parent: "salon" },
};

beforeEach(() => {
  textCalls.length = 0;
  nearbyCalls.length = 0;
  detailsCalls.length = 0;
  textResults = [];
  nearbyResults = [];
  detailsById.clear();
});

describe("the customer's query", () => {
  test("{niche plural} in {town}, {state}", () => {
    expect(competitorTextQuery({ nicheLabelEn: "Hair salon", nicheParent: "salon", address: "9 S Broadway, Tarrytown, NY 10591, USA" })).toBe("hair salons in Tarrytown, NY");
    expect(competitorTextQuery({ nicheLabelEn: "Skate & snow shop", nicheParent: "specialty_store", address: "54 E Main St, Newark, DE 19711, USA" })).toBe("skate & snow shops in Newark, DE");
    expect(competitorTextQuery({ nicheLabelEn: "Bakery", nicheParent: "bakery", address: "306 Main St, Clayton, DE 19938, USA" })).toBe("bakeries in Clayton, DE");
    expect(competitorTextQuery({ nicheLabelEn: "Deli", nicheParent: "restaurant", address: "23 Beekman Ave, Sleepy Hollow, NY 10591, USA" })).toBe("delis in Sleepy Hollow, NY");
  });

  test("food niches named by cuisine get 'restaurants'; 'A / B' labels use the last", () => {
    expect(competitorQueryNoun({ nicheLabelEn: "Japanese & sushi", nicheParent: "restaurant" })).toBe("japanese & sushi restaurants");
    expect(competitorQueryNoun({ nicheLabelEn: "Café / Coffee Shop", nicheParent: "cafe" })).toBe("coffee shops");
  });

  test("no niche: Google's primary type label; generic only → no query (Nearby Search as before)", () => {
    expect(competitorQueryNoun({ primaryType: "ice_cream_shop" })).toBe("ice cream shops");
    expect(competitorQueryNoun({ primaryType: "meal_takeaway" })).toBe("restaurants");
    expect(competitorQueryNoun({ primaryType: "service" })).toBeNull();
    expect(competitorTextQuery({ primaryType: "hair_salon", address: null })).toBeNull();
  });

  test("a 'general' niche guess never names the query (the real Main Street Sweets case)", () => {
    expect(nicheNamesQuery({ source: "detected", confidence: "general" })).toBe(false);
    expect(nicheNamesQuery({ source: "detected", confidence: "keyword" })).toBe(true);
    expect(nicheNamesQuery({ source: "owner", confidence: "saved" })).toBe(true);
  });

  test("plurals and towns", () => {
    expect(pluralPhrase("candy & chocolate shop")).toBe("candy & chocolate shops");
    expect(pluralPhrase("sandwich")).toBe("sandwiches");
    expect(townStateFromAddress("141 E 56th St, New York, NY 10022, USA")).toEqual({ town: "New York", state: "NY" });
    expect(townStateFromAddress("10 Calle Mayor, Madrid, Spain")).toEqual({ town: "Madrid", state: null });
  });
});

describe("Text Search first, Nearby Search only as the fallback", () => {
  test("5+ of the same kind from Text Search → no Nearby call; the query and a bias around the business", async () => {
    textResults = ["a", "b", "c", "d", "e"].map((id) => place(id, "hair_salon"));
    const result = await findAndScoreCompetitors(HAIR_EXPRESS, "en");
    expect(textCalls).toEqual([expect.objectContaining({ textQuery: "hair salons in Tarrytown, NY", lat: LAT, lng: LNG })]);
    expect(nearbyCalls).toHaveLength(0);
    expect(result.placesCalls).toBe(1);
    expect(result.textSearchCalls).toBe(1);
    expect(result.ranked.filter((r) => !r.isSubject)).toHaveLength(5);
  });

  test("fewer than 5 of the same kind → the Nearby Search fallback runs, within the per-scan limit", async () => {
    textResults = [place("a", "hair_salon"), place("nail", "nail_salon"), place("gym", "gym")];
    nearbyResults = ["n1", "n2", "n3", "n4", "n5", "n6"].map((id) => place(id, "hair_salon", { miles: 0.5 }));
    const result = await findAndScoreCompetitors(HAIR_EXPRESS, "en");
    expect(nearbyCalls.length).toBeGreaterThan(0);
    expect(result.placesCalls!).toBeLessThanOrEqual(MAX_CALLS_PER_SCAN);
    expect(result.ranked.map((r) => r.placeId)).toContain("a");
    expect(result.ranked.map((r) => r.placeId)).not.toContain("nail");
  });

  test("the monthly cap allows a scan only when its worst case (5) fits", () => {
    expect(canRunScan(795, 800)).toBe(true);
    expect(canRunScan(796, 800)).toBe(false);
  });

  test("the real Hair express case: 'beauty_salon' salons count for a hair-salon niche; a nail spa tagged hair_salon doesn't", async () => {
    textResults = [
      place("beyond", "hair_salon"),
      place("ildas", "beauty_salon", { reviews: 73 }),
      place("eclipse", "beauty_salon", { reviews: 82 }),
      place("new-karma", "beauty_salon", { reviews: 15 }),
      place("angela", "hair_salon", { reviews: 91 }),
      place("tatiana", "hair_salon", { miles: 1.8, reviews: 95, types: ["hair_salon", "nail_salon", "massage_spa", "spa"] }),
    ];
    const picked = (await findAndScoreCompetitors(HAIR_EXPRESS, "en")).ranked.map((r) => r.placeId);
    expect(picked).toEqual(expect.arrayContaining(["ildas", "eclipse", "new-karma", "angela", "beyond"]));
    expect(picked).not.toContain("tatiana");
  });

  test("still: never the business itself, never closed, never past 15 miles, never more than 10", async () => {
    textResults = [
      place("hair-express", "hair_salon"),
      place("closed", "hair_salon", { status: "CLOSED_PERMANENTLY" }),
      place("far", "hair_salon", { miles: 16 }),
      ...Array.from({ length: 14 }, (_, i) => place(`s${i}`, "hair_salon", { miles: 0.1 * (i + 1) })),
    ];
    const others = (await findAndScoreCompetitors(HAIR_EXPRESS, "en")).ranked.filter((r) => !r.isSubject).map((r) => r.placeId);
    expect(others).toHaveLength(10);
    expect(others).not.toContain("hair-express");
    expect(others).not.toContain("closed");
    expect(others).not.toContain("far");
  });
});

describe("ranking: Google's order with reviews and distance", () => {
  const entry = (id: string, textRank: number | undefined, miles: number, reviews: number): PoolEntry => {
    const c = place(id, "hair_salon", { miles, reviews });
    return { candidate: c as never, distanceMeters: miles * 1609.34, textRank };
  };

  test("Google's first result beats a nearer place far down the list; reviews and distance still count", () => {
    expect(relevanceScore(entry("first", 0, 1.5, 40))).toBeGreaterThan(relevanceScore(entry("nearer", 18, 0.2, 40)));
    expect(relevanceScore(entry("busy", 5, 1, 900))).toBeGreaterThan(relevanceScore(entry("quiet", 5, 1, 6)));
    expect(relevanceScore(entry("near", 5, 0.2, 40))).toBeGreaterThan(relevanceScore(entry("far", 5, 8, 40)));
  });

  test("established first; among them the most relevant are kept when there are more than 10", () => {
    const pool = [
      ...Array.from({ length: 12 }, (_, i) => entry(`g${i}`, i, 2, 50)),
      entry("new", 0, 0.1, 2),
    ];
    const kept = selectCompetitors(pool, 10).map((p) => p.candidate.placeId);
    expect(kept).toHaveLength(10);
    expect(kept).not.toContain("new");
    expect(kept).not.toContain("g11");
    expect(kept).toContain("g0");
  });

  test("without Text Search (no textRank anywhere): nearest first, exactly as before", () => {
    const pool = Array.from({ length: 12 }, (_, i) => entry(`n${i}`, undefined, 12 - i, 50));
    expect(selectCompetitors(pool, 10).map((p) => p.candidate.placeId)).not.toContain("n0");
  });
});

describe("the owner's Remove and Add", () => {
  test("a removed place is never picked again — not ranked, not under Also nearby", async () => {
    textResults = [...["a", "b", "c", "d", "e", "f"].map((id) => place(id, "hair_salon")), place("tiny", "hair_salon", { reviews: 1 })];
    const result = await findAndScoreCompetitors({ ...HAIR_EXPRESS, ownerOverrides: { removed: ["b", "tiny"], added: [] } }, "en");
    expect(result.ranked.map((r) => r.placeId)).not.toContain("b");
    expect((result.alsoNearby ?? []).map((l) => l.placeId)).not.toContain("tiny");
  });

  test("an added place the searches missed: one Details call, then kept", async () => {
    textResults = ["a", "b", "c", "d", "e"].map((id) => place(id, "hair_salon"));
    detailsById.set("barber", place("barber", "barber_shop", { miles: 0.3 }));
    const result = await findAndScoreCompetitors({ ...HAIR_EXPRESS, ownerOverrides: { removed: [], added: ["barber"] } }, "en");
    expect(detailsCalls).toEqual(["barber"]);
    expect(result.detailsCalls).toBe(1);
    expect(result.ranked.map((r) => r.placeId)).toContain("barber");
  });

  test("an added place the search already returned costs no Details call", async () => {
    textResults = [...["a", "b", "c", "d", "e"].map((id) => place(id, "hair_salon")), place("barber", "barber_shop")];
    const result = await findAndScoreCompetitors({ ...HAIR_EXPRESS, ownerOverrides: { removed: [], added: ["barber"] } }, "en");
    expect(detailsCalls).toEqual([]);
    expect(result.ranked.map((r) => r.placeId)).toContain("barber");
  });

  test("the saved list as shown: removed ones gone, added ones labeled, the owner's own row untouched", () => {
    const overrides = overridesFromRows([
      { place_id: "b", action: "removed", reason: "closed", name: "B", created_at: "2026-10-28" },
      { place_id: "c", action: "added", reason: null, name: "C", created_at: "2026-10-28" },
      { place_id: "x", action: "bogus" },
    ]);
    expect(scanOverrides(overrides)).toEqual({ removed: ["b"], added: ["c"] });
    const entry = (placeId: string, isSubject = false) => ({ placeId, isSubject, name: placeId }) as never;
    const shown = applyOverrides({ scanId: "s", createdAt: "2026-10-28", entries: [entry("me", true), entry("a"), entry("b"), entry("c")] }, overrides);
    expect(shown.entries.map((e) => e.placeId)).toEqual(["me", "a", "c"]);
    expect(shown.entries.find((e) => e.placeId === "c")?.ownerAdded).toBe(true);
  });

  test("Remove, Removed by you and Add a competitor (EN + ES)", () => {
    const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);
    expect(wrap(<RemoveCompetitorButton businessId="b1" placeId="p" name="P" />)).toContain(">Remove<");
    const removed = wrap(<RemovedByOwner businessId="b1" removed={[{ placeId: "p", action: "removed", reason: "not_competitor", name: "Tatiana Day Spa", createdAt: "" }]} />);
    expect(removed).toContain("Removed by you");
    expect(removed).toContain("Not really a competitor");
    expect(removed).toContain("Restore");
    expect(wrap(<RemovedByOwner businessId="b1" removed={[{ placeId: "p", action: "removed", reason: "closed", name: "X", createdAt: "" }]} />, "es")).toContain("Quitados por usted");
    expect(wrap(<AddCompetitor businessId="b1" />)).toContain("Add a competitor");
    expect(wrap(<AddCompetitor businessId="b1" />, "es")).toContain("Agregar un competidor");
  });
});

// ---------------------------------------------------------------------------
// The pending v2 fixes: chains and own brand, practice type, same-kind
// fallback — and the Competitors page's niche groups (the real "#1 of 5").
// ---------------------------------------------------------------------------
import { domainKey, nameKey, onePerBrand, sameBrand } from "@/lib/competitorChains";
import { nicheScanFields, practiceFromWebsite } from "@/lib/competitorNicheRule";
import { applyScope, groupCompetitors } from "@/lib/competitorScope";

function withSite<T extends Candidate>(c: T, name: string, website: string | null): T {
  return { ...c, name, details: { ...c.details, name, website } };
}

describe("one location per chain, never the business's own brand", () => {
  test("brand keys and same-brand rules", () => {
    expect(nameKey("Drybar - Hell's Kitchen")).toBe("drybar");
    expect(nameKey("Uni K Wax Studio | Midtown East")).toBe("uni k wax studio");
    expect(sameBrand({ name: "GS Blow Dry Bar Midtown New York City" }, { name: "GS Blow Dry Bar - Garment District, Bryant Park NYC" })).toBe(true);
    expect(sameBrand({ name: "Blo Blow Dry Bar East 64th Street", website: "https://blomedry.com/locations/e64" }, { name: "Blo Blow Dry Bar Amsterdam", website: "https://www.blomedry.com/amsterdam" })).toBe(true);
    expect(sameBrand({ name: "Carvel" }, { name: "Carvel" })).toBe(true);
    // Not a chain: a shared booking site, or one shared word.
    expect(domainKey("https://hair-salon.square.site")).toBeNull();
    expect(sameBrand({ name: "Hair Bar", website: "https://a.square.site" }, { name: "Hair Studio", website: "https://b.square.site" })).toBe(false);
    expect(sameBrand({ name: "Hair On The Hudson" }, { name: "Hair and Makeup Lounge by Angela" })).toBe(false);
  });

  test("own brand out, one per chain (the most relevant), owner-added always kept", () => {
    const items = [
      { name: "Drybar - Thompson Central Park", website: "https://www.drybarshops.com/x", rank: 9 },
      { name: "GS Blow Dry Bar Midtown", website: null, rank: 1 },
      { name: "GS Blow Dry Bar - Garment District", website: null, rank: 4 },
      { name: "Silk Blowout Bar", website: null, rank: 3 },
      { name: "GS Blow Dry Bar Soho", website: null, rank: 12, ownerAdded: true },
    ];
    const out = onePerBrand(items, (i) => i, { name: "Drybar - Midtown East", website: "https://www.drybarshops.com/service/locator" }, (a, b) => a.rank - b.rank);
    expect(out.kept.map((i) => i.name).sort()).toEqual(["GS Blow Dry Bar Midtown", "GS Blow Dry Bar Soho", "Silk Blowout Bar"].sort());
    expect(out.ownBrand.map((i) => i.name)).toEqual(["Drybar - Thompson Central Park"]);
    expect(out.sameChain.map((i) => i.name)).toEqual(["GS Blow Dry Bar - Garment District"]);
  });

  test("in a scan: four Carvels become one", async () => {
    textResults = [
      withSite(place("c1", "ice_cream_shop", { miles: 0.6 }), "Carvel", "https://www.carvel.com/stores/1"),
      withSite(place("c2", "ice_cream_shop", { miles: 2.6 }), "Carvel", "https://www.carvel.com/stores/2"),
      withSite(place("c3", "ice_cream_shop", { miles: 4.6 }), "Carvel", null),
      withSite(place("i1", "ice_cream_shop", { miles: 0.5 }), "I SCREAM", null),
      withSite(place("v1", "ice_cream_shop", { miles: 4.5 }), "Village Creamery & Sweet Shop", null),
      withSite(place("p1", "ice_cream_shop", { miles: 3.2 }), "Piermont Creamery", null),
    ];
    const sweets = { ...HAIR_EXPRESS, name: "Main Street Sweets", primaryType: "ice_cream_shop", categories: ["ice_cream_shop"], niche: null, queryNiche: null };
    const names = (await findAndScoreCompetitors(sweets, "en")).ranked.filter((r) => !r.isSubject).map((r) => r.name);
    expect(names.filter((n) => n === "Carvel")).toHaveLength(1);
  });
});

describe("practice type for professional services", () => {
  test("the practice from the website address (the real Gregg L. Smith case) and the query", () => {
    expect(practiceFromWebsite("http://glscrimlaw.com/", "lawyer")).toBe("criminal_defense");
    expect(practiceFromWebsite("https://smithinjurylaw.com", "lawyer")).toBe("personal_injury");
    expect(practiceFromWebsite("https://smithlaw.com", "lawyer")).toBeNull();
    expect(practiceFromWebsite("http://glscrimlaw.com/", "salon")).toBeNull();
    const fields = nicheScanFields({ nicheId: "lawyer", parent: "lawyer", source: "detected", confidence: "general" }, null, "http://glscrimlaw.com/");
    expect(fields.queryNiche).toEqual({ labelEn: "Criminal defense", parent: "lawyer" });
    expect(fields.nicheRule).toMatchObject({ nicheId: "criminal_defense", professional: true });
    expect(competitorTextQuery({ nicheLabelEn: "Criminal defense", nicheParent: "lawyer", address: "205 W Randolph St #610, Chicago, IL 60606, USA" })).toBe("criminal defense lawyers in Chicago, IL");
    expect(competitorQueryNoun({ nicheLabelEn: "Personal injury law", nicheParent: "lawyer" })).toBe("personal injury lawyers");
  });

  test("a firm whose name says a different practice is left out; one that doesn't say stays", async () => {
    const lawyer = (id: string, name: string) => withSite(place(id, "lawyer", { reviews: 100 }), name, null);
    textResults = [
      lawyer("a", "Law Offices of Hal M. Garfinkel LLC | Chicago Criminal Attorney"),
      lawyer("b", "Briskman Briskman & Greenberg Personal Injury & Car Accident Lawyers"),
      lawyer("c", "Harris Tax Law"),
      lawyer("d", "Malman Law"),
      lawyer("e", "KS Law Group LLC"),
      lawyer("f", "Eames Law Group"),
    ];
    const gregg = {
      ...HAIR_EXPRESS, name: "Law Offices of Gregg L. Smith", primaryType: "lawyer", categories: ["lawyer"], address: "205 W Randolph St #610, Chicago, IL 60606, USA", niche: null,
      ...nicheScanFields({ nicheId: "lawyer", parent: "lawyer", source: "detected", confidence: "general" }, null, "http://glscrimlaw.com/"),
    };
    const result = await findAndScoreCompetitors(gregg, "en");
    expect(textCalls[0].textQuery).toBe("criminal defense lawyers in Chicago, IL");
    const names = result.ranked.filter((r) => !r.isSubject).map((r) => r.placeId);
    expect(names).toEqual(expect.arrayContaining(["a", "d", "e", "f"]));
    expect(names).not.toContain("b");
  });
});

describe("same-kind fallback for a niche with no Google type of its own", () => {
  test("Switch Skate & Snow: Nearby's 'sporting goods' pool and saddlery stores don't count; skate shops and Google's #1 for the query do", async () => {
    const shop = (id: string, name: string, type = "sporting_goods_store") => withSite(place(id, type, { reviews: 40 }), name, null);
    textResults = [shop("ski-bum", "The Ski Bum")];
    nearbyResults = [shop("pool", "Leslie's Pool Supplies"), shop("saddle", "Fair Hill Saddlery"), shop("zumiez", "Zumiez Skate Shop", "clothing_store"), shop("hockey", "R&M Hockey Supply")];
    const fields = nicheScanFields({ nicheId: "skate_snow", parent: "specialty_store", source: "detected", confidence: "keyword" }, { areas: [] }, null);
    const switchShop = { ...HAIR_EXPRESS, name: "Switch Skate & Snow", primaryType: "sporting_goods_store", categories: ["sporting_goods_store"], address: "54 E Main St, Newark, DE 19711, USA", niche: null, ...fields };
    const ids = (await findAndScoreCompetitors(switchShop, "en")).ranked.filter((r) => !r.isSubject).map((r) => r.placeId);
    expect(ids).toEqual(expect.arrayContaining(["ski-bum", "zumiez"]));
    expect(ids).not.toContain("pool");
    expect(ids).not.toContain("saddle");
  });
});

describe("the Competitors page's niche groups (the real Hair express '#1 of 5')", () => {
  test("salons Google lists as beauty_salon, and names with 'makeup' or 'nails', are direct hair-salon competitors by their types", () => {
    const e = (name: string, types: string[], total: number) => ({ placeId: name, name, isSubject: false, types, total }) as never;
    const scan = {
      scanId: "s",
      createdAt: "2026-10-29",
      entries: [
        { placeId: "me", name: "Hair express on Broadway", isSubject: true, total: 80 } as never,
        e("Hair and Makeup Lounge by Angela", ["hair_salon", "point_of_interest", "hair_care"], 92),
        e("Ilda's Salon", ["beauty_salon", "point_of_interest", "service"], 90),
        e("Eclipse Hair Body Nails", ["beauty_salon", "point_of_interest"], 88),
        e("Beyond Beauty Salon", ["hair_salon", "hair_care"], 77),
        e("Tatiana Day Spa", ["hair_salon", "nail_salon", "massage_spa", "spa"], 95),
      ],
    };
    const scope = { nicheId: "hair_salon", parent: "salon", areas: ["barbershop", "blowout_bar"], mode: "auto" as const };
    const groups = groupCompetitors(scan.entries, scope);
    expect(groups.direct.map((x) => x.name)).toEqual(["Hair and Makeup Lounge by Angela", "Ilda's Salon", "Eclipse Hair Body Nails", "Beyond Beauty Salon"]);
    // Ranked against the whole saved list now; the scan itself left Tatiana out.
    expect(applyScope(scan as never, scope).scan.entries).toHaveLength(scan.entries.length);
  });
});
