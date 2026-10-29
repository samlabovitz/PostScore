import { beforeEach, describe, expect, test, vi } from "vitest";
import fs from "node:fs";

// Day 19: competitor quality, not just type. The real Kee's Cookies &
// Cupcakes case (Clayton, DE): four bakeries, every one with 0 reviews —
// home bakers and a Food Lion bakery counter — so "#1 of 5" meant nothing.

type Call = { includedTypes?: string[]; includedPrimaryTypes?: string[]; radiusMeters: number; rankPreference?: string };
const nearbyCalls: Call[] = [];
let respond: (call: Call, index: number) => unknown[] = () => [];
vi.mock("@/lib/google/places", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google/places")>("@/lib/google/places");
  return {
    ...actual,
    // Competitor selection v2's Text Search finds nothing here: these
    // tests cover the Nearby Search fallback.
    searchTextCompetitors: async () => [],
    searchNearbyPlaces: async (params: Call) => {
      nearbyCalls.push(params);
      return respond(params, nearbyCalls.length - 1);
    },
  };
});

import { findAndScoreCompetitors, MAX_COMPETITORS, type CompetitorSourceBusiness } from "./competitors";
import { ESTABLISHED_MIN_REVIEWS, hasFewReviews, isDepartmentListing, isEstablishedListing, MIN_ESTABLISHED_COMPETITORS, selectCompetitors, SMALL_SAMPLE_BELOW } from "./competitorQuality";
import { MAX_CALLS_PER_SCAN } from "./placesSearchBudget";
import { SMALL_TOWN_RADIUS_MILES } from "./competitorScanPolicy";

const KEES: CompetitorSourceBusiness = {
  placeId: "kees",
  name: "Kee's Cookies & Cupcakes",
  address: "306 Main St, Clayton, DE 19938, USA",
  lat: 39.290942,
  lng: -75.6336062,
  primaryType: "bakery",
  categories: ["bakery", "food_store", "store", "point_of_interest", "food", "establishment"],
  category: "Bakery",
  rating: 4.7,
  review_count: 123,
  phone: "555",
  opening_hours: null,
  website: "https://keesbakeshop.com/",
  photo_count: 10,
  business_status: "OPERATIONAL",
  https_status: null,
  website_analysis_json: null,
  verified_website_url: null,
  website_trust_overrides_json: null,
};

/** A listing `miles` north of Kee's, with `reviews` Google reviews. */
function place(id: string, primaryType: string, miles: number, reviews: number, opts: { name?: string; types?: string[]; website?: string | null; status?: string } = {}) {
  const lat = KEES.lat! + miles / 69;
  const status = opts.status ?? "OPERATIONAL";
  const types = opts.types ?? [primaryType, "food", "point_of_interest", "establishment"];
  const details = {
    placeId: id, name: opts.name ?? id, formattedAddress: null, phone: "555", website: opts.website ?? null, openingHours: null, openingHoursPeriods: null,
    rating: reviews > 0 ? 4.5 : null, userRatingCount: reviews, categories: types, primaryCategory: primaryType, primaryType,
    location: { lat, lng: KEES.lng! }, businessStatus: status, googleMapsUri: null, photoCount: 3, priceLevel: null,
  };
  return { placeId: id, name: details.name, formattedAddress: null, types, primaryType, primaryTypeDisplayName: null, businessStatus: status, location: { lat, lng: KEES.lng! }, priceLevel: null, details };
}

// Kee's real saved four (0 reviews each) — within 5 miles.
const KEES_NEARBY = [
  place("food-lion-bakery", "bakery", 2.4, 0, { name: "Food Lion Bakery", website: "https://foodlion.com/groceries/bread-bakery/bakery-cakes-cupcakes.html" }),
  place("malaysias", "bakery", 2.8, 0, { name: "Malaysia's bakery" }),
  place("beulah", "bakery", 3.3, 0, { name: "Beulah Bakery" }),
  place("kathys", "bakery", 5.0, 0, { name: "Kathy's Crusty Creations" }),
];

