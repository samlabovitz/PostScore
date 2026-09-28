import { describe, expect, test } from "vitest";
import { TRADES, searchTrades, type BusinessTypeId, type PlannedTypeId } from "./tradeSearch";
import { getBizProfileOptions } from "@/config/bizProfiles";

describe("TRADES data integrity", () => {
  test("seeds at least 400 trades", () => {
    expect(TRADES.length).toBeGreaterThanOrEqual(400);
  });

  test("every trade id is unique", () => {
    const ids = TRADES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every trade's businessTypeId is one of the 31 real ids in config/bizProfiles.ts", () => {
    const realIds = new Set(getBizProfileOptions("en").map((o) => o.id));
    expect(realIds.size).toBe(31);
    for (const trade of TRADES) {
      expect(realIds.has(trade.businessTypeId)).toBe(true);
    }
  });

  test("the BusinessTypeId union never drifts from config/bizProfiles.ts's real ids", () => {
    const realIds = new Set(getBizProfileOptions("en").map((o) => o.id));
    // Every trade's businessTypeId already had to satisfy the
    // BusinessTypeId union at compile time — this just confirms the
    // union's 31 members are exactly the real ids, neither more nor
    // fewer, by exercising one representative trade per id we know we
    // seeded (every real id appears on at least one trade above).
    const usedIds = new Set(TRADES.map((t) => t.businessTypeId as BusinessTypeId));
    for (const id of Array.from(realIds)) {
      expect(usedIds.has(id as BusinessTypeId)).toBe(true);
    }
    expect(usedIds.size).toBe(realIds.size);
  });

  test("every trade has at least one synonym in each language", () => {
    for (const trade of TRADES) {
      expect(trade.synonymsEn.length).toBeGreaterThan(0);
      expect(trade.synonymsEs.length).toBeGreaterThan(0);
    }
  });

  const PLANNED_TYPE_IDS: PlannedTypeId[] = [
    "home_services",
    "repair_dropoff",
    "recreation",
    "events",
    "car_wash_detailing",
    "childcare",
    "lodging",
    "tattoo_body_art",
  ];

  test("every plannedTypeId is one of the 8 proposed types, and only set on trades still mapped to default", () => {
    const valid = new Set<string>(PLANNED_TYPE_IDS);
    let plannedCount = 0;
    for (const trade of TRADES) {
      if (trade.plannedTypeId === undefined) continue;
      plannedCount++;
      expect(valid.has(trade.plannedTypeId)).toBe(true);
      expect(trade.businessTypeId).toBe("default");
    }
    expect(plannedCount).toBeGreaterThan(0);
  });
});

describe("searchTrades", () => {
  test('"shoe" finds shoe repair', () => {
    const results = searchTrades("shoe", "en");
    expect(results.some((r) => r.id === "shoe_repair")).toBe(true);
  });

  test('"zapatero" (Spanish synonym) still finds shoe repair regardless of locale', () => {
    const results = searchTrades("zapatero", "en");
    expect(results.some((r) => r.id === "shoe_repair")).toBe(true);
  });

  test('"zapateria" (no accent) finds both shoe repair (via the "zapatería" synonym) and the shoe store', () => {
    const results = searchTrades("zapateria", "en");
    expect(results.some((r) => r.id === "shoe_repair")).toBe(true);
    expect(results.some((r) => r.id === "shoe_store")).toBe(true);
  });

  test('"peluqueria" (no accent) matches "Peluquería" (Hair Salon)', () => {
    const results = searchTrades("peluqueria", "en");
    expect(results.some((r) => r.id === "hair_salon_trade")).toBe(true);
  });

  test('"yoga" finds the yoga studio trade', () => {
    const results = searchTrades("yoga", "en");
    expect(results.some((r) => r.id === "yoga_studio")).toBe(true);
  });

  test('"golf" finds the golf driving range trade', () => {
    const results = searchTrades("golf", "en");
    expect(results.some((r) => r.id === "golf_driving_range")).toBe(true);
  });

  test('"electrician" maps to the electrician business type', () => {
    const results = searchTrades("electrician", "en");
    const electrician = results.find((r) => r.id === "electrician_trade");
    expect(electrician).toBeDefined();
    expect(electrician!.businessTypeId).toBe("electrician");
  });

  test("a nonsense query returns nothing", () => {
    expect(searchTrades("zxqvbnmqwerty12345", "en")).toEqual([]);
  });

  test("an empty or whitespace-only query returns nothing", () => {
    expect(searchTrades("", "en")).toEqual([]);
    expect(searchTrades("   ", "en")).toEqual([]);
  });

  test("never returns more than 8 results", () => {
    // "repair" is a broad substring shared by dozens of trades above.
    const results = searchTrades("repair", "en");
    expect(results.length).toBeLessThanOrEqual(8);
  });

  test("a name that starts with the query ranks above ones that only contain it", () => {
    // "Restaurant" (id restaurant_trade) starts with "restaurant"; many
    // others ("BBQ Restaurant", "Seafood Restaurant", ...) only contain
    // it later in the name, so they must rank behind it.
    const results = searchTrades("restaurant", "en");
    expect(results[0].id).toBe("restaurant_trade");
  });

  test("label reflects the requested locale, not the matched language", () => {
    const en = searchTrades("zapatero", "en");
    const es = searchTrades("shoe", "es");
    expect(en.find((r) => r.id === "shoe_repair")?.label).toBe("Shoe Repair");
    expect(es.find((r) => r.id === "shoe_repair")?.label).toBe("Reparación de calzado");
  });
});
