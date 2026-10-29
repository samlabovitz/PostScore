import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/actions/niches", () => ({ confirmBusinessNiche: vi.fn(), setBusinessNiche: vi.fn() }));

import { applyScope, availableAreas, defaultAreas, effectiveAreas, groupCompetitors, scopeNote, scopeSummary, type CompetitorScope } from "./competitorScope";
import { ownerStanding, rankBy, reportStanding } from "./competitorComparison";
import { rankPoint, type SavedCompetitorEntry, type SavedCompetitorScan } from "./savedCompetitorScans";
import { snapshotFromSavedRows } from "./monthlyReportExtras";
import { LocaleProvider } from "./i18n";
import { ComparedWithLine } from "@/app/business/[id]/competitors/CompetitorsView";
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

describe("ranking: the whole saved list (competitor selection v2)", () => {
  test("no more narrowing: Automatic / Direct only / Direct + areas all rank against every saved competitor", () => {
    for (const mode of ["auto", "direct", "wide"] as const) {
      const r = applyScope(SKATE_SCAN, { ...SKATE, mode });
      expect(r.scan.entries).toHaveLength(7);
      expect(r.autoWidened).toBe(false);
      expect(scopeNote(r, SKATE, "en")).toBeNull();
    }
    // The groups are still counted (for wording only).
    expect(applyScope(SKATE_SCAN, SKATE).directCount).toBe(1);
  });

  test("ticks are kept only when they're real areas of the niche; none saved = all — they still widen the scan's search", () => {
    expect(effectiveAreas("skate_snow", null)).toEqual(availableAreas("skate_snow"));
    expect(effectiveAreas("skate_snow", ["sporting_goods", "yoga", "nonsense"])).toEqual(["sporting_goods"]);
  });

  test("one shared rank: rankBy / ownerStanding / reportStanding / rank history / monthly report agree — with or without a saved scope", () => {
    const direct = { ...SKATE, mode: "direct" as const };
    for (const scope of [direct, SKATE, undefined]) {
      expect(ownerStanding(SKATE_SCAN, scope)).toMatchObject({ rank: 3, of: 7 });
      expect(rankBy(SKATE_SCAN, "overall", scope).find((r) => r.entry.isSubject)?.rank).toBe(3);
      expect(reportStanding(SKATE_SCAN, scope)).toMatchObject({ rank: 3, total: 7 });
      expect(rankPoint(SKATE_SCAN, scope)).toMatchObject({ rank: 3, of: 7 });
    }
    const rows = SKATE_SCAN.entries.map((e) => ({ scan_id: "s1", created_at: SKATE_SCAN.createdAt, is_subject: e.isSubject, place_id: e.placeId, name: e.name, address: null, distance_meters: e.distanceMeters, rating: e.rating, review_count: e.reviewCount, has_website: true, total: e.total, grade: "C", scoring_version: "1", breakdown_json: null, price_level: null, photo_count: 5, website_url: null }));
    expect(snapshotFromSavedRows(rows as never, direct)).toMatchObject({ rank: 3, totalCompetitors: 7 });
  });

  test("PostAI is told who the rank is against", () => {
    expect(scopeSummary(applyScope(SKATE_SCAN, SKATE))).toBe("all 6 saved competitors — the businesses Google shows when customers search for this kind of business nearby");
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

  test("Competitors: one line instead of the card — no 'Rank against' tabs, no 'Counts for me' ticks (EN + ES)", () => {
    const query = { noun: "skate & snow shops", query: "skate & snow shops in Newark, DE" };
    const html = wrap(<ComparedWithLine businessId="b1" count={6} comparedWith={query} fallbackNoun="shops" />);
    expect(text(html)).toContain("Compared with 6 skate & snow shops near you — the ones Google shows when customers search “skate & snow shops in Newark, DE”.");
    expect(html).toContain('href="/business/b1/settings#business-type"');
    expect(html).toContain('href="#add-competitor"');
    expect(html).not.toMatch(/Counts for me|Rank against|type="checkbox"|role="tab"/);
    expect(text(wrap(<ComparedWithLine businessId="b1" count={6} comparedWith={query} fallbackNoun="tiendas" />, "es"))).toContain("Comparado con 6 tiendas cerca de usted: los que Google muestra cuando los clientes buscan “skate & snow shops in Newark, DE”.");
    expect(text(wrap(<ComparedWithLine businessId="b1" count={3} comparedWith={{ noun: null, query: null }} fallbackNoun="salons" />))).toContain("Compared with 3 salons near you.");
    expect(wrap(<ComparedWithLine businessId="b1" count={0} comparedWith={query} fallbackNoun="shops" />)).toBe("");
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
