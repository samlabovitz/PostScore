// Day 23 2d-4b: a competitor scan saves PostScore's own results only; each
// competitor's listing reaches its full scoring in memory, or from one
// counted, capped, logged live re-read.
import { describe, expect, test, vi } from "vitest";
import { scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { competitorListingInput, rankedFromCandidate, savedScanRow, type RankedCompetitor } from "./competitors";
import { listingInputFromPlace } from "./competitorFullScoring";
import { COMPETITOR_RAW_COLUMNS } from "./competitorRawCleanup";
import { canReread, competitorRereadMonthlyCap, DEFAULT_COMPETITOR_REREAD_MONTHLY_CAP } from "./competitorReread";
import { listingInputsFromBody } from "./competitorListingInputs";
import { candidateFromDetails, COMPETITOR_SCORING_FIELD_MASK, type PlaceDetails } from "./google/places";

const PLACE: PlaceDetails = {
  placeId: "rival",
  name: "Rival Salon",
  formattedAddress: "12 Elm St, Westfield, NJ",
  phone: "+1 908-555-0199",
  website: "https://rival.example/",
  openingHours: ["Monday: 9 AM – 6 PM"],
  openingHoursPeriods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } }],
  rating: 4.8,
  userRatingCount: 212,
  categories: ["hair_salon", "beauty_salon"],
  primaryCategory: "Hair salon",
  primaryType: "hair_salon",
  location: { lat: 40.65, lng: -74.35 },
  businessStatus: "OPERATIONAL",
  googleMapsUri: "https://maps.google.com/?cid=1",
  photoCount: 10,
  priceLevel: "PRICE_LEVEL_MODERATE",
  serviceOptions: { takeout: false },
} as PlaceDetails;

const ranked = (): RankedCompetitor => rankedFromCandidate(candidateFromDetails(PLACE), 900, "en");

/** Every Google value in PLACE, as text. */
const GOOGLE_TEXT = ["Rival Salon", "12 Elm St", "908-555-0199", "rival.example", "Monday: 9 AM", "hair_salon", "PRICE_LEVEL_MODERATE", "OPERATIONAL", "maps.google.com"];

describe("the saved competitor_scans row", () => {
  test("keeps only our own results: place ID, distance, score, grade, version and points", () => {
    const row = savedScanRow(ranked(), "scan", "biz");
    expect(Object.keys(row).sort()).toEqual(["breakdown_json", "business_id", "distance_meters", "grade", "is_subject", "place_id", "scan_id", "scoring_version", "total"]);
    for (const c of COMPETITOR_RAW_COLUMNS) expect(row).not.toHaveProperty(c);
    const text = JSON.stringify(row);
    for (const g of GOOGLE_TEXT) expect(text).not.toContain(g);
    expect(row.place_id).toBe("rival");
    expect(row.distance_meters).toBe(900);
  });

  test("the score, grade and every check's points are exactly the scan's", () => {
    const r = ranked();
    const row = savedScanRow(r, "scan", "biz");
    expect(row.total).toBe(r.breakdown.total);
    expect(row.grade).toBe(r.breakdown.grade);
    expect(row.breakdown_json.total).toBe(r.breakdown.total);
    expect(row.breakdown_json.checks.map((c) => [c.id, c.earnedPoints, c.maxPoints, c.confidence])).toEqual(r.breakdown.checks.map((c) => [c.id, c.earnedPoints, c.maxPoints, c.confidence]));
    expect(row.breakdown_json.categories.map((c) => [c.id, c.earnedPoints, c.possiblePoints])).toEqual(r.breakdown.categories.map((c) => [c.id, c.earnedPoints, c.possiblePoints]));
  });

  test("the owner's row the same (its saved score's points, nothing from Google)", () => {
    const owner = { ...ranked(), isSubject: true, placeId: "own", distanceMeters: null, breakdown: scoreBusiness(scoringInput()) };
    const row = savedScanRow(owner, "scan", "biz");
    for (const g of GOOGLE_TEXT) expect(JSON.stringify(row)).not.toContain(g);
  });
});

