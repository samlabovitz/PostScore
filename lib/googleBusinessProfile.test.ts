import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { isGbpConnectPublic } from "./googleBusinessProfile";

// isGbpConnectPublic gates the weekly-plan "Connect your Google Business
// Profile" item (see app/actions/actionPlan.ts's getActionPlan) — it must
// default to hidden, and only show once GBP_CONNECT_PUBLIC is exactly the
// string "true", since Google blocks non-test accounts from an
// unverified OAuth consent screen.
describe("isGbpConnectPublic", () => {
  const original = process.env.GBP_CONNECT_PUBLIC;

  beforeEach(() => {
    delete process.env.GBP_CONNECT_PUBLIC;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.GBP_CONNECT_PUBLIC;
    else process.env.GBP_CONNECT_PUBLIC = original;
  });

  test("is false when GBP_CONNECT_PUBLIC is unset (the default, production-safe state)", () => {
    expect(isGbpConnectPublic()).toBe(false);
  });

  test('is false when GBP_CONNECT_PUBLIC is "false"', () => {
    process.env.GBP_CONNECT_PUBLIC = "false";
    expect(isGbpConnectPublic()).toBe(false);
  });

  test("is false for any value other than the exact string \"true\" (e.g. \"1\", \"True\")", () => {
    process.env.GBP_CONNECT_PUBLIC = "1";
    expect(isGbpConnectPublic()).toBe(false);
    process.env.GBP_CONNECT_PUBLIC = "True";
    expect(isGbpConnectPublic()).toBe(false);
  });

  test('is true only when GBP_CONNECT_PUBLIC is exactly "true"', () => {
    process.env.GBP_CONNECT_PUBLIC = "true";
    expect(isGbpConnectPublic()).toBe(true);
  });
});
