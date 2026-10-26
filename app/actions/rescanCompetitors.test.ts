import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";

// Re-scans and competitors, by plan: Premium/Multi refresh competitors on
// every re-scan, Grow at most weekly, Free never (no Nearby Search call).
// Every Google call in a competitor scan goes through
// findAndScoreCompetitors (lib/competitors.ts) — replaced with a spy.
const nearbySpy = vi.fn();
vi.mock("@/lib/competitors", async () => {
  const actual = await vi.importActual<typeof import("@/lib/competitors")>("@/lib/competitors");
  return { ...actual, findAndScoreCompetitors: (...args: unknown[]) => nearbySpy(...args) };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ownerWebsiteBasic", () => ({ ownerBasicWebsiteCheck: async () => ({ result: null, renders: 0 }) }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshCompetitorsOnRescanWithClient } from "./competitors";
import { competitorScanTargets, growNextCompetitorUpdate, GROW_RESCAN_COMPETITOR_DAYS, rescanRefreshesCompetitors } from "@/lib/competitorScanPolicy";
import { backgroundPlan } from "@/lib/plan";
import { FREE_RESCAN_DAYS, rescanGate } from "@/lib/rescanPolicy";
import { competitorPageLines, rescanCompetitorsLine, rescanCompetitorsToast } from "@/lib/competitorSchedule";

const NOW = new Date("2026-10-22T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

/** competitor_scans → the latest scan (time, and how many competitors it
 * found); counts queries. */
function db(latest: string | null, competitors = 5) {
  const seen = { queries: 0 };
  const chain = (): Record<string, unknown> => {
    let counting = false;
    const c: Record<string, unknown> = {
      select: (_cols: string, opts?: { count?: string }) => ((counting = !!opts?.count), c),
      eq: () => c,
      order: () => c,
      limit: async () => {
        seen.queries += 1;
        return { data: latest ? [{ created_at: latest, scan_id: "s1" }] : [], error: null };
      },
      then: (resolve: (v: unknown) => void) => {
        seen.queries += 1;
        resolve(counting ? { count: competitors, error: null } : { data: [], error: null });
      },
    };
    return c;
  };
  return { client: { from: () => chain() } as unknown as SupabaseClient, seen };
}

const saved = () => vi.fn(async () => ({ status: "saved" as const, scanId: "s1" }));

describe("Free: 1 owner re-scan every 7 days, enforced server-side", () => {
  test("the gate: blocked for 7 days after an owner re-scan, then open; paid plans only the 24-hour rule", () => {
    expect(FREE_RESCAN_DAYS).toBe(7);
    expect(rescanGate(true, daysAgo(6), daysAgo(6), NOW)).toMatchObject({ allowed: false, limit: "weekly", nextAvailableAt: new Date(Date.parse(daysAgo(6)) + 7 * 86_400_000).toISOString() });
    expect(rescanGate(true, daysAgo(7), daysAgo(7), NOW).allowed).toBe(true);
    expect(rescanGate(false, daysAgo(2), daysAgo(1), NOW).allowed).toBe(true);
    expect(rescanGate(false, new Date(NOW.getTime() - 3_600_000).toISOString(), null, NOW)).toMatchObject({ allowed: false, limit: "daily" });
  });

  test("rescanBusiness checks the gate before any Google call (the button isn't the only guard)", () => {
    const src = readFileSync("app/actions/scoring.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function rescanBusiness("), src.indexOf("export async function rescanBusinessWithClient("));
    expect(fn.indexOf("rescanGate(")).toBeGreaterThan(-1);
    expect(fn.indexOf("rescanGate(")).toBeLessThan(fn.indexOf("rescanBusinessWithClient("));
    expect(fn).toContain("if (!gate.allowed) return { status: \"too_soon\"");
    expect(fn.indexOf("refreshCompetitorsOnRescanWithClient(supabase, businessId, plan)")).toBeGreaterThan(fn.indexOf("rescanBusinessWithClient("));
    expect(fn).not.toContain("ensureFirstCompetitorScanWithClient");
  });
});

describe("Free re-scans make no competitor Nearby Search calls — except when the latest scan found none", () => {
  test("a saved scan with competitors: never a competitor search on Free, never reaches Nearby Search", async () => {
    nearbySpy.mockClear();
    for (const latest of [daysAgo(1), daysAgo(400)]) {
      const run = saved();
      expect(await refreshCompetitorsOnRescanWithClient(db(latest, 6).client, "b1", "free", NOW, run)).toBe("skipped");
      expect(run).not.toHaveBeenCalled();
    }
    expect(await refreshCompetitorsOnRescanWithClient(db(daysAgo(1), 6).client, "b1", "free", NOW)).toBe("skipped");
    expect(nearbySpy).not.toHaveBeenCalled();
    expect(rescanRefreshesCompetitors("free", daysAgo(1), NOW)).toBe(false);
  });

  test("the one exception: the latest scan came back with NO competitors (or there's none yet) → search again right away", async () => {
    const none = saved();
    expect(await refreshCompetitorsOnRescanWithClient(db(daysAgo(1), 0).client, "b1", "free", NOW, none)).toBe("refreshed");
    expect(none).toHaveBeenCalledTimes(1);
    const first = saved();
    expect(await refreshCompetitorsOnRescanWithClient(db(null).client, "b1", "free", NOW, first)).toBe("refreshed");
    expect(rescanRefreshesCompetitors("free", daysAgo(1), NOW, true)).toBe(true);
    expect(rescanRefreshesCompetitors("free", null, NOW)).toBe(true);
  });
});

describe("paid re-scans still refresh competitors", () => {
  test("Premium and Multi: every re-scan", async () => {
    for (const plan of ["premium", "multi"] as const) {
      for (const latest of [daysAgo(0), daysAgo(1), null]) {
        const run = saved();
        expect(await refreshCompetitorsOnRescanWithClient(db(latest).client, "b1", plan, NOW, run)).toBe("refreshed");
        expect(run).toHaveBeenCalledTimes(1);
        expect(run).toHaveBeenCalledWith(expect.anything(), "b1", { enforceCooldown: false, now: NOW });
      }
    }
  });

  test("Grow: once a week — skipped when the last competitor scan is under 7 days old", async () => {
    expect(GROW_RESCAN_COMPETITOR_DAYS).toBe(7);
    const fresh = saved();
    expect(await refreshCompetitorsOnRescanWithClient(db(daysAgo(3)).client, "b1", "grow", NOW, fresh)).toBe("skipped");
    expect(fresh).not.toHaveBeenCalled();
    for (const latest of [daysAgo(7), daysAgo(20), null]) {
      const run = saved();
      expect(await refreshCompetitorsOnRescanWithClient(db(latest).client, "b1", "grow", NOW, run)).toBe("refreshed");
      expect(run).toHaveBeenCalledTimes(1);
    }
  });

  test("the month's cap or a failed scan never fails the re-scan", async () => {
    expect(await refreshCompetitorsOnRescanWithClient(db(null).client, "b1", "premium", NOW, vi.fn(async () => ({ status: "capped" as const, nextAvailableAt: "2026-11-01T00:00:00.000Z" })))).toBe("skipped");
    expect(await refreshCompetitorsOnRescanWithClient(db(null).client, "b1", "premium", NOW, vi.fn(async () => { throw new Error("boom"); }))).toBe("skipped");
  });
});

describe("Free never refreshes competitors outside re-scans either (monthly report, rescan-all)", () => {
  test("the background plan: no stored paid plan exists yet, so Free (development: POSTSCORE_DEV_PLAN)", () => {
    expect(backgroundPlan("u1", { NODE_ENV: "production" })).toBe("free");
    expect(backgroundPlan("u1", { NODE_ENV: "production", POSTSCORE_DEV_PLAN: "premium" })).toBe("free");
    expect(backgroundPlan("u1", { NODE_ENV: "development", POSTSCORE_DEV_PLAN: "grow" })).toBe("grow");
  });

  test("the monthly report reuses any saved scan on Free (never pays for a refresh)", () => {
    const cron = readFileSync("app/api/cron/monthly-reports/route.ts", "utf8");
    expect(cron).toContain('const free = backgroundPlan(optIn.owner_id ?? null) === "free";');
    expect(cron).toContain("latestScan && (free || isScanFresh(latestScan.created_at, new Date()))");
  });

  test("scripts/rescan-all.ts: Free businesses are never targeted once they have a scan", () => {
    const script = readFileSync("scripts/rescan-all.ts", "utf8");
    expect(script).toMatch(/latestCompetitorScanAt: scanTimes\.get\(b\.id\) \?\? null, plan: backgroundPlan\(/);
    expect(competitorScanTargets([{ id: "f", latestCompetitorScanAt: daysAgo(400), plan: "free" }], { withCompetitors: true, competitorsOnly: false }, NOW)).toEqual([]);
    expect(competitorScanTargets([{ id: "p", latestCompetitorScanAt: daysAgo(400), plan: "premium" }], { withCompetitors: true, competitorsOnly: false }, NOW)).toEqual(["p"]);
  });
});

describe("when competitors update — said plainly, per plan", () => {
  test("Competitors page: last updated on every plan; Free “don't update”; Grow “Next update: {date}”", () => {
    expect(competitorPageLines("free", "2026-10-16T20:00:00Z", "en", "America/New_York", NOW)).toEqual(["Competitors last updated Oct 16, 2026.", "Competitors don't update on the Free plan."]);
    expect(competitorPageLines("grow", daysAgo(3), "en", "America/New_York", NOW)[1]).toBe("Next update: Oct 26, 2026.");
    expect(competitorPageLines("grow", daysAgo(9), "en", "America/New_York", NOW)[1]).toBe("Next update: with your next re-scan.");
    expect(competitorPageLines("premium", null, "en", "America/New_York", NOW)).toEqual(["Competitors haven't been scanned yet.", "Every re-scan also updates your competitors."]);
    expect(competitorPageLines("free", null, "es", "America/New_York", NOW)[1]).toBe("La competencia no se actualiza en el plan Gratis.");
    expect(growNextCompetitorUpdate(daysAgo(3))).toBe(new Date(Date.parse(daysAgo(3)) + 7 * 86_400_000).toISOString());
  });

  test("beside the Re-scan button: one line per plan", () => {
    expect(rescanCompetitorsLine("free", daysAgo(3), "en", "America/New_York", NOW)).toBe("Re-scans update your own score. Competitors don't update on Free — upgrade to refresh them.");
    expect(rescanCompetitorsLine("grow", daysAgo(3), "en", "America/New_York", NOW)).toBe("Competitors update once a week. Next competitor update: Oct 26, 2026.");
    expect(rescanCompetitorsLine("grow", daysAgo(8), "en", "America/New_York", NOW)).toBe("Competitors update once a week. Your next re-scan updates them too.");
    for (const plan of ["premium", "multi"] as const) expect(rescanCompetitorsLine(plan, null, "en", "America/New_York", NOW)).toBe("Every re-scan also updates your competitors.");
  });

  test("the toast says whether competitors were updated this time", () => {
    expect(rescanCompetitorsToast("premium", "refreshed", "en")).toBe("Competitors updated too.");
    expect(rescanCompetitorsToast("grow", "refreshed", "en")).toBe("Competitors updated too.");
    expect(rescanCompetitorsToast("grow", "skipped", "en")).toBe("Competitors weren't updated this time — they update once a week.");
    expect(rescanCompetitorsToast("free", "skipped", "en")).toBe("Competitors don't update on Free.");
    expect(rescanCompetitorsToast("multi", "skipped", "es")).toBe("Esta vez no se pudo actualizar la competencia.");
  });
});
