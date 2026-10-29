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
    // Not asked about: checks, on-site parking, hearing loop, restroom.
    expect(html).not.toMatch(/pay_check|has_onsite_parking|has_hearing_loop|has_restroom/);
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

describe("the customer-details row: status → one action → small links", () => {
  test("status chips and one plain line", () => {
    const html = row({ premium: true, connected: true });
    expect(html).toContain('data-testid="customer-details-status"');
    expect(html).toMatch(/✓ Accessibility/);
    expect(html).toMatch(/✓ Payment options/);
    expect(html).toMatch(/✗ Parking/);
    expect(html).toContain("Customers check this before they visit.");
    expect(row({ premium: true, connected: true }, { locale: "es" })).toContain("Los clientes revisan esto antes de visitarle.");
  });

  test("Premium + connected: 'Update on Google' first; How to fix it says PostScore can do it — never 'we can't edit your listing'", () => {
    const html = row({ premium: true, connected: true });
    expect(html).toContain("Update on Google");
    expect(html.indexOf("Update on Google")).toBeLessThan(html.indexOf("How to fix it"));
    expect(html).toContain("You can update this on Google from PostScore with the button above, or do it yourself on Google:");
    expect(html).not.toContain("can&#x27;t edit your listing");
    expect(html).not.toContain("Not true for your business?");
    expect(row({ premium: true, connected: true }, { locale: "es" })).toContain("Puede actualizar esto en Google desde PostScore con el botón de arriba");
    // Grow keeps its own wording (no intro).
    expect(row({ premium: false, connected: false })).not.toContain("with the button above");
  });

  test("Premium, not connected: 'Connect Google to update this'", () => {
    const html = row({ premium: true, connected: false });
    expect(html).toContain("Connect Google to update this");
    expect(html).not.toContain("How to fix it");
  });

  test("Grow: How to fix it (with the choices Google offers) + a small locked Premium chip", () => {
    const html = row({ premium: false, connected: false });
    expect(html).toContain("How to fix it");
    expect(html).toContain('data-testid="row-how-to-options"');
    expect(html).toContain("Free street parking");
    expect(html).toContain("PostScore can do this for you — Premium");
    expect(html.indexOf("How to fix it")).toBeLessThan(html.indexOf("PostScore can do this for you"));
  });

  test("Free: the locked fix row, never the steps", () => {
    const html = row({ premium: false, connected: false }, { locked: true });
    expect(html).not.toContain('data-testid="row-how-to"');
  });

  test("the PostScore page is a small text link, and 'Doesn't apply to you?' opens the two options", () => {
    const html = row({ premium: false, connected: false });
    const growth = html.match(/<a[^>]*href="\/business\/b1\/growth[^"]*"[^>]*>/)?.[0] ?? "";
    expect(growth).not.toBe("");
    expect(growth).not.toContain("rounded-full");
    expect(html).toContain("Doesn&#x27;t apply to you?");
    expect(html).toMatch(/whitespace-nowrap[^>]*><input type="checkbox"[^>]*\/><span>No parking available/);
    expect(row({ premium: false, connected: false }, { locale: "es" })).toContain("¿No aplica a su negocio?");
  });
});

describe("other Needs work rows read the same way", () => {
  test("hours: status, then How to fix it, then the PostScore page as a small text link", () => {
    const breakdown = scoreBusiness(businessRowToScoringInput({ ...HAIR, opening_hours: null } as BusinessScoringRow));
    const links = breakdownFixLinks(breakdown.categories, "b1", "en");
    const category = breakdown.categories.find((c) => c.id === "completeness")!;
    const only = { ...category, checks: category.checks.filter((c) => c.id === "completeness.hours") };
    const html = wrap(<CategoryCard category={only} embedded fixLinks={links} businessId="b1" />);
    const actions = html.slice(html.indexOf('data-testid="row-actions"'));
    expect(actions.indexOf("How to fix it")).toBeGreaterThanOrEqual(0);
    expect(actions.indexOf("How to fix it")).toBeLessThan(actions.indexOf(`href="${links["completeness.hours"].href}"`));
    expect(html).not.toMatch(/<a[^>]*rounded-full[^>]*href="\/business\/b1/);
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
    // The expanded "How to fix it" is closed in static HTML; the switch is the rule:
    expect(premium).toContain("Update on Google");
    const src = (await import("node:fs")).readFileSync("app/business/[id]/ActionPlanSection.tsx", "utf8");
    expect(src).toContain('{!canUpdateOnGoogle && <>{t(locale, "dashboard.overview.actionPlan.ownerActionOnGoogle")} </>}');
    expect(src).toContain('"dashboard.gbpEdit.howToIntro"');
  });
});