beforeEach(() => {
  nearbyCalls.length = 0;
  respond = () => [];
});

describe("which listings are established", () => {
  test("open with 5+ reviews; 'few or no reviews yet' below that", () => {
    expect(ESTABLISHED_MIN_REVIEWS).toBe(5);
    expect(isEstablishedListing(place("a", "bakery", 1, 5) as never)).toBe(true);
    expect(isEstablishedListing(place("a", "bakery", 1, 4) as never)).toBe(false);
    expect(isEstablishedListing(place("a", "bakery", 1, 80, { status: "CLOSED_TEMPORARILY" }) as never)).toBe(false);
    expect(hasFewReviews(0)).toBe(true);
    expect(hasFewReviews(null)).toBe(true);
    expect(hasFewReviews(12)).toBe(false);
  });

  test("department counters: a big store's department, a host-store type, or a chain's own website", () => {
    expect(isDepartmentListing(place("x", "bakery", 1, 0, { name: "Food Lion Bakery" }) as never)).toBe(true);
    expect(isDepartmentListing(place("x", "pharmacy", 1, 40, { name: "Walmart Pharmacy" }) as never)).toBe(true);
    expect(isDepartmentListing(place("x", "bakery", 1, 9, { name: "Bakery", types: ["bakery", "supermarket"] }) as never)).toBe(true);
    expect(isDepartmentListing(place("x", "bakery", 1, 9, { name: "Store Bakery", website: "https://www.giantfood.com/stores/123" }) as never)).toBe(true);
    // Standalone shops are not.
    for (const name of ["Kathy's Crusty Creations", "Giant Cookie Co", "Target Practice Archery", "Sweet Cakes Bakery"]) {
      expect(isDepartmentListing(place("x", "bakery", 1, 9, { name }) as never), name).toBe(false);
    }
  });
});

describe("selection: established standalone shops first", () => {
  test("an established bakery farther away beats a closer one with no reviews", () => {
    const pool = [
      { candidate: place("near-new", "bakery", 0.5, 0) as never, distanceMeters: 800 },
      ...Array.from({ length: 6 }, (_, i) => ({ candidate: place(`est-${i}`, "bakery", 3 + i, 40) as never, distanceMeters: 5000 + i * 1000 })),
    ];
    const picked = selectCompetitors(pool, MAX_COMPETITORS).map((p) => p.candidate.placeId);
    expect(picked).not.toContain("near-new");
    expect(picked).toHaveLength(6);
  });

  test("the same kind before the broader family; listings with few reviews only fill a small sample; counters last", () => {
    const pool = [
      { candidate: place("cafe", "cafe", 1, 90) as never, distanceMeters: 1000, broader: true },
      { candidate: place("bakery", "bakery", 9, 30) as never, distanceMeters: 15000 },
      { candidate: place("home-baker", "bakery", 2, 0) as never, distanceMeters: 3000 },
      { candidate: place("food-lion", "bakery", 0.5, 120, { name: "Food Lion Bakery" }) as never, distanceMeters: 600 },
      { candidate: place("home-2", "bakery", 3, 1) as never, distanceMeters: 4500 },
      { candidate: place("home-3", "bakery", 4, 2) as never, distanceMeters: 6000 },
    ];
    const picked = selectCompetitors(pool, MAX_COMPETITORS).map((p) => p.candidate.placeId);
    // 2 established standalone → fill to SMALL_SAMPLE_BELOW with the few-review ones; the counter isn't needed.
    expect(SMALL_SAMPLE_BELOW).toBe(5);
    expect(picked).toHaveLength(5);
    expect(picked).toEqual(expect.arrayContaining(["cafe", "bakery", "home-baker", "home-2", "home-3"]));
    expect(picked).not.toContain("food-lion");
    // Only when standalone shops run out does a counter come in.
    const few = selectCompetitors(pool.filter((p) => !String((p.candidate as { placeId: string }).placeId).startsWith("home")), MAX_COMPETITORS).map((p) => p.candidate.placeId);
    expect(few).toEqual(expect.arrayContaining(["food-lion"]));
  });
});

