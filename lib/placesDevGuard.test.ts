// Nov 24: dev-only runs (next dev, devShot, the dev test login, tsx
// scripts) never spend live Places reads — the 10-minute cache or "Couldn't
// load from Google right now". Production and real scans are unchanged.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

import { devRunSkipsLivePlaces } from "./placesDevGuard";
import { ownerListingLive, publicPlacesListing, rememberOwnerListing, type OwnerListingDeps } from "./ownerListing.server";
import { liveCache, liveCompetitorPlaces, type LiveDeps } from "./placesLive.server";
import { LiveCache } from "./placesLive";
import { liveListingFromPlaces } from "./ownerListing";
import type { PlaceDetails } from "./google/places";

const PLACE = { placeId: "p1", rating: 4.7, userRatingCount: 31, openingHours: [], openingHoursPeriods: [], businessStatus: "OPERATIONAL", photoCount: 10, googleMapsUri: "https://maps.google.com/?cid=1" } as unknown as PlaceDetails;

function ownerDeps(devOnly: boolean) {
  const calls = { places: 0, logs: [] as string[] };
  const d: OwnerListingDeps = {
    places: async () => {
      calls.places++;
      return PLACE;
    },
    gbp: async () => ({ ...liveListingFromPlaces(PLACE), source: "business_profile" }),
    used: async () => 0,
    log: async (_id, kind, n) => {
      calls.logs.push(`${kind}:${n}`);
    },
    admin: () => ({}) as never,
    now: () => 1_000_000,
    devOnly: () => devOnly,
  };
  return { d, calls };
}

beforeEach(() => liveCache().clear());

describe("which runs are dev-only", () => {
  test("next dev and scripts: yes; production and tests: no; PLACES_DEV_LIVE=true opts back in", () => {
    expect(devRunSkipsLivePlaces({ NODE_ENV: "development" })).toBe(true);
    expect(devRunSkipsLivePlaces({})).toBe(true);
    expect(devRunSkipsLivePlaces({ NODE_ENV: "production" })).toBe(false);
    expect(devRunSkipsLivePlaces({ NODE_ENV: "test", VITEST: "true" })).toBe(false);
    expect(devRunSkipsLivePlaces({ NODE_ENV: "development", PLACES_DEV_LIVE: "true" })).toBe(false);
  });
});

describe("a dev-only run never spends a Places read", () => {
  test("the owner's listing: unavailable, no call, nothing logged; production reads once", async () => {
    const dev = ownerDeps(true);
    expect((await ownerListingLive("b1", { placeId: "p1", websiteOnly: false, connected: false }, dev.d)).status).toBe("unavailable");
    expect(dev.calls).toEqual({ places: 0, logs: [] });
    liveCache().clear();
    const prod = ownerDeps(false);
    expect((await ownerListingLive("b1", { placeId: "p1", websiteOnly: false, connected: false }, prod.d)).status).toBe("ok");
    expect(prod.calls).toEqual({ places: 1, logs: ["live_read:1"] });
  });

  test("the 10-minute cache still serves a dev run (e.g. a scan's own read, kept for the visit)", async () => {
    rememberOwnerListing("b1", liveListingFromPlaces(PLACE), 1_000_000);
    const dev = ownerDeps(true);
    expect((await ownerListingLive("b1", { placeId: "p1", websiteOnly: false, connected: false }, dev.d)).status).toBe("ok");
    expect(dev.calls.places).toBe(0);
  });

  test("connected owners still read Business Profile (no Places call either way)", async () => {
    const dev = ownerDeps(true);
    expect((await ownerListingLive("b1", { placeId: "p1", websiteOnly: false, connected: true }, dev.d)).status).toBe("ok");
    expect(dev.calls.places).toBe(0);
  });

  test("Google Maps' public listing (the hours check): unavailable in dev, no call", async () => {
    const dev = ownerDeps(true);
    expect((await publicPlacesListing("b1", "p1", dev.d)).status).toBe("unavailable");
    expect(dev.calls).toEqual({ places: 0, logs: [] });
  });

  test("competitors: no list or details call in dev; what's cached still shows", async () => {
    const calls: string[] = [];
    const cache = new LiveCache();
    const d: LiveDeps = {
      text: vi.fn(async () => (calls.push("text"), [])),
      nearby: vi.fn(async () => (calls.push("nearby"), [])),
      details: vi.fn(async () => (calls.push("details"), null)),
      used: vi.fn(async () => 0),
      log: vi.fn(async () => {}),
      cache,
      now: () => 1_000_000,
      devOnly: () => true,
    };
    const q = { businessId: "biz", placeIds: ["c1", "c2"], lat: 40.7, lng: -74, radiusMeters: 3400, includedTypes: ["hair_salon"] };
    expect((await liveCompetitorPlaces(q, d)).status).toBe("unavailable");
    cache.set("place:c1", { placeId: "c1" } as never, 1_000_000);
    const r = await liveCompetitorPlaces(q, d);
    expect(r.status === "ok" && Object.keys(r.places)).toEqual(["c1"]);
    expect(calls).toEqual([]);
    expect(d.log).not.toHaveBeenCalled();
  });

  test("the header photo route skips Places in dev", () => {
    expect(readFileSync("app/api/business/[id]/listing-photo/route.ts", "utf8")).toContain("if (devRunSkipsLivePlaces()) return reply({ photo: null });");
  });
});
