import { beforeEach, describe, expect, test, vi } from "vitest";

// Part B — the cost rules for paid competitor scans. Every Google call in
// a scan goes through findAndScoreCompetitors (lib/competitors.ts); these
// tests replace it with a spy so "no paid call" is checked directly.
const scanSpy = vi.fn();
vi.mock("@/lib/competitors", async () => {
  const actual = await vi.importActual<typeof import("@/lib/competitors")>("@/lib/competitors");
  return { ...actual, findAndScoreCompetitors: (...args: unknown[]) => scanSpy(...args) };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
// The owner's website check reads Supabase/Browserless — not under test here.
vi.mock("@/lib/ownerWebsiteBasic", () => ({ ownerBasicWebsiteCheck: async () => ({ result: null, renders: 0 }) }));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureFirstCompetitorScanWithClient,
  getCompetitorsWithClient,
  runAndSaveCompetitorScanWithClient,
} from "./competitors";

type Rows = Record<string, unknown>;
/** A tiny stand-in for the Supabase query builder: every chain resolves
 * to the rows configured for its table; inserts are recorded. */
function fakeSupabase(tables: Record<string, Rows[]>) {
  const inserted: Record<string, unknown[]> = {};
  const client = {
    from(table: string) {
      const rows = tables[table] ?? [];
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "order", "limit", "in", "update"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      chain.insert = (payload: unknown[]) => {
        inserted[table] = [...(inserted[table] ?? []), ...payload];
        return chain;
      };
      chain.single = async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: "none" } });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
      return chain;
    },
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
  };
  return { client: client as unknown as SupabaseClient, inserted };
}

const NOW = new Date("2026-10-16T16:00:00Z");
const BUSINESS = {
  name: "Modern Liquors",
  address: "246 E Delaware Ave",
  language: "en",
  category: "Liquor Store",
  categories: ["liquor_store"],
  primary_type: "liquor_store",
  business_type_override: null,
  place_id: "p-owner",
  lat: 39.68,
  lng: -75.75,
};
const SAVED_BREAKDOWN = scoreBusiness(scoringInput());

function savedRow(scanId: string, createdAt: string, isSubject: boolean, name: string, total: number) {
  return {
    scan_id: scanId,
    created_at: createdAt,
    is_subject: isSubject,
    place_id: `${scanId}-${name}`,
    name,
    address: null,
    distance_meters: isSubject ? null : 800,
    rating: 4.5,
    review_count: 20,
    has_website: true,
    total,
    grade: "C",
    scoring_version: "1.9.0",
    // Real saved rows always carry a breakdown (the comparable score is
    // computed from it); the same one for everyone keeps the saved order.
    breakdown_json: SAVED_BREAKDOWN,
    price_level: null,
    photo_count: 10,
  };
}
const OK_SCAN = {
  status: "ok",
  ranked: [
    { isSubject: true, placeId: "p-owner", name: "Modern Liquors", address: null, distanceMeters: null, rating: 4.5, reviewCount: 15, hasWebsite: true, priceLevel: null, photoCount: 10, breakdown: { total: 71, grade: "C", scoringVersion: "1.9.0", categories: [], checks: [] } },
    { isSubject: false, placeId: "p-1", name: "Main Street Liquors", address: null, distanceMeters: 639, rating: 4.7, reviewCount: 104, hasWebsite: true, priceLevel: null, photoCount: 10, breakdown: { total: 80, grade: "B", scoringVersion: "1.9.0", categories: [], checks: [] } },
  ],
};

beforeEach(() => {
  scanSpy.mockReset();
  scanSpy.mockResolvedValue(OK_SCAN);
});

describe("viewing the Competitors page makes no paid calls", () => {
  test("it renders the latest SAVED scan — the scan function is never called", async () => {
    const { client } = fakeSupabase({
      businesses: [BUSINESS],
      competitor_scans: [
        savedRow("new", "2026-10-11T18:00:00Z", true, "Modern Liquors", 72),
        savedRow("new", "2026-10-11T18:00:00Z", false, "Main Street Liquors", 80),
        savedRow("old", "2026-09-20T18:00:00Z", true, "Modern Liquors", 74),
        savedRow("old", "2026-09-20T18:00:00Z", false, "Main Street Liquors", 79),
      ],
    });
    const result = await getCompetitorsWithClient(client, "biz", NOW);
    expect(scanSpy).not.toHaveBeenCalled();
    if (result.status !== "ok") throw new Error(result.status);
    expect(result.latest?.scanId).toBe("new");
    expect(result.latest?.entries.map((e) => e.name)).toEqual(["Main Street Liquors", "Modern Liquors"]);
    expect(result.rankHistory.map((p) => [p.scanId, p.rank, p.of])).toEqual([
      ["old", 2, 2],
      ["new", 2, 2],
    ]);
    // Last scan Oct 11 → refresh opens Nov 10.
    expect(result.refresh).toEqual({ allowed: false, nextAvailableAt: "2026-11-10T18:00:00.000Z" });
  });

  test("no saved scan yet → latest is null and a first scan is allowed (still no call)", async () => {
    const { client } = fakeSupabase({ businesses: [BUSINESS], competitor_scans: [] });
    const result = await getCompetitorsWithClient(client, "biz", NOW);
    expect(scanSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "ok", latest: null, refresh: { allowed: true, nextAvailableAt: null } });
  });
});

