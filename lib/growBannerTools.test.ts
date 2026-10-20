import { describe, expect, test } from "vitest";
import { buildGrowBannerTools, reviewToolHref } from "./growBannerTools";

describe("buildGrowBannerTools", () => {
  const businessId = "biz-123";
  const tools = buildGrowBannerTools(businessId, { referralOk: true, couponsOk: true, pricingOk: true });

  test("builds exactly five tiles, in order, when referralOk is true (Review QR is the featured Reviews tile's button)", () => {
    expect(tools.map((tool) => tool.labelKey)).toEqual([
      "dashboard.overview.growBanner.tools.coupons.shortLabel",
      "dashboard.overview.growBanner.tools.referral.shortLabel",
      "dashboard.overview.growBanner.tools.weeklyRoutine.shortLabel",
      "dashboard.overview.growBanner.tools.priceCheck.shortLabel",
      "dashboard.overview.growBanner.tools.competitorCheck.shortLabel",
    ]);
    expect(tools.every((tool) => tool.descKey.endsWith(".desc"))).toBe(true);
  });

  test("Coupons opens the Growth page with the coupon builder tab", () => {
    const tool = tools.find((t) => t.labelKey === "dashboard.overview.growBanner.tools.coupons.shortLabel");
    expect(tool?.href).toBe(`/business/${businessId}/campaigns?tab=coupons`);
  });

  test("Referrals opens the Growth page with the referral tab", () => {
    const tool = tools.find((t) => t.labelKey === "dashboard.overview.growBanner.tools.referral.shortLabel");
    expect(tool?.href).toBe(`/business/${businessId}/campaigns?tab=referrals`);
  });

  test("Weekly routine opens the Growth page scrolled to the weekly routine section", () => {
    const tool = tools.find((t) => t.labelKey === "dashboard.overview.growBanner.tools.weeklyRoutine.shortLabel");
    expect(tool?.href).toBe(`/business/${businessId}/growth#weekly-routine`);
  });

  test("Price check opens the Pricing page", () => {
    const tool = tools.find((t) => t.labelKey === "dashboard.overview.growBanner.tools.priceCheck.shortLabel");
    expect(tool?.href).toBe(`/business/${businessId}/pricing`);
  });

  test("the Reviews tile's button opens the Reviews page at the get-more-reviews section (same link as before)", () => {
    expect(reviewToolHref(businessId)).toBe(`/business/${businessId}/website-reviews#get-more-reviews`);
  });

  test("Competitors opens the Competitors page", () => {
    const tool = tools.find((t) => t.labelKey === "dashboard.overview.growBanner.tools.competitorCheck.shortLabel");
    expect(tool?.href).toBe(`/business/${businessId}/competitors`);
  });
});

describe("buildGrowBannerTools — referralOk gating", () => {
  const businessId = "biz-123";

  test("omits the Referrals tile (4 tiles) when referralOk is false — e.g. lawyer, where referral-fee arrangements are professionally restricted", () => {
    const tools = buildGrowBannerTools(businessId, { referralOk: false, couponsOk: true, pricingOk: true });
    expect(tools).toHaveLength(4);
    expect(tools.map((tool) => tool.labelKey)).not.toContain(
      "dashboard.overview.growBanner.tools.referral.shortLabel"
    );
    expect(tools.map((tool) => tool.labelKey)).toEqual([
      "dashboard.overview.growBanner.tools.coupons.shortLabel",
      "dashboard.overview.growBanner.tools.weeklyRoutine.shortLabel",
      "dashboard.overview.growBanner.tools.priceCheck.shortLabel",
      "dashboard.overview.growBanner.tools.competitorCheck.shortLabel",
    ]);
  });

  test("includes the Referrals tile (5 tiles) when referralOk is true — unchanged from before this flag existed", () => {
    const tools = buildGrowBannerTools(businessId, { referralOk: true, couponsOk: true, pricingOk: true });
    expect(tools).toHaveLength(5);
    expect(tools.map((tool) => tool.labelKey)).toContain(
      "dashboard.overview.growBanner.tools.referral.shortLabel"
    );
  });
});

describe("a place of worship (no coupons, referrals or price check)", () => {
  test("only the tools that apply are offered", () => {
    const tools = buildGrowBannerTools("b1", { referralOk: false, couponsOk: false, pricingOk: false });
    const hrefs = tools.map((tool) => tool.href);
    expect(hrefs.some((h) => h.includes("tab=coupons"))).toBe(false);
    expect(hrefs.some((h) => h.includes("tab=referral"))).toBe(false);
    expect(hrefs.some((h) => h.endsWith("/pricing"))).toBe(false);
    expect(hrefs.some((h) => h.includes("#weekly-routine"))).toBe(true);
  });
});

describe("the featured Reviews tile: real numbers only — EN + ES", () => {
  test("vs. the nearby average when a saved scan has one; otherwise the count alone; none yet", async () => {
    const { reviewStatLine } = await import("@/components/overview/GrowMoreCustomers");
    expect(reviewStatLine(15, 120, "en")).toBe("15 reviews — businesses near you average 120");
    expect(reviewStatLine(1, 120, "en")).toBe("1 review — businesses near you average 120");
    expect(reviewStatLine(15, null, "en")).toBe("15 reviews · each new one helps your rating count fully");
    expect(reviewStatLine(null, 120, "en")).toBe("No Google reviews yet — your first ones count the most");
    expect(reviewStatLine(15, 120, "es")).toBe("15 reseñas: los negocios de su zona tienen 120 en promedio");
    expect(reviewStatLine(1_250, null, "en")).toBe("1,250 reviews · each new one helps your rating count fully");
  });
});
