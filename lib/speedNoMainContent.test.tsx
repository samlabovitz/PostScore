import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { couldNotFindMainContent, fetchMobilePerformance } from "@/lib/websiteAnalysis";
import { businessRowToScoringInput, parseWebsiteAnalysis, scoreBusiness, type BusinessScoringRow } from "@/lib/scoring";
import { websiteFixesFor, websiteFixPlan } from "@/lib/websiteFixes";
import { builderGuideFor, guideTaskFor, webPersonAsk, webPersonExplain } from "@/lib/websiteBuilderGuides";
import { WebsiteFixGuide } from "@/components/scoring/WebsiteFixGuide";

// "Google's speed test can't find the page's main content" (the real
// Hair express on Broadway case, Lighthouse NO_LCP): the page loads, but
// everything on its first screen starts invisible and fades in, so there's
// no score. Left out of the score; a "Needs a web person" fix guide.

const SITE = "https://www.hairexpressonbroadway.com/";
/** What PageSpeed really returned for Hair express (Oct 28): page loaded
 * (200, same URL), no runtime error, LCP audit errored with NO_LCP. */
const NO_LCP = {
  lighthouseResult: {
    requestedUrl: SITE,
    finalUrl: SITE,
    finalDisplayedUrl: SITE,
    mainDocumentUrl: SITE,
    categories: { performance: { score: null } },
    audits: {
      "largest-contentful-paint": { score: null, scoreDisplayMode: "error", errorMessage: "NO_LCP" },
      "network-requests": { details: { items: [{ url: SITE, statusCode: 200, resourceType: "Document" }] } },
    },
  },
};

describe("detecting it", () => {
  test("NO_LCP with no score → can't find the main content; a scored run never is", () => {
    expect(couldNotFindMainContent(NO_LCP as never)).toBe(true);
    const scored = { lighthouseResult: { ...NO_LCP.lighthouseResult, categories: { performance: { score: 0.6 } } } };
    expect(couldNotFindMainContent(scored as never)).toBe(false);
  });

  test("three NO_LCP runs → failure kind 'error' with cause no_main_content, saved and read back", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify(NO_LCP), { status: 200 })) as unknown as typeof fetch;
    const result = await fetchMobilePerformance(SITE, "key", ["performance"], fetchImpl);
    expect(result.measurement).toBeNull();
    expect(result.failureReason).toEqual({ kind: "error", status: null, cause: "no_main_content" });
    expect(parseWebsiteAnalysis({ mobilePerformance: null, mobilePerformanceFailureReason: result.failureReason, checkedAt: "2026-10-28T00:00:00Z" })?.mobilePerformanceFailureReason).toEqual({ kind: "error", status: null, cause: "no_main_content" });
  });
});

function check(locale: "en" | "es" = "en") {
  const row = {
    name: "Hair express on Broadway",
    rating: 5,
    review_count: 30,
    website: SITE,
    website_analysis_json: { mobilePerformance: null, mobilePerformanceFailureReason: { kind: "error", status: null, cause: "no_main_content" }, checkedAt: "2026-10-28T00:00:00Z" },
  } as unknown as BusinessScoringRow;
  return scoreBusiness(businessRowToScoringInput(row), locale).checks.find((c) => c.id === "website.performance_mobile")!;
}

describe("the check and its fix", () => {
  test("left out of the score, plain words (EN + ES), with the gap", () => {
    const c = check();
    expect(c.earnedPoints).toBeNull();
    expect(c.gaps).toEqual(["no_main_content"]);
    expect(c.explanation).toBe(
      "We couldn't measure your site's speed — Google's speed test can't find your homepage's main content, so it can't give a score. This check is left out of your score, not counted against you. See how to fix it below."
    );
    expect(check("es").explanation).toContain("no encuentra el contenido principal");
    expect(c.explanation + check("es").explanation).not.toMatch(/PageSpeed|API|Lighthouse|LCP/);
  });

  test("one 'Needs a web person' fix — never the builder's image-compression speed guide", () => {
    const fixes = websiteFixesFor(check(), "wix");
    expect(fixes).toEqual([{ checkId: "website.performance_mobile", gap: "no_main_content", kind: "web_person", minutes: null }]);
    expect(websiteFixPlan([check()], null).webPersonCount).toBe(1);
    expect(guideTaskFor("website.performance_mobile", "no_main_content")).toBeNull();
    expect(builderGuideFor("wix", "website.performance_mobile", "no_main_content")).toBeNull();
    // A normal slow site still gets the speed guide.
    expect(guideTaskFor("website.performance_mobile", null)).toBe("speed");
  });

  test("the guide explains it in plain words: the three common causes and what to change (EN + ES)", () => {
    const en = webPersonExplain("website.performance_mobile", "no_main_content", "en")!;
    expect(en).toContain("can't find any");
    expect(en).toMatch(/starts hidden and fades or slides in/);
    expect(en).toMatch(/loaded late by scripts/);
    expect(en).toMatch(/full-screen video or slider/);
    expect(webPersonAsk("website.performance_mobile", "no_main_content", "en")).toMatch(/opacity: 0/);
    expect(webPersonExplain("website.performance_mobile", "no_main_content", "es")).toMatch(/carrusel a pantalla completa/);

    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <WebsiteFixGuide fixes={websiteFixesFor(check(), null)} builder={null} siteUrl={SITE} />
      </LocaleProvider>
    );
    expect(html).toContain('data-testid="fix-explain"');
    expect(html).toContain('data-testid="web-person-message"');
    expect(html).toContain("hairexpressonbroadway.com");
  });
});
