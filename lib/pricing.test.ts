import { describe, expect, test } from "vitest";
import {
  ASSESSMENT_BASES,
  PRICE_TIERS,
  assessmentBasisLabel,
  buildPriceLevelComparison,
  buildPricingPrompt,
  buildPricingSystemPrompt,
  isAssessmentBasis,
  isPriceTierId,
  isPricingLanguageMismatch,
  parsePricingAssessmentPayload,
  parsePricingAssessmentResponse,
  priceTierLabel,
  pricingMaxTokens,
} from "./pricing";
import type { RankedCompetitor } from "./competitors";
import { resolveBizProfile } from "../config/bizProfiles";
import { t, type MessageKey } from "./i18n";

describe("PRICE_TIERS / isPriceTierId / priceTierLabel", () => {
  test("has exactly 5 tiers ending with no_data", () => {
    expect(PRICE_TIERS.length).toBe(5);
    expect(PRICE_TIERS[PRICE_TIERS.length - 1].id).toBe("no_data");
  });

  test("isPriceTierId accepts every real tier id and rejects garbage", () => {
    for (const tier of PRICE_TIERS) {
      expect(isPriceTierId(tier.id)).toBe(true);
    }
    expect(isPriceTierId("made_up_tier")).toBe(false);
    expect(isPriceTierId(123)).toBe(false);
    expect(isPriceTierId(null)).toBe(false);
  });

  test("priceTierLabel resolves a real label", () => {
    expect(priceTierLabel("competitive")).toBe("Competitive");
    expect(priceTierLabel("no_data")).toBe("No market data");
  });
});

describe("ASSESSMENT_BASES / isAssessmentBasis / assessmentBasisLabel", () => {
  test("has exactly the 3-way distinction: verified_local, general_estimate, no_data", () => {
    expect(ASSESSMENT_BASES.map((b) => b.id)).toEqual(["verified_local", "general_estimate", "no_data"]);
  });

  test("isAssessmentBasis accepts every real basis id and rejects garbage", () => {
    for (const basis of ASSESSMENT_BASES) {
      expect(isAssessmentBasis(basis.id)).toBe(true);
    }
    expect(isAssessmentBasis("verified")).toBe(false);
    expect(isAssessmentBasis(null)).toBe(false);
  });

  test("assessmentBasisLabel resolves the labels the UI badges on", () => {
    expect(assessmentBasisLabel("verified_local")).toBe("Based on local price levels");
    expect(assessmentBasisLabel("general_estimate")).toBe("General estimate");
  });
});

function makeCompetitor(overrides: Partial<RankedCompetitor>): RankedCompetitor {
  return {
    placeId: "p1",
    name: "Some Business",
    isSubject: false,
    address: "123 Main St",
    distanceMeters: 500,
    rating: 4.5,
    reviewCount: 100,
    hasWebsite: true,
    googleMapsUri: null,
    breakdown: { total: 80, grade: "B", scoringVersion: "1.5.0", categories: [] } as never,
    priceLevel: null,
    photoCount: null,
    ...overrides,
  };
}

describe("buildPriceLevelComparison", () => {
  test("maps the subject and competitors' real Google price levels honestly", () => {
    const ranked: RankedCompetitor[] = [
      makeCompetitor({ isSubject: true, name: "Me", priceLevel: "PRICE_LEVEL_MODERATE" }),
      makeCompetitor({ name: "Competitor A", priceLevel: "PRICE_LEVEL_INEXPENSIVE" }),
      makeCompetitor({ name: "Competitor B", priceLevel: null }),
    ];
    const result = buildPriceLevelComparison(ranked);
    expect(result.subjectSymbol).toBe("$$");
    expect(result.competitors).toEqual([
      { name: "Competitor A", symbol: "$", distanceMeters: 500 },
      { name: "Competitor B", symbol: null, distanceMeters: 500 },
    ]);
  });

  test("never fabricates a subject symbol when there is no subject entry", () => {
    const result = buildPriceLevelComparison([makeCompetitor({ name: "Only competitor" })]);
    expect(result.subjectSymbol).toBeNull();
  });
});

