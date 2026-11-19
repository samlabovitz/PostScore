import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { LocaleProvider, type Locale } from "@/lib/i18n";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// The customer-details row and its "Update on Google" panel (EN + ES):
// status chips → one action by plan → small secondary links; the panel's
// "choose all that apply" groups of Google's offered options, with the
// owner's own "No parking available" / "no payments on site".

import { EditorPanel, GbpEditProvider, ownerChangesOf, pendingChanges, toggleOption, toggleOwnerPart, type Editor } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { CategoryCard } from "@/components/scoring/CategoryCard";
import { customerDetailsEditorRows } from "@/lib/gbpAttributes";
import { businessRowToScoringInput, scoreBusiness, type BusinessScoringRow } from "@/lib/scoring";
import { breakdownFixLinks } from "@/components/overview/ScoreBreakdownPanel";

/** Google's real offer for Hair express on Broadway (attributes.list,
 * Oct 28) — the groups the panel uses, plus some it doesn't. */
const OFFERED = [
  "has_wheelchair_accessible_entrance",
  "has_wheelchair_accessible_parking",
  "has_wheelchair_accessible_restroom",
  "has_wheelchair_accessible_seating",
  "has_hearing_loop",
  "requires_cash_only",
  "pay_check",
  "pay_credit_card",
  "pay_debit_card",
  "pay_mobile_nfc",
  "has_parking_garage_free",
  "has_parking_lot_free",
  "has_parking_street_free",
  "has_onsite_parking",
  "has_parking_garage_paid",
  "has_parking_lot_paid",
  "has_parking_street_paid",
  "has_restroom",
].map((id) => ({ parent: `attributes/${id}`, valueType: "BOOL", displayName: id }));
const CURRENT = [
  { name: "attributes/has_parking_street_paid", values: [true] },
  { name: "attributes/pay_credit_card", values: [true] },
  { name: "attributes/has_wheelchair_accessible_entrance", values: [false] },
];

function editor(owner: Editor["owner"] = { canRemove: ["parking", "payment"], removed: [] }): Editor {
  const rows = customerDetailsEditorRows(OFFERED, CURRENT);
  return { rows, owner, checked: Object.fromEntries(rows.map((r) => [r.id, r.current === true])), ownerOff: { parking: owner.removed.includes("parking"), payment: owner.removed.includes("payment") } };
}

const wrap = (node: ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);

