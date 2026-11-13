import { describe, expect, test, vi } from "vitest";

// Competitors for "Art & pottery classes" (art_classes) — the real Centered
// Clay Studio case: the scan searched "educational institutions in Kennett
// Square, PA" and found music schools. Now: its own phrases, searched
// around the business, results merged, a strict pottery/ceramics/clay rule
// (within 10 mi, widened to the app's 15-mile limit when that finds too few),
// and every other business type gets a proper phrase. Every Google call is
// mocked.

type Candidate = ReturnType<typeof place>;
const textCalls: Array<{ textQuery: string; lat: number; lng: number; radiusMeters: number }> = [];
const nearbyCalls: unknown[] = [];
let textResultsFor: (query: string) => Candidate[] = () => [];

vi.mock("@/lib/google/places", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google/places")>("@/lib/google/places");
  return {
    ...actual,
    searchTextCompetitors: async (params: { textQuery: string; lat: number; lng: number; radiusMeters: number }) => {
      textCalls.push(params);
      return textResultsFor(params.textQuery);
    },
    searchNearbyPlaces: async (params: unknown) => {
      nearbyCalls.push(params);
      return [];
    },
    lookupBusinessByPlaceId: async () => ({ status: "no_results" }),
  };
});

import { findAndScoreCompetitors, type CompetitorSourceBusiness, type PhraseFilterEntry } from "./competitors";
import { competitorPhraseQueries, competitorQueryNoun, competitorTextQuery, NICHE_QUERY_NOUN, phraseMatch } from "./competitorQuery";
import { allNiches, isGeneralNiche } from "./niches";
import { MAX_CALLS_PER_SCAN } from "./placesSearchBudget";

const LAT = 39.851569;
const LNG = -75.6970044;
const MILE_LAT = 1 / 69;

function place(id: string, name: string, opts: { miles?: number; reviews?: number; types?: string[]; website?: string | null; status?: string } = {}) {
  const location = { lat: LAT + (opts.miles ?? 1) * MILE_LAT, lng: LNG };
  const types = opts.types ?? ["educational_institution", "point_of_interest", "establishment"];
  const details = {
    placeId: id, name, formattedAddress: "Kennett Square, PA", phone: "555", website: opts.website ?? null, openingHours: null, openingHoursPeriods: null,
    rating: 4.9, userRatingCount: opts.reviews ?? 40, categories: types, primaryCategory: types[0], primaryType: types[0],
    location, businessStatus: opts.status ?? "OPERATIONAL", googleMapsUri: null, photoCount: 5, priceLevel: null,
  };
  return { placeId: id, name, formattedAddress: "Kennett Square, PA", types, primaryType: types[0], primaryTypeDisplayName: null, businessStatus: opts.status ?? "OPERATIONAL", location, priceLevel: null, details };
}

const CLAY: CompetitorSourceBusiness = {
  placeId: "centered-clay",
  name: "Centered Clay Studio",
  address: "67 Ways Ln, Kennett Square, PA 19348, USA",
  lat: LAT,
  lng: LNG,
  primaryType: "educational_institution",
  categories: ["educational_institution", "point_of_interest", "service", "establishment"],
  category: "Educational Institution",
  rating: 4.8,
  review_count: 48,
  phone: "555",
  opening_hours: null,
  website: "http://www.centeredclaystudio.com/",
  queryNiche: { id: "art_classes", labelEn: "Art & pottery classes", parent: "tutor_education" },
  nicheRule: { nicheId: "art_classes", parent: "tutor_education", areas: [], googleTypes: [], professional: false },
} as unknown as CompetitorSourceBusiness;