describe("other kinds only round out a small sample, closest kin first", () => {
  test("3 bakeries + a dessert shop + coffee chains → the bakeries, then the dessert shop and a café — never a list padded with coffee chains", () => {
    const kin = ["bakery", "cake_shop", "dessert_shop", "donut_shop", "confectionery", "chocolate_shop", "candy_store", "bagel_shop", "ice_cream_shop", "cafe", "coffee_shop"];
    const broad = (id: string, type: string, mi: number, reviews: number) => ({ candidate: place(id, type, mi, reviews) as never, distanceMeters: mi * 1609, broader: true, kin: kin.indexOf(type) });
    const pool = [
      ...["la-baguette", "bavarian", "sweet-melissa"].map((id, i) => ({ candidate: place(id, "bakery", 11 + i, 700) as never, distanceMeters: (11 + i) * 1609 })),
      broad("starbucks-1", "coffee_shop", 2.1, 222),
      broad("starbucks-2", "coffee_shop", 8.1, 931),
      broad("dunkin", "coffee_shop", 10.3, 460),
      broad("panera", "cafe", 9.9, 1398),
      broad("crumbl", "dessert_shop", 10.7, 1806),
    ];
    const picked = selectCompetitors(pool, MAX_COMPETITORS).map((p) => (p.candidate as { placeId: string }).placeId);
    expect(picked.sort()).toEqual(["bavarian", "crumbl", "la-baguette", "panera", "sweet-melissa"]);
  });

  test("enough of the same kind → no other kinds at all", () => {
    const pool = [
      ...Array.from({ length: 7 }, (_, i) => ({ candidate: place(`bakery-${i}`, "bakery", 1 + i, 50) as never, distanceMeters: (1 + i) * 1609 })),
      { candidate: place("cafe", "cafe", 0.5, 900) as never, distanceMeters: 800, broader: true, kin: 9 },
    ];
    const picked = selectCompetitors(pool, MAX_COMPETITORS).map((p) => (p.candidate as { placeId: string }).placeId);
    expect(picked).toHaveLength(7);
    expect(picked).not.toContain("cafe");
  });
});

