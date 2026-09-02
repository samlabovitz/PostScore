import { describe, expect, test } from "vitest";
import {
  PRICE_TIERS,
  buildPriceLevelComparison,
  buildPricingPrompt,
  isPriceTierId,
  parsePricingAssessmentPayload,
  parsePricingAssessmentResponse,
  priceTierLabel,
} from "./pricing";
import type { RankedCompetitor } from "./competitors";

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

  test("parses a well-formed response and matches services by order", () => {
    const raw = JSON.stringify({
      assessments: [
        { service: "Women's Haircut", tier: "competitive", guidance: "In line with nearby salons." },
        { service: "Men's Haircut", tier: "under_market", guidance: "Room to raise this a bit." },
      ],
    });
    const result = parsePricingAssessmentResponse(raw, services);
    expect(result).toEqual([
      { service: "Women's Haircut", price: 45, tier: "competitive", guidance: "In line with nearby salons." },
      { service: "Men's Haircut", price: 25, tier: "under_market", guidance: "Room to raise this a bit." },
    ]);
  });

  test("strips a markdown code fence before parsing", () => {
    const raw = "```json\n" + JSON.stringify({
      assessments: [
        { service: "Women's Haircut", tier: "premium", guidance: "Higher than nearby options." },
        { service: "Men's Haircut", tier: "premium", guidance: "Higher than nearby options." },
      ],
    }) + "\n```";
    const result = parsePricingAssessmentResponse(raw, services);
    expect(result[0].tier).toBe("premium");
  });

  test("falls back to no_data honestly when the reply isn't valid JSON, never fabricating a tier", () => {
    const result = parsePricingAssessmentResponse("not json at all", services);
    expect(result).toHaveLength(2);
    for (const r of result) {
      expect(r.tier).toBe("no_data");
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
    expect(result[1].tier).toBe("no_data");
  });

  test("falls back to no_data for every service when the assessments array is missing entries", () => {
    const raw = JSON.stringify({ assessments: [{ service: "Women's Haircut", tier: "competitive", guidance: "ok" }] });
    const result = parsePricingAssessmentResponse(raw, services);
    expect(result[0].tier).toBe("competitive");
    expect(result[1].tier).toBe("no_data");
  });
});

describe("parsePricingAssessmentPayload", () => {
  test("round-trips a real payload read back from storage", () => {
    const payload = {
      assessments: [
        { service: "Women's Haircut", price: 45, tier: "competitive", guidance: "In line with nearby salons." },
      ],
      priceLevelContext: {
        subjectSymbol: "$$",
        competitors: [{ name: "Nearby Salon", symbol: "$$$", distanceMeters: 800 }],
      },
    };
    expect(parsePricingAssessmentPayload(payload)).toEqual(payload);
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
        { service: "Color", price: 90, tier: "premium", guidance: "Above range." },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.assessments).toEqual([
      { service: "Women's Haircut", price: 45, tier: "no_data", guidance: "x" },
      { service: "Color", price: 90, tier: "premium", guidance: "Above range." },
    ]);
  });

  test("treats a missing or malformed priceLevelContext as honestly absent, not fabricated", () => {
    const result = parsePricingAssessmentPayload({
      assessments: [{ service: "Women's Haircut", price: 45, tier: "competitive", guidance: "ok" }],
    });
    expect(result!.priceLevelContext).toBeNull();
  });
});
