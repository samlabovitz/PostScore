import { describe, expect, test, vi } from "vitest";

// One business, one rank, everywhere: the Overview "Local benchmark", the
// Competitors page (headline + "Compared over time"), the monthly report
// and PostAI all read the latest finished scan through ownerStanding —
// rankBy(scan, "overall") on each business's full PostScore.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getLocalBenchmark } from "./competitors";
import { groupSavedScans, rankPoint, type SavedScanRow } from "@/lib/savedCompetitorScans";
import { heroSummary, ownerStanding, rankBy } from "@/lib/competitorComparison";
import { snapshotFromSavedRows } from "@/lib/monthlyReportExtras";
import { scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";

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
  const business = { name: "J & G Italian Deli", category: "Deli", categories: ["deli"], primary_type: "deli", business_type_override: null, language: "en" };
  return {
    from(table: string) {
      const data = table === "businesses" ? [business] : table === "competitor_scoring_jobs" ? [] : rows;
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "order", "limit", "in"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: table === "competitor_scoring_jobs" ? null : data[0], error: null });
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
    const overview = await getLocalBenchmark("jg");
    expect(overview.status).toBe("head_to_head");
    if (overview.status === "head_to_head") {
      expect(overview.headToHead.owner.name).toBe("J & G Italian Deli");
      expect(overview.headToHead.rivals.map((x) => x.name)).toEqual(["Dom's Deli", "Greene County Deli"]);
    }
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
