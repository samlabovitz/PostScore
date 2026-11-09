import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { LocaleProvider, t, type Locale } from "@/lib/i18n";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Google undo safety (code review Nov 7, M1–M3). Every Google response is
// mocked: no test calls Google, and nothing is ever written to it.

import { latestUndoable, undoPlan, type GbpChangeRow, type UndoableChange } from "@/lib/gbpAttributes";
import { applyCustomerDetailsChange, getUndoableChange, undoCustomerDetailsChange, type GbpChangeStore, type GbpEditTarget } from "@/lib/gbpAttributes.server";
import { addPlatformLink, removeAddedLink } from "@/lib/gbpPlaceActions.server";
import { closeOpenUndos, disconnectGbpData } from "@/lib/gbpTokens.server";
import { websitePlatform } from "@/lib/gbpPlaceActions";
import { resetGbpQuota } from "@/lib/gbpQuota";
import { PlatformLinkCard } from "@/components/gbp/PlatformLinkCard";

const LOC = "locations/456";
const OTHER = "locations/789";
const NOW = Date.parse("2026-11-08T15:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const target: GbpEditTarget = { businessId: "biz-1", userId: "user-owner", locationName: LOC, accessToken: "ya29.TEST", locale: "en" };
const OFFERED = [{ parent: "attributes/pay_credit_card", valueType: "BOOL", displayName: "Credit cards", groupDisplayName: "Payments" }];
const CARDS = (v: boolean) => [{ name: "attributes/pay_credit_card", valueType: "BOOL", values: [v] }];

/** Mocked Google for one location: its attributes, and whether it says
 * "pending edits" (one value per metadata read, the last one repeats). */
function google(location: string, opts: { current: unknown[]; pending?: boolean[] }) {
  const calls: Array<{ method: string; url: URL; body: unknown }> = [];
  let current = opts.current;
  const pending = [...(opts.pending ?? [false])];
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (method === "GET" && url.pathname === "/v1/attributes") return json({ attributeMetadata: OFFERED });
    if (method === "GET" && url.pathname === `/v1/${location}/attributes`) return json({ attributes: current });
    if (method === "GET" && url.pathname === `/v1/${location}/attributes:getGoogleUpdated`) return json({ attributes: current });
    if (method === "PATCH" && url.pathname === `/v1/${location}/attributes`) {
      const body = JSON.parse(String(init!.body)) as { attributes: unknown[] };
      // While Google reviews, a read still shows what was there before.
      if (!pending[0]) current = body.attributes;
      return json(body);
    }
    if (method === "GET" && url.pathname === `/v1/${location}`) return json({ metadata: { hasPendingEdits: (pending.length > 1 ? pending.shift() : pending[0]) === true } });
    throw new Error(`Unexpected Google call: ${method} ${url}`);
  }) as typeof fetch;
  return { calls, fetchImpl, patches: () => calls.filter((c) => c.method === "PATCH") };
}

function memStore() {
  const rows: Array<GbpChangeRow & Record<string, unknown>> = [];
  const store: GbpChangeStore = {
    approvalsSince: async () => [],
    rowsSince: async (businessId, since, kind = "attributes") => rows.filter((r) => r.business_id === businessId && r.kind === kind && r.approved_at >= since),
    insert: async (newRows) => (rows.push(...newRows.map((r) => ({ undo_of: null, undone_at: null, ...r }) as GbpChangeRow & Record<string, unknown>)), true),
    markUndone: async (batchId, at) => (rows.forEach((r) => r.batch_id === batchId && (r.undone_at = at)), true),
  };
  return { rows, store };
}

const row = (extra: Partial<GbpChangeRow> = {}): GbpChangeRow => ({
  batch_id: "a",
  field: "attributes/pay_credit_card",
  before_value: "false",
  after_value: "true",
  approved_at: new Date(NOW).toISOString(),
  status: "sent",
  undo_of: null,
  undone_at: null,
  location_name: LOC,
  ...extra,
});