describe("Kee's: small-town widening", () => {
  test("only 0-review bakeries within 5 mi → ONE search out to 15 mi, most popular first, for bakeries AND cake/dessert/donut shops and cafés", async () => {
    respond = (call, i) => (i < 3 ? KEES_NEARBY.filter((p) => (p.details.location.lat - KEES.lat!) * 69 * 1609.34 <= call.radiusMeters) : [
      place("dover-bakery", "bakery", 11, 210, { name: "Dover Bakery" }),
      place("cupcake-co", "cake_shop", 8, 95, { name: "Smyrna Cupcake Co" }),
      place("cookie-shop", "dessert_shop", 12, 60, { name: "Cookie Shop Middletown" }),
      place("coffee", "cafe", 7, 300, { name: "Main St Coffee" }),
      place("tire", "car_repair", 3, 500, { name: "Tire Shop" }),
      ...KEES_NEARBY,
    ]);
    const result = await findAndScoreCompetitors(KEES, "en");
    expect(nearbyCalls.length).toBeLessThanOrEqual(MAX_CALLS_PER_SCAN);
    const far = nearbyCalls[3];
    expect(far.radiusMeters).toBeCloseTo(SMALL_TOWN_RADIUS_MILES * 1609.34, 0);
    expect(far.rankPreference).toBe("POPULARITY");
    expect(far.includedPrimaryTypes).toEqual(expect.arrayContaining(["bakery", "cake_shop", "dessert_shop", "cafe", "donut_shop"]));
    const names = result.ranked.filter((r) => !r.isSubject).map((r) => r.name);
    // Established ones first; the 0-review bakeries only fill up to a sample of 5; the Food Lion counter not at all.
    expect(names.slice(0, 4).sort()).toEqual(["Cookie Shop Middletown", "Dover Bakery", "Main St Coffee", "Smyrna Cupcake Co"].sort());
    expect(names).toHaveLength(5);
    expect(names).not.toContain("Food Lion Bakery");
    expect(names).not.toContain("Tire Shop");
    expect(result.searchWidened).toBe(true);
  });

  test("enough established nearby: no small-town search", async () => {
    respond = () => Array.from({ length: 12 }, (_, i) => place(`b${i}`, "bakery", 0.2 + i * 0.1, 30));
    await findAndScoreCompetitors(KEES, "en");
    expect(nearbyCalls).toHaveLength(1);
  });

  test(`fewer than ${MIN_ESTABLISHED_COMPETITORS} established is what triggers it; a full page widens by popularity, not by repeating the nearest`, async () => {
    // 20 nearest within 1.5 mi, all brand-new listings → the next tier asks for the most popular.
    respond = (_call, i) => (i === 0 ? Array.from({ length: 20 }, (_, k) => place(`new${k}`, "bakery", 0.1 + k * 0.05, 0)) : [place("popular", "bakery", 2.5, 400)]);
    await findAndScoreCompetitors(KEES, "en");
    expect(nearbyCalls[0].rankPreference).toBe("DISTANCE");
    expect(nearbyCalls[1].rankPreference).toBe("POPULARITY");
  });

  test("every business type: the same rules apply to a hair salon", async () => {
    const salon = { ...KEES, placeId: "salon", name: "Shear Joy", primaryType: "hair_salon", categories: ["hair_salon", "beauty_salon"], category: "Hair salon" };
    respond = (_call, i) => (i < 3 ? [place("new-salon", "hair_salon", 1, 0)] : [place("big-salon", "hair_salon", 9, 150), place("other-salon", "beauty_salon", 10, 80), place("third", "hair_salon", 12, 40)]);
    const result = await findAndScoreCompetitors(salon, "en");
    expect(nearbyCalls).toHaveLength(4);
    const names = result.ranked.filter((r) => !r.isSubject).map((r) => r.name);
    expect(names.slice(0, 3).sort()).toEqual(["big-salon", "other-salon", "third"]);
  });
});

describe("honest labels", () => {
  test("every competitor shows its distance; few-review ones are tagged (EN + ES)", () => {
    const view = fs.readFileSync("app/business/[id]/competitors/CompetitorsView.tsx", "utf8");
    expect(view).toContain("{!entry.isSubject && entry.distanceMeters !== null && (");
    expect(view).toContain("{!entry.isSubject && hasFewReviews(entry.reviewCount) && (");
    const messages = fs.readFileSync("lib/i18n/messages.ts", "utf8");
    expect(messages).toContain('"dashboard.competitors.fewReviewsTag": "Few or no reviews yet"');
    expect(messages).toContain('"dashboard.competitors.fewReviewsTag": "Pocas o ninguna reseña aún"');
  });

  test("'small sample' when fewer than 5 competitors", () => {
    expect(fs.readFileSync("app/actions/competitors.ts", "utf8")).toContain("const SMALL_SAMPLE_THRESHOLD = SMALL_SAMPLE_BELOW;");
  });
});

describe("Main Street Cleaners: every searched type is one Google supports", () => {
  test("the dry cleaner niche searches Google's real type (laundry)", async () => {
    const { SPECIFIC_NICHES } = await import("@/config/niches");
    const { GOOGLE_TABLE_A_TYPES } = await import("@/lib/google/placeTypesTableA");
    const dry = SPECIFIC_NICHES.find((n) => n.id === "dry_cleaner")!;
    expect(dry.googleTypes).toEqual(["laundry"]);
    expect(dry.googleTypes.every((t) => GOOGLE_TABLE_A_TYPES.has(t))).toBe(true);
  });

  test("an unsupported type is dropped before the search, never sent to Google", async () => {
    const { searchableTypes } = await import("./competitors");
    expect(searchableTypes(["laundry", "dry_cleaner", null, "bakery"])).toEqual(["laundry", "bakery"]);
    respond = () => [];
    await findAndScoreCompetitors({ ...KEES, placeId: "msc", name: "Main Street Cleaners", primaryType: "laundry", categories: ["laundry"], niche: { directTypes: ["dry_cleaner", "laundry"], wideTypes: ["dry_cleaner"] } }, "en");
    for (const call of nearbyCalls) {
      expect(call.includedTypes ?? []).not.toContain("dry_cleaner");
      expect(call.includedPrimaryTypes ?? []).not.toContain("dry_cleaner");
    }
    expect(nearbyCalls[0].includedTypes).toEqual(["laundry"]);
  });
});