describe("art_classes: its own phrases", () => {
  test("four pottery phrases, then the art fallback — searched around the business, never “… in {town}”", () => {
    expect(competitorPhraseQueries("art_classes")).toEqual({ queries: ["pottery studios", "ceramics studios", "pottery classes", "clay studios"], fallbackQueries: ["art studio classes"] });
    expect(competitorPhraseQueries("hair_salon")).toBeNull();
    expect(competitorTextQuery({ nicheId: "art_classes", nicheLabelEn: "Art & pottery classes", nicheParent: "tutor_education", primaryType: "educational_institution", address: CLAY.address })).toBe("pottery studios in Kennett Square, PA");
  });

  test("the strict rule: pottery, ceramics, clay or wheel throwing in the name, Google types or website", () => {
    const m = (name: string, website: string | null = null, types: string[] = ["educational_institution"]) => phraseMatch("art_classes", { name, types, website });
    expect(m("Fired Up Pottery, LLC")).toEqual({ ok: true, reason: "name says “pottery”" });
    expect(m("Meghan Bergman Ceramics")).toEqual({ ok: true, reason: "name says “ceramics”" });
    expect(m("Phoenix Fire Clay Studio")).toEqual({ ok: true, reason: "name says “clay”" });
    expect(m("Wheel-throwing nights")).toMatchObject({ ok: true });
    expect(m("The Painted Plate", "https://paintedplatepottery.com/")).toEqual({ ok: true, reason: "website paintedplatepottery.com says “pottery”" });
    expect(m("Centered", "http://www.centeredclaystudio.com/")).toMatchObject({ ok: true });
    // The real music schools from the old scan, and look-alike words.
    expect(m("Pollock Music Lessons")).toEqual({ ok: false, reason: "name says “music”" });
    expect(m("Clay Music Academy")).toEqual({ ok: false, reason: "name says “music”" });
    expect(m("Mattock School of Music")).toMatchObject({ ok: false });
    expect(m("CEs for LMTs by Stacy")).toEqual({ ok: false, reason: "no pottery, ceramics, clay, wheel throwing in its name, Google types or website" });
    expect(m("Clayton Art Center")).toMatchObject({ ok: false });
    expect(m("Claymont Studio", "https://claymontstudio.com")).toMatchObject({ ok: false });
  });

  test("the art fallback: painting / art classes / art studio — never music, dance, tutoring, schools or stores", () => {
    const f = (name: string, types: string[] = ["point_of_interest"]) => phraseMatch("art_classes", { name, types, website: null }, true);
    expect(f("Free Range Art Studio")).toEqual({ ok: true, reason: "name says “art studio”" });
    expect(f("Wine & Paint Night")).toMatchObject({ ok: true });
    expect(f("Kennett Studio", ["art_studio"])).toEqual({ ok: true, reason: "Google type says “art studio”" });
    expect(f("Carlin Academy of Fine Art")).toEqual({ ok: false, reason: "name says “school”" });
    expect(f("Dance Art Studio")).toEqual({ ok: false, reason: "name says “dance”" });
    expect(f("Kennett Art Tutoring")).toEqual({ ok: false, reason: "name says “tutoring”" });
    expect(f("Art Supply Store")).toEqual({ ok: false, reason: "name says “store”" });
  });
});

