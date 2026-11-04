import { describe, expect, test } from "vitest";


import { analyzeWebsiteHtml, detectBrokenSocialLinks, detectPhoneLayout, findPhoneText } from "./websiteContentAnalysis";
import { detectPagePresence, extractMobileUsability, fetchMobilePerformance, newPresenceBudget } from "./websiteAnalysis";
import { SCORING_V113, SCORING_VERSION, scoreBusiness, type BusinessScoringInput, type WebsiteAnalysis, type WebsiteContentSignals } from "./scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";

// v1.13.0 website-check fixes — the real National 5 & 10
// (national5and10.com) case for each.

const BASE = scoringInput();
function withContent(extra: Partial<WebsiteContentSignals>, analysis: Partial<WebsiteAnalysis> = {}): BusinessScoringInput {
  const wa = BASE.websiteAnalysis!;
  return { ...BASE, websiteAnalysis: { ...wa, ...analysis, content: { ...wa.content!, ...extra } } };
}
const check = (input: BusinessScoringInput, id: string, locale: "en" | "es" = "en") => scoreBusiness(input, locale).checks.find((c) => c.id === id)!;

describe("1 — a phone number shown as text, not tap-to-call", () => {
  test("US formats with dots, dashes, spaces and parentheses, anywhere visible (footers too)", () => {
    for (const n of ["302.368.1646", "302-368-1646", "(302) 368-1646", "302 368 1646", "+1 302 368 1646", "1-302-368-1646"]) expect(findPhoneText(`Call us: ${n} today`), n).toBe(n);
    // Not phone numbers: prices, dates, zip+4, long ids, 0/1 area codes.
    for (const x of ["$1,234.5678", "2026-10-30", "19711-1234", "Order 12345678901", "102.368.1646", "302.168.1646"]) expect(findPhoneText(x), x).toBeNull();
  });

  test("the National 5 & 10 footer: found as text, no tel: link", () => {
    const html = `<html><body><div class="topbar">Need Help? Give Us A Call: <span>302.368.1646</span></div><main><h1>National 5 &amp; 10</h1></main><footer><h4>Customer Service</h4>Call us: 302.368.1646</footer></body></html>`;
    const c = analyzeWebsiteHtml(html, "https://www.national5and10.com/");
    expect(c.hasPhoneLink).toBe(false);
    expect(c.hasPhoneText).toBe(true);
    expect(c.contactEvidence?.phoneText).toBe("302.368.1646");
  });

  test("scoring: tap-to-call = full contact credit; shown but not a link = partial, with the fix; none = needs work (EN + ES)", () => {
    const linked = check(withContent({ hasPhoneLink: true, hasEmailLink: false, hasContactPageLink: false, hasCtaText: false }), "website.contact_conversion");
    expect(linked.earnedPoints).toBe(2);

    const textOnly = withContent({ hasPhoneLink: false, hasEmailLink: false, hasContactPageLink: false, hasCtaText: true, hasPhoneText: true, contactEvidence: { phoneLink: null, emailLink: null, contactPageLink: null, actionLinkText: null, ctaPhrase: "call us", phoneText: "302.368.1646" } });
    const partial = check(textOnly, "website.contact_conversion");
    expect(partial.earnedPoints).toBe(2); // 1 (number, not a link) + 1 (call to action)
    expect(partial.gaps).toEqual(["phone_link"]);
    expect(partial.explanation).toBe("Your phone number (302.368.1646) is on the page but isn't tap-to-call — make it a link so phone visitors can call in one tap.");
    expect(partial.explanation).not.toMatch(/no click-to-call phone, email, or contact/i);
    expect(check(textOnly, "website.contact_conversion", "es").explanation).toContain("no se puede tocar para llamar");

    const none = check(withContent({ hasPhoneLink: false, hasEmailLink: false, hasContactPageLink: false, hasCtaText: false, hasPhoneText: false }), "website.contact_conversion");
    expect(none.earnedPoints).toBe(0);
    expect(none.explanation).toContain("No click-to-call phone, email, or contact page link found");
  });
});

describe("5 — calls to action: National 5 & 10's “Give Us A Call”, “Call us:” and “Add to cart” count", () => {
  test("EN + ES phrases", () => {
    for (const text of ["Need Help? Give Us A Call: 302.368.1646", "Add to cart", "Visit us on Main Street", "Llámenos hoy", "Agregar al carrito"]) {
      expect(analyzeWebsiteHtml(`<main><h1>Shop</h1><p>${text}</p></main>`).hasCtaText, text).toBe(true);
    }
    expect(analyzeWebsiteHtml(`<main><h1>Welcome</h1><p>We sell toys and candy.</p></main>`).hasCtaText).toBe(false);
  });
});

