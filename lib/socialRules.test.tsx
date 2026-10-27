import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { businessRowToScoringInput, generateSuggestions, scoreBusiness, SCORING_VERSION, type BusinessScoringInput, type SocialProfile } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { socialPagePlatform } from "./websiteTrust";
import { checkSocialProfiles, classifySocialLink, MAX_SOCIAL_LINK_CHECKS } from "./socialLinkCheck";
import { detectSocialProfiles } from "./websiteContentAnalysis";
import { websiteFixesFor } from "./websiteFixes";

vi.mock("@/app/actions/competitors", () => ({ refreshCompetitors: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { CompetitorsView } from "@/app/business/[id]/competitors/CompetitorsView";

const check = (input: BusinessScoringInput, id: string, locale: "en" | "es" = "en") => scoreBusiness(input, locale).checks.find((c) => c.id === id)!;

describe("rule 1 — a social media page is not a website", () => {
  test("version bumped (this changes scores)", () => {
    expect(SCORING_VERSION).toBe("1.11.0");
  });

  test("platforms are named from the address", () => {
    expect(socialPagePlatform("https://www.facebook.com/MyCafe")).toBe("Facebook");
    expect(socialPagePlatform("instagram.com/mycafe")).toBe("Instagram");
    expect(socialPagePlatform("https://linktr.ee/mycafe")).toBe("Linktree");
    expect(socialPagePlatform("https://m.yelp.com/biz/my-cafe")).toBe("Yelp");
    expect(socialPagePlatform("https://mycafe.com")).toBeNull();
    expect(socialPagePlatform("https://sites.google.com/view/mycafe")).toBeNull();
  });

  test("listing links to Facebook → 'Has a website' 0 with the named explanation (EN + ES)", () => {
    const input = { ...scoringInput(), website: "https://www.facebook.com/MyCafe" };
    const en = check(input, "website.has_website");
    expect(en.earnedPoints).toBe(0);
    expect(en.explanation).toBe(
      "Your Google listing links to your Facebook page, not a website. A Facebook page doesn't count as a website — customers can't find your full info, and you don't control it."
    );
    expect(en.meta).toEqual({ socialPlatform: "Facebook" });
    expect(check(input, "website.has_website", "es").explanation).toMatch(/^Su ficha de Google enlaza a su página de Facebook, no a un sitio web/);
  });

  test("the website checks that need a real site become not applicable (never scored on the Facebook page)", () => {
    const input = { ...scoringInput(), website: "https://instagram.com/mycafe" };
    for (const id of ["website.https", "website.performance_mobile", "website.content_depth", "website.contact_conversion", "website.social_links"]) {
      expect(check(input, id).earnedPoints, id).toBeNull();
    }
  });

  test("the top fix is 'Get a website' — PostScore can do this for you (starter site)", () => {
    const input = { ...scoringInput(), website: "https://linktr.ee/mycafe" };
    const advice = generateSuggestions(scoreBusiness(input)).find((s) => s.checkId === "website.has_website")!.advice;
    expect(advice).toBe("Add a real website (or your PostScore starter site) to your listing.");
    expect(websiteFixesFor(check(input, "website.has_website"), null)[0].kind).toBe("postscore_does");
  });

  test("a real site verified elsewhere still counts; a 'verified' social page doesn't", () => {
    expect(check({ ...scoringInput(), website: "https://facebook.com/x", verifiedElsewhereUrl: "https://mycafe.com" }, "website.has_website").earnedPoints).toBe(4);
    expect(check({ ...scoringInput(), website: null, verifiedElsewhereUrl: "https://facebook.com/x" }, "website.has_website").earnedPoints).toBe(0);
  });

  test("competitors too: scored the same way from their listing, labeled '{platform} page only'", () => {
    const competitor = businessRowToScoringInput({
      rating: 4.5, review_count: 40, phone: "555", address: "1 Main St", opening_hours: ["Mon 9-5"], website: "https://www.facebook.com/RivalCafe",
      categories: ["cafe"], category: "Cafe", photo_count: 10, business_status: "OPERATIONAL", https_status: null, website_analysis_json: null,
    } as never);
    const breakdown = scoreBusiness(competitor);
    expect(breakdown.checks.find((c) => c.id === "website.has_website")!.earnedPoints).toBe(0);
    const data = {
      status: "ok" as const, businessName: "Me", businessAddress: null, language: "en", competitorNoun: "cafes",
      latest: {
        scanId: "s", createdAt: "2026-10-16T12:00:00Z",
        entries: [
          { placeId: "me", name: "Me", isSubject: true, address: null, distanceMeters: null, rating: 4.6, reviewCount: 50, hasWebsite: true, total: 80, grade: "B", scoringVersion: "1.11.0", breakdown: scoreBusiness(scoringInput()), priceLevel: null, photoCount: 10, websiteUrl: "https://example.com" },
          { placeId: "r", name: "Rival Cafe", isSubject: false, address: null, distanceMeters: 300, rating: 4.5, reviewCount: 40, hasWebsite: false, total: breakdown.total, grade: breakdown.grade, scoringVersion: "1.11.0", breakdown, priceLevel: null, photoCount: 10, websiteUrl: null },
        ],
      },
      rankHistory: [], refresh: { allowed: true, nextAvailableAt: null }, scanBlocker: null, comparedViaTypes: [], scoring: null, timeZone: "America/New_York",
    };
    const html = renderToStaticMarkup(<LocaleProvider locale="en"><CompetitorsView businessId="b" data={data} /></LocaleProvider>);
    expect(html).toContain("Facebook page only");
  });
});

describe("rule 2 — social links must lead to a real profile", () => {
  const OWN = "https://www.mycafe.com/";

  test("already rejected without any request: share buttons, platform homepages, login pages, builder accounts", () => {
    const html = [
      '<a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>',
      '<a href="https://www.instagram.com/">IG</a>',
      '<a href="https://www.facebook.com/login.php">FB</a>',
      '<a href="https://twitter.com/intent/tweet?text=x">Tweet</a>',
      '<a href="https://www.instagram.com/wix">Made with Wix</a>',
      '<a href="/instagram">Our Instagram</a>',
    ].join("");
    expect(detectSocialProfiles(html)).toEqual([]);
  });

  test("ends on the platform → profile (counts)", () => {
    expect(classifySocialLink({ finalUrl: "https://www.instagram.com/mycafe/", httpStatus: 200, ownSiteUrl: OWN })).toBe("profile");
  });

  test("redirects back to the business's own site → own_site, with the explanation", () => {
    expect(classifySocialLink({ finalUrl: "https://mycafe.com/home", httpStatus: 200, ownSiteUrl: OWN })).toBe("own_site");
    const input = withProfiles([{ platform: "Instagram", url: "instagram.com/mycafe", check: { result: "own_site", finalUrl: "https://mycafe.com/", httpStatus: 200, checkedAt: "x" } }]);
    const c = check(input, "website.social_links");
    expect(c.earnedPoints).toBe(0);
    expect(c.explanation).toBe("Your Instagram link sends visitors back to your website instead of your Instagram profile.");
  });

  test("redirects to an unrelated site → elsewhere (doesn't count)", () => {
    expect(classifySocialLink({ finalUrl: "https://spammy-ads.example/landing", httpStatus: 200, ownSiteUrl: OWN })).toBe("elsewhere");
  });

  test("the platform blocks us → unconfirmed, still counts, said honestly", () => {
    expect(classifySocialLink({ finalUrl: "https://www.instagram.com/accounts/login/?next=/mycafe/", httpStatus: 200, ownSiteUrl: OWN })).toBe("unconfirmed");
    expect(classifySocialLink({ finalUrl: "https://www.linkedin.com/company/mycafe", httpStatus: 999, ownSiteUrl: OWN })).toBe("unconfirmed");
    expect(classifySocialLink({ finalUrl: "https://www.facebook.com/mycafe", httpStatus: 429, ownSiteUrl: OWN })).toBe("unconfirmed");
    expect(classifySocialLink({ finalUrl: null, httpStatus: null, ownSiteUrl: OWN })).toBe("unconfirmed");
    const c = check(withProfiles([{ platform: "Facebook", url: "facebook.com/mycafe", check: { result: "unconfirmed", finalUrl: null, httpStatus: null, checkedAt: "x" } }]), "website.social_links");
    expect(c.earnedPoints).toBe(1);
    expect(c.explanation).toContain("facebook.com/mycafe (link looks right — we couldn't open it to confirm)");
  });

  test("the platform says the page doesn't exist (404) → not_found", () => {
    expect(classifySocialLink({ finalUrl: "https://www.tiktok.com/@nobody", httpStatus: 404, ownSiteUrl: OWN })).toBe("not_found");
  });

  test("one good link is enough; a bad one beside it is still explained", () => {
    const c = check(
      withProfiles([
        { platform: "Facebook", url: "facebook.com/mycafe", check: { result: "profile", finalUrl: "https://www.facebook.com/mycafe", httpStatus: 200, checkedAt: "x" } },
        { platform: "Instagram", url: "instagram.com/mycafe", check: { result: "own_site", finalUrl: "https://mycafe.com/", httpStatus: 200, checkedAt: "x" } },
      ]),
      "website.social_links"
    );
    expect(c.earnedPoints).toBe(1);
    expect(c.explanation).toContain("sends visitors back to your website");
  });

  test("unchecked profiles (saved before this rule) keep counting as before", () => {
    expect(check(withProfiles([{ platform: "Instagram", url: "instagram.com/mycafe" }]), "website.social_links").earnedPoints).toBe(1);
  });

  test("ONE plain request per link, capped; results saved for auditing", async () => {
    const fetchImpl = vi.fn(async (url: string) => ({ url: url.includes("instagram") ? "https://mycafe.com/" : url, status: 200, body: null }) as unknown as Response);
    const profiles: SocialProfile[] = Array.from({ length: MAX_SOCIAL_LINK_CHECKS + 2 }, (_, i) => ({ platform: "Facebook", url: `facebook.com/p${i}`, href: `https://www.facebook.com/p${i}` }));
    profiles[0] = { platform: "Instagram", url: "instagram.com/mycafe", href: "https://www.instagram.com/mycafe" };
    const out = await checkSocialProfiles(profiles, OWN, fetchImpl as unknown as typeof fetch, () => new Date("2026-10-16T00:00:00Z"));
    expect(out.requests).toBe(MAX_SOCIAL_LINK_CHECKS);
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_SOCIAL_LINK_CHECKS);
    expect(out.profiles[0].check).toEqual({ result: "own_site", finalUrl: "https://mycafe.com/", httpStatus: 200, checkedAt: "2026-10-16T00:00:00.000Z" });
    expect(out.profiles[1].check?.result).toBe("profile");
    expect(out.profiles[MAX_SOCIAL_LINK_CHECKS].check).toBeUndefined();
  });
});

function withProfiles(socialProfiles: SocialProfile[]): BusinessScoringInput {
  const base = scoringInput();
  return { ...base, websiteAnalysis: { ...base.websiteAnalysis!, content: { ...base.websiteAnalysis!.content!, socialProfiles } } };
}
