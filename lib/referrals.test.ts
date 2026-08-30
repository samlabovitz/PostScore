import { describe, expect, test } from "vitest";
import { buildReferralShareCaption } from "./referrals";

describe("buildReferralShareCaption", () => {
  test("includes the business name, both rewards, and the code", () => {
    const caption = buildReferralShareCaption({
      businessName: "Rosa's Cafe",
      referrerReward: "$15 off your next visit",
      friendReward: "20% off their first visit",
      code: "7K4M-QX2P",
    });
    expect(caption).toContain("Rosa's Cafe");
    expect(caption).toContain("$15 off your next visit");
    expect(caption).toContain("20% off their first visit");
    expect(caption).toContain("7K4M-QX2P");
  });

  test("includes phone only when given", () => {
    const withPhone = buildReferralShareCaption({
      businessName: "Rosa's Cafe",
      referrerReward: "$15 off",
      friendReward: "20% off",
      code: "ABCD-1234",
      phone: "(555) 123-4567",
    });
    expect(withPhone).toContain("(555) 123-4567");

    const withoutPhone = buildReferralShareCaption({
      businessName: "Rosa's Cafe",
      referrerReward: "$15 off",
      friendReward: "20% off",
      code: "ABCD-1234",
    });
    expect(withoutPhone).not.toContain("Call");
  });
});
