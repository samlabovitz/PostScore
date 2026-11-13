import { describe, expect, test, vi } from "vitest";
import { detectAbandonedSignals, yearlessEventDates } from "./websiteTrust";
import { collectWebsiteTrust, findListingPageCandidate } from "./websiteAnalysis";

// Site freshness and class/event listings written without a year — the
// real Centered Clay Studio case: the homepage shows nothing newer than
// "Copyright © 2023" (read as abandoned), while /one-time-12-day-workshops
// lists "Saturday December 5th", "November 29th 1pm" and more for this
// year.

const NOW = new Date("2026-11-13T12:00:00Z");
const ymd = (dates: Date[]) => dates.map((d) => d.toISOString().slice(0, 10));

const CLAY_HOME = "Centered Clay Studio Pottery classes and parties in Kennett Square. Copyright © 2023, Centered Clay Studio, All rights reserved.";
const CLAY_WORKSHOPS =
  "One-Time 1-2 Day Workshops. November and December Projects 🎄 Gnomes $65 Saturday December 5th ( get them back before christmas) " +
  "House and Tree Luminary $65 November 29th 1pm Holiday Version! Longwood Garden Tree Project Ornament Trio $45 November 13th 6:30 pm, " +
  "November 22nd 1pm, November 28th 12pm. Gnomes $65 December 5th 2 - 5 pm. Saturday, November 14th, wheel night. Copyright © 2023, Centered Clay Studio";

describe("yearlessEventDates", () => {
  test("Centered Clay's workshop page: this year's dates, weekdays checked", () => {
    expect(ymd(yearlessEventDates(CLAY_WORKSHOPS, NOW)).sort()).toEqual(["2026-11-13", "2026-11-14", "2026-11-22", "2026-11-28", "2026-11-29", "2026-12-05", "2026-12-05"]);
  });

  test("a named weekday must match this year or next — an old listing left up is skipped", () => {
    // Nov 14 is a Saturday in 2026; a Tuesday in neither 2026 nor 2027.
    expect(ymd(yearlessEventDates("Workshop: Tuesday, November 14", NOW))).toEqual([]);
    // Jan 9 is a Saturday in 2027 (not 2026): next year's.
    expect(ymd(yearlessEventDates("Workshop: Saturday, January 9", NOW))).toEqual(["2027-01-09"]);
  });

  test("no weekday: needs a time right after; more than a month past reads as next year", () => {
    expect(ymd(yearlessEventDates("Wheel class January 10 at 6pm", NOW))).toEqual(["2027-01-10"]);
    expect(ymd(yearlessEventDates("Wheel class October 1 6:30 pm", NOW))).toEqual(["2027-10-01"]);
    expect(ymd(yearlessEventDates("Wheel class October 20 6:30 pm", NOW))).toEqual(["2026-10-20"]);
    expect(ymd(yearlessEventDates("Classes since March 3 — come visit", NOW))).toEqual([]);
  });

  test("only on a page that reads like a class or event listing", () => {
    expect(ymd(yearlessEventDates("Our story began Saturday, November 14 when we opened.", NOW))).toEqual([]);
    expect(ymd(yearlessEventDates("Upcoming: Saturday, November 14", NOW))).toEqual(["2026-11-14"]);
  });

  test("abbreviated months never count without a year; dates with a year are left to the dated reader", () => {
    expect(ymd(yearlessEventDates("Workshop Sat Nov 14 1pm", NOW))).toEqual([]);
    expect(ymd(yearlessEventDates("Workshop May 3 1pm", NOW))).toEqual(["2027-05-03"]);
    expect(ymd(yearlessEventDates("Workshop: Saturday, November 14th, 2020 at 1pm", NOW))).toEqual([]);
  });

  test("Spanish listings (sábado 14 de noviembre)", () => {
    expect(ymd(yearlessEventDates("Talleres: sábado 14 de noviembre, 1 pm", NOW))).toEqual(["2026-11-14"]);
    expect(ymd(yearlessEventDates("Clases: 10 de enero a las 6 pm", NOW))).toEqual(["2027-01-10"]);
    expect(ymd(yearlessEventDates("Clases: martes 14 de noviembre", NOW))).toEqual([]);
  });
});