describe("buildPricingPrompt", () => {
  test("includes the business type, real services/prices, and real competitor price levels", () => {
    const prompt = buildPricingPrompt({
      businessTypeLabel: "Salon & Personal Care",
      services: [{ service: "Women's Haircut", price: 45 }],
      priceLevelContext: {
        subjectSymbol: "$$",
        competitors: [
          { name: "Nearby Salon", symbol: "$$$", distanceMeters: 800 },
          { name: "Another Salon", symbol: "$$$", distanceMeters: 1200 },
        ],
      },
    });
    expect(prompt).toContain("Salon & Personal Care");
    expect(prompt).toContain("Women's Haircut: $45.00");
    expect(prompt).toContain("Your Google price level: $$");
    // Day 4b: labeled as store-wide context, never a per-item basis.
    expect(prompt).toContain("Store-wide context only");
    // Competitor identities are never sent — only the real price-level
    // distribution, collapsed to counts, to keep the prompt (and cost) low.
    expect(prompt).not.toContain("Nearby Salon");
    expect(prompt).toContain("$$$ x2");
  });

  test("honestly notes missing competitor data instead of inventing it", () => {
    const prompt = buildPricingPrompt({
      businessTypeLabel: "Salon & Personal Care",
      services: [{ service: "Women's Haircut", price: 45 }],
      priceLevelContext: null,
    });
    expect(prompt).toContain("No nearby competitor price-level data available");
  });
});

