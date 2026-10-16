import { beforeEach, describe, expect, test, vi } from "vitest";

// Part B — the cost rules for paid competitor scans. Every Google call in
// a scan goes through findAndScoreCompetitors (lib/competitors.ts); these
// tests replace it with a spy so "no paid call" is checked directly.
const scanSpy = vi.fn();
vi.mock("@/lib/competitors", () => ({
  findAndScoreCompetitors: (...args: unknown[]) => scanSpy(...args),
  MAX_COMPETITORS: 10,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

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
      for (const m of ["select", "eq", "order", "limit", "in", "update"]) chain[m] = () => chain;
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
    breakdown_json: null,
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
