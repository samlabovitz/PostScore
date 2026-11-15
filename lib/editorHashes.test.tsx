// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";

// Every section 5 idea and section 1 lever links to "#edit-…": each one must
// scroll to its Section 4 row and open that row's editor inline — on page
// load and on hashchange (already on the page), again after it was closed,
// in practice mode and live. Actions are stubbed: nothing calls Google.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const pending = vi.hoisted(() => () => new Promise<never>(() => undefined));
vi.mock("@/app/actions/gbpInsights", () => ({ syncGoogleNumbers: vi.fn(pending) }));
vi.mock("@/app/actions/gbpProfileEdits", () => ({ openProfileEdits: vi.fn(pending), applyProfileEditAction: vi.fn(), undoProfileEditAction: vi.fn(), draftProfileDescription: vi.fn() }));
vi.mock("@/app/actions/gbpOrderLink", () => ({ openOrderLink: vi.fn(pending), applyOrderLinkAction: vi.fn(), undoOrderLinkAction: vi.fn() }));
vi.mock("@/app/actions/gbpWebsiteLink", () => ({ openWebsiteLinkFix: vi.fn(pending), checkWebsiteLinkAction: vi.fn(), applyWebsiteLinkAction: vi.fn(), undoWebsiteLinkAction: vi.fn() }));
vi.mock("@/app/actions/gbpCustomerDetails", () => ({ loadCustomerDetailsEditorAction: vi.fn(pending), applyCustomerDetailsAction: vi.fn(), undoCustomerDetailsAction: vi.fn() }));
vi.mock("@/app/actions/customerDetails", () => ({ setCustomerDetailsOwnerAnswer: vi.fn() }));
vi.mock("@/app/actions/gbpListingFields", () => ({ openHolidayHours: vi.fn(pending), applyHolidayHours: vi.fn(), undoHolidayHours: vi.fn(), openServices: vi.fn(pending), applyServices: vi.fn(), undoServices: vi.fn() }));
vi.mock("@/app/actions/gbpGoogleEdits", () => ({ keepGoogleVersion: vi.fn(), changeGoogleEditBack: vi.fn(), reopenGoogleEditAction: vi.fn(), checkGoogleEditsNow: vi.fn(), undoMadeChange: vi.fn() }));
vi.mock("@/app/actions/hoursChooser", () => ({ openHoursCompare: vi.fn(pending) }));
const photos = vi.hoisted(() => ({ mode: "live" as "live" | "practice" | "readonly" }));
vi.mock("@/app/actions/gbpPhotos", () => ({
  openPhotoUpload: vi.fn(async () => ({ status: "ok", canEdit: photos.mode !== "readonly", practice: photos.mode === "practice", undo: null, nicheId: "hair_salon" })),
  finishPhotoBatch: vi.fn(),
  undoPhotosAction: vi.fn(),
}));
vi.mock("@/app/actions/bookingReminder", () => ({ snoozeBookingReminder: vi.fn() }));
vi.mock("@/app/actions/gbpMessaging", () => ({}));

import { GoogleProfileTab, type GoogleProfileTabProps } from "@/components/gbp/GoogleProfileTab";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { LocaleProvider } from "@/lib/i18n";

const check = (id: string, earned: number | null, max = 4) => ({ id, label: id, category: "completeness", maxPoints: max, earnedPoints: earned, confidence: "VERIFIED", explanation: `${id} explanation` }) as never;
const PROPS: GoogleProfileTabProps = {
  businessId: "b1",
  connected: true,
  practice: false,
  needsReconnect: false,
  canStart: true,
  result: null,
  business: { name: "Hair express on Broadway", address: null },
  listing: { rating: 5, reviewCount: 30, photoCount: 4, phone: "(914) 320-3012", website: "https://hairexpressonbroadway.com/", category: "Hair salon", openingHours: ["Monday: Closed"], googleMapsUri: null } as never,
  checks: [check("completeness.phone", 4), check("completeness.hours", 2), check("completeness.customer_details", 0), check("completeness.photos", 4)],
  website: null,
  replyCounts: null,
  messagingOn: false,
  saved: null,
  lastScanAt: "2026-11-15T12:00:00Z",
  media: { photos: { count: 4, newestAt: "2026-09-09T00:00:00Z" }, posts: { last30: 0, lastAt: null, lastType: null }, checkedAt: "2026-11-15T00:00:00Z" },
  extras: { specialPeriods: [], services: ["Haircut"], categories: ["Hair salon"], description: "Hair salon", attributeIds: [] },
  insightsState: "ready",
};

