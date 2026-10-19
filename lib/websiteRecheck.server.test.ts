import { describe, expect, test, vi } from "vitest";

const saveScoreSnapshotWithClient = vi.fn();
vi.mock("@/app/actions/scoring", () => ({ saveScoreSnapshotWithClient: (...args: unknown[]) => saveScoreSnapshotWithClient(...args) }));
vi.mock("@/lib/websiteAnalysisForSave", () => ({ analyzeWebsiteForSave: vi.fn() }));

import { recheckWebsiteWithClient } from "./websiteRecheck.server";
import type { SupabaseClient } from "@supabase/supabase-js";

const NOW = new Date("2026-10-19T15:00:00Z");
const BUSINESS = {
  id: "b1",
  name: "Modern Liquors",
  website: "https://modernliquors.example",
  verified_website_url: null,
  phone: "(302) 555-0100",
  address: "1 Main St, Newark, DE",
  opening_hours_periods: null,
  category: "Liquor store",
  primary_type: "liquor_store",
  categories: null,
  business_type_override: null,
  website_analysis_json: null,
  listing_mode: "google",
  lat: 39.68,
  lng: -75.75,
};
const breakdown = (earned: number, total: number) => ({
  scoringVersion: "v1",
  total,
  grade: "C",
  categories: [{ id: "website", relativeScore: earned * 10 }],
  checks: [{ id: "website.https", label: "HTTPS", earnedPoints: earned, maxPoints: 4, confidence: "VERIFIED", explanation: "" }],
});

/** A tiny chainable stand-in for the Supabase queries this action makes. */
function fakeDb(state: { business: Record<string, unknown> | null; recheckDates: string[]; before: unknown; after: unknown }) {
  const updates: unknown[] = [];
  const from = (table: string) => {
    let mode: "select" | "update" = "select";
    let selectCols = "";
    let filters: Record<string, unknown> = {};
    const chain = {
      select: (cols: string) => ((selectCols = cols), chain),
      update: (patch: unknown) => ((mode = "update"), updates.push({ table, patch }), chain),
      eq: (col: string, v: unknown) => ((filters[col] = v), chain),
      gte: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (table === "businesses") return { data: state.business };
        if (filters.id) return { data: state.after };
        return { data: state.before };
      },
      then: (resolve: (v: unknown) => void) => {
        if (mode === "update") return resolve({ error: null });
        if (table === "scores" && selectCols.includes("scan_kind")) {
          return resolve({ data: state.recheckDates.map((d) => ({ created_at: d, scan_kind: "website_recheck" })) });
        }
        return resolve({ data: [] });
      },
    };
    filters = {};
    return chain;
  };
  return { db: { from } as unknown as SupabaseClient, updates };
}

const analyzed = { websiteAnalysis: { ok: true }, httpsStatus: "secure", checkedAt: NOW.toISOString(), captureScreenshots: false, analysis: null };

describe("recheckWebsiteWithClient", () => {
  test("re-checks the website only, saves it as a website re-check scan, and reports what changed", async () => {
    saveScoreSnapshotWithClient.mockResolvedValueOnce({ status: "saved", scoreId: "s2", tasksConfirmed: 1, tasksReopened: 0, pointsConfirmed: 4 });
    const analyze = vi.fn().mockResolvedValue(analyzed);
    const { db, updates } = fakeDb({ business: BUSINESS, recheckDates: ["2026-10-19T13:00:00Z"], before: { total: 70, breakdown_json: breakdown(0, 70) }, after: { total: 74, breakdown_json: breakdown(4, 74) } });
    const out = await recheckWebsiteWithClient(db, "b1", { analyze, now: () => NOW });

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0][0]).toMatchObject({ analysisUrl: "https://modernliquors.example", listingWebsite: "https://modernliquors.example", skipScreenshots: true });
    expect(updates).toEqual([{ table: "businesses", patch: expect.objectContaining({ website_analysis_json: { ok: true }, https_status: "secure" }) }]);
    expect(saveScoreSnapshotWithClient).toHaveBeenCalledWith(db, "b1", "website_recheck");
    expect(out).toMatchObject({
      status: "ok",
      scoreBefore: 70,
      scoreAfter: 74,
      websiteBefore: 0,
      websiteAfter: 40,
      tasksConfirmed: 1,
      changes: [{ checkId: "website.https", from: "needs_work", to: "done", points: 4 }],
      availability: { used: 2, left: 1 },
    });
  });

  test("the 4th re-check today is refused before any PageSpeed or site call", async () => {
    const analyze = vi.fn();
    const { db } = fakeDb({ business: BUSINESS, recheckDates: ["2026-10-19T13:00:00Z", "2026-10-19T13:30:00Z", "2026-10-19T14:00:00Z"], before: null, after: null });
    expect(await recheckWebsiteWithClient(db, "b1", { analyze, now: () => NOW })).toEqual({ status: "limit_reached", availability: { used: 3, left: 0, allowed: false } });
    expect(analyze).not.toHaveBeenCalled();
  });

  test("no website → nothing to re-check; a website-only business uses its own re-check", async () => {
    const analyze = vi.fn();
    expect(await recheckWebsiteWithClient(fakeDb({ business: { ...BUSINESS, website: null }, recheckDates: [], before: null, after: null }).db, "b1", { analyze })).toEqual({ status: "no_website" });
    expect(await recheckWebsiteWithClient(fakeDb({ business: { ...BUSINESS, listing_mode: "website_only" }, recheckDates: [], before: null, after: null }).db, "b1", { analyze })).toEqual({ status: "not_found" });
    expect(analyze).not.toHaveBeenCalled();
  });
});
