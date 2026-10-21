import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The plan switcher on the live site: only a signed-in PLAN_SWITCHER_EMAILS
// user, checked on the server (getPlan() and /api/dev/plan) — never just by
// hiding the pill. The session and the switch cookie are faked here.
const state = vi.hoisted(() => ({ email: null as string | null, cookie: null as string | null, getUserCalls: 0 }));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: (name: string) => (name === "ps_dev_plan" && state.cookie ? { value: state.cookie } : undefined) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => {
        state.getUserCalls += 1;
        return { data: { user: state.email ? { id: "u1", email: state.email } : null } };
      },
    },
  }),
}));

import { canSwitchPlan, getPlan, resolvePlan, switcherAllowed, switcherEmails } from "@/lib/premium";
import { GET } from "@/app/api/dev/plan/route";

const ME = "sam@example.com";
const PROD = { NODE_ENV: "production", PLAN_SWITCHER_EMAILS: ` ${ME.toUpperCase()} , other-tester@example.com` };
const switchTo = (plan: string) =>
  GET({ nextUrl: new URL(`https://postscore.app/api/dev/plan?plan=${plan}&back=/business/b1`), url: `https://postscore.app/api/dev/plan?plan=${plan}&back=/business/b1` } as never);

beforeEach(() => {
  state.email = null;
  state.cookie = null;
  state.getUserCalls = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe("the list", () => {
  test("comma-separated, trimmed, case-insensitive; empty or missing = nobody", () => {
    expect(switcherEmails(PROD)).toEqual([ME, "other-tester@example.com"]);
    expect(switcherAllowed(PROD, "Sam@Example.com")).toBe(true);
    expect(switcherAllowed(PROD, "someone@else.com")).toBe(false);
    expect(switcherAllowed(PROD, null)).toBe(false);
    expect(switcherAllowed({ NODE_ENV: "production", PLAN_SWITCHER_EMAILS: "" }, ME)).toBe(false);
    expect(switcherAllowed({ NODE_ENV: "production" }, ME)).toBe(false);
  });
});

describe("production: only the listed email can switch", () => {
  test("the allowed email: the route sets the plan and getPlan() honors it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLAN_SWITCHER_EMAILS", PROD.PLAN_SWITCHER_EMAILS);
    state.email = ME;
    const res = await switchTo("premium");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://postscore.app/business/b1");
    const set = res.headers.get("set-cookie") ?? "";
    expect(set).toContain("ps_dev_plan=premium");
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/Secure/i);
    state.cookie = "premium";
    expect(await getPlan(PROD)).toBe("premium");
    expect(await canSwitchPlan(PROD)).toBe(true);
  });

  test("anyone else: the route refuses (403, cookie cleared) and their plan stays Free — even with the cookie copied over", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLAN_SWITCHER_EMAILS", PROD.PLAN_SWITCHER_EMAILS);
    state.email = "someone@else.com";
    const res = await switchTo("premium");
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie") ?? "").toMatch(/ps_dev_plan=;/);
    state.cookie = "premium";
    expect(await getPlan(PROD)).toBe("free");
    expect(await canSwitchPlan(PROD)).toBe(false);
    // Signed out: the same.
    state.email = null;
    expect(await getPlan(PROD)).toBe("free");
    expect((await switchTo("grow")).status).toBe(403);
  });

  test("unset (or empty): fully off — 404, no pill, Free, and no session lookups", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLAN_SWITCHER_EMAILS", "");
    state.email = ME;
    state.cookie = "premium";
    expect((await switchTo("premium")).status).toBe(404);
    expect(await getPlan({ NODE_ENV: "production" })).toBe("free");
    expect(await canSwitchPlan({ NODE_ENV: "production" })).toBe(false);
    expect(state.getUserCalls).toBe(0);
  });

  test("everyone without the switch cookie is answered at once (Free) — no extra lookup per request", async () => {
    state.email = ME;
    expect(await getPlan(PROD)).toBe("free");
    expect(state.getUserCalls).toBe(0);
  });
});

describe("local development keeps working as before", () => {
  test("the cookie, then POSTSCORE_DEV_PLAN; the route needs no list", async () => {
    expect(resolvePlan({ NODE_ENV: "development" }, "grow")).toBe("grow");
    expect(resolvePlan({ NODE_ENV: "development", POSTSCORE_DEV_PLAN: "multi" }, null)).toBe("multi");
    state.cookie = "grow";
    expect(await getPlan({ NODE_ENV: "development" })).toBe("grow");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PLAN_SWITCHER_EMAILS", "");
    const res = await switchTo("multi");
    expect(res.status).toBe(307);
    expect(res.headers.get("set-cookie") ?? "").toContain("ps_dev_plan=multi");
  });
});
