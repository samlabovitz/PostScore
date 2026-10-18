/* eslint-disable @typescript-eslint/no-explicit-any -- an in-memory stand-in for the Supabase query builder */
import { describe, expect, test, vi } from "vitest";

// The website analysis and the owner's own score come from the real owner
// pipeline; here they're replaced so no network is touched.
const analyzeWebsiteForSave = vi.fn();
vi.mock("@/lib/websiteAnalysisForSave", () => ({ analyzeWebsiteForSave: (...a: unknown[]) => analyzeWebsiteForSave(...a) }));
const scoreBusinessWithClient = vi.fn();
vi.mock("@/app/actions/scoring", () => ({ scoreBusinessWithClient: (...a: unknown[]) => scoreBusinessWithClient(...a) }));

import { breakdownFromChecks, scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { countingFetch, hasSavedListingFacts, mergeLegacyListing, scoreCompetitorFully, withoutUnmeasuredWebsite } from "./competitorFullScoring";
import { canSpendPagespeed, pacificDayStart, pagespeedDailyBudget, scoringConcurrency } from "./pagespeedBudget";
import { runCompetitorScoringJob } from "./competitorScoringJob";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("one scoring engine", () => {
  test("breakdownFromChecks gives exactly scoreBusiness's categories and total", () => {
    const full = scoreBusiness(scoringInput());
    expect(breakdownFromChecks(full.checks)).toEqual(full);
  });
});

describe("a competitor's full PostScore", () => {
  const owner = scoreBusiness(scoringInput());

  test("new scans (listing facts saved): scored by the engine from real values, website analyzed without screenshots or renders", async () => {
    analyzeWebsiteForSave.mockResolvedValueOnce({ websiteAnalysis: null, httpsStatus: "ok" });
    const res = await scoreCompetitorFully(
      {
        place_id: "p1", address: "1 Main St", rating: 4.6, review_count: 120, photo_count: 12, has_website: true, website_url: "https://rival.example",
        phone: "+1 555 0100", opening_hours: { weekday: ["Monday: 9 AM – 5 PM"], periods: [] }, categories: ["deli"], business_status: "OPERATIONAL", breakdown_json: null,
      },
      { locale: "en" }
    );
    const call = analyzeWebsiteForSave.mock.calls.at(-1)![0];
    expect(call).toMatchObject({ analysisUrl: "https://rival.example", skipScreenshots: true, allowBrowserRenders: false, listingFacts: { phone: "+1 555 0100", address: "1 Main St" } });
    expect(res.breakdown.checks.find((c) => c.id === "completeness.phone")!.earnedPoints).toBeGreaterThan(0);
  });

  test("older scans: saved listing results kept, 'Matches your Google listing' couldn't-check, re-totalled by the engine", () => {
    const fresh = scoreBusiness(scoringInput({ phone: null, openingHours: null }));
    const merged = mergeLegacyListing(fresh, owner, "en");
    expect(merged.checks.find((c) => c.id === "completeness.phone")).toEqual(owner.checks.find((c) => c.id === "completeness.phone"));
    const info = merged.checks.find((c) => c.id === "website.info_consistency")!;
    expect(info.earnedPoints).toBeNull();
    expect(info.confidence).toBe("UNCERTAIN");
    expect(merged.total).toBe(breakdownFromChecks(merged.checks).total);
    expect(hasSavedListingFacts({ business_status: null, categories: null })).toBe(false);
    expect(hasSavedListingFacts({ business_status: "OPERATIONAL", categories: null })).toBe(true);
  });

  test("scan says it has a website but no address was saved: website couldn't check (reason saved) — never 'no website'", async () => {
    analyzeWebsiteForSave.mockClear();
    const res = await scoreCompetitorFully({ place_id: "p3", address: null, rating: 4.4, review_count: 30, photo_count: 3, has_website: true, website_url: null, breakdown_json: owner }, { locale: "en" });
    expect(analyzeWebsiteForSave).not.toHaveBeenCalled();
    const hasSite = res.breakdown.checks.find((c) => c.id === "website.has_website")!;
    expect(hasSite.earnedPoints).toBeNull();
    expect(hasSite.meta).toMatchObject({ websiteNotChecked: "no_address", fullScore: "1" });
    expect(res.breakdown.categories.find((c) => c.id === "website")!.possiblePoints).toBe(0);
  });

  test("a site where no website check got a result (timed out): couldn't check with the reason — no website points counted", () => {
    const b = scoreBusiness(scoringInput({ websiteAnalysis: null, httpsStatus: null }));
    const before = b.categories.find((c) => c.id === "website")!;
    expect(before.possiblePoints).toBeGreaterThan(0); // only "has a website" measured
    const after = withoutUnmeasuredWebsite(b, "timed_out", "en");
    expect(after.categories.find((c) => c.id === "website")!.possiblePoints).toBe(0);
    expect(after.checks.find((c) => c.id === "website.has_website")!.meta).toMatchObject({ websiteNotChecked: "timed_out" });
    // A site with real results keeps them.
    const real = scoreBusiness(scoringInput());
    expect(withoutUnmeasuredWebsite(real, null, "en")).toEqual(real);
  });

  test("a homepage that can't be read (error page, blocked, timeout): the whole Website category is couldn't-check — HTTPS alone never makes it 100%", () => {
    const real = scoreBusiness(scoringInput());
    const out = withoutUnmeasuredWebsite(real, "error_page", "en");
    expect(out.categories.find((c) => c.id === "website")!.possiblePoints).toBe(0);
    expect(out.checks.find((c) => c.id === "website.https")!.meta).toMatchObject({ notCheckedReason: "error_page" });
    expect(out.checks.find((c) => c.id === "website.has_website")!.meta).toMatchObject({ websiteNotChecked: "error_page" });
    // JavaScript-only keeps what was really measured.
    const js = withoutUnmeasuredWebsite(real, "js_only", "en");
    expect(js.categories.find((c) => c.id === "website")!.possiblePoints).toBeGreaterThan(0);
  });

  test("no website: nothing fetched", async () => {
    analyzeWebsiteForSave.mockClear();
    await scoreCompetitorFully({ place_id: "p2", address: null, rating: 4, review_count: 10, photo_count: 1, has_website: false, website_url: null, breakdown_json: owner }, { locale: "en" });
    expect(analyzeWebsiteForSave).not.toHaveBeenCalled();
  });

  test("PageSpeed requests are counted", async () => {
    const base = vi.fn(async () => new Response("{}")) as unknown as typeof fetch;
    const c = countingFetch(base);
    // The URL the app really calls (lib/websiteAnalysis.ts).
    await c.fetchImpl("https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=x");
    await c.fetchImpl("https://rival.example/");
    expect(c.count()).toBe(1);
  });
});

describe("PageSpeed budget", () => {
  test("80% of the daily limit, counting owner re-scans; refuses when the limit isn't set", () => {
    expect(pagespeedDailyBudget({ PAGESPEED_DAILY_LIMIT: "25000" })).toBe(20000);
    expect(pagespeedDailyBudget({})).toBeNull();
    expect(canSpendPagespeed(19998, 20000)).toBe(true);
    expect(canSpendPagespeed(19999, 20000)).toBe(false);
    expect(canSpendPagespeed(0, null)).toBe(false);
  });

  test("slows down for the per-100-seconds limit", () => {
    expect(scoringConcurrency({})).toBe(4);
    expect(scoringConcurrency({ PAGESPEED_PER_100S_LIMIT: "400" })).toBe(4);
    expect(scoringConcurrency({ PAGESPEED_PER_100S_LIMIT: "25" })).toBe(2);
    expect(scoringConcurrency({ PAGESPEED_PER_100S_LIMIT: "5" })).toBe(1);
  });

  test("the day starts at midnight Pacific (when the quota resets)", () => {
    expect(pacificDayStart(new Date("2026-10-18T15:30:00Z"))).toBe("2026-10-18T07:00:00.000Z");
  });
});

// ---- job runner against an in-memory table store ----
function fakeDb(state: { jobs: Record<string, any>[]; scans: Record<string, any>[]; scores: number }) {
  const db = {
    from(table: string) {
      const filters: [string, string, unknown][] = [];
      let patch: Record<string, unknown> | null = null;
      const rows = () =>
        (table === "competitor_scoring_jobs" ? state.jobs : table === "competitor_scans" ? state.scans : table === "businesses" ? [{ id: "b", language: "en" }] : []).filter((r) =>
          filters.every(([op, k, v]) => (op === "eq" ? r[k] === v : true))
        );
      const chain: any = {
        select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) return { gte: async () => ({ count: state.scores, error: null }) };
          return chain;
        },
        eq: (k: string, v: unknown) => {
          filters.push(["eq", k, v]);
          if (patch) {
            for (const r of rows()) Object.assign(r, patch);
            return Promise.resolve({ error: null });
          }
          return chain;
        },
        gte: () => chain,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        update: (p: Record<string, unknown>) => {
          patch = p;
          return chain;
        },
        then: (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null }),
      };
      return chain;
    },
  };
  return db as unknown as SupabaseClient;
}

