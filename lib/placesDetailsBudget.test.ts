import { beforeEach, describe, expect, test, vi } from "vitest";
import fs from "node:fs";

// Scoring v1.12.0 Stage 1: every Place Details call is logged with its own
// kind, PLACES_DETAILS_MONTHLY_CAP (default 800) works like the search cap,
// and the production Details mask gains accessibilityOptions +
// pureServiceAreaBusiness — never Nearby Search.

vi.mock("server-only", () => ({}));
const lookup = vi.fn();
vi.mock("@/lib/google/places", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google/places")>("@/lib/google/places");
  return { ...actual, lookupBusinessByPlaceId: (...a: unknown[]) => lookup(...a) };
});
let allowed = true;
const logCall = vi.fn();
const logSkip = vi.fn();
vi.mock("@/lib/placesDetailsBudget.server", () => ({
  detailsCallAllowed: async () => allowed,
  logPlacesDetailsCall: (...a: unknown[]) => logCall(...a),
  logPlacesDetailsSkip: (...a: unknown[]) => logSkip(...a),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { BILLED_DETAILS_KINDS, canMakeDetailsCall, DEFAULT_PLACES_DETAILS_MONTHLY_CAP, PLACES_DETAILS_KINDS, placesDetailsMonthlyCap, skippedKind } from "./placesDetailsBudget";

/** The one row a re-scan reads first — the business, with its place id. */
function businessDb() {
  const row = { owner_id: "u1", place_id: "ChIJ-place", phone: null, website: null, opening_hours: null, categories: null, photo_count: null, rating: null, review_count: null, business_status: null, language: "en", google_listing_missing_website_since: null, google_listing_website_removed_since: null, google_listing_last_known_website_at: null };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({ data: row, error: null }),
    order: () => chain,
    limit: async () => ({ data: [], error: { message: "not in this fake" } }),
    maybeSingle: async () => ({ data: null, error: { message: "not in this fake" } }),
  };
  return { from: () => chain } as never;
}

beforeEach(() => {
  allowed = true;
  lookup.mockReset();
  logCall.mockReset();
  logSkip.mockReset();
});

describe("the cap — like PLACES_SEARCH_MONTHLY_CAP", () => {
  test("default 800, env override, a bad value falls back", () => {
    expect(DEFAULT_PLACES_DETAILS_MONTHLY_CAP).toBe(800);
    expect(placesDetailsMonthlyCap({})).toBe(800);
    expect(placesDetailsMonthlyCap({ PLACES_DETAILS_MONTHLY_CAP: "250" })).toBe(250);
    expect(placesDetailsMonthlyCap({ PLACES_DETAILS_MONTHLY_CAP: "lots" })).toBe(800);
  });

  test("a re-scan may run until the month's billed calls reach the cap; adding a business and the free photo call never stop", () => {
    expect(canMakeDetailsCall("owner_rescan", 799, 800)).toBe(true);
    expect(canMakeDetailsCall("owner_rescan", 800, 800)).toBe(false);
    for (const kind of ["monthly", "rescan_all", "website_retry", "website_only", "dry_run"] as const) expect(canMakeDetailsCall(kind, 800, 800), kind).toBe(false);
    expect(canMakeDetailsCall("onboarding", 5000, 800)).toBe(true);
    expect(canMakeDetailsCall("photos", 5000, 800)).toBe(true);
    // Photos-only Details is Google's free IDs Only SKU: logged, never counted.
    expect(BILLED_DETAILS_KINDS).not.toContain("photos");
    expect(BILLED_DETAILS_KINDS).toContain("onboarding");
    expect(skippedKind("monthly")).toBe("monthly_skipped");
  });

  test("the month's count reads only billed Details kinds (never the competitor searches)", () => {
    const src = fs.readFileSync("lib/placesDetailsBudget.server.ts", "utf8");
    expect(src).toContain('.in("kind", BILLED_DETAILS_KINDS as string[])');
    expect(PLACES_DETAILS_KINDS).not.toContain("competitor_scan" as never);
    // …and the search cap still counts only competitor searches.
    expect(fs.readFileSync("lib/placesSearchBudget.server.ts", "utf8")).toContain('.eq("kind", "competitor_scan")');
  });
});

describe("every Place Details call is logged with its own kind", () => {
  test("a re-scan logs its call as the caller's kind", async () => {
    lookup.mockResolvedValue({ status: "no_results" });
    const { rescanBusinessWithClient } = await import("@/app/actions/scoring");
    for (const kind of ["owner_rescan", "monthly", "rescan_all"] as const) {
      logCall.mockReset();
      expect(await rescanBusinessWithClient(businessDb(), "b1", false, { detailsKind: kind })).toEqual({ status: "no_results" });
      expect(logCall).toHaveBeenCalledWith("b1", kind);
    }
  });

  test("a failed call (no answer from Google) isn't billed, so isn't logged", async () => {
    lookup.mockResolvedValue({ status: "error", message: "timeout" });
    const { rescanBusinessWithClient } = await import("@/app/actions/scoring");
    await rescanBusinessWithClient(businessDb(), "b1", false, { detailsKind: "monthly" });
    expect(logCall).not.toHaveBeenCalled();
  });

  test("over the cap: no Google call, the skip is logged, the saved listing is kept (re-scored as it is)", async () => {
    allowed = false;
    const { rescanBusinessWithClient } = await import("@/app/actions/scoring");
    // (This fake database can't save the re-score — only the Google side is checked here.)
    await rescanBusinessWithClient(businessDb(), "b1", false, { detailsKind: "monthly" }).catch(() => undefined);
    expect(lookup).not.toHaveBeenCalled();
    expect(logSkip).toHaveBeenCalledWith("b1", "monthly");
    const src = fs.readFileSync("app/actions/scoring.ts", "utf8");
    const skip = src.slice(src.indexOf("if (!(await details.detailsCallAllowed(detailsKind))) {"), src.indexOf("const lookup = await lookupBusinessByPlaceId"));
    expect(skip).toContain("saveScoreSnapshotWithClient(supabase, businessId)");
    expect(skip).toContain("listingRefreshSkipped: true");
  });

  test("each caller passes its kind; the website retry, sign-up and the photo are logged too", () => {
    const scoring = fs.readFileSync("app/actions/scoring.ts", "utf8");
    expect(scoring).toContain('rescanBusinessWithClient(supabase, businessId, false, { detailsKind: "owner_rescan" })');
    expect(scoring).toContain('await details.logPlacesDetailsCall(businessId, "website_retry")');
    expect(fs.readFileSync("app/api/cron/monthly-reports/route.ts", "utf8")).toContain('rescanBusinessWithClient(supabase, businessId, false, { detailsKind: "monthly" })');
    expect(fs.readFileSync("scripts/rescan-all.ts", "utf8")).toContain('rescanBusinessWithClient(supabase, b.id, noScreenshots, { detailsKind: "rescan_all" })');
    const lookupRoute = fs.readFileSync("app/api/places/lookup/route.ts", "utf8");
    expect(lookupRoute).toContain('logPlacesDetailsCall(null, "onboarding")');
    expect(lookupRoute).toContain('logPlacesDetailsCall(null, "onboarding", result.paidCalls?.details ?? 0)');
    expect(fs.readFileSync("app/api/business/[id]/listing-photo/route.ts", "utf8")).toContain('logPlacesDetailsCall(business.id, "photos")');
    // Free's re-scan limit still reads "owner_rescan" rows.
    expect(fs.readFileSync("lib/placesSearchBudget.server.ts", "utf8")).toContain('.eq("kind", "owner_rescan")');
  });
});

describe("the field mask", () => {
  test("Place Details asks for accessibilityOptions + pureServiceAreaBusiness; Nearby Search (competitors) doesn't", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    const masks: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      masks.push(String((init.headers as Record<string, string>)["X-Goog-FieldMask"]));
      return new Response(JSON.stringify({ id: "p", places: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const places = await vi.importActual<typeof import("@/lib/google/places")>("@/lib/google/places");
    await places.lookupBusinessByPlaceId("p", fetchImpl);
    await places.searchNearbyPlaces({ lat: 1, lng: 1, radiusMeters: 100 }, fetchImpl);
    const [details, nearby] = masks;
    expect(details.split(",")).toEqual(expect.arrayContaining(["accessibilityOptions", "pureServiceAreaBusiness", "rating", "photos"]));
    expect(nearby).not.toContain("accessibilityOptions");
    expect(nearby).not.toContain("pureServiceAreaBusiness");
    // Nothing from the dry run's one-off fields reaches production.
    for (const field of ["reviews", "paymentOptions", "parkingOptions"]) expect(details.split(",")).not.toContain(field);
  });

  test("they're read into the listing data (true/false flags only)", async () => {
    const { normalizeDetails } = await vi.importActual<typeof import("@/lib/google/places")>("@/lib/google/places");
    const place = normalizeDetails({ id: "p", accessibilityOptions: { wheelchairAccessibleEntrance: true, wheelchairAccessibleParking: false }, pureServiceAreaBusiness: false });
    expect(place.accessibilityOptions).toEqual({ wheelchairAccessibleEntrance: true, wheelchairAccessibleParking: false });
    expect(place.pureServiceAreaBusiness).toBe(false);
    const none = normalizeDetails({ id: "p" });
    expect(none.accessibilityOptions).toBeNull();
    expect(none.pureServiceAreaBusiness).toBeNull();
  });
});

describe("the v1.12.0 dry run (scripts/scoringDryRun.ts)", () => {
  test("the planned weights: Visibility 14+14+6+6, Listing 4+4+4+4+3+4+4+3", async () => {
    const { scoreBusiness } = await import("@/lib/scoring");
    const { v112Breakdown } = await import("../scripts/scoringDryRun");
    const { scoringInput } = await import("@/emails/sampleMonthlyReportContent");
    const after = v112Breakdown(scoreBusiness(scoringInput()), { reviewCount: 120, sample: null, gbp: null, now: Date.parse("2026-10-27T00:00:00Z") });
    const max = (cat: string) => after.checks.filter((c) => c.category === cat).reduce((s, c) => s + c.maxPoints, 0);
    expect(max("visibility")).toBe(40);
    expect(max("completeness")).toBe(30);
  });

  test("recency, replies and customer details follow the plan's rules", async () => {
    const { recencyCheck, repliesCheck, customerDetailsCheck } = await import("../scripts/scoringDryRun");
    const now = Date.parse("2026-10-27T00:00:00Z");
    const sample = (times: string[], extra = {}) => ({ reviewTimes: times, hasAccessibility: true, hasPayment: true, hasParking: false, pureServiceArea: false, ...extra });
    expect(recencyCheck({ reviewCount: 30, sample: sample(["2026-09-14T00:00:00Z"]), gbp: null, now }).earnedPoints).toBe(6);
    expect(recencyCheck({ reviewCount: 30, sample: sample(["2026-05-01T00:00:00Z"]), gbp: null, now }).earnedPoints).toBeNull();
    expect(recencyCheck({ reviewCount: 0, sample: null, gbp: null, now })).toMatchObject({ earnedPoints: 0, confidence: "VERIFIED" });
    expect(recencyCheck({ reviewCount: 30, sample: null, gbp: null, now }).earnedPoints).toBeNull();
    const gbp = { reviewsInWindow: 20, replied: 0, templatedShare: 0, hasRecentReview: true, allTimeReviews: 30, allTimeReplied: 1, allTimeCapped: false, checkedAt: "2026-10-27T00:00:00Z" };
    expect(recencyCheck({ reviewCount: 30, sample: null, gbp, now }).earnedPoints).toBe(6);
    expect(repliesCheck({ reviewCount: 30, sample: null, gbp, now }).earnedPoints).toBe(0);
    expect(repliesCheck({ reviewCount: 30, sample: null, gbp: { ...gbp, replied: 8 }, now }).earnedPoints).toBe(3);
    expect(repliesCheck({ reviewCount: 30, sample: null, gbp: { ...gbp, replied: 18 }, now }).earnedPoints).toBe(6);
    expect(repliesCheck({ reviewCount: 30, sample: null, gbp: null, now }).earnedPoints).toBeNull();
    expect(customerDetailsCheck({ reviewCount: 30, sample: sample([]), gbp: null, now }).earnedPoints).toBe(2);
    expect(customerDetailsCheck({ reviewCount: 30, sample: sample([], { pureServiceArea: true }), gbp: null, now }).earnedPoints).toBeNull();
  });
});
