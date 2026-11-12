import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

// Edit on Google: the "Order online" / "Booking link" card, and "Add to
// 'Order online'" on the platform link card — the owner's own ordering or
// booking link on Google (Place Actions API). Checked before anything is
// sent, the previous link saved for Undo BEFORE the change, read back
// from Google, a neutral wait when Google doesn't show it yet, practice
// mode's fake Google, the live allow list, and never in production.
// NEVER calls Google: the real fetch throws in this file.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/gbpTokens.server", () => ({ markGbpReconnect: vi.fn() }));
const gbpEditGate = vi.fn();
vi.mock("@/lib/gbpEditGate.server", () => ({ gbpEditGate: (...a: unknown[]) => gbpEditGate(...a) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "b1", name: "Hair express", language: "en" } }) }) }) }) }),
  }),
}));
const getPlan = vi.fn(async () => "premium");
vi.mock("@/lib/premium", () => ({ getPlan: () => getPlan() }));
vi.mock("@/lib/businessArchive.server", () => ({ isBusinessArchived: async () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const realFetch = globalThis.fetch;
const networkCalls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  networkCalls.push(String(input));
  throw new Error(`A test tried to reach the network: ${String(input)}`);
}) as typeof fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

const HAIR = { place_id: "ChIJ-hair-express", name: "Hair express", website: "https://hairexpressbroadway.com", category: "Hair Salon", primary_type: "hair_salon", business_type_override: null, categories: null, language: "en", website_analysis_json: null };
const TACOS = { ...HAIR, place_id: "ChIJ-lulus", name: "Lulu's Tacos", website: "https://www.doordash.com/store/36532653", category: "Taco Restaurant", primary_type: "taco_restaurant" };

// The fake database: gbp_changes rows, the edit log, and the business row.
const db = {
  changes: [] as Array<Record<string, unknown>>,
  log: [] as Array<Record<string, unknown>>,
  logMissing: false,
  business: HAIR as Record<string, unknown>,
  events: [] as string[],
};
function chain(table: string) {
  const filters: Record<string, unknown> = {};
  let update: Record<string, unknown> | null = null;
  const c = {
    select: () => c,
    eq: (k: string, v: unknown) => ((filters[k] = v), c),
    gte: () => c,
    limit: async () => (table === "gbp_profile_edit_log" ? { data: [], error: db.logMissing ? { code: "42703" } : null } : { data: [], error: null }),
    maybeSingle: async () => ({ data: table === "businesses" ? db.business : null }),
    insert: async (row: Record<string, unknown>) => {
      if (table === "gbp_changes") {
        db.events.push(`save:${row.status}`);
        db.changes.push({ undo_of: null, undone_at: null, ...row });
      } else db.log.push(row);
      return { error: null };
    },
    update: (patch: Record<string, unknown>) => ((update = patch), c),
    then: (resolve: (v: unknown) => void) => {
      if (update) {
        for (const r of db.changes) if (Object.entries(filters).every(([k, v]) => r[k] === v)) Object.assign(r, update);
        return resolve({ error: null });
      }
      if (table === "gbp_changes") return resolve({ data: db.changes.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v)), error: null });
      return resolve({ data: [], error: null });
    },
  };
  return c;
}
const admin = { from: (table: string) => chain(table) };
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { checkOrderLink, linksInSection, orderLinkKindFor, ownSiteHost, readStoredLink, type OwnSite } from "@/lib/gbpOrderLink";
import { applyOrderLinkEdit, getOrderLinkUndo, supabaseOrderLinkStore, undoOrderLink } from "@/lib/gbpOrderLink.server";
import type { ProfileTarget } from "@/lib/gbpProfileEdits.server";
import { PRACTICE_PROFILE_LOCATION, resetPracticeProfiles, setPracticeOutcome } from "@/lib/gbpProfilePractice.server";
import { practicePlaceActionsFetch, resetPracticePlaceActions } from "@/lib/gbpPlaceActionsPractice.server";
import { applyOrderLinkAction, openOrderLink, undoOrderLinkAction, type OrderLinkView } from "@/app/actions/gbpOrderLink";
import { addPlatformLinkAction, getPlatformLinkStatus, undoPlatformLinkAction } from "@/app/actions/gbpPlaceActions";
import { OrderLinkBody, orderLinkMessage } from "@/components/gbp/OrderLinkOnGoogle";
import { PlatformLinkCard } from "@/components/gbp/PlatformLinkCard";
import { websitePlatform } from "@/lib/gbpPlaceActions";
import { googleWritesAllowed } from "@/lib/gbpReviewPractice";
import { resetGbpQuota } from "@/lib/gbpQuota";
import { LocaleProvider } from "@/lib/i18n";

