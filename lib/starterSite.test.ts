import { describe, expect, test } from "vitest";
import {
  STARTER_SITE_FONTS,
  STARTER_SITE_THEMES,
  buildStarterSiteHtml,
  getStarterSiteFont,
  getStarterSiteTheme,
  type StarterSiteInput,
} from "./starterSite";

const BASE: StarterSiteInput = {
  businessName: "Rosa's Cafe",
  category: "Cafe",
  tagline: "",
  phone: "+1 555-123-4567",
  address: "742 Evergreen Terrace, Springfield",
  openingHours: ["Monday: 9:00 AM – 5:00 PM"],
  rating: 4.6,
  reviewCount: 120,
  googleMapsUri: "https://maps.google.com/?cid=123",
  profileId: "restaurant",
  themeId: "ink",
  fontId: "classic",
  show: { address: true, phone: true, hours: true, rating: true },
};

describe("buildStarterSiteHtml", () => {
  test("is deterministic — identical input produces identical output", () => {
    expect(buildStarterSiteHtml(BASE)).toBe(buildStarterSiteHtml({ ...BASE }));
  });

  test("includes the real business name (HTML-escaped), category, and address", () => {
    const html = buildStarterSiteHtml(BASE);
    expect(html).toContain("Rosa&#39;s Cafe");
    expect(html).toContain("Cafe");
    expect(html).toContain("742 Evergreen Terrace, Springfield");
  });

  test("builds a real tel: link from the real phone number", () => {
    const html = buildStarterSiteHtml(BASE);
    expect(html).toContain('href="tel:+15551234567"');
  });

  test("never fabricates a tagline the owner didn't write", () => {
    const html = buildStarterSiteHtml({ ...BASE, tagline: "" });
    expect(html).not.toContain('class="tagline"');
  });

  test("includes the owner's real tagline when they wrote one", () => {
    const html = buildStarterSiteHtml({ ...BASE, tagline: "Fresh coffee, made fresh daily." });
    expect(html).toContain("Fresh coffee, made fresh daily.");
  });

  test("omits a section entirely when the owner toggles it off, never a placeholder", () => {
    const html = buildStarterSiteHtml({
      ...BASE,
      show: { ...BASE.show, phone: false },
    });
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("555-123-4567");
  });

  test("omits a section when the underlying data is missing, even if toggled on", () => {
    const html = buildStarterSiteHtml({
      ...BASE,
      phone: null,
      show: { ...BASE.show, phone: true },
    });
    expect(html).not.toContain("tel:");
  });

  test("omits hours/rating/address sections cleanly when none of the data exists", () => {
    const html = buildStarterSiteHtml({
      ...BASE,
      phone: null,
      address: null,
      openingHours: null,
      rating: null,
      reviewCount: null,
      googleMapsUri: null,
      show: { address: true, phone: true, hours: true, rating: true },
    });
    expect(html).not.toContain("<section");
    expect(html).not.toContain('class="ctas"');
  });

  test("shows the real Google reviews link only when googleMapsUri is on file", () => {
    const withLink = buildStarterSiteHtml(BASE);
    expect(withLink).toContain("See our reviews on Google");

    const withoutLink = buildStarterSiteHtml({ ...BASE, googleMapsUri: null });
    expect(withoutLink).not.toContain("See our reviews on Google");
    expect(withoutLink).toContain("4.6");
  });

  test("CTA wording is type-aware: booking language for salon/practitioner", () => {
    const salon = buildStarterSiteHtml({ ...BASE, profileId: "salon" });
    expect(salon).toContain("Call to book");
  });

  test("CTA wording is type-aware: ordering language for restaurant", () => {
    const restaurant = buildStarterSiteHtml({ ...BASE, profileId: "restaurant" });
    expect(restaurant).toContain("Call to order");
  });

  test("CTA wording is type-aware: consultation language for lawyer", () => {
    const lawyer = buildStarterSiteHtml({ ...BASE, profileId: "lawyer" });
    expect(lawyer).toContain("Call for a consultation");
  });

  test("falls back to plain 'Call us' for an unrecognized profile id", () => {
    const generic = buildStarterSiteHtml({ ...BASE, profileId: "default" });
    expect(generic).toContain("Call us");
  });

  test("directions CTA appears when address is shown but phone is not", () => {
    const html = buildStarterSiteHtml({ ...BASE, phone: null });
    expect(html).toContain("Get directions");
  });

  test("escapes HTML-significant characters in owner-provided text", () => {
    const html = buildStarterSiteHtml({ ...BASE, tagline: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  test("is a complete, well-formed HTML document", () => {
    const html = buildStarterSiteHtml(BASE);
    expect(html.trim().startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).toContain('<meta name="viewport"');
  });
});

describe("getStarterSiteTheme / getStarterSiteFont", () => {
  test("every theme id is unique and resolves to itself", () => {
    const ids = STARTER_SITE_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const theme of STARTER_SITE_THEMES) {
      expect(getStarterSiteTheme(theme.id)).toBe(theme);
    }
  });

  test("every font id is unique and resolves to itself", () => {
    const ids = STARTER_SITE_FONTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const font of STARTER_SITE_FONTS) {
      expect(getStarterSiteFont(font.id)).toBe(font);
    }
  });

  test("an unrecognized theme/font id falls back to the default rather than breaking", () => {
    expect(getStarterSiteTheme("not-a-real-theme")).toBe(STARTER_SITE_THEMES[0]);
    expect(getStarterSiteFont("not-a-real-font")).toBe(STARTER_SITE_FONTS[0]);
  });
});

describe("buildStarterSiteHtml: theme and font are baked into the output", () => {
  test("changing the theme changes the real colors in the generated CSS", () => {
    const ink = buildStarterSiteHtml({ ...BASE, themeId: "ink" });
    const terracotta = buildStarterSiteHtml({ ...BASE, themeId: "terracotta" });
    expect(ink).toContain(getStarterSiteTheme("ink").heroBg);
    expect(ink).not.toContain(getStarterSiteTheme("terracotta").heroBg);
    expect(terracotta).toContain(getStarterSiteTheme("terracotta").heroBg);
    expect(terracotta).toContain(getStarterSiteTheme("terracotta").accent);
  });

  test("every theme produces a genuinely different-looking document", () => {
    const htmls = STARTER_SITE_THEMES.map((t) => buildStarterSiteHtml({ ...BASE, themeId: t.id }));
    expect(new Set(htmls).size).toBe(STARTER_SITE_THEMES.length);
  });

  test("changing the font swaps both the Google Fonts link and the CSS font-family", () => {
    const classic = buildStarterSiteHtml({ ...BASE, fontId: "classic" });
    const elegant = buildStarterSiteHtml({ ...BASE, fontId: "elegant" });
    expect(classic).toContain(getStarterSiteFont("classic").googleFontsHref);
    expect(classic).toContain("Fraunces");
    expect(elegant).toContain(getStarterSiteFont("elegant").googleFontsHref);
    expect(elegant).toContain("Playfair Display");
    expect(elegant).not.toContain("Fraunces");
  });

  test("every font produces a genuinely different-looking document", () => {
    const htmls = STARTER_SITE_FONTS.map((f) => buildStarterSiteHtml({ ...BASE, fontId: f.id }));
    expect(new Set(htmls).size).toBe(STARTER_SITE_FONTS.length);
  });

  test("an unrecognized theme or font id still produces a complete, styled document (safe fallback)", () => {
    const html = buildStarterSiteHtml({ ...BASE, themeId: "bogus", fontId: "bogus" });
    expect(html).toContain(STARTER_SITE_THEMES[0].heroBg);
    expect(html).toContain(STARTER_SITE_FONTS[0].googleFontsHref);
  });
});
