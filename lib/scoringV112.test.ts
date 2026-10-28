import { describe, expect, test } from "vitest";
import fs from "node:fs";
import { customerDetailsPartsFor, customerDetailsRuleFor } from "@/lib/customerDetails";
import { computeReplyCounts } from "@/lib/gbpReviewReplies";
import { applyCheckFix, businessRowToScoringInput, CATEGORY_WEIGHTS, checksFor, CHECKS, CHECKS_V112, getScoreWithSuggestions, scoreBusiness, SCORING_VERSION, SCORING_VERSION_V112, type BusinessScoringInput } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { hasRecentReviewFrom, normalizeDetails, recentReviewsSeenFrom } from "@/lib/google/places";
import { SCORING_NOTE_VERSION, scoringNoteApplies } from "@/lib/scoringUpdateNote";
import { snapshotDelta } from "@/lib/weekly/snapshots";

// Scoring v1.12.0, Stage 2 (docs/review-scoring-plan.md) — live since the
// dry run was approved.

const ROW = { rating: 4.7, review_count: 120, phone: "1", address: "a", opening_hours: null, website: null, categories: ["bakery"], category: "Bakery", photo_count: 10, business_status: "OPERATIONAL", https_status: null, primary_type: "bakery", name: "Kee's" };

const v112 = (input: BusinessScoringInput) => scoreBusiness(input, "en", SCORING_VERSION_V112);
const check = (input: BusinessScoringInput, id: string) => v112(input).checks.find((c) => c.id === id)!;

describe("the version bump", () => {
  test("SCORING_VERSION is 1.12.0; v1.11.0 still scores the old way", () => {
    expect(SCORING_VERSION).toBe(SCORING_VERSION_V112);
    expect(checksFor(SCORING_VERSION)).toBe(CHECKS_V112);
    expect(checksFor("1.11.0")).toBe(CHECKS);
    const input = scoringInput();
    expect(scoreBusiness(input, "en")).toEqual(v112(input));
    expect(scoreBusiness(input, "en", "1.11.0").checks.some((c) => c.id === "visibility.review_replies")).toBe(false);
  });
});

describe("the v1.12.0 weights", () => {
  test("Visibility 40 = rating 14 · count 14 · recency 6 · replies 6; Listing 30 = 4·4·4·4·3·4·4·3; Website unchanged", () => {
    const max = (cat: string) => Object.fromEntries(CHECKS_V112.filter((c) => c.category === cat).map((c) => [c.id, c.maxPoints]));
    expect(max("visibility")).toEqual({ "visibility.rating": 14, "visibility.review_count": 14, "visibility.review_recency": 6, "visibility.review_replies": 6 });
    expect(max("completeness")).toEqual({
      "completeness.phone": 4, "completeness.address": 4, "completeness.hours": 4, "completeness.website_link": 4,
      "completeness.categories": 3, "completeness.photos": 4, "completeness.business_status": 4, "completeness.customer_details": 3,
    });
    const sum = (list: typeof CHECKS, cat: string) => list.filter((c) => c.category === cat).reduce((s, c) => s + c.maxPoints, 0);
    expect(sum(CHECKS_V112, "visibility")).toBe(CATEGORY_WEIGHTS.visibility);
    expect(sum(CHECKS_V112, "completeness")).toBe(CATEGORY_WEIGHTS.completeness);
    expect(sum(CHECKS_V112, "website")).toBe(sum(CHECKS, "website"));
    expect(v112(scoringInput()).scoringVersion).toBe("1.12.0");
  });

  test("a reweighted check keeps its share: full review count is 14 of 14", () => {
    expect(check({ ...scoringInput(), reviewCount: 500 }, "visibility.review_count").earnedPoints).toBe(14);
  });
});

