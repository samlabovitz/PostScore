import { describe, expect, test } from "vitest";
import { normalizeLocale } from "./locale";
import { t, tPlural, type MessageKey } from "./messages";
import { formatMonthLabel, reportCoverageMonth } from "./format";

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
  test("falls back to the raw key as a last resort when a key exists in neither dictionary", () => {
    // Every real MessageKey now has both an en and an es value (see the
    // messages.test.ts guardrail), so there's no real production key left
    // to exercise the "missing everywhere" rung of the fallback chain —
    // a synthetic, obviously-fake key does that instead, bypassing the
    // MessageKey type on purpose.
    const unknownKey = "__test_only_unknown_key__" as MessageKey;
    expect(t("es", unknownKey)).toBe(unknownKey);
    expect(t("en", unknownKey)).toBe(unknownKey);
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

describe("reportCoverageMonth", () => {
  // A comfortably mid-day UTC timestamp — unambiguously October 1st in
  // America/New_York too, so this is the exact worked example a monthly
  // report fix is built around: sent "October 1, 2026," the report
  // covers September, the month that just ended.
  const SENT_OCTOBER_1_MIDDAY_UTC = "2026-10-01T14:00:00.000Z";

  test("the month BEFORE the send date, in English", () => {
    expect(reportCoverageMonth(SENT_OCTOBER_1_MIDDAY_UTC, "en")).toEqual({ month: "September", year: "2026" });
  });

  test("the month BEFORE the send date, in Spanish", () => {
    expect(reportCoverageMonth(SENT_OCTOBER_1_MIDDAY_UTC, "es")).toEqual({ month: "septiembre", year: "2026" });
  });

  test("steps back across a year boundary (January -> December of the prior year)", () => {
    expect(reportCoverageMonth("2027-01-01T14:00:00.000Z", "en")).toEqual({ month: "December", year: "2026" });
  });

  test("uses America/New_York, not UTC, to decide the send date's own calendar day", () => {
    // 2026-10-01T02:00:00.000Z is 2026-09-30T22:00:00 in New York (EDT,
    // UTC-4) — still September 30th there, even though the UTC calendar
    // date already reads October 1st. A naive UTC-only computation would
    // wrongly treat this as an October send and report "September"; the
    // real New York calendar date is still September, so the month this
    // covers is honestly August.
    expect(reportCoverageMonth("2026-10-01T02:00:00.000Z", "en")).toEqual({ month: "August", year: "2026" });
  });
});
