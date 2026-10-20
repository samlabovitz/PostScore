import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { SEARCH_DEMAND_EXAMPLE, type SearchDemandData } from "@/lib/gbp/searchDemand";
import { SearchDemandSection, formatAreaVolume, formatInsightsCount, formatPercent, type SearchDemandView } from "./SearchDemandSection";
import { ConnectGbpView } from "@/app/business/[id]/connect-gbp/ConnectGbpView";

const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {node}
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const render = (view: SearchDemandView, locale: "en" | "es" = "en") => wrap(<SearchDemandSection businessId="b1" view={view} />, locale);

const LIVE: SearchDemandData = {
  ...SEARCH_DEMAND_EXAMPLE,
  example: false,
  businessName: "Modern Liquors",
  city: "Newark",
  area: { ...SEARCH_DEMAND_EXAMPLE.area!, source: "google_keyword_planner", searches: [{ keyword: "wine store near me", volume: { kind: "range", low: 1000, high: 10000 } }] },
};

describe("formatting", () => {
  test("hidden counts are words, never numbers", () => {
    expect(formatInsightsCount({ kind: "fewer_than", threshold: 15 }, "en")).toBe("fewer than 15");
    expect(formatInsightsCount({ kind: "fewer_than", threshold: 15 }, "es")).toBe("menos de 15");
    expect(formatInsightsCount({ kind: "exact", value: 1234 }, "en")).toBe("1,234");
  });
  test("ranges stay ranges; percents", () => {
    expect(formatAreaVolume({ kind: "range", low: 1000, high: 10000 }, "en")).toBe("1K–10K");
    expect(formatAreaVolume({ kind: "range", low: 1000, high: 10000 }, "es")).toBe("1 mil–10 mil");
    expect(formatAreaVolume({ kind: "estimate", value: 1300 }, "en")).toBe("≈1,300");
    expect(formatPercent(311 / 4550, "en")).toBe("6.8%");
    expect(formatPercent(0.47, "es")).toBe("47 %");
  });
});

describe("locked preview", () => {
  const html = render({ kind: "preview", data: SEARCH_DEMAND_EXAMPLE });
  test("watermark, Example badges and the launch note", () => {
    expect(html).toContain('data-testid="example-watermark"');
    expect(text(html)).toContain("Example — these aren't your numbers");
    expect(text(html)).toContain("Available with Premium once Google connection launches.");
    // One badge on the banner + one on each of the 5 cards.
    expect(html.match(/>Example</g)?.length).toBeGreaterThanOrEqual(6);
  });
  test("every section renders", () => {
    const s = text(html);
    for (const heading of ["Your Google funnel", "What people searched to find you", "Searches in your area", "Room to grow", "How to show up for more"]) expect(s).toContain(heading);
    expect(s).toContain("Estimated monthly searches in Springfield — estimate, not exact");
    expect(s).toContain("fewer than 15");
    expect(html.match(/<li class="flex items-center gap-3 border-b/g)).toHaveLength(10);
    expect(s).toContain("Add “wine” to your business description");
    expect(html).toContain('href="/business/b1/website#check-services_presence"');
  });
  test("the toggle defaults to monthly and the funnel shows the latest month", () => {
    expect(html).toMatch(/aria-pressed="true"[^>]*>Monthly/);
    expect(html).toMatch(/data-testid="funnel-period"[^>]*>September 2026</);
    expect(html).toMatch(/data-testid="funnel-views"[^>]*>4,550</);
    expect(text(html)).toContain("6.8% of views turned into a call, click or directions request");
  });
  test("room to grow is a share of searches, never 'customers you're missing'", () => {
    const s = text(html);
    expect(s).toContain("Your listing showed up for about 47% of estimated local searches.");
    expect(s).toContain("searches you could be showing up for");
    expect(s.toLowerCase()).not.toContain("customers you're missing");
  });
  test("Spanish", () => {
    const es = text(render({ kind: "preview", data: SEARCH_DEMAND_EXAMPLE }, "es"));
    expect(es).toContain("Ejemplo — estas no son sus cifras");
    expect(es).toContain("Búsquedas mensuales estimadas en Springfield — estimación, no exacta");
    expect(es).toContain("menos de 15");
    expect(es).toContain("Su ficha apareció en aproximadamente el 47 % de las búsquedas locales estimadas.");
  });
});

describe("other states", () => {
  test("connected but no data yet: an honest waiting card, no numbers", () => {
    const html = render({ kind: "awaiting" });
    expect(text(html)).toContain("Connected — waiting for Google's numbers");
    expect(text(html)).not.toMatch(/\d/);
  });
  test("live: no watermark, ranges shown as ranges", () => {
    const html = render({ kind: "live", data: LIVE });
    expect(html).not.toContain("example-watermark");
    expect(html).not.toContain(">Example<");
    expect(text(html)).toContain("1K–10K");
    expect(text(html)).toContain("about 46–100% of estimated");
  });
  test("live refuses example data", () => {
    expect(render({ kind: "live", data: SEARCH_DEMAND_EXAMPLE })).toBe("");
  });
});

describe("Connect page", () => {
  const props = { businessId: "b1", businessName: "Shop", connected: false, connectedAt: null, justConnected: false, error: null, oauthConfigured: true, connectOpen: false };
  test("9 cards in a 3-column grid; the new card links to the preview; Connect stays disabled", () => {
    const html = wrap(<ConnectGbpView {...props} />);
    expect(html).toMatch(/data-testid="connect-unlocks"/);
    expect(html).toContain("lg:grid-cols-3");
    expect(text(html)).toContain("Search demand & missed customers");
    expect(text(html)).toContain("See how many people find you on Google each month, what they searched, and how many actually called, clicked or got directions.");
    expect(html).toContain('href="/business/b1/growth?tab=google-profile#search-demand"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="connect-gbp-availability"/);
  });
});
