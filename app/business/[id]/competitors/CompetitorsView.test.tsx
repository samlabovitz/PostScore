import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";

vi.mock("@/app/actions/competitors", () => ({ refreshCompetitors: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { CompetitorsView } from "./CompetitorsView";
import type { GetCompetitorsResult } from "@/app/actions/competitors";
import type { SavedCompetitorEntry } from "@/lib/savedCompetitorScans";
import type { ScoreBreakdown } from "@/lib/scoring";

function entry(name: string, total: number, owner = false, extra: Partial<SavedCompetitorEntry> = {}): SavedCompetitorEntry {
  const checks = [
    { id: "visibility.rating", earnedPoints: 9, maxPoints: 10 },
    { id: "visibility.review_count", earnedPoints: owner ? 1 : 7, maxPoints: 10 },
    { id: "completeness.hours", earnedPoints: 3, maxPoints: 3 },
    { id: "website.has_website", earnedPoints: 4, maxPoints: 4 },
  ];
  return {
    placeId: name,
    name,
    isSubject: owner,
    address: null,
    distanceMeters: owner ? null : 800,
    rating: 4.5,
    reviewCount: owner ? 15 : 104,
    hasWebsite: true,
    total,
    grade: "C",
    scoringVersion: "1.9.0",
    breakdown: { total, grade: "C", scoringVersion: "1.9.0", categories: [], checks } as unknown as ScoreBreakdown,
    priceLevel: null,
    photoCount: 10,
    ...extra,
  };
}

const DATA: Extract<GetCompetitorsResult, { status: "ok" }> = {
  status: "ok",
  businessName: "Modern Liquors",
  businessAddress: null,
  language: "en",
  competitorNoun: "liquor stores",
  latest: {
    scanId: "s",
    createdAt: "2026-10-16T13:00:00Z",
    entries: [
      entry("Main Street Liquors", 88, false, { priceLevel: "PRICE_LEVEL_MODERATE" }),
      entry("Peddler's", 79),
      entry("Modern Liquors", 71, true),
    ],
  },
  rankHistory: [
    { scanId: "a", createdAt: "2026-09-20T13:00:00Z", rank: 3, of: 3, total: 72 },
    { scanId: "s", createdAt: "2026-10-16T13:00:00Z", rank: 3, of: 3, total: 71 },
  ],
  refresh: { allowed: false, nextAvailableAt: "2026-11-15T13:00:00.000Z" },
  scanBlocker: null,
  comparedViaTypes: [],
  timeZone: "America/New_York",
};

function render(data = DATA, locale: "en" | "es" = "en") {
  return renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <CompetitorsView businessId="biz" data={data} />
    </LocaleProvider>
  ).replace(/&#x27;/g, "'");
}

describe("Competitors page", () => {
  test("hero, scan date, refresh limit, price level and 'Compared over time' from saved data", () => {
    const html = render();
    expect(html).toContain("You're #3 of 3 nearby liquor stores");
    expect(html).toContain("Scanned Oct 16, 2026");
    expect(html).toContain("Available again on Nov 15, 2026");
    expect(html).toContain("Price level: $$");
    expect(html).toContain("Price level: Not listed by Google");
    expect(html).toContain("Compared over time");
  });

  test("fairness: the hero shows the comparable score, with the full PostScore only as context", () => {
    const html = render();
    expect(html).toContain("Comparable score");
    // Owner fixture: full PostScore 71, but on the shared checks it scores higher.
    expect(html).toMatch(/Your full PostScore is 71 — it also includes website checks we don't run on competitors\./);
    expect(html).toContain("Full PostScore 71");
  });

  test("lineup: #1, lowest and area average are labeled; a zoom note when the scale doesn't start at 0", () => {
    const html = render();
    // Long names are shortened on the strip, full name in the tooltip.
    expect(html).toMatch(/#1 Main Street Liq… · \d+/);
    expect(html).toContain('title="Main Street Liquors"');
    expect(html).toMatch(/Lowest: [^<]+ · \d+/);
    expect(html).toMatch(/Area average \d+/);
    expect(html).toMatch(/Scale shows \d+–\d+ — it doesn't start at 0\./);
  });

  test("the owner's card is highlighted and tagged", () => {
    const html = render();
    const owner = html.slice(html.indexOf(">Modern Liquors<") - 900, html.indexOf(">Modern Liquors<"));
    expect(owner).toContain("ring-brass/30");
    expect(html).toContain("Your business");
  });

  test("trailing on reviews links to the page that fixes it", () => {
    const html = render();
    expect(html).toContain("Where you trail");
    expect(html).toContain('href="/business/biz/website-reviews"');
  });

  test("no saved scan → honest 'not run yet' state with one button", () => {
    const html = render({ ...DATA, latest: null, rankHistory: [], refresh: { allowed: true, nextAvailableAt: null } });
    expect(html).toContain("Competitor scan not run yet");
    expect(html).toContain("Run competitor scan");
    expect(html).not.toContain("You're #");
  });

  test("a scan that searched and found none: the honest message with radius and date, the 30-day limit — never '#1 of 1' or 'not run yet' (EN + ES)", () => {
    const none = {
      ...DATA,
      latest: { scanId: "n", createdAt: "2026-10-16T13:00:00Z", entries: [entry("Modern Liquors", 71, true)] },
      rankHistory: [],
    };
    const html = render(none);
    expect(html).toContain("We looked for similar businesses within 5 mi and Google didn't list any. Scanned Oct 16, 2026.");
    expect(html).toContain("Available again on Nov 15, 2026");
    expect(html).not.toContain("You're #");
    expect(html).not.toContain("not run yet");
    expect(render(none, "es")).toContain("Buscamos negocios similares a menos de 5 mi y Google no indicó ninguno. Analizado el 16 oct 2026.");
  });

  test("Google lists only a general category: say so — no 'not run yet', no Run button (it would fail the same way)", () => {
    const html = render({ ...DATA, businessName: "Pop Culture Vulture", latest: null, rankHistory: [], refresh: { allowed: true, nextAvailableAt: null }, scanBlocker: "category_too_generic" });
    expect(html).toContain("Pop Culture Vulture's Google category is too general to match reliably");
    expect(html).not.toContain("not run yet");
    expect(html).not.toContain("Run competitor scan");
  });

  test("scanned by the owner's business type (Shoe Tech): names the kinds of businesses compared, EN + ES", () => {
    const shoeTech = { ...DATA, comparedViaTypes: ["laundry", "tailor"] };
    expect(render(shoeTech)).toContain(
      "Google's listing gives only a general category, so you're compared with the closest kinds of businesses nearby: dry cleaners and tailors."
    );
    expect(render(shoeTech, "es")).toContain("los negocios más parecidos de la zona: tintorerías y sastrerías.");
    expect(render(DATA)).not.toContain("general category");
  });

  test("'Compared over time' hides with fewer than 2 saved scans", () => {
    expect(render({ ...DATA, rankHistory: DATA.rankHistory.slice(1) })).not.toContain("Compared over time");
  });

  test("mobile-safe: no fixed widths wider than a 375px phone", () => {
    const html = render();
    const widths = Array.from(html.matchAll(/(?:w|min-w)-\[(\d+)px\]/g)).map((m) => Number(m[1]));
    expect(widths.every((w) => w <= 343)).toBe(true);
    expect(html).not.toMatch(/style="[^"]*width:\s*(?:[4-9]\d\d|\d{4,})px/);
  });

  test("ES (usted)", () => {
    const html = render(DATA, "es");
    expect(html).toContain("Usted ocupa el puesto #3 de 3 liquor stores de la zona");
    expect(html).toContain("Google no lo indica");
    expect(html).toContain("Dónde se queda atrás");
  });
});
