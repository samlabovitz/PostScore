import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMPETITOR_RAW_COLUMNS,
  alsoNearbyWithoutGoogle,
  breakdownWithoutQuotes,
  clearedRowPatch,
  hasRawValues,
  rawCleared,
  websiteAnalysisWithoutGoogle,
} from "./competitorRawCleanup";
import { cleanCompetitorRawValues, clearScanRawValues } from "./competitorRawCleanup.server";
import { checkStatus, isFullScored, websiteNotChecked } from "./competitorComparison";
import type { SavedCompetitorEntry } from "./savedCompetitorScans";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-11-16T12:00:00Z");
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * HOUR).toISOString();

const breakdown = (explanation = "Rated 4.6★ on Google") => ({
  total: 72,
  grade: "C",
  scoringVersion: "1.15.0",
  categories: [],
  checks: [
    { id: "visibility.rating", earnedPoints: 9, maxPoints: 10, confidence: "VERIFIED", explanation, meta: { ratingBand: "high" } },
    { id: "visibility.review_recency", earnedPoints: 2, maxPoints: 6, confidence: "LIKELY", explanation: "3 recent reviews", note: "Based on Google", meta: { source: "places", recentReviews: "3" } },
  ],
});

// A first-pass score: "has a website" only, the website itself not read yet.
const firstPassWebsite = { id: "website.has_website", category: "website", earnedPoints: 10, maxPoints: 10, confidence: "VERIFIED", explanation: "", meta: null };

function rawRow(id: string, scanId: string, hoursAgo: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    scan_id: scanId,
    business_id: "biz",
    created_at: iso(hoursAgo),
    is_subject: false,
    place_id: `p-${id}`,
    distance_meters: 800,
    total: 72,
    grade: "C",
    scoring_version: "1.15.0",
    name: "Main Street Salon",
    address: "1 Main St",
    rating: 4.6,
    review_count: 120,
    has_website: true,
    website_url: "https://salon.example",
    phone: "(908) 555-0100",
    opening_hours: { weekday: ["Mon: 9–5"] },
    categories: ["hair_salon"],
    business_status: "OPERATIONAL",
    price_level: "PRICE_LEVEL_MODERATE",
    photo_count: 10,
    service_options: null,
    breakdown_json: breakdown(),
    pending_breakdown_json: null,
    website_analysis_json: { websiteTrust: { infoConflicts: [{ field: "phone", comparison: "mismatch", siteValue: "(908) 555-0199", googleValue: "(908) 555-0100" }] } },
    also_nearby_json: null,
    ...extra,
  };
}

/** A tiny in-memory Supabase: just the calls the cleanup makes. */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
  const updates: Array<{ table: string; patch: Record<string, unknown>; ids: unknown[] }> = [];
  const from = (table: string) => {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    let patch: Record<string, unknown> | null = null;
    let head = false;
    let limitN: number | null = null;
    let range: [number, number] | null = null;
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const q: Record<string, unknown> = {
      select: (_cols: string, opts?: { head?: boolean }) => ((head = !!opts?.head), q),
      update: (p: Record<string, unknown>) => ((patch = p), q),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      gt: (c: string, v: string) => (filters.push((r) => String(r[c]) > v), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      // Only `.not(column, "is", null)` is used.
      not: (c: string) => (filters.push((r) => r[c] !== null && r[c] !== undefined), q),
      or: (expr: string) => {
        const cols = expr.split(",").map((p) => p.split(".")[0]);
        filters.push((r) => cols.some((c) => r[c] !== null && r[c] !== undefined));
        return q;
      },
      order: () => q,
      limit: (n: number) => ((limitN = n), q),
      range: (a: number, b: number) => ((range = [a, b]), q),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => {
        if (patch) {
          const hit = rows();
          for (const r of hit) Object.assign(r, patch);
          updates.push({ table, patch, ids: hit.map((r) => r.id ?? r.scan_id) });
          return resolve({ data: null, error: null });
        }
        let out = rows();
        if (range) out = out.slice(range[0], range[1] + 1);
        if (limitN !== null) out = out.slice(0, limitN);
        return resolve(head ? { count: out.length, data: null, error: null } : { data: out, error: null });
      },
    };
    return q;
  };
  return { db: { from } as unknown as SupabaseClient, updates, tables };
}