describe("parsePricingAssessmentResponse", () => {
  const services = [
    { service: "Women's Haircut", price: 45 },
    { service: "Men's Haircut", price: 25 },
  ];

  test("Day 4b: a fresh 'verified_local' reply is downgraded to general_estimate (keeping its tier), and services still match by order", () => {
    const raw = JSON.stringify({
      assessments: [
        { service: "Women's Haircut", tier: "competitive", basis: "verified_local", guidance: "In line with nearby salons." },
        { service: "Men's Haircut", tier: "under_market", basis: "verified_local", guidance: "Room to raise this a bit." },
      ],
    });
    const result = parsePricingAssessmentResponse(raw, services);
    expect(result).toEqual([
      { service: "Women's Haircut", price: 45, tier: "competitive", basis: "general_estimate", guidance: "In line with nearby salons." },
      { service: "Men's Haircut", price: 25, tier: "under_market", basis: "general_estimate", guidance: "Room to raise this a bit." },
    ]);
    expect(result.some((r) => r.basis === "verified_local")).toBe(false);
  });

  describe("Day 4b: vague bottled/packaged items need brand and size", () => {
    const items = [
      { service: "Tito's Vodka 750 ml", price: 25 },
      { service: "Bottle of Wine", price: 150 },
      { service: "Josh Cabernet 750 ml", price: 18 },
    ];
    const raw = JSON.stringify({
      assessments: [
        { service: "Tito's Vodka 750 ml", tier: "competitive", basis: "general_estimate", guidance: "Typical retail is roughly $20-28 — a general estimate, not verified locally." },
        { service: "Bottle of Wine", tier: "no_data", basis: "no_data", guidance: "Too vague.", reason: "needs_brand_and_size" },
        { service: "Josh Cabernet 750 ml", tier: "competitive", basis: "general_estimate", guidance: "Typical retail is roughly $14-20 — a general estimate, not verified locally." },
      ],
    });

    test("EN: 'Bottle of Wine' is no_data with our add-brand-and-size note; the specific rows on either side still match by order", () => {
      const result = parsePricingAssessmentResponse(raw, items, "en");
      expect(result.map((r) => [r.service, r.price, r.tier, r.basis])).toEqual([
        ["Tito's Vodka 750 ml", 25, "competitive", "general_estimate"],
        ["Bottle of Wine", 150, "no_data", "no_data"],
        ["Josh Cabernet 750 ml", 18, "competitive", "general_estimate"],
      ]);
      expect(result[1].guidance).toBe(
        "Add the brand and size (e.g. Tito's Vodka 750 ml) so we can check this price — without them, prices for this item vary too much to judge."
      );
      expect(result[0].guidance).toContain("$20-28");
    });

    test("ES: the same note comes back in Spanish, formal usted", () => {
      const result = parsePricingAssessmentResponse(raw, items, "es");
      expect(result[1].guidance).toBe(
        "Agregue la marca y el tamaño (p. ej., Vodka Tito's 750 ml) para que podamos revisar este precio; sin ellos, los precios de este artículo varían demasiado para evaluarlo."
      );
    });

    test("a needs_brand_and_size flag wins even if the model also sent a real tier — never a guessed tier", () => {
      const result = parsePricingAssessmentResponse(
        JSON.stringify({ assessments: [{ service: "Bottle of Wine", tier: "premium", basis: "general_estimate", guidance: "x", reason: "needs_brand_and_size" }] }),
        [{ service: "Bottle of Wine", price: 150 }]
      );
      expect(result[0].tier).toBe("no_data");
      expect(result[0].basis).toBe("no_data");
    });
  });

  test("a known branded/common item with no local data gets a labeled general_estimate, not no_data", () => {
    const items = [{ service: "Cheez-Its (family size)", price: 7 }];
    const raw = JSON.stringify({
      assessments: [
        {
          service: "Cheez-Its (family size)",
          tier: "premium",
          basis: "general_estimate",
          guidance: "Typical retail for Cheez-Its is roughly $3-5, so $7 reads high — this is a general estimate, not verified against local competitors.",
        },
      ],
    });
    const result = parsePricingAssessmentResponse(raw, items);
    expect(result[0].tier).toBe("premium");
    expect(result[0].basis).toBe("general_estimate");
    expect(result[0].guidance.toLowerCase()).toContain("general estimate");
  });

  test("a genuinely unknowable item stays honest no_data even when the model tries to attach a tier", () => {
    // If the model sends a real tier without a valid basis, that combination
    // is never trusted as-is — see normalizeTierAndBasis via basis fallback
    // below. This test covers the case where basis is explicitly "no_data".
    const items = [{ service: "Custom bespoke tasting menu", price: 250 }];
    const raw = JSON.stringify({
      assessments: [{ service: "Custom bespoke tasting menu", tier: "no_data", basis: "no_data", guidance: "No reliable local or general pricing exists for a fully custom menu like this." }],
    });
    const result = parsePricingAssessmentResponse(raw, items);
    expect(result[0].tier).toBe("no_data");
    expect(result[0].basis).toBe("no_data");
  });

  test("a real tier with a missing/invalid basis degrades to general_estimate, never silently becomes verified_local", () => {
    const raw = JSON.stringify({
      assessments: [
        { service: "Women's Haircut", tier: "competitive", guidance: "ok" }, // no basis field at all
        { service: "Men's Haircut", tier: "competitive", basis: "made_up", guidance: "ok" },
      ],
    });
    const result = parsePricingAssessmentResponse(raw, services);
    expect(result[0].basis).toBe("general_estimate");
    expect(result[1].basis).toBe("general_estimate");
  });

  test("basis: no_data forces the tier to no_data too, even if the model also sent a real tier", () => {
    const raw = JSON.stringify({
      assessments: [{ service: "Women's Haircut", tier: "premium", basis: "no_data", guidance: "x" }],
    });
    const result = parsePricingAssessmentResponse(raw, [services[0]]);
    expect(result[0].tier).toBe("no_data");
    expect(result[0].basis).toBe("no_data");
  });

  test("strips a markdown code fence before parsing", () => {
    const raw = "```json\n" + JSON.stringify({
      assessments: [
        { service: "Women's Haircut", tier: "premium", basis: "verified_local", guidance: "Higher than nearby options." },
        { service: "Men's Haircut", tier: "premium", basis: "verified_local", guidance: "Higher than nearby options." },
      ],
    }) + "\n```";
    const result = parsePricingAssessmentResponse(raw, services);
    expect(result[0].tier).toBe("premium");
  });

  test("falls back to no_data/no_data honestly when the reply isn't valid JSON, never fabricating a tier", () => {
    const result = parsePricingAssessmentResponse("not json at all", services);
    expect(result).toHaveLength(2);
    for (const r of result) {
      expect(r.tier).toBe("no_data");
      expect(r.basis).toBe("no_data");
    }
  });

  test("falls back to no_data for a missing or invalid tier value, never trusting an out-of-range value", () => {
    const raw = JSON.stringify({
      assessments: [
        { service: "Women's Haircut", tier: "invented_tier", guidance: "x" },
        { service: "Men's Haircut" },
      ],
    });
    const result = parsePricingAssessmentResponse(raw, services);
    expect(result[0].tier).toBe("no_data");
    expect(result[0].basis).toBe("no_data");
    expect(result[1].tier).toBe("no_data");
    expect(result[1].basis).toBe("no_data");
  });

  test("falls back to no_data for every service when the assessments array is missing entries", () => {
    const raw = JSON.stringify({ assessments: [{ service: "Women's Haircut", tier: "competitive", basis: "verified_local", guidance: "ok" }] });
    const result = parsePricingAssessmentResponse(raw, services);
    expect(result[0].tier).toBe("competitive");
    expect(result[1].tier).toBe("no_data");
    expect(result[1].basis).toBe("no_data");
  });
});