describe("2 — social icons that don't go to a profile", () => {
  const site = "https://www.national5and10.com/";
  test("the National 5 & 10 footer: Twitter and YouTube icons link to “#” — broken; Facebook / Instagram / Pinterest are real", () => {
    const html = `<footer><ul class="social-icons">
      <li><a href="https://www.facebook.com/national5and10/"><i class="fa fa-facebook"></i><span class="basel-social-icon-name">Facebook</span></a></li>
      <li><a href="#"><i class="fa fa-twitter"></i><span class="basel-social-icon-name">Twitter</span></a></li>
      <li><a href="https://www.instagram.com/National510/"><i class="fa fa-instagram"></i><span class="basel-social-icon-name">Instagram</span></a></li>
      <li><a href="#"><i class="fa fa-youtube"></i><span class="basel-social-icon-name">YouTube</span></a></li>
      <li><a href="https://www.pinterest.com/National510/"><i class="fa fa-pinterest"></i><span class="basel-social-icon-name">Pinterest</span></a></li>
    </ul></footer>`;
    const c = analyzeWebsiteHtml(html, site);
    expect(c.socialProfiles!.map((p) => p.platform)).toEqual(["Facebook", "Instagram", "Pinterest"]);
    expect(c.brokenSocialLinks).toEqual([
      { platform: "X/Twitter", href: "#", reason: "own_site" },
      { platform: "YouTube", href: "#", reason: "own_site" },
    ]);
  });

  test("own homepage, empty, javascript: and bare platform homepages are broken; profiles and share buttons aren't", () => {
    const html = `
      <a href="/" aria-label="Facebook"><svg class="icon-facebook"></svg></a>
      <a href="" class="social tiktok"></a>
      <a href="javascript:void(0)" title="LinkedIn"></a>
      <a href="https://twitter.com/"><i class="fa fa-twitter"></i></a>
      <a href="https://www.youtube.com"><i class="fa fa-youtube"></i></a>
      <a href="#" class="share-facebook">Share</a>
      <a href="https://www.instagram.com/realshop/"><i class="fa fa-instagram"></i></a>`;
    expect(detectBrokenSocialLinks(html, site)).toEqual([
      { platform: "Facebook", href: "/", reason: "own_site" },
      { platform: "TikTok", href: "", reason: "no_link" },
      { platform: "LinkedIn", href: "javascript:void(0)", reason: "no_link" },
      { platform: "X/Twitter", href: "https://twitter.com/", reason: "platform_home" },
      { platform: "YouTube", href: "https://www.youtube.com", reason: "platform_home" },
    ]);
  });

  test("a platform that also has a real profile link isn't broken (the same icons often appear twice)", () => {
    expect(detectBrokenSocialLinks(`<a href="#"><i class="fa fa-instagram"></i></a><a href="https://instagram.com/realshop">IG</a>`, site)).toEqual([]);
  });

  test("scoring: real profiles earn the point, the broken icons are said plainly (EN + ES); only broken ones → 0", () => {
    const broken = [
      { platform: "X/Twitter", href: "#", reason: "own_site" as const },
      { platform: "YouTube", href: "#", reason: "own_site" as const },
    ];
    const withReal = withContent({ socialProfiles: [{ platform: "Instagram", url: "instagram.com/national510" }], brokenSocialLinks: broken });
    const ok = check(withReal, "website.social_links");
    expect(ok.earnedPoints).toBe(1);
    expect(ok.gaps).toEqual(["broken_social"]);
    expect(ok.explanation).toContain("Your Twitter (X) and YouTube icons don't go to a profile — they reload your own site. Link them to your real profiles or remove them.");
    expect(check(withReal, "website.social_links", "es").explanation).toContain("Sus íconos de Twitter (X) y YouTube no llevan a un perfil: vuelven a cargar su propio sitio.");

    const onlyBroken = check(withContent({ socialProfiles: [], brokenSocialLinks: broken }), "website.social_links");
    expect(onlyBroken.earnedPoints).toBe(0);
    expect(onlyBroken.explanation).toBe("Your Twitter (X) and YouTube icons don't go to a profile — they reload your own site. Link them to your real profiles or remove them.");

    const home = check(withContent({ socialProfiles: [], brokenSocialLinks: [{ platform: "YouTube", href: "https://youtube.com", reason: "platform_home" }] }), "website.social_links");
    expect(home.explanation).toBe("Your YouTube icon goes to that site's homepage, not to your profile. Link it to your real profile or remove it.");
  });
});

