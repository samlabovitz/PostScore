import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { analyzeWebsiteHtml, detectSocialProfiles } from "./websiteContentAnalysis";
import { isSingleItemPath } from "./websiteAnalysis";
import { isRosterPath, proseWordsOutsideLists } from "./pagePresenceDetection";
import { compareAddress } from "./websiteTrust";
import { WebsiteCoverageNote, websitePointsCoverage } from "@/components/scoring/WebsiteCoverageNote";
import { scoreBasisPoints, type CategoryResult, type CheckResult } from "./scoring";

describe("1a — platform/builder accounts never count as the business's profile", () => {
  test("Gregg L. Smith: only Wix's LinkedIn → no profile at all", () => {
    expect(detectSocialProfiles(`<a href="https://www.linkedin.com/company/wix-com">Made with Wix</a>`)).toEqual([]);
  });
  test("Yoga Love NY: Wix's accounts dropped, its own kept", () => {
    const html = `<a href="https://facebook.com/yogalovenewyork">FB</a><a href="https://instagram.com/yoga.love.ny">IG</a>
      <a href="https://www.facebook.com/wix">f</a><a href="https://www.instagram.com/wix">i</a>`;
    expect(detectSocialProfiles(html).map((p) => p.url)).toEqual(["facebook.com/yogalovenewyork", "instagram.com/yoga.love.ny"]);
  });
  test("ordering/booking platforms and a platform's own account are dropped; a business named like a platform elsewhere is kept", () => {
    expect(detectSocialProfiles(`<a href="https://instagram.com/toasttab">t</a><a href="https://x.com/x">x</a><a href="https://facebook.com/Square">s</a>`)).toEqual([]);
    expect(detectSocialProfiles(`<a href="https://instagram.com/x">x</a>`)).toEqual([{ platform: "Instagram", url: "instagram.com/x" }]);
  });
});

describe("1b — Facebook pg/, p/ and people/ paths keep the real page", () => {
  test("Pardalis: facebook.com/pg/newyorkcitylawyers/reviews → facebook.com/newyorkcitylawyers", () => {
    expect(detectSocialProfiles(`<a href="https://www.facebook.com/pg/newyorkcitylawyers/reviews">FB</a>`)).toEqual([
      { platform: "Facebook", url: "facebook.com/newyorkcitylawyers" },
    ]);
  });
  test("Red Bowl: facebook.com/p/Red-Bowl-100069632232812 keeps its p/ path (never a bare facebook.com/p)", () => {
    expect(detectSocialProfiles(`<a href='https://www.facebook.com/p/Red-Bowl-100069632232812/?paipv=0&#038;eav=x'>FB</a>`)).toEqual([
      { platform: "Facebook", url: "facebook.com/p/Red-Bowl-100069632232812" },
    ]);
  });
  test("people/<name>/<id> keeps all three parts", () => {
    expect(detectSocialProfiles(`<a href="https://www.facebook.com/people/Joes-Diner/100012345/">FB</a>`)[0].url).toBe(
      "facebook.com/people/Joes-Diner/100012345"
    );
  });
});

describe("2 — 'Partly checked — score based on X of 100 points'", () => {
  const check = (id: string, max: number, earned: number | null): CheckResult => ({
    id,
    label: id,
    category: "website",
    maxPoints: max,
    earnedPoints: earned,
    confidence: earned === null ? "NOT_FOUND" : "VERIFIED",
    explanation: "",
    meta: null,
    ...(earned === null ? { excludedReason: "unreachable" as const } : {}),
  });
  // A bot-blocked site: has-website (4) + real-visitor speed (5) checkable; 21 of 30 points not.
  const blocked: CategoryResult = {
    id: "website",
    label: "Website",
    weight: 30,
    possiblePoints: 9,
    earnedPoints: 5,
    relativeScore: 56,
    checks: [check("website.has_website", 4, 4), check("website.performance_mobile", 5, 1), check("website.https", 6, null), check("website.content_depth", 15, null)],
  };
  // The real Qamaria Overview: Reviews 34 shown (review recency is never
  // collected), Google listing 30, Website 9.
  const categories = [
    { possiblePoints: 34 },
    { possiblePoints: 30 },
    { possiblePoints: 9 },
  ];
  const render = (locale: "en" | "es", basis: number | null = scoreBasisPoints(categories)) =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale}>
        <WebsiteCoverageNote category={blocked} hasWebsite scoreBasis={basis} />
      </LocaleProvider>
    );
  test("the label always equals the sum of the category maxes shown: 34 + 30 + 9 = 73 (EN + ES)", () => {
    expect(scoreBasisPoints(categories)).toBe(73);
    expect(websitePointsCoverage(blocked)).toEqual({ share: 0.3 });
    expect(render("en")).toContain("Partly checked — score based on 73 of 100 points.");
    expect(render("es")).toContain("Revisado en parte — puntuación basada en 73 de 100 puntos.");
  });
  test("without the whole-score basis, no points number is guessed (only the check-count line)", () => {
    const html = render("en", null);
    expect(html).not.toContain("Partly checked");
    expect(html).toContain("Based on 2 of 4 website checks");
  });
  test("60%+ checkable → no 'Partly checked' label (the existing check-count note stays)", () => {
    const mostly = { ...blocked, possiblePoints: 24, checks: [check("website.has_website", 4, 4), check("website.content_depth", 20, 10), check("website.https", 6, null)] };
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <WebsiteCoverageNote category={mostly} hasWebsite />
      </LocaleProvider>
    );
    expect(html).not.toContain("Partly checked");
    expect(html).toContain("Based on 2 of 3 website checks");
  });
});

