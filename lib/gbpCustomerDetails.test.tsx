import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider, type Locale } from "@/lib/i18n";
import type { Plan } from "@/lib/plan";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Premium "Update on Google" — customer details (docs/gbp-actions-plan.md,
// Step 1). Every Google response is mocked: no test calls Google's write
// (or read) APIs.

import {
  approvalAllowed,
  attributesPatch,
  customerDetailsEditorRows,
  diffCustomerDetails,
  latestUndoable,
  partOfAttribute,
  undoConflicts,
  type GbpAttributeMetadata,
  type GbpChangeRow,
} from "@/lib/gbpAttributes";
import { applyCustomerDetailsChange, getUndoableChange, loadCustomerDetailsEditor, undoCustomerDetailsChange, type GbpChangeStore, type GbpEditTarget } from "@/lib/gbpAttributes.server";
import { resetGbpQuota } from "@/lib/gbpQuota";

const LOC = "locations/456";
const NOW = Date.parse("2026-10-28T15:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const target: GbpEditTarget = { businessId: "biz-1", userId: "user-owner", locationName: LOC, accessToken: "ya29.TEST", locale: "en" };

const OFFERED: GbpAttributeMetadata[] = [
  { parent: "attributes/has_wheelchair_accessible_entrance", valueType: "BOOL", displayName: "Wheelchair accessible entrance", groupDisplayName: "Accessibility" },
  { parent: "attributes/has_wheelchair_accessible_restroom", valueType: "BOOL", displayName: "Wheelchair accessible restroom", groupDisplayName: "Accessibility" },
  { parent: "attributes/pay_credit_card", valueType: "BOOL", displayName: "Credit cards", groupDisplayName: "Payments" },
  { parent: "attributes/pay_mobile_nfc", valueType: "BOOL", displayName: "NFC mobile payments", groupDisplayName: "Payments" },
  { parent: "attributes/has_parking_lot_free", valueType: "BOOL", displayName: "Free parking lot", groupDisplayName: "Parking" },
  // Not ours, not yes/no, or deprecated — never offered in the panel.
  { parent: "attributes/wi_fi", valueType: "ENUM", displayName: "Wi-Fi" },
  { parent: "attributes/has_restroom", valueType: "BOOL", displayName: "Restroom" },
  { parent: "attributes/pay_credit_card_types_accepted", valueType: "REPEATED_ENUM", displayName: "Card types" },
  { parent: "attributes/has_valet_parking", valueType: "BOOL", displayName: "Valet parking", deprecated: true },
  // Accessibility Google offers, but the panel doesn't ask about.
  { parent: "attributes/has_hearing_loop", valueType: "BOOL", displayName: "Assistive hearing loop", groupDisplayName: "Accessibility" },
];
const CURRENT = [
  { name: "attributes/has_wheelchair_accessible_entrance", valueType: "BOOL", values: [true] },
  { name: "attributes/pay_credit_card", valueType: "BOOL", values: [false] },
];

// ---------------------------------------------------------------------------
// Mocked Google: records every request; anything unexpected fails the test.
// ---------------------------------------------------------------------------
interface Call {
  method: string;
  url: URL;
  body: unknown;
}
function google(opts: { patch?: number; pending?: boolean; current?: unknown[]; live?: unknown[]; liveStatus?: number; list?: number; metadata?: number } = {}) {
  const calls: Call[] = [];
  let current = opts.current ?? CURRENT;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer ya29.TEST");
    if (method === "GET" && url.pathname === "/v1/attributes") {
      expect(url.searchParams.get("parent")).toBe(LOC);
      // Google refuses languageCode alongside parent (the real Oct 28 bug).
      expect(url.searchParams.has("languageCode")).toBe(false);
      return opts.list ? json(opts.list, { error: { status: "PERMISSION_DENIED" } }) : json(200, { attributeMetadata: OFFERED });
    }
    if (method === "GET" && url.pathname === `/v1/${LOC}/attributes`) return json(200, { name: `${LOC}/attributes`, attributes: current });
    // What's live on Maps: the owner's values plus Google's own info.
    if (method === "GET" && url.pathname === `/v1/${LOC}/attributes:getGoogleUpdated`) {
      if (opts.liveStatus) return json(opts.liveStatus, { error: { status: "UNAVAILABLE" } });
      return json(200, { name: `${LOC}/attributes`, attributes: [...(opts.live ?? []), ...(current as unknown[])] });
    }
    if (method === "PATCH" && url.pathname === `/v1/${LOC}/attributes`) {
      if (opts.patch) return json(opts.patch, { error: { status: "INVALID_ARGUMENT", details: [{ reason: "INVALID_ATTRIBUTE_NAME" }], message: "echoes input" } });
      // Google keeps fields in the mask: set from the body, else deleted.
      const body = JSON.parse(String(init!.body)) as { attributes: Array<{ name: string; values: boolean[] }> };
      const mask = url.searchParams.get("attributeMask")!.split(",");
      current = [...(current as Array<{ name: string }>).filter((a) => !mask.includes(a.name)), ...body.attributes];
      return json(200, body);
    }
    if (method === "GET" && url.pathname === `/v1/${LOC}`) {
      expect(url.searchParams.get("readMask")).toBe("metadata");
      return opts.metadata ? json(opts.metadata, {}) : json(200, { metadata: { hasPendingEdits: opts.pending === true } });
    }
    throw new Error(`Unexpected Google call: ${method} ${url}`);
  }) as typeof fetch;
  return { calls, fetchImpl, patches: () => calls.filter((c) => c.method === "PATCH") };
}

