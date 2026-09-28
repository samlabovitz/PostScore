import { describe, expect, test } from "vitest";
import { TRADES, searchTrades, type BusinessTypeId } from "./tradeSearch";
import { getBizProfileOptions } from "@/config/bizProfiles";

describe("TRADES data integrity", () => {
  test("seeds at least 400 trades", () => {
    expect(TRADES.length).toBeGreaterThanOrEqual(400);
  });

  test("every trade id is unique", () => {
    const ids = TRADES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every trade's businessTypeId is one of the 39 real ids in config/bizProfiles.ts", () => {
    const realIds = new Set(getBizProfileOptions("en").map((o) => o.id));
    expect(realIds.size).toBe(39);
    for (const trade of TRADES) {
      expect(realIds.has(trade.businessTypeId)).toBe(true);
    }
  });

  test("the BusinessTypeId union never drifts from config/bizProfiles.ts's real ids", () => {
    const realIds = new Set(getBizProfileOptions("en").map((o) => o.id));
    // Every trade's businessTypeId already had to satisfy the
    // BusinessTypeId union at compile time — this just confirms the
    // union's 39 members are exactly the real ids, neither more nor
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

  test("no trade carries a plannedTypeId field anymore — the 8 new types are real now", () => {
    for (const trade of TRADES) {
      expect((trade as unknown as Record<string, unknown>).plannedTypeId).toBeUndefined();
    }
  });
});

describe("searchTrades — trades that moved onto the 8 new types", () => {
  test('"roofer" resolves to the home_services business type', () => {
    const results = searchTrades("roofer", "en");
    const roofer = results.find((r) => r.id === "roofer");
    expect(roofer).toBeDefined();
    expect(roofer!.businessTypeId).toBe("home_services");
  });

  test('"dry cleaner" resolves to the repair_dropoff business type', () => {
    const results = searchTrades("dry cleaner", "en");
    const dryCleaner = results.find((r) => r.id === "dry_cleaner");
    expect(dryCleaner).toBeDefined();
    expect(dryCleaner!.businessTypeId).toBe("repair_dropoff");
  });

  test('"golf" resolves to the recreation business type', () => {
    const results = searchTrades("golf", "en");
    const golfRange = results.find((r) => r.id === "golf_driving_range");
    expect(golfRange).toBeDefined();
    expect(golfRange!.businessTypeId).toBe("recreation");
  });

  test('"car wash" resolves to the car_wash_detailing business type', () => {
    const results = searchTrades("car wash", "en");
    const carWash = results.find((r) => r.id === "car_wash");
    expect(carWash).toBeDefined();
    expect(carWash!.businessTypeId).toBe("car_wash_detailing");
  });

  test('"hotel" resolves to the lodging business type', () => {
    const results = searchTrades("hotel", "en");
    const hotel = results.find((r) => r.id === "hotel_motel");
    expect(hotel).toBeDefined();
    expect(hotel!.businessTypeId).toBe("lodging");
  });

  test('"tattoo" resolves to the tattoo_body_art business type', () => {
    const results = searchTrades("tattoo", "en");
    const tattoo = results.find((r) => r.id === "tattoo_studio");
    expect(tattoo).toBeDefined();
    expect(tattoo!.businessTypeId).toBe("tattoo_body_art");
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
