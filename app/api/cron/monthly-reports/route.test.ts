import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

// route.ts transitively imports lib/supabase/admin.ts and lib/email.ts,
// both of which have a top-level `import "server-only"` guard that
// hard-throws outside Next's own server build/runtime — even for a
// plain vitest import, and even though neither is ever actually CALLED
// on the gate-rejection path this file tests (isMonthlyReportsLive() is
// checked before either is touched). Stubbed here, same workaround
// pattern used elsewhere in this codebase for the same trap (e.g.
// vi.mock("@/app/actions/businesses") in
// components/assistant/BusinessMemoryPanel.test.tsx) — vitest hoists
// these above the static import below, so it still resolves against
// the mocks despite appearing first in source.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
// app/actions/scoring.ts (imported by route.ts for rescanBusinessWithClient)
// itself imports saveBusinessWithClient from app/actions/businesses.ts,
// which transitively hits the exact same server-only trap via
// lib/websiteScreenshotUpload.ts — same reasoning as the two mocks above.
vi.mock("@/app/actions/businesses", () => ({ saveBusinessWithClient: vi.fn() }));

import { POST, computeTopActionPlanTask } from "./route";
import { scoreBusiness, type BusinessScoringInput } from "@/lib/scoring";
import type { TaskRow } from "@/lib/actionPlan";

// Guards against the exact real regression this route's own comments
// describe: reports going out on a real schedule even while
// MONTHLY_REPORTS_LIVE was unset, because nothing in this file checked
// isMonthlyReportsLive() before doing real work. This test calls the
// real exported POST handler (the same function Netlify's scheduler
// actually invokes), not a reimplementation — so it fails the moment
// that check is ever removed or reordered after any real side effect.
//
// Safe to run with no Supabase/email mocking at all: isMonthlyReportsLive()
// is checked BEFORE any database client is created or any email is sent,
// so if this test ever started reaching real I/O, it would fail loudly
// (a thrown error from a missing/invalid Supabase URL) rather than
// silently passing — itself a second layer of protection for this same
// invariant.
describe("POST /api/cron/monthly-reports — the real isMonthlyReportsLive() gate", () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalLiveFlag = process.env.MONTHLY_REPORTS_LIVE;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret-for-unit-tests";
  });

  afterEach(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
    if (originalLiveFlag === undefined) delete process.env.MONTHLY_REPORTS_LIVE;
    else process.env.MONTHLY_REPORTS_LIVE = originalLiveFlag;
  });

  function authorizedRequest(): NextRequest {
    return new NextRequest("https://example.com/api/cron/monthly-reports", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
  }

  test("sends nothing and touches no business when MONTHLY_REPORTS_LIVE is unset", async () => {
    delete process.env.MONTHLY_REPORTS_LIVE;

    const res = await POST(authorizedRequest());
    const body = await res.json();

    expect(body).toEqual({
      pageSize: 0,
      hasMore: false,
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      results: [],
    });
  });

  test("sends nothing when MONTHLY_REPORTS_LIVE is any value other than the exact string \"true\"", async () => {
    process.env.MONTHLY_REPORTS_LIVE = "TRUE";
    const res = await POST(authorizedRequest());
    expect((await res.json()).processed).toBe(0);
  });

  test("the live-gate check runs even for an authorized (correct CRON_SECRET) caller — auth alone is never enough to send", async () => {
    delete process.env.MONTHLY_REPORTS_LIVE;
    const res = await POST(authorizedRequest());
    expect(res.status).toBe(200);
    expect((await res.json()).sent).toBe(0);
  });
});

describe("computeTopActionPlanTask — Day 4 Part 2a: a stale saved task for a check that's no longer scored never appears", () => {
  // A genuinely strong business: a website on file, but no analysis at
  // all — the same real shape as the exact case that regressed
  // (Lamonsoff): website.performance_mobile (and every other
  // website-analysis check) is structurally NOT_FOUND today, so
  // generateSuggestions() never includes it as a real suggestion,
  // regardless of what's sitting in the `tasks` table from whenever it
  // WAS last measured and losing points.
  const input: BusinessScoringInput = {
    rating: 4.9,
    reviewCount: 200,
    mostRecentReviewDaysAgo: 1,
    phone: "+1-555-000-0000",
    address: "123 Main St",
    openingHours: ["Mon-Fri 9-5"],
    website: "https://example.com",
    httpsStatus: "https",
    categories: ["restaurant"],
    primaryCategory: "Restaurant",
    photoCount: 12,
    businessStatus: "OPERATIONAL",
    websiteAnalysis: null,
  };

  test("a stale 'pending_verification' row for a now-NOT_FOUND check never surfaces as the top task", () => {
    const breakdown = scoreBusiness(input);
    // This row would have been written back when performance_mobile was
    // still measured and losing points — stale now that the real
    // website_analysis_json has since gone missing/unmeasured.
    const staleTaskRows: TaskRow[] = [
      {
        id: "stale-1",
        check_id: "website.performance_mobile",
        status: "pending_verification",
        promised_points: 10,
        marked_done_at: "2026-01-01T00:00:00.000Z",
        verified_at: null,
        marked_metric_value: null,
      },
    ];
    const top = computeTopActionPlanTask(breakdown, staleTaskRows, input, "en");
    expect(top).toBeNull();
  });

  test("control: the same stale row DOES surface when the check is genuinely still losing points in the live breakdown", () => {
    const roughInput: BusinessScoringInput = { ...input, websiteAnalysis: null, website: null };
    const taskRows: TaskRow[] = [
      {
        id: "t1",
        check_id: "visibility.rating",
        status: "pending_verification",
        promised_points: 5,
        marked_done_at: "2026-01-01T00:00:00.000Z",
        verified_at: null,
        marked_metric_value: null,
      },
    ];
    const lowRatingInput: BusinessScoringInput = { ...roughInput, rating: 3.0 };
    const lowRatingBreakdown = scoreBusiness(lowRatingInput);
    const top = computeTopActionPlanTask(lowRatingBreakdown, taskRows, lowRatingInput, "en");
    expect(top).not.toBeNull();
  });
});
