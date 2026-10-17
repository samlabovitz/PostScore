import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { WebsiteBannerCard } from "./GrowthView";

function render(locale: "en" | "es", banner: Parameters<typeof WebsiteBannerCard>[0]["banner"]) {
  return renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <WebsiteBannerCard banner={banner} businessId="biz-1" />
    </LocaleProvider>
  )
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

describe("WebsiteBannerCard (Day 4 Step 2f)", () => {
  test("EN: real numbers, tPlural for the count, links to the Website page", () => {
    const many = render("en", { kind: "improve", score: 76, improvements: 5, points: 2.4 });
    expect(many).toContain("Your website scores 76/100 — 5 improvements available (up to about +2 pts on your PostScore).");
    expect(many).toContain("Open the Website page →");
    expect(many).toContain('href="/business/biz-1/website"');
    expect(render("en", { kind: "improve", score: 95, improvements: 1, points: 0.4 })).toContain(
      "1 improvement available (up to about +1 pts"
    );
  });

  test("ES: formal usted copy", () => {
    const html = render("es", { kind: "improve", score: 76, improvements: 5, points: 2.4 });
    expect(html).toContain("Su sitio web obtiene 76/100 — 5 mejoras disponibles (hasta unos +2 pts en su PostScore).");
    expect(html).toContain("Abrir la página Sitio web →");
  });

  test("no website: 'Get a website' with the honest starter-site range", () => {
    const html = render("en", { kind: "get_website", low: 12.3, high: 18.1 });
    expect(html).toContain("Get a website");
    expect(html).toContain("about +12–18 pts");
    expect(html).toContain('href="/business/biz-1/website"');
    expect(render("en", { kind: "get_website", low: 9, high: null })).toContain("about +9 pts");
  });
});
