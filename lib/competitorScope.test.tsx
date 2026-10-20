import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/actions/niches", () => ({ setCompetitorAreas: vi.fn(), setCompetitorScope: vi.fn(), confirmBusinessNiche: vi.fn(), setBusinessNiche: vi.fn() }));

import { applyScope, availableAreas, defaultAreas, effectiveAreas, groupCompetitors, scopeNote, scopeSummary, type CompetitorScope } from "./competitorScope";
import { ownerStanding, rankBy, reportStanding } from "./competitorComparison";
import { rankPoint, type SavedCompetitorEntry, type SavedCompetitorScan } from "./savedCompetitorScans";
import { snapshotFromSavedRows } from "./monthlyReportExtras";
import { LocaleProvider } from "./i18n";
import { CompetitorGroups } from "@/app/business/[id]/competitors/CompetitorGroups";
import { NicheBanner } from "@/components/niche/NicheBanner";
import { NichePicker } from "@/components/niche/NichePicker";

const entry = (name: string, total: number, isSubject = false): SavedCompetitorEntry => ({
  placeId: name,
  name,
  isSubject,
  address: null,
  distanceMeters: isSubject ? null : 1000,
  rating: 4.5,
  reviewCount: 10,
  hasWebsite: true,
  total,
  grade: "C",
  scoringVersion: "1",
  breakdown: null,
  priceLevel: null,
  photoCount: 5,
  websiteUrl: null,
});

// Switch Skate & Snow's real saved scan names (Oct 2026), scores made up for the test.
const SKATE_SCAN: SavedCompetitorScan = {
  scanId: "s1",
  createdAt: "2026-10-01T12:00:00Z",
  entries: [
    entry("American Sports", 80),
    entry("R&M Hockey Supply Hollydell", 75),
    entry("Switch Skate & Snow", 70, true),
    entry("The Ski Bum", 65),
    entry("Dancer′s Dressing Room", 60),
    entry("X-Ring Supply", 55),
    entry("Zumiez Skate Shop", 50),
  ],
};
const SKATE: CompetitorScope = { nicheId: "skate_snow", parent: "specialty_store", areas: defaultAreas("skate_snow"), mode: "auto" };

describe("grouping a saved scan", () => {
  test("direct, each 'also competes with' area, and other similar businesses", () => {
    const g = groupCompetitors(SKATE_SCAN.entries, SKATE);
    expect(g.direct.map((e) => e.name)).toEqual(["Zumiez Skate Shop"]);
    expect(g.byArea.get("sporting_goods")?.map((e) => e.name)).toEqual(["American Sports"]);
    // Hockey and outdoor aren't in a skate shop's areas → "other similar".
    expect(g.byArea.get("specialty_store")?.map((e) => e.name)).toEqual(["R&M Hockey Supply Hollydell", "The Ski Bum", "Dancer′s Dressing Room", "X-Ring Supply"]);
    expect(availableAreas("skate_snow")).toEqual(["sporting_goods", "sneakers_streetwear", "retail_boutique", "shoe_store", "specialty_store"]);
  });

  test("a general niche: the whole scan is direct (today's behavior)", () => {
    const g = groupCompetitors(SKATE_SCAN.entries, { nicheId: "specialty_store", parent: "specialty_store" });
    expect(g.direct).toHaveLength(6);
    expect(applyScope(SKATE_SCAN, { nicheId: "specialty_store", parent: "specialty_store", areas: [], mode: "auto" }).scan.entries).toHaveLength(7);
  });
});

