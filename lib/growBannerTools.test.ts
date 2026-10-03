import { describe, expect, test } from "vitest";
import { buildGrowBannerTools } from "./growBannerTools";

describe("buildGrowBannerTools", () => {
  const businessId = "biz-123";
  const tools = buildGrowBannerTools(businessId, true);

  test("builds exactly six chips, in order, when referralOk is true", () => {
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

describe("buildGrowBannerTools — referralOk gating", () => {
  const businessId = "biz-123";

  test("omits the Referrals chip (5 chips) when referralOk is false — e.g. lawyer, where referral-fee arrangements are professionally restricted", () => {
    const tools = buildGrowBannerTools(businessId, false);
    expect(tools).toHaveLength(5);
    expect(tools.map((tool) => tool.labelKey)).not.toContain(
      "dashboard.overview.growBanner.tools.referral.shortLabel"
    );
    expect(tools.map((tool) => tool.labelKey)).toEqual([
      "dashboard.overview.growBanner.tools.coupons.shortLabel",
      "dashboard.overview.growBanner.tools.weeklyRoutine.shortLabel",
      "dashboard.overview.growBanner.tools.priceCheck.shortLabel",
      "dashboard.overview.growBanner.tools.reviewQrSign.shortLabel",
      "dashboard.overview.growBanner.tools.competitorCheck.shortLabel",
    ]);
  });

  test("includes the Referrals chip (6 chips) when referralOk is true — unchanged from before this flag existed", () => {
    const tools = buildGrowBannerTools(businessId, true);
    expect(tools).toHaveLength(6);
    expect(tools.map((tool) => tool.labelKey)).toContain(
      "dashboard.overview.growBanner.tools.referral.shortLabel"
    );
  });
});
