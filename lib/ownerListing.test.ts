import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

import { liveValuesFromBusinessProfile, liveValuesFromPlaces, placesPeriodsFromGbp, placesStylePhone, withLiveListing, type LiveListing } from "./ownerListing";
import { ownerListingLive, pickHeaderPhoto, type OwnerListingDeps } from "./ownerListing.server";
import { liveCache } from "./placesLive.server";
import type { PlaceDetails } from "./google/places";

const src = (f: string) => readFileSync(f, "utf8");

const PLACE = {
  placeId: "p1",
  rating: 4.7,
  userRatingCount: 31,
  phone: "+1 908-555-0100",
  website: "https://hairexpress.example",
  openingHours: ["Monday: 9:00 AM – 5:00 PM"],
  openingHoursPeriods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }],
  businessStatus: "OPERATIONAL",
  photoCount: 10,
  googleMapsUri: "https://maps.google.com/?cid=1",
} as unknown as PlaceDetails;

const ROW = { id: "b1", rating: 4.6, review_count: 30, phone: "(908) 555-0100", opening_hours: ["old"], opening_hours_periods: null, business_status: "OPERATIONAL", photo_count: 8, google_maps_uri: "old", website: "https://site.example" };

function deps(over: Partial<OwnerListingDeps> = {}) {
  const calls = { places: 0, gbp: 0, logs: [] as string[] };
  const d: OwnerListingDeps = {
    places: async () => {
      calls.places++;
      return PLACE;
    },
    gbp: async () => {
      calls.gbp++;
      return { status: "ok", source: "business_profile", values: liveValuesFromPlaces(PLACE) };
    },
    used: async () => 0,
    log: async (_id, kind, n) => {
      calls.logs.push(`${kind}:${n}`);
    },
    admin: () => ({}) as never,
    now: () => 1_000_000,
    ...over,
  };
  return { d, calls };
}

beforeEach(() => liveCache().clear());

