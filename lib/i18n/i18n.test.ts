import { describe, expect, test } from "vitest";
import { normalizeLocale } from "./locale";
import { t } from "./messages";
import { formatMonthLabel } from "./format";

describe("normalizeLocale", () => {
  test("falls back to 'en' for a garbage value", () => {
    expect(normalizeLocale("xx")).toBe("en");
    expect(normalizeLocale("klingon")).toBe("en");
  });

  test("falls back to 'en' for null/undefined", () => {
    expect(normalizeLocale(null)).toBe("en");
    expect(normalizeLocale(undefined)).toBe("en");
  });

  test("passes through a supported locale unchanged", () => {
    expect(normalizeLocale("es")).toBe("es");
    expect(normalizeLocale("en")).toBe("en");
  });
});

describe("t", () => {
  test("falls back to the English string when the locale hasn't translated a key", () => {
    // "common.cancel" is deliberately left out of the Spanish dictionary
    // in messages.ts to exercise exactly this path.
    expect(t("es", "common.cancel")).toBe("Cancel");
  });

  test("returns the locale's own translation when present", () => {
    expect(t("es", "common.save")).toBe("Guardar");
    expect(t("en", "common.save")).toBe("Save");
  });
});

describe("formatMonthLabel", () => {
  const SEPTEMBER_2026 = "2026-09-01T00:00:00.000Z";

  test("formats in English", () => {
    expect(formatMonthLabel(SEPTEMBER_2026, "en")).toBe("September 2026");
  });

  test("formats in Spanish", () => {
    expect(formatMonthLabel(SEPTEMBER_2026, "es")).toBe("septiembre de 2026");
  });
});
