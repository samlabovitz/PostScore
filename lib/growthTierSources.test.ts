// Day 25B step 6: where each counted action comes from, and which rows are
// tests (spec §6.2): practice mode, an internal account, an offer marked
// is_test, an undone Google change; the dev test login's exception; the Monday
// job and the reset (off / dry run by default); the dev-only preview tier.
import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

import { loadGrowthFacts, OFFER_USE_LOG_SINCE } from "./growthTier.server";
import { weekRecord } from "./growthTier";
import { devPreviewTier, devTierAllowed } from "./devTier";
import { growthTiersLive } from "./growthTierRun.server";

type Row = Record<string, unknown>;
/** A read-only fake: every query returns the seeded table, filtered by business_id. */
function fakeAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      const result = () => ({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null });
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v || (k === "id" && table === "growth_settings")), chain),
        order: () => chain,
        is: () => chain,
        maybeSingle: async () => ({ data: result().data[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve(result()),
      };
      return chain;
    },
  } as never;
}

const B = "b1";
const WEEK = "2026-11-09"; // Monday
const at = (day: number, h = 15) => `2026-11-${String(9 + day).padStart(2, "0")}T${h}:00:00Z`;
const internal = { devLoginId: "dev", internalIds: new Set(["dev", "switcher"]) };
const seed = (owner: string): Record<string, Row[]> => ({
  businesses: [{ id: B, owner_id: owner, lat: 41.07, lng: -73.86 }],
  gbp_changes: [
    { business_id: B, approved_at: at(1), approved_by: owner, kind: "profile_info", status: "sent", practice: false, undo_of: null, undone_at: null },
    { business_id: B, approved_at: at(2), approved_by: owner, kind: "profile_info_practice", status: "sent", practice: true, undo_of: null, undone_at: null },
    { business_id: B, approved_at: at(3), approved_by: owner, kind: "attributes", status: "sent", practice: false, undo_of: null, undone_at: at(3, 16) },
  ],
  gbp_review_reply_log: [{ business_id: B, created_at: at(1), user_id: owner, action: "post", status: "practice" }],
  promos: [{ business_id: B, created_at: at(2), is_test: true }],
  referrals: [],
  scan_changes: [{ business_id: B, at: at(4), field: "reviews", direction: "up", delta: 3 }],
  tasks: [{ business_id: B, marked_done_at: at(1) }],
  weekly_checks: [{ business_id: B, checked_at: at(2) }],
  offer_uses: [],
  gbp_monthly_insights: [],
  gbp_connections: [],
  growth_closed_weeks: [],
  growth_business_start: [],
  growth_settings: [],
  scores: [],
});

describe("which rows count (§6.2)", () => {
  test("a real owner: only the real Google change and their own check-offs; practice, test offers and undone changes never", async () => {
    const loaded = (await loadGrowthFacts(fakeAdmin(seed("owner")), B, internal))!;
    expect(loaded.ownerKind).toBe("owner");
    const w = weekRecord(loaded.facts, WEEK);
    expect(w.verified).toBe(1); // the real profile change
    expect(w.told).toBe(2); // the task and the routine item
    expect(loaded.removed).toEqual({ practice: 2, internal: 0, isTest: 1, undone: 1 });
    expect(loaded.facts.reviewIncreases).toEqual([{ at: at(4), delta: 3 }]);
  });
  test("the dev test login: its test rows count (practice, test offer, its own clicks); the undone change never", async () => {
    const loaded = (await loadGrowthFacts(fakeAdmin(seed("dev")), B, internal))!;
    expect(loaded.ownerKind).toBe("dev");
    expect(loaded.facts.countTestRows).toBe(true);
    const w = weekRecord(loaded.facts, WEEK);
    expect(w.verified).toBe(4); // real change + practice change + practice reply + test offer
    expect(w.told).toBe(2);
  });
  test("another internal account (a plan switcher): nothing of theirs counts", async () => {
    const loaded = (await loadGrowthFacts(fakeAdmin(seed("switcher")), B, internal))!;
    expect(loaded.ownerKind).toBe("internal");
    const w = weekRecord(loaded.facts, WEEK);
    expect(w.active).toBe(false);
  });
  test("a claimed business starts fresh from the claim date; the reset date wins when later", async () => {
    const tables = seed("owner");
    tables.growth_business_start = [{ business_id: B, counts_from: "2026-11-12T05:00:00Z" }];
    const loaded = (await loadGrowthFacts(fakeAdmin(tables), B, internal))!;
    expect(loaded.facts.countsFrom).toBe("2026-11-12T05:00:00Z");
    expect(weekRecord(loaded.facts, WEEK).verified).toBe(0); // the real change was Nov 10, before the claim
  });
  test("R4 can't be checked before dated +1 logging; each +1 is logged with the offer's test flag", () => {
    expect(OFFER_USE_LOG_SINCE).toMatch(/^2026-11-24/);
    for (const f of ["app/actions/promos.ts", "app/actions/referrals.ts"]) expect(readFileSync(f, "utf8"), f).toMatch(/await logOfferUse\(supabase, "(promo|referral)", (promoId|referralId), user\.id\);/);
    expect(readFileSync("lib/offerUses.server.ts", "utf8")).toContain("is_test: row.is_test === true");
  });
});

describe("the Monday job and the reset", () => {
  test("off until Sam approves: dry run unless GROWTH_TIERS_LIVE is 'true'; never emails or notifies", () => {
    expect(growthTiersLive({})).toBe(false);
    expect(growthTiersLive({ GROWTH_TIERS_LIVE: "true" })).toBe(true);
    const route = readFileSync("app/api/cron/growth-tiers/route.ts", "utf8");
    expect(route).toContain('const dryRun = request.nextUrl.searchParams.get("dry") === "1" || !growthTiersLive();');
    const run = readFileSync("lib/growthTierRun.server.ts", "utf8");
    expect(run).not.toMatch(/sendEmail|notifications|insertNotification/);
    expect(readFileSync("netlify/functions/growth-tiers-scheduler.mts", "utf8")).toContain('schedule: "0 9 * * 1"');
  });
  test("the reset: a dry run unless --apply; it clears only tier rows and weekly activity, and sets the reset date", () => {
    const src = readFileSync("scripts/reset-growth-tiers.ts", "utf8");
    expect(src).toContain('const apply = process.argv.includes("--apply");');
    expect(src).toContain('for (const table of ["growth_tiers", "growth_weeks"])');
    expect(src).not.toMatch(/from\("(scores|scan_changes|promos|referrals|tasks|gbp_changes|gbp_review_reply_log|offer_uses|growth_closed_weeks)"\)\.delete/);
  });
});

describe("the dev-only preview tier", () => {
  test("only the dev test login, only under next dev; a cookie, never saved", () => {
    const env = { NODE_ENV: "development", DEV_TEST_LOGIN_EMAIL: "dev@example.com" };
    expect(devTierAllowed(env, "dev@example.com")).toBe(true);
    expect(devTierAllowed({ ...env, NODE_ENV: "production" }, "dev@example.com")).toBe(false);
    expect(devTierAllowed(env, "owner@salon.com")).toBe(false);
    expect(devPreviewTier("3", true)).toBe(3);
    expect(devPreviewTier("3", false)).toBeNull();
    expect(devPreviewTier("9", true)).toBeNull();
    expect(readFileSync("app/api/dev/tier/route.ts", "utf8")).not.toMatch(/\.insert\(|\.upsert\(|\.update\(/);
  });
});