describe("the 10-competitor cap (the owner's areas included)", () => {
  test("established same-kind first, then established ones in the owner's areas — never more than 10", () => {
    const pool = [
      ...Array.from({ length: 6 }, (_, i) => ({ candidate: place(`direct-${i}`, "hair_salon", 1 + i, 40) as never, distanceMeters: (1 + i) * 1609 })),
      ...Array.from({ length: 12 }, (_, i) => ({ candidate: place(`area-${i}`, "barber_shop", 0.2 + i * 0.1, 100) as never, distanceMeters: 300 + i * 100, area: true })),
      { candidate: place("area-new", "barber_shop", 0.1, 0) as never, distanceMeters: 150, area: true },
    ];
    const picked = selectCompetitors(pool, MAX_COMPETITORS).map((p) => (p.candidate as { placeId: string }).placeId);
    expect(picked).toHaveLength(MAX_COMPETITORS);
    for (let i = 0; i < 6; i++) expect(picked).toContain(`direct-${i}`);
    // The 4 nearest established area shops fill the rest; the 0-review one doesn't.
    expect(picked.filter((id) => id.startsWith("area-")).sort()).toEqual(["area-0", "area-1", "area-2", "area-3"]);
    expect(picked).not.toContain("area-new");
  });

  test("a scan with the owner's areas never comes back with more than 10 competitors", async () => {
    respond = (call) =>
      call.includedTypes?.includes("barber_shop")
        ? Array.from({ length: 20 }, (_, i) => place(`barber-${i}`, "barber_shop", 0.5 + i * 0.05, 80))
        : Array.from({ length: 8 }, (_, i) => place(`salon-${i}`, "hair_salon", 0.3 + i * 0.1, 60));
    const salon = { ...KEES, placeId: "salon", name: "Hair express", primaryType: "hair_salon", categories: ["hair_salon"], category: "Hair salon", niche: { directTypes: ["hair_salon"], wideTypes: ["barber_shop"] } };
    const result = await findAndScoreCompetitors(salon, "en");
    const others = result.ranked.filter((r) => !r.isSubject);
    expect(others).toHaveLength(MAX_COMPETITORS);
    expect(others.filter((r) => r.placeId.startsWith("salon-"))).toHaveLength(8);
  });

  test("saved lists over 10 are capped from saved data only (scripts/capSavedCompetitors.ts) — no Google or PageSpeed call", () => {
    const src = fs.readFileSync("scripts/capSavedCompetitors.ts", "utf8").replace(/\/\/.*$/gm, "");
    expect(src).toContain("selectCompetitors(pool, MAX_COMPETITORS)");
    expect(src).not.toMatch(/searchNearbyPlaces|runAndSaveCompetitorScan|runCompetitorScoringJob|pagespeed/i);
  });
});

