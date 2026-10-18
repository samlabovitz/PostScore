import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { businessTimeZone, withTimeZone } from "./businessTimeZone";
import { DEFAULT_BUSINESS_TIMEZONE, formatDateTime, formatShortDate, LocaleProvider, useTimeZone, zonedDayKey } from "@/lib/i18n";

vi.mock("@/app/actions/competitors", () => ({ refreshCompetitors: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { CompetitorsView } from "@/app/business/[id]/competitors/CompetitorsView";

// Each business's own time zone, from its Google location (offline lookup,
// no API). Real saved businesses: Yoga Box (Los Angeles), Gregg L. Smith
// (Chicago), Canadian Tire (Montréal), Modern Liquors (Newark, DE).
const YOGA_BOX_LA = { lat: 34.0886, lng: -118.3302 };
const CHICAGO = { lat: 41.8847, lng: -87.6338 };
const MONTREAL = { lat: 45.5636, lng: -73.6213 };
const NEWARK_DE = { lat: 39.6837, lng: -75.7497 };

describe("a business's time zone from its location", () => {
  test("Los Angeles, Chicago, Montréal, Delaware", () => {
    expect(businessTimeZone(YOGA_BOX_LA.lat, YOGA_BOX_LA.lng)).toBe("America/Los_Angeles");
    expect(businessTimeZone(CHICAGO.lat, CHICAGO.lng)).toBe("America/Chicago");
    expect(businessTimeZone(MONTREAL.lat, MONTREAL.lng)).toBe("America/Toronto");
    expect(businessTimeZone(NEWARK_DE.lat, NEWARK_DE.lng)).toBe("America/New_York");
  });

  test("unknown or invalid coordinates fall back to New York", () => {
    for (const [lat, lng] of [[null, null], [undefined, -73], ["34", "-118"], [NaN, 1], [95, 0], [0, 200]] as Array<[unknown, unknown]>) {
      expect(businessTimeZone(lat, lng)).toBe(DEFAULT_BUSINESS_TIMEZONE);
    }
    expect(DEFAULT_BUSINESS_TIMEZONE).toBe("America/New_York");
  });

  test("withTimeZone adds time_zone to a row", () => {
    expect(withTimeZone({ id: "x", ...YOGA_BOX_LA }).time_zone).toBe("America/Los_Angeles");
  });
});

describe("dates show in the business's own zone", () => {
  // 04:30 UTC on Oct 16 is still the evening of Oct 15 in Los Angeles.
  const LATE_EVENING_PACIFIC = "2026-10-16T04:30:00Z";

  test("an LA business sees Pacific time; New York sees Eastern", () => {
    expect(formatShortDate(LATE_EVENING_PACIFIC, "en", "America/Los_Angeles")).toBe("Oct 15, 2026");
    expect(formatShortDate(LATE_EVENING_PACIFIC, "en", "America/New_York")).toBe("Oct 16, 2026");
    expect(formatDateTime(LATE_EVENING_PACIFIC, "en", "America/Los_Angeles")).toContain("9:30");
    expect(formatDateTime(LATE_EVENING_PACIFIC, "en", "America/New_York")).toContain("12:30");
    expect(zonedDayKey(LATE_EVENING_PACIFIC, "America/Los_Angeles")).toBe("2026-10-15");
  });

  test("components read the zone from the shell's provider; outside it, New York", () => {
    function Probe() {
      return <span>{useTimeZone()}</span>;
    }
    expect(renderToStaticMarkup(<LocaleProvider locale="en" timeZone="America/Los_Angeles"><Probe /></LocaleProvider>)).toContain("America/Los_Angeles");
    expect(renderToStaticMarkup(<LocaleProvider locale="en"><Probe /></LocaleProvider>)).toContain("America/New_York");
    expect(renderToStaticMarkup(<Probe />)).toContain("America/New_York");
  });

  test("an LA business's Competitors page dates its scan in Pacific time", () => {
    const data = {
      status: "ok" as const,
      businessName: "Yoga Box",
      businessAddress: "1011 Cole Ave, Los Angeles, CA",
      language: "en",
      competitorNoun: "yoga studios",
      latest: { scanId: "s", createdAt: LATE_EVENING_PACIFIC, entries: [] },
      rankHistory: [],
      refresh: { allowed: true, nextAvailableAt: null },
      scanBlocker: null,
      comparedViaTypes: [],
      scoring: null,
      timeZone: "America/Los_Angeles",
    };
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en" timeZone="America/Los_Angeles">
        <CompetitorsView businessId="b" data={data} />
      </LocaleProvider>
    );
    expect(html).toContain("Oct 15, 2026");
    expect(html).not.toContain("Oct 16, 2026");
  });
});
