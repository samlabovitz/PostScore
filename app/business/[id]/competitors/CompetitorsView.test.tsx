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
      entry("Corner Liquor", 60),
    ],
  },
  rankHistory: [
    { scanId: "a", createdAt: "2026-09-20T13:00:00Z", rank: 3, of: 4, score: 72, headToHead: false },
    { scanId: "s", createdAt: "2026-10-16T13:00:00Z", rank: 3, of: 4, score: 71, headToHead: false },
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
    expect(html).toContain("You're #3 of 4 nearby liquor stores");
    expect(html).toContain("Scanned Oct 16, 2026");
    expect(html).toContain("Available again on Nov 15, 2026");
    expect(html).toContain("Price level: $$");
    expect(html).toContain("Price level: Not listed by Google");
    expect(html).toContain("Compared over time");
  });

  test("the hero's score is labeled as compared like for like, with a small link to the full PostScore (EN + ES)", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <CompetitorsView businessId="biz" data={DATA} fullScore={80} />
      </LocaleProvider>
    ).replace(/&#x27;/g, "'");
    expect(html).toMatch(/Your PostScore — compared like for like<\/span><span[^>]*>71</);
    expect(html).toContain("Listing, reviews and website. Review replies, recent reviews and customer details aren't counted, because competitors can't be checked for them.");
    expect(html).toMatch(/<a[^>]*href="\/business\/biz"[^>]*>Your full PostScore: <!-- -->80<!-- --> →<\/a>|<a[^>]*href="\/business\/biz"[^>]*>Your full PostScore: 80 →<\/a>/);
    const es = renderToStaticMarkup(
      <LocaleProvider locale="es">
        <CompetitorsView businessId="biz" data={DATA} fullScore={80} />
      </LocaleProvider>
    );
    expect(es).toContain("Su PostScore — comparado en igualdad de condiciones");
    expect(es).toContain("Su PostScore completo: 80 →");
    // Without the full score: no link, never a made-up number.
    expect(render()).not.toContain("Your full PostScore");
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
    expect(html).toContain("Usted ocupa el puesto #3 de 4 liquor stores de la zona");
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

describe("only 1–2 competitors: a head-to-head, never a rank", () => {
  const history = DATA.rankHistory.map((p) => ({ ...p, of: 2, headToHead: true }));
  const two = { ...DATA, rankHistory: history, latest: { ...DATA.latest!, entries: DATA.latest!.entries.filter((e) => e.name !== "Corner Liquor" && e.name !== "Peddler's") } };
  test("EN: the head-to-head line with side-by-side scores and Add a competitor; no '#1 of 2', no '#' on the list", () => {
    const html = render(two);
    expect(html).toContain("Only 1 business like yours within 15 miles — here's how you compare with Main Street Liquors");
    expect(html).toContain('data-testid="head-to-head"');
    expect(html).toMatch(/href="#add-competitor"[^>]*>Add a competitor/);
    expect(html).not.toMatch(/#\d+ of \d+/);
    expect(html).not.toMatch(/>#\d+</);
    // “Compared over time” says head-to-head for those scans.
    expect(html).toContain("Head-to-head");
  });
  test("ES (usted), and two competitors read “A y B”", () => {
    const withTwo = { ...DATA, rankHistory: history, latest: { ...DATA.latest!, entries: DATA.latest!.entries.filter((e) => e.name !== "Corner Liquor") } };
    const html = render(withTwo, "es");
    expect(html).toContain("Solo hay 2 negocios como el suyo a menos de 15 millas: así se compara con Main Street Liquors y Peddler's");
    expect(html).toContain("Agregar un competidor");
    expect(html).not.toMatch(/#\d+ de \d+/);
  });
  test("ranks return at 3+", () => {
    expect(render()).not.toContain('data-testid="head-to-head"');
  });
});

describe("live Google values that couldn't load", () => {
  const missing = (e: SavedCompetitorEntry): SavedCompetitorEntry =>
    ({ ...e, name: e.isSubject ? e.name : null, rating: null, reviewCount: null, priceLevel: null, photoCount: null, liveMissing: true });

  test("all of them: the one-line fallback, '—' for names, ratings, reviews and price; ranks and scores stay (EN + ES)", () => {
    const data = { ...DATA, latest: { ...DATA.latest!, entries: DATA.latest!.entries.map(missing) } };
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <CompetitorsView businessId="biz" data={data} liveUnavailable />
      </LocaleProvider>
    ).replace(/&#x27;/g, "'");
    expect(html).toContain("Couldn't load from Google right now");
    expect(html).toContain("You're #3 of 4 nearby liquor stores");
    // Unknown price: the line is hidden, not "—" and not "Not listed".
    expect(html).not.toContain("Price level");
    expect(html).toMatch(/—(<!-- -->)? · (<!-- -->)?—/);
    // Unknown review count: never the "few or no reviews" badge.
    expect(html).not.toContain('data-testid="few-reviews-tag"');
    // At the top, right under the title: before the scan date, the hero and the list.
    const at = html.indexOf('data-testid="live-unavailable"');
    expect(at).toBeGreaterThan(html.indexOf("Competitors</h1>"));
    expect(at).toBeLessThan(html.indexOf("Scanned Oct 16, 2026"));
    expect(at).toBeLessThan(html.indexOf("You're #3 of 4"));
    expect(html).not.toContain("(unnamed listing)");
    expect(html).not.toContain("No rating");
    expect(html).not.toContain("Not listed by Google");
    const es = renderToStaticMarkup(
      <LocaleProvider locale="es">
        <CompetitorsView businessId="biz" data={data} liveUnavailable />
      </LocaleProvider>
    );
    expect(es).toContain("No se pudo cargar desde Google en este momento");
  });

  test("a value Google really doesn't list still says so; no fallback line when everything loaded", () => {
    const data = { ...DATA, latest: { ...DATA.latest!, entries: DATA.latest!.entries.map((e) => (e.isSubject ? e : { ...e, rating: null, liveMissing: false })) } };
    const html = render(data);
    expect(html).toContain("No rating");
    expect(html).not.toContain("Couldn't load from Google right now");
  });
});

describe("labels built from live counts, when part of the list didn't load", () => {
  // One competitor's values missing; the rest (and the owner) loaded.
  const partial = (): Extract<GetCompetitorsResult, { status: "ok" }> => ({
    ...DATA,
    latest: {
      ...DATA.latest!,
      entries: DATA.latest!.entries.map((e) =>
        e.name === "Peddler's" ? { ...e, name: null, rating: null, reviewCount: null, priceLevel: null, photoCount: null, liveMissing: true } : { ...e, liveMissing: false }
      ),
    },
  });
  const view = (data: Extract<GetCompetitorsResult, { status: "ok" }>, unavailable: boolean) =>
    renderToStaticMarkup(
      <LocaleProvider locale="en">
        <CompetitorsView businessId="biz" data={data} liveUnavailable={unavailable} />
      </LocaleProvider>
    ).replace(/&#x27;/g, "'");

  test("a known low count still gets the badge; the unknown one doesn't", () => {
    const data = partial();
    data.latest!.entries = data.latest!.entries.map((e) => (e.name === "Corner Liquor" ? { ...e, reviewCount: 3 } : e));
    const html = view(data, true);
    expect(html.match(/data-testid="few-reviews-tag"/g)?.length).toBe(1);
  });

  test("the review goal and the review-count gap are hidden (a partial average would mislead); they show when everything loaded", () => {
    const html = view(partial(), true);
    expect(html).not.toContain('data-testid="competitors-review-goal"');
    expect(html).not.toContain("Review count");
    const full = view({ ...DATA, latest: { ...DATA.latest!, entries: DATA.latest!.entries.map((e) => ({ ...e, liveMissing: false })) } }, false);
    expect(full).toContain('data-testid="competitors-review-goal"');
    expect(full).toContain("Review count");
    expect(full).not.toContain("Couldn't load from Google right now");
  });

  test("the price line stays for places that loaded, and only theirs", () => {
    const html = view(partial(), true);
    expect(html.match(/Price level:/g)?.length).toBe(3);
  });
});

describe("'Also nearby' and 'Removed by you': Google's values read live", () => {
  test("a listing whose name and review count loaded shows them; one that didn't shows '—', never '0 reviews'", () => {
    const data = {
      ...DATA,
      alsoNearby: [
        { placeId: "x1", name: "Tiny Liquor", distanceMeters: 400, reviewCount: 3 },
        { placeId: "x2", name: null, distanceMeters: 600, reviewCount: null },
      ],
    };
    const html = render(data);
    expect(html).toContain("Tiny Liquor");
    expect(html).toMatch(/3(<!-- -->)? reviews/);
    expect(html).not.toMatch(/>0(<!-- -->)? reviews/);
    // The name, and the count after the distance.
    expect(html).toMatch(/title=""?[^>]*>—<|<span class="min-w-0 truncate text-ink">—</);
    expect(html).toMatch(/·(<!-- -->)? (<!-- -->)?—/);
  });
});

describe("a competitor whose Google website link doesn't reach a real site", () => {
  const flagged = (gap: string) => {
    const e = entry("Kathy's Crusty Creations", 60);
    const checks = e.breakdown!.checks.map((c) => (c.id === "website.has_website" ? { ...c, earnedPoints: 0, gaps: [gap], meta: { fullScore: "1" } } : c));
    return { ...e, breakdown: { ...e.breakdown!, checks } };
  };
  const withEntry = (e: SavedCompetitorEntry) => ({ ...DATA, latest: { ...DATA.latest!, entries: [...DATA.latest!.entries, e] } });

  test("is flagged on its card like the owner's own dead-link check (EN + ES)", () => {
    expect(render(withEntry(flagged("listing_parked")))).toContain("Website link on Google goes to a parked domain");
    expect(render(withEntry(flagged("listing_broken")))).toContain("Website link on Google doesn’t work");
    expect(render(withEntry(flagged("listing_parked")), "es")).toContain("El enlace al sitio web en Google lleva a un dominio estacionado");
    expect(render(withEntry(flagged("listing_broken")), "es")).toContain("El enlace al sitio web en Google no funciona");
  });

  test("a working link shows no flag", () => {
    expect(render()).not.toContain('data-testid="listing-link-problem"');
  });
});

describe("speed-up wording (EN + ES)", () => {
  const withHasSite = (meta: Record<string, string>, earned: number | null = 4) => {
    const e = entry("Rival Bakery", 70);
    const checks = e.breakdown!.checks.map((c) => (c.id === "website.has_website" ? { ...c, earnedPoints: earned, meta } : c.category === "website" && earned === null ? { ...c, earnedPoints: null } : c));
    return { ...e, breakdown: { ...e.breakdown!, checks } };
  };
  const withEntry = (e: SavedCompetitorEntry, extra: Partial<typeof DATA> = {}) => ({ ...DATA, ...extra, latest: { ...DATA.latest!, entries: [...DATA.latest!.entries, e] } });

  test("'Updating — X of Y websites checked' while the new scan's websites fill in", () => {
    const data = { ...DATA, scoring: { scanId: "s", kind: "new_scan" as const, status: "running" as const, done: 3, total: 7, error: null }, updating: { done: 3, total: 7 } };
    expect(render(data)).toContain("Updating — 3 of 7 websites checked");
    expect(render(data, "es")).toContain("Actualizando: 3 de 7 sitios web revisados");
    expect(render(data)).not.toContain("The new scan appears when every site is done.");
  });

  test("a site still being checked: 'checking…'", () => {
    const pending = withHasSite({ websitePending: "1" }, null);
    expect(render(withEntry(pending, { updating: { done: 1, total: 2 } }))).toContain("Website checking…");
    expect(render(withEntry(pending, { updating: { done: 1, total: 2 } }), "es")).toContain("revisando…");
  });

  test("a reused result: 'Website checked {date}'", () => {
    const reused = withHasSite({ fullScore: "1", websiteCheckedAt: "2026-11-15T15:00:00Z" });
    expect(render(withEntry(reused))).toContain("Website checked Nov 15, 2026");
    expect(render(withEntry(reused), "es")).toContain("Sitio web revisado el 15 nov 2026");
  });

  test("past the 5-minute limit: 'couldn't be checked (timed out) — we'll try again next refresh'", () => {
    const slow = withHasSite({ fullScore: "1", websiteNotChecked: "deadline" }, null);
    expect(render(withEntry(slow))).toContain("Website couldn’t be checked (timed out) — we’ll try again next refresh");
    expect(render(withEntry(slow), "es")).toContain("No se pudo revisar el sitio web (se agotó el tiempo); lo intentaremos de nuevo en la próxima actualización");
  });
});

describe("Browser-check fixes", () => {
  test("a broken or parked listing link says 'Website link broken', never 'Has website' (EN + ES)", () => {
    const e = entry("Kathy's Crusty Creations", 42);
    const checks = e.breakdown!.checks.map((c) => (c.id === "website.has_website" ? { ...c, earnedPoints: 0, gaps: ["listing_broken"], meta: { fullScore: "1" } } : c));
    const data = { ...DATA, latest: { ...DATA.latest!, entries: [...DATA.latest!.entries, { ...e, breakdown: { ...e.breakdown!, checks } }] } };
    // Her card in the ranked list (the chart at the top names her too).
    const card = (html: string) => {
      const at = html.lastIndexOf("<li", html.lastIndexOf("Kathy's Crusty Creations</span>"));
      return html.slice(at, html.indexOf("</li>", at));
    };
    expect(card(render(data))).toContain("Website link broken");
    expect(card(render(data))).not.toContain("Has website");
    expect(card(render(data, "es"))).toContain("Enlace al sitio web roto");
  });

  test("'Also nearby' rows whose name couldn't be read are left out, never shown as '—'", async () => {
    const page = (await import("node:fs")).readFileSync("app/business/[id]/competitors/page.tsx", "utf8");
    expect(page).toContain("alsoNearby: alsoNearby.map((l) => withLiveListing(l, live.extra[l.placeId])).filter((l) => !!l.name),");
    expect(page).toContain("{ ...fetched, alsoNearby: [] }");
  });
});