describe("Refresh competitors: once per 30 days", () => {
  test("a refresh inside 30 days is refused before any paid call", async () => {
    const { client, inserted } = fakeSupabase({
      businesses: [BUSINESS],
      competitor_scans: [{ created_at: "2026-10-11T18:00:00Z" }],
    });
    const result = await runAndSaveCompetitorScanWithClient(client, "biz", { enforceCooldown: true, now: NOW });
    expect(result).toEqual({ status: "too_soon", nextAvailableAt: "2026-11-10T18:00:00.000Z" });
    expect(scanSpy).not.toHaveBeenCalled();
    expect(inserted.competitor_scans).toBeUndefined();
  });

  test("after 30 days: exactly one scan, every ranked row saved under one scan_id", async () => {
    const { client, inserted } = fakeSupabase({
      businesses: [BUSINESS],
      competitor_scans: [{ created_at: "2026-09-10T18:00:00Z" }],
    });
    const result = await runAndSaveCompetitorScanWithClient(client, "biz", { enforceCooldown: true, now: NOW });
    expect(result.status).toBe("saved");
    expect(scanSpy).toHaveBeenCalledTimes(1);
    const rows = inserted.competitor_scans as Array<{ scan_id: string; is_subject: boolean }>;
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.scan_id)).size).toBe(1);
  });
});

describe("Refresh competitors follows the plan (server-side, before any paid call)", () => {
  const scanned = (iso: string) => fakeSupabase({ businesses: [BUSINESS], competitor_scans: [{ created_at: iso, is_subject: true, place_id: "p-owner" }, { created_at: iso, is_subject: false, place_id: "rival" }] });

  test("Grow: refused inside 7 days, with the right date; allowed after", async () => {
    const early = scanned("2026-10-12T18:00:00Z");
    expect(await runAndSaveCompetitorScanWithClient(early.client, "biz", { enforceCooldown: true, plan: "grow", now: NOW })).toEqual({ status: "too_soon", nextAvailableAt: "2026-10-19T18:00:00.000Z" });
    expect(scanSpy).not.toHaveBeenCalled();
    const later = scanned("2026-10-09T15:00:00Z");
    expect((await runAndSaveCompetitorScanWithClient(later.client, "biz", { enforceCooldown: true, plan: "grow", now: NOW })).status).toBe("saved");
  });

  test("Premium and Multi: the same 24 hours as their own re-scan", async () => {
    for (const plan of ["premium", "multi"] as const) {
      scanSpy.mockClear();
      const recent = scanned("2026-10-16T10:00:00Z");
      expect(await runAndSaveCompetitorScanWithClient(recent.client, "biz", { enforceCooldown: true, plan, now: NOW })).toEqual({ status: "too_soon", nextAvailableAt: "2026-10-17T10:00:00.000Z" });
      expect(scanSpy).not.toHaveBeenCalled();
      const dayOld = scanned("2026-10-15T15:00:00Z");
      expect((await runAndSaveCompetitorScanWithClient(dayOld.client, "biz", { enforceCooldown: true, plan, now: NOW })).status).toBe("saved");
    }
  });

  test("the page's button and 'Available again on…' use the same rule", async () => {
    const grow = await getCompetitorsWithClient(scanned("2026-10-12T18:00:00Z").client, "biz", NOW, "grow");
    expect(grow.status === "ok" && grow.refresh).toEqual({ allowed: false, nextAvailableAt: "2026-10-19T18:00:00.000Z" });
    const premium = await getCompetitorsWithClient(scanned("2026-10-15T15:00:00Z").client, "biz", NOW, "premium");
    expect(premium.status === "ok" && premium.refresh).toEqual({ allowed: true, nextAvailableAt: null });
    // Free: never after a first scan that found competitors (no date to wait for).
    const free = await getCompetitorsWithClient(scanned("2026-09-01T18:00:00Z").client, "biz", NOW, "free");
    expect(free.status === "ok" && free.refresh).toEqual({ allowed: false, nextAvailableAt: null });
  });
});

describe("the automatic first competitor scan", () => {
  test("runs once when the business has never been scanned", async () => {
    const { client, inserted } = fakeSupabase({ businesses: [BUSINESS], competitor_scans: [] });
    const result = await ensureFirstCompetitorScanWithClient(client, "biz");
    expect(result.status).toBe("saved");
    expect(scanSpy).toHaveBeenCalledTimes(1);
    expect(inserted.competitor_scans).toHaveLength(2);
  });

  test("is skipped (no call) when any scan is already saved", async () => {
    const { client } = fakeSupabase({ businesses: [BUSINESS], competitor_scans: [{ created_at: "2026-10-15T00:00:00Z" }] });
    expect(await ensureFirstCompetitorScanWithClient(client, "biz")).toEqual({ status: "skipped" });
    expect(scanSpy).not.toHaveBeenCalled();
  });

  test("never throws — a failed scan can't fail the business save", async () => {
    const { client } = fakeSupabase({ businesses: [BUSINESS], competitor_scans: [] });
    scanSpy.mockRejectedValueOnce(new Error("Places down"));
    await expect(ensureFirstCompetitorScanWithClient(client, "biz")).resolves.toMatchObject({ status: "error" });
  });
});