describe("3 — the right page for About / Services", () => {
  test("single product / event / post pages are never a Services page; list pages are", () => {
    for (const p of ["/products/anything-is-possible-24oz-cup", "/events/kingstowne-workshop", "/blog/new-menu", "/shop/products/x", "/news/2026/opening", "/offer/intro-offer-5-classes-for-99", "/deals/summer", "/promo/bogo", "/coupon/10-off", "/promotions/spring"])
      expect(isSingleItemPath(p), p).toBe(true);
    for (const p of ["/products", "/events", "/offers", "/deals", "/collections/all", "/menu", "/services", "/white-plains/classes"]) expect(isSingleItemPath(p), p).toBe(false);
  });
  test("roster paths are recognized; prose is counted outside the roster's list entries", () => {
    for (const p of ["/stylists", "/our-team", "/team/", "/staff"]) expect(isRosterPath(p), p).toBe(true);
    expect(isRosterPath("/about-us")).toBe(false);
    const roster = `<ul>${Array.from({ length: 6 }, (_, i) => `<li>Stylist ${i} — color and cuts specialist with years of experience</li>`).join("")}</ul><p>Book with us.</p>`;
    expect(proseWordsOutsideLists(roster)).toBe(3);
  });
});

describe("4 — Contact & conversion evidence is saved (no score change)", () => {
  test("the exact link and phrase behind each signal", () => {
    const c = analyzeWebsiteHtml(
      `<main><h1>Joe's</h1><a href="tel:+13025551234">Call us</a><a href="mailto:hi@joes.com">Email</a><a href="/contact">Contact</a><p>Order online today!</p></main>`,
      "https://joes.com/"
    );
    expect(c.contactEvidence).toEqual({
      phoneLink: "tel:+13025551234",
      emailLink: "mailto:hi@joes.com",
      contactPageLink: "https://joes.com/contact",
      actionLinkText: "Call us",
      ctaPhrase: "order online",
    });
    expect(c.hasPhoneLink && c.hasEmailLink && c.hasContactPageLink && c.hasCtaText).toBe(true);
  });
});

describe("6 — the saved site address starts at the street number", () => {
  test("Ilda's: no 'ress ' label leftover; still a match", () => {
    const f = compareAddress("Address 29 Main St Tarrytown, NY 10591 Site map", "29 Main St, Tarrytown, NY 10591, USA");
    expect(f.comparison).toBe("matches");
    expect(f.siteValue?.startsWith("29 main st")).toBe(true);
  });
});

import { detectPagePresence, newPresenceBudget } from "./websiteAnalysis";
describe("3 — same-location pages rank first for a chain's location site", () => {
  test("yogasix.com/white-plains: /white-plains/about wins over the brand-wide /about", async () => {
    const story = `<html><body><main><h1>About</h1><p>${"Our White Plains studio opened in 2019 with heated classes, friendly teachers and a welcoming community for every level of practice. ".repeat(3)}</p></main></body></html>`;
    const fetched: string[] = [];
    const fetchImpl = (async (url: string) => {
      fetched.push(url);
      return { ok: true, status: 200, headers: new Headers({ "content-type": "text/html" }), text: async () => story };
    }) as unknown as typeof fetch;
    const result = await detectPagePresence(
      "about",
      "<html><body><main><h1>YogaSix White Plains</h1></main></body></html>",
      new URL("https://www.yogasix.com/white-plains"),
      [
        { url: "https://www.yogasix.com/about", label: "About" },
        { url: "https://www.yogasix.com/white-plains/about", label: "About" },
      ],
      newPresenceBudget(),
      fetchImpl
    );
    expect(fetched[0]).toBe("https://www.yogasix.com/white-plains/about");
    expect(result).toMatchObject({ state: "found", url: "https://www.yogasix.com/white-plains/about" });
  });
});