const HASHES: Array<[string, string]> = [
  ["#edit-photos", "photos"],
  ["#edit-holiday", "holiday"],
  ["#edit-description", "description"],
  ["#edit-customer-details", "customerDetails"],
  ["#edit-messaging", "messaging"],
  ["#edit-services?add=Keratin%20treatment", "services"],
];

beforeAllScroll();
function beforeAllScroll() {
  // jsdom has no layout: scrolling is a no-op we can watch.
  Element.prototype.scrollIntoView = vi.fn();
  window.requestAnimationFrame = (cb: FrameRequestCallback) => (cb(0), 0);
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/business/b1/growth?tab=google");
});

// StrictMode like `next dev`: effects run, clean up, and run again.
const mount = (practice: boolean) =>
  render(
    <StrictMode>
    <LocaleProvider locale="en" timeZone="America/New_York">
      <GbpEditProvider value={{ premium: true, connected: true, undo: null, canEdit: true, practice }}>
        <GoogleProfileTab {...PROPS} practice={practice} />
      </GbpEditProvider>
    </LocaleProvider>
    </StrictMode>
  );

async function go(hash: string) {
  await act(async () => {
    window.history.pushState(null, "", `/business/b1/growth?tab=google${hash}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

describe.each([
  ["practice", true],
  ["live", false],
])("%s mode", (_name, practice) => {
  test.each(HASHES)("%s opens on page load", async (hash, row) => {
    photos.mode = practice ? "practice" : "live";
    window.history.replaceState(null, "", `/business/b1/growth?tab=google${hash}`);
    await act(async () => void mount(practice));
    expect(screen.getByTestId(`listing-editor-${row}`)).toBeTruthy();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  test.each(HASHES)("%s opens on hashchange, and again after it was closed", async (hash, row) => {
    photos.mode = practice ? "practice" : "live";
    await act(async () => void mount(practice));
    expect(screen.queryByTestId(`listing-editor-${row}`)).toBeNull();
    await go(hash);
    expect(screen.getByTestId(`listing-editor-${row}`)).toBeTruthy();
    // Close it with the row's own button, then follow the same link again.
    await act(async () => screen.getByTestId(`listing-action-${row}`).click());
    expect(screen.queryByTestId(`listing-editor-${row}`)).toBeNull();
    // The address bar still shows the hash: a link click must reopen it (no hashchange fires).
    const link = document.createElement("a");
    link.setAttribute("href", window.location.hash);
    document.body.appendChild(link);
    await act(async () => link.click());
    link.remove();
    expect(screen.getByTestId(`listing-editor-${row}`)).toBeTruthy();
    // And a fresh hashchange after moving away.
    await act(async () => screen.getByTestId(`listing-action-${row}`).click());
    await go("#");
    await go(hash);
    expect(screen.getByTestId(`listing-editor-${row}`)).toBeTruthy();
  });
});

describe("the photo panel in each mode", () => {
  test.each([
    ["practice", "photo-upload"],
    ["live", "photo-upload"],
    ["readonly", "photos-on-google"],
  ] as const)("%s → %s", async (mode, testId) => {
    photos.mode = mode;
    window.history.replaceState(null, "", "/business/b1/growth?tab=google#edit-photos");
    await act(async () => void mount(mode === "practice"));
    expect(await screen.findByTestId(testId)).toBeTruthy();
    if (mode === "practice") expect(screen.getByText("Practice mode: nothing is sent to Google.")).toBeTruthy();
  });

  test("the Photos row has its own Add photos button", async () => {
    await act(async () => void mount(false));
    const button = screen.getByTestId("listing-action-photos");
    expect(button.textContent).toBe("Add photos");
    await act(async () => button.click());
    expect(screen.getByTestId("listing-editor-photos")).toBeTruthy();
  });
});