describe("4 — About: a broken “Our Story” link is said, and non-About pages under /about/ don't count", () => {
  const home = new URL("https://www.national5and10.com/");
  const page = (title: string, words = 300) => `<html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${"Real words about this topic. ".repeat(words / 5)}</p></main></body></html>`;
  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    const html = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/html" } });
    if (url.endsWith("/about/location-store-hours/")) return html(page("Location & Store Hours"));
    if (url.endsWith("/about/parking/")) return html(page("Parking", 500));
    if (url.endsWith("/about/our-story/")) return new Response("Not found", { status: 404 });
    return new Response("Not found", { status: 404 });
  };

  test("footer links followed; the 404 on “Our Story” is the finding, never “no About content”", async () => {
    const homepage = `<html><body><main><h1>National 5 &amp; 10</h1><p>Toys, candy and gifts.</p></main><footer>
      <a href="/about/our-story/">Our Story</a><a href="/about/location-store-hours/">Location &amp; Hours</a><a href="/about/parking/">Parking</a></footer></body></html>`;
    const candidates = [
      { url: `${home.origin}/about/our-story/`, label: "Our Story" },
      { url: `${home.origin}/about/location-store-hours/`, label: "Location & Hours" },
      { url: `${home.origin}/about/parking/`, label: "Parking" },
    ];
    const result = await detectPagePresence("about", homepage, home, candidates, newPresenceBudget(), fakeFetch);
    expect(result).toMatchObject({ state: "not_found", url: `${home.origin}/about/our-story/`, note: "broken_link" });
    const scored = check({ ...BASE, websiteAnalysis: { ...BASE.websiteAnalysis!, aboutPresence: result } }, "website.about_presence");
    expect(scored.explanation).toBe(`Your site links to an About page at ${home.origin}/about/our-story/, but that page doesn't load (a broken link) — fix the link or add the page.`);
    expect(check({ ...BASE, websiteAnalysis: { ...BASE.websiteAnalysis!, aboutPresence: result } }, "website.about_presence", "es").explanation).toContain("corrija el enlace o agregue la página");
  });

  test("“Who We Are”, “Our History”, “Meet the Team” and Spanish labels are About links", async () => {
    for (const label of ["Who We Are", "Our History", "Meet the Team", "Quiénes somos", "Nuestra historia", "Conózcanos", "Acerca de"]) {
      const ok: typeof fetch = async () => new Response(page(`${label} — Rivera's`, 120).replace(/Real words about this topic\. /g, "We opened in 1987 as a family shop and still serve our neighbors every day. "), { status: 200, headers: { "content-type": "text/html" } });
      const r = await detectPagePresence("about", "<main><h1>Hi</h1></main>", new URL("https://rivera.test/"), [{ url: "https://rivera.test/x", label }], newPresenceBudget(), ok);
      expect(r.state, label).toBe("found");
    }
  });
});