describe("the Update on Google panel: choose all that apply", () => {
  test("each group's question and only Google's offered options, plain labels, current values ticked", () => {
    const html = wrap(<EditorPanel editor={editor()} onChange={() => {}} onReview={() => {}} onCancel={() => {}} />);
    expect(html).toContain("How can customers park? Choose all that apply");
    expect(html).toContain("How can customers pay? Choose all that apply");
    expect(html).toContain("What&#x27;s wheelchair accessible? Choose all that apply");
    // Parking first, in order; valet isn't offered here, so it isn't shown.
    const parking = ["Free street parking", "Paid street parking", "Free parking lot", "Paid parking lot", "Free garage", "Paid garage"];
    const at = parking.map((l) => html.indexOf(`>${l}<`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).not.toContain("Valet");
    expect(html).toContain("Contactless / phone pay (NFC)");
    expect(html).toContain("Cash only");
    expect(html).toContain("Wheelchair-accessible seating");
    // Not in the scored groups: checks, on-site parking, hearing loop, restroom —
    // those are suggestions under "Help more people choose you" (no points).
    const scored = html.slice(html.indexOf('data-testid="gbp-edit-scored"'), html.indexOf('data-testid="gbp-edit-extras"'));
    expect(scored).not.toMatch(/pay_check|has_onsite_parking|has_hearing_loop|has_restroom/);
    expect(html.slice(html.indexOf('data-testid="gbp-edit-extras"'))).toMatch(/Restroom/);
    expect(html).not.toMatch(/dashboard\.gbpEdit\.option\./);
    // "No parking available" last in its group, labeled "Added by you".
    expect(html.indexOf("No parking available")).toBeGreaterThan(html.indexOf("Paid garage"));
    expect(html).toContain("We take no payments on site");
    expect(html).toMatch(/checked=""[^>]*\/>Paid street parking/);
    expect(html).not.toMatch(/checked=""[^>]*\/>Free street parking/);
  });

  test("Spanish, usted", () => {
    const html = wrap(<EditorPanel editor={editor()} onChange={() => {}} onReview={() => {}} onCancel={() => {}} />, "es");
    expect(html).toContain("¿Cómo pueden estacionar sus clientes? Elija todas las que correspondan");
    expect(html).toContain("Pago sin contacto o con el teléfono (NFC)");
    expect(html).toContain("No hay estacionamiento");
  });

  test("ticking adds a yes; un-ticking a yes says no; 'No parking available' clears every parking option", () => {
    let e = editor();
    const row = (id: string) => e.rows.find((r) => r.id === `attributes/${id}`)!;
    e = toggleOption(e, row("has_parking_lot_free"));
    e = toggleOption(e, row("pay_credit_card"));
    expect(pendingChanges(e.rows, e.checked).map((c) => [c.id, c.before, c.after])).toEqual([
      ["attributes/has_parking_lot_free", null, true],
      ["attributes/pay_credit_card", true, false],
    ]);
    e = toggleOwnerPart(e, "parking");
    expect(e.rows.filter((r) => r.part === "parking").every((r) => e.checked[r.id] === false)).toBe(true);
    expect(ownerChangesOf(e)).toEqual([{ part: "parking", off: true }]);
    // The paid street parking that was a yes on Google becomes a no.
    expect(pendingChanges(e.rows, e.checked).find((c) => c.id === "attributes/has_parking_street_paid")).toMatchObject({ before: true, after: false });
    // Ticking a parking option again un-ticks "No parking available".
    e = toggleOption(e, row("has_parking_street_free"));
    expect(e.ownerOff.parking).toBe(false);
  });

  test("an office can't say 'no parking': the owner option isn't offered", () => {
    const html = wrap(<EditorPanel editor={editor({ canRemove: [], removed: [] })} onChange={() => {}} onReview={() => {}} onCancel={() => {}} />);
    expect(html).not.toContain("No parking available");
  });
});

// Hair express as scanned: a salon, accessibility + payment shown, no parking.
const HAIR = {
  rating: 5, review_count: 30, phone: "1", address: "9 S Broadway", opening_hours: ["Mon: 9–5"], website: "https://hair.example", https_status: "https",
  categories: ["hair_salon"], category: "Hair Salon", photo_count: 20, business_status: "OPERATIONAL", primary_type: "hair_salon", name: "Hair express on Broadway",
  listing_has_accessibility: true, listing_has_payment: true, listing_has_parking: false, pure_service_area_business: false,
} as unknown as BusinessScoringRow;

function row(state: { premium: boolean; connected: boolean } | null, opts: { locked?: boolean; locale?: Locale } = {}) {
  const breakdown = scoreBusiness(businessRowToScoringInput(HAIR));
  const category = breakdown.categories.find((c) => c.id === "completeness")!;
  const only = { ...category, checks: category.checks.filter((c) => c.id === "completeness.customer_details") };
  const links = breakdownFixLinks(breakdown.categories, "b1", opts.locale ?? "en");
  const card = <CategoryCard category={only} embedded fixLinks={opts.locked ? {} : links} lockedFixes={opts.locked} businessId="b1" />;
  return wrap(state ? <GbpEditProvider value={{ ...state, undo: null }}>{card}</GbpEditProvider> : card, opts.locale);
}

describe("the customer-details row on the Overview: one sentence, ONE button", () => {
  test("what's missing in one sentence, no chips, no inline editor", () => {
    const html = row({ premium: true, connected: true });
    expect(html).toContain('data-testid="customer-details-status"');
    expect(html).toContain("Missing on Google: parking.");
    expect(html).not.toContain('data-testid="gbp-edit"');
    expect(html).not.toContain("On Google now");
    expect(html).not.toContain('data-testid="row-how-to"');
    expect(row({ premium: true, connected: true }, { locale: "es" })).toContain("Falta en Google: estacionamiento.");
  });

  test("Premium + connected: one button to the Google Profile tab's editor", () => {
    const html = row({ premium: true, connected: true });
    expect(html.match(/data-testid="fix-button"/g)).toHaveLength(1);
    // Day 23B: from the Overview, "← Back to your score" on arrival.
    expect(html).toContain('href="/business/b1/growth?tab=google&amp;from=score#edit-customer-details"');
    expect(html).toContain("Add parking →");
  });

  test("not on the Google Profile tab (Grow, or not connected): the same one button, to the fix page", () => {
    for (const plan of [{ premium: false, connected: false }, { premium: true, connected: false }]) {
      const html = row(plan);
      expect(html.match(/data-testid="fix-button"/g)).toHaveLength(1);
      expect(html).not.toContain("growth?tab=google#edit-customer-details");
      expect(html).not.toContain('data-testid="row-how-to"');
    }
  });

  test("Free: the locked fix row, never the steps", () => {
    const html = row({ premium: false, connected: false }, { locked: true });
    expect(html).not.toContain('data-testid="row-how-to"');
  });
});

describe("other Needs work rows read the same way", () => {
  test("hours: one sentence, then ONE button with the time beside it", () => {
    const breakdown = scoreBusiness(businessRowToScoringInput({ ...HAIR, opening_hours: null } as BusinessScoringRow));
    const links = breakdownFixLinks(breakdown.categories, "b1", "en");
    const category = breakdown.categories.find((c) => c.id === "completeness")!;
    const only = { ...category, checks: category.checks.filter((c) => c.id === "completeness.hours") };
    const html = wrap(<CategoryCard category={only} embedded fixLinks={links} businessId="b1" />);
    expect(html.match(/data-testid="fix-button"/g)).toHaveLength(1);
    expect(html).toContain("Set your hours →");
    expect(html).not.toContain("How to fix it");
  });
});

describe("the panel's rules (cash only, no parking, no payments) and preview", () => {
  const CHECKED = (e: Editor, id: string) => e.checked[`attributes/${id}`];
  const rowOf = (e: Editor, id: string) => e.rows.find((r) => r.id === `attributes/${id}`)!;

  test("Cash only unticks cards and contactless — and the reverse — with a short note", () => {
    let e = editor(); // credit card is ticked (current)
    e = toggleOption(e, rowOf(e, "pay_debit_card"));
    e = toggleOption(e, rowOf(e, "requires_cash_only"));
    expect(CHECKED(e, "requires_cash_only")).toBe(true);
    expect(CHECKED(e, "pay_credit_card")).toBe(false);
    expect(CHECKED(e, "pay_debit_card")).toBe(false);
    expect(e.note).toEqual({ part: "payment", key: "cashOnly" });
    e = toggleOption(e, rowOf(e, "pay_mobile_nfc"));
    expect(CHECKED(e, "requires_cash_only")).toBe(false);
    expect(e.note).toEqual({ part: "payment", key: "notCashOnly" });
    const html = wrap(<EditorPanel editor={e} onChange={() => {}} onReview={() => {}} onCancel={() => {}} />);
    expect(html).toContain("Cards and contactless can&#x27;t go with cash only");
  });

  test("'We take no payments on site' clears every payment option; ticking one clears it again", () => {
    let e = toggleOwnerPart(editor(), "payment");
    expect(e.rows.filter((r) => r.part === "payment").every((r) => !e.checked[r.id])).toBe(true);
    expect(e.note).toEqual({ part: "payment", key: "noPayment" });
    e = toggleOption(e, rowOf(e, "pay_credit_card"));
    expect(e.ownerOff.payment).toBe(false);
    expect(e.note).toEqual({ part: "payment", key: "paymentClearsNo" });
  });

  test("unticking never touches anything else", () => {
    const e0 = editor();
    const e = toggleOption(e0, rowOf(e0, "pay_credit_card"));
    expect(pendingChanges(e.rows, e.checked).map((c) => c.id)).toEqual(["attributes/pay_credit_card"]);
    expect(e.ownerOff).toEqual(e0.ownerOff);
  });

  test("nothing changed → nothing to review", () => {
    const e = editor();
    expect(pendingChanges(e.rows, e.checked)).toEqual([]);
    const html = wrap(<EditorPanel editor={e} onChange={() => {}} onReview={() => {}} onCancel={() => {}} />);
    expect(html).toMatch(/<button type="button"[^>]*disabled=""[^>]*>Review changes<\/button>/);
  });
});

describe("Growth step on Premium + connected", () => {
  test("no 'we can't edit your listing'; the PostScore line instead (Free/Grow keep theirs)", async () => {
    const { TaskCard } = await import("@/app/business/[id]/ActionPlanSection");
    const task = {
      checkId: "completeness.customer_details", label: "Customer details on your listing", title: "Add your customer details", status: "open",
      effort: "quick_win", why: "Customers check this.", action: "Add them.", fix: "Edit profile → …", ownerActionOnGoogle: true, automatable: true,
      pointsAvailable: 1, minutes: 5,
    } as never;
    const premium = wrap(<GbpEditProvider value={{ premium: true, connected: true, undo: null }}><TaskCard task={task} businessId="b1" context="weekly" premium /></GbpEditProvider>);
    // Day 23B: ONE button to the Google Profile tab's editor (no inline editor), never "Coming soon".
    expect(premium.match(/data-testid="fix-button"/g)).toHaveLength(1);
    expect(premium).toContain('href="/business/b1/growth?tab=google#edit-customer-details"');
    expect(premium).not.toContain("step-coming-soon");
    // The expanded "How to fix it" is closed in static HTML; the switch is the rule:
    const src = (await import("node:fs")).readFileSync("app/business/[id]/ActionPlanSection.tsx", "utf8");
    expect(src).toContain('{!canUpdateOnGoogle && <>{t(locale, "dashboard.overview.actionPlan.ownerActionOnGoogle")} </>}');
    expect(src).toContain('"dashboard.gbpEdit.howToIntro"');
  });
});
