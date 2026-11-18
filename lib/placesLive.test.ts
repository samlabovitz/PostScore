import { describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import {
  withLiveListing,
  LIVE_CACHE_MS,
  LiveCache,
  MAX_LIVE_DETAILS_PER_LOAD,
  MAX_LIVE_EXTRA_DETAILS_PER_LOAD,
  canMakeLiveCall,
  liveSearchRadius,
  placesLiveMonthlyCap,
  placesToFetch,
  scanWithoutPlacesValues,
  withLivePlaces,
  type LivePlace,
} from "./placesLive";
import { liveCompetitorPlaces, withLiveCompetitorValues, type LiveDeps } from "./placesLive.server";
import { liveValuesFrom, LIVE_DETAILS_FIELD_MASK, LIVE_NEARBY_FIELD_MASK } from "./google/places";
import { placesDetailsMonthlyCap } from "./placesDetailsBudget";
import { placePhotoMonthlyCap } from "./placePhotoBudget";
import type { SavedCompetitorEntry, SavedCompetitorScan } from "./savedCompetitorScans";
import type { CheckResult, ScoreBreakdown } from "./scoring";

function entry(placeId: string, total: number, extra: Partial<SavedCompetitorEntry> = {}): SavedCompetitorEntry {
  const hasWebsite = { id: "website.has_website", earnedPoints: 4, maxPoints: 4, confidence: "VERIFIED" } as CheckResult;
  return {
    placeId,
    name: `Saved ${placeId}`,
    isSubject: false,
    address: "1 Main St",
    distanceMeters: 1000,
    rating: 4.1,
    reviewCount: 50,
    hasWebsite: true,
    total,
    grade: "C",
    scoringVersion: "1.13.0",
    breakdown: { checks: [hasWebsite], categories: [] } as unknown as ScoreBreakdown,
    priceLevel: "PRICE_LEVEL_MODERATE",
    photoCount: 8,
    websiteUrl: "https://saved.example",
    types: ["hair_salon"],
    ...extra,
  };
}

const SCAN: SavedCompetitorScan = {
  scanId: "s1",
  createdAt: "2026-11-10T12:00:00Z",
  entries: [entry("c1", 80), entry("own", 72, { isSubject: true, distanceMeters: null }), entry("c2", 60, { distanceMeters: 3000 })],
};

const live = (placeId: string, extra: Partial<LivePlace> = {}): LivePlace => ({
  placeId,
  name: `Live ${placeId}`,
  rating: 4.7,
  reviewCount: 120,
  priceLevel: "PRICE_LEVEL_EXPENSIVE",
  photoCount: 10,
  hasWebsite: true,
  types: ["hair_salon"],
  ...extra,
});

function deps(over: Partial<LiveDeps> = {}): LiveDeps & { calls: string[] } {
  const calls: string[] = [];
  let t = 1_000_000;
  return {
    calls,
    text: vi.fn(async () => {
      calls.push("text");
      return [live("c1"), live("own"), live("elsewhere")];
    }),
    nearby: vi.fn(async () => {
      calls.push("nearby");
      return [live("c1"), live("own"), live("elsewhere")];
    }),
    details: vi.fn(async (id: string) => {
      calls.push(`details:${id}`);
      return live(id);
    }),
    used: vi.fn(async () => 0),
    log: vi.fn(async () => {}),
    cache: new LiveCache(),
    now: () => t++,
    ...over,
  };
}

const QUERY = { businessId: "biz", placeIds: ["own", "c1", "c2"], lat: 40.7, lng: -74, radiusMeters: 3400, includedTypes: ["hair_salon"] };

describe("live Google values: masks, caps, cache", () => {
  test("the masks ask only for what the page shows (Enterprise: rating, reviews, price, website)", () => {
    expect(LIVE_NEARBY_FIELD_MASK.split(",").sort()).toEqual(
      ["places.id", "places.displayName", "places.rating", "places.userRatingCount", "places.priceLevel", "places.photos", "places.websiteUri", "places.types"].sort()
    );
    expect(LIVE_DETAILS_FIELD_MASK).toBe(LIVE_NEARBY_FIELD_MASK.replace(/places\./g, ""));
    // Never an Enterprise + Atmosphere field (reviews, service options, payment, parking).
    expect(LIVE_NEARBY_FIELD_MASK).not.toMatch(/reviews|payment|parking|delivery|dineIn|takeout|serves/);
  });

  test("Google's answer becomes the page's values; no website listed is a real 'no'", () => {
    expect(liveValuesFrom({ id: "p", displayName: { text: "Shop" }, rating: 4.5, userRatingCount: 12, photos: [{}, {}], types: ["bakery"] })).toEqual({
      placeId: "p",
      name: "Shop",
      rating: 4.5,
      reviewCount: 12,
      priceLevel: null,
      photoCount: 2,
      hasWebsite: false,
      types: ["bakery"],
    });
    expect(liveValuesFrom({})).toBeNull();
  });

  test("caps: 1,000 each by default (each SKU's free amount), env override; the scan cap is 700; photos 1,000", () => {
    expect(placesLiveMonthlyCap("live_list", {})).toBe(1000);
    expect(placesLiveMonthlyCap("live_read", {})).toBe(1000);
    expect(placesLiveMonthlyCap("live_list", { PLACES_LIVE_LIST_MONTHLY_CAP: "40" })).toBe(40);
    expect(placesLiveMonthlyCap("live_read", { PLACES_LIVE_READ_MONTHLY_CAP: "nope" })).toBe(1000);
    expect(placesDetailsMonthlyCap({})).toBe(700);
    expect(placePhotoMonthlyCap({})).toBe(1000);
    expect(canMakeLiveCall(999, 1000)).toBe(true);
    expect(canMakeLiveCall(1000, 1000)).toBe(false);
    expect(canMakeLiveCall(998, 1000, 3)).toBe(false);
    // A page view still runs when the month's count can't be read.
    expect(canMakeLiveCall("unreadable", 0)).toBe(true);
  });

  test("the cache keeps a value 10 minutes, sweeps expired ones, and drops the oldest past its size", () => {
    const cache = new LiveCache(LIVE_CACHE_MS, 3);
    cache.set("a", 1, 0);
    expect(cache.get("a", LIVE_CACHE_MS - 1)).toBe(1);
    expect(cache.get("a", LIVE_CACHE_MS)).toBeUndefined();
    expect(cache.size).toBe(0);
    for (const k of ["a", "b", "c", "d"]) cache.set(k, k, 10);
    expect(cache.size).toBe(3);
    expect(cache.get("a", 11)).toBeUndefined();
    expect(cache.get("d", 11)).toBe("d");
  });
});

describe("saved values are never shown", () => {
  test("only our own results stay; Google's values wait for the live read", () => {
    const bare = scanWithoutPlacesValues(SCAN, "My Salon");
    const c1 = bare.entries.find((e) => e.placeId === "c1")!;
    expect(c1).toMatchObject({ name: null, address: null, rating: null, reviewCount: null, priceLevel: null, photoCount: null, websiteUrl: null, types: null, liveMissing: true });
    // Ours: score, grade, distance, and the website check result.
    expect(c1).toMatchObject({ total: 80, grade: "C", distanceMeters: 1000, hasWebsite: true });
    // The owner's row keeps the name the page header already shows.
    expect(bare.entries.find((e) => e.isSubject)!.name).toBe("My Salon");
  });

  test("live values fill in by place ID; a place Google didn't return stays '—'", () => {
    const merged = withLivePlaces(scanWithoutPlacesValues(SCAN, "My Salon"), { c1: live("c1"), own: live("own") });
    expect(merged.entries.find((e) => e.placeId === "c1")).toMatchObject({ name: "Live c1", rating: 4.7, reviewCount: 120, liveMissing: false });
    expect(merged.entries.find((e) => e.isSubject)).toMatchObject({ name: "My Salon", rating: 4.7, liveMissing: false });
    expect(merged.entries.find((e) => e.placeId === "c2")).toMatchObject({ name: null, rating: null, liveMissing: true });
    // The order is our own scores', unchanged.
    expect(merged.entries.map((e) => e.placeId)).toEqual(["c1", "own", "c2"]);
  });

  test("the search circle reaches just past the farthest saved competitor; the owner's row is asked for first", () => {
    expect(liveSearchRadius(SCAN.entries)).toBe(3400);
    expect(liveSearchRadius([])).toBe(500);
    expect(liveSearchRadius([entry("far", 1, { distanceMeters: 60_000 })])).toBe(50_000);
    expect(placesToFetch(SCAN)).toEqual(["own", "c1", "c2"]);
  });
});

describe("liveCompetitorPlaces: one visit, as few calls as possible", () => {
  test("one Nearby call, then Place Details only for what it didn't return", async () => {
    const d = deps();
    const r = await liveCompetitorPlaces(QUERY, d);
    expect(d.calls).toEqual(["nearby", "details:c2"]);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(Object.keys(r.places).sort()).toEqual(["c1", "c2", "own"]);
    expect(d.nearby).toHaveBeenCalledWith({ lat: 40.7, lng: -74, radiusMeters: 3400, includedTypes: ["hair_salon"] });
    expect(d.log).toHaveBeenCalledWith("biz", "live_list", 1);
    expect(d.log).toHaveBeenCalledWith("biz", "live_read", 1);
  });

  test("with the scan's phrase: one Text Search (it found these competitors), never Nearby", async () => {
    const d = deps();
    const r = await liveCompetitorPlaces({ ...QUERY, textQuery: "hair salons in Westfield, NJ" }, d);
    expect(d.calls).toEqual(["text", "details:c2"]);
    expect(d.text).toHaveBeenCalledWith({ textQuery: "hair salons in Westfield, NJ", lat: 40.7, lng: -74, radiusMeters: 3400 });
    expect(d.nearby).not.toHaveBeenCalled();
    expect(r.status).toBe("ok");
    expect(d.log).toHaveBeenCalledWith("biz", "live_list", 1);
  });

  test("the phrase works without coordinates (it names the town)", async () => {
    const d = deps();
    await liveCompetitorPlaces({ ...QUERY, lat: null, lng: null, includedTypes: [], textQuery: "bakeries in Hope, AR" }, d);
    expect(d.text).toHaveBeenCalledWith({ textQuery: "bakeries in Hope, AR", lat: null, lng: null, radiusMeters: 3400 });
  });

  test("a second load within 10 minutes makes no call at all", async () => {
    const d = deps();
    await liveCompetitorPlaces(QUERY, d);
    d.calls.length = 0;
    const again = await liveCompetitorPlaces(QUERY, d);
    expect(d.calls).toEqual([]);
    expect(again.status).toBe("ok");
  });

  test("the list call runs once per visit: a place it didn't return goes straight to Details next time", async () => {
    const d = deps({ details: vi.fn(async () => null) });
    await liveCompetitorPlaces(QUERY, d);
    d.calls.length = 0;
    await liveCompetitorPlaces(QUERY, d);
    expect(d.calls).toEqual([]);
    expect(d.details).toHaveBeenCalledTimes(2);
    expect(d.nearby).toHaveBeenCalledTimes(1);
  });

  test(`at most ${MAX_LIVE_DETAILS_PER_LOAD} Details calls per load, in page order`, async () => {
    const ids = ["own", ...Array.from({ length: 9 }, (_, i) => `x${i}`)];
    const d = deps({ nearby: vi.fn(async () => []) });
    await liveCompetitorPlaces({ ...QUERY, placeIds: ids }, d);
    expect(d.details).toHaveBeenCalledTimes(MAX_LIVE_DETAILS_PER_LOAD);
    expect((d.details as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(ids.slice(0, MAX_LIVE_DETAILS_PER_LOAD));
  });

  test(`"Also nearby" / "Removed by you" names get their own ${MAX_LIVE_EXTRA_DETAILS_PER_LOAD} reads — never left as "—" because the ranked list used the allowance`, async () => {
    const ids = ["own", ...Array.from({ length: 9 }, (_, i) => `x${i}`)];
    const extra = ["n1", "n2", "n3", "x0"];
    const d = deps({ nearby: vi.fn(async () => []) });
    const r = await liveCompetitorPlaces({ ...QUERY, placeIds: ids, extraPlaceIds: extra }, d);
    const asked = (d.details as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(asked).toEqual([...ids.slice(0, MAX_LIVE_DETAILS_PER_LOAD), "n1", "n2", "n3"]);
    expect(r.status === "ok" && ["n1", "n2", "n3"].every((id) => r.places[id])).toBe(true);
    const many = Array.from({ length: 9 }, (_, i) => `n${i}`);
    const d2 = deps({ nearby: vi.fn(async () => []) });
    await liveCompetitorPlaces({ ...QUERY, placeIds: ["own"], extraPlaceIds: many }, d2);
    expect(d2.details).toHaveBeenCalledTimes(1 + MAX_LIVE_EXTRA_DETAILS_PER_LOAD);
  });

  test("Details answers are kept under the saved place ID (Google may answer with a newer one)", async () => {
    const d = deps({ nearby: vi.fn(async () => []), details: vi.fn(async () => live("new-id")) });
    const r = await liveCompetitorPlaces({ ...QUERY, placeIds: ["old-id"] }, d);
    expect(r.status === "ok" && r.places["old-id"]?.placeId).toBe("old-id");
  });

  test("no phrase and no specific search type, or no coordinates: no list call (the nearest anything wouldn't find them)", async () => {
    const a = deps();
    await liveCompetitorPlaces({ ...QUERY, includedTypes: [] }, a);
    expect(a.nearby).not.toHaveBeenCalled();
    const b = deps();
    await liveCompetitorPlaces({ ...QUERY, lat: null, lng: null }, b);
    expect(b.nearby).not.toHaveBeenCalled();
    expect(b.details).toHaveBeenCalledTimes(3);
  });

  test("over the caps: no call, a 0-call skip row, and the page gets 'unavailable'", async () => {
    const d = deps({ used: vi.fn(async () => 1000) });
    const r = await liveCompetitorPlaces(QUERY, d);
    expect(d.calls).toEqual([]);
    expect(r).toEqual({ status: "unavailable" });
    expect(d.log).toHaveBeenCalledWith("biz", "live_list_skipped", 0);
    expect(d.log).toHaveBeenCalledWith("biz", "live_read_skipped", 0);
  });

  test("Google unreachable: 'unavailable', never a thrown error", async () => {
    const d = deps({ nearby: vi.fn(async () => null), details: vi.fn(async () => { throw new Error("timeout"); }) });
    expect(await liveCompetitorPlaces(QUERY, d)).toEqual({ status: "unavailable" });
    const t = deps({ text: vi.fn(async () => { throw new Error("boom"); }), details: vi.fn(async () => null) });
    expect(await liveCompetitorPlaces({ ...QUERY, textQuery: "x in y" }, t)).toEqual({ status: "unavailable" });
  });

  test("the page helper: Google unreachable → our own results only, flagged unavailable", async () => {
    const d = deps({ nearby: vi.fn(async () => null), details: vi.fn(async () => null) });
    const r = await withLiveCompetitorValues("biz", SCAN, "My Salon", { lat: 1, lng: 2, includedTypes: ["hair_salon"] }, d);
    expect(r.unavailable).toBe(true);
    expect(r.scan.entries.filter((e) => !e.isSubject).every((e) => e.name === null && e.rating === null)).toBe(true);
    expect(r.scan.entries.map((e) => e.total)).toEqual([80, 72, 60]);
  });

  test("the page helper: everything read → not unavailable", async () => {
    const r = await withLiveCompetitorValues("biz", SCAN, "My Salon", { lat: 1, lng: 2, includedTypes: ["hair_salon"] }, deps());
    expect(r.unavailable).toBe(false);
    expect(r.scan.entries.find((e) => e.placeId === "c2")!.name).toBe("Live c2");
  });
});

describe("'Also nearby' listings", () => {
  test("name and review count from the live read; missing → null and flagged", () => {
    const saved = { placeId: "x", name: null, distanceMeters: 400, reviewCount: null };
    expect(withLiveListing(saved, live("x", { name: "Tiny", reviewCount: 2 }))).toEqual({ placeId: "x", name: "Tiny", distanceMeters: 400, reviewCount: 2, liveMissing: false });
    // A saved name (an old list) is never shown.
    expect(withLiveListing({ ...saved, name: "Old saved name", reviewCount: 9 }, undefined)).toEqual({ placeId: "x", name: null, distanceMeters: 400, reviewCount: null, liveMissing: true });
  });
});