describe("review recency", () => {
  test("not connected: at least N recent among Google's ≤5 — 3+ = 6, 2 = 4, 1 = 2; none = couldn't confirm; 0 reviews = 0", () => {
    const seen = (n: 0 | 1 | 2 | 3 | null) => check({ ...scoringInput(), recentReviewsSeen: n }, "visibility.review_recency");
    expect(seen(3)).toMatchObject({ earnedPoints: 6, confidence: "VERIFIED", explanation: "At least 3 recent reviews (last 90 days) among the few Google shows. Connect Google to count all your recent reviews." });
    expect(seen(2)).toMatchObject({ earnedPoints: 4, explanation: "At least 2 recent reviews (last 90 days) among the few Google shows — 3 or more earns full points. Connect Google to count all your recent reviews." });
    expect(seen(1).earnedPoints).toBe(2);
    expect(seen(0)).toMatchObject({ earnedPoints: null, confidence: "NOT_FOUND" });
    expect(seen(null)).toMatchObject({ earnedPoints: null, confidence: "NOT_FOUND" });
    expect(check({ ...scoringInput(), reviewCount: 0, rating: null }, "visibility.review_recency")).toMatchObject({ earnedPoints: 0, confidence: "VERIFIED" });
    // Saved before the bucket existed: a yes is "at least 1".
    expect(check({ ...scoringInput(), hasRecentReview: true }, "visibility.review_recency").earnedPoints).toBe(2);
    const es = scoreBusiness({ ...scoringInput(), recentReviewsSeen: 2 }, "es").checks.find((c) => c.id === "visibility.review_recency")!;
    expect(es.explanation).toBe("Al menos 2 reseñas recientes (últimos 90 días) entre las pocas que muestra Google — 3 o más obtienen los puntos completos. Conecte Google para contar todas sus reseñas recientes.");
  });

  test("Google connected: the exact count — 0 = 0/6, 1 = 2, 2 = 4, 3+ = 6, and no 'connect' line", () => {
    const gbp = (recentReviews: 0 | 1 | 2 | 3) => check({ ...scoringInput(), recentReviewsSeen: 3, gbpReplies: { reviewsInWindow: 20, replied: 0, hasRecentReview: recentReviews > 0, recentReviews } }, "visibility.review_recency");
    expect(gbp(0)).toMatchObject({ earnedPoints: 0, confidence: "VERIFIED" });
    expect(gbp(1)).toMatchObject({ earnedPoints: 2, explanation: "1 review in the last 90 days on your Google Business Profile — 3 or more earns full points." });
    expect(gbp(2).earnedPoints).toBe(4);
    expect(gbp(3)).toMatchObject({ earnedPoints: 6, explanation: "3 or more reviews in the last 90 days on your Google Business Profile." });
    // Counts saved before the bucket: "none" is still exact.
    expect(check({ ...scoringInput(), gbpReplies: { reviewsInWindow: 20, replied: 0, hasRecentReview: false } }, "visibility.review_recency").earnedPoints).toBe(0);
  });

  test("a fix promises the full 6", () => {
    const input = { ...scoringInput(), recentReviewsSeen: 1 as const };
    expect(check(applyCheckFix(input, "visibility.review_recency"), "visibility.review_recency").earnedPoints).toBe(6);
  });

  test("only the bucket is kept: 0/1/2/3+, from Google's ≤5 or the connected profile", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    expect(recentReviewsSeenFrom(["2026-10-01T00:00:00Z", "2026-09-17T00:00:00Z", "2026-08-30T00:00:00Z", "2026-08-01T00:00:00Z", "2025-01-01T00:00:00Z"], now)).toBe(3);
    expect(recentReviewsSeenFrom(["2026-10-01T00:00:00Z", "2025-01-01T00:00:00Z"], now)).toBe(1);
    expect(recentReviewsSeenFrom(["2025-01-01T00:00:00Z"], now)).toBe(0);
    expect(recentReviewsSeenFrom(null, now)).toBeNull();
    const day = 86_400_000;
    const reviews = Array.from({ length: 7 }, (_, i) => ({ createTime: new Date(now.getTime() - (i + 1) * 10 * day).toISOString() }));
    expect(computeReplyCounts(reviews, now.getTime()).recentReviews).toBe(3);
    expect(computeReplyCounts([{ createTime: "2026-06-01T00:00:00Z" }], now.getTime()).recentReviews).toBe(0);
    expect(computeReplyCounts([reviews[0], reviews[1]], now.getTime()).recentReviews).toBe(2);
    const row = businessRowToScoringInput({ ...ROW, recent_reviews_seen: 2, gbp_reviews_in_window: 10, gbp_replied: 4, gbp_has_recent_review: true, gbp_recent_reviews: 7 });
    expect(row.recentReviewsSeen).toBe(2);
    expect(row.gbpReplies?.recentReviews).toBe(3);
    const save = fs.readFileSync("app/actions/businesses.ts", "utf8");
    expect(save).toContain("recent_reviews_seen: recentReviewsSeenFrom(place.reviewPublishTimes, new Date())");
  });

  test("from Place Details: true only for a review in the last 90 days (never stored as text or dates)", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    expect(hasRecentReviewFrom(["2026-09-17T12:00:00Z", "2025-01-01T00:00:00Z"], now)).toBe(true);
    expect(hasRecentReviewFrom(["2026-07-16T00:00:00Z"], now)).toBeNull();
    expect(hasRecentReviewFrom(null, now)).toBeNull();
    const save = fs.readFileSync("app/actions/businesses.ts", "utf8");
    expect(save).toContain("has_recent_review: hasRecentReviewFrom(place.reviewPublishTimes, new Date())");
    expect(save).not.toMatch(/review_text|publish_time|reviews_json/);
  });
});

