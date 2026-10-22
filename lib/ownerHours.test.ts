import { describe, expect, test } from "vitest";
import {
  copyMondayToAll,
  defaultOwnerHours,
  hoursRows,
  isValidOwnerHours,
  openingHoursSpecification,
  ownerHoursFromGoogle,
  sameEveryWeekday,
  sameSchedule,
  sanitizeOwnerHours,
  validateOwnerHours,
  type OwnerHours,
} from "./ownerHours";
import { buildStarterSiteHtml, type StarterSiteInput } from "./starterSite";
import { businessRowToScoringInput, scoreBusiness, type BusinessScoringRow } from "./scoring";

const withDay = (h: OwnerHours, i: number, day: Partial<OwnerHours["days"][number]>): OwnerHours => ({ ...h, days: h.days.map((d, j) => (j === i ? { ...d, ...day } : d)) });

describe("owner hours: validation", () => {
  test("close after open; past midnight (6 PM–2 AM) is fine; the same time isn't", () => {
    const h = defaultOwnerHours();
    expect(isValidOwnerHours(h)).toBe(true);
    expect(isValidOwnerHours(withDay(h, 4, { ranges: [{ open: "18:00", close: "02:00" }] }))).toBe(true);
    expect(validateOwnerHours(withDay(h, 0, { ranges: [{ open: "09:00", close: "09:00" }] }))[0]).toBe("same_time");
  });

  test("a split day: the second time must start after the first ends", () => {
    const h = defaultOwnerHours();
    expect(isValidOwnerHours(withDay(h, 0, { ranges: [{ open: "09:00", close: "12:00" }, { open: "13:00", close: "17:00" }] }))).toBe(true);
    expect(validateOwnerHours(withDay(h, 0, { ranges: [{ open: "09:00", close: "13:00" }, { open: "12:00", close: "17:00" }] }))[0]).toBe("overlap");
  });

  test("closed days, 24 hours and appointment-only aren't validated as times", () => {
    const h = withDay(defaultOwnerHours(), 0, { ranges: [{ open: "09:00", close: "09:00" }] });
    expect(isValidOwnerHours(withDay(h, 0, { open: false }))).toBe(true);
    expect(isValidOwnerHours(withDay(h, 0, { allDay: true }))).toBe(true);
    expect(isValidOwnerHours({ ...h, mode: "appointment" })).toBe(true);
  });

  test("untrusted data: bad times dropped, note cut to 80 characters, wrong shape → null", () => {
    const raw = { mode: "weekly", note: "x".repeat(120), days: Array.from({ length: 7 }, () => ({ open: true, ranges: [{ open: "9am", close: "17:00" }, { open: "10:00", close: "17:07" }] })) };
    const clean = sanitizeOwnerHours(raw)!;
    expect(clean.note).toHaveLength(80);
    expect(clean.days[0].ranges).toEqual([{ open: "09:00", close: "17:00" }]); // no valid range → default
    expect(sanitizeOwnerHours({ days: [] })).toBeNull();
    expect(sanitizeOwnerHours("hi")).toBeNull();
  });
});

describe("quick fills", () => {
  test("same every weekday (weekend untouched) and Monday to all", () => {
    const h = withDay(defaultOwnerHours(), 0, { ranges: [{ open: "08:00", close: "18:00" }] });
    const weekdays = sameEveryWeekday(h);
    expect(weekdays.days.slice(0, 5).every((d) => d.ranges[0].open === "08:00")).toBe(true);
    expect(weekdays.days[5].open).toBe(false);
    expect(copyMondayToAll(h).days.every((d) => d.open && d.ranges[0].close === "18:00")).toBe(true);
  });
});

