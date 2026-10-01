import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { isMonthlyReportsLive } from "./monthlyReportsFeatureFlag";

// isMonthlyReportsLive() is the real safety switch for the SCHEDULED
// monthly-report send (see app/api/cron/monthly-reports/route.ts's
// handleCronRun) — it must default to false (send nothing), and only
// allow a real send when MONTHLY_REPORTS_LIVE is exactly the string
// "true". Previously nothing in the scheduled path checked this flag at
// all, which is why real reports went out on schedule with it unset.
describe("isMonthlyReportsLive", () => {
  const original = process.env.MONTHLY_REPORTS_LIVE;

  beforeEach(() => {
    delete process.env.MONTHLY_REPORTS_LIVE;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.MONTHLY_REPORTS_LIVE;
    else process.env.MONTHLY_REPORTS_LIVE = original;
  });

  test("is false when MONTHLY_REPORTS_LIVE is unset (the default, send-nothing state)", () => {
    expect(isMonthlyReportsLive()).toBe(false);
  });

  test('is false when MONTHLY_REPORTS_LIVE is "false"', () => {
    process.env.MONTHLY_REPORTS_LIVE = "false";
    expect(isMonthlyReportsLive()).toBe(false);
  });

  test('is false for any value other than the exact string "true" (e.g. "1", "True")', () => {
    process.env.MONTHLY_REPORTS_LIVE = "1";
    expect(isMonthlyReportsLive()).toBe(false);
    process.env.MONTHLY_REPORTS_LIVE = "True";
    expect(isMonthlyReportsLive()).toBe(false);
  });

  test('is true only when MONTHLY_REPORTS_LIVE is exactly "true"', () => {
    process.env.MONTHLY_REPORTS_LIVE = "true";
    expect(isMonthlyReportsLive()).toBe(true);
  });
});
