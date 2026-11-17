import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanProfileSnapshots } from "./profileSnapshotsCleanup.server";
import { findLastKnownWebsiteDate } from "./googleListingWebsite";

const src = (f: string) => readFileSync(f, "utf8");

describe("scans no longer keep a copy of Google's listing values", () => {
  test("a new scan saves none; its changes are recorded from the values in memory and its fingerprints", () => {
    const s = src("app/actions/scoring.ts");
    expect(s).toContain("profile_snapshot_json: null,");
    expect(s).not.toContain("profile_snapshot_json: snapshot");
    expect(s).toContain("await recordScanChanges(createAdminClient(), businessId, data.id, snapshot,");
  });

  test("'it last showed a website on {date}' reads the website fingerprint, the same date as before", () => {
    expect(src("app/actions/scoring.ts")).toContain('.select("created_at, fp_website:field_fingerprints->f->>website")');
    const history = [
      { website: "listed", createdAt: "2026-10-01T00:00:00Z" },
      { website: "listed", createdAt: "2026-10-06T00:00:00Z" },
      { website: null, createdAt: "2026-10-12T00:00:00Z" },
    ];
    expect(findLastKnownWebsiteDate(history, "2026-10-10T00:00:00Z")).toBe("2026-10-06T00:00:00Z");
  });

  test("section 6 says which fields changed, never Google's before/after values; the weekly recap's newest scan shows today's counts", () => {
    expect(src("lib/googleProfileTab.server.ts")).toContain("changes: [],");
    expect(src("lib/googleProfileTab.server.ts")).not.toContain("profile_snapshot_json");
    expect(src("lib/weekly/weekly.server.ts")).toMatch(/i === rows\.length - 1 && today[\s\S]{0,200}rating: today\.rating \?\? null, reviewCount: today\.review_count \?\? null/);
  });
});

describe("blanking the saved snapshots", () => {
  function fakeDb(rows: Array<Record<string, unknown>>) {
    const blanked: string[] = [];
    const db = {
      from: () => ({
        select: () => ({ order: () => ({ range: async () => ({ data: rows, error: null }) }) }),
        update: (value: Record<string, unknown>) => ({ in: async (_c: string, ids: string[]) => (expect(value).toEqual({ profile_snapshot_json: null }), blanked.push(...ids), { error: null }) }),
      }),
    } as unknown as SupabaseClient;
    return { db, blanked };
  }
  const rows = [
    { id: "a", snapshot: { phone: "1" }, field_fingerprints: { k: "k", f: { phone: "abc" } } },
    { id: "b", snapshot: { phone: "1" }, field_fingerprints: null },
    { id: "c", snapshot: null, field_fingerprints: null },
  ];

  test("dry run: counts only", async () => {
    const { db, blanked } = fakeDb(rows);
    expect(await cleanProfileSnapshots(db, { dryRun: true })).toEqual({ scores: 3, withSnapshot: 2, blankable: 1, missingFingerprints: 1, blanked: 0 });
    expect(blanked).toEqual([]);
  });

  test("live: only scans whose fingerprints stand in for the snapshot (never losing what changed)", async () => {
    const { db, blanked } = fakeDb(rows);
    expect((await cleanProfileSnapshots(db, { dryRun: false })).blanked).toBe(1);
    expect(blanked).toEqual(["a"]);
  });
});