const PRACTICE: ProfileTarget = { businessId: "b1", userId: "owner-1", locationName: PRACTICE_PROFILE_LOCATION, accessToken: "practice-token" };
const store = () => supabaseOrderLinkStore(admin as unknown as SupabaseClient);
const LINKS = "https://mybusinessplaceactions.googleapis.com/v1/locations/practice/placeActionLinks";
const VAGARO = "https://www.vagaro.com/hairexpressbroadway";
const BOOKSY = "https://booksy.com/en-us/12345_hair-express";
/** The practice fake, recording each Google call in the shared event list. */
const recorded = (businessId = "b1") => {
  const f = practicePlaceActionsFetch(businessId);
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    db.events.push(`${init?.method ?? "GET"} ${url.pathname.replace(/^\/v1\/locations\/practice\//, "")}${url.searchParams.get("updateMask") ? `?${url.searchParams.get("updateMask")}` : ""}`);
    return f(input, init);
  }) as typeof fetch;
};
const live = async (businessId = "b1") => ((await (await practicePlaceActionsFetch(businessId)(LINKS)).json()) as { placeActionLinks: Array<{ name: string; uri: string; placeActionType: string }> }).placeActionLinks;
const MIN = 60_000;

const ENV_KEYS = ["REVIEW_REPLIES_PRACTICE", "GOOGLE_WRITES_LIVE_PLACES", "NODE_ENV"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const setEnv = (vars: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) => {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = v;
  }
};