describe("detectAbandonedSignals with the classes/events page", () => {
  test("Centered Clay: © 2023 alone reads as abandoned; with the workshops page it's fresh", () => {
    expect(detectAbandonedSignals(CLAY_HOME, NOW)).toEqual({ newestDateFound: "2023-01-01", templateLeftovers: [], looksAbandoned: true });
    expect(detectAbandonedSignals(CLAY_HOME, NOW, [CLAY_WORKSHOPS])).toEqual({ newestDateFound: "2026-12-05", templateLeftovers: [], looksAbandoned: false });
  });

  test("year-less homepage event dates count too", () => {
    expect(detectAbandonedSignals(`${CLAY_HOME} Upcoming workshop: Saturday December 5th`, NOW).looksAbandoned).toBe(false);
  });

  test("an old listing left up (weekdays from a past year) doesn't make a site fresh", () => {
    // Saturday Nov 14 2020 → in 2027 Nov 14 is a Sunday, Nov 14 2028 a Tuesday.
    const later = new Date("2027-11-13T12:00:00Z");
    expect(detectAbandonedSignals(CLAY_HOME, later, ["Workshops: Saturday, November 14th"])).toMatchObject({ newestDateFound: "2023-01-01", looksAbandoned: true });
  });

  test("template leftovers come from the homepage only", () => {
    expect(detectAbandonedSignals(CLAY_HOME, NOW, ["Workshops. Lorem ipsum. Saturday December 5th"]).templateLeftovers).toEqual([]);
  });
});

describe("finding the classes/events page", () => {
  const home = new URL("http://www.centeredclaystudio.com/");
  test("Centered Clay's workshops link; same site only; never the homepage", () => {
    const pages = [
      { label: "Home", url: "http://www.centeredclaystudio.com/" },
      { label: "About", url: "http://www.centeredclaystudio.com/about" },
      { label: "Workshops on Eventbrite", url: "https://www.eventbrite.com/e/clay-workshop" },
      { label: "One-Time 1-2 Day Workshops", url: "http://www.centeredclaystudio.com/one-time-12-day-workshops?x=1" },
    ];
    expect(findListingPageCandidate(pages, home)).toEqual({ label: "One-Time 1-2 Day Workshops", url: "http://www.centeredclaystudio.com/one-time-12-day-workshops" });
    expect(findListingPageCandidate([{ label: "Talleres", url: "http://www.centeredclaystudio.com/talleres" }], home)?.url).toBe("http://www.centeredclaystudio.com/talleres");
    expect(findListingPageCandidate(pages.slice(0, 3), home)).toBeNull();
  });

  test("collectWebsiteTrust reads the listing page for freshness only (no Google calls without a key)", async () => {
    const fetchImpl = vi.fn();
    const html = (body: string) => `<html><body><main><p>${body}</p></main></body></html>`;
    const google = { phone: null, address: null, openingHoursPeriods: null };
    const without = await collectWebsiteTrust(html(CLAY_HOME), "centeredclaystudio.com", google, undefined, NOW, fetchImpl as unknown as typeof fetch);
    expect(without.abandonedSignals.looksAbandoned).toBe(true);
    const trust = await collectWebsiteTrust(html(CLAY_HOME), "centeredclaystudio.com", google, undefined, NOW, fetchImpl as unknown as typeof fetch, null, html(CLAY_WORKSHOPS));
    expect(trust.abandonedSignals).toEqual({ newestDateFound: "2026-12-05", templateLeftovers: [], looksAbandoned: false });
    // Its dates never become stale-notice findings or anything else.
    expect(trust.staleNotices).toEqual(without.staleNotices);
    expect(trust.infoConflicts).toEqual(without.infoConflicts);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

