import { afterEach, describe, expect, test } from "vitest";
import {
  formatCount,
  formatDateTime,
  formatLongDate,
  formatMonthDay,
  formatMonthDayTime,
  formatShortDate,
} from "./format";

// Day 4b: the Pricing page's "Last assessed" date rendered as
// "Oct 16, 2026, 12:03 AM" on the server but "Oct 16, 2026 at 12:03 AM"
// in Safari — a hydration error. These formatters must produce the exact
// same text on any machine, in any browser, in any time zone.

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const MACHINE_ZONES = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/Madrid", "Asia/Tokyo", "Pacific/Auckland"];

// 12:03 AM on Oct 16 in New York — already Oct 16 04:03 UTC, still Oct 15
// in Los Angeles, and Oct 16 afternoon in Tokyo.
const ASSESSED_AT = "2026-10-16T04:03:25.579Z";

function allFormats(iso: string, locale: "en" | "es") {
  return [
    formatShortDate(iso, locale),
    formatLongDate(iso, locale),
    formatMonthDay(iso, locale),
    formatDateTime(iso, locale),
    formatMonthDayTime(iso, locale),
  ];
}

describe("shared date formatters — Day 4b hydration fix", () => {
  test("EN: exact strings, in New York time", () => {
    expect(allFormats(ASSESSED_AT, "en")).toEqual([
      "Oct 16, 2026",
      "October 16, 2026",
      "Oct 16",
      "Oct 16, 2026, 12:03 AM",
      "Oct 16, 12:03 AM",
    ]);
  });

  test("ES: exact strings, in New York time", () => {
    expect(allFormats(ASSESSED_AT, "es")).toEqual([
      "16 oct 2026",
      "16 de octubre de 2026",
      "16 oct",
      "16 oct 2026, 0:03",
      "16 oct, 0:03",
    ]);
  });

  test("same output whatever time zone the machine (server or browser) runs in — en + es", () => {
    const expected = { en: allFormats(ASSESSED_AT, "en"), es: allFormats(ASSESSED_AT, "es") };
    for (const tz of MACHINE_ZONES) {
      process.env.TZ = tz;
      expect(allFormats(ASSESSED_AT, "en")).toEqual(expected.en);
      expect(allFormats(ASSESSED_AT, "es")).toEqual(expected.es);
    }
  });

  test("never relies on an engine's own date wording: works even if Intl's whole-date format() is unavailable", () => {
    const proto = Intl.DateTimeFormat.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, "format")!;
    Object.defineProperty(proto, "format", {
      configurable: true,
      get() {
        return () => {
          throw new Error("engine-specific format() must not be used");
        };
      },
    });
    try {
      expect(formatDateTime(ASSESSED_AT, "en")).toBe("Oct 16, 2026, 12:03 AM");
      expect(formatDateTime(ASSESSED_AT, "es")).toBe("16 oct 2026, 0:03");
    } finally {
      Object.defineProperty(proto, "format", original);
    }
  });

  test("noon, afternoon and midnight hours (en 12-hour, es 24-hour)", () => {
    expect(formatDateTime("2026-10-16T16:00:00Z", "en")).toBe("Oct 16, 2026, 12:00 PM");
    expect(formatDateTime("2026-10-16T21:45:00Z", "en")).toBe("Oct 16, 2026, 5:45 PM");
    expect(formatDateTime("2026-10-16T21:45:00Z", "es")).toBe("16 oct 2026, 17:45");
    expect(formatDateTime("2026-10-16T04:00:00Z", "es")).toBe("16 oct 2026, 0:00");
  });

  test("September is 'sept' in Spanish (matching the server's previous output), and an explicit UTC zone keeps a UTC-midnight calendar date on its own day", () => {
    expect(formatShortDate("2026-09-05T15:00:00Z", "es")).toBe("5 sept 2026");
    expect(formatLongDate("2026-11-01T00:00:00.000Z", "en", "UTC")).toBe("November 1, 2026");
    // Read in New York, that same instant is still Oct 31.
    expect(formatLongDate("2026-11-01T00:00:00.000Z", "en")).toBe("October 31, 2026");
  });
});

describe("formatCount — review counts render the same on server and browser", () => {
  test("EN: comma groups thousands", () => {
    expect([0, 7, 999, 1000, 1234, 12345, 1234567].map((n) => formatCount(n, "en"))).toEqual([
      "0",
      "7",
      "999",
      "1,000",
      "1,234",
      "12,345",
      "1,234,567",
    ]);
  });

  test("ES: US-style grouping, same as English (never '12.345')", () => {
    expect([0, 7, 999, 1000, 1234, 12345, 1234567].map((n) => formatCount(n, "es"))).toEqual([
      "0",
      "7",
      "999",
      "1,000",
      "1,234",
      "12,345",
      "1,234,567",
    ]);
  });

  test("never depends on the machine's language or Intl number formatting", () => {
    const proto = Number.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, "toLocaleString")!;
    Object.defineProperty(proto, "toLocaleString", {
      configurable: true,
      value: () => {
        throw new Error("toLocaleString must not be used");
      },
    });
    try {
      expect(formatCount(12345, "en")).toBe("12,345");
      expect(formatCount(12345, "es")).toBe("12,345");
    } finally {
      Object.defineProperty(proto, "toLocaleString", original);
    }
  });

  test("rounds to a whole number and keeps a minus sign", () => {
    expect(formatCount(1234.6, "en")).toBe("1,235");
    expect(formatCount(-12345, "es")).toBe("-12,345");
  });
});