beforeEach(() => {
  resetGbpQuota();
  resetPracticeProfiles();
  resetPracticePlaceActions();
  Object.assign(db, { changes: [], log: [], logMissing: false, business: HAIR, events: [] });
  networkCalls.length = 0;
  gbpEditGate.mockReset();
  getPlan.mockResolvedValue("premium");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => setEnv(savedEnv));

describe("which card: “Order online” for food, “Booking link” for salons and other appointment businesses", () => {
  test("from the resolved business type", () => {
    for (const id of ["restaurant", "cafe", "bakery", "dessert_shop", "cafe_bakery"]) expect(orderLinkKindFor(id)).toBe("order");
    for (const id of ["salon", "barbershop", "nail_salon", "spa", "gym_fitness", "tattoo_body_art", "dentist"]) expect(orderLinkKindFor(id)).toBe("booking");
    for (const id of ["retail", "lawyer", "default", null]) expect(orderLinkKindFor(id)).toBeNull();
  });
});

describe("the link: https, a real ordering / booking site or the business's own website — never parked", () => {
  const own: OwnSite = { host: "hairexpressbroadway.com", parked: false };
  const none: OwnSite = { host: null, parked: false };

  test("booking platforms for a salon (Square Appointments, Vagaro, Booksy, Fresha…); ordering platforms aren't booking ones", () => {
    for (const url of [VAGARO, BOOKSY, "https://www.fresha.com/a/hair-express-new-york-123", "https://squareup.com/appointments/book/abc/start", "https://book.squareup.com/appointments/abc", "https://www.styleseat.com/m/v/hair", "https://app.glossgenius.com/x"]) {
      expect(checkOrderLink(url, "booking", none)).toMatchObject({ ok: true });
    }
    expect(checkOrderLink("https://squareup.com/shop/hardware", "booking", none)).toEqual({ ok: false, problem: "not_allowed" });
    expect(checkOrderLink("https://www.doordash.com/store/36532653", "booking", none)).toEqual({ ok: false, problem: "not_allowed" });
    expect(checkOrderLink(VAGARO, "order", none)).toEqual({ ok: false, problem: "not_allowed" });
  });

  test("ordering platforms for food (marketplaces and ordering sites like Toast)", () => {
    for (const url of ["https://www.doordash.com/store/36532653", "https://www.order.toasttab.com/online/lulus", "https://www.ubereats.com/store/lulus/abc", "https://ordering.chownow.com/order/1/locations"]) {
      expect(checkOrderLink(url, "order", none)).toMatchObject({ ok: true });
    }
  });

  test("the business's own website (and its subdomains), unless the last scan found it parked", () => {
    expect(checkOrderLink("https://hairexpressbroadway.com/book", "booking", own)).toMatchObject({ ok: true, platform: null });
    expect(checkOrderLink("https://book.hairexpressbroadway.com", "booking", own)).toMatchObject({ ok: true });
    expect(checkOrderLink("https://hairexpressbroadway.com/book", "booking", { ...own, parked: true })).toEqual({ ok: false, problem: "parked" });
    expect(checkOrderLink("https://someone-else.com/book", "booking", own)).toEqual({ ok: false, problem: "not_allowed" });
    expect(checkOrderLink("https://hairexpressbroadway.com.evil.io/book", "booking", own)).toEqual({ ok: false, problem: "not_allowed" });
    // A "website" that's really a platform or social page is never "your own site".
    expect(ownSiteHost("https://www.facebook.com/hairexpress")).toBeNull();
    expect(ownSiteHost("www.HairExpressBroadway.com")).toBe("hairexpressbroadway.com");
  });

  test("refused: http, no https at all, not a web address, internal or IP hosts, a password in the link, too long", () => {
    expect(checkOrderLink("http://www.vagaro.com/x", "booking", none)).toEqual({ ok: false, problem: "not_https" });
    expect(checkOrderLink("vagaro.com/hairexpress", "booking", none)).toEqual({ ok: false, problem: "not_https" });
    expect(checkOrderLink("javascript:alert(1)", "booking", none)).toEqual({ ok: false, problem: "invalid" });
    expect(checkOrderLink("book now", "booking", none)).toEqual({ ok: false, problem: "invalid" });
    expect(checkOrderLink("https://localhost/book", "booking", { host: "localhost", parked: false })).toEqual({ ok: false, problem: "invalid" });
    expect(checkOrderLink("https://10.0.0.1/book", "booking", none)).toEqual({ ok: false, problem: "invalid" });
    expect(checkOrderLink("https://me:pw@www.vagaro.com/x", "booking", none)).toEqual({ ok: false, problem: "invalid" });
    expect(checkOrderLink(`https://www.vagaro.com/${"x".repeat(2100)}`, "booking", none)).toEqual({ ok: false, problem: "too_long" });
    expect(checkOrderLink("", "booking", none)).toEqual({ ok: false, problem: "invalid" });
  });
});

describe("a change: the previous link saved first, one call, then read back", () => {
  test("add (accepted): list → save as “sending” → ONE create → read back → sent; logged with the link type, never the URL", async () => {
    const out = await applyOrderLinkEdit(PRACTICE, { op: "add", url: VAGARO, section: "appointments" }, store(), { fetchImpl: recorded(), practice: true });
    expect(out.status).toBe("updated");
    expect(db.events).toEqual(["GET placeActionLinks", "save:sending", "POST placeActionLinks", "GET placeActionLinks"]);
    expect(db.changes[0]).toMatchObject({ kind: "order_link_practice", field: "order_link", before_value: null, status: "sent", location_name: PRACTICE_PROFILE_LOCATION });
    expect(readStoredLink(db.changes[0].after_value as string)).toEqual({ name: "locations/practice/placeActionLinks/practice-1", uri: VAGARO, type: "APPOINTMENT" });
    expect(db.log).toEqual([expect.objectContaining({ field: "order_link", action: "edit", outcome: "ok", practice: true, link_type: "APPOINTMENT" })]);
    expect(JSON.stringify(db.log)).not.toContain("vagaro");
    expect(networkCalls).toEqual([]);
  });

  test("change: ONE patch with updateMask=uri on that link; remove: ONE delete — each read back", async () => {
    const t0 = Date.now() - 10 * MIN;
    await applyOrderLinkEdit(PRACTICE, { op: "add", url: VAGARO, section: "appointments" }, store(), { fetchImpl: recorded(), practice: true, now: t0 });
    db.events.length = 0;
    const name = (await live())[0].name;
    expect((await applyOrderLinkEdit(PRACTICE, { op: "change", name, url: BOOKSY }, store(), { fetchImpl: recorded(), practice: true, now: t0 + 2 * MIN })).status).toBe("updated");
    expect(db.events).toEqual(["GET placeActionLinks", "save:sending", "PATCH placeActionLinks/practice-1?uri", "GET placeActionLinks"]);
    expect((await live())[0].uri).toBe(BOOKSY);
    expect((await applyOrderLinkEdit(PRACTICE, { op: "remove", name }, store(), { fetchImpl: recorded(), practice: true, now: t0 + 4 * MIN })).status).toBe("updated");
    expect(await live()).toEqual([]);
    expect(readStoredLink(db.changes[2].before_value as string)?.uri).toBe(BOOKSY);
    expect(db.changes[2].after_value).toBeNull();
  });

  test("refused by Google: a clear reason, nothing changed, the row says failed and the log says failed", async () => {
    setPracticeOutcome("b1", "refuse");
    expect(await applyOrderLinkEdit(PRACTICE, { op: "add", url: VAGARO, section: "appointments" }, store(), { fetchImpl: recorded(), practice: true })).toEqual({ status: "error", error: "rejected", reason: "INVALID_ARGUMENT" });
    expect(db.changes[0].status).toBe("failed");
    expect(db.log[0]).toMatchObject({ outcome: "failed" });
    expect(await live()).toEqual([]);
  });

  test("held (Google answers OK but doesn't show it): a neutral wait, never “Updated ✓”", async () => {
    setPracticeOutcome("b1", "hold");
    expect((await applyOrderLinkEdit(PRACTICE, { op: "add", url: VAGARO, section: "appointments" }, store(), { fetchImpl: recorded(), practice: true })).status).toBe("unconfirmed");
    expect(db.log[0]).toMatchObject({ outcome: "unconfirmed" });
    expect(await live()).toEqual([]);
  });

  test("nothing sent when: the log isn't set up (supabase/gbp-order-link.sql), it's already there, or within a minute of the last", async () => {
    db.logMissing = true;
    expect(await applyOrderLinkEdit(PRACTICE, { op: "add", url: VAGARO, section: "appointments" }, store(), { fetchImpl: recorded(), practice: true })).toEqual({ status: "error", error: "not_set_up" });
    expect(db.events).toEqual([]);
    db.logMissing = false;
    await applyOrderLinkEdit(PRACTICE, { op: "add", url: VAGARO, section: "appointments" }, store(), { fetchImpl: recorded(), practice: true, now: Date.now() - 5 * MIN });
    db.events.length = 0;
    expect(await applyOrderLinkEdit(PRACTICE, { op: "add", url: `${VAGARO}/`, section: "appointments" }, store(), { fetchImpl: recorded(), practice: true })).toEqual({ status: "no_change" });
    expect(db.events).toEqual(["GET placeActionLinks"]);
    expect(await applyOrderLinkEdit(PRACTICE, { op: "add", url: BOOKSY, section: "appointments" }, store(), { fetchImpl: recorded(), practice: true, now: Date.now() - 4.5 * MIN })).toEqual({ status: "error", error: "wait_minute" });
  });

  test("a Google partner's link (DoorDash's own) is shown but never changed or removed; another location's link never touched", async () => {
    const partner = { name: `${PRACTICE_PROFILE_LOCATION}/placeActionLinks/dd`, uri: "https://www.doordash.com/store/1", placeActionType: "FOOD_DELIVERY", providerType: "AGGREGATOR_3P", isEditable: false };
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init?.method ?? "GET");
      return new Response(JSON.stringify({ placeActionLinks: [partner] }), { status: 200 });
    }) as typeof fetch;
    expect(linksInSection([partner], "order")).toEqual([{ name: partner.name, uri: partner.uri, type: "FOOD_DELIVERY", editable: false, preferred: false }]);
    expect(await applyOrderLinkEdit(PRACTICE, { op: "change", name: partner.name, url: "https://www.ubereats.com/store/x" }, store(), { fetchImpl, practice: true })).toEqual({ status: "error", error: "rejected" });
    expect(await applyOrderLinkEdit(PRACTICE, { op: "remove", name: partner.name }, store(), { fetchImpl, practice: true })).toEqual({ status: "error", error: "rejected" });
    expect(await applyOrderLinkEdit(PRACTICE, { op: "remove", name: "locations/other/placeActionLinks/x" }, store(), { fetchImpl, practice: true })).toEqual({ status: "error", error: "rejected" });
    expect(calls.every((m) => m === "GET")).toBe(true);
    expect(db.changes).toEqual([]);
  });
});

