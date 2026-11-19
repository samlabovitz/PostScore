import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

// Day 23 2d-4: every scan reads Google live, scores in memory, and saves
// only the place ID, lat/lng and PostScore's own results — never Google's
// listing values, on any table. Scores are exactly what the old
// save-then-read-back gave. Pages read Google live (or say they couldn't)
// and never contradict a saved score.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "b1" }), useRouter: () => ({ refresh: vi.fn() }) }));

const lookup = vi.fn();
vi.mock("@/lib/google/places", async (orig) => ({ ...(await orig<typeof import("@/lib/google/places")>()), lookupBusinessByPlaceId: (...a: unknown[]) => lookup(...a) }));
vi.mock("@/lib/websiteAnalysis", async (orig) => ({ ...(await orig<typeof import("@/lib/websiteAnalysis")>()), collectWebsiteAnalysis: async () => ANALYSIS }));
vi.mock("@/lib/websiteHttps", () => ({ checkWebsiteHttps: async () => ({ status: "https", reason: null }) }));
vi.mock("@/lib/screenshotBudgetServer", () => ({ loadScreenshotCallsThisMonth: async () => 0, loadBrowserRendersThisMonth: async () => 0 }));
vi.mock("@/lib/websiteScreenshotUpload", () => ({ uploadWebsiteScreenshots: async () => ({ screenshotUrl: null, additionalPages: [] }) }));
vi.mock("@/lib/placesDetailsBudget.server", () => ({ detailsCallAllowed: vi.fn(async () => true), logPlacesDetailsCall: vi.fn(async () => undefined), logPlacesDetailsSkip: vi.fn(async () => undefined) }));
vi.mock("@/lib/gbpReplyCounts.server", () => ({ runGbpReplyCheck: async () => ({ status: "not_connected" }) }));
vi.mock("@/lib/gbpMediaPosts.server", () => ({ refreshPhotosAndPosts: async () => undefined }));
vi.mock("@/lib/gbpGoogleEdits.server", () => ({ checkGoogleEdits: async () => undefined }));
vi.mock("@/app/actions/competitors", () => ({ refreshCompetitorsOnRescanWithClient: async () => ({ status: "skipped" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => db.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));

import { LocaleProvider } from "@/lib/i18n";
import type { PlaceDetails } from "@/lib/google/places";
import { businessRowToScoringInput, scoreBusiness, V112_SCORING_COLUMNS, type BusinessScoringRow, type CheckResult } from "@/lib/scoring";
import { emptyListingColumns, LISTING_SCORING_COLUMN_NAMES, listingScoringRow } from "@/lib/listingScoringRow";
import { liveListingFromPlaces, withLiveListing } from "@/lib/ownerListing";
import { isGoogleSideCheck, withSavedScore } from "@/lib/savedScore";
import { ChangedOnGoogleNote } from "@/components/scoring/CategoryCard";
import { saveBusinessWithClient } from "@/app/actions/businesses";
import { rescanBusinessWithClient, saveScoreSnapshotWithClient, scoreBusinessWithClient, syncScoreSnapshotWithClient } from "@/app/actions/scoring";
import { rememberOwnerListing } from "@/lib/ownerListing.server";
import { liveCache } from "@/lib/placesLive.server";

const src = (f: string) => readFileSync(f, "utf8");

const ANALYSIS = {
  content: { hasTitle: true, hasMetaDescription: true, hasViewportTag: true, headingCount: 3, visibleTextLength: 600, hasPhoneLink: true, hasEmailLink: false, hasCtaText: true, isLikelyClientRenderedShell: false, renderedContentSignals: null },
  mobilePerformance: { method: "lab", fieldCategory: null, labScore: 88 },
  mobilePerformanceFailureReason: null,
  contentFetchFailureReason: null,
  aboutPresence: { state: "found", url: null, locatedOnHomepage: true, reason: null, note: null },
  servicesPresence: { state: "found", url: null, locatedOnHomepage: true, reason: null, note: null },
  websiteTrust: { spamSignals: [], safeBrowsingThreat: null, safeBrowsingChecked: false, infoConflicts: [], staleNotices: [], abandonedSignals: { newestDateFound: null, templateLeftovers: [], looksAbandoned: false }, websiteKind: "independent", listingLinkBroken: false, checkedAt: "2026-11-17T00:00:00Z" },
  readViaBrowserChecks: [],
  browserRenders: 0,
  screenshotBytes: null,
  additionalPages: [],
};

/** A listing with values distinctive enough to spot anywhere in a write. */
const PLACE = {
  placeId: "ChIJ-2d4",
  name: "Zebra Nails Uniquename",
  formattedAddress: "77 Zebrastreet Ave, Newark, DE 19711, USA",
  phone: "+1 302-555-0177",
  website: "https://zebranails.example",
  openingHours: ["Monday: 9:17 AM – 7:43 PM"],
  openingHoursPeriods: [{ open: { day: 1, hour: 9, minute: 17 }, close: { day: 1, hour: 19, minute: 43 } }],
  rating: 4.37,
  userRatingCount: 173,
  categories: ["nail_salon_zebra", "beauty_salon"],
  primaryCategory: "Zebra nail salon",
  primaryType: "nail_salon_zebra",
  location: { lat: 39.68, lng: -75.75 },
  businessStatus: "OPERATIONAL",
  googleMapsUri: "https://maps.google.com/?cid=777177",
  photoCount: 23,
  priceLevel: "PRICE_LEVEL_MODERATE",
  pureServiceAreaBusiness: false,
  serviceOptions: { takeout: true },
  reviewPublishTimes: [new Date(Date.now() - 5 * 86_400_000).toISOString()],
  listingHasAccessibility: true,
  listingHasPayment: true,
  listingHasParking: false,
} as unknown as PlaceDetails;

/** Distinctive Google values that must never be written anywhere. */
const GOOGLE_VALUES = ["Zebra Nails Uniquename", "77 Zebrastreet", "302-555-0177", "9:17 AM", "nail_salon_zebra", "Zebra nail salon", "cid=777177", "PRICE_LEVEL_MODERATE", "4.37", "173"];
const ALLOWED_GOOGLE_KEYS = new Set(["place_id", "lat", "lng", "lat_lng_fetched_at", "biz_type_resolved"]);

type Row = Record<string, unknown>;
/** An in-memory database that records every write, on every table. */
function memDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  const writes: Array<{ table: string; op: string; payload: unknown }> = [];
  let nextId = 1;
  const client = {
    from(table: string) {
      const rows = () => (tables[table] ??= []);
      const filters: Array<(r: Row) => boolean> = [];
      let pending: { op: "insert" | "upsert" | "update"; payload: Row | Row[] } | null = null;
      const result = () => {
        if (pending) {
          const list = Array.isArray(pending.payload) ? pending.payload : [pending.payload];
          writes.push({ table, op: pending.op, payload: pending.payload });
          if (pending.op === "update") {
            const hit = rows().filter((r) => filters.every((f) => f(r)));
            hit.forEach((r) => Object.assign(r, pending!.payload));
            return { data: hit, error: null };
          }
          const made = list.map((p) => {
            const existing = pending!.op === "upsert" ? rows().find((r) => r.place_id === p.place_id && r.owner_id === p.owner_id) : undefined;
            if (existing) return Object.assign(existing, p);
            const r = { id: `id${nextId++}`, created_at: new Date(Date.now() + nextId).toISOString(), ...p };
            rows().push(r);
            return r;
          });
          return { data: made, error: null };
        }
        return { data: rows().filter((r) => filters.every((f) => f(r))), error: null };
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), chain),
        neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), chain),
        in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), chain),
        is: () => chain,
        not: () => chain,
        gt: () => chain,
        gte: () => chain,
        lt: () => chain,
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        insert: (payload: Row) => ((pending = { op: "insert", payload }), chain),
        upsert: (payload: Row) => ((pending = { op: "upsert", payload }), chain),
        update: (payload: Row) => ((pending = { op: "update", payload }), chain),
        delete: () => chain,
        single: async () => {
          const r = result();
          const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data;
          return { data: d, error: d ? null : { message: "no row" } };
        },
        maybeSingle: async () => {
          const r = result();
          return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: null };
        },
        then: (resolve: (v: unknown) => void) => resolve(result()),
      };
      return chain;
    },
  };
  return { client: client as never, tables, writes };
}

