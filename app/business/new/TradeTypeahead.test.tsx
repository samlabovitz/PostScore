import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import type { PlaceDetails } from "@/lib/google/places";
import { TradeTypeahead, tradePickToSaveFields, tradeResultsFor } from "./TradeTypeahead";

const PLACE: PlaceDetails = {
  placeId: "test-place",
  name: "Test Roofing Co.",
  formattedAddress: "123 Main St",
  phone: null,
  website: null,
  openingHours: null,
  openingHoursPeriods: null,
  rating: null,
  userRatingCount: null,
  categories: null,
  primaryCategory: "Roofer",
  primaryType: null,
  location: null,
  businessStatus: null,
  googleMapsUri: null,
  photoCount: null,
  priceLevel: null,
};

describe("tradePickToSaveFields — Day 2 step 3 save contract", () => {
  test("picking a trade saves both business_type_override and trade_id", () => {
    expect(tradePickToSaveFields({ tradeId: "roofer", businessTypeId: "home_services" })).toEqual({
      businessTypeOverride: "home_services",
      tradeId: "roofer",
    });
  });

  test('"Something else" (no pick) saves both fields as null', () => {
    expect(tradePickToSaveFields(null)).toEqual({ businessTypeOverride: null, tradeId: null });
  });
});

describe("tradeResultsFor — searches with whatever locale is passed in", () => {
  test("an empty or whitespace-only query returns nothing, regardless of locale", () => {
    expect(tradeResultsFor("", "en")).toEqual([]);
    expect(tradeResultsFor("   ", "es")).toEqual([]);
  });

  test("the SAME query returns the trade's label in whichever locale was passed", () => {
    const en = tradeResultsFor("shoe", "en").find((r) => r.id === "shoe_repair");
    const es = tradeResultsFor("shoe", "es").find((r) => r.id === "shoe_repair");
    expect(en?.label).toBe("Shoe Repair");
    expect(es?.label).toBe("Reparación de calzado");
  });

  test("a Spanish-only synonym still finds a result when locale is 'en' (matching ignores locale; only the label follows it)", () => {
    const results = tradeResultsFor("zapatero", "en");
    const shoeRepair = results.find((r) => r.id === "shoe_repair");
    expect(shoeRepair).toBeDefined();
    expect(shoeRepair!.label).toBe("Shoe Repair");
  });
});

describe("TradeTypeahead — follows the `locale` prop, not the ambient dashboard locale", () => {
  test("es locale prop renders Spanish strings even inside an English LocaleProvider", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <TradeTypeahead place={PLACE} locale="es" pick={null} onPickChange={() => {}} />
      </LocaleProvider>
    );
    // Auto-detected label: "Roofer" category has no dedicated Spanish
    // business type of its own, but the field's own chrome strings
    // (label + helper) are unambiguous, locale-prop-only strings.
    expect(html).toContain("¿Qué tipo de negocio es?");
    expect(html).toContain("Detectado en su ficha de Google");
    expect(html).not.toContain("What kind of business is this?");
  });

  test("en locale prop renders English strings even inside a Spanish LocaleProvider", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="es">
        <TradeTypeahead place={PLACE} locale="en" pick={null} onPickChange={() => {}} />
      </LocaleProvider>
    );
    expect(html).toContain("What kind of business is this?");
    expect(html).toContain("Detected from your Google listing");
    expect(html).not.toContain("¿Qué tipo de negocio es?");
  });

  test("pre-fills from Google auto-detection and shows the helper text when nothing is picked", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <TradeTypeahead place={PLACE} locale="en" pick={null} onPickChange={() => {}} />
      </LocaleProvider>
    );
    // "Roofer" auto-detects to the home_services type, labeled "Home
    // Services & Contractors".
    expect(html).toContain("Home Services &amp; Contractors");
    expect(html).toContain("Detected from your Google listing");
  });

  test("a committed pick hides the auto-detected helper text", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <TradeTypeahead
          place={PLACE}
          locale="en"
          pick={{ tradeId: "roofer", businessTypeId: "home_services" }}
          onPickChange={() => {}}
        />
      </LocaleProvider>
    );
    expect(html).toContain("Roofer");
    expect(html).not.toContain("Detected from your Google listing");
  });
});