describe("after the competitor-picking update", () => {
  test("a rank from before and one from after aren't compared", async () => {
    const { COMPETITOR_SELECTION_UPDATED_AT, selectionChangedBetween } = await import("./competitorQuality");
    expect(COMPETITOR_SELECTION_UPDATED_AT).toBe("2026-10-27T18:49:00Z");
    expect(selectionChangedBetween("2026-10-23T15:16:38Z", "2026-10-27T18:53:02Z")).toBe(true);
    expect(selectionChangedBetween("2026-10-27T19:00:00Z", "2026-11-20T10:00:00Z")).toBe(false);
    expect(selectionChangedBetween("2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z")).toBe(false);
    expect(selectionChangedBetween(null, "2026-10-28T00:00:00Z")).toBe(false);
  });

  test("the note shows only when the list really changed across it", async () => {
    const { selectionNoteApplies } = await import("./competitorQuality");
    const base = { currentScanAt: "2026-10-27T19:00:00Z", previousScanAt: "2026-10-23T15:00:00Z" };
    expect(selectionNoteApplies({ ...base, currentPlaceIds: ["a", "b"], previousPlaceIds: ["a", "c"] })).toBe(true);
    expect(selectionNoteApplies({ ...base, currentPlaceIds: ["b", "a"], previousPlaceIds: ["a", "b"] })).toBe(false);
    expect(selectionNoteApplies({ ...base, currentScanAt: "2026-10-26T00:00:00Z", currentPlaceIds: ["x"], previousPlaceIds: ["y"] })).toBe(false);
  });

  test("no 'moved up/down' across it: weekly / since last visit / Reports PDF, and the monthly report", () => {
    const weekly = fs.readFileSync("lib/weekly/weekly.server.ts", "utf8");
    expect(weekly).toContain("const comparable = !!ids[1] && !selectionChangedBetween(scanAt(ids[1]), scanAt(ids[0]));");
    expect(fs.readFileSync("lib/weekly/weeklyData.server.ts", "utf8")).toContain("then: rankThen && !selectionChangedBetween(rankThen.scanAt, rankNow.scanAt) ? rankThen.rank : null");
    expect(fs.readFileSync("app/api/cron/monthly-reports/route.ts", "utf8")).toContain("!selectionChangedBetween(previousSnapshot.scanAt, currentCompetitorSnapshot.scanAt)");
  });

  test("the one-time note on the Competitors page and the rank card (EN + ES), dismissed for good", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { LocaleProvider } = await import("@/lib/i18n");
    const { CompetitorSelectionNote } = await import("@/components/competitors/CompetitorSelectionNote");
    const { LocalBenchmarkTile } = await import("@/components/dashboard/LocalBenchmarkTile");
    const en = renderToStaticMarkup(<LocaleProvider locale="en"><CompetitorSelectionNote businessId="b1" /></LocaleProvider>).replace(/&#x27;/g, "'");
    expect(en).toContain("We updated how we pick your competitors — you're now compared with more established businesses nearby, so your rank may have changed.");
    expect(en).toContain(">Got it<");
    const es = renderToStaticMarkup(<LocaleProvider locale="es"><CompetitorSelectionNote businessId="b1" /></LocaleProvider>);
    expect(es).toContain("Actualizamos cómo elegimos a su competencia");
    const benchmark = { competitorNoun: "bakeries", scanId: "s", scanAt: "2026-10-27T19:00:00Z", subjectTotal: 88, subjectGrade: "B", rank: 6, peerCount: 6, othersCount: 5, aheadCount: 0, percentileAhead: 0, smallSample: false, competitorReviewAverage: 800, reviewGoal: null, reviewGroup: "bakeries" };
    const tile = (selectionUpdated: boolean) => renderToStaticMarkup(<LocaleProvider locale="en"><LocalBenchmarkTile businessId="b1" result={{ status: "ok", benchmark: { ...benchmark, selectionUpdated } } as never} /></LocaleProvider>);
    expect(tile(true)).toContain('data-testid="competitor-selection-note"');
    expect(tile(false)).not.toContain('data-testid="competitor-selection-note"');
    expect(fs.readFileSync("app/business/[id]/competitors/CompetitorsView.tsx", "utf8")).toContain("{data.selectionUpdated && <CompetitorSelectionNote businessId={businessId} />}");
    const action = fs.readFileSync("app/actions/competitors.ts", "utf8");
    expect(action).toContain('hidden_until: "2100-01-01T00:00:00Z"');
    expect(action).toContain('.eq("promo_key", SELECTION_NOTE_KEY)');
  });
});