beforeEach(() => resetGbpQuota());

describe("M1: undo only on the location the change was made on", () => {
  test("every logged row records its location (approval and undo)", async () => {
    const { rows, store } = memStore();
    const g = google(LOC, { current: CARDS(false) });
    await applyCustomerDetailsChange(target, { "attributes/pay_credit_card": true }, store, g.fetchImpl, NOW);
    const undo = (await getUndoableChange(store, "biz-1", LOC, NOW + DAY))!;
    expect(await undoCustomerDetailsChange(target, undo.batchId, store, g.fetchImpl, NOW + DAY)).toEqual({ status: "sent" });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.location_name === LOC)).toBe(true);
  });

  test("edit listing A, reconnect to listing B: no undo offered, and undo sends nothing to B", async () => {
    const { store } = memStore();
    await applyCustomerDetailsChange(target, { "attributes/pay_credit_card": true }, store, google(LOC, { current: CARDS(false) }).fetchImpl, NOW);
    const batchId = (await getUndoableChange(store, "biz-1", LOC, NOW))!.batchId;
    // Now connected to B, which happens to hold the logged "after" value.
    expect(await getUndoableChange(store, "biz-1", OTHER, NOW + DAY)).toBeNull();
    const b = google(OTHER, { current: CARDS(true) });
    expect(await undoCustomerDetailsChange({ ...target, locationName: OTHER }, batchId, store, b.fetchImpl, NOW + DAY)).toEqual({ status: "error", error: "undo_expired" });
    expect(b.calls).toEqual([]);
  });

  test("pure: another location, no location logged, or closed by a disconnect → not undoable", () => {
    expect(latestUndoable([row()], NOW, LOC)?.batchId).toBe("a");
    expect(latestUndoable([row()], NOW, OTHER)).toBeNull();
    expect(latestUndoable([row({ location_name: null })], NOW, LOC)).toBeNull();
    expect(latestUndoable([row({ location_name: undefined })], NOW, LOC)).toBeNull();
    expect(latestUndoable([row()], NOW, "")).toBeNull();
    expect(latestUndoable([row({ undo_closed_at: new Date(NOW).toISOString() })], NOW, LOC)).toBeNull();
    // The latest batch was on another location: an older one is never offered instead.
    expect(latestUndoable([row({ batch_id: "old", approved_at: new Date(NOW - DAY).toISOString() }), row({ batch_id: "new", location_name: OTHER })], NOW, LOC)).toBeNull();
  });

  test("Order online: the link's batch records its location, and is not undoable from another one", async () => {
    const platform = websitePlatform("https://www.doordash.com/store/36532653")!;
    const target9 = { ...target, locationName: "locations/9" };
    let links: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return new Response(JSON.stringify({ placeActionLinks: links }), { status: 200 });
      if (method === "POST") {
        const link = { name: "locations/9/placeActionLinks/new1", ...(JSON.parse(String(init!.body)) as object) };
        links.push(link);
        return new Response(JSON.stringify(link), { status: 200 });
      }
      links = [];
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const { rows, store } = memStore();
    const added = await addPlatformLink(target9, platform, store, fetchImpl, NOW);
    expect(added.status).toBe("sent");
    expect(rows[0]).toMatchObject({ kind: "place_action", location_name: "locations/9" });
    const placeRows = (await store.rowsSince("biz-1", new Date(NOW - DAY).toISOString(), "place_action"))!;
    expect(latestUndoable(placeRows, NOW, "locations/9")).not.toBeNull();
    expect(latestUndoable(placeRows, NOW, OTHER)).toBeNull();
    if (added.status !== "sent") return;
    expect(await removeAddedLink(target9, "locations/9/placeActionLinks/new1", added.batchId, store, fetchImpl, NOW)).toEqual({ status: "sent" });
    expect(rows[1]).toMatchObject({ undo_of: added.batchId, location_name: "locations/9" });
  });
});

