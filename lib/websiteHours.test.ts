import { describe, expect, test } from "vitest";

// "Matches your Google listing" — which hours on the site are its opening
// hours. Fixtures are page text as our extraction reads it.

import { compareHours, compareListingInfo, parseHoursFromText, siteOpeningHours, splitHoursBlocks, type InfoFieldFinding } from "@/lib/websiteTrust";
import { scoreBusiness, type BusinessScoringInput, type WebsiteTrustAnalysis } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";

type Period = { open: { day: number; hour: number; minute: number }; close: { day: number; hour: number; minute: number } };
/** Google's periods: the same hours every day (close 0:00 = midnight). */
const everyDay = (openH: number, closeH: number, override: Partial<Record<number, [number, number]>> = {}): Period[] =>
  [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const [o, c] = override[day] ?? [openH, closeH];
    return { open: { day, hour: o, minute: 0 }, close: { day: c === 0 ? (day + 1) % 7 : day, hour: c, minute: 0 } };
  });

const trustWith = (finding: InfoFieldFinding): WebsiteTrustAnalysis => ({
  spamSignals: [],
  safeBrowsingThreat: null,
  safeBrowsingChecked: true,
  infoConflicts: [finding],
  staleNotices: [],
  abandonedSignals: { newestDateFound: "2026-11-01", templateLeftovers: [], looksAbandoned: false },
  websiteKind: "independent",
  listingLinkBroken: false,
  checkedAt: "2026-11-09T00:00:00.000Z",
});

// The real JT's Sports Bar & Grill contact page (entities as extracted).
const JTS =
  "We are online Email : jen-jts@bellsouth.net Phone : (954) 441-3833 Address : 10466 Taft St, Pembroke Pines, FL 33026, United States " +
  "Operating Hours Monday &ndash; Sunday: 12:00 PM to 12:00 AM Happy Hour Specials Monday &ndash; Friday: 3:00 PM &ndash; 6:00 PM Sunday: Domestic pitchers $12 How can we help you?";

const BRUNCH =
  "Join us for brunch! Brunch Hours Saturday – Sunday 10:00 AM – 2:00 PM. Hours Monday – Friday 11:00 AM – 10:00 PM, Saturday – Sunday 9:00 AM – 11:00 PM. Reservations recommended.";

const KITCHEN = "Open Daily 11am–2am. Kitchen Hours: Daily 11am – 10pm. Late-night menu after 10.";

describe("the real JT's Sports Bar & Grill page: Operating Hours, not Happy Hour", () => {
  test("the Operating Hours block is read; Happy Hour Specials is set aside", () => {
    const blocks = splitHoursBlocks(JTS).filter((b) => b.kind !== "none");
    expect(blocks.map((b) => `${b.kind}:${b.label}`)).toEqual(["opening:Operating Hours", "other:Happy Hour Specials"]);
    const opening = siteOpeningHours(JTS);
    expect(opening).toMatchObject({ label: "Operating Hours" });
    expect((opening as { entries: unknown[] }).entries).toEqual([{ days: [1, 2, 3, 4, 5, 6, 0], openMinutes: 720, closeMinutes: 0, closed: false }]);
  });

  test("Google 12 PM–12 AM every day → matches (midnight close lines up)", () => {
    expect(compareHours(JTS, everyDay(12, 0))).toMatchObject({ comparison: "matches", siteLabel: "Operating Hours" });
  });

  test("a real difference names the block (EN + ES)", () => {
    const finding = compareHours(JTS, everyDay(12, 0, { 5: [11, 0] }));
    expect(finding).toMatchObject({ field: "hours", comparison: "conflicts", siteValue: "Friday: 12:00 PM–12:00 AM", googleValue: "Friday: 11:00 AM–12:00 AM", siteLabel: "Operating Hours" });
    // The website's whole week is kept too ("Use the hours from your website" on the Google Profile tab).
    expect(finding.siteWeek).toHaveLength(7);
    expect(finding.siteWeek!.find((d) => d.day === 5)).toEqual({ day: 5, closed: false, open: 720, close: 0 });
    const input: BusinessScoringInput = {
      ...scoringInput(),
      websiteAnalysis: { ...scoringInput().websiteAnalysis!, websiteTrust: trustWith(finding) },
    };
    const check = (locale: "en" | "es") => scoreBusiness(input, locale).checks.find((c) => c.id === "website.info_consistency")!;
    expect(check("en").explanation).toBe("Your website's Operating Hours say Friday 12:00 PM–12:00 AM; Google says Friday 11:00 AM–12:00 AM.");
    expect(check("es").explanation).toBe("El apartado «Operating Hours» de su sitio web dice Friday 12:00 PM–12:00 AM; Google dice Friday 11:00 AM–12:00 AM.");
  });

  test("before the fix, the Happy Hour times were paired with Friday — never again", () => {
    const finding = compareListingInfo(JTS, { phone: null, address: null, openingHoursPeriods: everyDay(11, 0) });
    const hours = finding.find((f) => f.field === "hours")!;
    expect(hours.siteValue).not.toMatch(/3:00 PM|6:00 PM/);
  });
});

