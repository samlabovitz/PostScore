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
