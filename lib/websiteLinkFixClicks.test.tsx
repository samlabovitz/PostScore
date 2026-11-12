// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// The Google Profile tab's website link and customer details cards in a
// real (jsdom) page, clicked through like an owner would. The server
// actions are stubbed — nothing calls Google. (That the Undo comes from
// gbp_changes is tested on the actions: lib/googleWrites.test.tsx.)

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const actions = vi.hoisted(() => ({
  openWebsiteLinkFix: vi.fn(),
  checkWebsiteLinkAction: vi.fn(),
  applyWebsiteLinkAction: vi.fn(),
  undoWebsiteLinkAction: vi.fn(),
}));
vi.mock("@/app/actions/gbpWebsiteLink", () => actions);
const details = vi.hoisted(() => ({
  loadCustomerDetailsEditorAction: vi.fn(),
  applyCustomerDetailsAction: vi.fn(),
  undoCustomerDetailsAction: vi.fn(),
}));
vi.mock("@/app/actions/gbpCustomerDetails", () => details);
vi.mock("@/app/actions/customerDetails", () => ({ setCustomerDetailsOwnerAnswer: vi.fn() }));

import { CustomerDetailsGoogleEdit, GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { WebsiteLinkFix } from "@/components/gbp/WebsiteLinkFix";
import { LocaleProvider, type Locale } from "@/lib/i18n";
import type { WebsiteLinkUndo } from "@/lib/gbpWebsiteLink";
import type { UndoableChange } from "@/lib/gbpAttributes";

const OLD = "https://www.example.com/old-page";
const NEW = "https://udel.instructure.com/";
const UNDO: WebsiteLinkUndo = { batchId: "batch-1", approvedAt: "2026-11-11T15:00:00Z", undoUntil: "2026-11-18T15:00:00Z", status: "sent", before: OLD, after: NEW };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

const PRACTICE = { premium: true, connected: false, undo: null, practice: true, canEdit: true };

function card(locale: Locale = "en", autoLoad = true) {
  return render(
    <LocaleProvider locale={locale}>
      <GbpEditProvider value={PRACTICE}>
        <WebsiteLinkFix businessId="hair" suggested={null} autoLoad={autoLoad} />
      </GbpEditProvider>
    </LocaleProvider>,
  );
}

const click = (el: HTMLElement) => act(async () => fireEvent.click(el));
const mount = async (locale: Locale = "en", autoLoad = true) => act(async () => void card(locale, autoLoad));
const opened = (current: string | null, undo: WebsiteLinkUndo | null = null) => actions.openWebsiteLinkFix.mockResolvedValue({ status: "ok", current, suggested: null, practice: true, canEdit: true, undo });
const nowOnGoogle = () => screen.getByTestId("website-link-current").textContent;

/** Change → type the address → "Check this website" (✓). */
async function typeAndCheck(url = NEW) {
  actions.checkWebsiteLinkAction.mockResolvedValue({ status: "ok", url });
  await click(screen.getByTestId("website-link-change"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: url } });
  await click(screen.getByRole("button", { name: /Check this website|Comprobar este sitio/ }));
}

async function approveAccept() {
  await typeAndCheck();
  await click(screen.getByTestId("website-link-review"));
  actions.applyWebsiteLinkAction.mockResolvedValue({ status: "sent", verified: true, undo: UNDO, current: NEW });
  await click(screen.getByTestId("website-link-approve"));
}