describe("ranking scope", () => {
  test("auto with fewer than 3 direct: direct + ticked areas, with the honest line (EN + ES)", () => {
    const r = applyScope(SKATE_SCAN, SKATE);
    expect(r.effective).toBe("wide");
    expect(r.autoWidened).toBe(true);
    expect(r.scan.entries).toHaveLength(7);
    expect(scopeNote(r, SKATE, "en")).toBe("Few direct competitors nearby (skate & snow shop: 1), so we're also comparing you with sporting goods and other similar businesses nearby.");
    expect(scopeNote(r, SKATE, "es")).toBe("Hay pocos competidores directos cerca (tienda de skate y snowboard: 1), así que también lo comparamos con artículos deportivos y otros negocios similares cercanos.");
  });

  test("auto with 3+ direct: direct only, no line", () => {
    const scan = { ...SKATE_SCAN, entries: [...SKATE_SCAN.entries, entry("Board Shop East", 40), entry("Snowboard Hut", 45)] };
    const r = applyScope(scan, SKATE);
    expect(r.effective).toBe("direct");
    expect(r.directCount).toBe(3);
    expect(scopeNote(r, SKATE, "en")).toBeNull();
    expect(r.scan.entries.map((e) => e.name)).toEqual(["Switch Skate & Snow", "Zumiez Skate Shop", "Board Shop East", "Snowboard Hut"]);
  });

  test("the owner can switch: direct only, or wide with only the ticked areas", () => {
    expect(applyScope(SKATE_SCAN, { ...SKATE, mode: "direct" }).scan.entries.map((e) => e.name)).toEqual(["Switch Skate & Snow", "Zumiez Skate Shop"]);
    const wide = applyScope(SKATE_SCAN, { ...SKATE, mode: "wide", areas: ["sporting_goods"] });
    expect(wide.scan.entries.map((e) => e.name)).toEqual(["American Sports", "Switch Skate & Snow", "Zumiez Skate Shop"]);
    expect(wide.autoWidened).toBe(false);
  });

  test("ticks are kept only when they're real areas of the niche; none saved = all", () => {
    expect(effectiveAreas("skate_snow", null)).toEqual(availableAreas("skate_snow"));
    expect(effectiveAreas("skate_snow", ["sporting_goods", "yoga", "nonsense"])).toEqual(["sporting_goods"]);
  });

  test("one shared rank: rankBy / ownerStanding / reportStanding / rank history / monthly report agree", () => {
    const direct = { ...SKATE, mode: "direct" as const };
    expect(ownerStanding(SKATE_SCAN, direct)).toMatchObject({ rank: 1, of: 2 });
    expect(rankBy(SKATE_SCAN, "overall", direct).find((r) => r.entry.isSubject)?.rank).toBe(1);
    expect(reportStanding(SKATE_SCAN, direct)).toMatchObject({ rank: 1, total: 2 });
    expect(rankPoint(SKATE_SCAN, direct)).toMatchObject({ rank: 1, of: 2 });
    // Wider set: behind American Sports and the hockey shop.
    expect(ownerStanding(SKATE_SCAN, SKATE)).toMatchObject({ rank: 3, of: 7 });
    // No scope: exactly as before.
    expect(ownerStanding(SKATE_SCAN)).toMatchObject({ rank: 3, of: 7 });
    const rows = SKATE_SCAN.entries.map((e) => ({ scan_id: "s1", created_at: SKATE_SCAN.createdAt, is_subject: e.isSubject, place_id: e.placeId, name: e.name, address: null, distance_meters: e.distanceMeters, rating: e.rating, review_count: e.reviewCount, has_website: true, total: e.total, grade: "C", scoring_version: "1", breakdown_json: null, price_level: null, photo_count: 5, website_url: null }));
    expect(snapshotFromSavedRows(rows as never, direct)).toMatchObject({ rank: 1, totalCompetitors: 2 });
  });

  test("PostAI is told who the rank is against", () => {
    expect(scopeSummary(applyScope(SKATE_SCAN, SKATE), SKATE)).toContain("direct competitors (Skate & snow shop: 1) plus sporting goods, other similar businesses nearby — widened automatically");
  });
});

describe("the UI pieces", () => {
  const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale} timeZone="America/New_York">
        {node}
      </LocaleProvider>
    );
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

  test("Competitors: groups, 'Counts for me' ticks, the scope toggle and the honest line", () => {
    const html = wrap(<CompetitorGroups businessId="b1" scan={SKATE_SCAN} scope={SKATE} scoped={applyScope(SKATE_SCAN, SKATE)} enabled onScopeChange={() => {}} />);
    const t = text(html);
    expect(t).toContain("Your type: Skate & snow shop");
    expect(t).toContain("Direct competitors · 1");
    expect(t).toContain("Zumiez Skate Shop");
    expect(t).toContain("Sporting goods · 1");
    expect(t).toContain("Other similar businesses nearby · 4");
    expect(html.match(/type="checkbox"/g)).toHaveLength(5);
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>Automatic</);
    expect(html).toContain('data-testid="scope-note"');
    const es = text(wrap(<CompetitorGroups businessId="b1" scan={SKATE_SCAN} scope={SKATE} scoped={applyScope(SKATE_SCAN, SKATE)} enabled onScopeChange={() => {}} />, "es"));
    expect(es).toContain("Competidores directos · 1");
    expect(es).toContain("Cuenta para mí");
  });

  test("the one-time banner: 'We think you're…', the suggestion, and 'tell us' (EN + ES)", () => {
    expect(text(wrap(<NicheBanner businessId="b1" kind="weThink" nicheId="skate_snow" suggestion={null} parentLabel="Specialty Store" />))).toContain("We think you're a Skate & snow shop.");
    expect(text(wrap(<NicheBanner businessId="b1" kind="suggest" nicheId="cafe" suggestion="ice_cream" parentLabel="Café / Coffee Shop" />))).toContain("We think you're an Ice cream & frozen yogurt shop (you chose Café / Coffee Shop).");
    expect(text(wrap(<NicheBanner businessId="b1" kind="needsOwner" nicheId="lawyer" suggestion={null} parentLabel="Law Firm" />))).toContain("Tell us what kind of law firm you are");
    const es = text(wrap(<NicheBanner businessId="b1" kind="weThink" nicheId="skate_snow" suggestion={null} parentLabel="Tienda especializada" />, "es"));
    expect(es).toContain("Creemos que su negocio es: Tienda de skate y snowboard.");
    expect(es).toContain("Cambiar");
  });

  test("Settings: a searchable list grouped by type, the business's own type first", () => {
    const html = wrap(<NichePicker businessId="b1" nicheId="skate_snow" source="detected" suggestion={null} />);
    const t = text(html);
    expect(t).toContain("Current: Skate & snow shop (we detected this)");
    expect(html).toContain('type="search"');
    expect(html.indexOf("Specialty Store")).toBeLessThan(html.indexOf("Salon &amp; Personal Care"));
    expect(html).toMatch(/aria-selected="true"[^>]*>Skate &amp; snow shop</);
  });
});