describe("the owner's listing, read live when shown (Day 23 2d-2)", () => {
  test("connected owners: Business Profile only — 0 Places calls", async () => {
    const { d, calls } = deps();
    const r = await ownerListingLive("b1", { placeId: "p1", websiteOnly: false, connected: true }, d);
    expect(r.status).toBe("ok");
    expect(calls).toEqual({ places: 0, gbp: 1, logs: [] });
  });

  test("not connected (Free and paid alike): one Places read per visit, none on a reload within 10 minutes", async () => {
    const { d, calls } = deps();
    const first = await ownerListingLive("b1", { placeId: "p1", websiteOnly: false, connected: false }, d);
    const again = await ownerListingLive("b1", { placeId: "p1", websiteOnly: false, connected: false }, d);
    expect(first).toEqual(again);
    expect(calls.places).toBe(1);
    expect(calls.logs).toEqual(["live_read:1"]);
    // After the visit's 10 minutes: read again.
    const later = deps({ now: () => 1_000_000 + 10 * 60 * 1000 });
    await ownerListingLive("b1", { placeId: "p1", websiteOnly: false, connected: false }, later.d);
    expect(later.calls.places).toBe(1);
  });

  test("over the monthly cap or Google failing: unavailable, never a guess; website-only: nothing to read", async () => {
    const capped = deps({ used: async () => 1_000_000 });
    expect(await ownerListingLive("b1", { placeId: "p1", websiteOnly: false, connected: false }, capped.d)).toEqual({ status: "unavailable" });
    expect(capped.calls).toEqual({ places: 0, gbp: 0, logs: ["live_read_skipped:0"] });
    liveCache().clear();
    const down = deps({ places: async () => null });
    expect(await ownerListingLive("b1", { placeId: "p1", websiteOnly: false, connected: false }, down.d)).toEqual({ status: "unavailable" });
    liveCache().clear();
    const gbpDown = deps({ gbp: async () => { throw new Error("x"); } });
    expect(await ownerListingLive("b1", { placeId: "p1", websiteOnly: false, connected: true }, gbpDown.d)).toEqual({ status: "unavailable" });
    expect(await ownerListingLive("b2", { placeId: null, websiteOnly: false, connected: false }, deps().d)).toEqual({ status: "none" });
    expect(await ownerListingLive("b3", { placeId: "p3", websiteOnly: true, connected: false }, deps().d)).toEqual({ status: "none" });
  });

  test("pages show Google's values as read now; unavailable leaves them empty (never the saved ones) and says so", () => {
    const live: LiveListing = { status: "ok", source: "places", values: liveValuesFromPlaces(PLACE) };
    const shown = withLiveListing(ROW, live);
    expect(shown).toMatchObject({ rating: 4.7, review_count: 31, phone: "+1 908-555-0100", photo_count: 10, google_maps_uri: "https://maps.google.com/?cid=1", live_source: "places" });
    expect(shown.website).toBe("https://site.example");
    const down = withLiveListing(ROW, { status: "unavailable" });
    expect(down).toMatchObject({ rating: null, review_count: null, phone: null, opening_hours: null, photo_count: null, live_unavailable: true });
    expect(withLiveListing(ROW, { status: "none" })).toEqual(ROW);
  });

  test("Business Profile's hours, status and reviews summary in the shape the pages read", () => {
    expect(
      placesPeriodsFromGbp([
        { openDay: "MONDAY", openTime: { hours: 9 }, closeDay: "MONDAY", closeTime: { hours: 17, minutes: 30 } },
        { openDay: "SATURDAY", openTime: { hours: 18 }, closeDay: "SATURDAY", closeTime: { hours: 24 } },
      ])
    ).toEqual([
      { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } },
      { open: { day: 6, hour: 18, minute: 0 }, close: { day: 0, hour: 0, minute: 0 } },
    ]);
    expect(placesPeriodsFromGbp([{ openDay: "SOMEDAY" }])).toBeNull();
    // The phone reads as Places writes it.
    expect(placesStylePhone("(914) 320-3012")).toBe("+1 914-320-3012");
    expect(placesStylePhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(placesStylePhone("  ")).toBeNull();
    const v = liveValuesFromBusinessProfile({
      location: { phoneNumbers: { primaryPhone: "(908) 555-0100" }, regularHours: { periods: [{ openDay: "MONDAY", openTime: { hours: 9 }, closeDay: "MONDAY", closeTime: { hours: 17 } }] }, metadata: { mapsUri: "https://maps.google.com/?cid=2" }, openInfo: { status: "OPEN" } },
      reviews: { averageRating: 4.8, totalReviewCount: 58 },
      photoCount: 12,
    });
    expect(v).toMatchObject({ rating: 4.8, reviewCount: 58, phone: "+1 908-555-0100", businessStatus: "OPERATIONAL", photoCount: 12, googleMapsUri: "https://maps.google.com/?cid=2" });
    expect(v.openingHours?.[0]).toMatch(/^Monday/);
    expect(liveValuesFromBusinessProfile({ location: { openInfo: { status: "CLOSED_TEMPORARILY" } }, reviews: null, photoCount: null }).businessStatus).toBe("CLOSED_TEMPORARILY");
  });

  test("the header photo: a connected owner's own cover photo, never a Places call", () => {
    expect(
      pickHeaderPhoto([
        { mediaFormat: "VIDEO", googleUrl: "v" },
        { googleUrl: "first", locationAssociation: { category: "EXTERIOR" } },
        { googleUrl: "profile", locationAssociation: { category: "PROFILE" } },
        { googleUrl: "cover", locationAssociation: { category: "COVER" } },
      ])
    ).toBe("cover");
    expect(pickHeaderPhoto([{ googleUrl: "first" }, { googleUrl: "profile", locationAssociation: { category: "PROFILE" } }])).toBe("profile");
    expect(pickHeaderPhoto([])).toBeNull();
    const route = src("app/api/business/[id]/listing-photo/route.ts");
    expect(route.indexOf("if (await isGbpConnected(supabase, business.id))")).toBeGreaterThan(0);
    expect(route.indexOf("if (await isGbpConnected(supabase, business.id))")).toBeLessThan(route.indexOf("getFirstPhotoRef(business.place_id)"));
  });

  test("every owner page reads them: the shared score's record, Reviews, Website, the hours chooser, Reports and the weekly recap and PDF", () => {
    const scoring = src("app/actions/scoring.ts");
    expect(scoring).toContain("const business = withLiveListing(scored.business, live);");
    // The score and the plan's estimates stay on the scan's own row.
    expect(scoring).toContain("const scoringBusiness = scored.business;");
    expect(src("app/actions/reviews.ts")).toContain("await withLiveListingFor(supabase, businessId,");
    expect(src("app/actions/website.ts")).toContain("await withLiveListingFor(supabase, businessId,");
    expect(src("app/actions/hoursChooser.ts")).toContain("withLiveListingFor(db, businessId, row)");
    expect(src("app/actions/reports.ts")).toContain("withLiveListingFor(supabase, businessId, business)");
    expect(src("lib/weekly/weekly.server.ts")).toContain("withLiveListingFor(supabase, businessId, row)");
    expect(src("lib/weekly/weeklyData.server.ts")).toContain("await withLiveListingFor(supabase, businessId,");
    expect(src("app/business/[id]/BusinessScoreView.tsx").match(/\{business\.live_unavailable && <LiveUnavailableNote \/>\}/g)).toHaveLength(2);
    expect(src("lib/google/places.ts")).toContain('"rating",\n  "userRatingCount",');
  });
});