describe("what a cleared row keeps: our own results only", () => {
  test("every Google column blanked; place ID, distance, score, grade and points untouched", () => {
    const row = rawRow("r1", "s1", 30);
    const patch = clearedRowPatch(row);
    for (const c of COMPETITOR_RAW_COLUMNS) expect(patch[c], c).toBeNull();
    for (const kept of ["place_id", "distance_meters", "total", "grade", "scoring_version"]) expect(patch).not.toHaveProperty(kept);
    const b = patch.breakdown_json as ReturnType<typeof breakdown>;
    expect(b.total).toBe(72);
    expect(b.checks.map((c) => [c.id, c.earnedPoints, c.maxPoints, c.confidence])).toEqual([
      ["visibility.rating", 9, 10, "VERIFIED"],
      ["visibility.review_recency", 2, 6, "LIKELY"],
    ]);
  });

  test("breakdowns lose the text that quotes Google (\"Rated 4.6★\") and quoted counts; our own flags stay", () => {
    const b = breakdownWithoutQuotes(breakdown());
    expect(JSON.stringify(b)).not.toMatch(/4\.6|recent reviews|Based on Google/);
    expect(b.checks[0].meta).toEqual({ ratingBand: "high" });
    expect(b.checks[1].meta).toEqual({ source: "places" });
    expect(b.checks[1]).not.toHaveProperty("note");
  });

  test("website comparisons keep the website's side, drop Google's; also-nearby keeps place ID and distance only", () => {
    const w = websiteAnalysisWithoutGoogle(rawRow("r", "s", 1).website_analysis_json);
    expect(JSON.stringify(w)).toContain("(908) 555-0199");
    expect(JSON.stringify(w)).not.toContain("googleValue");
    expect(alsoNearbyWithoutGoogle([{ placeId: "a", name: "Tiny Salon", distanceMeters: 400, reviewCount: 2 }, { placeId: "b", name: "Shut", distanceMeters: 900, reviewCount: 30, temporarilyClosed: true }])).toEqual([
      { placeId: "a", distanceMeters: 400 },
      { placeId: "b", distanceMeters: 900, temporarilyClosed: true },
    ]);
  });

  test("a cleared row has nothing left to clear, and is recognised as cleared", () => {
    const row = rawRow("r1", "s1", 30, { also_nearby_json: [{ placeId: "a", name: "x", distanceMeters: 1, reviewCount: 1 }] });
    expect(hasRawValues(row)).toBe(true);
    const after = { ...row, ...clearedRowPatch(row) };
    expect(hasRawValues(after)).toBe(false);
    expect(rawCleared(after)).toBe(true);
    expect(rawCleared(row)).toBe(false);
  });
});