describe("3 — “Works well on phones” and “Loads fast”, Website still 30", () => {
  test("Google's phone audits from PageSpeed: touch targets (and text size / page width when Google still reports them)", () => {
    const raw = (audits: Record<string, { score: number | null; scoreDisplayMode?: string }>) => ({ lighthouseResult: { audits } });
    expect(extractMobileUsability(raw({ "target-size": { score: 1, scoreDisplayMode: "binary" } }))).toEqual({ tapTargets: true, textReadable: null, fitsScreen: null });
    expect(extractMobileUsability(raw({ "target-size": { score: 0, scoreDisplayMode: "binary" }, "font-size": { score: 1 }, "content-width": { score: 0 } }))).toEqual({ tapTargets: false, textReadable: true, fitsScreen: false });
    expect(extractMobileUsability(raw({ "target-size": { score: null, scoreDisplayMode: "notApplicable" } }))).toEqual({ tapTargets: null, textReadable: null, fitsScreen: null });
  });

  test("each item ✓/✗ in plain words; points for what was checked; nothing checked → couldn't check (EN + ES)", () => {
    const wa = BASE.websiteAnalysis!;
    const input = (viewport: boolean, usability: { tapTargets: boolean | null; textReadable: boolean | null; fitsScreen: boolean | null } | undefined) => ({
      ...BASE,
      websiteAnalysis: { ...wa, content: { ...wa.content!, hasViewportTag: viewport }, mobilePerformance: { method: "field" as const, fieldCategory: "FAST" as const, labScore: null, ...(usability ? { mobileUsability: usability } : {}) } },
    });
    const both = check(input(true, { tapTargets: false, textReadable: null, fitsScreen: null }), "website.mobile_friendly");
    expect(both.maxPoints).toBe(2);
    expect(both.earnedPoints).toBe(1);
    expect(both.explanation).toBe("On a phone: ✓ Set up for phone screens · ✗ Buttons and links big enough to tap.");
    expect(both.gaps).toEqual(["tap"]);
    expect(check(input(true, { tapTargets: false, textReadable: null, fitsScreen: null }), "website.mobile_friendly", "es").explanation).toBe("En un teléfono: ✓ Adaptado a pantallas de teléfono · ✗ Botones y enlaces del tamaño adecuado para tocar.");
    expect(check(input(true, { tapTargets: true, textReadable: true, fitsScreen: true }), "website.mobile_friendly").earnedPoints).toBe(2);
    // Older saved rows: only our own viewport read is known.
    expect(check(input(false, undefined), "website.mobile_friendly").earnedPoints).toBe(0);
    const noContent = { ...BASE, websiteAnalysis: { ...wa, content: null, mobilePerformance: null } };
    expect(check(noContent, "website.mobile_friendly").earnedPoints).toBeNull();
  });

  test("Website total stays 30", () => {
    const website = scoreBusiness(BASE).categories.find((c) => c.id === "website")!;
    expect(website.checks.reduce((s, c) => s + c.maxPoints, 0)).toBe(30);
  });

  test("PageSpeed: real-user seconds (75th percentile LCP) first, then the lab median; the phone audits come along", async () => {
    const response = {
      lighthouseResult: { requestedUrl: "https://shop.test/", finalUrl: "https://shop.test/", finalDisplayedUrl: "https://shop.test/", categories: { performance: { score: 0.65 } }, audits: { "target-size": { score: 1, scoreDisplayMode: "binary" }, "largest-contentful-paint": { numericValue: 6818 } } },
      loadingExperience: { overall_category: "AVERAGE", metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2014 } } },
    };
    const fake: typeof fetch = async () => new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
    const r = await fetchMobilePerformance("https://shop.test/", "key", undefined, fake);
    expect(r.measurement).toMatchObject({ method: "field", fieldCategory: "AVERAGE", lcpSeconds: 2, mobileUsability: { tapTargets: true, textReadable: null, fitsScreen: null } });

    const lab = { ...response, loadingExperience: undefined };
    const labFetch: typeof fetch = async () => new Response(JSON.stringify(lab), { status: 200, headers: { "content-type": "application/json" } });
    const l = await fetchMobilePerformance("https://shop.test/", "key", undefined, labFetch);
    expect(l.measurement).toMatchObject({ method: "lab", labScore: 65, lcpSeconds: 6.8 });
  });
});

