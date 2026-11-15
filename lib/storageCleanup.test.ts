import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";

// Day 23 step 2a: disconnect deletes every Google value it promises (scores
// stay); the nightly cleanup's rules and cutoffs, dry run vs live; private
// screenshots (paths, signed URLs, the sweep); Places errors and the cron
// log without Google's text or business names.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/gbpRealListing.server", () => ({ forgetRealListing: vi.fn() }));

import { countGoogleData, deleteGoogleData } from "@/lib/gbpDataCleanup.server";
import { runStorageCleanup, storageCleanupLive } from "@/lib/storageCleanup.server";
import { businessOfPath, referencedPaths, replacedPaths, screenshotPathOf, sweepPlan, withoutPaths, withSignedScreenshots } from "@/lib/screenshotStorage.server";
import { placesErrorReason } from "@/lib/google/places";

// ---------------------------------------------------------------------------
// A tiny in-memory Supabase for the filters these modules use.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const like = (v: unknown, pattern: string) => typeof v === "string" && new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/\\_/g, "_")}$`).test(v);
function orFilter(expr: string): (r: Row) => boolean {
  const parts = expr.split(",").map((p) => {
    const [col, op, ...rest] = p.split(".");
    const val = rest.join(".");
    if (op === "like") return (r: Row) => like(r[col], val);
    if (op === "eq") return (r: Row) => r[col] === val;
    if (op === "not" && val === "is.null") return (r: Row) => r[col] !== null && r[col] !== undefined;
    throw new Error(`or: ${p}`);
  });
  return (r) => parts.some((f) => f(r));
}
function fakeDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "update" | "delete" = "select";
    let values: Row = {};
    let head = false;
    const rows = () => (tables[table] ??= []);
    const match = () => rows().filter((r) => filters.every((f) => f(r)));
    const q: Record<string, unknown> = {
      select: (_c?: string, o?: { head?: boolean }) => ((head = !!o?.head), q),
      update: (v: Row) => ((op = "update"), (values = v), q),
      delete: () => ((op = "delete"), q),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      lt: (c: string, v: string) => (filters.push((r) => typeof r[c] === "string" && (r[c] as string) < v), q),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
      not: (c: string, o: string, v: unknown) => (filters.push(o === "is" ? (r) => (r[c] ?? null) !== v : (r) => !like(r[c], v as string)), q),
      or: (expr: string) => (filters.push(orFilter(expr)), q),
      then: (ok: (v: unknown) => unknown) => {
        const m = match();
        if (op === "update") m.forEach((r) => Object.assign(r, values));
        if (op === "delete") tables[table] = rows().filter((r) => !m.includes(r));
        return Promise.resolve(op === "select" ? { data: head ? null : m, count: m.length, error: null } : { data: null, error: null }).then(ok);
      },
    };
    return q;
  };
  return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