describe("when the nightly rule clears a scan", () => {
  const setup = () =>
    fakeDb({
      competitor_scans: [
        // s-done: the newest scan, scored, 2 hours old → cleared now.
        { ...rawRow("a0", "s-done", 2), is_subject: true },
        rawRow("a1", "s-done", 2),
        // s-new: no job row yet, 2 hours old → waits.
        rawRow("b1", "s-new", 2),
        // s-old: no job, 30 hours old → cleared.
        rawRow("c1", "s-old", 30),
        // s-stuck: still scoring, under 24 h → waits.
        rawRow("d1", "s-stuck", 1.5, { pending_breakdown_json: breakdown("Rated 4.9★") }),
        // s-gone: unfinished after 40 h, replaced by s-done → stays hidden, cleared.
        rawRow("e1", "s-gone", 40, { pending_breakdown_json: breakdown() }),
        { ...rawRow("e0", "s-gone", 40), is_subject: true },
      ],
      competitor_scoring_jobs: [
        { scan_id: "s-done", status: "done", done: 1, total: 1 },
        { scan_id: "s-stuck", status: "running", done: 0, total: 1 },
        { scan_id: "s-gone", status: "running", done: 0, total: 1 },
      ],
      competitor_overrides: [{ id: "o1", name: "Removed Salon" }, { id: "o2", name: null }],
    });

  test("dry run: counts only, nothing changes", async () => {
    const { db, updates, tables } = setup();
    const c = await cleanCompetitorRawValues(db, { now: NOW, dryRun: true });
    expect(c).toEqual({ rows: 5, scans: 3, expiredJobs: 1, overrideNames: 1 });
    expect(updates).toEqual([]);
    expect(tables.competitor_scans.every((r) => r.name === "Main Street Salon")).toBe(true);
  });

  test("live: scored or 24 h old → cleared; a brand-new scan without its job row waits; a superseded unfinished scan stays hidden; Remove / Add names blanked", async () => {
    const { db, tables } = setup();
    const c = await cleanCompetitorRawValues(db, { now: NOW, dryRun: false });
    const row = (id: string) => tables.competitor_scans.find((r) => r.id === id)!;
    expect(row("a1").name).toBeNull();
    expect(row("c1").name).toBeNull();
    expect(row("b1").name).toBe("Main Street Salon");
    expect(row("d1").name).toBe("Main Street Salon");
    expect(row("e1").name).toBeNull();
    expect(row("a1").total).toBe(72);
    expect(row("a1").place_id).toBe("p-a1");
    const job = (id: string) => tables.competitor_scoring_jobs.find((j) => j.scan_id === id)!;
    expect(job("s-gone").status).toBe("failed");
    expect(row("e1").pending_breakdown_json).toBeNull();
    expect(c.overrideNames).toBe(1);
    expect(tables.competitor_overrides.every((o) => o.name === null)).toBe(true);
  });

  test("the newest scan still being scored after 24 h is published with what was scored", async () => {
    const { db, tables } = fakeDb({
      competitor_scans: [
        rawRow("d1", "s-stuck", 30, { pending_breakdown_json: { ...breakdown("Rated 4.9★"), total: 81, grade: "B" } }),
        rawRow("d2", "s-stuck", 30, { breakdown_json: { ...breakdown(), checks: [...breakdown().checks, firstPassWebsite] } }),
      ],
      competitor_scoring_jobs: [{ scan_id: "s-stuck", status: "running", done: 1, total: 2 }],
      competitor_overrides: [],
    });
    await cleanCompetitorRawValues(db, { now: NOW, dryRun: false });
    const d1 = tables.competitor_scans.find((r) => r.id === "d1")!;
    expect(d1.total).toBe(81);
    expect(d1.pending_breakdown_json).toBeNull();
    expect(JSON.stringify(d1.breakdown_json)).not.toContain("4.9");
    expect(tables.competitor_scoring_jobs[0].status).toBe("done");
    // The unscored one keeps its first score, and its website shows
    // "Website couldn't be checked" — never "not checked yet".
    const d2 = tables.competitor_scans.find((r) => r.id === "d2")!;
    expect(d2.total).toBe(72);
    const entry = { isSubject: false, hasWebsite: true, breakdown: d2.breakdown_json } as unknown as SavedCompetitorEntry;
    expect(isFullScored(entry)).toBe(true);
    expect(websiteNotChecked(entry)).toBe(true);
    expect(checkStatus(entry, { ...firstPassWebsite, id: "website.https", earnedPoints: null })).toEqual({ kind: "couldnt", reason: null });
  });

  test("a nightly run clears whole scans up to its limit; the rest the next night", async () => {
    const { db, tables } = fakeDb({
      competitor_scans: [rawRow("1", "s1", 30), rawRow("2", "s1", 30), rawRow("3", "s2", 30), rawRow("4", "s2", 30)],
      competitor_scoring_jobs: [],
      competitor_overrides: [],
    });
    const c = await cleanCompetitorRawValues(db, { now: NOW, dryRun: false, maxRows: 3 });
    expect(c.rows).toBe(2);
    expect(tables.competitor_scans.filter((r) => r.name === null).map((r) => r.scan_id)).toEqual(["s1", "s1"]);
  });

  test("right after scoring: one scan's rows cleared", async () => {
    const { db, tables } = fakeDb({ competitor_scans: [rawRow("1", "s1", 0), rawRow("2", "s2", 0)] });
    expect(await clearScanRawValues(db, "s1")).toBe(1);
    expect(tables.competitor_scans.map((r) => r.name)).toEqual([null, "Main Street Salon"]);
  });
});

describe("nothing reads a cleared value back", () => {
  test("the scoring job keeps a cleared row's saved result instead of re-scoring it from blanks, and clears after scoring only when the cleanup is live", async () => {
    const fs = await import("node:fs");
    const job = fs.readFileSync("lib/competitorScoringJob.ts", "utf8");
    expect(job).toContain('if (rawCleared(row)) throw new Error("listing values cleared");');
    expect(job).toMatch(/if \(storageCleanupLive\(env\)\) \{[\s\S]{0,200}clearScanRawValues\(db, scanId\)/);
  });

  test("Remove / Add keep no name (read live on the page)", async () => {
    const src = (await import("node:fs")).readFileSync("app/actions/competitorOverrides.ts", "utf8");
    expect(src.match(/action: "(removed|added)", reason[^}]*name: null/g)).toHaveLength(2);
  });
});
