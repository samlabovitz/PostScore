import { describe, expect, test } from "vitest";
import { detectPagePresence, isXmlSitemapUrl, newPresenceBudget } from "./websiteAnalysis";
import { t } from "./i18n";

// The real Bánh Mì Boy (WordPress/Yoast) case: sitemap.xml is a sitemap
// INDEX whose entries are other sitemap files — "menuscat-sitemap.xml"
// matched "menu" and its 12 words of XML text were read as a thin
// Services page (0.5).

describe("XML sitemap entries are never candidate pages", () => {
  test("isXmlSitemapUrl: .xml and .xml.gz (query/hash ignored), never an ordinary page", () => {
    expect(isXmlSitemapUrl("http://banhmiboy.com/menuscat-sitemap.xml")).toBe(true);
    expect(isXmlSitemapUrl("https://example.com/page-sitemap.xml?ver=2")).toBe(true);
    expect(isXmlSitemapUrl("https://example.com/sitemap.XML.gz")).toBe(true);
    expect(isXmlSitemapUrl("https://example.com/menu")).toBe(false);
    expect(isXmlSitemapUrl("https://example.com/menu.html")).toBe(false);
    expect(isXmlSitemapUrl("https://example.com/xml-menu/")).toBe(false);
  });
});

describe("only text/html candidates are read as page content", () => {
  // Six entries with dates — 12 "words" of text, enough to count as a
  // thin section if it were ever read as a page (the real case).
  const SITEMAP_XML = `<?xml version="1.0"?><urlset>${["banh-mi", "drinks", "bowls", "sides", "desserts", "catering"]
    .map((slug) => `<url><loc>https://banhmiboy.com/menu/${slug}/</loc><lastmod>2026-01-01</lastmod></url>`)
    .join("")}</urlset>`;
  const respond = (contentType: string | null, body: string) =>
    (async () => ({
      ok: true,
      status: 200,
      headers: new Headers(contentType ? { "content-type": contentType } : {}),
      text: async () => body,
    })) as unknown as typeof fetch;
  const run = (fetchImpl: typeof fetch) =>
    detectPagePresence(
      "services",
      "<html><body><main><h1>Bánh Mì Boy</h1></main></body></html>",
      new URL("https://banhmiboy.com/"),
      [{ url: "https://banhmiboy.com/menu", label: "Menu" }],
      newPresenceBudget(),
      fetchImpl
    );

  test("a candidate served as text/xml is skipped — not found, nothing counted", async () => {
    const result = await run(respond("text/xml; charset=UTF-8", SITEMAP_XML));
    expect(result).toMatchObject({ state: "not_found", depth: null, counts: null });
  });

  test("application/json and images are skipped the same way", async () => {
    expect((await run(respond("application/json", '{"menu": "Banh mi, Pho, Iced coffee, Spring rolls, Bao, Rice bowls"}'))).state).toBe("not_found");
    expect((await run(respond("image/png", "binary"))).state).toBe("not_found");
  });

  test("text/html and a missing Content-Type are still read", async () => {
    const menu = `<html><body><main><h1>Menu</h1><ul><li>Classic Banh Mi $9</li><li>Lemongrass Chicken $10</li><li>Tofu Banh Mi $9</li><li>Pho $12</li><li>Iced Coffee $5</li></ul></main></body></html>`;
    expect((await run(respond("text/html; charset=utf-8", menu))).state).toBe("found");
    expect((await run(respond(null, menu))).state).toBe("found");
  });
});

describe("Safe Browsing wording matches the panel's 'no warning found'", () => {
  test("EN + ES", () => {
    expect(t("en", "content.checks.website.security.explanation.cleanChecked")).toBe("No signs of hacking found. Google Safe Browsing: no warning found.");
    expect(t("en", "dashboard.website.security.safeBrowsingClean")).toBe("Google Safe Browsing: no warning found.");
    expect(t("es", "content.checks.website.security.explanation.cleanChecked")).toBe(
      "No se encontraron señales de hackeo. Navegación segura de Google: no se encontró ninguna advertencia."
    );
    expect(t("es", "dashboard.website.security.safeBrowsingClean")).toBe("Navegación segura de Google: no se encontró ninguna advertencia.");
  });
});