import { competitorScanBlocker } from "@/lib/competitors";

describe("when a scan can't search at all (decided from saved data, no cost)", () => {
  test("only generic Google types ('store', 'service') → category_too_generic; no coordinates → no_location; specific → null", () => {
    const at = { lat: 39.68, lng: -75.75 };
    expect(competitorScanBlocker({ ...at, primaryType: "store", categories: ["point_of_interest", "store", "establishment"] })).toBe("category_too_generic");
    expect(competitorScanBlocker({ ...at, primaryType: "service", categories: ["service", "point_of_interest", "establishment"] })).toBe("category_too_generic");
    expect(competitorScanBlocker({ ...at, primaryType: "liquor_store", categories: ["liquor_store", "store"] })).toBeNull();
    expect(competitorScanBlocker({ lat: null, lng: null, primaryType: "liquor_store", categories: null })).toBe("no_location");
  });

  test("the page data says so for Pop Culture Vulture's 'store'-only listing — without any scan call", async () => {
    const { client } = fakeSupabase({
      businesses: [{ ...BUSINESS, name: "Pop Culture Vulture", primary_type: "store", categories: ["point_of_interest", "store", "establishment"] }],
      competitor_scans: [],
    });
    const result = await getCompetitorsWithClient(client, "biz", NOW);
    expect(result).toMatchObject({ status: "ok", latest: null, scanBlocker: "category_too_generic" });
    expect(scanSpy).not.toHaveBeenCalled();
  });
});

import { scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { competitorFallbackTypes } from "@/lib/competitors";

describe("which types a scan compares by", () => {
  test("Google's generic 'service' + owner type repair_dropoff → laundry, tailor; a specific Google type → none", () => {
    expect(competitorFallbackTypes({ primaryType: "service", categories: ["service", "establishment"], fallbackPlaceTypes: ["laundry", "tailor"] })).toEqual(["laundry", "tailor"]);
    expect(competitorFallbackTypes({ primaryType: "shoe_store", categories: ["shoe_store"], fallbackPlaceTypes: ["laundry", "tailor"] })).toEqual([]);
    expect(competitorFallbackTypes({ primaryType: "store", categories: ["store"], fallbackPlaceTypes: [] })).toEqual([]);
  });
});

describe("a search that didn't run is never shown as “found none”", () => {
  test("the month's cap reached: 'capped' (with the date it resumes) — no Nearby Search call, nothing saved", async () => {
    const { client, inserted } = fakeSupabase({ businesses: [BUSINESS], competitor_scans: [] });
    const result = await runAndSaveCompetitorScanWithClient(client, "biz", { enforceCooldown: false, now: NOW, budget: async () => ({ used: 800 }), logCalls: async () => undefined });
    expect(result).toEqual({ status: "capped", nextAvailableAt: "2026-11-01T00:00:00.000Z" });
    expect(scanSpy).not.toHaveBeenCalled();
    expect(inserted.competitor_scans).toBeUndefined();
  });

  test("a failed search: 'error' with the reason (logged) — never 'no_data'", async () => {
    scanSpy.mockResolvedValue({ status: "error", message: "Google Places nearby search failed (503).", ranked: [], unscored: [], placesCalls: 1 });
    const { client } = fakeSupabase({ businesses: [BUSINESS], competitor_scans: [] });
    const result = await runAndSaveCompetitorScanWithClient(client, "biz", { enforceCooldown: false, now: NOW, budget: async () => ({ used: 0 }), logCalls: async () => undefined });
    expect(result).toEqual({ status: "error", message: "Google Places nearby search failed (503)." });
  });

  test("the Competitors page: Free gets “Refresh” only when the latest scan found no competitors (the one exception)", async () => {
    const none = fakeSupabase({ businesses: [BUSINESS], competitor_scans: [savedRow("s", "2026-10-15T18:00:00Z", true, "Modern Liquors", 72)] });
    const found = fakeSupabase({ businesses: [BUSINESS], competitor_scans: [savedRow("s", "2026-10-15T18:00:00Z", true, "Modern Liquors", 72), savedRow("s", "2026-10-15T18:00:00Z", false, "Main Street Liquors", 80)] });
    const a = await getCompetitorsWithClient(none.client, "biz", NOW, "free");
    const b = await getCompetitorsWithClient(found.client, "biz", NOW, "free");
    if (a.status !== "ok" || b.status !== "ok") throw new Error("expected ok");
    expect(a.refresh.allowed).toBe(true);
    expect(b.refresh.allowed).toBe(false);
  });
});
