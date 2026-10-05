import { describe, expect, test } from "vitest";
import { normalizeLocale } from "./locale";
import { t, tPlural, type MessageKey } from "./messages";
import { DEFAULT_BUSINESS_TIMEZONE, formatMonthLabel, formatShortDate, reportCoverageMonth } from "./format";

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

  // The PostAI panel's honest banner (AssistantView.tsx) — rewritten
  // from an absolute guarantee ("nothing is fabricated") to a
  // description of how it actually works, since an AI reply is never
  // something this codebase can guarantee is error-free, only that it's
  // grounded in real data with general tips labeled.
  test("the PostAI banner describes how it works rather than guaranteeing it, in both locales", () => {
    expect(t("en", "dashboard.assistant.groundedInScore", { total: 92 })).toBe(
      "Grounded in your real PostScore (92/100) — general tips are always labeled, and it only uses data PostScore actually has."
    );
    expect(t("es", "dashboard.assistant.groundedInScore", { total: 92 })).toBe(
      "Basado en su PostScore real (92/100) — los consejos generales siempre se etiquetan, y solo usa los datos que PostScore realmente tiene."
    );
    expect(t("en", "dashboard.assistant.groundedInScore", { total: 92 })).not.toContain("nothing is fabricated");
    expect(t("es", "dashboard.assistant.groundedInScore", { total: 92 })).not.toContain("nada es inventado");
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

describe("formatShortDate", () => {
  test("formats a comfortably mid-day UTC timestamp the same regardless of timezone", () => {
    expect(formatShortDate("2026-09-28T14:00:00.000Z", "en")).toBe("Sep 28, 2026");
    expect(formatShortDate("2026-09-28T14:00:00.000Z", "es")).toBe("28 sept 2026");
  });

  // Day 3 round 2's real bug: a scan saved late in the evening US-Eastern
  // (9:30pm on Sep 30) is already past midnight UTC (1:30am Oct 1) — the
  // old implementation (no timeZone pin, i.e. whatever the server
  // process's own ambient timezone happens to be) could show "Oct 1" for
  // a scan the business owner saved on the evening of the 30th. Default
  // business timezone is America/New_York until a real per-business one
  // exists (see DEFAULT_BUSINESS_TIMEZONE's own doc).
  const LATE_EVENING_SEP_30_EASTERN = "2026-10-01T01:30:00.000Z"; // 9:30pm EDT on Sep 30

  test("a timestamp late in the evening US-Eastern still shows the business's own real local day, not the UTC-rolled-over day", () => {
    expect(formatShortDate(LATE_EVENING_SEP_30_EASTERN, "en")).toBe("Sep 30, 2026");
    expect(formatShortDate(LATE_EVENING_SEP_30_EASTERN, "es")).toBe("30 sept 2026");
  });

  test("defaults to DEFAULT_BUSINESS_TIMEZONE (America/New_York) when no timeZone is passed", () => {
    expect(DEFAULT_BUSINESS_TIMEZONE).toBe("America/New_York");
    expect(formatShortDate(LATE_EVENING_SEP_30_EASTERN, "en", DEFAULT_BUSINESS_TIMEZONE)).toBe(
      formatShortDate(LATE_EVENING_SEP_30_EASTERN, "en")
    );
  });

  test("an explicit timeZone override still works, for whenever a real per-business timezone exists", () => {
    // In real UTC, this same moment IS already Oct 1 — passing UTC
    // explicitly proves the parameter is real, not a no-op.
    expect(formatShortDate(LATE_EVENING_SEP_30_EASTERN, "en", "UTC")).toBe("Oct 1, 2026");
  });
});