let db: ReturnType<typeof memDb>;

const SAVED: Row = {
  id: "b1",
  owner_id: "u1",
  place_id: "ChIJ-2d4",
  listing_mode: "google",
  language: "en",
  // Last scan's saved Google columns (pre-2d-5, never read any more).
  name: "Old Saved Name",
  rating: 1.1,
  review_count: 2,
  phone: null,
  website: null,
  categories: null,
  category: null,
  primary_type: null,
  opening_hours: null,
  opening_hours_periods: null,
  photo_count: 0,
  business_status: "CLOSED_PERMANENTLY",
  https_status: "https",
  website_analysis_json: null,
  biz_type_resolved: "salon",
  business_type_override: null,
  lat: 39.68,
  lng: -75.75,
};

/** The Google keys and values in every write — must be none. */
function googleInWrites(): string[] {
  const out: string[] = [];
  for (const w of db.writes) {
    const payloads = Array.isArray(w.payload) ? w.payload : [w.payload];
    for (const p of payloads as Row[]) {
      for (const k of Object.keys(p)) if ((LISTING_SCORING_COLUMN_NAMES as readonly string[]).includes(k) && !ALLOWED_GOOGLE_KEYS.has(k)) out.push(`${w.table}.${k}`);
    }
    const json = JSON.stringify(w.payload);
    for (const v of GOOGLE_VALUES) if (json.includes(v)) out.push(`${w.table} has "${v}"`);
  }
  return out;
}