describe("brunch next to the regular hours", () => {
  test("the regular Hours block is read, the Brunch Hours block isn't", () => {
    const opening = siteOpeningHours(BRUNCH) as { entries: { days: number[]; openMinutes: number; closeMinutes: number | null }[]; label: string | null };
    expect(opening.label).toBe("Hours");
    expect(opening.entries.map((e) => [e.days, e.openMinutes, e.closeMinutes])).toEqual([
      [[1, 2, 3, 4, 5], 660, 1320],
      [[6, 0], 540, 1380],
    ]);
    expect(compareHours(BRUNCH, everyDay(11, 22, { 6: [9, 23], 0: [9, 23] })).comparison).toBe("matches");
  });
});

describe("kitchen hours", () => {
  test("“Open Daily 11am–2am” is the opening hours; the kitchen's 11am–10pm isn't compared", () => {
    expect(compareHours(KITCHEN, everyDay(11, 2)).comparison).toBe("matches");
    // Google showing the kitchen's hours is a real difference from the site's opening hours.
    expect(compareHours(KITCHEN, everyDay(11, 22))).toMatchObject({ comparison: "conflicts", siteValue: "Sunday: 11:00 AM–2:00 AM" });
  });

  test("kitchen hours alone are never compared; unless the label also says opening hours", () => {
    expect(compareHours("Kitchen Hours: Daily 11am – 10pm", everyDay(9, 17)).comparison).toBe("not_found_on_site");
    expect(compareHours("Kitchen & Opening Hours: Daily 11am – 10pm", everyDay(11, 22)).comparison).toBe("matches");
  });
});

describe("formats", () => {
  const one = (text: string) => parseHoursFromText(text)[0];
  test("“Mon–Fri 9–5”, “to”, “-”, 24-hour, and midnight as a closing time", () => {
    expect(one("Mon–Fri 9–5")).toMatchObject({ days: [1, 2, 3, 4, 5], openMinutes: 540, closeMinutes: 1020 });
    expect(one("Mon-Fri 9-5")).toMatchObject({ openMinutes: 540, closeMinutes: 1020 });
    expect(one("Monday to Friday 11 to 10")).toMatchObject({ days: [1, 2, 3, 4, 5], openMinutes: 660, closeMinutes: 1320 });
    expect(one("Lunes – Viernes 9:00–17:00")).toMatchObject({ openMinutes: 540, closeMinutes: 1020 });
    expect(one("Friday: 5pm to 12am")).toMatchObject({ openMinutes: 1020, closeMinutes: 0 });
    expect(one("Sat 4–12")).toMatchObject({ openMinutes: 960, closeMinutes: 0 }); // a 12 close after an afternoon start is midnight
    // Not hours: a price or a date after a day name.
    expect(parseHoursFromText("Monday 2-for-1 wings $12")).toEqual([]);
    expect(parseHoursFromText("Friday 11/15 trivia")).toEqual([]);
  });

  test("a midnight close matches Google's 12:00 AM, an 11:30 PM close is within the tolerance", () => {
    expect(compareHours("Hours: Daily 11am – 12am", everyDay(11, 0)).comparison).toBe("matches");
    expect(compareHours("Hours: Daily 11am – 11:30pm", everyDay(11, 0)).comparison).toBe("matches");
    expect(compareHours("Hours: Daily 11am – 10pm", everyDay(11, 0)).comparison).toBe("conflicts");
  });

  test("“open for lunch and dinner” is a sentence, not a label", () => {
    expect(compareHours("We're open for lunch and dinner Monday – Sunday 11am – 10pm.", everyDay(11, 22)).comparison).toBe("matches");
  });
});