/** A fake admin client: records every query as [table, op, ...filters]. */
function fakeAdmin() {
  const queries: Array<Array<unknown>> = [];
  const client = {
    from(table: string) {
      const q: Array<unknown> = [table];
      queries.push(q);
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "update", "delete", "insert", "upsert", "eq", "is"]) chain[m] = (...args: unknown[]) => (q.push([m, ...args]), chain);
      chain.maybeSingle = async () => ({ data: null, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
      return chain;
    },
  };
  return { queries, admin: client as never };
}

describe("M1: disconnecting Google closes every open undo", () => {
  test("closeOpenUndos marks only this business's open changes", async () => {
    const { queries, admin } = fakeAdmin();
    await closeOpenUndos(admin, "biz-1", "2026-11-08T15:00:00.000Z");
    expect(queries).toEqual([["gbp_changes", ["update", { undo_closed_at: "2026-11-08T15:00:00.000Z" }], ["eq", "business_id", "biz-1"], ["is", "undone_at", null], ["is", "undo_closed_at", null]]]);
  });

  test("disconnect closes them before the connection is deleted", async () => {
    const { queries, admin } = fakeAdmin();
    expect(await disconnectGbpData(admin, "biz-1", (async () => new Response("{}")) as typeof fetch)).toMatchObject({ ok: true });
    const tables = queries.map((q) => `${q[0]}:${(q[1] as unknown[])[0]}`);
    expect(tables.indexOf("gbp_changes:update")).toBeGreaterThan(-1);
    expect(tables.indexOf("gbp_changes:update")).toBeLessThan(tables.indexOf("gbp_connections:delete"));
  });

  test("a closed change is no longer offered", async () => {
    const { rows, store } = memStore();
    await applyCustomerDetailsChange(target, { "attributes/pay_credit_card": true }, store, google(LOC, { current: CARDS(false) }).fetchImpl, NOW);
    rows.forEach((r) => (r.undo_closed_at = new Date(NOW + 1000).toISOString()));
    expect(await getUndoableChange(store, "biz-1", LOC, NOW + DAY)).toBeNull();
  });
});

const wrap = (node: ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);
const LULU = "https://www.doordash.com/store/36532653";
const DD = websitePlatform(LULU)!;
const LINK_UNDO: UndoableChange = { batchId: "b1", approvedAt: "2026-11-06T15:00:00Z", undoUntil: "2026-11-13T15:00:00Z", status: "sent", changes: [{ id: "locations/9/placeActionLinks/new1", before: null, after: null }] };

describe("M2: “Order online” Undo on later visits", () => {
  test("already on Google + a link PostScore added → the Undo strip shows (EN + ES)", () => {
    const status = { status: "ok" as const, platform: DD, alreadyOnGoogle: true, canAdd: true, undo: LINK_UNDO };
    const en = wrap(<PlatformLinkCard businessId="b1" website={LULU} premium connected initialStatus={status} />);
    expect(en).toContain('data-testid="platform-already"');
    expect(en).toContain('data-testid="platform-undo"');
    expect(en).toContain("You can undo it until");
    const es = wrap(<PlatformLinkCard businessId="b1" website={LULU} premium connected initialStatus={status} />, "es");
    expect(es).toContain("Puede deshacerlo hasta el");
  });

  test("already on Google with nothing to undo (added on Google itself) → no Undo", () => {
    const html = wrap(<PlatformLinkCard businessId="b1" website={LULU} premium connected initialStatus={{ status: "ok", platform: DD, alreadyOnGoogle: true, canAdd: true, undo: null }} />);
    expect(html).not.toContain('data-testid="platform-undo"');
  });

  test("not Premium any more → no Undo button that can't work", () => {
    const html = wrap(<PlatformLinkCard businessId="b1" website={LULU} premium={false} connected initialStatus={{ status: "ok", platform: DD, alreadyOnGoogle: true, canAdd: false, undo: LINK_UNDO }} />);
    expect(html).not.toContain('data-testid="platform-undo"');
  });
});

