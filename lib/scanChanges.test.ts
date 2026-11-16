import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { diffProfileSnapshots, type ProfileSnapshot } from "./profileChanges";
import { fingerprintSnapshot, newReviewsSince, parseFieldFingerprints, scanChangeRecords } from "./scanChanges";
import { recordScanChanges, scanFingerprintKey } from "./scanChanges.server";

const snap = (over: Partial<ProfileSnapshot> = {}): ProfileSnapshot => ({
  phone: "(908) 555-0100",
  website: "https://hairexpress.example",
  openingHours: ["Monday: 9 AM – 5 PM", "Tuesday: 9 AM – 5 PM"],
  categories: ["hair_salon", "beauty_salon"],
  photoCount: 6,
  rating: 4.5,
  reviewCount: 120,
  businessStatus: "OPERATIONAL",
  name: "Hair Express",
  address: "1 Main St, Westfield, NJ",
  ...over,
});

const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 9);
const fp = (s: ProfileSnapshot, key = KEY, businessId = "b1") => fingerprintSnapshot(s, businessId, key);

describe("from the values on hand: the same changes as today's 'what changed'", () => {
  const pairs: Array<[string, Partial<ProfileSnapshot>, Partial<ProfileSnapshot>]> = [
    ["nothing", {}, {}],
    ["phone added", { phone: null }, {}],
    ["phone removed", {}, { phone: null }],
    ["phone changed", {}, { phone: "(908) 555-0199" }],
    ["website changed", {}, { website: "https://new.example" }],
    ["hours changed", {}, { openingHours: ["Monday: 10 AM – 6 PM"] }],
    ["hours removed", {}, { openingHours: null }],
    ["categories reordered (no change)", {}, { categories: ["beauty_salon", "hair_salon"] }],
    ["category added", {}, { categories: ["hair_salon", "beauty_salon", "barber_shop"] }],
    ["photos +3", {}, { photoCount: 9 }],
    ["photos to the cap", {}, { photoCount: 10 }],
    ["photos both at the cap", { photoCount: 10 }, { photoCount: 10 }],
    ["photos unknown baseline", { photoCount: null }, {}],
    ["rating down", {}, { rating: 4.4 }],
    ["rating unknown baseline", { rating: null }, {}],
    ["reviews +3", {}, { reviewCount: 123 }],
    ["reviews lost", {}, { reviewCount: 118 }],
    ["status", {}, { businessStatus: "CLOSED_TEMPORARILY" }],
    ["name", {}, { name: "Hair Express Salon" }],
    ["older scan without name / address", { name: undefined, address: undefined }, { name: "Other", address: "Elsewhere" }],
    ["everything at once", {}, { phone: null, website: null, openingHours: null, categories: ["spa"], photoCount: 2, rating: 4.9, reviewCount: 200, businessStatus: "CLOSED_PERMANENTLY", name: "X", address: "Y" }],
  ];

  test.each(pairs)("%s", (_label, prev, curr) => {
    const p = snap(prev);
    const c = snap(curr);
    const records = scanChangeRecords({ snapshot: p }, { snapshot: c });
    expect(records.map((r) => r.field).sort()).toEqual(diffProfileSnapshots(p, c).map((d) => d.field).sort());
  });

  test("directions and amounts — a rating or review count only 'changed' (never an amount we can't keep knowing)", () => {
    const r = scanChangeRecords({ snapshot: snap() }, { snapshot: snap({ reviewCount: 123, rating: 4.4, photoCount: 10, phone: null, website: "https://new.example" }) });
    expect(r).toEqual(
      expect.arrayContaining([
        { field: "reviews", direction: "changed", delta: null },
        { field: "rating", direction: "changed", delta: null },
        // Crossing Google's photo cap: a direction, never an amount.
        { field: "photos", direction: "up", delta: null },
        { field: "phone", direction: "removed", delta: null },
        { field: "website", direction: "changed", delta: null },
      ])
    );
  });

  test("no previous scan: nothing", () => {
    expect(scanChangeRecords(null, { snapshot: snap() })).toEqual([]);
  });
});

