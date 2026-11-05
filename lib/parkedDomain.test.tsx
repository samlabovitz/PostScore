import { describe, expect, test } from "vitest";
import { analyzeWebsiteHtml, detectParkedDomain } from "./websiteContentAnalysis";
import { scoreBusiness, type BusinessScoringInput, type WebsiteAnalysis } from "./scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";

// The real Colorful Yun Nan case (Nov 2026): the Google listing's
// colorfulyunnanorder.com lapsed and a domain dropper now shows a
// NameBright "coming soon" page there, so contact read 0/3. The real site
// is newarkcolorfulyunnan.com (same address, tap-to-call, Order Online).

const PARKED = `<!DOCTYPE html><html><head><link rel="icon" href="data:,"><title>NameBright - Coming Soon</title><style>body{font:18px sans-serif}</style></head>
<body><div class="page"><div class="wrapper"><div class="container"><h1>colorfulyunnanorder.com is coming soon</h1>
<p>This domain is managed at <a href="//www.namebright.com">NameBright</a></p></div></div></div></body></html>`;

const REAL = `<!DOCTYPE html><html><head><title>Home | Colorful Yun Nan</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<nav><a href="/#home">Home</a><a href="/order/">Order Online</a><a href="/#contact">Contact Us</a></nav>
<main><h1>Welcome To Colorful Yun Nan</h1><p>Best food, Good Food. Pickup, Delivery, Dine-in.</p><a href="/order/">Order Online Now</a>
<section id="contact"><h2>Contact</h2><p>59 E Main St, Newark, DE 19711</p><a href="tel:302-894-1998">302-894-1998</a>
<h3>Working Hours</h3><p>Sunday 11:00 AM - 08:45 PM</p></section></main>
<footer>Copyright 2025 Colorful Yun Nan. 59 E Main St, Newark, DE 19711 Call us today: <a href="tel:302-894-1998">302-894-1998</a></footer></body></html>`;

describe("parked domains are never read as the business's site", () => {
  test("the NameBright “coming soon” page is a parked domain; other domain companies' for-sale pages too", () => {
    expect(detectParkedDomain(PARKED)).toEqual({ provider: "NameBright" });
    expect(detectParkedDomain("<title>example.com</title><p>This domain is for sale! Buy this domain on Dan.com</p>")).toEqual({ provider: "Dan.com" });
    expect(detectParkedDomain("<title>Hugedomains.com</title><p>The domain shop-joes.com is for sale</p>")).toEqual({ provider: "HugeDomains" });
    expect(analyzeWebsiteHtml(PARKED, "https://www.colorfulyunnanorder.com/").parkedDomain).toEqual({ provider: "NameBright" });
  });

  test("a real one-page site — even one saying “coming soon” about a new menu — is never parked", () => {
    expect(detectParkedDomain(REAL)).toBeNull();
    expect(detectParkedDomain(`<title>Joe's Bakery</title><h1>Joe's Bakery</h1><p>Our new fall menu is coming soon! ${"Fresh bread and pastries every morning. ".repeat(60)}</p>`)).toBeNull();
  });

  test("the real site, read in full: tap-to-call + “Order Online” = contact 3/3 material", () => {
    const c = analyzeWebsiteHtml(REAL, "https://newarkcolorfulyunnan.com/");
    expect(c.parkedDomain).toBeUndefined();
    expect(c.hasPhoneLink).toBe(true);
    expect(c.hasCtaText).toBe(true);
    expect(c.contactEvidence?.phoneLink).toBe("tel:302-894-1998");
  });
});

describe("scoring a listing whose link is a parked domain", () => {
  const BASE = scoringInput();
  const parkedTrust = {
    spamSignals: [],
    safeBrowsingThreat: null,
    safeBrowsingChecked: true,
    infoConflicts: [],
    staleNotices: [],
    abandonedSignals: { newestDateFound: null, templateLeftovers: [], looksAbandoned: false },
    websiteKind: null,
    checkedAt: "2026-11-05T00:00:00Z",
    listingLinkBroken: true,
    listingLinkErrorPageUrl: "https://www.colorfulyunnanorder.com/",
    listingLinkParked: true,
  };
  const withAnalysis = (wa: Partial<WebsiteAnalysis>, extra: Partial<BusinessScoringInput> = {}): BusinessScoringInput => ({
    ...BASE,
    website: "https://www.colorfulyunnanorder.com/",
    websiteAnalysis: { ...BASE.websiteAnalysis!, ...wa, websiteTrust: parkedTrust },
    ...extra,
  });
  const check = (input: BusinessScoringInput, id: string, locale: "en" | "es" = "en") => scoreBusiness(input, locale).checks.find((c) => c.id === id)!;

  test("no verified site: the Google link is broken (parked), there's no working website — the parked page's content is never scored (EN + ES)", () => {
    const input = withAnalysis({ content: analyzeWebsiteHtml(PARKED, "https://www.colorfulyunnanorder.com/") });
    const link = check(input, "completeness.website_link");
    expect(link.earnedPoints).toBe(0);
    expect(link.explanation).toBe("Your Google listing's website link goes to https://www.colorfulyunnanorder.com/, which is now a parked “coming soon” domain — not your website. Someone else may now control that address. Change the link on Google to your real site.");
    expect(check(input, "completeness.website_link", "es").explanation).toContain("dominio estacionado");
    const has = check(input, "website.has_website");
    expect(has.earnedPoints).toBe(0);
    expect(has.explanation).toContain("parked “coming soon” domain");
    // Nothing from the parking page counts against the business.
    for (const id of ["website.contact_conversion", "website.content_depth", "website.about_presence"]) expect(check(input, id).earnedPoints, id).toBeNull();
  });

  test("with the verified real site analyzed instead: Website scored from the real site, contact 3/3, and the parked Google link still said plainly", () => {
    const input = withAnalysis({ content: analyzeWebsiteHtml(REAL, "https://newarkcolorfulyunnan.com/") }, { verifiedElsewhereUrl: "https://newarkcolorfulyunnan.com/" });
    expect(check(input, "website.contact_conversion").earnedPoints).toBe(3);
    const has = check(input, "website.has_website");
    expect(has.earnedPoints).toBe(4);
    expect(has.explanation).toBe("Your real website (https://newarkcolorfulyunnan.com/) was checked instead — your Google listing links to a parked domain. Change the link on Google to https://newarkcolorfulyunnan.com/.");
    expect(check(input, "completeness.website_link").earnedPoints).toBe(0);
  });
});