describe("undo: the previous link saved before every change", () => {
  test("the row is saved (as “sending”) BEFORE Google is called — even when Google then refuses", async () => {
    setPracticeOutcome("b1", "refuse");
    await applyOrderLinkEdit(PRACTICE, { op: "add", url: VAGARO, section: "appointments" }, store(), { fetchImpl: recorded(), practice: true });
    expect(db.events.indexOf("save:sending")).toBeLessThan(db.events.indexOf("POST placeActionLinks"));
  });

  test("undo an add removes exactly that link; undo a change puts the old address back; undo a remove adds it back", async () => {
    const t0 = Date.now() - 30 * MIN;
    await applyOrderLinkEdit(PRACTICE, { op: "add", url: VAGARO, section: "appointments" }, store(), { fetchImpl: recorded(), practice: true, now: t0 });
    let undo = await getOrderLinkUndo(store(), "b1", PRACTICE_PROFILE_LOCATION, true);
    expect(undo).toMatchObject({ before: null, section: "appointments" });
    expect((await undoOrderLink(PRACTICE, undo!.batchId, store(), { fetchImpl: recorded(), practice: true, now: t0 + MIN })).status).toBe("updated");
    expect(await live()).toEqual([]);
    // Already undone: not offered again.
    expect(await getOrderLinkUndo(store(), "b1", PRACTICE_PROFILE_LOCATION, true)).toBeNull();

    await applyOrderLinkEdit(PRACTICE, { op: "add", url: VAGARO, section: "appointments" }, store(), { fetchImpl: recorded(), practice: true, now: t0 + 3 * MIN });
    const name = (await live())[0].name;
    await applyOrderLinkEdit(PRACTICE, { op: "change", name, url: BOOKSY }, store(), { fetchImpl: recorded(), practice: true, now: t0 + 5 * MIN });
    undo = await getOrderLinkUndo(store(), "b1", PRACTICE_PROFILE_LOCATION, true);
    expect((await undoOrderLink(PRACTICE, undo!.batchId, store(), { fetchImpl: recorded(), practice: true, now: t0 + 6 * MIN })).status).toBe("updated");
    expect((await live())[0]).toMatchObject({ name, uri: VAGARO });

    await applyOrderLinkEdit(PRACTICE, { op: "remove", name }, store(), { fetchImpl: recorded(), practice: true, now: t0 + 8 * MIN });
    undo = await getOrderLinkUndo(store(), "b1", PRACTICE_PROFILE_LOCATION, true);
    expect((await undoOrderLink(PRACTICE, undo!.batchId, store(), { fetchImpl: recorded(), practice: true, now: t0 + 9 * MIN })).status).toBe("updated");
    expect((await live()).map((l) => [l.uri, l.placeActionType])).toEqual([[VAGARO, "APPOINTMENT"]]);
    expect(db.log.filter((r) => r.action === "undo")).toHaveLength(3);
  });

  test("a held add can still be undone (removed by the name Google gave it)", async () => {
    setPracticeOutcome("b1", "hold");
    await applyOrderLinkEdit(PRACTICE, { op: "add", url: VAGARO, section: "appointments" }, store(), { fetchImpl: recorded(), practice: true, now: Date.now() - 5 * MIN });
    setPracticeOutcome("b1", "accept");
    const undo = await getOrderLinkUndo(store(), "b1", PRACTICE_PROFILE_LOCATION, true);
    db.events.length = 0;
    expect((await undoOrderLink(PRACTICE, undo!.batchId, store(), { fetchImpl: recorded(), practice: true })).status).toBe("updated");
    expect(db.events).toContain("DELETE placeActionLinks/practice-1");
  });

  test("never over a link someone changed on Google since", async () => {
    await applyOrderLinkEdit(PRACTICE, { op: "add", url: VAGARO, section: "appointments" }, store(), { fetchImpl: recorded(), practice: true, now: Date.now() - 5 * MIN });
    const name = (await live())[0].name;
    await practicePlaceActionsFetch("b1")(`https://mybusinessplaceactions.googleapis.com/v1/${name}?updateMask=uri`, { method: "PATCH", body: JSON.stringify({ uri: BOOKSY }) });
    const undo = await getOrderLinkUndo(store(), "b1", PRACTICE_PROFILE_LOCATION, true);
    expect(await undoOrderLink(PRACTICE, undo!.batchId, store(), { fetchImpl: recorded(), practice: true })).toEqual({ status: "error", error: "changed_since" });
    expect((await live())[0].uri).toBe(BOOKSY);
  });

  test("practice rows never mix with real ones (their own kind)", async () => {
    await applyOrderLinkEdit(PRACTICE, { op: "add", url: VAGARO, section: "appointments" }, store(), { fetchImpl: recorded(), practice: true });
    expect(await getOrderLinkUndo(store(), "b1", PRACTICE_PROFILE_LOCATION, false)).toBeNull();
  });
});