beforeEach(() => {
  lookup.mockReset();
  lookup.mockResolvedValue({ status: "found", place: PLACE });
  liveCache().clear();
  db = memDb({ businesses: [{ ...SAVED }], scores: [], tasks: [], scan_changes: [], places_calls: [], gbp_connections: [] });
});

describe("a scan saves only results (Day 23 2d-4)", () => {
  test("first scan (the sign-up funnel's add): the place ID, lat/lng and our own results — no Google value on any table", async () => {
    db = memDb({ businesses: [], scores: [] });
    const r = await saveBusinessWithClient(db.client, "u1", PLACE);
    expect(r.status).toBe("saved");
    const upsert = db.writes.find((w) => w.table === "businesses" && w.op === "upsert")!.payload as Row;
    expect(upsert).toMatchObject({ owner_id: "u1", place_id: "ChIJ-2d4", lat: 39.68, lng: -75.75 });
    expect(googleInWrites()).toEqual([]);
    // The scan's Google values come back for its score — in memory only.
    expect(r.status === "saved" && r.listing).toEqual(listingScoringRow(PLACE));
  });

  for (const kind of ["owner_rescan", "monthly", "rescan_all"] as const) {
    test(`re-scan (${kind}): scored from this read in memory; the score is saved, no Google value on any table`, async () => {
      const r = await rescanBusinessWithClient(db.client, "b1", true, { detailsKind: kind });
      expect(r.status).toBe("ok");
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(googleInWrites()).toEqual([]);
      const saved = db.tables.scores.at(-1)!;
      // Never the stale saved columns (1.1★, 2 reviews, closed): this read's values.
      const expected = scoreBusiness(
        businessRowToScoringInput({ ...(db.tables.businesses[0] as Row), ...listingScoringRow(PLACE) } as unknown as BusinessScoringRow),
        "en"
      );
      expect(saved.total).toBe(expected.total);
      expect(saved.grade).toBe(expected.grade);
      expect((saved.breakdown_json as { checks: CheckResult[] }).checks.map((c) => [c.id, c.earnedPoints])).toEqual(expected.checks.map((c) => [c.id, c.earnedPoints]));
    });
  }

  test("every scan path goes through these two: first scan, the Re-scan button, the weekly fresh scan, the monthly cron and rescan-all", () => {
    expect(src("app/actions/businesses.ts")).toContain("const result = await saveBusinessWithClient(supabase, user.id, place, language, businessTypeOverride, tradeId);");
    expect(src("app/actions/scoring.ts")).toContain('const result = await rescanBusinessWithClient(supabase, businessId, false, { detailsKind: "owner_rescan" });');
    expect(src("app/actions/weekly.ts")).toContain("const result = await rescanBusiness(businessId);");
    expect(src("app/api/cron/monthly-reports/route.ts")).toContain('rescanBusinessWithClient(supabase, businessId, false, { detailsKind: "monthly" })');
    expect(src("scripts/rescan-all.ts")).toContain('rescanBusinessWithClient(supabase, b.id, noScreenshots, { detailsKind: "rescan_all" })');
    // The scan's own write: no Google column left in the upsert.
    const upsert = src("app/actions/businesses.ts").slice(src("app/actions/businesses.ts").indexOf("const upsertBusiness = () =>"), src("app/actions/businesses.ts").indexOf("const { data, error } = await upsertBusiness();"));
    for (const k of ["name:", "address:", "phone:", "website:", "rating:", "review_count:", "categories:", "opening_hours:", "photo_count:", "business_status:", "price_level:", "google_maps_uri:"]) expect(upsert, k).not.toContain(` ${k} place.`);
  });

  test("the website re-check compares the site with Google as read now, and saves no Google value", async () => {
    const { recheckWebsiteWithClient } = await import("@/lib/websiteRecheck.server");
    db.tables.businesses[0] = { ...SAVED, website: "https://zebranails.example", website_analysis_json: ANALYSIS };
    rememberOwnerListing("b1", liveListingFromPlaces(PLACE));
    let facts: unknown = null;
    await recheckWebsiteWithClient(db.client, "b1", {
      analyze: async (input) => {
        facts = input.listingFacts;
        return { websiteAnalysis: ANALYSIS as never, httpsStatus: "https", checkedAt: "2026-11-17T00:00:00Z", captureScreenshots: false, analysis: null } as never;
      },
    }).catch(() => undefined);
    expect(facts).toMatchObject({ phone: "+1 302-555-0177", address: "77 Zebrastreet Ave, Newark, DE 19711, USA" });
    expect(googleInWrites()).toEqual([]);
  });

  test("over the monthly cap: no Google read and no re-score — the last scan stands (D5)", async () => {
    const budget = await import("@/lib/placesDetailsBudget.server");
    vi.mocked(budget.detailsCallAllowed).mockResolvedValueOnce(false);
    const r = await rescanBusinessWithClient(db.client, "b1", true, { detailsKind: "owner_rescan" });
    expect(r.status).toBe("error");
    expect(lookup).not.toHaveBeenCalled();
    expect(db.tables.scores).toEqual([]);
  });

  test("the website-removed check keeps scoring with the site we graded, never Google's saved link (D6)", () => {
    const s = src("app/actions/scoring.ts");
    expect(s).toContain("const resolvedWebsite = resolveListingWebsite(\n    previousWebsite,");
    expect(s).toContain('.select("fp_website:field_fingerprints->f->>website")');
    expect(s).toContain("return gradedSiteUrl(analysisJson);");
    // The re-scan's own read of the row: our own columns only.
    expect(s).toContain('"owner_id, place_id, language, website_analysis_json, google_listing_missing_website_since, google_listing_website_removed_since, google_listing_last_known_website_at"');
  });
});

