import { describe, expect, test, vi } from "vitest";

// One business, one rank, everywhere: the Overview "Local benchmark", the
// Competitors page (headline + "Compared over time"), the monthly report
// and PostAI all read the latest finished scan through ownerStanding —
// rankBy(scan, "overall") on each business's full PostScore.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
// A paid plan unless a test says Free (Free makes no live competitor call).
vi.mock("@/lib/premium", () => ({ getPlan: vi.fn(async () => "grow") }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getLocalBenchmark } from "./competitors";
import { groupSavedScans, rankPoint, type SavedScanRow } from "@/lib/savedCompetitorScans";
import { heroSummary, ownerStanding, rankBy } from "@/lib/competitorComparison";
import { snapshotFromSavedRows } from "@/lib/monthlyReportExtras";
import { scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { getPlaceLive, searchNearbyLive, searchTextLive } from "@/lib/google/places";
import { getPlan } from "@/lib/premium";
import { liveCache } from "@/lib/placesLive.server";

// Four businesses with real breakdowns; the owner's full PostScore (94)
// is below two competitors' (96, 95) and above one (80).
const strong = scoreBusiness(scoringInput());
const weaker = scoreBusiness(scoringInput({ rating: 3.4, reviewCount: 6 }));
const weakest = scoreBusiness(scoringInput({ rating: 2.9, reviewCount: 2 }));

function row(name: string, isSubject: boolean, total: number, breakdown: typeof strong): SavedScanRow {
  return {
    scan_id: "s1", created_at: "2026-10-17T17:25:32Z", is_subject: isSubject, place_id: name, name, address: null,
    distance_meters: isSubject ? null : 400, rating: 4.6, review_count: 50, has_website: true, total, grade: "A",
    scoring_version: "1.11.0", breakdown_json: breakdown, price_level: null, photo_count: 10,
  };
}
const ROWS: SavedScanRow[] = [
  row("J & G Italian Deli", true, 94, strong),
  row("Dom's Deli", false, 96, weaker),
  row("Greene County Deli", false, 95, weakest),
  row("Corner Deli", false, 80, weakest),
];

function fakeSupabase(rows: SavedScanRow[]) {
  // Day 23 2d-5: our own saved columns only (no saved Google name or types).
  const business = { business_type_override: null, biz_type_resolved: "restaurant", language: "en" };
  return {
    from(table: string) {
      // No saved score (`scores`): the owner's row keeps its saved score.
      const data = table === "businesses" ? [business] : table === "competitor_scoring_jobs" || table === "scores" ? [] : rows;
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "order", "limit", "in"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: data[0] ?? null, error: null });
      chain.single = async () => ({ data: data[0], error: null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data, error: null });
      return chain;
    },
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
  } as unknown as SupabaseClient;
}

