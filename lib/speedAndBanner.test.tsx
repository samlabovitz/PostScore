import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "biz-1" }), useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/business/biz-1" }));
vi.mock("@/app/actions/auth", () => ({ getCurrentUserEmail: async () => null }));

import { LocaleProvider } from "@/lib/i18n";
import { requestCache } from "@/lib/requestCache";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { rememberShellBusiness, shellBusinessFor } from "@/components/layout/shellMemory";
import { GrowMoreCustomers } from "@/components/overview/GrowMoreCustomers";

const PAGES = ["", "growth", "website-reviews", "website", "competitors", "pricing", "reports"];

describe("speed", () => {
  test("every dashboard page has an instant loading skeleton", () => {
    for (const p of PAGES) expect(fs.existsSync(`app/business/[id]${p ? `/${p}` : ""}/loading.tsx`), p || "overview").toBe(true);
  });

  test("the skeleton keeps the same shell: the business last shown (never 'Untitled business')", () => {
    rememberShellBusiness({ id: "biz-1", name: "Modern Liquors", address: "246 E Delaware Ave" });
    expect(shellBusinessFor("biz-1")?.name).toBe("Modern Liquors");
    expect(shellBusinessFor("other")).toBeNull();
    const html = renderToStaticMarkup(<PageSkeleton variant="overview" />);
    expect(html).toContain("Modern Liquors");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading…");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).not.toContain("Untitled business");
  });

  test("requestCache passes straight through outside a server render (scripts, tests, actions)", async () => {
    let calls = 0;
    const f = requestCache(async (x: number) => {
      calls++;
      return x * 2;
    });
    expect(await f(2)).toBe(4);
    expect(await f(2)).toBe(4);
    expect(calls).toBe(2);
  });

  test("pages load independent data together (no one-at-a-time waterfalls)", () => {
    const growth = fs.readFileSync("app/business/[id]/growth/page.tsx", "utf8");
    expect(growth).toMatch(/Promise\.all\(\[\s*websiteOnlyGuard\(params\.id, "growth"\),\s*getBusinessSummary\(params\.id\),[^\]]*?scoreBusinessById\(params\.id, "business"\)/);
    expect(growth).not.toMatch(/await listActivePromos|await getWeeklyChecklistState|await getLastScanAt/);
    const overview = fs.readFileSync("app/business/[id]/page.tsx", "utf8");
    expect(overview).toMatch(/Promise\.all\(\[\s*getBusinessSummary\(params\.id\),\s*getListingModeForPage\(params\.id\),\s*scoreBusinessById\(params\.id, "business"\)/);
    const reports = fs.readFileSync("app/actions/reports.ts", "utf8");
    expect(reports).toContain("getGbpConnectionStatus(businessId),");
    expect(reports).not.toContain("await getGbpConnectionStatus(businessId)");
  });
});

describe("'More customers, whatever your score' banner", () => {
  const render = (locale: "en" | "es", review: number | null, average: number | null, tools = { referralOk: true, couponsOk: true, pricingOk: true }) =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale}>
        <GrowMoreCustomers businessId="b1" profileTools={tools} reviewCount={review} nearbyReviewAverage={average} />
      </LocaleProvider>
    ).replace(/&amp;/g, "&").replace(/&#x27;/g, "'");

  test("Reviews is the hero with a real stat and the review link & QR button; the other tools are tiles", () => {
    const html = render("en", 15, 120);
    expect(html).toContain("Get more Google reviews");
    expect(html).toContain("15 reviews — businesses near you average 120");
    expect(html).toContain('href="/business/b1/website-reviews#get-more-reviews"');
    expect(html).toContain("Get your review link & QR →");
    for (const label of ["Coupons", "Referrals", "Weekly routine", "Price check", "Competitors"]) expect(html).toContain(label);
    expect(html).toContain("Bring people back with a simple offer");
    expect(html).not.toContain("Review QR");
    // Light icon tiles and a hover lift that respects reduce-motion.
    expect(html).toContain("ps-icon-tile");
    expect(html).toContain("motion-reduce:hover:translate-y-0");
    // Fits narrow screens: one column on phones.
    expect(html).toContain("grid-cols-1 gap-2.5 sm:grid-cols-2");
  });

  test("a 6th 'Shop' tile: Coming soon, not clickable yet (no link, no arrow) — tiles equal height beside the Reviews tile", () => {
    const html = render("en", 15, 120);
    const shop = html.slice(html.indexOf(">Shop<") - 900, html.indexOf("Signs, displays and tools for your storefront") + 60);
    expect(shop).toContain("Coming soon");
    expect(shop).toContain("cursor-default");
    expect(shop).not.toContain("<a ");
    expect(shop).not.toContain("tabler-icon-arrow-right");
    expect((html.match(/<li class="min-w-0">/g) ?? []).length).toBe(6);
    expect(html).toContain("grid h-full min-w-0 auto-rows-fr grid-cols-1 gap-2.5 sm:grid-cols-2");
    const es = render("es", 15, 120);
    expect(es).toContain("Tienda");
    expect(es).toContain("Próximamente");
    expect(es).toContain("Letreros, exhibidores y herramientas para su local");
  });

  test("Spanish, and only real numbers (no average without a saved scan)", () => {
    const es = render("es", 15, null);
    expect(es).toContain("Consiga más reseñas en Google");
    expect(es).toContain("15 reseñas · cada reseña nueva ayuda");
    expect(es).not.toMatch(/promedio/);
  });

  test("a place of worship: only the tools that apply", () => {
    const html = render("en", 3, null, { referralOk: false, couponsOk: false, pricingOk: false });
    expect(html).not.toContain("Coupons");
    expect(html).not.toContain("Referrals");
    expect(html).not.toContain("Price check");
    expect(html).toContain("Weekly routine");
  });
});
