import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { googleDayIn, todayHours, todayLineIndex } from "@/lib/hours";
import { hoursChipText, ListingChips, type ListingChipsBusiness } from "@/components/overview/ListingChips";

// Mon–Sat 11:00–22:00, closed Sunday (Google day 0).
const PERIODS = [1, 2, 3, 4, 5, 6].map((day) => ({ open: { day, hour: 11, minute: 0 }, close: { day, hour: 22, minute: 0 } }));
const BIZ: ListingChipsBusiness = {
  phone: "(914) 332-5321",
  website: "https://jgdeli.com/",
  verified_website_url: null,
  opening_hours: null,
  opening_hours_periods: PERIODS,
  google_maps_uri: "https://maps.google.com/?cid=1",
};
// Saturday Oct 17, 2026, 11:30 PM in Los Angeles = Sunday 2:30 AM in New York.
const LATE_SATURDAY_LA = new Date("2026-10-18T06:30:00Z");

describe("today's hours, in the business's own time zone", () => {
  test("the weekday comes from the business's time zone", () => {
    expect(googleDayIn(LATE_SATURDAY_LA, "America/Los_Angeles")).toBe(6);
    expect(googleDayIn(LATE_SATURDAY_LA, "America/New_York")).toBe(0);
  });

  test("open today / closed today / open 24 hours / not listed — never guessed", () => {
    expect(hoursChipText(BIZ, LATE_SATURDAY_LA, "America/Los_Angeles", "en")).toBe("Open today 11:00 AM – 10:00 PM");
    expect(hoursChipText(BIZ, LATE_SATURDAY_LA, "America/New_York", "en")).toBe("Closed today");
    expect(hoursChipText({ ...BIZ, opening_hours_periods: [{ open: { day: 6, hour: 0, minute: 0 } }] }, LATE_SATURDAY_LA, "America/Los_Angeles", "en")).toBe("Open 24 hours today");
    expect(hoursChipText({ ...BIZ, opening_hours_periods: null, opening_hours: null }, LATE_SATURDAY_LA, "America/Los_Angeles", "en")).toBe("Hours not listed on Google");
    expect(hoursChipText(BIZ, LATE_SATURDAY_LA, "America/Los_Angeles", "es")).toContain("Abierto hoy");
  });

  test("falls back to Google's own weekday text when the structured hours are missing", () => {
    const lines = ["Monday: 9 AM – 5 PM", "Tuesday: 9 AM – 5 PM", "Wednesday: 9 AM – 5 PM", "Thursday: 9 AM – 5 PM", "Friday: 9 AM – 5 PM", "Saturday: Closed", "Sunday: Closed"];
    expect(todayHours(null, lines, LATE_SATURDAY_LA, "America/Los_Angeles", "en")).toEqual({ kind: "closed", googleDay: 6 });
    expect(todayHours(null, lines, new Date("2026-10-16T18:00:00Z"), "America/New_York", "en")).toEqual({ kind: "open", googleDay: 5, ranges: ["9 AM – 5 PM"] });
    expect(todayLineIndex(0)).toBe(6); // Sunday is last in the Monday-first week
  });
});

describe("listing chips", () => {
  const render = (b: ListingChipsBusiness, locale: "en" | "es" = "en", tz = "America/Los_Angeles") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale} timeZone={tz}>
        <ListingChips business={b} now={LATE_SATURDAY_LA.toISOString()} />
      </LocaleProvider>
    );

  test("phone (tap to call), today's hours (tap for the week), website, Google Maps", () => {
    const html = render(BIZ);
    expect(html).toContain('href="tel:9143325321"');
    expect(html).toContain("(914) 332-5321");
    expect(html).toContain("Open today 11:00 AM – 10:00 PM");
    expect(html).toMatch(/<button[^>]*aria-expanded="false"/);
    expect(html).toContain('href="https://jgdeli.com/"');
    expect(html).toContain("jgdeli.com");
    expect(html).toContain("View on Google Maps");
    // Wraps on narrow screens instead of scrolling sideways.
    expect(html).toContain("flex min-w-0 flex-wrap items-center gap-1.5");
  });

  test("missing data is said plainly; a Facebook page is not a website — EN + ES", () => {
    const empty = render({ phone: null, website: null, opening_hours: null, opening_hours_periods: null, google_maps_uri: null });
    expect(empty).toContain("No phone on Google");
    expect(empty).toContain("Hours not listed on Google");
    expect(empty).toContain("No website");
    expect(empty).not.toContain("tel:");
    const fb = render({ ...BIZ, website: "https://www.facebook.com/fairfieldliquors" });
    expect(fb).toContain("Facebook page only");
    const es = render({ phone: null, website: null, opening_hours: null, opening_hours_periods: null, google_maps_uri: null }, "es");
    expect(es).toContain("Sin teléfono en Google");
    expect(es).toContain("Horario no indicado en Google");
    expect(es).toContain("Sin sitio web");
  });

  test("a site verified elsewhere (not on the listing) says so", () => {
    const html = render({ ...BIZ, website: null, verified_website_url: "https://example-deli.com" });
    expect(html).toContain("example-deli.com");
    expect(html).toContain("not on Google");
  });
});
