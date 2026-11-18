/* eslint-disable @typescript-eslint/no-explicit-any -- an in-memory stand-in for the Supabase query builder */
// Competitor refresh speed-up: 5 at a time, the new list right away, a
// competitor's own website result reused for 14 days, a 5-minute limit per site.
import { describe, expect, test, vi } from "vitest";

const analyzeWebsiteForSave = vi.fn();
vi.mock("@/lib/websiteAnalysisForSave", () => ({ analyzeWebsiteForSave: (...a: unknown[]) => analyzeWebsiteForSave(...a) }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { breakdownFromChecks, scoreBusiness, SCORING_VERSION, type ScoreBreakdown } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { pickReusableWebsite, withReusedWebsite, websiteCheckedAt, WEBSITE_REUSE_DAYS, type PriorWebsiteRow } from "./competitorWebsiteReuse";
import { scoreCompetitorFully, WEBSITE_CHECK_DEADLINE_MS, type CompetitorListingInput } from "./competitorFullScoring";
import { withWebsitePending } from "./competitors";
import { runCompetitorScoringJob } from "./competitorScoringJob";
import { MAX_SCORING_CONCURRENCY, scoringConcurrency } from "./pagespeedBudget";

const NOW = Date.parse("2026-11-18T18:00:00Z");
const SITE = "https://rival.example/";
const days = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

/** A fully checked website result as a finished scan saved it. */
function fullScore(over: { websiteNotChecked?: string; speed?: number } = {}): ScoreBreakdown {
  const b = scoreBusiness(scoringInput());
  const checks = b.checks.map((c) =>
    c.id === "website.has_website"
      ? { ...c, meta: { ...(c.meta ?? {}), fullScore: "1", ...(over.websiteNotChecked ? { websiteNotChecked: over.websiteNotChecked } : {}) } }
      : c.id === "website.performance_mobile" && over.speed !== undefined
        ? { ...c, earnedPoints: over.speed }
        : c
  );
  return breakdownFromChecks(checks);
}
const analysis = (checkedAt: string, url = SITE) => ({ checkedAt, mobilePerformance: { measuredUrl: url } });
const prior = (over: Partial<PriorWebsiteRow> & { checkedAt?: string; url?: string } = {}): PriorWebsiteRow => ({
  scan_id: over.scan_id ?? "older",
  scoring_version: over.scoring_version ?? SCORING_VERSION,
  breakdown_json: over.breakdown_json ?? fullScore(),
  website_analysis_json: over.website_analysis_json ?? analysis(over.checkedAt ?? days(3), over.url),
});
const pick = (rows: PriorWebsiteRow[], listingWebsite: string | null = SITE) => pickReusableWebsite(rows, { listingWebsite, scanId: "new", now: NOW });

describe("reusing a competitor's own website result (14 days)", () => {
  test("a fully checked result from the last 14 days, same address, same scoring version: reused", () => {
    expect(WEBSITE_REUSE_DAYS).toBe(14);
    expect(pick([prior({ checkedAt: days(13) })])?.checkedAt).toBe(days(13));
  });

  test("never: older than 14 days, another address, 'couldn't check', another scoring version, this same scan, no website", () => {
    expect(pick([prior({ checkedAt: days(15) })])).toBeNull();
    expect(pick([prior({ url: "https://someone-else.example/" })])).toBeNull();
    expect(pick([prior({ breakdown_json: fullScore({ websiteNotChecked: "deadline" }) })])).toBeNull();
    expect(pick([prior({ breakdown_json: fullScore({ websiteNotChecked: "blocked" }) })])).toBeNull();
    expect(pick([prior({ scoring_version: "1.16.0" })])).toBeNull();
    expect(pick([prior({ scan_id: "new" })])).toBeNull();
    expect(pick([prior()], null)).toBeNull();
    // A first score (never fully checked) isn't a website result.
    expect(pick([prior({ breakdown_json: scoreBusiness(scoringInput()) })])).toBeNull();
    // No address of our own measurement saved: not reused.
    expect(pick([prior({ website_analysis_json: { checkedAt: days(2) } })])).toBeNull();
  });

  test("the newest check wins", () => {
    expect(pick([prior({ checkedAt: days(9) }), prior({ checkedAt: days(2) }), prior({ checkedAt: days(5) })])?.checkedAt).toBe(days(2));
  });

  test("the listing is scored fresh; the Website results come from the reused check, dated", () => {
    const first = withWebsitePending(scoreBusiness(scoringInput({ rating: 3.1, reviewCount: 4 })), "en");
    const saved = fullScore({ speed: 3 });
    const out = withReusedWebsite(first, saved, days(4), "en");
    expect(out.checks.find((c) => c.id === "visibility.rating")).toEqual(first.checks.find((c) => c.id === "visibility.rating"));
    expect(out.checks.find((c) => c.id === "website.performance_mobile")!.earnedPoints).toBe(3);
    expect(out.checks.find((c) => c.id === "completeness.website_link")).toEqual(saved.checks.find((c) => c.id === "completeness.website_link"));
    expect(websiteCheckedAt(out)).toBe(days(4));
    expect(out.total).toBe(breakdownFromChecks(out.checks).total);
  });
});

describe("a website check gets 5 minutes at most", () => {
  test("past it: 'couldn't be checked (timed out)', no website points, tried again next refresh (never reused)", async () => {
    expect(WEBSITE_CHECK_DEADLINE_MS).toBe(5 * 60 * 1000);
    analyzeWebsiteForSave.mockImplementationOnce(() => new Promise(() => {}));
    const listing: CompetitorListingInput = { address: "1 Main St", rating: 4.5, review_count: 50, photo_count: 5, has_website: true, website_url: SITE, phone: "1", opening_hours: { weekday: ["Monday: 9 AM – 5 PM"], periods: [] }, categories: ["deli"], business_status: "OPERATIONAL" };
    const res = await scoreCompetitorFully({ ...listing, place_id: "slow", breakdown_json: null }, { locale: "en", deadlineMs: 20 });
    const hasSite = res.breakdown.checks.find((c) => c.id === "website.has_website")!;
    expect(hasSite.meta).toMatchObject({ websiteNotChecked: "deadline", fullScore: "1" });
    expect(res.breakdown.categories.find((c) => c.id === "website")!.possiblePoints).toBe(0);
    expect(pick([prior({ breakdown_json: res.breakdown })])).toBeNull();
  });
});

describe("the list shown right away never credits an unchecked website", () => {
  test("a first score's 'Has a website' waits for the check; the rest of the listing counts", () => {
    const raw = scoreBusiness(scoringInput());
    const first = withWebsitePending(raw, "en");
    expect(raw.checks.find((c) => c.id === "website.has_website")!.earnedPoints).toBe(4);
    expect(first.checks.find((c) => c.id === "website.has_website")!.earnedPoints).toBeNull();
    expect(first.checks.find((c) => c.id === "visibility.rating")).toEqual(raw.checks.find((c) => c.id === "visibility.rating"));
  });
});

// ---- the job against an in-memory store ----
type State = { jobs: Record<string, any>[]; scans: Record<string, any>[]; saved: unknown };
function fakeDb(state: State) {
  return {
    from(table: string) {
      const filters: Array<[string, string, unknown]> = [];
      let patch: Record<string, unknown> | null = null;
      const source = () => (table === "competitor_scoring_jobs" ? state.jobs : table === "competitor_scans" ? state.scans : table === "businesses" ? [{ id: "b", language: "en" }] : table === "scores" ? [{ breakdown_json: state.saved }] : []);
      const rows = () =>
        source().filter((r: any) =>
          filters.every(([op, k, v]) => (op === "eq" ? !(k in r) || r[k] === v : op === "notnull" ? r[k] !== null && r[k] !== undefined : true))
        );
      const chain: any = {
        select: (_c?: string, o?: { head?: boolean }) => {
          if (o?.head && table === "scores") return { gte: async () => ({ count: 0, error: null }) };
          if (o?.head) {
            const head: any = { eq: (k: string, v: unknown) => (filters.push(["eq", k, v]), head), not: (k: string) => (filters.push(["notnull", k, null]), head), then: (r: any) => r({ count: rows().length, error: null }) };
            return head;
          }
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
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        update: (p: Record<string, unknown>) => ((patch = p), chain),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const firstScore = () => withWebsitePending(scoreBusiness(scoringInput()), "en");
const row = (id: string, isSubject = false) => ({ id, scan_id: "new", is_subject: isSubject, place_id: id, breakdown_json: isSubject ? null : firstScore(), pending_breakdown_json: null, total: null });
const listing = (): CompetitorListingInput => ({ address: "1 Main St", rating: 4.5, review_count: 50, photo_count: 5, has_website: true, website_url: SITE, phone: "1", opening_hours: { weekday: ["Monday: 9 AM – 5 PM"], periods: [] }, categories: ["deli"], business_status: "OPERATIONAL" });
const ENV = { PAGESPEED_DAILY_LIMIT: "25000" };
const newState = (kind = "new_scan"): State => ({
  jobs: [{ scan_id: "new", business_id: "b", kind, status: "queued", done: 0, total: 2, pagespeed_calls: 0, started_at: null }],
  scans: [row("o", true), row("c1"), row("c2")],
  saved: scoreBusiness(scoringInput()),
});

describe("the scoring job, sped up", () => {
  test("5 sites at a time", () => {
    expect(MAX_SCORING_CONCURRENCY).toBe(5);
    expect(scoringConcurrency({})).toBe(5);
  });

  test("a site checked in the last 14 days: its result is reused, the site isn't checked again; the other is checked", async () => {
    analyzeWebsiteForSave.mockReset();
    analyzeWebsiteForSave.mockResolvedValue({ websiteAnalysis: null, httpsStatus: "ok" });
    const state = newState();
    const out = await runCompetitorScoringJob(fakeDb(state), "new", {
      env: ENV,
      now: NOW,
      inputs: { c1: listing(), c2: listing() },
      reread: async () => null,
      priorRows: async (placeId) => (placeId === "c1" ? [prior({ checkedAt: days(3) })] : []),
    });
    expect(out.status).toBe("done");
    expect(analyzeWebsiteForSave).toHaveBeenCalledTimes(1);
    expect(websiteCheckedAt(state.scans.find((r) => r.id === "c1")!.breakdown_json)).toBe(days(3));
    expect(websiteCheckedAt(state.scans.find((r) => r.id === "c2")!.breakdown_json)).toBeNull();
  });

  test("a backfill (--rescore) always checks fresh", async () => {
    analyzeWebsiteForSave.mockReset();
    analyzeWebsiteForSave.mockResolvedValue({ websiteAnalysis: null, httpsStatus: "ok" });
    const state = newState("backfill");
    await runCompetitorScoringJob(fakeDb(state), "new", { env: ENV, now: NOW, inputs: { c1: listing(), c2: listing() }, reread: async () => null, priorRows: async () => [prior()] });
    expect(analyzeWebsiteForSave).toHaveBeenCalledTimes(2);
  });

  test("a new scan's rows are published as each site finishes (the page shows them filling in)", async () => {
    analyzeWebsiteForSave.mockResolvedValue({ websiteAnalysis: null, httpsStatus: "ok" });
    const state = newState();
    const out = await runCompetitorScoringJob(fakeDb(state), "new", { env: ENV, now: NOW, maxSites: 1, inputs: { c1: listing(), c2: listing() }, reread: async () => null, priorRows: async () => [] });
    expect(out.status).toBe("running");
    const scored = state.scans.filter((r) => !r.is_subject && r.breakdown_json?.checks.find((c: any) => c.id === "website.has_website")?.meta?.fullScore === "1");
    expect(scored).toHaveLength(1);
    expect(scored[0].total).toBe(scored[0].breakdown_json.total);
    // The owner is on their saved score already.
    expect(state.scans.find((r) => r.is_subject)!.breakdown_json).toBeTruthy();
  });

  test("one named site per step (Netlify runs several at once): only that site, and the closing step publishes", async () => {
    analyzeWebsiteForSave.mockResolvedValue({ websiteAnalysis: null, httpsStatus: "ok" });
    const state = newState();
    const db = fakeDb(state);
    const opts = { env: ENV, now: NOW, maxSites: 1, inputs: { c1: listing(), c2: listing() }, reread: async () => null, priorRows: async () => [] };
    const a = await runCompetitorScoringJob(db, "new", { ...opts, onlyPlaceId: "c2" });
    expect(a).toMatchObject({ status: "running", done: 1 });
    expect(state.scans.find((r) => r.id === "c1")!.pending_breakdown_json).toBeNull();
    const b = await runCompetitorScoringJob(db, "new", { ...opts, onlyPlaceId: "c1" });
    expect(b).toMatchObject({ status: "running", done: 2 });
    expect(state.jobs[0].status).toBe("running");
    const closing = await runCompetitorScoringJob(db, "new", opts);
    expect(closing.status).toBe("done");
    expect(state.jobs[0].status).toBe("done");
  });
});

describe("Netlify: parallel one-site steps", () => {
  test("each competitor named once, at most COMPETITOR_SCORING_PARALLEL_STEPS at a time (default 1), every step's time logged, then a closing step", async () => {
    const fn = "../netlify/functions/competitor-scoring-batch.mts";
    const { default: handler } = (await import(/* @vite-ignore */ fn)) as { default: (req: Request) => Promise<void> };
    for (const [setting, expectMax] of [[undefined, 1], ["5", 5], ["9", 5]] as const) {
      vi.stubEnv("CRON_SECRET", "s");
      vi.stubEnv("URL", "https://example.test");
      if (setting) vi.stubEnv("COMPETITOR_SCORING_PARALLEL_STEPS", setting);
      const bodies: any[] = [];
      let inFlight = 0;
      let maxInFlight = 0;
      const logs: string[] = [];
      const log = vi.spyOn(console, "log").mockImplementation((l: string) => void logs.push(l));
      vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        bodies.push(body);
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return new Response(JSON.stringify({ status: body.placeId ? "running" : "done", done: 1, total: 7 }), { status: 200 });
      });
      const inputs = Object.fromEntries(["a", "b", "c", "d", "e", "f", "g"].map((id) => [id, {}]));
      await handler(new Request("https://example.test/.netlify/functions/competitor-scoring-batch", { method: "POST", headers: { authorization: "Bearer s" }, body: JSON.stringify({ scanId: "scan", inputs }) }));
      const named = bodies.filter((b) => b.placeId).map((b) => b.placeId);
      expect(named.sort()).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
      expect(maxInFlight).toBe(expectMax);
      expect(bodies.at(-1).placeId).toBeUndefined();
      expect(logs.filter((l) => / in \d+\.\d s$/.test(l))).toHaveLength(8);
      log.mockRestore();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
