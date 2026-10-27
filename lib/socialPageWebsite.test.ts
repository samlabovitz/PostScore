import { describe, expect, test } from "vitest";
import fs from "node:fs";
import { businessWebsiteUrl, isWebsiteVerifiedElsewhereOnly, listingSocialPlatform } from "@/lib/businessWebsite";
import { generateSuggestions, isRealWebsite, scoreBusiness, type BusinessScoringInput } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";

// Day 16: a Facebook/Instagram/other social link in a Google listing's
// website field is NOT a website — for owners and competitors alike. It
// counts toward Social media links instead.

const FB = "https://www.facebook.com/RedBowlNewark";

function check(input: BusinessScoringInput, id: string, locale: "en" | "es" = "en") {
  return scoreBusiness(input, locale).checks.find((c) => c.id === id)!;
}

describe("owner: a social page on the listing is not a website", () => {
  test("businessWebsiteUrl never returns a social page; a real site verified elsewhere still counts", () => {
    expect(businessWebsiteUrl({ website: FB })).toBeNull();
    expect(businessWebsiteUrl({ website: "instagram.com/redbowl" })).toBeNull();
    expect(businessWebsiteUrl({ website: FB, verified_website_url: "https://redbowl.com" })).toBe("https://redbowl.com");
    expect(isWebsiteVerifiedElsewhereOnly({ website: FB, verified_website_url: "https://redbowl.com" })).toBe(true);
    expect(businessWebsiteUrl({ website: "https://redbowl.com" })).toBe("https://redbowl.com");
    expect(listingSocialPlatform({ website: FB })).toBe("Facebook");
  });

  test("'Has a website' says so, with the fix (EN + ES)", () => {
    const input = scoringInput({ website: FB, websiteAnalysis: null, verifiedElsewhereUrl: null });
    const has = check(input, "website.has_website");
    expect(has.earnedPoints).toBe(0);
    expect(has.explanation).toContain("Your Google listing links to your Facebook page, not a website");
    // The listing's "website link" doesn't count it either.
    const link = check(input, "completeness.website_link");
    expect(link.earnedPoints).toBe(0);
    expect(link.explanation).toBe("Your Google listing links to your Facebook page, not a website.");
    const fix = generateSuggestions(scoreBusiness(input, "en"), "en").find((s) => s.checkId === "website.has_website");
    expect(fix?.advice).toBe("Add a real website (or your PostScore starter site) to your listing.");
    expect(check(input, "website.has_website", "es").explanation).toContain("Su ficha de Google enlaza a su página de Facebook, no a un sitio web");
    expect(generateSuggestions(scoreBusiness(input, "es"), "es").find((s) => s.checkId === "website.has_website")?.advice).toBe(
      "Agregue un sitio web real (o su sitio inicial de PostScore) a su ficha."
    );
  });

  test("Social media links: counted, but a social page alone never earns website points", () => {
    const fbOnly = scoringInput({ website: FB, websiteAnalysis: null, verifiedElsewhereUrl: null });
    const social = check(fbOnly, "website.social_links");
    expect(social.earnedPoints).toBeNull();
    expect(social.explanation).toContain("Your Google listing links to your Facebook page — that counts as your social profile");
    // Same score as a listing with no website at all.
    const none = scoringInput({ website: null, websiteAnalysis: null, verifiedElsewhereUrl: null });
    expect(scoreBusiness(fbOnly).total).toBe(scoreBusiness(none).total);
  });

  test("with a real site verified elsewhere, the listing's Facebook link earns Social media links", () => {
    const base = scoringInput();
    const input = scoringInput({
      website: FB,
      verifiedElsewhereUrl: "https://redbowl.com",
      websiteAnalysis: { ...base.websiteAnalysis!, content: { ...base.websiteAnalysis!.content!, socialProfiles: [] } },
    });
    const social = check(input, "website.social_links");
    expect(social.earnedPoints).toBe(1);
    expect(social.explanation).toContain(`Facebook: ${FB}`);
  });
});

describe("competitors: the same rule", () => {
  test("a competitor whose listing links to Instagram has no website and scores like one without", () => {
    expect(isRealWebsite("https://instagram.com/rivalnoodles")).toBe(false);
    expect(isRealWebsite("https://rivalnoodles.com")).toBe(true);
    // Competitors are scored with the same engine (no site analysis).
    const ig = scoringInput({ website: "https://instagram.com/rivalnoodles", websiteAnalysis: null, verifiedElsewhereUrl: null });
    const none = scoringInput({ website: null, websiteAnalysis: null, verifiedElsewhereUrl: null });
    expect(check(ig, "website.has_website").earnedPoints).toBe(0);
    expect(scoreBusiness(ig).total).toBe(scoreBusiness(none).total);
    // The saved competitor row's has_website uses the same rule.
    expect(fs.readFileSync("lib/competitors.ts", "utf8")).toContain("hasWebsite: isRealWebsite(place.website),");
  });
});