describe("the actions: practice mode, never in production; the live allow list", () => {
  const gate = (website: string | null = HAIR.website) => ({
    ok: true,
    admin,
    plan: "premium",
    tokens: { markGbpReconnect: vi.fn() },
    business: { id: "b1", language: "en", website, verified_website_url: null },
    target: { businessId: "b1", userId: "owner-1", locationName: "locations/222", accessToken: "test-token", locale: "en" },
  });

  test("practice mode (dev): a salon's “Booking link” with no link yet; add, then undo — nothing sent to Google", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "development" });
    expect(await openOrderLink("b1")).toMatchObject({ status: "ok", kind: "booking", links: [], practice: true, canEdit: true, ownSite: { host: "hairexpressbroadway.com", parked: false } });
    const added = await applyOrderLinkAction("b1", { op: "add", url: VAGARO }, "accept");
    expect(added).toMatchObject({ status: "updated", links: [{ uri: VAGARO, editable: true }] });
    expect(added.status === "updated" && added.undo).toBeTruthy();
    expect((await undoOrderLinkAction("b1", added.status === "updated" ? added.undo!.batchId : "", "accept")).status).toBe("updated");
    expect(gbpEditGate).not.toHaveBeenCalled();
    expect(networkCalls).toEqual([]);
  });

  test("practice outcomes from the action: refuse → rejected; hold → unconfirmed", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "development" });
    expect(await applyOrderLinkAction("b1", { op: "add", url: VAGARO }, "refuse")).toEqual({ status: "error", error: "rejected" });
    db.changes.length = 0;
    expect((await applyOrderLinkAction("b1", { op: "add", url: VAGARO }, "hold")).status).toBe("unconfirmed");
  });

  test("a restaurant gets “Order online”; a business with neither gets no card", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "development" });
    db.business = TACOS;
    expect(await openOrderLink("b1")).toMatchObject({ status: "ok", kind: "order" });
    db.business = { ...HAIR, category: "Store", primary_type: "store" };
    expect(await openOrderLink("b1")).toEqual({ status: "none" });
  });

  test("production refuses practice mode even with the variable set: the real gate, never the fake Google", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "production" });
    gbpEditGate.mockResolvedValue({ ok: false, result: { status: "blocked", reason: "not_connected" } });
    expect(await openOrderLink("b1")).toEqual({ status: "blocked", reason: "not_connected" });
    expect(await applyOrderLinkAction("b1", { op: "add", url: VAGARO })).toEqual({ status: "blocked", reason: "not_connected" });
    expect(await addPlatformLinkAction("b1")).toEqual({ status: "blocked", reason: "not_connected" });
    expect(gbpEditGate).toHaveBeenCalledWith("b1", { requirePremium: true });
  });

  test("not on GOOGLE_WRITES_LIVE_PLACES (default: none): Add, Change, Remove and Undo refused on the server — nothing sent, nothing saved", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: undefined, GOOGLE_WRITES_LIVE_PLACES: undefined });
    gbpEditGate.mockResolvedValue(gate());
    expect(googleWritesAllowed("ChIJ-hair-express", {})).toBe(false);
    expect(googleWritesAllowed("ChIJ-hair-express", { GOOGLE_WRITES_LIVE_PLACES: "ChIJ-a, ChIJ-hair-express" })).toBe(true);
    // The old per-feature lists are no longer read.
    expect(googleWritesAllowed("ChIJ-hair-express", { GBP_PLACE_ACTIONS_LIVE_PLACES: "ChIJ-hair-express", REVIEW_REPLIES_LIVE_PLACES: "ChIJ-hair-express" })).toBe(false);
    expect(await applyOrderLinkAction("b1", { op: "add", url: VAGARO })).toEqual({ status: "editing_off" });
    expect(await applyOrderLinkAction("b1", { op: "change", name: "locations/222/placeActionLinks/1", url: VAGARO })).toEqual({ status: "editing_off" });
    expect(await applyOrderLinkAction("b1", { op: "remove", name: "locations/222/placeActionLinks/1" })).toEqual({ status: "editing_off" });
    expect(await undoOrderLinkAction("b1", "batch-1")).toEqual({ status: "editing_off" });
    gbpEditGate.mockResolvedValue(gate("https://www.doordash.com/store/36532653"));
    db.business = TACOS;
    expect(await addPlatformLinkAction("b1")).toEqual({ status: "editing_off" });
    expect(await undoPlatformLinkAction("b1", "batch-1")).toEqual({ status: "editing_off" });
    expect(networkCalls).toEqual([]);
    expect(db.changes).toEqual([]);
  });

  test("checked on the server too: a bad link is refused before anything is sent", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "development" });
    expect(await applyOrderLinkAction("b1", { op: "add", url: "http://www.vagaro.com/x" })).toEqual({ status: "invalid", problem: "not_https" });
    expect(await applyOrderLinkAction("b1", { op: "add", url: "https://www.doordash.com/store/1" })).toEqual({ status: "invalid", problem: "not_allowed" });
    const content = { hasTitle: true, hasMetaDescription: false, hasViewportTag: true, headingCount: 0, visibleTextLength: 40, hasPhoneLink: false, hasEmailLink: false, hasCtaText: false, parkedDomain: { provider: "GoDaddy" } };
    db.business = { ...HAIR, website_analysis_json: { checkedAt: "2026-11-01T00:00:00Z", content } };
    expect(await applyOrderLinkAction("b1", { op: "add", url: "https://hairexpressbroadway.com/book" })).toEqual({ status: "invalid", problem: "parked" });
    expect(await applyOrderLinkAction("b1", { op: "add" })).toEqual({ status: "invalid", problem: "invalid" });
    expect(db.changes).toEqual([]);
  });

  test("the platform card's “Add to ‘Order online’” runs the same way in practice: the website's DoorDash link, saved first, read back, undoable", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "development" });
    db.business = TACOS;
    expect(await getPlatformLinkStatus("b1")).toMatchObject({ status: "ok", alreadyOnGoogle: false, canAdd: true, canEdit: true, practice: true });
    const added = await addPlatformLinkAction("b1");
    expect(added).toMatchObject({ status: "sent", mapsUri: null });
    expect(db.changes[0]).toMatchObject({ kind: "order_link_practice", status: "sent" });
    expect(await addPlatformLinkAction("b1")).toEqual({ status: "already" });
    expect(added.status === "sent" && added.undo).toBeTruthy();
    expect((await undoPlatformLinkAction("b1", added.status === "sent" ? added.undo!.batchId : "")).status).toBe("sent");
    expect(networkCalls).toEqual([]);
  });

  test("the edit code never marks a recommendation done — a later scan confirms it", () => {
    for (const file of ["app/actions/gbpOrderLink.ts", "lib/gbpOrderLink.server.ts", "app/actions/gbpPlaceActions.ts"]) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/\btasks\b|business_tasks|saveScoreSnapshot|notifications/);
    }
  });
});

