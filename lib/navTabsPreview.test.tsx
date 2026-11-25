// Day 25B step 4: the two-tab sidebar (spec §1) as the new-design preview
// (localhost:3001) shows it, with the new pages' links on.
import { afterAll, describe, expect, test, vi } from "vitest";

// The new-design preview's links (npm run dev:new): the switch reads this at load.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_NEW_DESIGN_PREVIEW = "true";
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_NEW_DESIGN_PREVIEW;
});
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

let path = "/business/b1";
vi.mock("next/navigation", () => ({ usePathname: () => path, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/layout/AccountMenu", () => ({ AccountMenu: () => <div data-testid="account" /> }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { GrowthTierLine, PhoneNavBar, TabbedSidebar } from "@/components/layout/TabbedSidebar";
import type { ShellData } from "@/components/layout/ShellData";
import { activeItem, GROWTH_ITEMS, navItemLocked, PRESENCE_ITEMS, tabForPath } from "@/lib/navTabs";
import { NEW_PAGES_LIVE, newDesignPreview, redirectToBuilt } from "@/lib/routes";
import { isDevTestAccount } from "@/lib/shellData.server";

vi.mock("server-only", () => ({}));

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const BIZ = { id: "b1", name: "Hair express on Broadway", address: "9 S Broadway" };
const PAID: ShellData = { presence: { score: 78, grade: "C" }, plan: "premium", testAccount: true };
const FREE: ShellData = { presence: { score: 78, grade: "C" }, plan: "free", testAccount: false };
const sidebar = (at: string, shell: ShellData, locale: Locale = "en") => {
  path = at;
  return renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <TabbedSidebar business={BIZ} shell={shell} />
    </LocaleProvider>
  );
};
const items = (html: string) => Array.from(html.matchAll(/data-nav="([a-zA-Z]+)"/g)).map((m) => m[1]);

test("the preview's switch is on in this file", () => {
  expect(NEW_PAGES_LIVE).toBe(true);
  expect(redirectToBuilt("/business/b1/google-results")).toBe("/business/b1/google-results");
  expect(newDesignPreview({ NODE_ENV: "test", NEXT_PUBLIC_NEW_DESIGN_PREVIEW: "true" })).toBe(true);
  expect(isDevTestAccount({}, null)).toBe(false);
});

describe("tabs and pages", () => {
  test("the open tab follows the URL; shared pages have none of their own", () => {
    for (const p of ["/business/b1", "/business/b1/fix-plan", "/business/b1/google-listing", "/business/b1/website-reviews", "/business/b1/website", "/business/b1/competitors", "/business/b1/pricing"]) expect(tabForPath(p), p).toBe("presence");
    for (const p of ["/business/b1/growth", "/business/b1/google-results", "/business/b1/campaigns"]) expect(tabForPath(p), p).toBe("growth");
    for (const p of ["/business/b1/reports", "/business/b1/settings", "/business/b1/connect-gbp", "/business/b1/studio"]) expect(tabForPath(p), p).toBeNull();
  });

  test("Presence: its 7 pages, then a divider, PostStudio (Coming soon) and Reports directly under them; only Account pinned below (EN + ES)", () => {
    const html = sidebar("/business/b1/fix-plan", PAID);
    const list = html.slice(html.indexOf('data-testid="nav-items"'), html.indexOf("</nav>"));
    expect(list.indexOf('data-nav="pricing"')).toBeLessThan(list.indexOf('data-testid="nav-divider"'));
    expect(list.indexOf('data-testid="nav-divider"')).toBeLessThan(list.indexOf('data-nav="postStudio"'));
    expect(list.indexOf('data-nav="postStudio"')).toBeLessThan(list.indexOf('data-nav="reports"'));
    expect(items(html)).toEqual(["overview", "fixPlan", "googleListing", "reviews", "website", "competitors", "pricing", "postStudio", "reports"]);
    expect(html.indexOf('data-testid="nav-divider"')).toBeGreaterThan(html.indexOf('data-nav="pricing"'));
    expect(html.indexOf('data-testid="nav-divider"')).toBeLessThan(html.indexOf('data-nav="postStudio"'));
    expect(html.indexOf('data-testid="account"')).toBeGreaterThan(html.indexOf('data-nav="reports"'));
    expect(text(html)).toContain("Overview Fix plan Google listing Reviews Website Competitors Price check PostStudio Coming soon Reports");
    expect(html).toMatch(/data-nav="fixPlan" aria-current="page"/);
    expect(text(sidebar("/business/b1/fix-plan", PAID, "es"))).toContain("Resumen Plan de correcciones Ficha de Google Reseñas Sitio web Competencia Revisión de precios PostStudio Pronto Informes");
  });

  test("Growth: its 7 pages, each opening its own page (Day 25B step 5); Local events last, Coming soon", () => {
    const html = sidebar("/business/b1/growth", PAID);
    expect(items(html)).toEqual(["growthPlan", "googleResults", "getReviews", "offers", "campaigns", "printKit", "localEvents", "postStudio", "reports"]);
    expect(text(html)).toContain("Growth plan Google results Get more reviews Customer offers Campaigns Print kit & QR Local events Coming soon");
    const hrefOf = (id: string) => html.match(new RegExp(`<a data-nav="${id}"[^>]*href="([^"]+)"`))?.[1] ?? null;
    expect(hrefOf("growthPlan")).toBe("/business/b1/growth");
    expect(hrefOf("googleResults")).toBe("/business/b1/google-results");
    expect(hrefOf("getReviews")).toBe("/business/b1/get-reviews");
    expect(hrefOf("offers")).toBe("/business/b1/offers");
    expect(hrefOf("campaigns")).toBe("/business/b1/campaigns");
    expect(hrefOf("printKit")).toBe("/business/b1/print-kit");
    expect(hrefOf("localEvents")).toBe("/business/b1/local-events");
    // Each page highlights its own item.
    for (const [path, id] of [["/business/b1/get-reviews", "getReviews"], ["/business/b1/offers", "offers"], ["/business/b1/campaigns", "campaigns"], ["/business/b1/print-kit", "printKit"], ["/business/b1/local-events", "localEvents"]] as const) expect(activeItem(path, "b1", GROWTH_ITEMS), path).toBe(id);
    expect(text(sidebar("/business/b1/growth", PAID, "es"))).toContain("Plan de crecimiento Resultados en Google Consiga más reseñas Ofertas para clientes Campañas Kit de impresión y QR Eventos locales Pronto PostStudio Pronto Informes");
  });

  test("the switch: icon + name on one line each; the tier name and 'Test account' only in the Growth pages' header line (EN + ES)", () => {
    const html = sidebar("/business/b1", PAID);
    const tabs = (h: string) => text(h.slice(h.indexOf('data-testid="nav-tabs">') + 'data-testid="nav-tabs">'.length, h.indexOf("<nav ")));
    // Icon + name only (the score is on every Presence page; the tier in the Growth header line).
    expect(tabs(html)).toBe("Presence Growth");
    expect(tabs(sidebar("/business/b1", PAID, "es"))).toBe("Presencia Crecimiento");
    expect(html).toContain('data-icon="presence"');
    expect(html).toContain('data-icon="growth"');
    expect(html).not.toContain("Starting out");
    expect(html).not.toContain("Test account");
    expect(html).toMatch(/data-testid="nav-tab-presence" data-open="true"[^>]*href="\/business\/b1"/);
    expect(html).toMatch(/data-testid="nav-tab-growth" [^>]*href="\/business\/b1\/growth"/);
    // The open half: a soft fill + the gold underline, never a white card.
    expect(html).toMatch(/data-testid="nav-tab-presence" data-open="true" aria-current="page" class="[^"]*border-brass bg-white\/\[\.14\]/);
    expect(html).not.toMatch(/nav-tab-[a-z]+"[^>]*class="[^"]*\bbg-white text-ink/);
    const line = (shell: ShellData, locale: Locale = "en") => text(renderToStaticMarkup(<LocaleProvider locale={locale}><GrowthTierLine shell={shell} /></LocaleProvider>));
    expect(line(PAID)).toBe("Growth · Tier 1 Starting out Test account");
    expect(line({ ...PAID, testAccount: false })).toBe("Growth · Tier 1 Starting out");
    expect(line(PAID, "es")).toBe("Crecimiento · Nivel 1 Comenzando Cuenta de prueba");
    expect(line(FREE)).toBe("Growth · ? Locked");
  });

  test("the Growth header line shows on Growth pages only (by URL), on the preview", () => {
    const shell = readFileSync("components/layout/DashboardShell.tsx", "utf8");
    expect(shell).toContain('{NEW_PAGES_LIVE && business && <GrowthPagesLine shell={shell} />}');
    expect(shell).toContain('return tabForPath(usePathname()) === "growth" ? <GrowthTierLine shell={shell} /> : null;');
  });

  test("PostStudio: 'Coming soon' as a chip on the label's line; every row the same height; one divider, none above Account", () => {
    const html = sidebar("/business/b1", PAID);
    expect(html).toMatch(/data-nav="postStudio" class="flex h-10 [^"]*"[^>]*>[\s\S]*?<span class="whitespace-nowrap">PostStudio<\/span><span class="ml-auto[^"]*">Coming soon<\/span>/);
    expect(html.match(/data-testid="nav-divider"/g)?.length).toBe(1);
    expect(readFileSync("components/layout/TabbedSidebar.tsx", "utf8")).toContain("<AccountMenu business={business} userEmail={userEmail} divider={false} />");
    expect(readFileSync("components/layout/Sidebar.tsx", "utf8")).toContain("<AccountMenu business={business} userEmail={userEmail} />");
  });

  test("Free: Growth shows its lock; every Growth page and Reports locked; Price check keeps its lock; Reviews open (Nov 24); Local events Coming soon", () => {
    const html = sidebar("/business/b1/growth", FREE);
    expect(html).toMatch(/data-testid="nav-tab-growth"[^>]*data-locked="true"/);
    expect(html).toContain('data-icon="lock"');
    expect(text(html)).toContain("Growth Locked");
    expect(html).not.toContain("nav-test-account");
    for (const id of ["growthPlan", "googleResults", "getReviews", "offers", "campaigns", "printKit", "reports"]) expect(navItemLocked("free", id as never), id).toBe(true);
    for (const id of ["overview", "fixPlan", "googleListing", "reviews", "website", "competitors", "localEvents", "postStudio"]) expect(navItemLocked("free", id as never), id).toBe(false);
    expect(navItemLocked("free", "pricing")).toBe(true);
    for (const item of [...PRESENCE_ITEMS, ...GROWTH_ITEMS]) expect(navItemLocked("grow", item.id)).toBe(false);
    expect(html.match(/data-testid="nav-lock"/g)?.length).toBe(7);
    // On Presence: only Price check is locked (and Reports below).
    const presence = sidebar("/business/b1", FREE);
    expect(presence.match(/data-testid="nav-lock"/g)?.length).toBe(2);
    expect(presence).not.toMatch(/data-nav="reviews"[^>]*>(?:(?!<\/a>)[\s\S])*nav-lock/);
  });

  test("phones: 'PostScore · Presence · 78 C ☰' and the open tab's pages in a row (EN + ES)", () => {
    path = "/business/b1/fix-plan";
    const phone = (locale: Locale) => renderToStaticMarkup(<LocaleProvider locale={locale}><PhoneNavBar businessId="b1" shell={PAID} onOpenMenu={() => {}} /></LocaleProvider>);
    expect(text(phone("en"))).toContain("Score · Presence · 78 C");
    expect(text(phone("en"))).toContain("Overview Fix plan Google listing Reviews Website Competitors Price check");
    expect(phone("en")).toContain('aria-current="page" class="inline-flex');
    expect(text(phone("es"))).toContain("Score · Presencia · 78 C");
    path = "/business/b1/growth";
    expect(text(phone("en"))).toContain("Score · Growth · Tier 1");
  });
});


describe("the Reports 'New' dot", () => {
  test("a gold dot on Reports when a new report is ready (screen readers: 'New report ready'); never on Free; off on Reports itself (EN + ES)", () => {
    const html = sidebar("/business/b1", { ...PAID, reportsNew: true });
    expect(html).toContain('data-testid="nav-reports-new"');
    expect(html.indexOf('data-testid="nav-reports-new"')).toBeGreaterThan(html.indexOf('data-nav="reports"'));
    expect(text(html)).toContain("Reports New report ready");
    expect(text(sidebar("/business/b1", { ...PAID, reportsNew: true }, "es"))).toContain("Informes Nuevo informe listo");
    expect(sidebar("/business/b1", { ...PAID, reportsNew: false })).not.toContain("nav-reports-new");
    expect(sidebar("/business/b1", { ...FREE, reportsNew: true })).not.toContain("nav-reports-new");
    expect(sidebar("/business/b1/reports", { ...PAID, reportsNew: true })).not.toContain("nav-reports-new");
  });
});
