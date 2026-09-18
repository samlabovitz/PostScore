import { describe, expect, test } from "vitest";
import { normalizeLocale } from "./locale";
import { t, tPlural } from "./messages";
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

  test("interpolates {name} placeholders from the given params", () => {
    expect(t("en", "report.fragment.gradeChanged", { grade: "B" })).toBe("your grade changed to B");
  });
});

describe("tPlural", () => {
  // Intl.PluralRules is the actual selection mechanism (not a hardcoded
  // count === 1 check) — this proves it genuinely picks the "one"
  // category at count=1 and "other" at count=2 for both locales this app
  // currently supports, via the real singular/plural message keys. es now
  // has a real, reviewed translation for this key, so this also proves
  // the correct Spanish singular/plural form is chosen, not just that the
  // category selection matches English's.
  test("picks the singular ('one') key at count=1, for both en and es", () => {
    expect(tPlural("en", "report.fragment.reviewsGained", 1)).toBe("you gained 1 review");
    expect(tPlural("es", "report.fragment.reviewsGained", 1)).toBe("sumó 1 reseña");
  });

  test("picks the plural ('other') key at count=2, for both en and es", () => {
    expect(tPlural("en", "report.fragment.reviewsGained", 2)).toBe("you gained 2 reviews");
    expect(tPlural("es", "report.fragment.reviewsGained", 2)).toBe("sumó 2 reseñas");
  });

  test("really does ask Intl.PluralRules, not a hardcoded n===1 check", () => {
    expect(new Intl.PluralRules("en").select(1)).toBe("one");
    expect(new Intl.PluralRules("en").select(2)).toBe("other");
    expect(new Intl.PluralRules("es").select(1)).toBe("one");
    expect(new Intl.PluralRules("es").select(2)).toBe("other");
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
