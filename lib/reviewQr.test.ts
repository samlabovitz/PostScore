import { describe, expect, it } from "vitest";
import { reviewQrGeometry } from "@/lib/reviewQr";
import { buildGoogleReviewUrl } from "@/lib/reviews";
import { scanQr } from "@/lib/qrRaster.testUtil";

// Real-shaped place ids (27 chars, like Google's), plus a long one.
const URLS = [
  buildGoogleReviewUrl("ChIJN1t_tDeuEmsRUsoyG83frY4"),
  buildGoogleReviewUrl("ChIJ-7rD5w1Zw4kR0x3yZ6fLqA8"),
  buildGoogleReviewUrl("EiQxMjMgTWFpbiBTdCwgTmV3YXJrLCBOSiAwNzEwMiwgVVNBIjESLwoUChIJ"),
];

describe("review QR", () => {
  it.each(URLS)("decodes back to exactly the copied link (no badge): %s", (url) => {
    expect(scanQr(url, false)).toBe(url);
  });

  it.each(URLS)("decodes back to exactly the copied link with the center star badge: %s", (url) => {
    expect(scanQr(url, true)).toBe(url);
  });

  it("still decodes from a coarse, non-antialiased render (5 px per module)", () => {
    expect(scanQr(URLS[0], true, 5)).toBe(URLS[0]);
  });

  it("uses the highest error-correction level when the badge covers the center", () => {
    // Level H needs a bigger symbol for the same data than level M.
    const plain = reviewQrGeometry(URLS[0], { badge: false });
    const badged = reviewQrGeometry(URLS[0], { badge: true });
    expect(badged.size).toBeGreaterThan(plain.size);
    expect(badged.badge).not.toBeNull();
    expect(plain.badge).toBeNull();
  });
});
