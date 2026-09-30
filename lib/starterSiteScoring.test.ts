import { describe, expect, test } from "vitest";
import { businessRowToScoringInput, scoreBusiness, type BusinessScoringRow } from "./scoring";
import { rawWeightedTotal } from "./actionPlan";
import {
  buildTemplateScoringInput,
  estimateStarterSiteRange,
  TEMPLATE_HOSTING_HIGH,
  TEMPLATE_HOSTING_LOW,
  TEMPLATE_HOSTING_UNKNOWN,
  type StarterSiteTemplateData,
} from "./starterSiteScoring";

const NO_WEBSITE_ROW: BusinessScoringRow = {
  rating: 3.2,
  review_count: 8,
  phone: "+1-555-000-0000",
  address: "123 Main St",
  opening_hours: ["Mon-Fri 9-5"],
  website: null,
  categories: ["hair_salon"],
  category: "Hair Salon",
  photo_count: 4,
  business_status: "OPERATIONAL",
  https_status: null,
  website_analysis_json: null,
};

const DATA: StarterSiteTemplateData = {
  businessName: "Test Salon",
  category: "Hair Salon",
  phone: "+1-555-000-0000",
  address: "123 Main St",
  openingHours: ["Mon-Fri 9-5"],
  rating: 3.2,
  reviewCount: 8,
  googleMapsUri: "https://maps.google.com/?cid=123",
  profileId: "salon",
};

describe("buildTemplateScoringInput", () => {
  test("LOW hosting excludes both HTTPS and mobile performance", () => {
    const input = buildTemplateScoringInput(NO_WEBSITE_ROW, DATA, "en", TEMPLATE_HOSTING_LOW);
    expect(input.website).toBe("https://example.com");
    expect(input.httpsStatus).toBeNull();
    expect(input.websiteAnalysis?.mobilePerformanceScore).toBeNull();
    // Content signals ARE real — the template's own generated HTML.
    expect(input.websiteAnalysis?.content?.hasTitle).toBe(true);
  });

  test("HIGH hosting includes real HTTPS and a full mobile performance score", () => {
    const input = buildTemplateScoringInput(NO_WEBSITE_ROW, DATA, "en", TEMPLATE_HOSTING_HIGH);
    expect(input.httpsStatus).toBe("https");
    expect(input.websiteAnalysis?.mobilePerformanceScore).toBe(100);
  });

  test("the default (UNKNOWN) hosting matches the Website page's own existing builder-offer estimate", () => {
    const input = buildTemplateScoringInput(NO_WEBSITE_ROW, DATA, "en", TEMPLATE_HOSTING_UNKNOWN);
    expect(input.httpsStatus).toBe("https");
    expect(input.websiteAnalysis?.mobilePerformanceScore).toBeNull();
  });
});

describe("estimateStarterSiteRange", () => {
  test("HIGH is always at least as large as LOW — HTTPS and full mobile performance only ever add points", () => {
    const baseline = scoreBusiness(businessRowToScoringInput(NO_WEBSITE_ROW));
    const range = estimateStarterSiteRange(baseline, NO_WEBSITE_ROW, DATA, "en");
    expect(range.high).toBeGreaterThanOrEqual(range.low);
    expect(range.low).toBeGreaterThan(0); // the template guarantees a real, positive gain
  });

  test("both ends are real scoreBusiness() diffs, not hand-estimated — LOW/HIGH overlays reproduce the same numbers", () => {
    const baseline = scoreBusiness(businessRowToScoringInput(NO_WEBSITE_ROW));
    const range = estimateStarterSiteRange(baseline, NO_WEBSITE_ROW, DATA, "en");

    const before = rawWeightedTotal(baseline);
    const realInput = businessRowToScoringInput(NO_WEBSITE_ROW);

    const lowAfter = rawWeightedTotal(scoreBusiness({ ...realInput, ...range.lowOverlay }));
    const highAfter = rawWeightedTotal(scoreBusiness({ ...realInput, ...range.highOverlay }));

    expect(Math.max(0, lowAfter - before)).toBeCloseTo(range.low, 5);
    expect(Math.max(0, highAfter - before)).toBeCloseTo(range.high, 5);
  });

  test("the overlays only ever touch website-related fields — a business's other real facts (rating, reviews, completeness) are untouched", () => {
    const baseline = scoreBusiness(businessRowToScoringInput(NO_WEBSITE_ROW));
    const range = estimateStarterSiteRange(baseline, NO_WEBSITE_ROW, DATA, "en");
    const keys = new Set([...Object.keys(range.lowOverlay), ...Object.keys(range.highOverlay)]);
    expect(keys).toEqual(new Set(["website", "httpsStatus", "websiteAnalysis"]));
  });
});
