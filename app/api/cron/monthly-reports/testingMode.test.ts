import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

// Testing mode (MONTHLY_REPORTS_LIVE not "true") and live mode through the
// REAL scheduled entry point (POST — what Netlify's batch calls), against
// an in-memory database. server-only modules are stubbed as in route.test.ts.
const sendEmail = vi.fn<(a: { to: string; subject: string }) => Promise<{ status: "sent" }>>(async () => ({ status: "sent" }));
const rescan = vi.fn();
const db = { current: null as unknown };
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.current }));
vi.mock("@/lib/email", () => ({ sendEmail: (a: { to: string; subject: string }) => sendEmail(a) }));
vi.mock("@/app/actions/businesses", () => ({ saveBusinessWithClient: vi.fn() }));
vi.mock("@/app/actions/scoring", async () => {
  const actual = await vi.importActual<typeof import("@/app/actions/scoring")>("@/app/actions/scoring");
  return { ...actual, rescanBusinessWithClient: (...a: unknown[]) => rescan(...a) };
});

import { POST } from "./route";
import { decideReportRecipient, pickTestBusinesses, reportSendPrecheck } from "@/lib/reportSendPolicy";

type Row = Record<string, unknown>;

/** A tiny chainable Supabase stand-in: eq/in filter, limit/range cut,
 * everything else passes through. Inserts are recorded. */
function fakeDb(tables: Record<string, Row[]>, users: Array<{ id: string; email: string }>) {
  const inserts: Array<{ table: string; row: Row }> = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let max = Infinity;
    const b: Record<string, unknown> = {};
    const pass = () => b;
    for (const m of ["select", "order", "gte", "lte", "lt", "gt", "neq", "not", "is", "or", "filter", "match", "ilike"]) b[m] = pass;
    b.eq = (col: string, v: unknown) => ((rows = rows.filter((r) => !(col in r) || r[col] === v)), b);
    b.in = (col: string, vs: unknown[]) => ((rows = rows.filter((r) => !(col in r) || vs.includes(r[col]))), b);
    b.limit = (n: number) => ((max = n), b);
    b.range = (a: number, z: number) => ((rows = rows.slice(a, z + 1)), b);
    const result = () => ({ data: rows.slice(0, max), error: null });
    b.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    b.single = async () => (rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "no rows" } });
    b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad);
    b.insert = (row: Row) => {
      inserts.push({ table, row });
      const r = { data: { id: "new-row", ...row }, error: null };
      return { select: () => ({ single: async () => r }), then: (ok: (v: unknown) => unknown) => Promise.resolve(r).then(ok) };
    };
    b.delete = () => ({ eq: async () => ({ error: null }) });
    b.update = () => b;
    return b;
  };
  return {
    inserts,
    client: {
      from,
      auth: {
        admin: {
          listUsers: async () => ({ data: { users }, error: null }),
          getUserById: async (id: string) => ({ data: { user: users.find((u) => u.id === id) ?? null }, error: null }),
        },
      },
    },
  };
}

const NOW = new Date().toISOString();
const business = (i: number, extra: Row = {}): Row => ({
  id: `biz-${i}`,
  name: `Biz ${i}`,
  owner_id: `owner-${i}`,
  monthly_report_enabled: true,
  listing_mode: "google",
  unsubscribe_token: "tok",
  language: "en",
  rating: 4.5,
  review_count: 20,
  ...extra,
});
const score = (i: number): Row => ({ id: `score-${i}`, business_id: `biz-${i}`, total: 70, grade: "B", created_at: NOW, breakdown_json: null, profile_snapshot_json: null, scoring_version: null });

function world(n: number) {
  const businesses = Array.from({ length: n }, (_, i) => business(i));
  const users = businesses.map((b) => ({ id: b.owner_id as string, email: `owner${(b.id as string).slice(4)}@example.com` }));
  return fakeDb({ businesses, scores: businesses.map((_, i) => score(i)) }, users);
}

function cronRequest(offset = 0) {
  return new NextRequest(`https://example.com/api/cron/monthly-reports?limit=3&offset=${offset}`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "secret");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  sendEmail.mockClear();
  rescan.mockReset();
});