/** The gbp_changes table, in memory. `missing`: the SQL hasn't been run. */
function memStore(missing = false) {
  const rows: Array<GbpChangeRow & Record<string, unknown>> = [];
  const store: GbpChangeStore = {
    approvalsSince: async (businessId, since) => (missing ? null : Array.from(new Map(rows.filter((r) => r.business_id === businessId && r.approved_at >= since).map((r) => [r.batch_id, r.approved_at])).values())),
    rowsSince: async (businessId, since) => (missing ? null : rows.filter((r) => r.business_id === businessId && r.approved_at >= since)),
    insert: async (newRows) => {
      if (missing) return false;
      rows.push(...newRows.map((r) => ({ undo_of: null, undone_at: null, ...r }) as GbpChangeRow & Record<string, unknown>));
      return true;
    },
    markUndone: async (batchId, at) => {
      for (const r of rows) if (r.batch_id === batchId) r.undone_at = at;
      return true;
    },
  };
  return { rows, store };
}

beforeEach(() => resetGbpQuota());

describe("which attributes the panel offers", () => {
  test("only Google's offered yes/no attributes for accessibility, payment and parking, with current values", () => {
    const rows = customerDetailsEditorRows(OFFERED, CURRENT);
    // Parking, payment, accessibility; each in the panel's own order.
    expect(rows.map((r) => [r.id, r.part, r.current])).toEqual([
      ["attributes/has_parking_lot_free", "parking", null],
      ["attributes/pay_credit_card", "payment", false],
      ["attributes/pay_mobile_nfc", "payment", null],
      ["attributes/has_wheelchair_accessible_entrance", "accessibility", true],
      ["attributes/has_wheelchair_accessible_restroom", "accessibility", null],
    ]);
  });

  test("parts come from the attribute ID, not the (localized) label", () => {
    expect(partOfAttribute("has_wheelchair_accessible_parking")).toBe("accessibility");
    expect(partOfAttribute("attributes/has_parking_street_paid")).toBe("parking");
    expect(partOfAttribute("pay_debit_card")).toBe("payment");
    expect(partOfAttribute("requires_cash_only")).toBe("payment");
    expect(partOfAttribute("attributes/has_restroom")).toBeNull();
    expect(partOfAttribute("attributes/has_hearing_loop")).toBeNull();
  });

  test("before → after: only real differences; a forged or unoffered attribute is refused", () => {
    const rows = customerDetailsEditorRows(OFFERED, CURRENT);
    const diff = diffCustomerDetails(rows, { "attributes/has_wheelchair_accessible_entrance": true, "attributes/pay_credit_card": true, "attributes/has_parking_lot_free": false });
    expect(diff).toEqual({
      ok: true,
      changes: [
        { id: "attributes/has_parking_lot_free", part: "parking", label: "Free parking lot", before: null, after: false, merchantBefore: null },
        { id: "attributes/pay_credit_card", part: "payment", label: "Credit cards", before: false, after: true, merchantBefore: false },
      ],
    });
    expect(diffCustomerDetails(rows, { "attributes/wi_fi": true })).toEqual({ ok: false, reason: "not_offered" });
    expect(diffCustomerDetails(rows, { "attributes/has_valet_parking": true })).toEqual({ ok: false, reason: "not_offered" });
  });

  test("one PATCH: every field in the mask; 'not set' is in the mask but not the body (deleted)", () => {
    const { mask, body } = attributesPatch(LOC, [
      { id: "attributes/pay_credit_card", after: true },
      { id: "attributes/has_parking_lot_free", after: null },
    ]);
    expect(mask).toBe("attributes/pay_credit_card,attributes/has_parking_lot_free");
    expect(body).toEqual({ name: `${LOC}/attributes`, attributes: [{ name: "attributes/pay_credit_card", values: [true] }] });
  });

  test("rate limits: one approval a minute, 20 a day", () => {
    expect(approvalAllowed([], NOW)).toBe("ok");
    expect(approvalAllowed([new Date(NOW - 30_000).toISOString()], NOW)).toBe("wait_minute");
    expect(approvalAllowed(Array.from({ length: 20 }, (_, i) => new Date(NOW - (i + 2) * 60_000).toISOString()), NOW)).toBe("daily_cap");
    expect(approvalAllowed(Array.from({ length: 20 }, (_, i) => new Date(NOW - DAY - i * 60_000).toISOString()), NOW)).toBe("ok");
  });
});