describe("prefill from Google", () => {
  test("weekly periods with a split day; closed days stay closed", () => {
    const g = ownerHoursFromGoogle([
      { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 12, minute: 0 } },
      { open: { day: 1, hour: 13, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
      { open: { day: 5, hour: 18, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
    ])!;
    expect(g.days[0]).toEqual({ open: true, allDay: false, ranges: [{ open: "09:00", close: "12:00" }, { open: "13:00", close: "17:00" }] });
    expect(g.days[4].ranges[0]).toEqual({ open: "18:00", close: "02:00" });
    expect(g.days[6].open).toBe(false);
  });

  test("open 24/7, and no periods → null", () => {
    expect(ownerHoursFromGoogle([{ open: { day: 0, hour: 0, minute: 0 } }])!.days.every((d) => d.allDay)).toBe(true);
    expect(ownerHoursFromGoogle(null)).toBeNull();
  });

  test("differs from Google: compares the schedule, not the note", () => {
    const g = defaultOwnerHours();
    expect(sameSchedule({ ...g, note: "Walk-ins welcome" }, g)).toBe(true);
    expect(sameSchedule(withDay(g, 0, { ranges: [{ open: "10:00", close: "17:00" }] }), g)).toBe(false);
  });
});

describe("display and schema.org", () => {
  test("rows in EN (12-hour) and ES day names", () => {
    const h = withDay(withDay(defaultOwnerHours(), 1, { allDay: true }), 4, { ranges: [{ open: "18:00", close: "02:00" }] });
    expect(hoursRows(h, "en").map((r) => `${r.day}: ${r.text}`)).toEqual([
      "Monday: 9:00 AM – 5:00 PM",
      "Tuesday: Open 24 hours",
      "Wednesday: 9:00 AM – 5:00 PM",
      "Thursday: 9:00 AM – 5:00 PM",
      "Friday: 6:00 PM – 2:00 AM",
      "Saturday: Closed",
      "Sunday: Closed",
    ]);
    expect(hoursRows(h, "es")[2]).toEqual({ index: 2, day: "Miércoles", text: "9:00 a.m. – 5:00 p.m." });
  });

  test("openingHoursSpecification per open range; nothing for appointment-only", () => {
    const spec = openingHoursSpecification(defaultOwnerHours());
    expect(spec).toHaveLength(5);
    expect(spec[0]).toEqual({ "@type": "OpeningHoursSpecification", dayOfWeek: "https://schema.org/Monday", opens: "09:00", closes: "17:00" });
    expect(openingHoursSpecification({ ...defaultOwnerHours(), mode: "appointment" })).toEqual([]);
  });
});

const SITE: StarterSiteInput = {
  locale: "en",
  businessName: "Hudson Shears",
  category: "Hair salon",
  tagline: "",
  taglineFontId: "classic",
  taglineColor: null,
  taglineSize: "medium",
  taglinePlacement: "below",
  phone: "(914) 555-0100",
  address: "1 Main St, Hudson, NY",
  placeId: null,
  profileId: "salon",
  themeId: "ink",
  customAccent: null,
  fontId: "classic",
  show: { address: true, phone: true, hours: true },
  heroImage: null,
  contentImages: [],
};

describe("the starter site with owner hours", () => {
  const owner = { ...defaultOwnerHours(), note: "Walk-ins welcome · Holiday hours may vary" };

  test("no owner hours → no Hours section; owner hours → a table, today highlighted in the business's zone", () => {
    expect(buildStarterSiteHtml(SITE)).not.toContain("<h2>Hours</h2>");
    const html = buildStarterSiteHtml({ ...SITE, ownerHours: owner, timeZone: "America/New_York" });
    expect(html).toContain('<table class="hours">');
    expect(html).toContain('<tr data-day="0"><th scope="row">Monday</th><td>9:00 AM – 5:00 PM</td></tr>');
    expect(html).toContain('<tr data-day="6"><th scope="row">Sunday</th><td>Closed</td></tr>');
    expect(html).toContain("Walk-ins welcome · Holiday hours may vary");
    expect(html).toContain('timeZone:"America/New_York"');
    expect(html).toContain('content: " · Today"');
  });

  test("schema.org LocalBusiness carries the owner's openingHoursSpecification (and never a rating)", () => {
    const html = buildStarterSiteHtml({ ...SITE, ownerHours: owner });
    const json = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
    expect(json["@type"]).toBe("LocalBusiness");
    expect(json.openingHoursSpecification).toHaveLength(5);
    expect(json).not.toHaveProperty("aggregateRating");
  });

  test("Spanish day names; appointment-only shows that instead of a table", () => {
    const es = buildStarterSiteHtml({ ...SITE, locale: "es", ownerHours: owner });
    expect(es).toContain("<th scope=\"row\">Miércoles</th>");
    expect(es).toContain('content: " · Hoy"');
    const appt = buildStarterSiteHtml({ ...SITE, ownerHours: { ...owner, mode: "appointment" } });
    expect(appt).toContain("By appointment only");
    expect(appt).not.toContain('<table class="hours">');
    expect(appt).not.toContain("Intl.DateTimeFormat");
  });

  test("owner hours never count toward the Google listing score", () => {
    const row = {
      rating: null, review_count: null, phone: null, address: null, opening_hours: null, website: null, https_status: null, categories: null,
      category: null, photo_count: null, business_status: null, website_analysis_json: null, website_trust_overrides_json: null, verified_website_url: null,
      starter_site_hours: owner,
    } as unknown as BusinessScoringRow;
    const input = businessRowToScoringInput(row);
    expect(JSON.stringify(input)).not.toContain("Walk-ins");
    expect(input.openingHours).toBeNull();
    const hours = scoreBusiness(input, "en").checks.find((c) => c.id === "completeness.hours")!;
    expect(hours.earnedPoints ?? 0).toBe(0);
  });
});
