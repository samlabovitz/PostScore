import { describe, expect, test, vi } from "vitest";

// Part B: "Assess my pricing" uses the latest saved competitor scan's
// businesses, their price levels read live (Day 23) — never a fresh paid scan.
const scanSpy = vi.fn();
// A paid plan: on Free the price check refuses before any of this runs.
vi.mock("@/lib/premium", () => ({ getPlan: () => "grow" }));
vi.mock("@/lib/competitors", () => ({ findAndScoreCompetitors: (...a: unknown[]) => scanSpy(...a), MAX_COMPETITORS: 10 }));
const prompts: string[] = [];
vi.mock("@/lib/anthropicClient", () => ({
  callAnthropicMessage: async (p: { userMessage: string }) => {
    prompts.push(p.userMessage);
    return JSON.stringify({ assessments: [{ service: "Tito's Vodka 750 ml", tier: "competitive", basis: "general_estimate", guidance: "ok" }] });
  },
}));

function chainFor(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "update", "in"]) chain[m] = () => chain;
  chain.single = async () => ({ data: rows[0] ?? null, error: null });
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  return chain;
}
const TABLES: Record<string, unknown[]> = {
  businesses: [{ place_id: "p", name: "Joe's", address: null, category: "Restaurant", categories: ["restaurant"], primary_type: "restaurant", business_type_override: null, price_level: "PRICE_LEVEL_MODERATE", language: "en" }],
  prices: [{ id: "1", business_id: "b", service: "Tito's Vodka 750 ml", price: 25, created_at: "2026-10-01T00:00:00Z" }],
  competitor_scans: [
    { scan_id: "new", created_at: "2026-10-11T00:00:00Z", is_subject: true, name: "Joe's", distance_meters: null, price_level: "PRICE_LEVEL_MODERATE" },
    { scan_id: "new", created_at: "2026-10-11T00:00:00Z", is_subject: false, name: "Ann's", distance_meters: 500, price_level: "PRICE_LEVEL_EXPENSIVE" },
    { scan_id: "new", created_at: "2026-10-11T00:00:00Z", is_subject: false, name: "Bo's", distance_meters: 900, price_level: null },
    { scan_id: "old", created_at: "2026-09-01T00:00:00Z", is_subject: false, name: "Gone", distance_meters: 300, price_level: "PRICE_LEVEL_INEXPENSIVE" },
  ],
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    from: (table: string) => chainFor(TABLES[table] ?? []),
  }),
}));

// The shared snapshot (live values in place of the saved ones).
const snapshotMock = vi.fn();
vi.mock("@/app/actions/competitors", () => ({ getLatestCompetitorSnapshot: (...a: unknown[]) => snapshotMock(...a) }));
const entry = (isSubject: boolean, priceLevel: string | null) => ({ placeId: String(Math.random()), name: null, isSubject, priceLevel, liveMissing: false });
snapshotMock.mockResolvedValue({
  liveUnavailable: false,
  scan: { scanId: "new", createdAt: "2026-10-11T00:00:00Z", entries: [entry(true, "PRICE_LEVEL_MODERATE"), entry(false, "PRICE_LEVEL_EXPENSIVE"), entry(false, null)] },
  entries: [],
});

import { assessPricing } from "./pricing";

describe("Pricing reuses the saved competitor scan", () => {
  test("Assess: no paid scan, and the prompt carries the live price levels (as counts) and the owner's own level", async () => {
    const result = await assessPricing("b");
    expect(result.status).toBe("ok");
    expect(scanSpy).not.toHaveBeenCalled();
    expect(prompts.at(-1)).toContain("Your Google price level: $$");
    expect(prompts.at(-1)).toContain("Nearby competitors' Google price levels: $$$ x1, no data x1\n");
  });

  test("Google couldn't be reached: no local context (never the saved levels), the assessment still runs", async () => {
    snapshotMock.mockResolvedValueOnce({ liveUnavailable: true, scan: { scanId: "new", createdAt: "2026-10-11T00:00:00Z", entries: [] }, entries: [] });
    const result = await assessPricing("b");
    expect(result.status).toBe("ok");
    expect(prompts.at(-1)).toContain("No nearby competitor price-level data available");
  });
});