describe("scores are identical to the old save-then-read-back", () => {
  /** The pre-2d-4 upsert, literally (app/actions/businesses.ts before 2d-4). */
  function oldSavedRow(saved: Row, place: PlaceDetails, now: Date): Row {
    const v112 =
      place.reviewPublishTimes === undefined
        ? {}
        : {
            has_recent_review: (place.reviewPublishTimes ?? []).some((t) => now.getTime() - Date.parse(t) <= 90 * 86_400_000) || null,
            listing_has_accessibility: place.listingHasAccessibility ?? null,
            listing_has_payment: place.listingHasPayment ?? null,
            listing_has_parking: place.listingHasParking ?? null,
            pure_service_area_business: place.pureServiceAreaBusiness ?? null,
          };
    return {
      ...saved,
      ...v112,
      name: place.name,
      address: place.formattedAddress,
      phone: place.phone,
      website: place.website,
      rating: place.rating,
      review_count: place.userRatingCount,
      category: place.primaryCategory,
      primary_type: place.primaryType,
      categories: place.categories,
      opening_hours: place.openingHours,
      opening_hours_periods: place.openingHoursPeriods,
      business_status: place.businessStatus,
      photo_count: place.photoCount,
      google_maps_uri: place.googleMapsUri,
      price_level: place.priceLevel,
    };
  }

  const shapes: Array<[string, Partial<PlaceDetails>]> = [
    ["the full listing", {}],
    ["no website", { website: null }],
    ["closed for good", { businessStatus: "CLOSED_PERMANENTLY" }],
    ["no hours", { openingHours: null, openingHoursPeriods: null }],
    ["no recent review", { reviewPublishTimes: [] }],
    ["no customer details", { listingHasAccessibility: false, listingHasPayment: false, listingHasParking: false }],
    ["no photos, no phone", { photoCount: 0, phone: null }],
    ["few reviews", { rating: 3.2, userRatingCount: 4 }],
  ];
  for (const [label, change] of shapes) {
    test(label, () => {
      const now = new Date();
      const place = { ...PLACE, ...change } as PlaceDetails;
      const old = scoreBusiness(businessRowToScoringInput(oldSavedRow(SAVED, place, now) as unknown as BusinessScoringRow), "en");
      const fresh = scoreBusiness(businessRowToScoringInput({ ...SAVED, ...listingScoringRow(place, now) } as unknown as BusinessScoringRow), "en");
      expect(fresh.total).toBe(old.total);
      expect(fresh.grade).toBe(old.grade);
      expect(fresh.checks.map((c) => [c.id, c.earnedPoints, c.maxPoints, c.confidence])).toEqual(old.checks.map((c) => [c.id, c.earnedPoints, c.maxPoints, c.confidence]));
    });
  }

  test("the proof script compares check by check and fails on an empty snapshot", async () => {
    const { snapshotDiff, snapshotOf, snapshotProblems } = await import("@/scripts/day23-2d4-snapshot");
    const b = scoreBusiness(businessRowToScoringInput({ ...SAVED, ...listingScoringRow(PLACE) } as unknown as BusinessScoringRow), "en");
    const snap = snapshotOf(b, b.total, b.grade, b.scoringVersion);
    expect(Object.keys(snap.checks).length).toBeGreaterThanOrEqual(26);
    expect(snapshotDiff(snap, snap)).toEqual([]);
    const moved = { ...snap, checks: { ...snap.checks, "visibility.rating": { ...snap.checks["visibility.rating"], earned: 0 } } };
    expect(snapshotDiff(snap, moved)).toEqual([expect.stringContaining("check visibility.rating")]);
    expect(snapshotProblems([{ ...snap, name: "Empty", checks: {} }] as never).join("\n")).toMatch(/0 checks, expected 26/);
  });
});