describe("M3: changes Google is still reviewing", () => {
  test("the pending note says what Google tells us — the profile, not this change (EN + ES)", () => {
    expect(t("en", "dashboard.gbpEdit.result.pending")).toBe("Google is reviewing changes to your profile.");
    expect(t("es", "dashboard.gbpEdit.result.pending")).toBe("Google está revisando cambios en su perfil.");
    expect(t("en", "dashboard.gbpEdit.undo.summaryPending", { date: "Nov 6", until: "Nov 13" })).toContain("(Google is reviewing changes to your profile)");
    expect(t("es", "dashboard.gbpEdit.undo.summaryPending", { date: "6 nov", until: "13 nov" })).toContain("(Google está revisando cambios en su perfil)");
    expect(t("en", "dashboard.gbpEdit.undo.donePending")).toBe("Previous values sent — Google is reviewing changes to your profile.");
    expect(t("es", "dashboard.gbpEdit.undo.donePending")).toBe("Valores anteriores enviados; Google está revisando cambios en su perfil.");
  });

  test("undo of a pending change that Google still reads as the old value: the restore is sent anyway, then “sent — Google is reviewing”", async () => {
    const { rows, store } = memStore();
    // Approved while pending: Google keeps showing "no" (the old value).
    const g = google(LOC, { current: CARDS(false), pending: [true] });
    expect(await applyCustomerDetailsChange(target, { "attributes/pay_credit_card": true }, store, g.fetchImpl, NOW)).toMatchObject({ status: "pending_review" });
    const undo = (await getUndoableChange(store, "biz-1", LOC, NOW + DAY))!;
    expect(undo.status).toBe("pending_review");

    expect(await undoCustomerDetailsChange(target, undo.batchId, store, g.fetchImpl, NOW + DAY)).toEqual({ status: "sent", pending: true });
    // Before: no PATCH at all ("already back"). Now: the restore goes to Google.
    const restore = g.patches()[1];
    expect(restore.url.searchParams.get("attributeMask")).toBe("attributes/pay_credit_card");
    expect(restore.body).toEqual({ name: `${LOC}/attributes`, attributes: [{ name: "attributes/pay_credit_card", values: [false] }] });
    expect(rows.filter((r) => r.undo_of === undo.batchId).map((r) => [r.status, r.error_reason])).toEqual([["pending_review", null]]);
    expect(await getUndoableChange(store, "biz-1", LOC, NOW + DAY)).toBeNull();
  });

  test("undo of a pending change, no longer pending after the restore: read back and “Undo complete” as usual", async () => {
    const { store } = memStore();
    // Pending at approval; the restore's re-check says it's done.
    const g = google(LOC, { current: CARDS(false), pending: [true, false] });
    await applyCustomerDetailsChange(target, { "attributes/pay_credit_card": true }, store, g.fetchImpl, NOW);
    const undo = (await getUndoableChange(store, "biz-1", LOC, NOW + DAY))!;
    expect(await undoCustomerDetailsChange(target, undo.batchId, store, g.fetchImpl, NOW + DAY)).toEqual({ status: "sent" });
    expect(g.patches()).toHaveLength(2);
  });

  test("an approval that was NOT pending: a field already back needs nothing (unchanged)", () => {
    const changes = [{ id: "attributes/pay_credit_card", before: false, after: true }];
    expect(undoPlan(changes, CARDS(false)).send).toEqual([]);
    expect(undoPlan(changes, CARDS(false), { resendRestored: true }).send).toEqual([{ id: "attributes/pay_credit_card", after: false, before: true }]);
    // A third value is still a conflict, pending or not.
    expect(undoPlan([{ id: "attributes/pay_credit_card", before: null, after: true }], CARDS(false), { resendRestored: true }).conflicts).toEqual(["attributes/pay_credit_card"]);
  });
});
