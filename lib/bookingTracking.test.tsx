import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Day 22B: the Book online button, read from Google's Place Actions links,
// and whether Google can count its bookings — cases A (partner-added: info
// only), B (the owner's link to a partner: "Turn on Google booking") and C
// (bookings counted: nothing). Saved sample JSON only (Hair Express's real
// square.site link), no live calls.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/actions/gbpCustomerDetails", () => ({ applyCustomerDetailsAction: vi.fn(), loadCustomerDetailsEditorAction: vi.fn(), undoCustomerDetailsAction: vi.fn() }));
vi.mock("@/app/actions/gbpWebsiteLink", () => ({ openWebsiteLinkFix: vi.fn(), applyWebsiteLinkFix: vi.fn(), undoWebsiteLinkFix: vi.fn() }));
vi.mock("@/app/actions/gbpProfileEdits", () => ({ openProfileEdits: vi.fn(async () => ({ status: "error" })), applyProfileEditAction: vi.fn(), undoProfileEditAction: vi.fn() }));
vi.mock("@/app/actions/gbpOrderLink", () => ({ openOrderLink: vi.fn(async () => ({ status: "error" })), applyOrderLinkAction: vi.fn(), undoOrderLinkAction: vi.fn() }));
vi.mock("@/app/actions/gbpInsights", () => ({ syncGoogleNumbers: vi.fn() }));
vi.mock("@/app/actions/bookingReminder", () => ({ snoozeBookingReminder: vi.fn() }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { GoogleProfileTab, rowText, type GoogleProfileTabProps } from "@/components/gbp/GoogleProfileTab";
import { BookingStepsPanel, BookingTaskCard } from "@/components/gbp/BookingSteps";
import { BOOKING_PARTNERS, bookingLink, bookingTracking, partnerFor, type BookingLink } from "./bookingPartners";
import { listingGroups, type BookingState } from "./googleProfileTab";
import { fromRow, type InsightsRow } from "./gbpInsights";
import { fromReal } from "./gbpProfilePractice.server";

// What Google returned for Hair Express (placeActionLinks.list).
const HAIR_EXPRESS_LINKS = [
  { name: "locations/15510298593847876242/placeActionLinks/43103ceffbe55742", providerType: "AGGREGATOR_3P", uri: "https://square.site/book/B31SCMS0P88ZP/hair-express-on-broadway-tarrytown-ny", placeActionType: "APPOINTMENT" },
];
const OWNER_SQUARE = [{ name: "x/1", providerType: "MERCHANT", isEditable: true, uri: "https://book.squareup.com/appointments/abc", placeActionType: "APPOINTMENT" }];
const NOW = Date.parse("2026-11-15T12:00:00Z");

describe("the booking button", () => {
  test("partners: one list, matched by domain (square.site, book.squareup.com, vagaro …)", () => {
    expect(BOOKING_PARTNERS.map((p) => p.name)).toEqual(["Square", "Vagaro", "Booksy", "Fresha", "Mindbody", "StyleSeat", "GlossGenius", "Acuity", "Setmore", "SimplyBook", "Schedulicity", "Boulevard"]);
    expect(partnerFor("https://square.site/book/x")?.name).toBe("Square");
    expect(partnerFor("https://book.squareup.com/appointments/x")?.name).toBe("Square");
    expect(partnerFor("https://www.vagaro.com/salon")?.name).toBe("Vagaro");
    expect(partnerFor("https://example.com/book")).toBeNull();
  });

  test("the link: partner-added (Hair Express's square.site), the owner's own, or none; ordering links don't count", () => {
    expect(bookingLink(HAIR_EXPRESS_LINKS)).toEqual({ kind: "partner", uri: HAIR_EXPRESS_LINKS[0].uri, provider: "Square", partnerId: "square" });
    expect(bookingLink(OWNER_SQUARE)).toMatchObject({ kind: "merchant", provider: "Square", partnerId: "square" });
    expect(bookingLink([{ providerType: "MERCHANT", uri: "https://mysalon.com/book", placeActionType: "APPOINTMENT" }])).toMatchObject({ kind: "merchant", provider: "mysalon.com", partnerId: null });
    expect(bookingLink([{ providerType: "MERCHANT", uri: "https://order.me/x", placeActionType: "FOOD_ORDERING" }])).toEqual({ kind: "none" });
    expect(bookingLink([])).toEqual({ kind: "none" });
    // The owner's own link wins over a partner's.
    expect(bookingLink([...HAIR_EXPRESS_LINKS, ...OWNER_SQUARE]).kind).toBe("merchant");
  });

  test("A: partner link + 0 bookings → an info note, never a task; B: the owner's partner link + 0 → turn it on; C: any bookings → nothing", () => {
    const partner = bookingLink(HAIR_EXPRESS_LINKS);
    const owner = bookingLink(OWNER_SQUARE);
    const zeros = Array(18).fill(0);
    expect(bookingTracking(partner, zeros, null, NOW)).toEqual({ kind: "partner_not_counted", provider: "Square" });
    expect(bookingTracking(owner, zeros, null, NOW)).toEqual({ kind: "turn_on", provider: "Square", partnerId: "square", still: false });
    expect(bookingTracking(owner, [...zeros.slice(1), 2], null, NOW)).toEqual({ kind: "none" });
    expect(bookingTracking(partner, [0, 0, 1], null, NOW)).toEqual({ kind: "none" });
    // No link: the existing "add a booking link" behavior; no months stored: nothing claimed.
    expect(bookingTracking({ kind: "none" }, zeros, null, NOW)).toEqual({ kind: "none" });
    expect(bookingTracking(owner, [], null, NOW)).toEqual({ kind: "none" });
    // A link to a site that isn't a booking partner: nothing to turn on.
    expect(bookingTracking(bookingLink([{ providerType: "MERCHANT", uri: "https://mysalon.com/book", placeActionType: "APPOINTMENT" }]), zeros, null, NOW)).toEqual({ kind: "none" });
  });

  test("“I turned it on”: hidden for 14 days, then back as “Still not tracked” if Google still counts 0", () => {
    const owner = bookingLink(OWNER_SQUARE);
    const zeros = Array(18).fill(0);
    expect(bookingTracking(owner, zeros, "2026-11-10T00:00:00Z", NOW)).toEqual({ kind: "none" });
    expect(bookingTracking(owner, zeros, "2026-10-20T00:00:00Z", NOW)).toEqual({ kind: "turn_on", provider: "Square", partnerId: "square", still: true });
    expect(bookingTracking(owner, [...zeros.slice(1), 3], "2026-10-01T00:00:00Z", NOW)).toEqual({ kind: "none" });
  });
});

// ---------------------------------------------------------------------------

const row = (m: string, bookings: number): InsightsRow => ({ month: `${m}-01`, views_search_mobile: 300, views_maps_mobile: 100, views_search_desktop: 50, views_maps_desktop: 20, calls: 20, directions: 40, bookings, website_clicks: 30, conversations: 0, food_orders: 0, calls_by_weekday: null, top_keywords: null });
const MONTHS = ["2026-09", "2026-10"].map((m) => fromRow(row(m, 0)));
const state = (link: BookingLink, months = MONTHS): BookingState => ({ link, tracking: bookingTracking(link, months.map((m) => m.bookings), null, NOW) });
const BASE: GoogleProfileTabProps = {
  businessId: "b1",
  connected: true,
  practice: false,
  needsReconnect: false,
  canStart: true,
  result: null,
  business: { name: "Hair express on Broadway", address: null },
  listing: { rating: 5, reviewCount: 30, photoCount: 10, phone: null, website: null, category: "Hair salon", openingHours: null, googleMapsUri: null },
  checks: [],
  website: null,
  replyCounts: null,
  messagingOn: null,
  saved: null,
  lastScanAt: null,
  insights: MONTHS,
};
const render = (props: Partial<GoogleProfileTabProps>, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      <GbpEditProvider value={{ premium: true, connected: true, undo: null, canEdit: false }}>
        <GoogleProfileTab {...BASE} {...props} />
      </GbpEditProvider>
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const bookingRowOf = (b: BookingState | null) => listingGroups({ ...BASE.listing, businessId: "b1", checks: [], messagingOn: null, replies: null, booking: b }).flatMap((g) => g.rows).find((r) => r.id === "booking")!;

describe("the Booking link row", () => {
  test("no link: ! and “Add the link”; the owner's link: ✓, “Book online · via …”, Edit; a partner's: ✓, “Managed by Square”, read-only", () => {
    const none = bookingRowOf(state({ kind: "none" }));
    expect([none.status, rowText(none, "en").value, rowText(none, "en").action]).toEqual(["warn", "No booking link on Google yet", "Add the link"]);
    const merchant = bookingRowOf({ link: bookingLink([{ providerType: "MERCHANT", uri: "https://mysalon.com/book", placeActionType: "APPOINTMENT" }]), tracking: { kind: "none" } });
    expect([merchant.status, rowText(merchant, "en").value, rowText(merchant, "en").note, rowText(merchant, "en").action]).toEqual(["ok", "Book online · via mysalon.com", "The Book online button on your Google listing.", "Edit"]);
    const partner = bookingRowOf(state(bookingLink(HAIR_EXPRESS_LINKS)));
    expect([partner.status, rowText(partner, "en").value, rowText(partner, "en").action]).toEqual(["ok", "Book online · via Square", "Managed by Square"]);
    expect(partner.action).toEqual({ kind: "editor", editor: "booking_partner" });
    const caseB = bookingRowOf(state(bookingLink(OWNER_SQUARE)));
    expect([caseB.status, rowText(caseB, "en").note, rowText(caseB, "en").action]).toEqual(["warn", "Bookings happen on Square's site, so Google can't count them.", "Turn on Google booking"]);
  });

  test("Hair Express (case A): ✓ “via Square”, a “Booked in Google” note, no turn-on task anywhere", () => {
    const html = render({ booking: state(bookingLink(HAIR_EXPRESS_LINKS)) });
    const words = text(html);
    expect(words).toContain("Book online · via Square");
    expect(words).toContain("Managed by Square");
    expect(words).not.toContain("Add the link");
    expect(html).toContain('data-testid="booking-tile-note"');
    expect(words).toContain("Google lists your Square booking button, but bookings finish on Square's site, so Google can't count them. PostScore will count them once you connect Square (coming soon).");
    expect(words).not.toMatch(/Turn on Google booking|Let customers book without leaving Google/);
    expect(html).not.toContain("google-tab-idea-booking");
  });

  test("case B: the row, the section 5 idea first, the Booked in Google note; Spanish too", () => {
    const html = render({ booking: state(bookingLink(OWNER_SQUARE)) });
    const words = text(html);
    expect(words).toContain("Turn on Google booking");
    expect(html).toContain('data-testid="google-tab-idea-booking"');
    expect(words).toContain("Let customers book without leaving Google Track every booking Your Book online button sends people to Square. Turn on Square's Google booking so people book right on Google and Google counts each one.");
    expect(words).toContain("Not tracked yet: turn on Google booking in Square");
    expect(html).toContain('href="#edit-booking-steps"');
    expect(text(render({ booking: state(bookingLink(OWNER_SQUARE)) }, "es"))).toContain("Deje que los clientes reserven sin salir de Google");
  });

  test("case C: bookings counted → no note, no idea, ✓", () => {
    const counted = ["2026-09", "2026-10"].map((m, i) => fromRow(row(m, i)));
    const html = render({ insights: counted, booking: state(bookingLink(OWNER_SQUARE), counted) });
    expect(html).not.toContain("booking-tile-note");
    expect(html).not.toContain("google-tab-idea-booking");
    expect(html).toMatch(/data-testid="listing-row-booking" data-status="ok"/);
  });

  test("the step panel: Square's 4 steps and note; a generic line for other partners; “I turned it on”; the Growth recap task", () => {
    const wrap = (node: React.ReactNode) => text(renderToStaticMarkup(<LocaleProvider locale="en" timeZone="America/New_York">{node}</LocaleProvider>));
    const square = wrap(<BookingStepsPanel businessId="b1" provider="Square" partnerId="square" />);
    expect(square).toContain("In Square Dashboard go to Appointments → Settings → Online booking → Channels.");
    expect(square).toContain("Bookings made directly on your Square site still won't show here.");
    expect(square).toContain("I turned it on");
    expect(wrap(<BookingStepsPanel businessId="b1" provider="Vagaro" partnerId="vagaro" />)).toContain("In Vagaro's settings, look for \"Reserve with Google\" or \"Book with Google\" and turn it on.");
    expect(wrap(<BookingStepsPanel businessId="b1" provider="Square" partnerId="square" still />)).toContain("Still not tracked. Double-check the setting.");
    expect(wrap(<BookingTaskCard businessId="b1" provider="Square" still={false} />)).toContain("Turn on Google booking in Square (10 min)");
  });
});

describe("practice mode starts from the real listing", () => {
  test("the practice copy is exactly what Google returned (description, phone, website, hours, categories, services, special hours, customer details)", () => {
    const copy = fromReal({
      location: {
        title: "Hair express on Broadway",
        phoneNumbers: { primaryPhone: "(914) 320-3012" },
        websiteUri: "https://hairexpressonbroadway.com/",
        profile: { description: "Hair salon" },
        regularHours: { periods: [{ openDay: "TUESDAY", openTime: { hours: 9, minutes: 30 }, closeDay: "TUESDAY", closeTime: { hours: 17 } }] },
        categories: { primaryCategory: { displayName: "Hair salon" } },
        serviceItems: [{ structuredServiceItem: { serviceTypeId: "job_type_id:balayages" } }],
        specialHours: { specialHourPeriods: [] },
      },
      attributes: [{ name: "attributes/pay_credit_card", valueType: "BOOL", values: [true] }, { name: "attributes/url_appointment", valueType: "URL", values: [] }],
      placeActionLinks: HAIR_EXPRESS_LINKS,
    });
    expect(copy.source).toBe("real");
    expect(copy.phoneNumbers.primaryPhone).toBe("(914) 320-3012");
    expect(copy.profile.description).toBe("Hair salon");
    expect(copy.websiteUri).toBe("https://hairexpressonbroadway.com/");
    expect(copy.regularHours.periods).toHaveLength(1);
    expect(copy.serviceItems).toHaveLength(1);
    expect(Array.from(copy.attributes)).toEqual([["attributes/pay_credit_card", true]]);
  });

  test("the strip says where the practice copy came from; a failed read says so", () => {
    expect(text(render({ practice: true, practiceSource: "real" }))).toContain("Practice mode · a copy of your real listing");
    const fallback = render({ practice: true, practiceSource: "fallback" });
    expect(fallback).toContain('data-testid="google-tab-practice-fallback"');
    expect(text(fallback)).toContain("Practice copy: couldn't load your real listing");
  });
});
