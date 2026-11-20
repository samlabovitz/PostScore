import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { whoTable, SAMPLE_AUDIENCE, type Audience } from "@/lib/gbpInsights";
import { deviceAdvice, deviceSplit, type DeviceFacts } from "@/lib/googleProfileTab";
import { GoogleProfileTab } from "@/components/gbp/GoogleProfileTab";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { LocaleProvider } from "@/lib/i18n";

// Section 2: "Who saw you" as a table against the same months last year,
// and "Devices and platforms" with the split and "What this means for you".

const aud = (views: [number, number | null], interactions: [number, number | null]): Audience => ({ ...SAMPLE_AUDIENCE, compare: { to: "2026-10", views, interactions } });

describe("Who saw you: the table", () => {
  test("Hair Express's real numbers: whole % and customers per 100", () => {
    const t = whoTable(aud([3346, 3768], [696, 545]))!;
    expect(t.to).toBe("2026-10");
    expect(t.lastTo).toBe("2025-10");
    expect(t.rows).toEqual([
      { id: "views", now: 3346, last: 3768, change: { kind: "percent", value: -11 } },
      { id: "interactions", now: 696, last: 545, change: { kind: "percent", value: 28 } },
      { id: "per100", now: 21, last: 14, change: { kind: "more", value: 7 } },
    ]);
    expect(t.takeaway).toBe("downUp");
  });

  test("the four takeaways", () => {
    expect(whoTable(aud([120, 100], [30, 20]))!.takeaway).toBe("upUp");
    expect(whoTable(aud([120, 100], [10, 20]))!.takeaway).toBe("upDown");
    expect(whoTable(aud([80, 100], [10, 20]))!.takeaway).toBe("downDown");
    expect(whoTable(aud([80, 100], [30, 20]))!.takeaway).toBe("downUp");
  });

  test("rounding to whole numbers", () => {
    expect(whoTable(aud([1005, 1000], [100, 100]))!.rows[0].change).toEqual({ kind: "percent", value: 1 });
    expect(whoTable(aud([994, 1000], [100, 100]))!.rows[0].change).toEqual({ kind: "percent", value: -1 });
    expect(whoTable(aud([1000, 1000], [205, 200]))!.rows[2]).toMatchObject({ now: 21, last: 20 });
  });

  test("last year's months missing: — and Not enough history, no takeaway", () => {
    const t = whoTable(aud([3346, null], [696, null]))!;
    expect(t.rows.map((r) => [r.last, r.change])).toEqual([[null, null], [null, null], [null, null]]);
    expect(t.takeaway).toBeNull();
  });
});

describe("Devices and platforms", () => {
  test("the split adds up to 100 in each pair", () => {
    expect(deviceSplit(SAMPLE_AUDIENCE.rows)).toEqual({ phone: 83, computer: 17, search: 70, maps: 30 });
  });

  const facts = (over: Partial<DeviceFacts> = {}): DeviceFacts => ({ businessId: "b1", tapToCall: true, mobileSlow: false, bookingLink: true, descriptionLength: 400, photosFresh: true, holidayUnset: null, listingRead: true, ...over });
  const split = { phone: 83, computer: 17, search: 70, maps: 30 };

  test("bullets from the real checks, ! first, at most 3", () => {
    const items = deviceAdvice(split, facts({ tapToCall: false, mobileSlow: true, descriptionLength: 10, photosFresh: false, holidayUnset: "thanksgiving" }));
    expect(items.map((i) => [i.key, i.status])).toEqual([
      ["tapToCall", "warn"],
      ["speed", "warn"],
      ["description", "warn"],
    ]);
    expect(items[0].href).toBe("/business/b1/website#check-contact_conversion");
  });

  test("all good: ✓ items, each group once", () => {
    expect(deviceAdvice(split, facts()).map((i) => [i.key, i.status])).toEqual([
      ["bookingWorks", "ok"],
      ["descriptionOk", "ok"],
      ["mapsOk", "ok"],
    ]);
  });

  test("Hair Express today: photos and the holiday first, then the booking button", () => {
    const items = deviceAdvice(split, facts({ descriptionLength: 10, photosFresh: false, holidayUnset: "thanksgiving", tapToCall: null, mobileSlow: null }));
    expect(items.map((i) => i.key)).toEqual(["description", "photos", "holiday"]);
    expect(items.find((i) => i.key === "holiday")).toMatchObject({ href: "#edit-holiday", holiday: "thanksgiving" });
  });

  test("thresholds: phone < 60%, Search < 50%, Maps < 25% leave their group out", () => {
    expect(deviceAdvice({ phone: 55, computer: 45, search: 80, maps: 20 }, facts({ tapToCall: false })).map((i) => i.group)).toEqual(["search"]);
  });

  test("labels: two lines, never truncated; the summary strip", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en" timeZone="America/New_York">
        <GbpEditProvider value={{ premium: true, connected: false, undo: null, canEdit: true, practice: true }}>
          <GoogleProfileTab businessId="b1" connected={false} practice needsReconnect={false} canStart result={null} business={{ name: null, address: null }} listing={{ rating: null, reviewCount: null, photoCount: null, phone: null, website: null, category: null, openingHours: null, googleMapsUri: null } as never} checks={[]} website={null} replyCounts={null} messagingOn={null} saved={null} lastScanAt={null} />
        </GbpEditProvider>
      </LocaleProvider>
    );
    const devices = html.slice(html.indexOf('data-testid="google-tab-devices"'), html.indexOf('data-testid="google-tab-device-split"'));
    expect(devices).not.toContain("truncate");
    expect(devices).toContain('<b class="block font-semibold text-ink">Google Search</b><span class="text-[11.5px] text-ink-mute">on a phone</span>');
    const strip = html.slice(html.indexOf('data-testid="google-tab-device-split"'));
    expect(strip.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).toContain("83% on a phone 17% on a computer 70% Google Search 30% Google Maps");
  });
});

describe("hero: How it's calculated", () => {
  const tab = (locale: "en" | "es") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale} timeZone="America/New_York">
        <GbpEditProvider value={{ premium: true, connected: false, undo: null, canEdit: true, practice: true }}>
          <GoogleProfileTab businessId="b1" connected={false} practice needsReconnect={false} canStart result={null} business={{ name: null, address: null }} listing={{ rating: null, reviewCount: null, photoCount: null, phone: null, website: null, category: null, openingHours: null, googleMapsUri: null } as never} checks={[]} website={null} replyCounts={null} messagingOn={null} saved={null} lastScanAt={null} />
        </GbpEditProvider>
      </LocaleProvider>
    ).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
  test("the real month's numbers, with the ⓘ", () => {
    // In the hero's ⓘ panel.
    expect(tab("en")).toContain("ⓘ How it's calculated: 83 people who called, asked for directions, visited your site, booked or messaged ÷ 704 people who saw your listing on Google.");
    expect(tab("es")).toContain("Cómo se calcula: 83 personas que llamaron, pidieron indicaciones, visitaron su sitio, reservaron o enviaron un mensaje ÷ 704 personas que vieron su ficha en Google.");
  });
});