describe("pages: live or 'couldn't load', never a saved Google value, never a contradiction", () => {
  test("Google couldn't be read: every Google column empty — the name and address too (Day 23 2d-5)", () => {
    const down = withLiveListing({ ...SAVED, address: "Saved St" } as Row, { status: "unavailable" });
    for (const k of LISTING_SCORING_COLUMN_NAMES.filter((k) => !["google_service_options", "has_recent_review", "recent_reviews_seen", "listing_has_accessibility", "listing_has_payment", "listing_has_parking", "pure_service_area_business"].includes(k))) expect((down as Row)[k] ?? null, k).toBeNull();
    expect(down).toMatchObject({ name: null, address: null, live_unavailable: true });
    expect(Object.keys(emptyListingColumns()).sort()).toEqual(LISTING_SCORING_COLUMN_NAMES.filter((k) => !["google_service_options", "has_recent_review", "recent_reviews_seen", "listing_has_accessibility", "listing_has_payment", "listing_has_parking", "pure_service_area_business"].includes(k)).sort());
  });

  test("a page scores from the visit's live read; when Google can't be read it says so — never a scan saved on empty values", async () => {
    db.tables.businesses[0] = { ...SAVED, ...Object.fromEntries(V112_SCORING_COLUMNS.split(", ").map((c) => [c, null])) };
    rememberOwnerListing("b1", liveListingFromPlaces(PLACE));
    const ok = await scoreBusinessWithClient(db.client, "b1", "en");
    expect(ok.status === "ok" && ok.live).toBe("ok");
    expect(ok.status === "ok" && ok.business).toMatchObject({ rating: 4.37, review_count: 173, business_status: "OPERATIONAL" });

    liveCache().clear();
    rememberOwnerListing("b1", { status: "unavailable" });
    const down = await scoreBusinessWithClient(db.client, "b1", "en");
    expect(down.status === "ok" && down.live).toBe("unavailable");
    expect(down.status === "ok" && down.business).toMatchObject({ rating: null, review_count: null, business_status: null, live_unavailable: true });
    expect((await saveScoreSnapshotWithClient(db.client, "b1")).status).toBe("error");
    expect(db.tables.scores).toEqual([]);
  });

  test("a page load never saves a score — not for a Google change, not for a scoring update (the Hair Express case after the 1.16.0 bump)", async () => {
    const { scoreForDisplayWithClient } = await import("@/app/actions/scoring");
    // Hair Express after the bump: its saved scan is 1.15.0, and the new speed rule applies to it.
    db.tables.businesses[0] = {
      ...SAVED,
      website_analysis_json: {
        ...ANALYSIS,
        checkedAt: "2026-11-18T01:44:45Z",
        mobilePerformance: { method: "lab", fieldCategory: null, labScore: 75, lcpSeconds: 8.6, measuredAt: "2026-11-18T01:44:45Z", measuredUrl: "https://zebranails.example" },
        speedHistory: [{ measuredAt: "2026-11-18T01:44:45Z", measuredUrl: "https://zebranails.example", lcpSeconds: 8.6, category: "SLOW" }],
        speedSmoothed: { category: "SLOW", seconds: 8.6, samples: 1, measuredUrl: "https://zebranails.example" },
      },
      website: "https://zebranails.example",
    };
    rememberOwnerListing("b1", liveListingFromPlaces(PLACE));
    const now = await scoreBusinessWithClient(db.client, "b1", "business");
    const speedCheck = now.status === "ok" ? now.result.breakdown.checks.find((c) => c.id === "website.performance_mobile") : null;
    expect(speedCheck?.meta?.noScoreCause, JSON.stringify(speedCheck)).toBe("one_test");
    const old = JSON.parse(JSON.stringify(now.status === "ok" ? now.result.breakdown : null));
    old.scoringVersion = "1.15.0";
    db.tables.scores = [{ id: "s0", business_id: "b1", total: 75, grade: "C", scoring_version: "1.15.0", created_at: "2026-11-18T01:44:51Z", breakdown_json: old }];
    // Opening the Overview (the display path) and the page's own sync: nothing saved.
    await scoreForDisplayWithClient(db.client, "b1", "business");
    expect(await syncScoreSnapshotWithClient(db.client, "b1", "page", Date.now() + 300_000)).toEqual({ saved: false, before: null, after: null });
    expect(db.tables.scores).toHaveLength(1);
    expect(db.writes.filter((w) => w.table === "scores")).toEqual([]);
    const scoring = src("app/actions/scoring.ts");
    expect(scoring).toContain('if (kind === "page") return { saved: false, before: null, after: null };');
    expect(scoring.slice(scoring.indexOf("export async function scoreForDisplayWithClient"), scoring.indexOf("/** The owner's listing as Google shows it now"))).not.toContain("syncScoreSnapshotWithClient");
    for (const page of ["app/business/[id]/page.tsx", "app/business/[id]/reports/page.tsx"]) expect(src(page), page).toContain("await syncScoreSnapshot(params.id);");
    expect(scoring).toContain('await syncScoreSnapshotWithClient(createClient(), businessId, "page");');
  });

  test("an owner's own change and connecting Google still save (they aren't page loads)", async () => {
    rememberOwnerListing("b1", liveListingFromPlaces(PLACE));
    const live = await scoreBusinessWithClient(db.client, "b1", "business");
    const version = live.status === "ok" ? live.result.breakdown.scoringVersion : "";
    db.tables.scores = [{ id: "s0", business_id: "b1", total: 12, grade: "F", scoring_version: version, created_at: "2026-11-10T00:00:00Z", breakdown_json: {} }];
    expect(await syncScoreSnapshotWithClient(db.client, "b1", "page", Date.now() + 60_000)).toMatchObject({ saved: false });
    expect(db.tables.scores).toHaveLength(1);
    expect(await syncScoreSnapshotWithClient(db.client, "b1", "data_update", Date.now() + 120_000)).toMatchObject({ saved: true });
    expect(src("app/actions/customerDetails.ts")).toContain('syncScoreSnapshotWithClient(supabase, businessId, "data_update")');
    expect(src("app/actions/niches.ts")).toContain('syncScoreSnapshotWithClient(supabase, businessId, "data_update")');
  });

  test("a Google-side check that reads differently now than its saved points is marked; our own website checks aren't", () => {
    const now = scoreBusiness(businessRowToScoringInput({ ...SAVED, ...listingScoringRow(PLACE) } as unknown as BusinessScoringRow), "en");
    const savedBd = JSON.parse(JSON.stringify(now));
    for (const c of savedBd.checks) if (c.id === "visibility.review_count" || c.id === "website.https") c.earnedPoints = 0;
    const row = { id: "s1", total: now.total, grade: now.grade, scoring_version: now.scoringVersion, breakdown_json: savedBd };
    const shown = withSavedScore(now, row)!;
    const by = (id: string) => shown.checks.find((c) => c.id === id)!;
    expect(by("visibility.review_count")).toMatchObject({ earnedPoints: 0, liveDiffers: "changed" });
    expect(by("website.https").liveDiffers).toBeUndefined();
    expect(by("visibility.rating").liveDiffers).toBeUndefined();
    // Google couldn't be read: every Google-side check is "unavailable", none "changed".
    const down = withSavedScore(now, row, { liveUnavailable: true })!;
    expect(down.checks.filter((c) => isGoogleSideCheck(c.id)).every((c) => c.liveDiffers === "unavailable")).toBe(true);
    expect(down.checks.filter((c) => !isGoogleSideCheck(c.id)).every((c) => c.liveDiffers === undefined)).toBe(true);
  });

  test("the note in place of contradicting words, EN + ES (usted), linking to the Re-scan button", () => {
    const en = renderToStaticMarkup(
      <LocaleProvider locale="en" timeZone="America/New_York">
        <ChangedOnGoogleNote businessId="b1" />
      </LocaleProvider>
    );
    expect(en.replace(/<[^>]+>/g, "")).toContain("Changed on Google since your last scan · Re-scan to update your score");
    expect(en).toContain('href="/business/b1#rescan"');
    const es = renderToStaticMarkup(
      <LocaleProvider locale="es" timeZone="America/New_York">
        <ChangedOnGoogleNote businessId={null} />
      </LocaleProvider>
    );
    expect(es.replace(/<[^>]+>/g, "")).toContain("Cambió en Google desde su último escaneo · Vuelva a escanear para actualizar su puntuación");
    // From the page's own address when not passed (the Website page).
    expect(es).toContain('href="/business/b1#rescan"');
    const card = src("components/scoring/CategoryCard.tsx");
    expect(card).toContain('if (check.liveDiffers === "changed") return <ChangedOnGoogleNote businessId={businessId} />;');
    expect(card).toContain('if (check.liveDiffers === "unavailable") return null;');
    expect(src("app/business/[id]/website/WebsiteScoreBreakdown.tsx")).toContain('{check.liveDiffers === "changed" && <ChangedOnGoogleNote businessId={null} />}');
  });

  test("every reader goes live (shared, cached 10 minutes) or says it couldn't — none quote the saved Google columns", () => {
    const reads: Array<[string, string]> = [
      ["app/actions/scoring.ts", "liveListing.status === \"ok\" ? { ...business, ...liveListing.columns }"],
      ["app/actions/reviews.ts", "await withLiveListingFor(supabase, businessId, data as typeof data & { listing_mode?: string | null })"],
      ["app/actions/website.ts", "const data = await withLiveListingFor(supabase, businessId, saved as typeof saved & { listing_mode?: string | null });"],
      ["app/actions/actionPlan.ts", "const business = await withLiveListingFor(supabase, businessId, saved as typeof saved & { listing_mode?: string | null });"],
      ["app/actions/growthMoves.ts", "await withLiveListingFor(supabase, businessId, r.data)"],
      ["app/actions/competitors.ts", "(await liveReviewCount(supabase, businessId))"],
      ["app/actions/printStudio.ts", "website: realWebsite(await withOwnerWebsite(supabase, businessId, live)),"],
      ["app/actions/pricing.ts", "subjectSymbol: priceLevelToSymbol(live?.price_level ?? null)"],
      ["app/actions/hoursChooser.ts", "await withLiveListingFor(db, businessId, saved)"],
      ["app/actions/gbpProfileEdits.ts", "await withLiveListingFor(c.admin, businessId,"],
      ["app/actions/gbpCustomerDetails.ts", "await withLiveListingFor(createClient(), businessId, data)"],
      ["lib/gbpGoogleEdits.server.ts", "await withLiveListingFor(admin, businessId, biz)"],
      ["lib/gbpOrderLinkContext.server.ts", "await withLiveListingFor(admin, businessId, data)"],
      ["lib/gbpEditGate.server.ts", "await withLiveListingFor(supabase, businessId, saved)"],
      ["lib/websiteRecheck.server.ts", "const live = await withLiveListingFor(supabase, businessId,"],
      // The owner's confirmed name and address over the live listing's.
      ["app/actions/ownerWebsite.ts", "await withOwnerDetailsFor(supabase, businessId, await withLiveListingFor(supabase, businessId, data))"],
      ["app/api/cron/monthly-reports/route.ts", "const freshBusiness = await withLiveListingFor(supabase, businessId, savedBusiness"],
      ["lib/serviceOptions.server.ts", "live.columns.google_service_options"],
      ["scripts/preview-report.ts", "withLiveListingFor(supabase, businessId, savedBusiness)"],
    ];
    for (const [file, needle] of reads) expect(src(file), file).toContain(needle);
    // No Google call on every page: the notification sync and the switcher use only a read already made.
    expect(src("lib/notifications.server.ts")).toContain("const live = cachedOwnerListing(businessId, now.getTime());");
    // The home list and switcher (Day 23 2d-5): the owner's name, else the listing's read now (shared 10-minute cache).
    expect(src("app/actions/businesses.ts")).toContain("const names = await shownNamesFor(supabase, data.map((row) => row.id), { live: namesLiveFor(data.length) });");
    // A scan's own read is the visit's read too (not connected): no second call right after it.
    expect(src("app/actions/scoring.ts")).toContain("if (!(await isGbpConnected(supabase, businessId))) rememberOwnerListing(businessId, liveListingFromPlaces(placeToSave));");
  });

  test("connected owners' pages build every input from Business Profile — 0 Places calls (D4)", async () => {
    const { columnsFromBusinessProfile, liveValuesFromBusinessProfile } = await import("@/lib/ownerListing");
    const location = {
      title: "Hair Express",
      storefrontAddress: { addressLines: ["1 Broadway"], locality: "Bayonne", administrativeArea: "NJ", postalCode: "07002" },
      phoneNumbers: { primaryPhone: "(201) 555-0100" },
      categories: { primaryCategory: { name: "categories/gcid:hair_salon", displayName: "Hair salon" }, additionalCategories: [{ name: "categories/gcid:barber_shop", displayName: "Barber shop" }] },
      openInfo: { status: "OPEN" },
    };
    const values = liveValuesFromBusinessProfile({ location, reviews: { averageRating: 4.8, totalReviewCount: 58 }, photoCount: 8 });
    const cols = columnsFromBusinessProfile({ location, attributes: [{ name: "attributes/pay_credit_card", values: [true] }], values });
    expect(cols).toMatchObject({ name: "Hair Express", category: "Hair salon", primary_type: "hair_salon", categories: ["hair_salon", "barber_shop"], rating: 4.8, review_count: 58, photo_count: 8, listing_has_payment: true, listing_has_parking: false, pure_service_area_business: false });
    expect(src("lib/ownerListing.server.ts")).toContain("columns: columnsFromBusinessProfile({ location: listing.listing.location, attributes: listing.listing.attributes, values }),");
  });

  test("Business Profile leaves out a website Places shows (the real Hair Express case): pages keep the site our last scan graded, never 'no website'", async () => {
    const { gradedSiteUrl } = await import("@/lib/gradedSite");
    expect(gradedSiteUrl({ screenshotSiteUrl: "https://a.example/" })).toBe("https://a.example/");
    // No screenshot site (older analyses): the homepage the speed test measured.
    expect(gradedSiteUrl({ mobilePerformance: { measuredUrl: "https://www.hairexpressonbroadway.com/" } })).toBe("https://www.hairexpressonbroadway.com/");
    expect(gradedSiteUrl({ speedHistory: [{ measuredUrl: "https://b.example/" }] })).toBe("https://b.example/");
    expect(gradedSiteUrl({ mobilePerformance: { measuredUrl: "not a url" } })).toBeNull();
    expect(gradedSiteUrl(null)).toBeNull();
    const server = src("lib/ownerListing.server.ts");
    expect(server).toContain("const values = fromProfile.website ? fromProfile : { ...fromProfile, website: await gradedSiteOfLastScan(admin, businessId) };");
    // The website-removed check uses the same site.
    expect(src("app/actions/scoring.ts")).toContain("return gradedSiteUrl(analysisJson);");
  });

  test("review-task progress from our own records, never Google's count; pre-2d-4 rows fall back", async () => {
    const { decodeReviewGap, encodeReviewGap, reviewsGainedSince } = await import("@/lib/actionPlan");
    expect(encodeReviewGap(3)).toBe(-3);
    expect(decodeReviewGap(-3)).toBe(3);
    // A positive value is a pre-2d-4 row (Google's count then): no numeric progress.
    expect(decodeReviewGap(120)).toBeNull();
    const at = (d: string) => `2026-11-${d}T00:00:00Z`;
    expect(reviewsGainedSince([{ field: "reviews", direction: "up", delta: 2, at: at("12") }, { field: "reviews", direction: "up", delta: 1, at: at("15") }, { field: "photos", direction: "up", delta: 4, at: at("15") }], at("11"))).toBe(3);
    // Only a direction known (not connected): no number, never a guess.
    expect(reviewsGainedSince([{ field: "reviews", direction: "up", delta: null, at: at("12") }], at("11"))).toBeNull();
    expect(src("app/actions/actionPlan.ts")).toContain("const markedMetricValue = encodeReviewGap(weeklyReviewGap(checkId, input));");
  });

  test("the scripts kept after 2d-5 read only our own results (Google's values live)", () => {
    for (const f of ["live-check-postai", "preview-assistant-context", "rescan-food", "apply-niche-corrections", "backfill-notifications", "competitor-full-scoring"])
      expect(src(`scripts/${f}.ts`).slice(0, 400), f).toContain("Day 23 2d-5: reads only PostScore's own saved results");
    for (const f of ["rescore-all", "backfill-first-scores"]) expect(src(`scripts/${f}.ts`).slice(0, 400), f).toContain("now reads each\n// listing LIVE");
  });
});
