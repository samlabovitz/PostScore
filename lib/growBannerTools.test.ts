import { describe, expect, test } from "vitest";
import { buildGrowBannerTools } from "./growBannerTools";

describe("buildGrowBannerTools", () => {
  const businessId = "biz-123";
  const tools = buildGrowBannerTools(businessId);

  test("builds exactly six chips, in order", () => {
    expect(tools.map((tool) => tool.labelKey)).toEqual([
      "dashboard.overview.growBanner.tools.coupons.shortLabel",
      "dashboard.overview.growBanner.tools.referral.shortLabel",
      "dashboard.overview.growBanner.tools.weeklyRoutine.shortLabel",
      "dashboard.overview.growBanner.tools.priceCheck.shortLabel",
      "dashboard.overview.growBanner.tools.reviewQrSign.shortLabel",
      "dashboard.overview.growBanner.tools.competitorCheck.shortLabel",
    ]);
  });

  test("Coupons opens the Growth page with the coupon builder tab", () => {
    const tool = tools.find((t) => t.labelKey === "dashboard.overview.growBanner.tools.coupons.shortLabel");
    expect(tool?.href).toBe(`/business/${businessId}/growth?tab=coupons`);
  });

  test("Referrals opens the Growth page with the referral tab", () => {
    const tool = tools.find((t) => t.labelKey === "dashboard.overview.growBanner.tools.referral.shortLabel");
    expect(tool?.href).toBe(`/business/${businessId}/growth?tab=referral`);
  });

  test("Weekly routine opens the Growth page scrolled to the weekly routine section", () => {
    const tool = tools.find((t) => t.labelKey === "dashboard.overview.growBanner.tools.weeklyRoutine.shortLabel");
    expect(tool?.href).toBe(`/business/${businessId}/growth#weekly-routine`);
  });

  test("Price check opens the Pricing page", () => {
    const tool = tools.find((t) => t.labelKey === "dashboard.overview.growBanner.tools.priceCheck.shortLabel");
    expect(tool?.href).toBe(`/business/${businessId}/pricing`);
  });

  test("Review QR opens the Reviews page scrolled to the get-more-reviews section", () => {
    const tool = tools.find((t) => t.labelKey === "dashboard.overview.growBanner.tools.reviewQrSign.shortLabel");
    expect(tool?.href).toBe(`/business/${businessId}/website-reviews#get-more-reviews`);
  });

  test("Competitors opens the Competitors page", () => {
    const tool = tools.find((t) => t.labelKey === "dashboard.overview.growBanner.tools.competitorCheck.shortLabel");
    expect(tool?.href).toBe(`/business/${businessId}/competitors`);
  });
});