describe("on the page (EN + ES)", () => {
  const view = (over: Partial<OrderLinkView> = {}): OrderLinkView => ({ status: "ok", kind: "booking", links: [], ownSite: { host: "hairexpressbroadway.com", parked: false }, undo: null, practice: false, canEdit: true, ...over });
  const render = (v: OrderLinkView, locale: "en" | "es" = "en", editing?: { name: string | null; url: string }) =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale} timeZone="America/New_York">
        <OrderLinkBody businessId="b1" initial={v} outcome="accept" initialEditing={editing} />
      </LocaleProvider>
    );

  test("salons see “Booking link” with booking sites named; restaurants see “Order online”", () => {
    const booking = render(view(), "en", { name: null, url: "" });
    expect(booking).toContain("Booking link");
    expect(booking).toContain("Square Appointments, Vagaro, Booksy, Fresha");
    expect(booking).toContain('data-kind="booking"');
    expect(render(view(), "es")).toContain("Enlace para reservar");
    const order = render(view({ kind: "order" }), "en", { name: null, url: "" });
    expect(order).toContain("Order online");
    expect(order).toContain("DoorDash, Uber Eats, Toast");
    expect(render(view({ kind: "order" }), "es")).toContain("Pedidos en línea");
  });

  test("no link yet → “Add the link”; the owner's link → Change / Remove; a partner's link → shown, not editable", () => {
    expect(render(view())).toContain("Add the link");
    const html = render(
      view({
        links: [
          { name: "locations/1/placeActionLinks/a", uri: VAGARO, type: "APPOINTMENT", editable: true, preferred: true },
          { name: "locations/1/placeActionLinks/b", uri: "https://www.fresha.com/x", type: "APPOINTMENT", editable: false, preferred: false },
        ],
      })
    );
    expect(html).toContain("order-link-change");
    expect(html).toContain("order-link-remove");
    expect(html).not.toContain("Add the link");
    expect(html).toContain("Added by a Google partner (Fresha)");
    expect(render(view({ links: [{ name: "x", uri: VAGARO, type: "APPOINTMENT", editable: false, preferred: false }] }), "es")).toContain("Agregado por un socio de Google");
  });

  test("Approve says Beta; locked when editing is off — grey, a lock, “Changes to Google are off for this business”", () => {
    const on = render(view(), "en", { name: null, url: VAGARO });
    expect(on).toContain('data-testid="beta-label"');
    expect(on).toContain("Approve and add to Google");
    const off = render(view({ canEdit: false }), "en", { name: null, url: VAGARO });
    expect(off).toMatch(/data-testid="approve-order-link"[^>]*data-locked="true"/);
    expect(off).toContain('title="Changes to Google are off for this business"');
    expect(render(view({ canEdit: false }), "es", { name: null, url: VAGARO })).toContain('title="Los cambios en Google están desactivados para este negocio"');
  });

  test("the link's problem shows as you type (EN + ES)", () => {
    expect(render(view(), "en", { name: null, url: "http://www.vagaro.com/x" })).toContain("Use a secure link that starts with https://");
    expect(render(view(), "es", { name: null, url: "https://www.doordash.com/x" })).toContain("Use un sitio de reservas");
  });

  test("messages: green when Google shows it, a neutral wait when it doesn't yet, red only for real failures", () => {
    expect(orderLinkMessage({ status: "updated", links: [], undo: null }, "add", "booking", "en")).toEqual({ text: "Updated on Google ✓", tone: "done" });
    expect(orderLinkMessage({ status: "updated", links: [], undo: null }, "remove", "booking", "es")).toEqual({ text: "Quitado de Google ✓", tone: "done" });
    expect(orderLinkMessage({ status: "unconfirmed", links: [], undo: null }, "add", "booking", "en").tone).toBe("waiting");
    expect(orderLinkMessage({ status: "error", error: "rejected" }, "add", "booking", "en")).toMatchObject({ tone: "failure" });
    expect(orderLinkMessage({ status: "editing_off" }, "add", "booking", "en").text).toBe("Changes to Google are turned off for this business, so nothing was sent.");
    expect(orderLinkMessage({ status: "error", error: "not_set_up" }, "add", "booking", "en").text).toBe("Editing from PostScore isn't set up yet, so nothing was sent to Google.");
  });

  test("the platform card in practice mode says so", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en" timeZone="America/New_York">
        <PlatformLinkCard businessId="b1" website={TACOS.website} premium connected initialStatus={{ status: "ok", platform: websitePlatform(TACOS.website)!, alreadyOnGoogle: false, canAdd: true, canEdit: true, practice: true, undo: null }} />
      </LocaleProvider>
    );
    expect(html).toContain("Practice mode — nothing is sent to Google.");
  });
});
