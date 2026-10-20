import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/business/b1/campaigns" }));
vi.mock("@/components/layout/AccountMenu", () => ({ AccountMenu: () => null }));

import { LocaleProvider } from "@/lib/i18n";
import { Sidebar } from "./Sidebar";

const render = (locale: "en" | "es") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      <Sidebar business={{ id: "b1", name: "Hudson Shears", address: "20 W Main St" }} />
    </LocaleProvider>
  );
const links = (html: string) => Array.from(html.matchAll(/<a[^>]+href="(\/business\/b1[^"]*)"[^>]*>(?:<svg[\s\S]*?<\/svg>)([^<]+)<\/a>/g)).map((m) => [m[2].replace(/&amp;/g, "&"), m[1]]);

describe("sidebar (Day 5b)", () => {
  test("the 8 tabs in order, with Price check renamed; no Google Profile, PostStudio or Settings tab", () => {
    expect(links(render("en"))).toEqual([
      ["Overview", "/business/b1"],
      ["Growth", "/business/b1/growth"],
      ["Campaigns", "/business/b1/campaigns"],
      ["Reviews", "/business/b1/website-reviews"],
      ["Website", "/business/b1/website"],
      ["Competitors", "/business/b1/competitors"],
      ["Price check", "/business/b1/pricing"],
      ["Reports", "/business/b1/reports"],
    ]);
    expect(render("en")).not.toMatch(/>Pricing</);
    expect(render("en")).not.toMatch(/google-profile|\/studio|Settings/);
  });

  test("Spanish labels", () => {
    expect(links(render("es")).map(([label]) => label)).toEqual([
      "Resumen",
      "Crecimiento",
      "Campañas",
      "Reseñas",
      "Sitio web",
      "Competencia",
      "Revisión de precios",
      "Informes",
    ]);
  });

  test("the current page's tab is highlighted", () => {
    const html = render("en");
    expect(html).toMatch(/class="[^"]*bg-brass text-white" href="\/business\/b1\/campaigns"/);
    expect(html).not.toMatch(/class="[^"]*bg-brass text-white" href="\/business\/b1\/growth"/);
  });
});
