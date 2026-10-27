import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";

vi.mock("@/app/actions/pricing", () => ({
  addPriceRow: vi.fn(),
  updatePriceRow: vi.fn(),
  deletePriceRow: vi.fn(),
  assessPricing: vi.fn(),
}));

import { PricingView } from "./PricingView";
import { bizProfileById } from "@/config/bizProfiles";
import type { StoredPricingAssessment } from "@/app/actions/pricing";

const PRICES = [
  { id: "p1", business_id: "b", service: "Tropicana Orange Juice", price: 5.49, size: "52 oz", created_at: "2026-10-01T00:00:00Z" },
  { id: "p2", business_id: "b", service: "Goya Black Beans", price: 1.59, size: null, created_at: "2026-10-01T00:00:00Z" },
];
const ASSESSMENT: StoredPricingAssessment = {
  assessments: [
    { service: "Tropicana Orange Juice", price: 5.49, size: "52 oz", tier: "competitive", basis: "general_estimate", guidance: "A general estimate.", typicalLow: 4, typicalHigh: 6.5 },
    { service: "Goya Black Beans", price: 1.59, tier: "competitive", basis: "general_estimate", guidance: "Older assessment, no range." },
  ],
  priceLevelContext: null,
  locale: "en",
  assessedAt: "2026-10-16T12:00:00Z",
};

function render(locale: "en" | "es" = "en", profileId = "grocery_market") {
  return renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <PricingView
        businessId="b"
        businessName="CTown"
        profile={bizProfileById(profileId, locale)!}
        initialPrices={PRICES}
        initialAssessment={ASSESSMENT}
      />
    </LocaleProvider>
  );
}

describe("Day 4b: size and the typical range on the Pricing page", () => {
  test("each item has an optional size field, filled in when saved", () => {
    const html = render();
    expect(html).toContain('value="52 oz"');
    expect(html.match(/placeholder="Size \(optional\)"/g)?.length).toBe(3); // 2 rows + the new-item row
  });

  test("the result shows the size, 'General estimate' and 'Typical ~$4–$6.50'; an old result without a range shows none", () => {
    const html = render();
    expect(html).toContain("(52 oz)");
    expect(html).toContain("General estimate");
    expect(html).toContain("Typical ~$4–$6.50");
    expect(html.match(/Typical ~/g)).toHaveLength(1);
  });

  test("specific grocery examples with brand and size, EN + ES", () => {
    expect(render()).toContain("Tropicana Orange Juice, 52 oz");
    const es = render("es");
    expect(es).toContain("Jugo de naranja Tropicana, 52 oz");
    expect(es).toContain("Precio típico ~$4–$6.50");
    expect(es).toContain('placeholder="Tamaño (opcional)"');
  });

  test("a place of worship: the honest note, no price inputs", () => {
    const html = render("en", "place_of_worship");
    expect(html).toContain("Price checks don&#x27;t apply to a place of worship");
    expect(html).not.toContain("Size (optional)");
  });
});