describe("the listing handed to full scoring (in memory)", () => {
  test("the same fields, mapped the same way, as the saved columns full scoring used to read", () => {
    const r = ranked();
    // What savedScanRow wrote before 2d-4b, field for field.
    const before = {
      address: r.address,
      rating: r.rating,
      review_count: r.reviewCount,
      photo_count: r.photoCount,
      has_website: r.hasWebsite,
      website_url: r.websiteUrl ?? null,
      phone: r.listing?.phone ?? null,
      opening_hours: r.listing ? { weekday: r.listing.openingHours, periods: r.listing.openingHoursPeriods } : null,
      categories: r.listing?.categories ?? null,
      business_status: r.listing?.businessStatus ?? null,
    };
    expect(competitorListingInput(r)).toEqual(before);
  });

  test("a live re-read maps a Details answer exactly as the scan maps its search answer", () => {
    expect(listingInputFromPlace(PLACE)).toEqual(competitorListingInput(ranked()));
  });

  test("the re-read asks only for what scoring reads — Enterprise, no Atmosphere field", () => {
    expect(COMPETITOR_SCORING_FIELD_MASK.split(",").sort()).toEqual(
      ["businessStatus", "formattedAddress", "id", "internationalPhoneNumber", "nationalPhoneNumber", "photos", "rating", "regularOpeningHours.periods", "regularOpeningHours.weekdayDescriptions", "types", "userRatingCount", "websiteUri"].sort()
    );
    for (const atmosphere of ["reviews", "paymentOptions", "parkingOptions", "takeout", "delivery", "dineIn"]) expect(COMPETITOR_SCORING_FIELD_MASK).not.toContain(atmosphere);
  });

  test("the step route keeps only well-formed listings (anything else is read live instead)", () => {
    const good = competitorListingInput(ranked());
    const parsed = listingInputsFromBody(JSON.parse(JSON.stringify({ rival: good, bad: { rating: "five" }, worse: null })));
    expect(Object.keys(parsed ?? {})).toEqual(["rival"]);
    expect(parsed!.rival).toEqual(good);
    expect(listingInputsFromBody(null)).toBeNull();
    expect(listingInputsFromBody([good])).toBeNull();
  });
});

describe("the re-read's own monthly cap", () => {
  test("PLACES_COMPETITOR_REREAD_MONTHLY_CAP, default 200; never runs when the count can't be read", () => {
    expect(DEFAULT_COMPETITOR_REREAD_MONTHLY_CAP).toBe(200);
    expect(competitorRereadMonthlyCap({})).toBe(200);
    expect(competitorRereadMonthlyCap({ PLACES_COMPETITOR_REREAD_MONTHLY_CAP: "50" })).toBe(50);
    expect(canReread(199, 200)).toBe(true);
    expect(canReread(200, 200)).toBe(false);
    expect(canReread("unreadable", 200)).toBe(false);
    expect(canReread("missing", 200)).toBe(true);
  });

  test("one call, logged as competitor_scoring; over the cap: no call, a 0-call skip row", async () => {
    vi.resetModules();
    const inserted: Array<Record<string, unknown>> = [];
    let used = 0;
    const getListing = vi.fn(async () => PLACE);
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: () => ({
          select: () => ({ eq: () => ({ gte: async () => ({ data: [{ calls: used }], error: null }) }) }),
          insert: async (row: Record<string, unknown>) => void inserted.push(row),
        }),
      }),
    }));
    vi.doMock("@/lib/google/places", async (orig) => ({ ...(await orig()), getCompetitorScoringListing: getListing }));
    const { rereadCompetitorListing } = await import("./competitorReread.server");
    expect(await rereadCompetitorListing("rival", "biz")).toEqual(listingInputFromPlace(PLACE));
    expect(getListing).toHaveBeenCalledTimes(1);
    expect(inserted).toEqual([{ business_id: "biz", kind: "competitor_scoring", calls: 1 }]);
    used = 200;
    expect(await rereadCompetitorListing("rival", "biz")).toBeNull();
    expect(getListing).toHaveBeenCalledTimes(1);
    expect(inserted.at(-1)).toEqual({ business_id: "biz", kind: "competitor_scoring_skipped", calls: 0 });
    vi.doUnmock("@/lib/supabase/admin");
    vi.doUnmock("@/lib/google/places");
  });
});