describe("opening the panel only reads", () => {
  test("three GETs (offered, the owner's own, live on Maps), no PATCH", async () => {
    const g = google();
    const r = await loadCustomerDetailsEditor(target, g.fetchImpl);
    expect(r.status).toBe("ok");
    expect(g.calls.map((c) => c.method)).toEqual(["GET", "GET", "GET"]);
  });

  test("the live values can't be read → no panel (never a blank 'before')", async () => {
    const g = google({ liveStatus: 503 });
    expect(await loadCustomerDetailsEditor(target, g.fetchImpl)).toEqual({ status: "error", error: "failed" });
    expect(g.patches()).toEqual([]);
  });

  test("Google error → a plain error, nothing else", async () => {
    const g = google({ list: 403 });
    expect(await loadCustomerDetailsEditor(target, g.fetchImpl)).toEqual({ status: "error", error: "permission" });
    expect(g.patches()).toEqual([]);
  });
});

describe("Approve and update Google", () => {
  const picks = { "attributes/pay_credit_card": true, "attributes/has_parking_lot_free": true, "attributes/has_wheelchair_accessible_entrance": null };

  test("success: one PATCH with only the changed fields, logged with before/after/approver, 'Sent to Google'", async () => {
    const g = google();
    const { rows, store } = memStore();
    const r = await applyCustomerDetailsChange(target, picks, store, g.fetchImpl, NOW);
    expect(r).toMatchObject({ status: "sent", logged: true });
    expect(g.patches()).toHaveLength(1);
    const patch = g.patches()[0];
    expect(patch.url.searchParams.get("attributeMask")).toBe("attributes/has_parking_lot_free,attributes/pay_credit_card,attributes/has_wheelchair_accessible_entrance");
    expect(patch.body).toEqual({
      name: `${LOC}/attributes`,
      attributes: [
        { name: "attributes/has_parking_lot_free", values: [true] },
        { name: "attributes/pay_credit_card", values: [true] },
      ],
    });
    expect(rows.map((x) => [x.field, x.before_value, x.after_value, x.approved_by, x.status])).toEqual([
      ["attributes/has_parking_lot_free", null, "true", "user-owner", "sent"],
      ["attributes/pay_credit_card", "false", "true", "user-owner", "sent"],
      ["attributes/has_wheelchair_accessible_entrance", "true", null, "user-owner", "sent"],
    ]);
    // One batch, one approval time, the business.
    expect(new Set(rows.map((x) => x.batch_id)).size).toBe(1);
    expect(rows.every((x) => x.business_id === "biz-1" && x.kind === "attributes" && x.approved_at === new Date(NOW).toISOString())).toBe(true);
    // Never review text or anything but the values.
    expect(Object.keys(rows[0]).sort()).toEqual(["approved_at", "approved_by", "batch_id", "before_value", "business_id", "error_reason", "field", "kind", "status", "undo_of", "undone_at", "after_value"].sort());
  });

  test("pending: Google says hasPendingEdits → 'Pending Google review'", async () => {
    const g = google({ pending: true });
    const { rows, store } = memStore();
    expect(await applyCustomerDetailsChange(target, picks, store, g.fetchImpl, NOW)).toMatchObject({ status: "pending_review" });
    expect(rows.every((x) => x.status === "pending_review")).toBe(true);
  });

  test("a failed metadata read is never called pending", async () => {
    const g = google({ metadata: 500 });
    expect(await applyCustomerDetailsChange(target, picks, memStore().store, g.fetchImpl, NOW)).toMatchObject({ status: "sent" });
  });

  test("error: Google rejects → nothing changed, logged as failed with Google's reason only, no undo", async () => {
    const g = google({ patch: 400 });
    const { rows, store } = memStore();
    expect(await applyCustomerDetailsChange(target, picks, store, g.fetchImpl, NOW)).toEqual({ status: "error", error: "rejected" });
    expect(rows.every((x) => x.status === "failed" && x.error_reason === "INVALID_ATTRIBUTE_NAME")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("echoes input");
    expect(await getUndoableChange(store, "biz-1", NOW)).toBeNull();
  });

  test("401 → reconnect; 429 → rate limited", async () => {
    expect(await applyCustomerDetailsChange(target, picks, memStore().store, google({ patch: 401 }).fetchImpl, NOW)).toEqual({ status: "error", error: "reconnect" });
    expect(await applyCustomerDetailsChange(target, picks, memStore().store, google({ patch: 429 }).fetchImpl, NOW)).toEqual({ status: "error", error: "rate_limited" });
  });

  test("the client's 'before' is never trusted; a forged pick sends nothing", async () => {
    const g = google();
    expect(await applyCustomerDetailsChange(target, { "attributes/wi_fi": true }, memStore().store, g.fetchImpl, NOW)).toEqual({ status: "error", error: "changed" });
    expect(g.patches()).toEqual([]);
  });

  test("nothing different from Google → no PATCH", async () => {
    const g = google();
    expect(await applyCustomerDetailsChange(target, { "attributes/pay_credit_card": false }, memStore().store, g.fetchImpl, NOW)).toEqual({ status: "no_changes" });
    expect(g.patches()).toEqual([]);
  });

  test("before supabase/gbp-changes.sql is run: nothing is sent at all", async () => {
    const g = google();
    expect(await applyCustomerDetailsChange(target, picks, memStore(true).store, g.fetchImpl, NOW)).toEqual({ status: "error", error: "not_enabled" });
    expect(g.calls).toEqual([]);
  });

  test("a second approval within a minute is refused before any Google call", async () => {
    const { store } = memStore();
    await applyCustomerDetailsChange(target, picks, store, google().fetchImpl, NOW);
    const g = google();
    expect(await applyCustomerDetailsChange(target, { "attributes/pay_mobile_nfc": true }, store, g.fetchImpl, NOW + 30_000)).toEqual({ status: "error", error: "wait_minute" });
    expect(g.calls).toEqual([]);
  });
});

describe("Undo (7 days)", () => {
  const picks = { "attributes/pay_credit_card": true, "attributes/has_parking_lot_free": true };

  test("restores the previous values in one PATCH ('not set' is deleted again), logged, then no more undo", async () => {
    const g = google();
    const { rows, store } = memStore();
    await applyCustomerDetailsChange(target, picks, store, g.fetchImpl, NOW);
    const undo = await getUndoableChange(store, "biz-1", NOW + DAY);
    expect(undo).toMatchObject({ status: "sent", undoUntil: new Date(NOW + 7 * DAY).toISOString() });

    expect(await undoCustomerDetailsChange(target, undo!.batchId, store, g.fetchImpl, NOW + DAY)).toEqual({ status: "sent" });
    const back = g.patches()[1];
    expect(back.url.searchParams.get("attributeMask")).toBe("attributes/has_parking_lot_free,attributes/pay_credit_card");
    expect(back.body).toEqual({ name: `${LOC}/attributes`, attributes: [{ name: "attributes/pay_credit_card", values: [false] }] });
    const undoRows = rows.filter((x) => x.undo_of === undo!.batchId);
    expect(undoRows.map((x) => [x.field, x.before_value, x.after_value])).toEqual([
      ["attributes/has_parking_lot_free", "true", null],
      ["attributes/pay_credit_card", "true", "false"],
    ]);
    expect(rows.filter((x) => x.batch_id === undo!.batchId).every((x) => x.undone_at)).toBe(true);
    expect(await getUndoableChange(store, "biz-1", NOW + DAY)).toBeNull();
  });

  test("never overwrites a newer edit made on Google since", async () => {
    const { store } = memStore();
    await applyCustomerDetailsChange(target, picks, store, google().fetchImpl, NOW);
    const undo = (await getUndoableChange(store, "biz-1", NOW + DAY))!;
    // The owner since set credit cards back to "no" on Google.
    const g = google({ current: [{ name: "attributes/pay_credit_card", values: [false] }, { name: "attributes/has_parking_lot_free", values: [true] }] });
    expect(await undoCustomerDetailsChange(target, undo.batchId, store, g.fetchImpl, NOW + DAY)).toEqual({ status: "error", error: "changed_since", fields: ["attributes/pay_credit_card"] });
    expect(g.patches()).toEqual([]);
  });

  test("after 7 days, undo is gone", async () => {
    const { store } = memStore();
    await applyCustomerDetailsChange(target, picks, store, google().fetchImpl, NOW);
    const batchId = (await getUndoableChange(store, "biz-1", NOW))!.batchId;
    expect(await getUndoableChange(store, "biz-1", NOW + 7 * DAY + 1)).toBeNull();
    const g = google();
    expect(await undoCustomerDetailsChange(target, batchId, store, g.fetchImpl, NOW + 7 * DAY + 1)).toEqual({ status: "error", error: "undo_expired" });
    expect(g.calls).toEqual([]);
  });

  test("undo error: Google rejects → nothing undone, still offered", async () => {
    const { store } = memStore();
    await applyCustomerDetailsChange(target, picks, store, google().fetchImpl, NOW);
    const undo = (await getUndoableChange(store, "biz-1", NOW + DAY))!;
    const g = google({ patch: 400, current: [{ name: "attributes/pay_credit_card", values: [true] }, { name: "attributes/has_parking_lot_free", values: [true] }] });
    expect(await undoCustomerDetailsChange(target, undo.batchId, store, g.fetchImpl, NOW + DAY)).toEqual({ status: "error", error: "rejected" });
    expect((await getUndoableChange(store, "biz-1", NOW + DAY))?.batchId).toBe(undo.batchId);
  });

  test("pure: latest batch only, never a failed or undone one", () => {
    const row = (batch: string, at: number, extra: Partial<GbpChangeRow> = {}): GbpChangeRow => ({ batch_id: batch, field: "attributes/pay_credit_card", before_value: "false", after_value: "true", approved_at: new Date(at).toISOString(), status: "sent", undo_of: null, undone_at: null, ...extra });
    expect(latestUndoable([row("a", NOW - DAY), row("b", NOW)], NOW)?.batchId).toBe("b");
    expect(latestUndoable([row("a", NOW, { status: "failed" })], NOW)).toBeNull();
    expect(latestUndoable([row("a", NOW, { undone_at: new Date(NOW).toISOString() })], NOW)).toBeNull();
    expect(undoConflicts([{ id: "attributes/x_parking", before: null, after: true }], [])).toEqual(["attributes/x_parking"]);
  });
});

// ---------------------------------------------------------------------------
// The server actions' gate: Premium/Multi only, owner only, connected only.
// ---------------------------------------------------------------------------
let currentPlan: Plan = "premium";
let sessionUser: { id: string } | null = { id: "user-owner" };
const fetchSpy = vi.fn(() => {
  throw new Error("Google must not be called");
});
vi.mock("@/lib/premium", () => ({ getPlan: async () => currentPlan }));
vi.mock("@/app/actions/actionPlan", () => ({ markTaskDone: vi.fn(async () => ({ status: "ok" })) }));
function table(rows: Array<Record<string, unknown>>) {
  const filters: Record<string, unknown> = {};
  const b = {
    select: () => b,
    eq: (k: string, v: unknown) => ((filters[k] = v), b),
    maybeSingle: async () => ({ data: rows.find((r) => Object.entries(filters).every(([k, v]) => r[k] === v)) ?? null, error: null }),
  };
  return b;
}
let connections: Array<Record<string, unknown>> = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
    from: (name: string) => table(name === "businesses" ? [{ id: "biz-1", owner_id: "user-owner", language: "en", archived_at: null }] : []),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (name: string) => table(name === "gbp_connections" ? connections : []) }) }));