describe("competitor distance", () => {
  const mi = (n: number) => n * 1609.34;

  test("never farther than 15 miles — a shorter list (small sample) instead", async () => {
    const { MAX_COMPETITOR_DISTANCE_MILES, withinMaxDistance } = await import("./competitorQuality");
    expect(MAX_COMPETITOR_DISTANCE_MILES).toBe(15);
    expect(withinMaxDistance(mi(14.9))).toBe(true);
    expect(withinMaxDistance(mi(15.2))).toBe(false);
    const pool = [
      { candidate: place("near", "bakery", 8, 50) as never, distanceMeters: mi(8) },
      { candidate: place("far", "bakery", 16, 900) as never, distanceMeters: mi(16) },
      { candidate: place("farther", "bakery", 22, 900) as never, distanceMeters: mi(22) },
    ];
    expect(selectCompetitors(pool, MAX_COMPETITORS).map((p) => (p.candidate as { placeId: string }).placeId)).toEqual(["near"]);
  });

  test("saved scans never show one beyond 15 miles either", async () => {
    const { groupSavedScans } = await import("./savedCompetitorScans");
    const row = (id: string, subject: boolean, miles: number | null) => ({ scan_id: "s", created_at: "2026-10-27T19:00:00Z", is_subject: subject, place_id: id, name: id, address: null, distance_meters: miles === null ? null : mi(miles), rating: 4.5, review_count: 50, has_website: true, total: 80, grade: "B", scoring_version: "1.11.0", breakdown_json: null, price_level: null, photo_count: 3 });
    const scan = groupSavedScans([row("me", true, null), row("ok", false, 12), row("too-far", false, 18)])[0];
    expect(scan.entries.map((e) => e.placeId).sort()).toEqual(["me", "ok"]);
  });

  test("the distance note: only when most ranked competitors are over 5 miles; real whole-mile range from the established ones", async () => {
    const { distanceNote } = await import("./competitorQuality");
    // Kee's: all five 10.7–12.5 mi.
    expect(distanceNote([10.7, 12.1, 11.0, 12.5, 11.9].map((m) => ({ distanceMeters: mi(m), reviewCount: 300 })))).toEqual({ min: 11, max: 13 });
    // Half or fewer far → no note.
    expect(distanceNote([1, 2, 6, 7].map((m) => ({ distanceMeters: mi(m), reviewCount: 30 })))).toBeNull();
    expect(distanceNote([1, 6, 7].map((m) => ({ distanceMeters: mi(m), reviewCount: 30 })))).toEqual({ min: 1, max: 7 });
    // The range ignores few-review ones when established ones exist.
    expect(distanceNote([{ distanceMeters: mi(3), reviewCount: 0 }, { distanceMeters: mi(9), reviewCount: 80 }, { distanceMeters: mi(10), reviewCount: 80 }])).toEqual({ min: 9, max: 10 });
    expect(distanceNote([])).toBeNull();
  });

  test("the note's words (EN + ES), on the Competitors page and under the rank card", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { LocaleProvider } = await import("@/lib/i18n");
    const { DistanceNote } = await import("@/components/competitors/DistanceNote");
    const text = (locale: "en" | "es", note: { min: number; max: number }) => renderToStaticMarkup(<LocaleProvider locale={locale}><DistanceNote note={note} noun={locale === "en" ? "bakeries" : "panaderías"} /></LocaleProvider>).replace(/<[^>]+>/g, "");
    expect(text("en", { min: 11, max: 13 })).toBe("The nearest established bakeries are 11–13 miles away. In smaller towns, customers often compare businesses this far apart.");
    expect(text("en", { min: 12, max: 12 })).toContain("are 12 miles away");
    expect(text("es", { min: 11, max: 13 })).toBe("La competencia establecida más cercana (panaderías) está a 11–13 millas. En pueblos pequeños, los clientes suelen comparar negocios así de lejos.");
    const { LocalBenchmarkTile } = await import("@/components/dashboard/LocalBenchmarkTile");
    const benchmark = { competitorNoun: "bakeries", scanId: "s", scanAt: "2026-10-27T19:00:00Z", subjectTotal: 88, subjectGrade: "B", rank: 6, peerCount: 6, othersCount: 5, aheadCount: 0, percentileAhead: 0, smallSample: false, competitorReviewAverage: 800, reviewGoal: null, reviewGroup: "bakeries", distanceNote: { min: 11, max: 13 } };
    expect(renderToStaticMarkup(<LocaleProvider locale="en"><LocalBenchmarkTile businessId="b1" result={{ status: "ok", benchmark } as never} /></LocaleProvider>)).toContain('data-testid="distance-note"');
    expect(fs.readFileSync("app/business/[id]/competitors/CompetitorsView.tsx", "utf8")).toContain("{data.distanceNote && <DistanceNote note={data.distanceNote} noun={data.competitorNoun} />}");
  });

  test("“Also nearby”: up to 3 closer same-type listings skipped for few or no reviews — unranked, unscored, no counters", async () => {
    const { alsoNearby } = await import("./competitorQuality");
    const listing = (id: string, type: string, miles: number, reviews: number | null, name = id) => ({ placeId: id, name, type, types: [type], distanceMeters: mi(miles), reviewCount: reviews });
    const out = alsoNearby(
      [
        listing("food-lion", "bakery", 2.4, 0, "Food Lion Bakery"),
        listing("malaysias", "bakery", 2.8, null, "Malaysia's bakery"),
        listing("beulah", "bakery", 3.3, 0, "Beulah Bakery"),
        listing("kathys", "bakery", 5.0, 2, "Kathy's Crusty Creations"),
        listing("fourth", "bakery", 6.0, 1),
        listing("coffee", "coffee_shop", 2.1, 0),
        listing("busy-bakery", "bakery", 4.0, 200),
        listing("ranked", "bakery", 10.7, 0),
        listing("past-nearest", "bakery", 11.0, 0),
      ],
      { ownTypes: ["bakery"], rankedPlaceIds: ["ranked"], nearestRankedMeters: mi(10.7) }
    );
    expect(out.map((o) => o.name)).toEqual(["Malaysia's bakery", "Beulah Bakery", "Kathy's Crusty Creations"]);
    expect(out[0]).toEqual({ placeId: "malaysias", name: "Malaysia's bakery", distanceMeters: mi(2.8), reviewCount: 0 });
  });

  test("a new scan keeps its also-nearby list (saved with the scan, no extra call); the page shows it apart from the ranked list", async () => {
    respond = (_call, i) => (i < 3 ? KEES_NEARBY : [place("dover-bakery", "bakery", 11, 210), place("cupcake-co", "cake_shop", 8, 95), place("cookie-shop", "dessert_shop", 12, 60), place("la-baguette", "bakery", 11, 757), place("bavarian", "bakery", 12.5, 884)]);
    const result = await findAndScoreCompetitors(KEES, "en");
    expect(nearbyCalls.length).toBeLessThanOrEqual(MAX_CALLS_PER_SCAN);
    const rankedIds = result.ranked.map((r) => r.placeId);
    expect((result.alsoNearby ?? []).map((a) => a.placeId)).toEqual(["malaysias", "beulah", "kathys"]);
    for (const a of result.alsoNearby ?? []) expect(rankedIds).not.toContain(a.placeId);
    const save = fs.readFileSync("app/actions/competitors.ts", "utf8");
    expect(save).toContain("also_nearby_json: result.alsoNearby ?? []");
    expect(fs.readFileSync("supabase/competitor-also-nearby.sql", "utf8")).toContain("add column if not exists also_nearby_json jsonb");
    const view = fs.readFileSync("app/business/[id]/competitors/CompetitorsView.tsx", "utf8");
    expect(view).toContain("{(data.alsoNearby ?? []).length > 0 && <AlsoNearby listings={data.alsoNearby!} />}");
    expect(view.indexOf("<RankedList scan={scan} view={view} />")).toBeLessThan(view.indexOf("<AlsoNearby listings"));
  });
});