describe("replying to reviews (Google connected only)", () => {
  const gbp = (replied: number, window = 20) => ({ ...scoringInput(), gbpReplies: { reviewsInWindow: window, replied, hasRecentReview: true } });
  test("proportional: 6 × rate ÷ 0.8, full at ≥ 80%", () => {
    expect(check(gbp(0), "visibility.review_replies").earnedPoints).toBe(0);
    expect(check(gbp(8), "visibility.review_replies").earnedPoints).toBe(3);
    expect(check(gbp(16), "visibility.review_replies").earnedPoints).toBe(6);
    expect(check(gbp(20), "visibility.review_replies").earnedPoints).toBe(6);
  });
  test("not connected, or under 3 recent reviews: left out (never 0)", () => {
    expect(check(scoringInput(), "visibility.review_replies")).toMatchObject({ earnedPoints: null, confidence: "NOT_FOUND", explanation: "Connect Google to check this." });
    expect(check(gbp(1, 2), "visibility.review_replies").earnedPoints).toBeNull();
  });
});

describe("customer details — only the parts that apply", () => {
  const details = { accessibility: true, payment: true, parking: false, pureServiceArea: false };
  test("a law office: accessibility only", () => {
    expect(customerDetailsPartsFor("lawyer", false)).toEqual(["accessibility"]);
    const input = { ...scoringInput(), listingDetails: { ...details, accessibility: true }, customerDetailsParts: customerDetailsPartsFor("lawyer", false) };
    expect(check(input, "completeness.customer_details")).toMatchObject({ earnedPoints: 3, confidence: "VERIFIED" });
    const missing = { ...input, listingDetails: { ...details, accessibility: false } };
    expect(check(missing, "completeness.customer_details").earnedPoints).toBe(0);
  });

  test("a salon: accessibility, payment and parking", () => {
    expect(customerDetailsPartsFor("salon", false)).toEqual(["accessibility", "payment", "parking"]);
    const input = { ...scoringInput(), listingDetails: details, customerDetailsParts: customerDetailsPartsFor("salon", false) };
    expect(check(input, "completeness.customer_details")).toMatchObject({ earnedPoints: 2, explanation: "Accessibility ✓ · Payment options ✓ · Parking ✗." });
  });

  test("a restaurant: all three; a service-area-only business: never parking", () => {
    expect(customerDetailsPartsFor("restaurant", false)).toEqual(["accessibility", "payment", "parking"]);
    expect(customerDetailsPartsFor("restaurant", true)).toEqual(["accessibility", "payment"]);
    const input = { ...scoringInput(), listingDetails: { ...details, pureServiceArea: true }, customerDetailsParts: customerDetailsPartsFor("restaurant", true) };
    expect(check(input, "completeness.customer_details").earnedPoints).toBe(3);
  });

  test("trades that go to the customer: the check is left out; not checked yet stays out too", () => {
    expect(customerDetailsPartsFor("plumber", true)).toEqual([]);
    // Left out of the breakdown entirely — never shown as "couldn't check".
    expect(v112({ ...scoringInput(), listingDetails: details, customerDetailsParts: [] }).checks.some((c) => c.id === "completeness.customer_details")).toBe(false);
    expect(check({ ...scoringInput(), listingDetails: null, customerDetailsParts: ["accessibility"] }, "completeness.customer_details").earnedPoints).toBeNull();
  });

  test("the business type comes from the saved row (owner's override first)", () => {
    const row = { rating: 4.5, review_count: 20, phone: "1", address: "a", opening_hours: null, website: null, categories: ["lawyer"], category: "Lawyer", photo_count: 3, business_status: "OPERATIONAL", https_status: null, primary_type: "lawyer", name: "Smith Law", listing_has_accessibility: true, listing_has_payment: false, listing_has_parking: false, pure_service_area_business: false };
    expect(businessRowToScoringInput(row).customerDetailsParts).toEqual(["accessibility"]);
    expect(businessRowToScoringInput({ ...row, business_type_override: "salon" }).customerDetailsParts).toEqual(["accessibility", "payment", "parking"]);
  });
});