describe("server actions: who may use it", () => {
  beforeEach(() => {
    currentPlan = "premium";
    sessionUser = { id: "user-owner" };
    connections = [];
    vi.stubGlobal("fetch", fetchSpy);
  });

  test("Free and Grow are refused on the server, before any Google call", async () => {
    const { applyCustomerDetailsAction, loadCustomerDetailsEditorAction } = await import("@/app/actions/gbpCustomerDetails");
    for (const plan of ["free", "grow"] as Plan[]) {
      currentPlan = plan;
      expect(await loadCustomerDetailsEditorAction("biz-1")).toEqual({ status: "blocked", reason: "not_premium" });
      expect(await applyCustomerDetailsAction("biz-1", { "attributes/pay_credit_card": true })).toEqual({ status: "blocked", reason: "not_premium" });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("someone else's business, signed out, or not connected: refused", async () => {
    const { applyCustomerDetailsAction } = await import("@/app/actions/gbpCustomerDetails");
    expect(await applyCustomerDetailsAction("biz-2", {})).toEqual({ status: "blocked", reason: "not_found" });
    sessionUser = null;
    expect(await applyCustomerDetailsAction("biz-1", {})).toEqual({ status: "blocked", reason: "unauthenticated" });
    sessionUser = { id: "user-owner" };
    connections = [{ business_id: "biz-1", status: "error", google_location_id: LOC }];
    expect(await applyCustomerDetailsAction("biz-1", {})).toEqual({ status: "blocked", reason: "not_connected" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The panel's entry points by plan (EN + ES).
// ---------------------------------------------------------------------------
describe("Update on Google, as each plan sees it", () => {
  async function render(state: { premium: boolean; connected: boolean } | null, locale: Locale = "en") {
    const { CustomerDetailsGoogleEdit, GbpEditProvider } = await import("@/components/gbp/CustomerDetailsGoogleEdit");
    const inner = <CustomerDetailsGoogleEdit businessId="biz-1" />;
    return renderToStaticMarkup(<LocaleProvider locale={locale}>{state ? <GbpEditProvider value={{ ...state, undo: null }}>{inner}</GbpEditProvider> : inner}</LocaleProvider>);
  }

  test("Free/Grow: a small locked Premium chip, never the live button", async () => {
    const html = await render({ premium: false, connected: true });
    expect(html).toContain('data-testid="gbp-edit-locked"');
    expect(html).toContain("PostScore can do this for you — Premium");
    expect(html).not.toContain("Update on Google");
    expect(await render({ premium: false, connected: true }, "es")).toContain("PostScore puede hacerlo por usted — Premium");
  });

  test("Premium, not connected: 'Connect Google to update this'", async () => {
    const html = await render({ premium: true, connected: false });
    expect(html).toContain("/business/biz-1/connect-gbp");
    expect(html).toContain("Connect Google to update this");
  });

  test("Premium, connected: the button (EN + ES)", async () => {
    expect(await render({ premium: true, connected: true })).toContain("Update on Google");
    expect(await render({ premium: true, connected: true }, "es")).toContain("Actualizar en Google");
  });

  test("off where no provider is", async () => {
    expect(await render(null)).toBe("");
  });

  test("the undo strip shows the date and the 7-day limit", async () => {
    const { CustomerDetailsGoogleEdit, GbpEditProvider } = await import("@/components/gbp/CustomerDetailsGoogleEdit");
    const undo = { batchId: "b1", approvedAt: "2026-10-28T15:00:00Z", undoUntil: "2026-11-04T15:00:00Z", status: "sent" as const, changes: [{ id: "attributes/pay_credit_card", before: false, after: true }] };
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <GbpEditProvider value={{ premium: true, connected: true, undo }}>
          <CustomerDetailsGoogleEdit businessId="biz-1" />
        </GbpEditProvider>
      </LocaleProvider>
    );
    expect(html).toContain('data-testid="gbp-undo"');
    expect(html).toMatch(/You updated your customer details on Google on Oct 28, 2026\. You can undo it until Nov 4, 2026\./);
  });
});

// ---------------------------------------------------------------------------
// The real Hair express case (Oct 28): the owner had set nothing, but Maps
// shows payments and wheelchair parking (Google's own / customers' info,
// locations.attributes.getGoogleUpdated). The panel shows those as ticked.
// ---------------------------------------------------------------------------
describe("current values: what customers see on Google", () => {
  const HAIR_LIVE = [
    { name: "attributes/pay_credit_card", valueType: "BOOL", values: [true] },
    { name: "attributes/pay_debit_card", valueType: "BOOL", values: [true] },
    { name: "attributes/pay_mobile_nfc", valueType: "BOOL", values: [true] },
    { name: "attributes/requires_cash_only", valueType: "BOOL", values: [false] },
    { name: "attributes/has_wheelchair_accessible_parking", valueType: "BOOL", values: [true] },
  ];
  const OFFERED_HAIR: GbpAttributeMetadata[] = ["pay_credit_card", "pay_debit_card", "pay_mobile_nfc", "requires_cash_only", "has_wheelchair_accessible_parking", "has_parking_lot_free"].map((id) => ({ parent: `attributes/${id}`, valueType: "BOOL" }));

  test("Google's live values pre-select the options; the owner's own value wins where there is one", () => {
    const rows = customerDetailsEditorRows(OFFERED_HAIR, [{ name: "attributes/pay_debit_card", values: [false] }], HAIR_LIVE);
    const byId = Object.fromEntries(rows.map((r) => [r.id.replace("attributes/", ""), [r.current, r.merchant]]));
    expect(byId).toEqual({
      has_parking_lot_free: [null, null],
      pay_credit_card: [true, null],
      pay_debit_card: [false, false],
      pay_mobile_nfc: [true, null],
      requires_cash_only: [false, null],
      has_wheelchair_accessible_parking: [true, null],
    });
  });

  test("never clears untouched values: only the field the owner changed is sent, even though Maps shows others", async () => {
    const g = google({ current: [], live: HAIR_LIVE });
    // The panel sends only what changed; a pick equal to what's live is no change either.
    const r = await applyCustomerDetailsChange(target, { "attributes/has_parking_lot_free": true, "attributes/pay_credit_card": true }, memStore().store, g.fetchImpl, NOW);
    expect(r).toMatchObject({ status: "sent" });
    expect(g.patches()).toHaveLength(1);
    expect(g.patches()[0].url.searchParams.get("attributeMask")).toBe("attributes/has_parking_lot_free");
    expect(g.patches()[0].body).toEqual({ name: `${LOC}/attributes`, attributes: [{ name: "attributes/has_parking_lot_free", values: [true] }] });
  });

  test("unticking a 'yes' that came from Google's info sends a 'no' — and Undo removes it (Google's info shows again)", async () => {
    const g = google({ current: [], live: HAIR_LIVE });
    const { rows, store } = memStore();
    const r = await applyCustomerDetailsChange(target, { "attributes/pay_mobile_nfc": false }, store, g.fetchImpl, NOW);
    expect(r).toMatchObject({ status: "sent", changes: [{ id: "attributes/pay_mobile_nfc", before: true, after: false, merchantBefore: null }] });
    // Undo restores the owner's own value (not set), never a made-up "yes".
    expect(rows[0]).toMatchObject({ before_value: null, after_value: "false" });
    const undo = (await getUndoableChange(store, "biz-1", NOW + DAY))!;
    expect(await undoCustomerDetailsChange(target, undo.batchId, store, g.fetchImpl, NOW + DAY)).toEqual({ status: "sent" });
    const back = g.patches()[1];
    expect(back.url.searchParams.get("attributeMask")).toBe("attributes/pay_mobile_nfc");
    expect(back.body).toEqual({ name: `${LOC}/attributes`, attributes: [] });
  });

  test("the live values can't be read when approving → nothing is sent", async () => {
    const g = google({ liveStatus: 503 });
    expect(await applyCustomerDetailsChange(target, { "attributes/has_parking_lot_free": true }, memStore().store, g.fetchImpl, NOW)).toEqual({ status: "error", error: "failed" });
    expect(g.patches()).toEqual([]);
  });
});