describe("v1.13.0", () => {
  test("SCORING_VERSION is 1.13.0 and its split is on", () => {
    expect(SCORING_VERSION).toBe("1.13.0");
    expect(SCORING_V113).toBe(true);
  });

  const speed = (m: NonNullable<WebsiteAnalysis["mobilePerformance"]>, locale: "en" | "es" = "en") =>
    check({ ...BASE, websiteAnalysis: { ...BASE.websiteAnalysis!, mobilePerformance: m } }, "website.performance_mobile", locale);

  test("owner wording (EN + ES): “Average · about 2.0 seconds to show your page on a phone”, a muted source line, no seconds → just the word, never “/100”", () => {
    const avg = speed({ method: "field", fieldCategory: "AVERAGE", labScore: null, lcpSeconds: 3.04 });
    expect(avg.label).toBe("Loads fast");
    expect(avg.explanation).toBe("Average · about 3.0 seconds to show your page on a phone.");
    expect(avg.note).toBe("Based on real visitors in the last 28 days");
    const es = speed({ method: "field", fieldCategory: "AVERAGE", labScore: null, lcpSeconds: 3.04 }, "es");
    expect(es.explanation).toBe("Promedio · unos 3,0 segundos en mostrar su página en un teléfono.");
    expect(es.note).toBe("Basado en visitantes reales de los últimos 28 días");
    const lab = speed({ method: "lab", fieldCategory: null, labScore: 65, lcpSeconds: 6.82 });
    expect(lab.explanation).toBe("Slow · about 6.8 seconds to show your page on a phone.");
    expect(lab.note).toBe("Based on Google's phone test");
    expect(speed({ method: "lab", fieldCategory: null, labScore: 65 }, "es").note).toBe("Basado en la prueba en teléfono de Google");
    expect(speed({ method: "field", fieldCategory: "FAST", labScore: null }).explanation).toBe("Fast.");
    const carried = speed({ method: "lab", fieldCategory: null, labScore: 27, measuredAt: "2026-10-06T20:40:00.000Z", carriedForward: true });
    expect(carried.explanation).toBe("Slow (last measured Oct 6, 2026).");
    for (const c of [avg, es, lab, carried]) expect(c.explanation).not.toMatch(/\/100|Chrome|Lighthouse|PageSpeed|CrUX|lab/i);
  });

  test("the label matches the seconds: Fast ≤ 2.5 s, Average ≤ 4 s, Slow > 4 s — real visitors and the phone test alike; no seconds → Google's overall rating", () => {
    // The real National 5 & 10 case: Google rates it Slow overall, but its page shows in 2.1 s.
    const n510 = speed({ method: "field", fieldCategory: "SLOW", labScore: null, lcpSeconds: 2.1 });
    expect(n510.explanation).toBe("Fast · about 2.1 seconds to show your page on a phone.");
    expect(n510.earnedPoints).toBe(4);
    const word = (m: NonNullable<WebsiteAnalysis["mobilePerformance"]>) => speed(m).explanation.split(" ")[0].replace(".", "");
    expect([2.5, 2.6, 4, 4.1].map((sec) => word({ method: "field", fieldCategory: "FAST", labScore: null, lcpSeconds: sec }))).toEqual(["Fast", "Average", "Average", "Slow"]);
    expect([2.5, 4, 4.1].map((sec) => word({ method: "lab", fieldCategory: null, labScore: 95, lcpSeconds: sec }))).toEqual(["Fast", "Average", "Slow"]);
    expect(word({ method: "field", fieldCategory: "SLOW", labScore: null })).toBe("Slow");
    expect(word({ method: "field", fieldCategory: "FAST", labScore: null })).toBe("Fast");
    expect(word({ method: "lab", fieldCategory: null, labScore: 65 })).toBe("Average");
  });

  test("weights: phones 1 + speed 4 until the fuller phone check has run, then 2 + 3 — Website stays 30 either way", () => {
    const wa = BASE.websiteAnalysis!;
    const basic = { ...BASE, websiteAnalysis: { ...wa, mobilePerformance: { method: "field" as const, fieldCategory: "AVERAGE" as const, labScore: null } } };
    const fuller = { ...BASE, websiteAnalysis: { ...wa, mobilePerformance: { method: "field" as const, fieldCategory: "AVERAGE" as const, labScore: null, mobileUsability: { tapTargets: true, textReadable: null, fitsScreen: null } } } };
    expect([check(basic, "website.performance_mobile").maxPoints, check(basic, "website.mobile_friendly").maxPoints]).toEqual([4, 1]);
    expect([check(fuller, "website.performance_mobile").maxPoints, check(fuller, "website.mobile_friendly").maxPoints]).toEqual([3, 2]);
    for (const input of [basic, fuller]) {
      const website = scoreBusiness(input).categories.find((c) => c.id === "website")!;
      expect(website.checks.reduce((sum, c) => sum + c.maxPoints, 0)).toBe(30);
    }
    // Fast 100% / Average 50% / Slow 0%.
    expect(check(basic, "website.performance_mobile").earnedPoints).toBe(2);
    expect(check(fuller, "website.performance_mobile").earnedPoints).toBe(1.5);
  });

  test("a Slow site never gains: speed + phones ≤ its 1.12.0 points (Slow 1 / Average 3 / Fast 5 of 5) while only the viewport is checked", () => {
    const wa = BASE.websiteAnalysis!;
    const OLD = { SLOW: 1, AVERAGE: 3, FAST: 5 } as const;
    for (const cat of ["SLOW", "AVERAGE", "FAST"] as const) {
      for (const viewport of [true, false]) {
        const input = { ...BASE, websiteAnalysis: { ...wa, content: { ...wa.content!, hasViewportTag: viewport }, mobilePerformance: { method: "field" as const, fieldCategory: cat, labScore: null } } };
        const pair = (check(input, "website.performance_mobile").earnedPoints ?? 0) + (check(input, "website.mobile_friendly").earnedPoints ?? 0);
        expect(pair, `${cat} viewport=${viewport}`).toBeLessThanOrEqual(OLD[cat]);
      }
    }
  });

  test("Content depth no longer counts the viewport tag — only “Works well on phones” does", () => {
    const noViewport = withContent({ hasViewportTag: false, hasTitle: true, hasMetaDescription: true, headingCount: 3, visibleTextLength: 5000 });
    const depth = check(noViewport, "website.content_depth");
    expect(depth.earnedPoints).toBe(5);
    expect(depth.gaps ?? []).not.toContain("viewport");
    expect(depth.explanation).not.toMatch(/viewport/i);
    const phones = check(noViewport, "website.mobile_friendly");
    expect(phones.explanation).toContain("✗ Set up for phone screens");
    // Title 1.5 / meta 1.25 / headings 1.5 / length 0.75.
    expect(check(withContent({ hasViewportTag: true, hasTitle: false, hasMetaDescription: false, headingCount: 3, visibleTextLength: 5000 }), "website.content_depth").earnedPoints).toBe(2.3);
  });

  test("text size and page width from the page's own HTML / inline CSS (no extra request)", () => {
    const vp = `<meta name="viewport" content="width=device-width, initial-scale=1">`;
    expect(detectPhoneLayout(`<head>${vp}<style>body{font-size:10px}</style></head><body></body>`)).toMatchObject({ textReadable: false, baseFontPx: 10, fitsScreen: true });
    expect(detectPhoneLayout(`<head>${vp}<style>html,body{font-size:16px;margin:0}</style></head>`)).toMatchObject({ textReadable: true, baseFontPx: 16 });
    expect(detectPhoneLayout(`<head>${vp}</head><body style="font-size:9pt">x</body>`).textReadable).toBe(true);
    expect(detectPhoneLayout(`<head>${vp}</head><body>x</body>`).textReadable).toBeNull(); // set in an external stylesheet, if anywhere
    // Wider than a phone: an element's own style, html/body, a table's width, a fixed viewport.
    expect(detectPhoneLayout(`<head>${vp}</head><body><div style="width:960px">x</div></body>`)).toMatchObject({ fitsScreen: false, wideElement: '<div style="width:960px">' });
    expect(detectPhoneLayout(`<head>${vp}<style>body{min-width:1024px}</style></head>`).fitsScreen).toBe(false);
    expect(detectPhoneLayout(`<head>${vp}</head><body><table width="800"><tr><td>x</td></tr></table></body>`).fitsScreen).toBe(false);
    expect(detectPhoneLayout(`<head><meta name="viewport" content="width=1024"></head>`).fitsScreen).toBe(false);
    // Desktop-only rules, max-width and hidden elements don't count.
    expect(detectPhoneLayout(`<head>${vp}<style>@media (min-width: 1200px){body{min-width:1170px}}</style></head><body><div style="max-width:1200px">x</div><div style="display:none;width:900px"></div></body>`).fitsScreen).toBe(true);
    expect(detectPhoneLayout(`<head></head><body>x</body>`).fitsScreen).toBeNull();
  });

  test("“Works well on phones” uses the page's own read when Google doesn't report text size / width (EN + ES)", () => {
    const input = withContent({ hasViewportTag: true, phoneLayout: { textReadable: false, fitsScreen: true, baseFontPx: 10, wideElement: null } }, { mobilePerformance: { method: "field", fieldCategory: "FAST", labScore: null, mobileUsability: { tapTargets: true, textReadable: null, fitsScreen: null } } });
    const c = check(input, "website.mobile_friendly");
    expect(c.explanation).toBe("On a phone: ✓ Set up for phone screens · ✗ Text readable without zooming · ✓ Nothing wider than the screen · ✓ Buttons and links big enough to tap.");
    expect(c.earnedPoints).toBe(1.5);
    expect(c.gaps).toEqual(["text"]);
    expect(check(input, "website.mobile_friendly", "es").explanation).toContain("✗ Texto legible sin hacer zoom");
  });
});

