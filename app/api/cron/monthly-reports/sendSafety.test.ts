import { afterEach, describe, expect, test, vi } from "vitest";

const sendEmail = vi.fn();
const rescan = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock("@/app/actions/businesses", () => ({ saveBusinessWithClient: vi.fn() }));
vi.mock("@/app/actions/scoring", async () => {
  const actual = await vi.importActual<typeof import("@/app/actions/scoring")>("@/app/actions/scoring");
  return { ...actual, rescanBusinessWithClient: (...a: unknown[]) => rescan(...a) };
});

import { decideReportRecipient, reportSendPrecheck } from "@/lib/reportSendPolicy";
import { processBusiness } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  sendEmail.mockReset();
  rescan.mockReset();
});

const LIVE = { NODE_ENV: "production", MONTHLY_REPORTS_LIVE: "true" };
const OFF = { NODE_ENV: "development" };

describe("send safety — the one decision every sending path uses", () => {
  test("send-one is refused in production unless ALLOW_SEND_ONE=true", () => {
    expect(reportSendPrecheck("send-one", { ...LIVE })).toMatchObject({ allowed: false });
    expect(reportSendPrecheck("send-one", { ...LIVE, ALLOW_SEND_ONE: "true" })).toEqual({ allowed: true });
    expect(reportSendPrecheck("send-one", { NODE_ENV: "development", MONTHLY_REPORTS_LIVE: "true" })).toEqual({ allowed: true });
  });

  test("the owner's opt-out always wins — live or not, any path", () => {
    for (const path of ["scheduled", "send-one"] as const) {
      expect(decideReportRecipient({ path, env: { ...LIVE, ALLOW_SEND_ONE: "true" }, ownerOptedIn: false, ownerEmail: "owner@x.com" })).toMatchObject({ allowed: false });
    }
  });

  test("MONTHLY_REPORTS_LIVE on → the owner's real address", () => {
    expect(decideReportRecipient({ path: "scheduled", env: LIVE, ownerOptedIn: true, ownerEmail: "owner@x.com" })).toEqual({ allowed: true, mode: "live", to: "owner@x.com" });
  });

  test("MONTHLY_REPORTS_LIVE off → send-one goes ONLY to REPORT_TEST_EMAIL, never the owner", () => {
    const d = decideReportRecipient({ path: "send-one", env: { ...OFF, REPORT_TEST_EMAIL: "tests@postscore.co" }, ownerOptedIn: true, ownerEmail: "owner@x.com" });
    expect(d).toEqual({ allowed: true, mode: "test", to: "tests@postscore.co" });
  });

  test("MONTHLY_REPORTS_LIVE off and no (valid) REPORT_TEST_EMAIL → nothing is sent", () => {
    expect(decideReportRecipient({ path: "send-one", env: OFF, ownerOptedIn: true, ownerEmail: "owner@x.com" })).toMatchObject({ allowed: false });
    expect(decideReportRecipient({ path: "send-one", env: { ...OFF, REPORT_TEST_EMAIL: "not-an-email" }, ownerOptedIn: true, ownerEmail: "owner@x.com" })).toMatchObject({ allowed: false });
  });

  test("MONTHLY_REPORTS_LIVE off → the scheduled run sends nothing at all (not even to the test address)", () => {
    expect(decideReportRecipient({ path: "scheduled", env: { ...OFF, REPORT_TEST_EMAIL: "tests@postscore.co" }, ownerOptedIn: true, ownerEmail: "owner@x.com" })).toMatchObject({ allowed: false });
  });
});

describe("processBusiness applies the rules before any paid work or email", () => {
  const noDb = { from: () => { throw new Error("must not touch the database"); } } as never;

  test("send-one in production without ALLOW_SEND_ONE: skipped before any DB read, re-scan or email", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MONTHLY_REPORTS_LIVE", "true");
    vi.stubEnv("ALLOW_SEND_ONE", "");
    const r = await processBusiness(noDb, "biz", "2026-10-01T00:00:00Z", new Date(), "send-one");
    expect(r).toMatchObject({ status: "skipped" });
    expect(r.reason).toContain("ALLOW_SEND_ONE");
    expect(rescan).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("scheduled with MONTHLY_REPORTS_LIVE off: skipped before any DB read, re-scan or email", async () => {
    vi.stubEnv("MONTHLY_REPORTS_LIVE", "");
    const r = await processBusiness(noDb, "biz", "2026-10-01T00:00:00Z", new Date(), "scheduled");
    expect(r).toMatchObject({ status: "skipped" });
    expect(rescan).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("an owner who opted out: skipped before the re-scan, never emailed", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MONTHLY_REPORTS_LIVE", "true");
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: { monthly_report_enabled: false }, error: null });
    const db = { from: () => chain } as never;
    const r = await processBusiness(db, "biz", "2026-10-01T00:00:00Z", new Date(), "send-one");
    expect(r).toMatchObject({ status: "skipped" });
    expect(r.reason).toContain("turned off");
    expect(rescan).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