describe("from fingerprints only (no saved values)", () => {
  test("a fingerprint holds none of the value, and binds the business", () => {
    const f = fp(snap());
    const json = JSON.stringify(f);
    for (const v of ["555-0100", "hairexpress", "Monday", "hair_salon", "4.5", "120", "OPERATIONAL", "Hair Express", "Main St"]) expect(json).not.toContain(v);
    expect(f.f.phone).toMatch(/^[0-9a-f]{16}$/);
    expect(fp(snap()).f.phone).toBe(f.f.phone);
    expect(fp(snap(), KEY, "b2").f.phone).not.toBe(f.f.phone);
    expect(fp(snap({ phone: null })).f.phone).toBeNull();
    expect("name" in fp(snap({ name: undefined })).f).toBe(false);
  });

  test("tells a field changed, was added or removed — numbers only 'changed', never a direction or amount", () => {
    const r = scanChangeRecords(
      { fingerprints: fp(snap({ phone: null })) },
      { fingerprints: fp(snap({ openingHours: ["Monday: 10 AM – 6 PM"], reviewCount: 123, rating: 4.4, website: null })) }
    );
    expect(r).toEqual([
      { field: "phone", direction: "added", delta: null },
      { field: "website", direction: "removed", delta: null },
      { field: "hours", direction: "changed", delta: null },
      { field: "rating", direction: "changed", delta: null },
      { field: "reviews", direction: "changed", delta: null },
    ]);
  });

  test("the same rules as with values: unknown numbers, both-capped photos, reordered categories and older scans are no change", () => {
    expect(scanChangeRecords({ fingerprints: fp(snap({ rating: null, reviewCount: null })) }, { fingerprints: fp(snap()) })).toEqual([]);
    expect(scanChangeRecords({ fingerprints: fp(snap({ photoCount: 10 })) }, { fingerprints: fp(snap({ photoCount: 25 })) })).toEqual([]);
    expect(scanChangeRecords({ fingerprints: fp(snap()) }, { fingerprints: fp(snap({ categories: ["beauty_salon", "hair_salon"] })) })).toEqual([]);
    expect(scanChangeRecords({ fingerprints: fp(snap({ name: undefined })) }, { fingerprints: fp(snap({ name: "Other" })) })).toEqual([]);
  });

  test("a different key never compares (nothing guessed)", () => {
    expect(scanChangeRecords({ fingerprints: fp(snap(), OTHER_KEY) }, { fingerprints: fp(snap({ phone: null })) })).toEqual([]);
  });

  test("values win when both scans have them", () => {
    const r = scanChangeRecords({ snapshot: snap(), fingerprints: fp(snap()) }, { snapshot: snap({ phone: null }), fingerprints: fp(snap({ phone: "(908) 555-0199" })) });
    expect(r).toEqual([{ field: "phone", direction: "removed", delta: null }]);
  });

  test("parse", () => {
    expect(parseFieldFingerprints(null)).toBeNull();
    expect(parseFieldFingerprints({ f: {} })).toBeNull();
    expect(parseFieldFingerprints(fp(snap()))).toEqual(fp(snap()));
  });
});

describe("connected owners: exact new reviews from Business Profile", () => {
  const since = "2026-11-01T00:00:00Z";
  const times = (createTimes: string[], capped = false) => ({ createTimes, oldestUpdateTime: createTimes.length ? createTimes[createTimes.length - 1] : null, capped });

  test("counts reviews written after the previous scan", () => {
    expect(newReviewsSince(times(["2026-11-10T00:00:00Z", "2026-11-05T00:00:00Z", "2026-10-20T00:00:00Z"]), since)).toBe(2);
    expect(newReviewsSince(times(["2026-10-20T00:00:00Z"]), since)).toBe(0);
  });

  test("a list cut off before reaching the previous scan: unknown, never a minimum", () => {
    expect(newReviewsSince(times(["2026-11-10T00:00:00Z", "2026-11-05T00:00:00Z"], true), since)).toBeNull();
    expect(newReviewsSince(times(["2026-11-10T00:00:00Z", "2026-10-05T00:00:00Z"], true), since)).toBe(1);
  });

  test("+N reviews when known; otherwise only 'changed'", () => {
    const prev = { snapshot: snap() };
    expect(scanChangeRecords(prev, { snapshot: snap({ reviewCount: 123 }) }, { newReviews: 3 })).toEqual([{ field: "reviews", direction: "up", delta: 3 }]);
    // One removed, one written: the count didn't move, but a new review is a fact.
    expect(scanChangeRecords(prev, { snapshot: snap() }, { newReviews: 1 })).toEqual([{ field: "reviews", direction: "up", delta: 1 }]);
    expect(scanChangeRecords(prev, { snapshot: snap({ reviewCount: 118 }) }, { newReviews: 0 })).toEqual([{ field: "reviews", direction: "changed", delta: null }]);
    expect(scanChangeRecords(prev, { snapshot: snap({ reviewCount: 123 }) }, { newReviews: null })).toEqual([{ field: "reviews", direction: "changed", delta: null }]);
  });
});

