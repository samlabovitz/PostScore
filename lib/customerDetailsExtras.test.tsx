// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

// Customer details: the 3 scored groups (unchanged scoring) plus every other
// yes/no detail Google offers for the category as SUGGESTIONS (no points),
// owner-identity details optional and collapsed — all in one panel at open.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const actions = vi.hoisted(() => ({ loadCustomerDetailsEditorAction: vi.fn(), applyCustomerDetailsAction: vi.fn(), undoCustomerDetailsAction: vi.fn() }));
vi.mock("@/app/actions/gbpCustomerDetails", () => actions);
vi.mock("@/app/actions/customerDetails", () => ({ setCustomerDetailsOwnerAnswer: vi.fn() }));

import { CustomerDetailsGoogleEdit, GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { customerDetailsEditorRows, diffCustomerDetails, extraGroups, HOW_TO_VISIT, isIdentityAttribute, suggestedExtras, type GbpAttributeMetadata } from "@/lib/gbpAttributes";
import { listingIdeas } from "@/lib/listingIdeas";
import { howCalculated } from "@/components/gbp/GoogleProfileTab";
import { LocaleProvider } from "@/lib/i18n";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const meta = (parent: string, group: string, displayName: string): GbpAttributeMetadata => ({ parent, valueType: "BOOL", groupDisplayName: group, displayName });
// What Google offers a hair salon (attributes.list for its category).
const SALON: GbpAttributeMetadata[] = [
  meta("attributes/pay_credit_card", "Payments", "Credit cards"),
  meta("attributes/has_parking_lot_free", "Parking", "Free parking lot"),
  meta("attributes/has_wheelchair_accessible_entrance", "Accessibility", "Wheelchair-accessible entrance"),
  meta("attributes/has_restroom", "Amenities", "Restroom"),
  meta("attributes/has_wifi", "Amenities", "Wi-Fi"),
  meta("attributes/welcomes_walk_ins", "Planning", "Walk-ins welcome"),
  meta("attributes/has_online_appointments", "Planning", "Online appointments"),
  meta("attributes/requires_appointments", "Planning", "Appointment required"),
  meta("attributes/is_owned_by_women", "From the business", "Identifies as women-owned"),
  meta("attributes/is_black_owned", "From the business", "Identifies as Black-owned"),
  meta("attributes/has_lgbtq_friendly", "Crowd", "LGBTQ+ friendly"),
];
const CURRENT = [{ name: "attributes/pay_credit_card", values: [true] }, { name: "attributes/has_wifi", values: [true] }];

describe("rows", () => {
  const rows = customerDetailsEditorRows(SALON, CURRENT);
  test("scored groups, then the category's extras, then owner identity", () => {
    expect(rows.map((r) => [r.id.replace("attributes/", ""), r.part])).toEqual([
      ["has_parking_lot_free", "parking"],
      ["pay_credit_card", "payment"],
      ["has_wheelchair_accessible_entrance", "accessibility"],
      ["has_restroom", "extra"],
      ["has_wifi", "extra"],
      ["welcomes_walk_ins", "extra"],
      ["has_online_appointments", "extra"],
      ["requires_appointments", "extra"],
      ["is_owned_by_women", "identity"],
      ["is_black_owned", "identity"],
      ["has_lgbtq_friendly", "identity"],
    ]);
  });

  test("extras: How to visit first, then Google's groups, each with set / can add", () => {
    expect(extraGroups(rows).map((g) => [g.group, g.rows.length, g.set, g.open])).toEqual([
      [HOW_TO_VISIT, 3, 0, 3],
      ["Amenities", 2, 1, 1],
    ]);
  });

  test("only what Google offers for the category is listed", () => {
    expect(customerDetailsEditorRows([meta("attributes/has_restroom", "Amenities", "Restroom")], []).map((r) => r.id)).toEqual(["attributes/has_restroom"]);
  });

  test("suggestions for a salon: walk-ins, online appointments, restroom — never identity", () => {
    expect(suggestedExtras(rows, "hair").map((r) => r.label)).toEqual(["Walk-ins welcome", "Online appointments", "Restroom"]);
    expect(isIdentityAttribute("attributes/is_veteran_led")).toBe(true);
    const identityOnly = customerDetailsEditorRows([meta("attributes/is_owned_by_women", "From the business", "Women-owned")], []);
    expect(suggestedExtras(identityOnly, "hair")).toEqual([]);
  });

  test("an extra saves through the same flow (Approve → read back → undo)", () => {
    const diff = diffCustomerDetails(rows, { "attributes/welcomes_walk_ins": true });
    expect(diff).toMatchObject({ ok: true, changes: [{ id: "attributes/welcomes_walk_ins", part: "extra", before: null, after: true }] });
  });
});

describe("the panel opens fully", () => {
  test("Update → every group at once, no separate Change step; identity collapsed", async () => {
    actions.loadCustomerDetailsEditorAction.mockResolvedValue({ status: "ok", rows: customerDetailsEditorRows(SALON, CURRENT), owner: { canRemove: ["parking", "payment"], removed: [] }, practice: true, canEdit: true, undo: null });
    await act(async () => {
      render(
        <LocaleProvider locale="en" timeZone="America/New_York">
          <GbpEditProvider value={{ premium: true, connected: true, undo: null, canEdit: true, practice: true }}>
            <CustomerDetailsGoogleEdit businessId="b1" autoLoad openEditing />
          </GbpEditProvider>
        </LocaleProvider>
      );
    });
    expect(screen.getByTestId("gbp-edit-scored").textContent).toContain("Counts toward your score");
    expect(screen.getByTestId("gbp-edit-status-payment").textContent).toBe("✓ set");
    expect(screen.getByTestId("gbp-edit-status-parking").textContent).toBe("! missing");
    const extras = screen.getByTestId("gbp-edit-extras");
    expect(extras.textContent).toContain("Help more people choose you (no points, raises your conversion rate)");
    expect(extras.textContent).toContain("How to visit0 set · 3 you can add");
    expect(extras.textContent).toContain("Walk-ins welcome");
    const identity = screen.getByTestId("gbp-edit-identity") as HTMLDetailsElement;
    expect(identity.open).toBe(false);
    expect(identity.textContent).toContain("About the owner (optional, only if you want to share)");
    expect(screen.queryByTestId("gbp-edit-change")).toBeNull();
  });
});

describe("section 5: Answer the questions customers ask", () => {
  const base = { businessId: "b1", now: Date.parse("2026-11-15T12:00:00Z"), type: "hair" as const, months: [], photos: null, posts: null, messagingOn: null, bookingTurnOn: null };
  const listing = (details: { payment: boolean; parking: boolean; accessibility: boolean; suggest: Array<{ id: string; label: string }> }) => ({ services: [], categories: ["Hair salon", "Beauty salon"], description: "x".repeat(300), specialPeriods: [{ startDate: { year: 2026, month: 11, day: 26 }, closed: true }, { startDate: { year: 2026, month: 12, day: 24 }, closed: true }, { startDate: { year: 2026, month: 12, day: 25 }, closed: true }], attributeIds: ["attributes/has_parking_lot_free", "attributes/has_wheelchair_accessible_entrance"], details });
  const suggest = [{ id: "a/welcomes_walk_ins", label: "Walk-ins welcome" }, { id: "a/has_online_appointments", label: "Online appointments" }, { id: "a/has_restroom", label: "Restroom" }];
  test("only when the scored groups are complete", () => {
    expect(listingIdeas({ ...base, listing: listing({ payment: true, parking: true, accessibility: true, suggest }) })).toEqual([expect.objectContaining({ id: "extras", names: ["Walk-ins welcome", "Online appointments", "Restroom"] })]);
    expect(listingIdeas({ ...base, listing: listing({ payment: true, parking: false, accessibility: true, suggest }) }).some((i) => i.id === "extras")).toBe(false);
  });
});

describe("hero: How it's calculated", () => {
  test("with real numbers, nothing with zero views", () => {
    expect(howCalculated(152, 704)).toEqual({ interactions: 152, views: 704 });
    expect(howCalculated(0, 0)).toBeNull();
  });
});
