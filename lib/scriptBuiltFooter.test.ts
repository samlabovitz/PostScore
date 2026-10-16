import { describe, expect, test } from "vitest";
import { analyzeWebsiteHtml, hasScriptBuiltFooterSigns } from "./websiteContentAnalysis";
import { scoreBusiness, type BusinessScoringInput, type WebsiteAnalysis } from "./scoring";

// The real Chipotle (Yext Pages) shape: the footer's "Connect With Us"
// social icons exist only in a URL-encoded page-data blob handed to a
// module script — never as <a> links in the HTML a plain fetch gets.
const PAGE_DATA = encodeURIComponent(
  JSON.stringify({
    document: {
      c_footerSocialIcons: {
        photo1: { clickthroughUrl: "https://instagram.com/chipotle" },
        photo2: { clickthroughUrl: "https://twitter.com/chipotletweets" },
        photo3: { clickthroughUrl: "https://facebook.com/chipotle" },
        title: "Connect With Us",
      },
    },
  })
);
const CHIPOTLE = `<html><head><title>Chipotle Newark</title></head><body>
<main><h1>Chipotle Mexican Grill</h1><p>136 E Main St, Newark, DE</p></main>
<div><ul><li><a href="https://www.chipotle.com/privacy-center">Privacy Center</a></li></ul></div>
<script type="module">
  const render = await import(new URL("/assets/render/_client.js", import.meta.url));
  render.render({ pageProps: JSON.parse(decodeURIComponent("${PAGE_DATA}")) });
</script>
</body></html>`;

const ANALYTICS_ONLY = `<html><body><main><h1>Joe's Diner</h1></main>
<script>window.dataLayer = [{ event: "footer_view", section: "footer" }];</script>
</body></html>`;

const VISIBLE_SOCIAL = `<html><body><main><h1>Joe's Diner</h1></main>
<footer><a href="https://instagram.com/joesdiner">Instagram</a></footer>
<script>window.footerReady = true;</script>
</body></html>`;

describe("script-built footer signs (the Chipotle case)", () => {
  test("Chipotle: social URLs only in the page script's data, footer mentioned → sign found, no visible profiles", () => {
    expect(hasScriptBuiltFooterSigns(CHIPOTLE)).toBe(true);
    const content = analyzeWebsiteHtml(CHIPOTLE, "https://locations.chipotle.com/");
    expect(content.socialProfiles).toEqual([]);
    expect(content.scriptBuiltFooter).toBe(true);
  });

  test("a script that mentions 'footer' with no social URL is not a sign", () => {
    expect(hasScriptBuiltFooterSigns(ANALYTICS_ONLY)).toBe(false);
  });

  test("a script whose text has a stray '%' doesn't throw", () => {
    expect(hasScriptBuiltFooterSigns(`<script>var footer = "100%"; var u = "instagram.com/x";</script>`)).toBe(true);
  });
});

describe("Social links scoring with a script-built footer", () => {
  const input = (content: Partial<WebsiteAnalysis["content"]>): BusinessScoringInput =>
    ({
      rating: 4.5,
      reviewCount: 100,
      mostRecentReviewDaysAgo: null,
      phone: "555",
      address: "1 Main St",
      openingHours: ["Monday: 9–5"],
      website: "https://example.com",
      httpsStatus: "https",
      categories: ["restaurant"],
      primaryCategory: "Restaurant",
      photoCount: 10,
      businessStatus: "OPERATIONAL",
      websiteAnalysis: {
        content: { ...analyzeWebsiteHtml(ANALYTICS_ONLY, "https://example.com/"), ...content },
        mobilePerformance: null,
        mobilePerformanceFailureReason: null,
        contentFetchFailureReason: null,
        httpsUnreachableReason: null,
        screenshotUrl: null,
        additionalPages: [],
        lastScreenshotRefreshAt: null,
        aboutPresence: null,
        servicesPresence: null,
        checkedAt: "2026-10-16T00:00:00.000Z",
      },
    }) as BusinessScoringInput;
  const social = (i: BusinessScoringInput, locale: "en" | "es" = "en") =>
    scoreBusiness(i, locale).checks.find((c) => c.id === "website.social_links")!;

  test("no profiles + script-built footer → couldn't check (left out of the score), EN + ES", () => {
    const result = social(input({ socialProfiles: [], scriptBuiltFooter: true }));
    expect(result.earnedPoints).toBeNull();
    expect(result.explanation).toContain("footer is built by a script");
    expect(social(input({ socialProfiles: [], scriptBuiltFooter: true }), "es").explanation).toContain("pie de página de su sitio se genera con un script");
  });

  test("no profiles and no script-built footer → still a real 0", () => {
    expect(social(input({ socialProfiles: [], scriptBuiltFooter: false })).earnedPoints).toBe(0);
  });

  test("visible profiles always score 1, whatever the scripts say", () => {
    const content = analyzeWebsiteHtml(VISIBLE_SOCIAL, "https://example.com/");
    expect(content.socialProfiles!.length).toBe(1);
    expect(social(input({ socialProfiles: content.socialProfiles, scriptBuiltFooter: true })).earnedPoints).toBe(1);
  });
});