const NOW = Date.parse("2026-11-15T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

function hairExpress() {
  return {
    gbp_tokens: [{ business_id: "b1" }, { business_id: "b2" }],
    gbp_connections: [{ business_id: "b1", status: "connected" }],
    gbp_monthly_insights: [{ business_id: "b1", month: "2026-10-01" }, { business_id: "b1", month: "2026-09-01" }, { business_id: "b2", month: "2026-10-01" }],
    gbp_google_edits: [{ business_id: "b1", field: "hours", owner_value: "0|c", google_value: "0|600-1020" }],
    gbp_changes: [
      { id: "c1", business_id: "b1", kind: "attributes", status: "sent", approved_at: ago(11), before_value: "", after_value: "true", location_name: "locations/1" },
      { id: "c2", business_id: "b1", kind: "website_uri_practice", status: "sent", approved_at: ago(4), before_value: "https://a", after_value: "https://b", location_name: "locations/practice" },
    ],
    review_reply_drafts: [{ business_id: "b1", created_at: ago(5) }, { business_id: "b2", created_at: ago(5) }],
    gbp_review_reply_log: [{ business_id: "b1", review_id: "r1", action: "post" }],
    notifications: [{ business_id: "b1", type: "google", key: "edit_hours" }, { business_id: "b1", type: "urgent", key: "no_hours" }],
    businesses: [{ id: "b1", gbp_reviews_in_window: 20 }],
    scores: [{ business_id: "b1", total: 64 }],
  } as Record<string, Row[]>;
}

describe("disconnect deletes every Google value it promises", () => {
  test("dry run counts, changes nothing", async () => {
    const t = hairExpress();
    const r = await deleteGoogleData(fakeDb(t), "b1", { dryRun: true });
    expect(r.counts).toEqual({ gbp_tokens: 1, gbp_connections: 1, gbp_monthly_insights: 2, gbp_google_edits: 1, gbp_changes_values: 1, gbp_changes_practice: 1, review_reply_drafts: 1, reply_log_review_ids: 1, notifications: 1 });
    expect(t.gbp_monthly_insights).toHaveLength(3);
  });

  test("after it: none of the rows or values exist; scores and other businesses untouched", async () => {
    const t = hairExpress();
    const db = fakeDb(t);
    expect((await deleteGoogleData(db, "b1")).ok).toBe(true);
    const left = await countGoogleData(db, "b1");
    expect(Object.values(left).every((n) => n === 0)).toBe(true);
    expect(t.gbp_changes).toEqual([expect.objectContaining({ id: "c1", kind: "attributes", status: "sent", before_value: null, after_value: null })]);
    expect(t.gbp_review_reply_log[0]).toMatchObject({ review_id: null, action: "post" });
    expect(t.notifications).toEqual([expect.objectContaining({ type: "urgent" })]);
    expect(t.scores).toEqual([{ business_id: "b1", total: 64 }]);
    expect(t.gbp_monthly_insights).toEqual([expect.objectContaining({ business_id: "b2" })]);
    expect(t.review_reply_drafts).toEqual([expect.objectContaining({ business_id: "b2" })]);
  });

  test("the comments and the button say exactly what's deleted", () => {
    expect(readFileSync("lib/gbpTokens.server.ts", "utf8")).toContain("deleteGoogleData(admin, businessId)");
    expect(readFileSync("supabase/gbp-monthly-insights.sql", "utf8")).toContain("Disconnect deletes them");
    expect(readFileSync("components/gbp/GbpDisconnectButton.tsx", "utf8")).toContain("dashboard.gbpDisconnect.what");
  });
});

describe("nightly cleanup", () => {
  function tables() {
    return {
      businesses: [
        { id: "old", lat: 41.07, lng: -73.86, lat_lng_fetched_at: ago(31) },
        { id: "new", lat: 41.07, lng: -73.86, lat_lng_fetched_at: ago(29) },
      ],
      gbp_changes: [
        { id: "real-old", kind: "attributes", approved_at: ago(8), before_value: "", after_value: "true", location_name: "locations/1" },
        { id: "real-new", kind: "attributes", approved_at: ago(6), before_value: "", after_value: "true", location_name: "locations/1" },
        { id: "prac-old", kind: "profile_info_practice", approved_at: ago(8), before_value: "a", after_value: "b", location_name: "locations/practice" },
        { id: "prac-new", kind: "profile_info_practice", approved_at: ago(6), before_value: "a", after_value: "b", location_name: "locations/practice" },
      ],
      gbp_google_edits: [
        { id: "e-old", resolved_at: ago(31), owner_value: "a", google_value: "b" },
        { id: "e-new", resolved_at: ago(29), owner_value: "a", google_value: "b" },
        { id: "e-open", resolved_at: null, owner_value: "a", google_value: "b" },
      ],
      review_reply_drafts: [{ id: "d-old", business_id: "x", created_at: ago(91) }, { id: "d-new", business_id: "x", created_at: ago(89) }],
      gbp_connections: [
        { business_id: "lost-old", status: "error", disconnected_at: ago(31) },
        { business_id: "lost-new", status: "error", disconnected_at: ago(29) },
        { business_id: "live", status: "connected", disconnected_at: null },
      ],
      gbp_tokens: [],
      gbp_monthly_insights: [{ business_id: "lost-old" }, { business_id: "lost-new" }],
    } as Record<string, Row[]>;
  }
  const counts = (r: Awaited<ReturnType<typeof runStorageCleanup>>) => Object.fromEntries(r.map((x) => [x.rule, x.count]));

  test("dry run: counts at the cutoffs, nothing changes", async () => {
    const t = tables();
    const r = await runStorageCleanup(fakeDb(t), { now: NOW, dryRun: true });
    expect(counts(r)).toMatchObject({ lat_lng: 1, change_values: 1, practice_changes: 1, google_edit_values: 1, reply_drafts: 1, lost_connections: 1 });
    expect(t.businesses[0].lat).toBe(41.07);
    expect(t.gbp_changes).toHaveLength(4);
  });

  test("live: lat/lng > 30 days, change values > 7 days, practice rows > 7 days, edit values 30 days after resolved, drafts > 90 days, lost connections > 30 days", async () => {
    const t = tables();
    await runStorageCleanup(fakeDb(t), { now: NOW, dryRun: false });
    expect(t.businesses.map((b) => [b.id, b.lat])).toEqual([["old", null], ["new", 41.07]]);
    expect(t.gbp_changes.map((c) => [c.id, c.after_value])).toEqual([["real-old", null], ["real-new", "true"], ["prac-new", "b"]]);
    expect(t.gbp_google_edits.map((e) => [e.id, e.google_value])).toEqual([["e-old", null], ["e-new", "b"], ["e-open", "b"]]);
    expect(t.review_reply_drafts.map((d) => d.id)).toEqual(["d-new"]);
    expect(t.gbp_monthly_insights).toEqual([{ business_id: "lost-new" }]);
    expect(t.gbp_connections.map((c) => c.business_id)).toEqual(["lost-new", "live"]);
  });

  test("ships in dry run: live only with STORAGE_CLEANUP_LIVE=true", () => {
    expect(storageCleanupLive({})).toBe(false);
    expect(storageCleanupLive({ STORAGE_CLEANUP_LIVE: "true" })).toBe(true);
  });

  test("the route and scheduler log counts only", () => {
    const route = readFileSync("app/api/cron/storage-cleanup/route.ts", "utf8");
    expect(route).toContain("isAuthorized(request)");
    expect(route).toContain("r.count");
    expect(readFileSync("netlify/functions/storage-cleanup-scheduler.mts", "utf8")).toContain('schedule: "15 8 * * *"');
  });
});

describe("private screenshots", () => {
  test("paths from old public URLs and new paths", () => {
    expect(screenshotPathOf("https://x.supabase.co/storage/v1/object/public/website-screenshots/b1/about-us.png")).toBe("b1/about-us.png");
    expect(screenshotPathOf("b1.png")).toBe("b1.png");
    expect(screenshotPathOf("https://example.com/other.png")).toBeNull();
    expect(businessOfPath("b1/about-us.png")).toBe("b1");
    expect(businessOfPath("b1.png")).toBe("b1");
  });

  test("signed URLs replace the paths for the owner's page; one that can't be signed shows as none", async () => {
    const admin = { storage: { from: () => ({ createSignedUrls: async (paths: string[]) => ({ data: paths.filter((p) => p !== "b1/gone.png").map((p) => ({ path: p, signedUrl: `https://signed/${p}?token=t` })) }) }) } } as never;
    const signed = await withSignedScreenshots(admin, { screenshotUrl: "b1.png", additionalPages: [{ label: "About", url: "https://a", screenshotUrl: "https://x.supabase.co/storage/v1/object/public/website-screenshots/b1/about.png", httpStatus: 200 }, { label: "Gone", url: "https://g", screenshotUrl: "b1/gone.png", httpStatus: 200 }] } as never);
    expect((signed as { screenshotUrl: string }).screenshotUrl).toBe("https://signed/b1.png?token=t");
    expect((signed as { additionalPages: Array<{ screenshotUrl: string | null }> }).additionalPages.map((p) => p.screenshotUrl)).toEqual(["https://signed/b1/about.png?token=t", null]);
  });

  test("a new capture removes the pages it no longer has", () => {
    expect(replacedPaths(["b1/about.png", "b1/menu.png"], "b1", ["b1.png", "b1/about.png"])).toEqual(["b1/menu.png"]);
  });

  test("the sweep: business gone, not referenced, older than 90 days", () => {
    const files = [
      { path: "gone.png", updatedAt: ago(1), bytes: 1 },
      { path: "b1/old-page.png", updatedAt: ago(1), bytes: 1 },
      { path: "b1.png", updatedAt: ago(91), bytes: 1 },
      { path: "b2.png", updatedAt: ago(10), bytes: 1 },
    ];
    const refs = new Map([["b1", referencedPaths({ screenshotUrl: "b1.png", additionalPages: [] } as never)], ["b2", ["b2.png"]]]);
    expect(sweepPlan(files, refs, NOW).map((f) => [f.path, f.reason])).toEqual([
      ["gone.png", "business_gone"],
      ["b1/old-page.png", "not_referenced"],
      ["b1.png", "older_than_90_days"],
    ]);
    expect(withoutPaths({ screenshotUrl: "b1.png", additionalPages: [] } as never, new Set(["b1.png"]))).toMatchObject({ screenshotUrl: null });
  });

  test("uploads store the path, never a public URL", () => {
    const src = readFileSync("lib/websiteScreenshotUpload.ts", "utf8");
    expect(src).not.toContain("getPublicUrl");
    expect(src).toContain("removeReplacedScreenshots");
    expect(readFileSync("app/business/[id]/website/page.tsx", "utf8")).toContain("withSignedScreenshots(");
    expect(readFileSync("supabase/screenshots-private.sql", "utf8")).toContain("set public = false where id = 'website-screenshots'");
    expect(readFileSync("supabase/storage-cleanup.sql", "utf8")).not.toContain("set public = false");
  });
});

describe("logs", () => {
  test("Places errors keep the status and reason codes, never Google's message", () => {
    const body = JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "Hair express on Broadway: API key not valid for project 123", details: [{ reason: "API_KEY_SERVICE_BLOCKED" }] } });
    expect(placesErrorReason(body)).toBe("PERMISSION_DENIED API_KEY_SERVICE_BLOCKED");
    expect(placesErrorReason("<html>oops</html>")).toBeNull();
    expect(readFileSync("lib/google/places.ts", "utf8")).not.toContain("last.body");
  });

  test("no business names in competitor search errors; no cron response bodies", () => {
    const src = readFileSync("lib/competitors.ts", "utf8");
    expect(src.split("\n").filter((l) => /console\.error/.test(l) && /subject\.name/.test(l))).toEqual([]);
    expect(readFileSync("netlify/functions/monthly-reports-batch.mts", "utf8")).not.toMatch(/console\.error\([^)]*\$\{body\}/);
  });
});

