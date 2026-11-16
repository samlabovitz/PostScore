import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { changesAcross, fingerprintSnapshot, newReviewsSince, ratingChangedOf, reviewCountChangeOf, scansBetween, type ScanChangeRecord } from "./scanChanges";
import { describeScanChanges } from "./scanChangeText";
import { compareScans, type WeeklyScan } from "./weekly/weeklyReport";
import { backfillScanChanges } from "./scanChangesBackfill.server";
import type { ProfileSnapshot } from "./profileChanges";

const src = (f: string) => readFileSync(f, "utf8");
const rec = (field: ScanChangeRecord["field"], direction: ScanChangeRecord["direction"], delta: number | null = null): ScanChangeRecord => ({ field, direction, delta });

describe("what changed across several scans", () => {
  const scans = [{ id: "a", fpKey: "k1" }, { id: "b", fpKey: "k1" }, { id: "c", fpKey: "k1" }];

  test("adds up exact new reviews and photos; otherwise just 'changed'", () => {
    const records = new Map([
      ["b", [rec("reviews", "up", 2), rec("phone", "added"), rec("photos", "up", 1)]],
      ["c", [rec("reviews", "up", 3), rec("phone", "removed"), rec("photos", "up", null)]],
    ]);
    expect(changesAcross(scans, records)).toEqual({
      available: true,
      records: [rec("phone", "changed"), rec("photos", "up"), rec("reviews", "up", 5)],
    });
    // One exact, one not: no amount.
    expect(changesAcross(scans, new Map([["b", [rec("reviews", "up", 2)]], ["c", [rec("reviews", "changed")]]])).records).toEqual([rec("reviews", "changed")]);
  });

  test("unknown — never 'nothing changed' — when a scan has no fingerprints, another key, or the records couldn't be read", () => {
    expect(changesAcross([{ id: "a", fpKey: "k1" }, { id: "b", fpKey: null }], new Map())).toEqual({ available: false, records: [] });
    expect(changesAcross([{ id: "a", fpKey: "k1" }, { id: "b", fpKey: "k2" }], new Map())).toEqual({ available: false, records: [] });
    expect(changesAcross(scans, null).available).toBe(false);
    expect(changesAcross([{ id: "a", fpKey: "k1" }], new Map()).available).toBe(false);
    expect(changesAcross(scans, new Map())).toEqual({ available: true, records: [] });
  });

  test("the scans between two, in order", () => {
    const all = [
      { id: "c", fpKey: "k", createdAt: "2026-11-03T00:00:00Z" },
      { id: "a", fpKey: "k", createdAt: "2026-11-01T00:00:00Z" },
      { id: "x", fpKey: "k", createdAt: "2026-11-09T00:00:00Z" },
      { id: "b", fpKey: "k", createdAt: "2026-11-02T00:00:00Z" },
    ];
    expect(scansBetween(all, all[1], all[0]).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  test("review count and rating outcomes", () => {
    expect(reviewCountChangeOf({ available: true, records: [rec("reviews", "up", 3)] })).toEqual({ kind: "exact", delta: 3 });
    expect(reviewCountChangeOf({ available: true, records: [rec("reviews", "changed")] })).toEqual({ kind: "changed" });
    expect(reviewCountChangeOf({ available: true, records: [] })).toEqual({ kind: "none" });
    expect(reviewCountChangeOf({ available: false, records: [] })).toBeNull();
    expect(ratingChangedOf({ available: true, records: [rec("rating", "changed")] })).toBe(true);
    expect(ratingChangedOf({ available: true, records: [] })).toBe(false);
    expect(ratingChangedOf({ available: false, records: [] })).toBeNull();
  });

  test("new reviews between two dates (the backfill's pairs)", () => {
    const times = { createTimes: ["2026-11-10T00:00:00Z", "2026-11-05T00:00:00Z", "2026-10-20T00:00:00Z"], oldestUpdateTime: "2026-10-20T00:00:00Z", capped: false };
    expect(newReviewsSince(times, "2026-11-01T00:00:00Z", "2026-11-07T00:00:00Z")).toBe(1);
    expect(newReviewsSince(times, "2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z")).toBe(1);
  });
});

describe("the sentences (EN + ES): the same as before where a record says as much, '… changed' where it can't", () => {
  test("EN", () => {
    const lines = describeScanChanges(
      [rec("phone", "added"), rec("hours", "changed"), rec("categories", "changed"), rec("photos", "up", 3), rec("photos", "down"), rec("status", "changed"), rec("rating", "changed"), rec("reviews", "changed"), rec("name", "changed")],
      "en",
      { rating: 4.6, reviewCount: 58 }
    ).map((c) => c.description);
    expect(lines).toEqual([
      "A phone number was added to your listing.",
      "Your hours changed.",
      "Your categories changed.",
      "3 photos added.",
      expect.stringContaining("10"),
      "Your listing status changed.",
      "Rating changed · now 4.6★",
      "Review count changed · now 58",
      "Your business name on Google changed",
    ]);
    expect(describeScanChanges([rec("reviews", "up", 3)], "en")[0].description).toBe("3 new reviews.");
    // No value to show: no "now".
    expect(describeScanChanges([rec("rating", "changed")], "en")[0].description).toBe("Rating changed");
  });

  test("ES", () => {
    const lines = describeScanChanges([rec("categories", "changed"), rec("status", "changed"), rec("photos", "changed"), rec("rating", "changed")], "es", { rating: 4.6 }).map((c) => c.description);
    expect(lines).toEqual(["Sus categorías cambiaron.", "El estado de su ficha cambió.", "El número de fotos cambió.", "La calificación cambió · ahora 4.6★"]);
  });
});

describe("the weekly recap and 'Since your last visit' compare through the records of every scan between", () => {
  const scan = (id: string, createdAt: string, changes: ScanChangeRecord[] | null, fpKey: string | null = "k"): WeeklyScan => ({
    id, total: 70, grade: "C", createdAt, scoringVersion: "1.15.0", categories: null, profile: { reviewCount: 58, rating: 4.6 } as ProfileSnapshot, fpKey, changes,
  });
  const a = scan("a", "2026-11-01T00:00:00Z", []);
  const b = scan("b", "2026-11-04T00:00:00Z", [rec("reviews", "up", 2), rec("hours", "changed")]);
  const c = scan("c", "2026-11-08T00:00:00Z", [rec("reviews", "up", 1), rec("rating", "changed")]);

  test("exact reviews add up; the rating only 'changed'; listing lines from the records", () => {
    const cmp = compareScans(a, c, "en", [a, b, c]);
    expect(cmp.reviews).toMatchObject({ count: 58, countChange: 3, countChanged: false, ratingChange: null, ratingChanged: true });
    expect(cmp.listingChanges.map((x) => x.description)).toEqual(["Your hours changed.", "Rating changed · now 4.6★", "3 new reviews."]);
    expect(cmp.changesUnavailable).toBe(false);
  });

  test("not connected: 'changed', no number", () => {
    const c2 = scan("c", "2026-11-08T00:00:00Z", [rec("reviews", "changed")]);
    expect(compareScans(a, c2, "en", [a, c2]).reviews).toMatchObject({ countChange: null, countChanged: true });
  });

  test("nothing changed: 0 — and unknown when a scan in between wasn't fingerprinted or its records couldn't be read", () => {
    const quiet = scan("q", "2026-11-08T00:00:00Z", []);
    expect(compareScans(a, quiet, "en", [a, quiet]).reviews).toMatchObject({ countChange: 0, ratingChange: 0 });
    const old = scan("o", "2026-11-04T00:00:00Z", [], null);
    expect(compareScans(a, c, "en", [a, old, c]).changesUnavailable).toBe(true);
    const unread = scan("u", "2026-11-04T00:00:00Z", null);
    expect(compareScans(a, c, "en", [a, unread, c])).toMatchObject({ changesUnavailable: true, reviews: { countChange: null } });
  });
});

describe("every reader uses the records — none diffs saved Google values any more", () => {
  test("Overview, Reports (+ PDF), weekly, monthly send + preview, section 6", () => {
    for (const f of ["components/overview/SinceLastScanCard.tsx", "app/actions/reports.ts", "lib/reports/reportData.server.ts", "lib/weekly/weeklyReport.ts", "lib/monthlyReport.ts", "lib/googleProfileTab.server.ts", "lib/overviewTiles.ts"]) {
      expect(src(f)).not.toMatch(/diffProfileSnapshots\(|profile_snapshot_json\?\.reviewCount|\.profile\?\.reviewCount - |prevRating/);
    }
    expect(src("app/actions/scoring.ts")).toContain("listing_changes: changesAcross(");
    expect(src("app/actions/reports.ts")).toContain("loadScanChangeRecords(supabase");
    expect(src("lib/weekly/weekly.server.ts")).toContain("loadScanChangeRecords(supabase");
    expect(src("lib/googleProfileTab.server.ts")).toContain("loadScanChangeRecords(db, [to.id])");
    expect(src("app/api/cron/monthly-reports/route.ts")).toContain("listingChanges: await scanChangesBetweenScores(supabase, businessId, baselineRow.id, currentForDisplay.id)");
    expect(src("scripts/preview-report.ts")).toContain("listingChanges: await (await scanChangesBetween())(supabase, businessId, baselineRow.id, currentForDisplay.id)");
  });
});

describe("backfill: fingerprints for saved scans, records from saved pairs", () => {
  const KEY = Buffer.alloc(32, 5);
  const snap = (over: Partial<ProfileSnapshot> = {}): ProfileSnapshot => ({ phone: "1", website: "w", openingHours: ["Mon 9–5"], categories: ["salon"], photoCount: 5, rating: 4.5, reviewCount: 50, businessStatus: "OPERATIONAL", ...over });

  function fakeDb(scores: Array<Record<string, unknown>>, existing: Array<{ score_id: string }> = []) {
    const writes: Array<{ table: string; op: string; value: unknown; id?: unknown }> = [];
    const db = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        let filterBusiness: unknown = null;
        for (const m of ["select", "order"]) chain[m] = () => chain;
        chain.eq = (_c: string, v: unknown) => ((filterBusiness = v), chain);
        chain.range = async () => ({ data: scores, error: null });
        chain.then = (resolve: (v: unknown) => void) => resolve({ data: table === "scan_changes" ? existing.filter(() => filterBusiness !== null) : [], error: null });
        chain.update = (value: unknown) => ({ eq: async (_c: string, id: unknown) => (writes.push({ table, op: "update", value, id }), { error: null }) });
        chain.insert = async (value: unknown) => (writes.push({ table, op: "insert", value }), { error: null });
        return chain;
      },
    } as unknown as SupabaseClient;
    return { db, writes };
  }
  const rows = [
    { id: "s0", business_id: "b1", created_at: "2026-09-01T00:00:00Z", profile_snapshot_json: null, field_fingerprints: null },
    { id: "s1", business_id: "b1", created_at: "2026-10-01T00:00:00Z", profile_snapshot_json: snap(), field_fingerprints: null },
    { id: "s2", business_id: "b1", created_at: "2026-11-01T00:00:00Z", profile_snapshot_json: snap({ reviewCount: 53, openingHours: ["Mon 10–6"] }), field_fingerprints: null },
  ];

  test("dry run: counts, writes nothing", async () => {
    const { db, writes } = fakeDb(rows);
    const c = await backfillScanChanges(db, { dryRun: true, key: KEY, gbpReviews: async () => null });
    expect(c).toMatchObject({ businesses: 1, scores: 3, fingerprinted: 2, pairs: 1, records: 2, withoutSnapshot: 1, byField: { hours: 1, reviews: 1 }, exactReviewRecords: 0 });
    expect(writes).toEqual([]);
  });

  test("live: fingerprints (codes only) and records dated at the later scan; a connected owner's new reviews exact", async () => {
    const { db, writes } = fakeDb(rows);
    const c = await backfillScanChanges(db, { dryRun: false, key: KEY, gbpReviews: async () => ({ createTimes: ["2026-10-20T00:00:00Z", "2026-10-15T00:00:00Z", "2026-11-10T00:00:00Z", "2026-09-01T00:00:00Z"].sort().reverse(), oldestUpdateTime: "2026-09-01T00:00:00Z", capped: false }) });
    expect(c.exactReviewRecords).toBe(1);
    const fps = writes.filter((w) => w.table === "scores");
    expect(fps.map((w) => w.id)).toEqual(["s1", "s2"]);
    expect(JSON.stringify(fps)).not.toMatch(/Mon|salon|OPERATIONAL|4\.5/);
    expect(fps[0].value).toEqual({ field_fingerprints: fingerprintSnapshot(snap(), "b1", KEY) });
    expect(writes.find((w) => w.table === "scan_changes")!.value).toEqual([
      { business_id: "b1", score_id: "s2", previous_score_id: "s1", field: "hours", direction: "changed", delta: null, at: "2026-11-01T00:00:00Z" },
      { business_id: "b1", score_id: "s2", previous_score_id: "s1", field: "reviews", direction: "up", delta: 2, at: "2026-11-01T00:00:00Z" },
    ]);
  });

  test("a scan that recorded its own changes (fingerprinted at the scan) is left as it is", async () => {
    const recorded = [rows[1], { ...rows[2], field_fingerprints: fingerprintSnapshot(rows[2].profile_snapshot_json as ProfileSnapshot, "b1", KEY) }];
    const { db, writes } = fakeDb(recorded);
    const c = await backfillScanChanges(db, { dryRun: false, key: KEY, gbpReviews: async () => null });
    expect(c).toMatchObject({ fingerprinted: 1, pairs: 0, records: 0 });
    expect(writes.map((w) => w.id)).toEqual(["s1"]);
  });
});

describe("the monthly email counts only what changed AFTER the last report's scan", () => {
  // Hair Express, Nov 16: +1 review was recorded at the Sep 17 scan — the
  // scan the September report was built on. This month's report starts
  // there, so that +1 belongs to September, not to "since your last report".
  function fakeDb() {
    const scores = [
      { id: "sep11", created_at: "2026-09-11T21:01:39Z", fp_key: "k" },
      { id: "sep17", created_at: "2026-09-17T21:54:26Z", fp_key: "k" },
      { id: "oct06", created_at: "2026-10-06T20:30:57Z", fp_key: "k" },
      { id: "nov16", created_at: "2026-11-16T21:43:45Z", fp_key: "k" },
    ];
    const changes = [{ score_id: "sep17", field: "reviews", direction: "up", delta: 1 }];
    const db = {
      from(table: string) {
        let rows: Array<Record<string, unknown>> = table === "scores" ? scores : changes;
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.order = () => chain;
        chain.eq = () => chain;
        chain.in = (col: string, ids: string[]) => ((rows = rows.filter((r) => ids.includes(String(r[col])))), chain);
        chain.gte = (_c: string, v: string) => ((rows = rows.filter((r) => Date.parse(String(r.created_at)) >= Date.parse(v))), chain);
        chain.lte = (_c: string, v: string) => ((rows = rows.filter((r) => Date.parse(String(r.created_at)) <= Date.parse(v))), chain);
        chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
        return chain;
      },
    } as unknown as SupabaseClient;
    return db;
  }

  test("baseline Sep 17 → now: the +1 recorded at Sep 17 isn't counted (review count unchanged)", async () => {
    const { scanChangesBetweenScores } = await import("./scanChanges.server");
    const summary = await scanChangesBetweenScores(fakeDb(), "b", "sep17", "nov16");
    expect(summary).toEqual({ available: true, records: [] });
    expect(reviewCountChangeOf(summary)).toEqual({ kind: "none" });
  });

  test("baseline Sep 11 → now: it is ('1 new review')", async () => {
    const { scanChangesBetweenScores } = await import("./scanChanges.server");
    const summary = await scanChangesBetweenScores(fakeDb(), "b", "sep11", "nov16");
    expect(reviewCountChangeOf(summary)).toEqual({ kind: "exact", delta: 1 });
  });
});