describe("the same rank everywhere", () => {
  test("Overview, Competitors (headline + over time), report and PostAI agree — all by full PostScore", async () => {
    const scan = groupSavedScans(ROWS)[0];
    const standing = ownerStanding(scan)!;
    expect(standing.rank).toBe(3);
    expect(standing.ownerScore).toBe(94);

    vi.mocked(createClient).mockReturnValue(fakeSupabase(ROWS) as never);
    const overview = await getLocalBenchmark("jg");
    expect(overview.status).toBe("ok");
    const overviewRank = overview.status === "ok" ? overview.benchmark.rank : null;

    const competitorsHeadline = heroSummary(scan, "overall").rank;
    const competitorsOverTime = rankPoint(scan).rank;
    const report = snapshotFromSavedRows(ROWS)!.rank;
    const postAi = rankBy(scan, "overall").findIndex((r) => r.entry.isSubject) + 1;

    expect([overviewRank, competitorsHeadline, competitorsOverTime, report, postAi]).toEqual([3, 3, 3, 3, 3]);
    if (overview.status === "ok") {
      expect(overview.benchmark.peerCount).toBe(4);
      expect(overview.benchmark.aheadCount).toBe(1);
      expect(overview.benchmark.subjectTotal).toBe(standing.ownerScore);
    }
  });

  test("only 1–2 competitors: no rank anywhere — a head-to-head on the Overview, Competitors over time, the report and PostAI", async () => {
    const two = ROWS.slice(0, 3);
    vi.mocked(createClient).mockReturnValue(fakeSupabase(two) as never);
    // Google unreachable: the head-to-head stays, names show "—" (never the saved ones).
    liveCache().clear();
    const offline = await getLocalBenchmark("jg");
    expect(offline.status === "head_to_head" && offline.headToHead.rivals.map((x) => x.name)).toEqual(["—", "—"]);
    // Names read live from Google (the fixture's place IDs are the names).
    vi.mocked(getPlaceLive).mockImplementation(async (placeId: string) => ({ placeId, name: `${placeId} (live)`, rating: 4.5, reviewCount: 40, priceLevel: null, photoCount: 5, hasWebsite: true, types: null }));
    liveCache().clear();
    const overview = await getLocalBenchmark("jg");
    expect(overview.status).toBe("head_to_head");
    if (overview.status === "head_to_head") {
      // Day 23 2d-5: the owner's name as Google shows it now too (not confirmed here), never the saved one.
      expect(overview.headToHead.owner.name).toBe("J & G Italian Deli (live)");
      expect(overview.headToHead.rivals.map((x) => x.name)).toEqual(["Dom's Deli (live)", "Greene County Deli (live)"]);
    }
    vi.mocked(getPlaceLive).mockImplementation(async () => null);
    const scan = groupSavedScans(two)[0];
    expect(rankPoint(scan).headToHead).toBe(true);
    expect(snapshotFromSavedRows(two)!.headToHead?.rivals).toHaveLength(2);
    // Back to a rank at 3+.
    expect(rankPoint(groupSavedScans(ROWS)[0]).headToHead).toBe(false);
    expect(snapshotFromSavedRows(ROWS)!.headToHead).toBeUndefined();
  });

  test("every rank call site goes through the shared function (no private sort by total)", async () => {
    const fs = await import("node:fs");
    for (const f of ["app/actions/competitors.ts", "app/actions/assistant.ts", "lib/savedCompetitorScans.ts"]) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/sort\(\(a, b\) => \(b\.total \?\? -1\) - \(a\.total \?\? -1\)\);\s*\n\s*const (?:rank|subjectRank) =/);
    }
    // The shared function, with the business's competitor scope (lib/competitorScope.ts).
    expect(fs.readFileSync("app/actions/assistant.ts", "utf8")).toContain("ownerStanding(snapshot.scan, competitorScope)");
    const competitors = fs.readFileSync("app/actions/competitors.ts", "utf8");
    expect(competitors).toContain("const scope = await loadCompetitorScope(supabase, businessId);\n  const standing = ownerStanding(snapshot.scan, scope);");
  });
});

describe("ties", () => {
  test("a tied rank doesn't depend on the order the database returns rows in", () => {
    const tieRows = [row("J & G Italian Deli", true, 94, strong), row("Dom's Deli", false, 94, strong), row("Greene County Deli", false, 94, strong)];
    const a = ownerStanding(groupSavedScans(tieRows)[0])!.rank;
    const b = ownerStanding(groupSavedScans([...tieRows].reverse())[0])!.rank;
    const c = ownerStanding(groupSavedScans([tieRows[1], tieRows[0], tieRows[2]])[0])!.rank;
    expect(new Set([a, b, c]).size).toBe(1);
  });
});