describe("written at each scan", () => {
  const env = { GBP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64") };

  function fakeDb(previous: Record<string, unknown> | null) {
    const writes: Array<{ table: string; op: string; value: unknown }> = [];
    const db = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "neq", "order", "limit"]) chain[m] = () => chain;
        chain.maybeSingle = async () => ({ data: previous, error: null });
        chain.update = (value: unknown) => (writes.push({ table, op: "update", value }), { eq: async () => ({ error: null }) });
        chain.insert = async (value: unknown) => (writes.push({ table, op: "insert", value }), { error: null });
        return chain;
      },
    } as unknown as SupabaseClient;
    return { db, writes };
  }

  test("saves this scan's fingerprints and one row per changed field, linked to the previous scan", async () => {
    const { db, writes } = fakeDb({ id: "s-prev", profile_snapshot_json: snap(), field_fingerprints: null });
    const records = await recordScanChanges(db, "b1", "s-new", snap({ reviewCount: 123, openingHours: null }), { env, at: "2026-11-16T12:00:00Z" });
    expect(records).toHaveLength(2);
    const fpWrite = writes.find((w) => w.table === "scores")!;
    expect(fpWrite.op).toBe("update");
    expect(JSON.stringify(fpWrite.value)).not.toContain("555-0100");
    expect(writes.find((w) => w.table === "scan_changes")!.value).toEqual([
      { business_id: "b1", score_id: "s-new", previous_score_id: "s-prev", field: "hours", direction: "removed", delta: null, at: "2026-11-16T12:00:00Z" },
      { business_id: "b1", score_id: "s-new", previous_score_id: "s-prev", field: "reviews", direction: "changed", delta: null, at: "2026-11-16T12:00:00Z" },
    ]);
  });

  test("first scan, or nothing changed: no rows", async () => {
    const first = fakeDb(null);
    expect(await recordScanChanges(first.db, "b1", "s1", snap(), { env })).toEqual([]);
    const same = fakeDb({ id: "s0", profile_snapshot_json: snap(), field_fingerprints: null });
    expect(await recordScanChanges(same.db, "b1", "s1", snap(), { env })).toEqual([]);
    expect(same.writes.some((w) => w.table === "scan_changes")).toBe(false);
  });

  test("a connected owner's review dates from this scan give the exact count", async () => {
    const { db, writes } = fakeDb({ id: "s-prev", created_at: "2026-11-01T00:00:00Z", profile_snapshot_json: snap(), field_fingerprints: null });
    await recordScanChanges(db, "b1", "s-new", snap({ reviewCount: 122 }), { env, gbpReviews: { createTimes: ["2026-11-12T00:00:00Z", "2026-11-03T00:00:00Z", "2026-09-01T00:00:00Z"], oldestUpdateTime: "2026-09-01T00:00:00Z", capped: false } });
    expect(writes.find((w) => w.table === "scan_changes")!.value).toEqual([expect.objectContaining({ field: "reviews", direction: "up", delta: 2 })]);
  });

  test("the previous scan's snapshot already cleared: its fingerprints are used", async () => {
    const key = scanFingerprintKey(env)!;
    const { db, writes } = fakeDb({ id: "s0", profile_snapshot_json: null, field_fingerprints: fingerprintSnapshot(snap(), "b1", key) });
    await recordScanChanges(db, "b1", "s1", snap({ phone: "(908) 555-0199" }), { env });
    expect(writes.find((w) => w.table === "scan_changes")!.value).toEqual([expect.objectContaining({ field: "phone", direction: "changed", delta: null })]);
  });

  test("without the key: no fingerprints saved, changes still from the values on hand", async () => {
    const { db, writes } = fakeDb({ id: "s0", profile_snapshot_json: snap(), field_fingerprints: null });
    expect(await recordScanChanges(db, "b1", "s1", snap({ reviewCount: 121 }), { env: {} })).toHaveLength(1);
    expect(writes.some((w) => w.table === "scores")).toBe(false);
  });

  test("the scan writes them right after its score is saved, and a failure never fails the scan", () => {
    const src = readFileSync("app/actions/scoring.ts", "utf8");
    expect(src).toMatch(/profile_snapshot_json: snapshot,[\s\S]{0,900}try \{[\s\S]{0,400}await recordScanChanges\(createAdminClient\(\), businessId, data\.id, snapshot, \{ gbpReviews: options\.gbpReviews \}\);[\s\S]{0,40}\} catch/);
    // The rescan hands over the review dates its Business Profile check just read.
    expect(src).toContain("const replyCheck = await runGbpReplyCheck(businessId);");
    expect(src).toContain('saveScoreSnapshotWithClient(supabase, businessId, undefined, { gbpReviews: replyCheck.status === "ok" ? replyCheck.reviewTimes : null })');
  });
});
