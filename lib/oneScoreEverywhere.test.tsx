import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

// One score and one rank everywhere: the monthly email, the Overview, the
// Reports page and the weekly PDF (Nov 16: the monthly preview said 86 (B)
// where the Overview said 78 (C) — it scored from a shorter column list
// that left out three checks — and 17 of 68 emails would have ranked the
// owner by the score frozen into an older competitor scan).
vi.mock("@/lib/premium", () => ({ getPlan: vi.fn(async () => "grow") }));

import { LocaleProvider } from "@/lib/i18n";
import { LocalBenchmarkTile } from "@/components/dashboard/LocalBenchmarkTile";
import { latestScoreBreakdown, withOwnerScoreAt } from "./ownerRankScore.server";
import { ownerStanding, reportStanding } from "./competitorComparison";
import { businessRowToScoringInput, scoreBusiness, type CheckResult } from "./scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import type { SavedCompetitorEntry, SavedCompetitorScan } from "./savedCompetitorScans";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GetLocalBenchmarkResult } from "@/app/actions/competitors";

const src = (f: string) => readFileSync(f, "utf8");

describe("one score: every surface scores through scoreBusinessWithClient", () => {
  test("the Overview, Reports page and weekly PDF use scoreBusinessById; the monthly send and its preview use scoreBusinessWithClient — no column list of their own", () => {
    expect(src("app/business/[id]/page.tsx")).toMatch(/scoreBusinessById\(/);
    expect(src("lib/reports/reportData.server.ts")).toContain('scoreBusinessById(businessId, "business")');
    const route = src("app/api/cron/monthly-reports/route.ts");
    expect(route).toContain("const scored = await scoreBusinessWithClient(supabase, businessId, locale);");
    expect(route).not.toContain("getScoreWithSuggestions(");
    const preview = src("scripts/preview-report.ts");
    expect(preview).toContain("const scored = await (await scoreWithApp())(supabase, businessId, locale);");
    expect(preview).not.toContain("getScoreWithSuggestions(");
    // scoreBusinessById is scoreBusinessWithClient on the session client.
    expect(src("app/actions/scoring.ts")).toMatch(/async function scoreBusinessByIdUncached[\s\S]{0,900}scoreBusinessWithClient\(/);
  });

  test("why: a row without the newer scoring columns leaves checks out and scores differently (the 86 vs 78 case)", () => {
    const row = {
      name: "Salon", address: "1 Main St, Westfield, NJ", phone: "(908) 555-0100", website: null, rating: 4.6, review_count: 120,
      category: "Hair Salon", categories: ["hair_salon"], opening_hours: ["Monday: 9 AM – 5 PM"], photo_count: 10, business_status: "OPERATIONAL",
    };
    const v112 = { has_recent_review: false, recent_reviews_seen: 0, listing_has_accessibility: true, listing_has_payment: false, listing_has_parking: false, pure_service_area_business: false };
    const withAll = scoreBusiness(businessRowToScoringInput({ ...row, ...v112 } as never));
    const shortList = scoreBusiness(businessRowToScoringInput(row as never));
    const scored = (b: typeof withAll) => b.checks.filter((c: CheckResult) => c.earnedPoints !== null).length;
    expect(scored(shortList)).toBeLessThan(scored(withAll));
    expect(shortList.total).not.toBe(withAll.total);
  });
});

describe("one rank: the owner on their latest score, never the score frozen into the scan", () => {
  const check = (earned: number) => ({ id: "visibility.rating", label: "r", category: "visibility", maxPoints: 100, earnedPoints: earned, confidence: "VERIFIED", explanation: "" }) as CheckResult;
  const entry = (placeId: string, total: number, isSubject = false): SavedCompetitorEntry => ({
    placeId, name: null, isSubject, address: null, distanceMeters: isSubject ? null : 500, rating: null, reviewCount: null, hasWebsite: null,
    total, grade: "C", scoringVersion: "1.15.0", breakdown: null, priceLevel: null, photoCount: null, websiteUrl: null,
  });
  // Saved with the scan: the owner at 50, behind both competitors.
  const scan: SavedCompetitorScan = { scanId: "s", createdAt: "2026-11-01T00:00:00Z", entries: [entry("a", 80), entry("b", 70), entry("own", 50, true)] };
  // Today's latest score: 95.
  const latest = scoreBusiness(scoringInput());
  const db = (breakdown: unknown, seen: string[] = []) =>
    ({
      from: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
        chain.lte = (_c: string, at: string) => (seen.push(at), chain);
        chain.maybeSingle = async () => ({ data: breakdown ? { breakdown_json: breakdown } : null, error: null });
        return chain;
      },
    }) as unknown as SupabaseClient;

  test("ranked by the latest score: #1, not the scan's frozen #3 — the same number the Competitors page shows", async () => {
    expect(ownerStanding(scan)!.rank).toBe(3);
    const ranked = await withOwnerScoreAt(db(latest), "biz", scan);
    expect(ownerStanding(ranked)!.rank).toBe(1);
    expect(reportStanding(ranked)!.rank).toBe(1);
  });

  test("a past moment uses the score as of then; no saved score leaves the scan as it was", async () => {
    const seen: string[] = [];
    await latestScoreBreakdown(db(latest, seen), "biz", "2026-11-08T00:00:00Z");
    expect(seen).toEqual(["2026-11-08T00:00:00Z"]);
    expect(ownerStanding(await withOwnerScoreAt(db(null), "biz", scan))!.rank).toBe(3);
  });

  test("the monthly send, its preview and the weekly recap all apply it (the Competitors page and Overview already do)", () => {
    expect(src("app/api/cron/monthly-reports/route.ts")).toContain("const ranked = await withOwnerScoreAt(supabase as unknown as SupabaseClient, businessId, saved);");
    expect(src("scripts/preview-report.ts")).toContain("const ranked = await withOwnerScoreAt(supabase, businessId, saved);");
    expect(src("lib/weekly/weekly.server.ts")).toContain("await withOwnerScoreAt(supabase, businessId, scanOf(ids[0]), at)");
    expect(src("app/actions/competitors.ts")).toContain("withLatestOwnerScore(");
    void check;
  });
});

describe("Free with 1–2 competitors: the locked line, not a head-to-head with '—' names", () => {
  const h2h: GetLocalBenchmarkResult = {
    status: "head_to_head",
    competitorNoun: "salons",
    scanId: "s",
    scanAt: "2026-11-01T00:00:00Z",
    headToHead: { owner: { placeId: "own", name: "Me", score: 70, reviewCount: null, rating: null }, rivals: [{ placeId: "a", name: "—", score: 80, reviewCount: null, rating: null }] },
  } as unknown as GetLocalBenchmarkResult;
  const render = (lockedHref: string | null, locale: "en" | "es" = "en") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale}>
        <LocalBenchmarkTile businessId="b1" result={h2h} lockedHref={lockedHref} />
      </LocaleProvider>
    ).replace(/&#x27;/g, "'");

  test("Free: the locked line to the plans (EN + ES), no head-to-head", () => {
    const html = render("/business/b1/settings#compare-plans");
    expect(html).toContain('data-testid="head-to-head-locked"');
    expect(html).toContain('href="/business/b1/settings#compare-plans"');
    expect(html).toContain("See how many reviews you need to pass them, on Grow →");
    expect(html).not.toContain('data-testid="head-to-head"');
    expect(html).not.toContain("—");
    expect(render("/business/b1/settings#compare-plans", "es")).toContain("Vea cuántas reseñas necesita para superarlos, en Grow →");
  });

  test("paid plans: the head-to-head as before", () => {
    const html = render(null);
    expect(html).toContain('data-testid="head-to-head"');
    expect(html).not.toContain("head-to-head-locked");
  });

  test("the Free Overview passes the plans link; the visit recap makes no live competitor call on Free", () => {
    expect(src("app/business/[id]/BusinessScoreView.tsx")).toContain("<LocalBenchmarkTile businessId={businessId} result={benchmark} lockedHref={`/business/${businessId}/settings#compare-plans`} />");
    expect(src("lib/weekly/weekly.server.ts")).toContain('if ((await getPlan()) === "free") return null;');
  });
});
