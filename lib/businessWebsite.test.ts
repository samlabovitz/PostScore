import { describe, expect, test } from "vitest";
import { businessWebsiteUrl, isWebsiteVerifiedElsewhereOnly } from "./businessWebsite";

describe("businessWebsiteUrl (Step 2d shared website source)", () => {
  test("the listing's own URL wins when present", () => {
    expect(businessWebsiteUrl({ website: "https://a.com", verified_website_url: "https://b.com" })).toBe("https://a.com");
    expect(isWebsiteVerifiedElsewhereOnly({ website: "https://a.com", verified_website_url: "https://b.com" })).toBe(false);
  });
  test("falls back to a verified-elsewhere site (the real Bánh Mì Boy case)", () => {
    expect(businessWebsiteUrl({ website: null, verified_website_url: "https://banhmiboy.com" })).toBe("https://banhmiboy.com");
    expect(isWebsiteVerifiedElsewhereOnly({ website: null, verified_website_url: "https://banhmiboy.com" })).toBe(true);
  });
  test("null when there's truly no website; blank strings don't count", () => {
    expect(businessWebsiteUrl({ website: null, verified_website_url: null })).toBeNull();
    expect(businessWebsiteUrl({ website: "  ", verified_website_url: "" })).toBeNull();
    expect(businessWebsiteUrl({})).toBeNull();
  });
});
