import { describe, expect, test } from "vitest";
import { buildFaqDraft, buildGooglePostDraft, buildShareCaption, redemptionLabel } from "./promos";

describe("redemptionLabel", () => {
  test("is honest about zero rather than hiding it", () => {
    expect(redemptionLabel(0)).toBe("No redemptions logged yet");
  });

  test("singularizes exactly one", () => {
    expect(redemptionLabel(1)).toBe("1 redemption logged");
  });

  test("pluralizes more than one", () => {
    expect(redemptionLabel(4)).toBe("4 redemptions logged");
  });
});

describe("buildShareCaption", () => {
  test("includes offer, business name, code, and expiry", () => {
    const caption = buildShareCaption({
      businessName: "Rosa's Cafe",
      offer: "10% off your next visit",
      code: "7K4M-QX2P",
      expiryLabel: "Expires Dec 31, 2026",
    });
    expect(caption).toContain("10% off your next visit");
    expect(caption).toContain("Rosa's Cafe");
    expect(caption).toContain("7K4M-QX2P");
    expect(caption).toContain("Expires Dec 31, 2026");
  });

  test("includes phone only when given", () => {
    const withPhone = buildShareCaption({
      businessName: "Rosa's Cafe",
      offer: "10% off",
      code: "ABCD-1234",
      expiryLabel: "Expires Dec 31, 2026",
      phone: "(555) 123-4567",
    });
    expect(withPhone).toContain("(555) 123-4567");

    const withoutPhone = buildShareCaption({
      businessName: "Rosa's Cafe",
      offer: "10% off",
      code: "ABCD-1234",
      expiryLabel: "Expires Dec 31, 2026",
    });
    expect(withoutPhone).not.toContain("Call");
  });
});

describe("buildGooglePostDraft", () => {
  test("is draft text, not a claim that it was posted", () => {
    const draft = buildGooglePostDraft({
      businessName: "Rosa's Cafe",
      offer: "10% off your next visit",
      code: "ABCD-1234",
      expiryLabel: "Expires Dec 31, 2026",
    });
    expect(draft).toContain("Rosa's Cafe");
    expect(draft).toContain("ABCD-1234");
    expect(draft).toContain("Expires Dec 31, 2026");
  });
});

describe("buildFaqDraft", () => {
  test("includes offer, code, and expiry in Q&A form", () => {
    const draft = buildFaqDraft({
      businessName: "Rosa's Cafe",
      offer: "10% off your next visit",
      code: "ABCD-1234",
      expiryLabel: "Expires Dec 31, 2026",
    });
    expect(draft).toContain("Q:");
    expect(draft).toContain("ABCD-1234");
    expect(draft).toContain("Expires Dec 31, 2026");
    expect(draft).not.toContain("Are there any restrictions?");
  });

  test("adds a restrictions Q&A only when terms are given", () => {
    const draft = buildFaqDraft({
      businessName: "Rosa's Cafe",
      offer: "10% off",
      code: "ABCD-1234",
      expiryLabel: "Expires Dec 31, 2026",
      terms: "One per customer.",
    });
    expect(draft).toContain("Are there any restrictions?");
    expect(draft).toContain("One per customer.");
  });
});
