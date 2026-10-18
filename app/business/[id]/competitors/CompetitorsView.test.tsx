import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";

vi.mock("@/app/actions/competitors", () => ({ refreshCompetitors: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { CompetitorsView } from "./CompetitorsView";
import type { GetCompetitorsResult } from "@/app/actions/competitors";
import type { SavedCompetitorEntry } from "@/lib/savedCompetitorScans";
import { breakdownFromChecks, type CheckResult, type ScoreBreakdown } from "@/lib/scoring";

function entry(name: string, total: number, owner = false, extra: Partial<SavedCompetitorEntry> = {}): SavedCompetitorEntry {
  const c = (id: string, earnedPoints: number | null, maxPoints: number) =>
    ({ id, label: id, category: id.split(".")[0], maxPoints, earnedPoints, confidence: earnedPoints === null ? "UNCERTAIN" : "VERIFIED", explanation: "", meta: null }) as CheckResult;
  const checks = [
    c("visibility.rating", 9, 10),
    c("visibility.review_count", owner ? 1 : 7, 10),
    c("completeness.hours", 3, 3),
    c("website.has_website", 4, 4),
    c("website.https", 6, 6),
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
    breakdown: { ...breakdownFromChecks(checks), total, grade: "C", scoringVersion: "1.9.0" } as ScoreBreakdown,
    priceLevel: null,
    photoCount: 10,
    websiteUrl: "https://example.com",
    ...extra,
  };
}

const DATA: Extract<GetCompetitorsResult, { status: "ok" }> = {
  status: "ok",
  scoring: null,
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
    { scanId: "a", createdAt: "2026-09-20T13:00:00Z", rank: 3, of: 3, score: 72 },
    { scanId: "s", createdAt: "2026-10-16T13:00:00Z", rank: 3, of: 3, score: 71 },
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

  test("one score everywhere: the hero shows the owner's own PostScore — no separate 'comparable' number", () => {
    const html = render();
    expect(html).toMatch(/Your PostScore<\/span><span[^>]*>71</);
    expect(html).not.toContain("Comparable score");
    expect(html).not.toContain("Full PostScore");
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

describe("Website chip and 'couldn't be checked'", () => {
  test("the chip shows the full Website category; blocked sites are marked and the page says why — EN + ES", () => {
    const latest = DATA.latest!;
    const blocked = latest.entries[2];
    const blockedChecks = [
      ...blocked.breakdown!.checks
        .filter((c) => c.id !== "website.https")
        .map((c) => (c.id === "website.has_website" ? { ...c, meta: { fullScore: "1", websiteNotChecked: "blocked" } } : c)),
      { id: "website.content_depth", label: "", category: "website", maxPoints: 4, earnedPoints: null, confidence: "UNCERTAIN", explanation: "", meta: null, excludedReason: "unreachable" } as CheckResult,
    ];
    const data = {
      ...DATA,
      latest: {
        ...latest,
        entries: [
          latest.entries[0],
          { ...latest.entries[1], hasWebsite: false, websiteUrl: null },
          { ...blocked, breakdown: { ...breakdownFromChecks(blockedChecks), total: blocked.total, grade: "C", scoringVersion: "1.11.0" } as ScoreBreakdown },
        ],
      },
    };
    const html = render(data);
    expect(html).toContain("Website 100%");
    expect(html).toContain("Website No website");
    expect(html).not.toContain("basic check");
    expect(html).not.toContain("Not checked for competitors");
    expect(render(data, "es")).toContain("Sitio web Sin sitio web");
    expect(html).toContain("Website couldn’t be checked: the site blocks automated checks");
    expect(html).toContain("Some websites couldn’t be checked — their rank is based on the other checks.");
    expect(render(DATA)).not.toContain("Some websites couldn’t be checked");
  });

  test("a site with no measured website check: 'couldn't check' with the reason — never 100% from just having a site", () => {
    const latest = DATA.latest!;
    const e = latest.entries[0];
    const checks = e.breakdown!.checks.filter((c) => c.id !== "website.https").map((c) =>
      c.id === "website.has_website" ? { ...c, earnedPoints: null, confidence: "UNCERTAIN" as const, excludedReason: "unreachable" as const, meta: { websiteNotChecked: "blocked", fullScore: "1" } } : c
    );
    const blocked = { ...e, breakdown: { ...breakdownFromChecks(checks), total: e.total, grade: "C", scoringVersion: "1.11.0" } as ScoreBreakdown };
    const html = render({ ...DATA, latest: { ...latest, entries: [blocked, ...latest.entries.slice(1)] } });
    expect(html).toContain("Website couldn’t check: the site blocks automated checks");
    expect(html).toContain("Website couldn’t be checked: the site blocks automated checks");
    // The legacy shape (has_website measured, nothing else): still not 100%.
    const onlyHasSite = e.breakdown!.checks.filter((c) => c.id !== "website.https");
    const legacyEntry = { ...e, breakdown: { ...breakdownFromChecks(onlyHasSite), total: e.total, grade: "C", scoringVersion: "1.11.0" } as ScoreBreakdown };
    const legacy = render({ ...DATA, latest: { ...latest, entries: [legacyEntry, ...latest.entries.slice(1)] } });
    // Not reached by full scoring yet: "not checked yet" — no "couldn't" mark or note.
    expect(legacy).toContain("Website not checked yet");
    expect(legacy).not.toContain("couldn’t be checked");
  });

  test("while a scan is being scored: honest progress, and the last finished results stay", () => {
    const html = render({ ...DATA, scoring: { scanId: "n", kind: "new_scan", status: "running", done: 7, total: 11, error: null } });
    expect(html).toContain("Checking 7 of 11 competitor websites…");
    expect(html).toContain("The new scan appears when every site is done.");
    expect(html).toContain("Main Street Liquors");
    const first = render({ ...DATA, latest: null, rankHistory: [], scoring: { scanId: "n", kind: "new_scan", status: "running", done: 2, total: 9, error: null } });
    expect(first).toContain("Checking 2 of 9 competitor websites…");
    expect(first).not.toContain("Run your first competitor scan");
    expect(render({ ...DATA, scoring: { scanId: "n", kind: "backfill", status: "failed", done: 4, total: 10, error: "x" } })).toContain("paused (4 of 10 done)");
  });
});