describe("Price map and the cleaned-up layout", () => {
  const LIQUOR: StoredPricingAssessment = {
    assessments: [
      { service: "Tito's Vodka", price: 24, size: "750 ml", tier: "upper_mid", basis: "general_estimate", guidance: "g1", typicalLow: 20, typicalHigh: 28 },
      { service: "Josh Cabernet", price: 15, size: "750 ml", tier: "competitive", basis: "general_estimate", guidance: "g2", typicalLow: 13, typicalHigh: 20 },
      { service: "Bottle of Wine", price: 12, tier: "no_data", basis: "no_data", guidance: "g3", reason: "needs_brand_and_size" },
      { service: "Pappy Van Winkle 15", price: 1500, tier: "no_data", basis: "no_data", guidance: "g4", reason: "collectible", suggestedRetail: 120 },
    ],
    priceLevelContext: { subjectSymbol: null, competitors: [{ name: "Corner Wine", symbol: null, distanceMeters: 300 }] },
    locale: "en",
    assessedAt: "2026-10-16T12:00:00Z",
  };
  const view = (assessment: StoredPricingAssessment | null, locale: "en" | "es" = "en") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale}>
        <PricingView businessId="b" businessName="Modern Liquors" profile={bizProfileById("liquor_store", locale)!} initialPrices={PRICES} initialAssessment={assessment} />
      </LocaleProvider>
    );

  test("summary strip, a bar with a brass marker per ranked item, grey rows for the rest", () => {
    const html = view(LIQUOR);
    expect(html).toMatch(/data-testid="price-summary"[^>]*>4 items · 1 competitive · 0 under market · 1 upper-mid · 1 needs details · 1 collectible</);
    expect(html.match(/data-testid="price-map-row"/g)).toHaveLength(2);
    expect(html.match(/data-zone="/g)).toHaveLength(8);
    expect(html).toContain('aria-label="Your price $24 · typical ~$20–$28"');
    expect(html).toMatch(/data-testid="price-map-empty"[\s\S]*?Add brand \+ size/);
    expect(html).toContain("Collectible — not ranked");
    // The map sits above the one-line assessments.
    expect(html.indexOf('data-testid="price-map"')).toBeLessThan(html.indexOf('data-testid="assessment-list"'));
  });

  test("assessments collapse to one line with an expandable 'Why'; the legend is small with ⓘ", () => {
    const html = view(LIQUOR);
    expect(html.match(/<details class="group rounded-lg border-l-4/g)).toHaveLength(4);
    expect(html).toContain(">Why<");
    expect(html).toContain('data-testid="price-legend"');
    expect(html).toContain("What these mean");
    expect(html).not.toContain("What the rankings mean");
  });

  test("no one has a Google price level → one line instead of a grid of dashes", () => {
    const html = view(LIQUOR);
    expect(html).toContain("Google doesn&#x27;t list price levels for nearby liquor stores yet.");
    expect(html).not.toContain("Real Google price-level context");
  });

  test("the button, the empty state and the footnote say the same thing", () => {
    const before = view(null);
    expect(before.match(/Assess my pricing/g)!.length).toBe(3);
    expect(before).not.toContain("Re-assess");
    const after = view(LIQUOR);
    expect(after).toContain("&quot;Re-assess my pricing&quot; above");
    expect(after).not.toMatch(/[^-]Assess my pricing/);
  });

  test("liquor: the state-rules caveat leads the tips", () => {
    const html = view(LIQUOR);
    expect(html).toContain("Alcohol pricing rules (minimum pricing, case discounts, below-cost sales) vary by state — check yours.");
  });

  test("Spanish", () => {
    const html = view(LIQUOR, "es");
    expect(html).toContain("4 artículos · 1 competitivos");
    expect(html).toContain("Agregue marca + tamaño");
    expect(html).toContain("Por qué");
  });
});

describe("Red Bowl, Oct 27: a restaurant is never told to add brand and size", () => {
  const DISHES = [
    { id: "d1", business_id: "b", service: "General Tso's Chicken", price: 13.5, size: null, created_at: "2026-10-01T00:00:00Z" },
    { id: "d2", business_id: "b", service: "Catering party tray", price: 90, size: null, created_at: "2026-10-01T00:00:00Z" },
  ];
  const RESTAURANT: StoredPricingAssessment = {
    assessments: [
      { service: "General Tso's Chicken", price: 13.5, tier: "competitive", basis: "general_estimate", guidance: "g1", typicalLow: 11, typicalHigh: 16 },
      // The AI couldn't price it (too custom) — not a bottled product.
      { service: "Catering party tray", price: 90, tier: "no_data", basis: "no_data", guidance: "g2" },
    ],
    priceLevelContext: null,
    locale: "en",
    assessedAt: "2026-10-27T12:00:00Z",
  };
  const view = (locale: "en" | "es") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale}>
        <PricingView businessId="b" businessName="Red Bowl" profile={bizProfileById("restaurant", locale)!} initialPrices={DISHES} initialAssessment={RESTAURANT} />
      </LocaleProvider>
    );

  test("dishes get a real tier; an item with no typical price says so plainly", () => {
    const html = view("en");
    expect(html.match(/data-testid="price-map-row"/g)).toHaveLength(1);
    expect(html).toContain("No typical price to compare");
    expect(html).not.toContain("Add brand + size");
    expect(html).not.toMatch(/needs details/);
    expect(view("es")).toContain("Sin precio típico para comparar");
    expect(view("es")).not.toContain("Agregue marca + tamaño");
  });
});