function scanRow(id: string, isSubject: boolean): Record<string, any> {
  return { id, scan_id: "s", is_subject: isSubject, place_id: id, address: null, rating: 4.5, review_count: 50, photo_count: 5, has_website: false, website_url: null, breakdown_json: null, pending_breakdown_json: null };
}

describe("the scoring job", () => {
  const ownerScore = scoreBusiness(scoringInput());

  test("scores every competitor, uses the owner's own score, and publishes all rows together", async () => {
    scoreBusinessWithClient.mockResolvedValue({ status: "ok", result: { breakdown: ownerScore } });
    const state = { jobs: [{ scan_id: "s", business_id: "b", status: "queued", done: 0, total: 2, pagespeed_calls: 0, started_at: null }], scans: [scanRow("o", true), scanRow("c1", false), scanRow("c2", false)], scores: 0 };
    const out = await runCompetitorScoringJob(fakeDb(state), "s", { env: { PAGESPEED_DAILY_LIMIT: "25000" } });
    expect(out).toMatchObject({ status: "done", done: 2, total: 2 });
    expect(state.jobs[0].status).toBe("done");
    expect(state.scans.find((r) => r.id === "o")!.total).toBe(ownerScore.total);
    expect(state.scans.every((r) => r.pending_breakdown_json === null && r.breakdown_json)).toBe(true);
  });

  test("stops at the PageSpeed budget — nothing published, the rest resumes later", async () => {
    const state = { jobs: [{ scan_id: "s", business_id: "b", status: "queued", done: 0, total: 2, pagespeed_calls: 0, started_at: null }], scans: [scanRow("o", true), scanRow("c1", false), scanRow("c2", false)], scores: 10000 };
    // 10,000 owner scans × 2 = 20,000 = the whole 80% budget.
    const out = await runCompetitorScoringJob(fakeDb(state), "s", { env: { PAGESPEED_DAILY_LIMIT: "25000" } });
    expect(out).toMatchObject({ status: "failed", stopped: "pagespeed_budget", done: 0 });
    expect(state.scans.filter((r) => !r.is_subject).every((r) => r.breakdown_json === null)).toBe(true);
  });

  test("more workers than sites: every site scored exactly once, no crash", async () => {
    scoreBusinessWithClient.mockResolvedValue({ status: "ok", result: { breakdown: ownerScore } });
    const state = { jobs: [{ scan_id: "s", business_id: "b", status: "queued", done: 0, total: 1, pagespeed_calls: 0, started_at: null }], scans: [scanRow("o", true), scanRow("c1", false)], scores: 0 };
    const out = await runCompetitorScoringJob(fakeDb(state), "s", { env: { PAGESPEED_DAILY_LIMIT: "25000" } });
    expect(out).toMatchObject({ status: "done", done: 1, total: 1 });
  });

  test("won't run without a configured daily limit", async () => {
    const state = { jobs: [{ scan_id: "s", business_id: "b", status: "queued", done: 0, total: 1, pagespeed_calls: 0, started_at: null }], scans: [scanRow("c1", false)], scores: 0 };
    const out = await runCompetitorScoringJob(fakeDb(state), "s", { env: {} });
    expect(out.stopped).toBe("pagespeed_limit_not_set");
  });

  test("one site per call (the Netlify step route) — progress saved, status stays running", async () => {
    const state = { jobs: [{ scan_id: "s", business_id: "b", status: "queued", done: 0, total: 2, pagespeed_calls: 0, started_at: null }], scans: [scanRow("o", true), scanRow("c1", false), scanRow("c2", false)], scores: 0 };
    const out = await runCompetitorScoringJob(fakeDb(state), "s", { maxSites: 1, env: { PAGESPEED_DAILY_LIMIT: "25000", PAGESPEED_PER_100S_LIMIT: "5" } });
    expect(out).toMatchObject({ status: "running", done: 1, stopped: "max_sites" });
    const again = await runCompetitorScoringJob(fakeDb(state), "s", { maxSites: 1, env: { PAGESPEED_DAILY_LIMIT: "25000", PAGESPEED_PER_100S_LIMIT: "5" } });
    expect(again.status).toBe("done");
  });
});