describe("two opening-hours blocks that disagree → couldn't confirm, never a mismatch", () => {
  const TWO = "Store Hours Monday – Saturday 9am – 6pm. Business Hours Monday – Saturday 10am – 8pm.";
  test("unconfirmed, excluded from the score (EN + ES)", () => {
    expect(siteOpeningHours(TWO)).toBe("conflicting");
    const finding = compareHours(TWO, everyDay(9, 18));
    expect(finding.comparison).toBe("unconfirmed");
    const input: BusinessScoringInput = {
      ...scoringInput(),
      phone: null,
      address: null,
      websiteAnalysis: { ...scoringInput().websiteAnalysis!, websiteTrust: trustWith(finding) },
    };
    const c = scoreBusiness(input).checks.find((x) => x.id === "website.info_consistency")!;
    expect(c.earnedPoints).toBeNull();
    expect(c.explanation).toContain("we couldn't confirm which one is current");
    expect(scoreBusiness(input, "es").checks.find((x) => x.id === "website.info_consistency")!.explanation).toContain("no pudimos confirmar cuál es el actual");
  });

  test("two locations' hours side by side (the real Santa Fe Mexican Grill page) → couldn't confirm, not the other location's mismatch", () => {
    const SANTA_FE =
      "Santa Fe NEWARK 190 E Main St, Newark, Delaware 19711 302-369-2500 Monday-Tuesday: 3:00 pm - 10:00 pm Wednesday-Thursday: 11:30 am - 10:00 pm " +
      "Santa Fe WILMINGTON 2000 Pennsylvania Ave, Wilmington, Delaware 19806 302-482-1954 Monday - Wednesday: 4:00 pm - 9:00 pm Thursday: 4:00 pm - 12:00 am";
    expect(compareHours(SANTA_FE, everyDay(15, 22)).comparison).toBe("unconfirmed");
  });

  test("“special event?” in a sentence isn't a label", () => {
    expect(compareHours("Planning a special event? We cater. Monday – Sunday 11am – 10pm", everyDay(11, 22)).comparison).toBe("matches");
  });

  test("phone and address match, hours unconfirmed: never said to match (EN + ES)", () => {
    const hours = compareHours("Store Hours Mon–Sat 9am–6pm. Business Hours Mon–Sat 10am–8pm.", everyDay(9, 18));
    const phone: InfoFieldFinding = { field: "phone", comparison: "matches", siteValue: "302-555-0100", googleValue: "302-555-0100" };
    const input: BusinessScoringInput = { ...scoringInput(), websiteAnalysis: { ...scoringInput().websiteAnalysis!, websiteTrust: { ...trustWith(hours), infoConflicts: [phone, hours] } } };
    const c = scoreBusiness(input).checks.find((x) => x.id === "website.info_consistency")!;
    expect(c.earnedPoints).toBe(1);
    expect(c.explanation).toBe("Your website's phone and address match your Google listing. We didn't compare your hours: your site lists more than one set, and we couldn't confirm which one is current.");
    expect(scoreBusiness(input, "es").checks.find((x) => x.id === "website.info_consistency")!.explanation).toContain("No comparamos su horario");
  });

  test("the same hours in the header and the footer agree — one set", () => {
    expect(compareHours("Hours Mon–Sat 9am–6pm … Hours Mon–Sat 9am–6pm", everyDay(9, 18)).comparison).toBe("matches");
  });
});