describe("parsePricingAssessmentPayload", () => {
  test("round-trips a real payload read back from storage, including basis", () => {
    const payload = {
      assessments: [
        {
          service: "Women's Haircut",
          price: 45,
          tier: "competitive",
          basis: "general_estimate",
          guidance: "In line with nearby salons.",
        },
        {
          service: "Cheez-Its (family size)",
          price: 7,
          tier: "premium",
          basis: "general_estimate",
          guidance: "Typical retail is roughly $3-5 — this is a general estimate, not verified locally.",
        },
      ],
      priceLevelContext: {
        subjectSymbol: "$$",
        competitors: [{ name: "Nearby Salon", symbol: "$$$", distanceMeters: 800 }],
      },
      locale: "es",
    };
    expect(parsePricingAssessmentPayload(payload)).toEqual(payload);
  });

  test("a stored assessment with no locale field (from before this feature) parses locale as null, never assumed en or es", () => {
    const result = parsePricingAssessmentPayload({
      assessments: [{ service: "Women's Haircut", price: 45, tier: "competitive", basis: "verified_local", guidance: "ok" }],
    });
    expect(result!.locale).toBeNull();
  });

  test("an invalid locale value (e.g. from a manual DB edit) parses as null rather than trusting it", () => {
    const result = parsePricingAssessmentPayload({
      assessments: [{ service: "Women's Haircut", price: 45, tier: "competitive", basis: "verified_local", guidance: "ok" }],
      locale: "fr",
    });
    expect(result!.locale).toBeNull();
  });

  test("returns null for garbage instead of guessing a shape", () => {
    expect(parsePricingAssessmentPayload(null)).toBeNull();
    expect(parsePricingAssessmentPayload("not an object")).toBeNull();
    expect(parsePricingAssessmentPayload({})).toBeNull();
    expect(parsePricingAssessmentPayload({ assessments: "nope" })).toBeNull();
    expect(parsePricingAssessmentPayload({ assessments: [] })).toBeNull();
  });

  test("degrades a corrupted tier to no_data instead of trusting it, and drops unusable entries", () => {
    const result = parsePricingAssessmentPayload({
      assessments: [
        { service: "Women's Haircut", price: 45, tier: "invented_tier", guidance: "x" },
        { service: "Men's Haircut" /* missing price */ },
        { service: "Color", price: 90, tier: "premium", basis: "verified_local", guidance: "Above range." },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.assessments).toEqual([
      { service: "Women's Haircut", price: 45, tier: "no_data", basis: "no_data", guidance: "x" },
      { service: "Color", price: 90, tier: "premium", basis: "general_estimate", guidance: "Above range." },
    ]);
  });

  test("Day 4b: a saved 'verified_local' item is shown as general_estimate (tier and guidance kept), without touching the saved data", () => {
    const saved = {
      assessments: [
        { service: "Bottle of Wine", price: 150, tier: "competitive", basis: "verified_local", guidance: "In line with nearby stores." },
        { service: "Bottle of Wine", price: 25, tier: "competitive", basis: "verified_local", guidance: "In line with nearby stores." },
        { service: "Tito's Vodka 750 ml", price: 25, tier: "competitive", basis: "general_estimate", guidance: "Roughly $20-28." },
      ],
      priceLevelContext: null,
      locale: "en",
    };
    const snapshot = JSON.parse(JSON.stringify(saved));
    const result = parsePricingAssessmentPayload(saved);
    expect(result!.assessments.map((a) => [a.service, a.price, a.tier, a.basis, a.guidance])).toEqual([
      ["Bottle of Wine", 150, "competitive", "general_estimate", "In line with nearby stores."],
      ["Bottle of Wine", 25, "competitive", "general_estimate", "In line with nearby stores."],
      ["Tito's Vodka 750 ml", 25, "competitive", "general_estimate", "Roughly $20-28."],
    ]);
    expect(saved).toEqual(snapshot);
  });

  test("a stored entry from before the basis field existed degrades to general_estimate, never assumes verified_local", () => {
    // Simulates a row written before this feature — a real tier but no
    // basis at all. Must never be silently upgraded to "verified_local".
    const result = parsePricingAssessmentPayload({
      assessments: [{ service: "Women's Haircut", price: 45, tier: "competitive", guidance: "ok" }],
    });
    expect(result!.assessments[0].tier).toBe("competitive");
    expect(result!.assessments[0].basis).toBe("general_estimate");
  });

  test("treats a missing or malformed priceLevelContext as honestly absent, not fabricated", () => {
    const result = parsePricingAssessmentPayload({
      assessments: [{ service: "Women's Haircut", price: 45, tier: "competitive", basis: "verified_local", guidance: "ok" }],
    });
    expect(result!.priceLevelContext).toBeNull();
  });
});

describe("buildPricingSystemPrompt", () => {
  test("Day 4b: the store-wide $ level is context only, verified_local is no longer offered, and vague bottled items must be flagged", () => {
    const en = buildPricingSystemPrompt("en");
    expect(en).toContain("Treat it as background context only: never base an item's tier on it");
    expect(en).not.toContain('"verified_local"');
    expect(en).toContain('"reason":"needs_brand_and_size"');
    expect(en).toContain('"Bottle of Wine"');
  });

  test("Day 4b: the Spanish directive keeps the reason value in English", () => {
    expect(buildPricingSystemPrompt("es")).toContain('neither is the "reason" value "needs_brand_and_size"');
  });

  test("English prompt is unchanged by locale support — identical to the base prompt with no locale arg", () => {
    expect(buildPricingSystemPrompt("en")).toBe(buildPricingSystemPrompt());
  });

  test("Spanish prompt contains the language directive and never touches the base English rules", () => {
    const en = buildPricingSystemPrompt("en");
    const es = buildPricingSystemPrompt("es");
    expect(es.startsWith(en)).toBe(true);
    expect(es).toContain("usted");
    expect(es).toContain("Spanish");
    expect(es).toContain("es una estimación general, no verificada con competidores locales");
  });

  test("Spanish directive tells the model to keep JSON keys, tier values, and basis values in English", () => {
    const es = buildPricingSystemPrompt("es");
    expect(es).toContain('"service"');
    expect(es).toContain('"tier"');
    expect(es).toContain('"basis"');
    expect(es).toContain('"guidance"');
  });
});

describe("pricingMaxTokens", () => {
  test("English maxTokens is unchanged by locale support", () => {
    expect(pricingMaxTokens(3, "en")).toBe(pricingMaxTokens(3));
    expect(pricingMaxTokens(3)).toBe(Math.min(800, Math.max(260, 180 + 3 * 70)));
  });

  test("Spanish gets ~1.3x the English maxTokens for the same service count", () => {
    const en = pricingMaxTokens(3, "en");
    const es = pricingMaxTokens(3, "es");
    expect(es).toBe(Math.round(en * 1.3));
  });

  test("Spanish maxTokens still respects the same base bounds", () => {
    expect(pricingMaxTokens(0, "es")).toBe(Math.round(260 * 1.3));
    expect(pricingMaxTokens(100, "es")).toBe(Math.round(800 * 1.3));
  });
});

describe("isPricingLanguageMismatch (drives PricingView's language-mismatch note)", () => {
  test("no mismatch when the stored assessment's locale matches the current business language", () => {
    expect(isPricingLanguageMismatch("en", "en")).toBe(false);
    expect(isPricingLanguageMismatch("es", "es")).toBe(false);
  });

  test("mismatch when the stored assessment's locale differs from the current business language", () => {
    expect(isPricingLanguageMismatch("es", "en")).toBe(true);
    expect(isPricingLanguageMismatch("en", "es")).toBe(true);
  });

  test("a null stored locale (legacy, pre-locale assessment) is treated as English — no mismatch for an English business", () => {
    expect(isPricingLanguageMismatch(null, "en")).toBe(false);
  });

  test("a null stored locale is a mismatch for a Spanish business, since it's really an old English assessment", () => {
    expect(isPricingLanguageMismatch(null, "es")).toBe(true);
  });
});

describe("assessPricing prompt assembly (as app/actions/pricing.ts builds it)", () => {
  test("a Spanish business's system prompt contains the directive, and its user prompt carries the Spanish type label", () => {
    const locale = "es";
    const businessTypeLabel = resolveBizProfile("hair salon", null, null, locale).label;
    expect(businessTypeLabel).toBe("Salón y cuidado personal");

    const system = buildPricingSystemPrompt(locale);
    expect(system).toContain("usted");

    const prompt = buildPricingPrompt({
      businessTypeLabel,
      services: [{ service: "Women's Haircut", price: 45 }],
      priceLevelContext: null,
    });
    expect(prompt).toContain("Salón y cuidado personal");
  });

  test("an English business's system prompt and type label are byte-identical to today's (no locale)", () => {
    const businessTypeLabel = resolveBizProfile("hair salon", null, null, "en").label;
    expect(businessTypeLabel).toBe(resolveBizProfile("hair salon", null, null).label);
    expect(businessTypeLabel).toBe("Salon & Personal Care");
    expect(buildPricingSystemPrompt("en")).toBe(buildPricingSystemPrompt());
  });
});

describe("Day 4b: drink businesses get specific (brand + size) Price check examples", () => {
  test("liquor store (EN + ES)", () => {
    expect(resolveBizProfile("Liquor store", "liquor_store", null, "en").pricingExamples).toEqual([
      "Tito's Vodka 750 ml",
      "Bud Light 12-pack 12 oz",
      "Josh Cabernet 750 ml",
    ]);
    expect(resolveBizProfile("Liquor store", "liquor_store", null, "es").pricingExamples).toEqual([
      "Vodka Tito's 750 ml",
      "Bud Light, paquete de 12 latas de 12 oz",
      "Josh Cabernet 750 ml",
    ]);
  });

  test("wine shop and beer store use the same liquor examples", () => {
    expect(resolveBizProfile("Wine shop", null, null, "en").pricingExamples[0]).toBe("Tito's Vodka 750 ml");
    expect(resolveBizProfile("Beer store", null, null, "en").pricingExamples[0]).toBe("Tito's Vodka 750 ml");
  });

  test("a bar gets drink examples with sizes; a restaurant keeps its dish examples", () => {
    expect(resolveBizProfile("Bar", "bar", null, "en").pricingExamples).toEqual([
      "Bud Light draft (16 oz pint)",
      "Tito's & soda",
      "House red wine (6 oz glass)",
    ]);
    expect(resolveBizProfile("Bar", "bar", null, "es").pricingExamples[0]).toBe("Bud Light de barril (pinta de 16 oz)");
    expect(resolveBizProfile("Restaurant", "restaurant", null, "en").pricingExamples).toEqual(["Entrée", "Appetizer", "Dessert"]);
  });

  test("a cafe's drink example carries a size", () => {
    expect(resolveBizProfile("Coffee shop", "coffee_shop", null, "en").pricingExamples[0]).toBe("Latte (12 oz)");
  });
});

describe("Day 4b: the rankings legend never promises local price data we don't have", () => {
  test("no tier description (EN + ES) talks about a 'local range' or 'local prices'", () => {
    for (const tier of PRICE_TIERS) {
      expect(tier.description.toLowerCase()).not.toContain("local");
    }
    for (const locale of ["en", "es"] as const) {
      for (const key of ["underMarket", "competitive", "upperMid", "premium", "noData"]) {
        const text = t(locale, `dashboard.pricing.tier.${key}.description` as MessageKey).toLowerCase();
        expect(text).not.toMatch(/local/);
      }
      expect(t(locale, "dashboard.pricing.introText").toLowerCase()).not.toMatch(/local/);
    }
  });
});