describe("testing mode — the real scheduled path", () => {
  test("sends exactly 3 reports, all to REPORT_TEST_EMAIL, none to any owner, with [TEST] subjects — no re-scans for recent scores", async () => {
    vi.stubEnv("MONTHLY_REPORTS_LIVE", "false");
    vi.stubEnv("REPORT_TEST_EMAIL", "tests@postscore.test");
    const w = world(8);
    db.current = w.client;
    const body = await (await POST(cronRequest())).json();

    expect(sendEmail).toHaveBeenCalledTimes(3);
    const ownerEmails = new Set(Array.from({ length: 8 }, (_, i) => `owner${i}@example.com`));
    for (const [arg] of sendEmail.mock.calls) {
      expect(arg.to).toBe("tests@postscore.test");
      expect(ownerEmails.has(arg.to)).toBe(false);
      expect(arg.subject.startsWith("[TEST] Biz ")).toBe(true);
    }
    expect(new Set(body.results.map((r: { businessId: string }) => r.businessId)).size).toBe(3);
    expect(body).toMatchObject({ sent: 3, hasMore: false });
    // Scores are fresh → no paid re-scan; no owner report row recorded.
    expect(rescan).not.toHaveBeenCalled();
    expect(w.inserts.filter((x) => x.table === "monthly_reports")).toEqual([]);
    expect(w.inserts.filter((x) => x.table === "monthly_report_test_runs")).toHaveLength(1);
  });

  test("the test email carries the 'not sent to the owner' line at the top", async () => {
    const { render } = await import("@react-email/components");
    const { createElement } = await import("react");
    const { MonthlyReportEmail } = await import("@/emails/MonthlyReportEmail");
    const { SAMPLE_BASELINE } = await import("@/emails/sampleMonthlyReportContent");
    const html = await render(createElement(MonthlyReportEmail, { ...SAMPLE_BASELINE, testPreview: true }));
    const plain = await render(createElement(MonthlyReportEmail, SAMPLE_BASELINE));
    expect(html).toContain("Test preview — this was not sent to the owner.");
    expect(plain).not.toContain("Test preview");
  });

  test("later chunks (offset > 0) do nothing — no second batch of test emails", async () => {
    vi.stubEnv("MONTHLY_REPORTS_LIVE", "");
    vi.stubEnv("REPORT_TEST_EMAIL", "tests@postscore.test");
    db.current = world(8).client;
    const body = await (await POST(cronRequest(3))).json();
    expect(body).toMatchObject({ processed: 0, hasMore: false });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("missing REPORT_TEST_EMAIL → nothing is sent, and it's logged", async () => {
    vi.stubEnv("MONTHLY_REPORTS_LIVE", "false");
    vi.stubEnv("REPORT_TEST_EMAIL", "");
    db.current = world(8).client;
    const body = await (await POST(cronRequest())).json();
    expect(body.processed).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("REPORT_TEST_EMAIL isn't set"));
  });

  test("REPORT_TEST_EMAIL may have a PostScore account: it gets ONLY the 3 [TEST] reports — never a normal report for its own business; other owners get nothing", async () => {
    vi.stubEnv("MONTHLY_REPORTS_LIVE", "false");
    vi.stubEnv("REPORT_TEST_EMAIL", "owner2@example.com"); // owns biz-2
    db.current = world(3).client; // only 3 businesses → biz-2 is always picked
    const body = await (await POST(cronRequest())).json();
    expect(sendEmail).toHaveBeenCalledTimes(3);
    const subjects = sendEmail.mock.calls.map(([a]) => a.subject);
    for (const [arg] of sendEmail.mock.calls) {
      expect(arg.to).toBe("owner2@example.com");
      expect(arg.subject.startsWith("[TEST] ")).toBe(true);
    }
    // Its own business went out as a [TEST] report too, not a normal one.
    expect(subjects.some((x) => x.startsWith("[TEST] Biz 2"))).toBe(true);
    expect(subjects.filter((x) => !x.startsWith("[TEST]"))).toEqual([]);
    expect(body.results.map((r: { businessId: string }) => r.businessId).sort()).toEqual(["biz-0", "biz-1", "biz-2"]);
  });

  test("this month's picks already sent → a retry sends nothing", async () => {
    vi.stubEnv("MONTHLY_REPORTS_LIVE", "false");
    vi.stubEnv("REPORT_TEST_EMAIL", "tests@postscore.test");
    const month = new Date().toISOString().slice(0, 7);
    const tables = { businesses: Array.from({ length: 8 }, (_, i) => business(i)), scores: Array.from({ length: 8 }, (_, i) => score(i)), monthly_report_test_runs: [{ run_month: month, business_ids: ["biz-1", "biz-2", "biz-3"] }] };
    db.current = fakeDb(tables, [{ id: "owner-0", email: "owner0@example.com" }]).client;
    await POST(cronRequest());
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("live mode — the real scheduled path", () => {
  test("Free businesses are skipped before any re-scan, and no test email is sent", async () => {
    vi.stubEnv("MONTHLY_REPORTS_LIVE", "true");
    vi.stubEnv("REPORT_TEST_EMAIL", "tests@postscore.test");
    vi.stubEnv("NODE_ENV", "production"); // backgroundPlan → Free for everyone (no subscriptions yet)
    db.current = world(4).client;
    const body = await (await POST(cronRequest())).json();
    expect(body.processed).toBe(3);
    expect(body.results.every((r: { status: string; reason?: string }) => r.status === "skipped" && r.reason?.includes("Free plan"))).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(rescan).not.toHaveBeenCalled();
  });
});

describe("the policy behind both modes", () => {
  const TESTING = { NODE_ENV: "production", REPORT_TEST_EMAIL: "tests@postscore.test" };
  const LIVE = { NODE_ENV: "production", MONTHLY_REPORTS_LIVE: "true", REPORT_TEST_EMAIL: "tests@postscore.test" };

  test("testing mode: the owner path sends nothing; the test path goes only to REPORT_TEST_EMAIL, even for an opted-out owner", () => {
    expect(decideReportRecipient({ path: "scheduled", env: TESTING, ownerOptedIn: true, ownerEmail: "o@x.com" })).toMatchObject({ allowed: false });
    expect(decideReportRecipient({ path: "scheduled-test", env: TESTING, ownerOptedIn: false, ownerEmail: "o@x.com" })).toEqual({ allowed: true, mode: "test", to: "tests@postscore.test" });
  });

  test("testing mode: when REPORT_TEST_EMAIL is the owner's own address it's still a test send (a [TEST] report), never a normal owner report", () => {
    expect(decideReportRecipient({ path: "scheduled-test", env: TESTING, ownerOptedIn: true, ownerEmail: "tests@postscore.test" })).toEqual({ allowed: true, mode: "test", to: "tests@postscore.test" });
    // The owner path is refused for that same owner.
    expect(decideReportRecipient({ path: "scheduled", env: TESTING, ownerOptedIn: true, ownerEmail: "tests@postscore.test" })).toMatchObject({ allowed: false });
  });

  test("testing mode without REPORT_TEST_EMAIL sends nothing", () => {
    expect(reportSendPrecheck("scheduled-test", { NODE_ENV: "production" })).toMatchObject({ allowed: false });
  });

  test("live mode: no test emails; the owner path goes to the owner", () => {
    expect(reportSendPrecheck("scheduled-test", LIVE)).toMatchObject({ allowed: false });
    expect(decideReportRecipient({ path: "scheduled", env: LIVE, ownerOptedIn: true, ownerEmail: "o@x.com" })).toEqual({ allowed: true, mode: "live", to: "o@x.com" });
  });

  test("send-one stays refused in production unless ALLOW_SEND_ONE=true, in both modes", () => {
    expect(reportSendPrecheck("send-one", TESTING)).toMatchObject({ allowed: false });
    expect(reportSendPrecheck("send-one", LIVE)).toMatchObject({ allowed: false });
    expect(reportSendPrecheck("send-one", { ...TESTING, ALLOW_SEND_ONE: "true" })).toEqual({ allowed: true });
  });

  test("the pick: 3 distinct businesses, avoiding last month's when possible", () => {
    const all = ["a", "b", "c", "d", "e"];
    for (let seed = 0; seed < 20; seed++) {
      let x = seed + 1;
      const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
      const p = pickTestBusinesses(all, ["a", "b"], 3, rnd);
      expect(new Set(p).size).toBe(3);
      expect(p.sort()).toEqual(["c", "d", "e"]);
    }
    // Not enough others → fills from last month's picks.
    expect(pickTestBusinesses(["a", "b", "c"], ["a", "b"], 3).sort()).toEqual(["a", "b", "c"]);
    expect(pickTestBusinesses(["a"], [], 3)).toEqual(["a"]);
  });
});