describe("collected from Place Details only — competitors never", () => {
  test("listing facts: present → true, absent → false; Nearby Search leaves them unknown", () => {
    const place = normalizeDetails({ id: "p", paymentOptions: { acceptsCreditCards: true }, accessibilityOptions: { wheelchairAccessibleEntrance: false } });
    expect(place).toMatchObject({ listingHasPayment: true, listingHasAccessibility: true, listingHasParking: false });
    const places = fs.readFileSync("lib/google/places.ts", "utf8");
    expect(places).toContain("reviewPublishTimes: null, listingHasAccessibility: null, listingHasPayment: null, listingHasParking: null, pureServiceAreaBusiness: null");
  });

  test("the reply counts scoring uses are the owner's own, cleared on disconnect and when Google needs reconnecting", () => {
    expect(fs.readFileSync("lib/gbpReplyCounts.server.ts", "utf8")).toContain("await setGbpScoringCounts(admin, businessId, counts);");
    const tokens = fs.readFileSync("lib/gbpTokens.server.ts", "utf8");
    expect(tokens.match(/await clearGbpScoringCounts\(admin, businessId\);/g)).toHaveLength(2);
    // The reply check runs before the score is saved, so the score uses fresh counts.
    const scoring = fs.readFileSync("app/actions/scoring.ts", "utf8");
    expect(scoring.indexOf("await runGbpReplyCheck(businessId);")).toBeLessThan(scoring.indexOf("const scoreResult = await saveScoreSnapshotWithClient(supabase, businessId);"));
    expect(fs.readFileSync("supabase/scoring-v1-12.sql", "utf8")).toContain("add column if not exists gbp_replied integer");
  });
});

