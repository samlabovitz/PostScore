import { describe, expect, test } from "vitest";
import { businessTypeSourceText } from "./businessTypeSource";

describe("businessTypeSourceText — Settings page's honest 3-way source label (Day 2 step 3)", () => {
  test('trade_id set: "{trade} — picked by you"', () => {
    expect(
      businessTypeSourceText({
        locale: "en",
        businessTypeOverridden: true,
        tradeName: "Roofer",
        autoDetectedBusinessType: "Restaurant",
      })
    ).toBe("Roofer — picked by you");
  });

  test('override set with no trade_id: "Picked by you"', () => {
    expect(
      businessTypeSourceText({
        locale: "en",
        businessTypeOverridden: true,
        tradeName: null,
        autoDetectedBusinessType: "Restaurant",
      })
    ).toBe("Picked by you");
  });

  test("neither override nor trade: the existing auto-detected text", () => {
    expect(
      businessTypeSourceText({
        locale: "en",
        businessTypeOverridden: false,
        tradeName: null,
        autoDetectedBusinessType: "Restaurant",
      })
    ).toBe("Auto-detected from your Google listing.");
  });

  test("a trade_id is ignored when there's no override (shouldn't happen, but stays honestly auto-detected)", () => {
    expect(
      businessTypeSourceText({
        locale: "en",
        businessTypeOverridden: false,
        tradeName: "Roofer",
        autoDetectedBusinessType: "Restaurant",
      })
    ).toBe("Auto-detected from your Google listing.");
  });

  test("Spanish: all three cases translate", () => {
    expect(
      businessTypeSourceText({
        locale: "es",
        businessTypeOverridden: true,
        tradeName: "Techero",
        autoDetectedBusinessType: "Restaurante",
      })
    ).toBe("Techero: elegido por usted");

    expect(
      businessTypeSourceText({
        locale: "es",
        businessTypeOverridden: true,
        tradeName: null,
        autoDetectedBusinessType: "Restaurante",
      })
    ).toBe("Elegido por usted");

    expect(
      businessTypeSourceText({
        locale: "es",
        businessTypeOverridden: false,
        tradeName: null,
        autoDetectedBusinessType: "Restaurante",
      })
    ).toBe("Detectado automáticamente de su ficha de Google.");
  });

  test("tradeName omitted (PostAI's memory panel): keeps its own existing wording, unaffected by the Settings 3-way logic", () => {
    expect(
      businessTypeSourceText({
        locale: "en",
        businessTypeOverridden: true,
        autoDetectedBusinessType: "Restaurant",
      })
    ).toBe('Corrected by you — Google detected "Restaurant."');

    expect(
      businessTypeSourceText({
        locale: "en",
        businessTypeOverridden: false,
        autoDetectedBusinessType: "Restaurant",
      })
    ).toBe("Auto-detected from your Google listing.");
  });
});