describe("the scan: merged phrase results, strict rule, 10 mi then 15 mi", () => {
  const run = async (results: Record<string, Candidate[]>) => {
    textCalls.length = 0;
    nearbyCalls.length = 0;
    textResultsFor = (q) => results[q] ?? [];
    let report: { entries: PhraseFilterEntry[]; miles: number } | null = null;
    const result = await findAndScoreCompetitors(CLAY, "en", { onPhraseFilter: (entries, miles) => (report = { entries, miles }) });
    return { result, report: report as unknown as { entries: PhraseFilterEntry[]; miles: number }, names: result.ranked.filter((r) => !r.isSubject).map((r) => r.name) };
  };

  test("Centered Clay's real shape: 4 pottery studios kept, music and unlabelled studios out; no Nearby Search, no fallback", async () => {
    const { names, report } = await run({
      "pottery studios": [place("fired", "Fired Up Pottery, LLC", { miles: 9.2 }), place("plate", "The Painted Plate", { miles: 8.9, website: "https://paintedplatepottery.com" }), place("hattie", "Hattie Weselyk Studio", { miles: 2.9 }), place("centered-clay", "Centered Clay Studio", { miles: 0 })],
      "ceramics studios": [place("meghan", "Meghan Bergman Ceramics", { miles: 2.2 }), place("fired", "Fired Up Pottery, LLC", { miles: 9.2 })],
      "pottery classes": [place("pollock", "Pollock Music Lessons", { miles: 0.9 })],
      "clay studios": [place("born", "Clay Born Pottery & Textiles Studio", { miles: 8.6 }), place("far", "Lancaster Clay Studios LLC", { miles: 41.6 })],
    });
    expect(textCalls.map((c) => c.textQuery)).toEqual(["pottery studios", "ceramics studios", "pottery classes", "clay studios"]);
    expect(textCalls.every((c) => c.lat === LAT && c.lng === LNG)).toBe(true);
    expect(nearbyCalls).toHaveLength(0);
    expect(new Set(names)).toEqual(new Set(["Fired Up Pottery, LLC", "The Painted Plate", "Meghan Bergman Ceramics", "Clay Born Pottery & Textiles Studio"]));
    expect(report.miles).toBe(10);
    const byName = (n: string) => report.entries.find((e) => e.name === n)!;
    expect(byName("Pollock Music Lessons")).toMatchObject({ kept: false, verdict: { ok: false, reason: "name says “music”" } });
    expect(byName("Hattie Weselyk Studio")).toMatchObject({ kept: false, verdict: { ok: false } });
    expect(byName("Lancaster Clay Studios LLC")).toMatchObject({ kept: false, verdict: { ok: true } });
    expect(report.entries.some((e) => e.placeId === "centered-clay")).toBe(false);
  });

  test("fewer than 3 within 10 mi: the art fallback runs, then the distance widens to 15 mi (the app's limit) — never padded", async () => {
    const { names, report, result } = await run({
      "pottery studios": [place("near", "Kennett Pottery", { miles: 3 }), place("wide", "Phoenix Fire Clay Studio", { miles: 12.5 }), place("too-far", "Mudslingers Pottery Studio", { miles: 22 }), place("music", "Kennett Music School", { miles: 1 })],
      "art studio classes": [place("art", "Free Range Art Studio", { miles: 9 }), place("school", "Carlin Academy of Fine Art", { miles: 0.7 })],
    });
    expect(textCalls.map((c) => c.textQuery)).toEqual(["pottery studios", "ceramics studios", "pottery classes", "clay studios", "art studio classes"]);
    expect(textCalls.length).toBeLessThanOrEqual(MAX_CALLS_PER_SCAN);
    expect(report.miles).toBe(15);
    expect(result.searchWidened).toBe(true);
    expect(new Set(names)).toEqual(new Set(["Kennett Pottery", "Phoenix Fire Clay Studio", "Free Range Art Studio"]));
    expect(names).not.toContain("Kennett Music School");
    expect(names).not.toContain("Mudslingers Pottery Studio");
    expect(names).not.toContain("Carlin Academy of Fine Art");
  });

  test("nothing passes: an honest empty list, not other kinds of businesses", async () => {
    const { names } = await run({ "pottery studios": [place("m", "Mattock School of Music", { miles: 2.9 }), place("g", "grooveKSq Percussion Studios", { miles: 0.8 })] });
    expect(names).toEqual([]);
    expect(nearbyCalls).toHaveLength(0);
  });
});

describe("every business type has a proper search phrase (none falls back to a Google category)", () => {
  test("each non-general type's query noun comes from its own words, with no Google type given", () => {
    const missing = allNiches()
      .filter((n) => !isGeneralNiche(n.id))
      .filter((n) => competitorQueryNoun({ nicheId: n.id, nicheLabelEn: n.label.en, nicheParent: n.parent, primaryType: null }) === null)
      .map((n) => n.id);
    expect(missing).toEqual([]);
  });

  test("a few of the 87 phrases added, and they win over Google's category", () => {
    expect(Object.keys(NICHE_QUERY_NOUN)).toHaveLength(87);
    expect(competitorTextQuery({ nicheId: "hvac", nicheLabelEn: "HVAC", nicheParent: "home_services", primaryType: "general_contractor", address: CLAY.address })).toBe("hvac contractors in Kennett Square, PA");
    expect(competitorQueryNoun({ nicheId: "massage", nicheLabelEn: "Massage", nicheParent: "spa", primaryType: "spa" })).toBe("massage therapists");
    expect(competitorQueryNoun({ nicheId: "music_lessons", nicheLabelEn: "Music lessons & piano teacher", nicheParent: "tutor_education", primaryType: "educational_institution" })).toBe("music lessons");
    // Types that already named a place are unchanged.
    expect(competitorQueryNoun({ nicheId: "hair_salon", nicheLabelEn: "Hair salon", nicheParent: "salon" })).toBe("hair salons");
  });
});