describe("lat/lng read again when needed", () => {
  test("present → no call; cleared → one location-only Details call, saved with the date", async () => {
    vi.resetModules();
    const calls: string[] = [];
    vi.doMock("@/lib/placesDetailsBudget.server", () => ({ detailsCallAllowed: async () => true, logPlacesDetailsCall: async (_b: string, kind: string) => void calls.push(kind), logPlacesDetailsSkip: async () => undefined }));
    vi.doMock("@/lib/google/places", () => ({ getPlaceLocation: async () => ({ lat: 41.07, lng: -73.86 }) }));
    const { ensureLatLng } = await import("@/lib/placesLocation.server");
    const t: Record<string, Row[]> = { businesses: [{ id: "b1", lat: null, lng: null }] };
    expect(await ensureLatLng(fakeDb(t), { id: "b1", place_id: "p1", lat: 1, lng: 2 })).toEqual({ lat: 1, lng: 2 });
    expect(calls).toEqual([]);
    expect(await ensureLatLng(fakeDb(t), { id: "b1", place_id: "p1", lat: null, lng: null })).toEqual({ lat: 41.07, lng: -73.86 });
    expect(calls).toEqual(["location"]);
    expect(t.businesses[0]).toMatchObject({ lat: 41.07, lng: -73.86 });
    expect(typeof t.businesses[0].lat_lng_fetched_at).toBe("string");
  });
});