describe("website link card (practice mode, Google Profile tab)", () => {
  test("always shows On Google now, read live, with Change", async () => {
    opened(OLD);
    await mount();
    expect(screen.getByTestId("website-link-now").textContent).toContain("On Google now");
    expect(nowOnGoogle()).toBe(OLD);
    expect(screen.getByTestId("website-link-change").textContent).toBe("Change");
    expect(screen.queryByTestId("website-link-undo")).toBeNull();
  });

  test("Change → Check → Review the change: the preview with the chooser and Approve (Beta), nothing sent", async () => {
    opened(OLD);
    await mount();
    await typeAndCheck();
    expect(screen.getByText(/It loads, and it's a real website/)).toBeTruthy();
    await click(screen.getByTestId("website-link-review"));
    const preview = screen.getByTestId("website-link-preview");
    expect(preview.textContent).toContain(OLD);
    expect(preview.textContent).toContain(NEW);
    expect(screen.getByTestId("website-link-practice-banner").textContent).toContain("Practice mode");
    expect(screen.getByTestId("website-link-approve").textContent).toContain("Beta");
    expect(actions.applyWebsiteLinkAction).not.toHaveBeenCalled();
  });

  test("after Approve: ✓, the new link under On Google now, Change, and the Undo line", async () => {
    opened(OLD);
    await mount();
    await approveAccept();
    expect(actions.applyWebsiteLinkAction).toHaveBeenCalledWith("hair", NEW, "accept");
    expect(screen.getByTestId("website-link-result").textContent).toContain("Updated on Google ✓");
    expect(nowOnGoogle()).toBe(NEW);
    expect(screen.getByTestId("website-link-change")).toBeTruthy();
    expect(screen.getByTestId("website-link-undo").textContent).toContain("You can undo this until Nov 18, 2026. Undo");
  });

  test("after a reload: the Undo line is back (from the saved change), and On Google now", async () => {
    opened(NEW, UNDO);
    await mount();
    expect(nowOnGoogle()).toBe(NEW);
    expect(screen.getByTestId("website-link-undo").textContent).toContain("You can undo this until Nov 18, 2026.");
  });

  test("Undo asks first, then: Put back on Google ✓, the old link, and Change still there", async () => {
    opened(NEW, UNDO);
    await mount();
    await click(screen.getByTestId("website-link-undo-button"));
    expect(screen.getByTestId("website-link-undo-confirm").textContent).toContain("Put the previous website link back on Google?");
    expect(actions.undoWebsiteLinkAction).not.toHaveBeenCalled();
    actions.undoWebsiteLinkAction.mockResolvedValue({ status: "sent", current: OLD });
    await click(screen.getByTestId("website-link-undo-yes"));
    expect(actions.undoWebsiteLinkAction).toHaveBeenCalledWith("hair", "batch-1", "accept");
    expect(screen.getByTestId("website-link-result").textContent).toBe("Put back on Google ✓");
    expect(nowOnGoogle()).toBe(OLD);
    expect(screen.queryByTestId("website-link-undo")).toBeNull();
    // Change after Undo: the same Check → Review → Approve.
    await typeAndCheck();
    await click(screen.getByTestId("website-link-review"));
    expect(screen.getByTestId("website-link-preview").textContent).toContain(NEW);
  });

  test("Spanish: En Google ahora, Cambiar, Deshacer, Restaurado en Google ✓", async () => {
    opened(NEW, UNDO);
    await mount("es");
    expect(screen.getByTestId("website-link-now").textContent).toContain("En Google ahora");
    expect(screen.getByTestId("website-link-change").textContent).toBe("Cambiar");
    expect(screen.getByTestId("website-link-undo").textContent).toContain("Puede deshacerlo hasta el");
    await click(screen.getByTestId("website-link-undo-button"));
    actions.undoWebsiteLinkAction.mockResolvedValue({ status: "sent", current: OLD });
    await click(screen.getByTestId("website-link-undo-yes"));
    expect(screen.getByTestId("website-link-result").textContent).toBe("Restaurado en Google ✓");
  });

  test("Hold: a neutral wait, the old link still on Google, and Undo offered", async () => {
    opened(OLD);
    await mount();
    await typeAndCheck();
    await click(screen.getByTestId("website-link-review"));
    fireEvent.change(screen.getByTestId("website-link-practice"), { target: { value: "hold" } });
    actions.applyWebsiteLinkAction.mockResolvedValue({ status: "pending_review", undo: { ...UNDO, status: "pending_review" }, current: OLD });
    await click(screen.getByTestId("website-link-approve"));
    expect(actions.applyWebsiteLinkAction).toHaveBeenCalledWith("hair", NEW, "hold");
    expect(screen.getByTestId("website-link-result").textContent).toContain("Google is reviewing");
    expect(nowOnGoogle()).toBe(OLD);
    expect(screen.getByTestId("website-link-undo")).toBeTruthy();
  });

  test("a page reload keeps the preview, and says so", async () => {
    opened(OLD);
    await mount();
    await typeAndCheck();
    await click(screen.getByTestId("website-link-review"));
    cleanup(); // the page reloads: the card mounts again, fresh
    await mount();
    expect(screen.getByTestId("website-link-preview").textContent).toContain(NEW);
    expect(screen.getByTestId("website-link-restored").textContent).toContain("The page reloaded");
  });

  test("Cancel and a finished Approve clear what was kept", async () => {
    opened(OLD);
    await mount();
    await typeAndCheck();
    await click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.sessionStorage.length).toBe(0);
    await approveAccept();
    expect(window.sessionStorage.length).toBe(0);
  });

  test("the Overview's button (no auto-load): Update website on Google opens the address box", async () => {
    opened(OLD);
    await mount("en", false);
    expect(actions.openWebsiteLinkFix).not.toHaveBeenCalled();
    await click(screen.getByTestId("website-link-start"));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(OLD);
  });
});

describe("never back to the start silently", () => {
  test("Google can't be read: a message and Try again, in EN and ES", async () => {
    for (const locale of ["en", "es"] as const) {
      actions.openWebsiteLinkFix.mockRejectedValue(new Error("network"));
      await mount(locale);
      expect(screen.getByRole("alert").textContent).toContain(locale === "en" ? "Couldn't load your profile from Google" : "No pudimos cargar su perfil de Google");
      expect(screen.getByTestId("website-link-start").textContent).toContain(locale === "en" ? "Try again" : "Intentar de nuevo");
      cleanup();
    }
  });

  test("Approve: every failure shows a message and keeps the preview", async () => {
    const results = [{ status: "error", error: "not_enabled" }, { status: "error", error: "wait_minute" }, { status: "error", error: "something_new" }, { status: "editing_off" }, { status: "blocked", reason: "not_premium" }];
    for (const r of results) {
      opened(OLD);
      await mount();
      await typeAndCheck();
      await click(screen.getByTestId("website-link-review"));
      actions.applyWebsiteLinkAction.mockResolvedValue(r);
      await click(screen.getByTestId("website-link-approve"));
      const text = screen.getByRole("alert").textContent ?? "";
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toContain("dashboard.");
      expect(screen.getByTestId("website-link-preview")).toBeTruthy();
      cleanup();
      window.sessionStorage.clear();
    }
  });
});

describe("customer details card (practice mode, Google Profile tab)", () => {
  const rows = [
    { id: "attributes/pay_credit_card", part: "payment", label: "Credit cards", current: true },
    { id: "attributes/has_parking_street_free", part: "parking", label: "Free street parking", current: null },
  ];
  const owner = { canRemove: [], removed: [] };
  const DUNDO: UndoableChange = { batchId: "batch-2", approvedAt: "2026-11-11T15:00:00Z", undoUntil: "2026-11-18T15:00:00Z", status: "sent", changes: [{ id: "attributes/has_parking_street_free", before: null, after: true }] };
  const loaded = (undo: UndoableChange | null = null, r = rows) => details.loadCustomerDetailsEditorAction.mockResolvedValue({ status: "ok", rows: r, owner, practice: true, canEdit: true, undo });
  const mountDetails = async (locale: Locale = "en") =>
    act(async () =>
      void render(
        <LocaleProvider locale={locale}>
          <GbpEditProvider value={PRACTICE}>
            <CustomerDetailsGoogleEdit businessId="hair" autoLoad />
          </GbpEditProvider>
        </LocaleProvider>,
      ),
    );
  const shown = () => screen.getByTestId("gbp-edit-current").textContent ?? "";

  async function approveParking() {
    await click(screen.getByTestId("gbp-edit-change"));
    const parking = screen.getAllByRole("checkbox").find((c) => c.closest("label")?.textContent?.includes("parking")) as HTMLElement;
    await click(parking);
    await click(screen.getByRole("button", { name: "Review changes" }));
    details.applyCustomerDetailsAction.mockResolvedValue({ status: "sent", verified: true, changes: [{ id: "attributes/has_parking_street_free", part: "parking", label: "", before: null, after: true }], undo: DUNDO });
    await click(screen.getByTestId("customer-details-approve"));
  }

  test("On Google now and Change; after Approve: ✓, the new value, Change and the Undo line", async () => {
    loaded();
    await mountDetails();
    expect(screen.getByTestId("gbp-edit-now").textContent).toContain("On Google now");
    expect(shown()).toContain("Credit cards");
    expect(shown()).not.toMatch(/street parking/i);
    await approveParking();
    expect(details.applyCustomerDetailsAction).toHaveBeenCalledWith("hair", { "attributes/has_parking_street_free": true }, "accept");
    expect(screen.getByTestId("gbp-edit-result").textContent).toContain("Updated on Google ✓");
    expect(shown()).toMatch(/street parking/i);
    expect(screen.getByTestId("gbp-edit-change")).toBeTruthy();
    expect(screen.getByTestId("gbp-undo").textContent).toContain("You can undo this until Nov 18, 2026. Undo");
  });

  test("after a reload: the Undo line is back (from the saved change)", async () => {
    loaded(DUNDO, [rows[0], { ...rows[1], current: true }]);
    await mountDetails();
    expect(screen.getByTestId("gbp-undo").textContent).toContain("You can undo this until Nov 18, 2026.");
  });

  test("Undo asks first, then: Put back on Google ✓, the old values, and Change still there (ES too)", async () => {
    loaded(DUNDO, [rows[0], { ...rows[1], current: true }]);
    await mountDetails("es");
    expect(shown()).toMatch(/estacionamiento/i);
    await click(screen.getByTestId("gbp-undo-button"));
    expect(screen.getByTestId("gbp-undo-confirm").textContent).toContain("¿Volver a poner los valores anteriores en Google?");
    details.undoCustomerDetailsAction.mockResolvedValue({ status: "sent" });
    await click(screen.getByTestId("gbp-undo-yes"));
    expect(details.undoCustomerDetailsAction).toHaveBeenCalledWith("hair", "batch-2", "accept");
    expect(screen.getByTestId("gbp-edit-result").textContent).toContain("Restaurado en Google ✓");
    expect(shown()).not.toMatch(/estacionamiento/i);
    expect(screen.queryByTestId("gbp-undo")).toBeNull();
    await click(screen.getByTestId("gbp-edit-change"));
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });

  test("a failed Approve keeps the preview and says why", async () => {
    loaded();
    await mountDetails();
    await click(screen.getByTestId("gbp-edit-change"));
    await click(screen.getAllByRole("checkbox")[1]);
    await click(screen.getByRole("button", { name: "Review changes" }));
    details.applyCustomerDetailsAction.mockResolvedValue({ status: "error", error: "rejected" });
    await click(screen.getByTestId("customer-details-approve"));
    expect(screen.getByRole("alert").textContent).not.toBe("");
    expect(screen.getByTestId("gbp-edit-preview")).toBeTruthy();
  });
});