describe("Day 23 2b-2: Google's competitor values are read live, never the saved copies", () => {
  const liveCount: Record<string, number> = { "Dom's Deli": 400, "Greene County Deli": 300, "Corner Deli": 200, "J & G Italian Deli": 30 };
  const live = async (placeId: string) => ({ placeId, name: placeId, rating: 4.4, reviewCount: liveCount[placeId] ?? 1, priceLevel: null, photoCount: 7, hasWebsite: true, types: null });

  test("the Overview's nearby review average and review goal come from the live counts (saved count is 50 each)", async () => {
    vi.mocked(createClient).mockReturnValue(fakeSupabase(ROWS) as never);
    vi.mocked(getPlaceLive).mockImplementation(live);
    liveCache().clear();
    const overview = await getLocalBenchmark("jg");
    expect(overview.status).toBe("ok");
    if (overview.status === "ok") {
      expect(overview.benchmark.competitorReviewAverage).toBe(300);
      expect(overview.benchmark.reviewGoal).not.toBeNull();
      // The rank is ours — the same either way.
      expect(overview.benchmark.rank).toBe(3);
    }
    vi.mocked(getPlaceLive).mockImplementation(async () => null);
  });

  test("Google unreachable: same rank, and no review average or goal (unknown is hidden, never the saved 50)", async () => {
    vi.mocked(createClient).mockReturnValue(fakeSupabase(ROWS) as never);
    liveCache().clear();
    const overview = await getLocalBenchmark("jg");
    expect(overview.status).toBe("ok");
    if (overview.status === "ok") {
      expect(overview.benchmark.rank).toBe(3);
      expect(overview.benchmark.competitorReviewAverage).toBeNull();
      expect(overview.benchmark.reviewGoal).toBeNull();
    }
  });

  test("one competitor missing is enough to hide them (a partial average would mislead)", async () => {
    vi.mocked(createClient).mockReturnValue(fakeSupabase(ROWS) as never);
    vi.mocked(getPlaceLive).mockImplementation(async (id: string) => (id === "Corner Deli" ? null : live(id)));
    liveCache().clear();
    const overview = await getLocalBenchmark("jg");
    expect(overview.status === "ok" && overview.benchmark.competitorReviewAverage).toBeNull();
    vi.mocked(getPlaceLive).mockImplementation(async () => null);
  });

  test("the monthly report: the 'top business has N more reviews' pointer only from live counts; last month's scan gives its rank only", async () => {
    const { snapshotFromScan } = await import("@/lib/monthlyReportExtras");
    const { scanWithoutPlacesValues, withLivePlaces } = await import("@/lib/placesLive");
    const saved = groupSavedScans(ROWS)[0];
    const bare = scanWithoutPlacesValues(saved);
    expect(snapshotFromScan(bare, null, true)).toMatchObject({ rank: 3, totalCompetitors: 4, topCompetitorReviewCount: null });
    const places = Object.fromEntries(await Promise.all(ROWS.map(async (r) => [r.place_id, await live(r.place_id)] as const)));
    expect(snapshotFromScan(withLivePlaces(bare, places), null, false)!.topCompetitorReviewCount).toBe(400);
  });

  test("Growth's competitor photo median: none when any live value is missing", async () => {
    const src = (await import("node:fs")).readFileSync("app/actions/growthMoves.ts", "utf8");
    expect(src).toContain("resolvedSnapshot && !resolvedSnapshot.liveUnavailable ? competitorPhotoCounts(resolvedSnapshot.entries) : []");
    const route = (await import("node:fs")).readFileSync("app/api/cron/monthly-reports/route.ts", "utf8");
    expect(route).toContain("return fresh.unavailable ? [] : competitorPhotoCounts(fresh.scan.entries);");
    // This month's standing live; last month's rank only (no Google call).
    expect(route).toContain("readCompetitorSnapshotAsOf(supabase, businessId, new Date().toISOString(), true)");
    expect(route).toContain("readCompetitorSnapshotAsOf(supabase, businessId, previousReport.sent_at, false)");
  });

  test("no reader outside the Competitors page's own loader takes names, ratings or counts from saved competitor rows", async () => {
    const fs = await import("node:fs");
    for (const f of ["app/actions/pricing.ts", "app/api/cron/monthly-reports/route.ts", "lib/weekly/weekly.server.ts"]) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\.select\("[^"]*\b(name|rating|review_count|photo_count|price_level)\b[^"]*"\)[\s\S]{0,40}competitor_scans|from\("competitor_scans"\)\s*\.select\("[^"]*\b(rating|review_count|photo_count|price_level)\b/);
    }
  });
});

describe("Free: the rank, no live Google competitor call", () => {
  test("Free makes 0 live competitor calls for the Overview card; the rank stays, the review goal is locked", async () => {
    vi.mocked(getPlan).mockResolvedValue("free");
    vi.mocked(createClient).mockReturnValue(fakeSupabase(ROWS) as never);
    vi.mocked(getPlaceLive).mockClear();
    vi.mocked(searchTextLive).mockClear();
    vi.mocked(searchNearbyLive).mockClear();
    liveCache().clear();
    const overview = await getLocalBenchmark("jg");
    expect(getPlaceLive).not.toHaveBeenCalled();
    expect(searchTextLive).not.toHaveBeenCalled();
    expect(searchNearbyLive).not.toHaveBeenCalled();
    expect(overview.status).toBe("ok");
    if (overview.status === "ok") {
      expect(overview.benchmark.rank).toBe(3);
      expect(overview.benchmark.peerCount).toBe(4);
      expect(overview.benchmark.competitorReviewAverage).toBeNull();
      expect(overview.benchmark.reviewGoal).toBeNull();
    }
    vi.mocked(getPlan).mockResolvedValue("grow");
  });

  test("paid plans unchanged: the same visit reads Google live", async () => {
    vi.mocked(createClient).mockReturnValue(fakeSupabase(ROWS) as never);
    vi.mocked(getPlaceLive).mockClear();
    liveCache().clear();
    await getLocalBenchmark("jg");
    expect(getPlaceLive).toHaveBeenCalled();
  });
});
