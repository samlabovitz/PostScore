import { describe, expect, test } from "vitest";
import { buildRedeemUrl, defaultExpiryDate, formatExpiry, generateCouponCode } from "./coupons";

describe("generateCouponCode", () => {
  test("matches XXXX-XXXX using only the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateCouponCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    }
  });

  test("is not constant", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateCouponCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("buildRedeemUrl", () => {
  test("joins the real origin with /redeem/<code>", () => {
    expect(buildRedeemUrl("https://app.postscore.example", "ABCD-1234")).toBe(
      "https://app.postscore.example/redeem/ABCD-1234"
    );
  });
});

describe("defaultExpiryDate", () => {
  test("adds the given number of days, in UTC-safe ISO form", () => {
    expect(defaultExpiryDate(60, new Date(Date.UTC(2026, 0, 1)))).toBe("2026-03-02");
  });

  test("is honest about the day count crossing a year boundary", () => {
    expect(defaultExpiryDate(10, new Date(Date.UTC(2026, 11, 28)))).toBe("2027-01-07");
  });
});

describe("formatExpiry", () => {
  test("formats an ISO date honestly, in UTC regardless of local timezone", () => {
    expect(formatExpiry("2026-12-31")).toBe("Expires Dec 31, 2026");
  });

  test("is honest about an unset date rather than showing a fake one", () => {
    expect(formatExpiry("")).toBe("No expiration set yet");
  });
});
