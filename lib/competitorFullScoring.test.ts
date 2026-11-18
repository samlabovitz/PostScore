/* eslint-disable @typescript-eslint/no-explicit-any -- an in-memory stand-in for the Supabase query builder */
import { describe, expect, test, vi } from "vitest";

// The website analysis comes from the real owner pipeline; here it's
// replaced so no network is touched.
const analyzeWebsiteForSave = vi.fn();
vi.mock("@/lib/websiteAnalysisForSave", () => ({ analyzeWebsiteForSave: (...a: unknown[]) => analyzeWebsiteForSave(...a) }));

import { breakdownFromChecks, forCompetitorComparison, scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { countingFetch, hasSavedListingFacts, mergeLegacyListing, scoreCompetitorFully, withoutUnmeasuredWebsite } from "./competitorFullScoring";
import { canSpendPagespeed, pacificDayStart, pagespeedDailyBudget, scoringConcurrency } from "./pagespeedBudget";
import { runCompetitorScoringJob, type CompetitorListingInputs } from "./competitorScoringJob";
import type { CompetitorListingInput } from "./competitorFullScoring";
import { COMPETITOR_RAW_COLUMNS } from "./competitorRawCleanup";
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
type State = { jobs: Record<string, any>[]; scans: Record<string, any>[]; scores: number; saved?: unknown; selected?: string[]; writes?: Record<string, unknown>[] };
function fakeDb(state: State) {
  const db = {
    from(table: string) {
      const filters: [string, string, unknown][] = [];
      let patch: Record<string, unknown> | null = null;
      const rows = () =>
        (table === "competitor_scoring_jobs"
          ? state.jobs
          : table === "competitor_scans"
            ? state.scans
            : table === "businesses"
              ? [{ id: "b", language: "en" }]
              : table === "scores"
                ? state.saved
                  ? [{ breakdown_json: state.saved }]
                  : []
                : []
        ).filter((r) => filters.every(([op, k, v]) => (op === "eq" && k in r ? r[k] === v : true)));
      const chain: any = {
        select: (cols?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) return { gte: async () => ({ count: state.scores, error: null }) };
          if (table === "competitor_scans" && cols) (state.selected ??= []).push(cols);
          return chain;
        },
        eq: (k: string, v: unknown) => {
          filters.push(["eq", k, v]);
          if (patch) {
            if (table === "competitor_scans") (state.writes ??= []).push(patch);
            for (const r of rows()) Object.assign(r, patch);
            return Promise.resolve({ error: null });
          }
          return chain;
        },
        gte: () => chain,
        lte: () => chain,
        order: () => chain,
        limit: () => chain,
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

/** A saved row as 2d-4b writes it: our own results only. */
function scanRow(id: string, isSubject: boolean): Record<string, any> {
  return { id, scan_id: "s", is_subject: isSubject, place_id: id, breakdown_json: null, pending_breakdown_json: null };
}

/** A competitor's listing as the scan's search returned it (in memory). */
function listing(over: Partial<CompetitorListingInput> = {}): CompetitorListingInput {
  return { address: "1 Main St", rating: 4.5, review_count: 50, photo_count: 5, has_website: false, website_url: null, phone: "+1 555 0100", opening_hours: { weekday: ["Monday: 9 AM – 5 PM"], periods: [] }, categories: ["deli"], business_status: "OPERATIONAL", ...over };
}
const inputsFor = (...ids: string[]): CompetitorListingInputs => Object.fromEntries(ids.map((id) => [id, listing()]));
const noReread = vi.fn(async () => null);
const ENV = { PAGESPEED_DAILY_LIMIT: "25000" };

describe("the scoring job", () => {
  const ownerScore = scoreBusiness(scoringInput());

  test("scores every competitor from the scan's listings, ranks the owner by their saved score, and publishes all rows together", async () => {
    noReread.mockClear();
    const state: State = { jobs: [{ scan_id: "s", business_id: "b", status: "queued", done: 0, total: 2, pagespeed_calls: 0, started_at: null }], scans: [scanRow("o", true), scanRow("c1", false), scanRow("c2", false)], scores: 0, saved: ownerScore };
    const out = await runCompetitorScoringJob(fakeDb(state), "s", { env: ENV, inputs: inputsFor("c1", "c2"), reread: noReread });
    expect(out).toMatchObject({ status: "done", done: 2, total: 2 });
    expect(noReread).not.toHaveBeenCalled();
    expect(state.jobs[0].status).toBe("done");
    expect(state.scans.find((r) => r.id === "o")!.total).toBe(forCompetitorComparison(ownerScore).total);
    expect(state.scans.every((r) => r.pending_breakdown_json === null && r.breakdown_json)).toBe(true);
    // Scored from the same values the scan read: the listing checks have points.
    expect(state.scans.find((r) => r.id === "c1")!.breakdown_json.checks.find((c: any) => c.id === "completeness.phone").earnedPoints).toBeGreaterThan(0);
  });

  test("Day 23 2d-4b: writes no Google value — no listing column, no quoted text, no Google side of a comparison — and reads only our own columns", async () => {
    analyzeWebsiteForSave.mockResolvedValue({ websiteAnalysis: { infoConsistency: { phone: { websiteValue: "555-0100", googleValue: "+1 555 0100" } } }, httpsStatus: "ok" });
    const state: State = { jobs: [{ scan_id: "s", business_id: "b", status: "queued", done: 0, total: 1, pagespeed_calls: 0, started_at: null }], scans: [scanRow("o", true), scanRow("c1", false)], scores: 0, saved: ownerScore };
    await runCompetitorScoringJob(fakeDb(state), "s", { env: ENV, inputs: { c1: listing({ has_website: true, website_url: "https://rival.example" }) }, reread: noReread });
    analyzeWebsiteForSave.mockReset();
    expect(state.selected).toEqual(["id, is_subject, place_id, breakdown_json, pending_breakdown_json"]);
    expect(state.writes!.length).toBeGreaterThan(0);
    for (const w of state.writes!) {
      for (const c of COMPETITOR_RAW_COLUMNS) expect(w).not.toHaveProperty(c);
      const text = JSON.stringify(w);
      expect(text).not.toContain("googleValue");
      expect(text).not.toContain("+1 555 0100");
      expect(text).not.toContain("1 Main St");
      for (const key of ["breakdown_json", "pending_breakdown_json"]) {
        const b = w[key] as { checks?: Array<{ explanation?: string }> } | null | undefined;
        for (const c of b?.checks ?? []) expect(c.explanation ?? "").toBe("");
      }
    }
  });

  test("the hand-off didn't arrive: exactly one live re-read per competitor; one that can't be read keeps its first score, 'Website couldn't be checked'", async () => {
    const first = scoreBusiness(scoringInput());
    const reread = vi.fn<(placeId: string, businessId: string) => Promise<CompetitorListingInput | null>>(async (placeId) => (placeId === "c1" ? listing() : null));
    const state: State = { jobs: [{ scan_id: "s", business_id: "b", status: "queued", done: 0, total: 2, pagespeed_calls: 0, started_at: null }], scans: [scanRow("o", true), { ...scanRow("c1", false), breakdown_json: first }, { ...scanRow("c2", false), breakdown_json: first }], scores: 0, saved: ownerScore };
    const out = await runCompetitorScoringJob(fakeDb(state), "s", { env: ENV, reread });
    expect(out.status).toBe("done");
    expect(reread.mock.calls.map((c) => c[0]).sort()).toEqual(["c1", "c2"]);
    expect(reread.mock.calls.every((c) => c[1] === "b")).toBe(true);
    const kept = state.scans.find((r) => r.id === "c2")!.breakdown_json;
    expect(kept.total).toBe(first.total);
    expect(kept.checks.find((c: any) => c.id === "website.has_website").meta).toMatchObject({ fullScore: "1" });
  });

  test("a listing in the hand-off is used; only the missing one is re-read", async () => {
    const reread = vi.fn<(placeId: string, businessId: string) => Promise<CompetitorListingInput | null>>(async () => listing());
    const state: State = { jobs: [{ scan_id: "s", business_id: "b", status: "queued", done: 0, total: 2, pagespeed_calls: 0, started_at: null }], scans: [scanRow("o", true), scanRow("c1", false), scanRow("c2", false)], scores: 0, saved: ownerScore };
    await runCompetitorScoringJob(fakeDb(state), "s", { env: ENV, inputs: inputsFor("c1"), reread });
    expect(reread.mock.calls.map((c) => c[0])).toEqual(["c2"]);
  });

  test("stops at the PageSpeed budget — nothing published, the rest resumes later", async () => {
    const state: State = { jobs: [{ scan_id: "s", business_id: "b", status: "queued", done: 0, total: 2, pagespeed_calls: 0, started_at: null }], scans: [scanRow("o", true), scanRow("c1", false), scanRow("c2", false)], scores: 10000, saved: ownerScore };
    // 10,000 owner scans × 2 = 20,000 = the whole 80% budget.
    const out = await runCompetitorScoringJob(fakeDb(state), "s", { env: ENV, inputs: inputsFor("c1", "c2"), reread: noReread });
    expect(out).toMatchObject({ status: "failed", stopped: "pagespeed_budget", done: 0 });
    expect(state.scans.filter((r) => !r.is_subject).every((r) => r.breakdown_json === null)).toBe(true);
  });

  test("more workers than sites: every site scored exactly once, no crash", async () => {
    const state: State = { jobs: [{ scan_id: "s", business_id: "b", status: "queued", done: 0, total: 1, pagespeed_calls: 0, started_at: null }], scans: [scanRow("o", true), scanRow("c1", false)], scores: 0, saved: ownerScore };
    const out = await runCompetitorScoringJob(fakeDb(state), "s", { env: ENV, inputs: inputsFor("c1"), reread: noReread });
    expect(out).toMatchObject({ status: "done", done: 1, total: 1 });
  });

  test("won't run without a configured daily limit", async () => {
    const state: State = { jobs: [{ scan_id: "s", business_id: "b", status: "queued", done: 0, total: 1, pagespeed_calls: 0, started_at: null }], scans: [scanRow("c1", false)], scores: 0 };
    const out = await runCompetitorScoringJob(fakeDb(state), "s", { env: {} });
    expect(out.stopped).toBe("pagespeed_limit_not_set");
  });

  test("one site per call (the Netlify step route) — progress saved, status stays running", async () => {
    const env = { ...ENV, PAGESPEED_PER_100S_LIMIT: "5" };
    const state: State = { jobs: [{ scan_id: "s", business_id: "b", status: "queued", done: 0, total: 2, pagespeed_calls: 0, started_at: null }], scans: [scanRow("o", true), scanRow("c1", false), scanRow("c2", false)], scores: 0, saved: ownerScore };
    const out = await runCompetitorScoringJob(fakeDb(state), "s", { maxSites: 1, env, inputs: inputsFor("c1", "c2"), reread: noReread });
    expect(out).toMatchObject({ status: "running", done: 1, stopped: "max_sites" });
    const again = await runCompetitorScoringJob(fakeDb(state), "s", { maxSites: 1, env, inputs: inputsFor("c1", "c2"), reread: noReread });
    expect(again.status).toBe("done");
  });
});

describe("an added competitor ('Add a competitor') gets the same full scoring", () => {
  const ownerScore = scoreBusiness(scoringInput());
  const first = () => scoreBusiness(scoringInput()); // its first, listing-only score
  const addedState = (): State => ({
    jobs: [{ scan_id: "s", business_id: "b", status: "done", done: 1, total: 1, pagespeed_calls: 3, started_at: null }],
    scans: [scanRow("o", true), { ...scanRow("c1", false), breakdown_json: ownerScore }, { ...scanRow("kathy", false), business_id: "b", breakdown_json: first() }],
    scores: 0,
    saved: ownerScore,
  });

  test("a parked listing link: flagged like the owner's own ('Website link doesn't work'), no website points — not 4/4", async () => {
    const { scoreAddedCompetitor } = await import("./competitorScoringJob");
    const { listingLinkProblem } = await import("./competitorComparison");
    // A real-shaped analysis (the sample business's) whose listing link is a parked domain.
    const real = scoringInput().websiteAnalysis!;
    analyzeWebsiteForSave.mockResolvedValueOnce({
      websiteAnalysis: { ...real, websiteTrust: { ...real.websiteTrust!, checkedAt: "2026-11-18T15:00:00Z", verifiedElsewhereUrl: null, listingLinkBroken: true, listingLinkParked: true, listingLinkErrorPageUrl: "http://kathys.example/" } },
      httpsStatus: "ok",
    });
    const state = addedState();
    const out = await scoreAddedCompetitor(fakeDb(state), "s", "kathy", { env: ENV, input: listing({ has_website: true, website_url: "http://kathys.example/" }), reread: noReread });
    expect(out).toBe("done");
    const row = state.scans.find((r) => r.id === "kathy")!;
    const hasSite = row.breakdown_json.checks.find((c: any) => c.id === "website.has_website");
    expect(hasSite.earnedPoints).toBe(0);
    expect(hasSite.gaps).toContain("listing_parked");
    expect(row.breakdown_json.checks.find((c: any) => c.id === "completeness.website_link").earnedPoints).toBe(0);
    expect(row.total).toBe(row.breakdown_json.total);
    expect(listingLinkProblem({ placeId: "kathy", isSubject: false, breakdown: row.breakdown_json } as any)).toBe("parked");
    // Our own results only; the rest of the scan untouched.
    expect(JSON.stringify(row)).not.toContain("1 Main St");
    for (const c of COMPETITOR_RAW_COLUMNS) expect(row).not.toHaveProperty(c);
    expect(state.scans.find((r) => r.id === "c1")!.breakdown_json).toBe(ownerScore);
  });

  test("its PageSpeed calls count toward today's budget, on the scan's job row", async () => {
    const { scoreAddedCompetitor } = await import("./competitorScoringJob");
    analyzeWebsiteForSave.mockImplementationOnce(async (p: { fetchImpl: typeof fetch }) => {
      await p.fetchImpl("https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=x").catch(() => null);
      return { websiteAnalysis: null, httpsStatus: "ok" };
    });
    const state = addedState();
    const fetchImpl = (async () => new Response("{}")) as unknown as typeof fetch;
    await scoreAddedCompetitor(fakeDb(state), "s", "kathy", { env: ENV, input: listing({ has_website: true, website_url: "https://rival.example" }), reread: noReread, fetchImpl });
    expect(state.jobs[0].pagespeed_calls).toBe(4);
  });

  test("its listing couldn't be read: the first score stays, 'Website couldn't be checked' — never full website points from nothing", async () => {
    const { scoreAddedCompetitor } = await import("./competitorScoringJob");
    const state = addedState();
    const reread = vi.fn(async () => null);
    expect(await scoreAddedCompetitor(fakeDb(state), "s", "kathy", { env: ENV, reread })).toBe("kept_first_score");
    expect(reread).toHaveBeenCalledWith("kathy", "b");
    const hasSite = state.scans.find((r) => r.id === "kathy")!.breakdown_json.checks.find((c: any) => c.id === "website.has_website");
    expect(hasSite.meta).toMatchObject({ fullScore: "1" });
  });

  test("over the PageSpeed budget or without a limit: nothing scored", async () => {
    const { scoreAddedCompetitor } = await import("./competitorScoringJob");
    expect(await scoreAddedCompetitor(fakeDb({ ...addedState(), scores: 10000 }), "s", "kathy", { env: ENV, input: listing(), reread: noReread })).toBe("pagespeed_budget");
    expect(await scoreAddedCompetitor(fakeDb(addedState()), "s", "kathy", { env: {}, input: listing() })).toBe("pagespeed_limit_not_set");
    expect(await scoreAddedCompetitor(fakeDb(addedState()), "s", "nobody", { env: ENV, input: listing() })).toBe("missing");
  });

  test("'Add a competitor' starts it, with the listing from the owner's own search (in memory)", async () => {
    const src = (await import("node:fs")).readFileSync("app/actions/competitorOverrides.ts", "utf8");
    expect(src).toContain("startAddedCompetitorScoring(latest.scan_id, placeId, competitorListingInput(ranked));");
    const route = (await import("node:fs")).readFileSync("app/api/cron/competitor-scoring/route.ts", "utf8");
    expect(route).toContain("scoreAddedCompetitor(createAdminClient(), scanId, placeId, { input: listingInputsFromBody(body.inputs)?.[placeId] ?? null })");
  });
});