describe("after the first v1.12.0 scan", () => {
  test("the one-time note shows when the newest score is v1.12.0 and an earlier one isn't", () => {
    expect(SCORING_NOTE_VERSION).toBe(SCORING_VERSION_V112);
    expect(scoringNoteApplies([{ scoring_version: "1.12.0" }, { scoring_version: "1.11.0" }])).toBe(true);
    expect(scoringNoteApplies([{ scoring_version: "1.12.0" }])).toBe(false);
    expect(scoringNoteApplies([{ scoring_version: "1.12.0" }, { scoring_version: "1.12.0" }])).toBe(false);
    expect(scoringNoteApplies([{ scoring_version: "1.11.0" }, { scoring_version: "1.10.0" }])).toBe(false);
    const messages = fs.readFileSync("lib/i18n/messages.ts", "utf8");
    expect(messages).toContain('"dashboard.overview.scoringUpdateNote": "We updated how PostScore scores reviews and your listing');
    expect(messages).toContain('"dashboard.overview.scoringUpdateNote": "Actualizamos cómo PostScore califica las reseñas y su ficha');
    expect(fs.readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8").match(/\{scoringNote && <ScoringUpdateNote businessId=\{businessId\} \/>\}/g)).toHaveLength(2);
  });

  test("no progress or drop across versions: weekly recap, Reports/PDF and the monthly report compare only like with like", () => {
    expect(snapshotDelta({ score: 84, prev_score: 86, scoring_version: "1.12.0", prev_scoring_version: "1.11.0" })).toBeNull();
    expect(snapshotDelta({ score: 84, prev_score: 86, scoring_version: "1.12.0", prev_scoring_version: "1.12.0" })).toBe(-2);
    expect(fs.readFileSync("lib/reports/reportData.server.ts", "utf8")).toContain("comparable: recap.previous.scoring_version === recap.current.scoring_version");
    expect(fs.readFileSync("lib/monthlyReport.ts", "utf8")).toContain('return "scoring_updated";');
  });
});

describe("every saved-row scoring read includes the v1.12.0 columns", () => {
  test("the selects that feed businessRowToScoringInput name V112_SCORING_COLUMNS", () => {
    for (const file of ["app/actions/scoring.ts", "app/actions/website.ts", "app/actions/actionPlan.ts", "app/actions/reviews.ts", "app/actions/businesses.ts", "app/api/cron/monthly-reports/route.ts"]) {
      expect(fs.readFileSync(file, "utf-8"), file).toContain("${V112_SCORING_COLUMNS}`");
    }
  });
});

describe("customer details — ✓/✗ per part, why they count, and the owner's answers", () => {
  const row = { ...ROW, listing_has_accessibility: false, listing_has_payment: true, listing_has_parking: false, pure_service_area_business: false };
  const cd = (r: Record<string, unknown>, locale: "en" | "es" = "en") => scoreBusiness(businessRowToScoringInput(r as typeof ROW), locale).checks.find((c) => c.id === "completeness.customer_details")!;

  test("a bakery: every part shown with ✓/✗, and why all three count — EN + ES", () => {
    expect(cd(row)).toMatchObject({
      earnedPoints: 1,
      explanation: "Accessibility ✗ · Payment options ✓ · Parking ✗. All three count: customers visit and pay at a business like yours.",
      meta: { parts: "accessibility,payment,parking", ownerRemoved: "", ownerCanRemove: "payment,parking", present: "payment" },
    });
    expect(cd(row, "es").explanation).toBe("Accesibilidad ✗ · Formas de pago ✓ · Estacionamiento ✗. Cuentan las tres: los clientes visitan y pagan en un negocio como el suyo.");
  });

  test("a law office: only accessibility, and it says why", () => {
    const law = { ...row, categories: ["lawyer"], category: "Lawyer", primary_type: "lawyer", name: "Smith Law" };
    expect(cd(law)).toMatchObject({ earnedPoints: 0, explanation: "Accessibility ✗. Only accessibility counts for an office like yours — payment and parking aren't scored.", meta: { ownerCanRemove: "" } });
  });

  test("owner: \"No parking available\" removes parking (Added by you); no payments on site removes payment", () => {
    const noParking = cd({ ...row, owner_no_parking: true });
    expect(noParking.earnedPoints).toBe(1.5);
    expect(noParking.explanation).toBe("Accessibility ✗ · Payment options ✓. Counted for your business: Accessibility, Payment options. Parking isn't scored — you told us there's no parking (Added by you).");
    expect(noParking.meta).toMatchObject({ parts: "accessibility,payment", ownerRemoved: "parking", ownerCanRemove: "payment,parking" });
    const both = cd({ ...row, owner_no_parking: true, owner_no_payment: true });
    expect(both).toMatchObject({ earnedPoints: 0, meta: { parts: "accessibility", ownerRemoved: "payment,parking" } });
    expect(cd({ ...row, owner_no_payment: true }, "es").explanation).toContain("usted nos indicó que no recibe pagos en el lugar (Agregado por usted)");
    // Accessibility can never be removed, so the check never disappears.
    expect(customerDetailsRuleFor("bakery", false, { noParking: true, noPayment: true }).parts).toEqual(["accessibility"]);
  });

  test("no storefront: parking isn't scored, and the owner can't remove what's already out", () => {
    const rule = customerDetailsRuleFor("restaurant", true, { noParking: true });
    expect(rule).toMatchObject({ parts: ["accessibility", "payment"], serviceAreaNoParking: true, ownerRemoved: [], ownerCanRemove: ["payment"] });
    expect(cd({ ...row, pure_service_area_business: true }).explanation).toContain("Parking isn't scored — you serve customers at their location.");
  });

  test("the advice says exactly where to add them — EN + ES", () => {
    const { suggestions } = getScoreWithSuggestions(businessRowToScoringInput(row as typeof ROW));
    expect(suggestions.find((s) => s.checkId === "completeness.customer_details")!.advice).toBe("Add them on Google: Google Business Profile → Edit profile → accessibility / payments / parking.");
  });
});
