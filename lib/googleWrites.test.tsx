import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

// One switch for EVERY write to Google: GOOGLE_WRITES_LIVE_PLACES. Review
// replies, Edit on Google (hours, phone, description), the ordering /
// booking link, the website link and customer details are each refused on
// the server when the business isn't on the list; "all" opens every
// connected business; empty (or unset) blocks everything. Plus the website
// link and customer details under the same flow as the other editors:
// practice mode's fake Google (Accept / Refuse / Hold), saved before
// sending, read back, the outcome logged (never a value), Beta on Approve.
// NEVER calls Google: the real fetch throws in this file, and the
// "Google" that answers reads below is a local stub that refuses writes.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const markGbpReconnect = vi.fn();
vi.mock("@/lib/gbpTokens.server", () => ({ markGbpReconnect: (...a: unknown[]) => markGbpReconnect(...a) }));
const gbpEditGate = vi.fn();
vi.mock("@/lib/gbpEditGate.server", () => ({ gbpEditGate: (...a: unknown[]) => gbpEditGate(...a) }));
const getPlan = vi.fn(async () => "premium");
vi.mock("@/lib/premium", () => ({ getPlan: () => getPlan() }));
vi.mock("@/lib/businessArchive.server", () => ({ isBusinessArchived: async () => false }));
vi.mock("@/app/actions/actionPlan", () => ({ markTaskDone: vi.fn(async () => null) }));

const realFetch = globalThis.fetch;
const networkCalls: string[] = [];
const throwingFetch = (async (input: RequestInfo | URL) => {
  networkCalls.push(String(input));
  throw new Error(`A test tried to reach the network: ${String(input)}`);
}) as typeof fetch;
globalThis.fetch = throwingFetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

const HAIR = { id: "b1", place_id: "ChIJ-hair-express", name: "Hair express", website: "https://hairexpressbroadway.com", verified_website_url: "https://hairexpressbroadway.com", category: "Hair Salon", primary_type: "hair_salon", business_type_override: null, categories: null, language: "en", website_analysis_json: null };

// The fake database: gbp_changes rows (in the order saved), the edit log, the business row.
const db = {
  changes: [] as Array<Record<string, unknown>>,
  log: [] as Array<Record<string, unknown>>,
  events: [] as string[],
};
function chain(table: string) {
  const filters: Record<string, unknown> = {};
  let update: Record<string, unknown> | null = null;
  const c = {
    select: () => c,
    eq: (k: string, v: unknown) => ((filters[k] = v), c),
    gte: () => c,
    order: () => c,
    limit: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({
      data: table === "businesses" ? HAIR : table === "gbp_connections" ? { status: "connected", google_account_id: "accounts/1", google_location_id: "locations/222" } : null,
    }),
    insert: async (rows: Record<string, unknown> | Array<Record<string, unknown>>) => {
      for (const row of Array.isArray(rows) ? rows : [rows]) {
        if (table === "gbp_changes") {
          db.events.push(`save:${row.status}`);
          db.changes.push({ undo_of: null, undone_at: null, ...row });
        } else if (table === "gbp_profile_edit_log") db.log.push(row);
      }
      return { error: null };
    },
    update: (patch: Record<string, unknown>) => ((update = patch), c),
    then: (resolve: (v: unknown) => void) => {
      if (update) {
        for (const r of table === "gbp_changes" ? db.changes : []) if (Object.entries(filters).every(([k, v]) => r[k] === v)) Object.assign(r, update);
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
// "Check this website": a real-looking page, never fetched.
vi.mock("@/lib/websiteAnalysis", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/websiteAnalysis")>()), fetchWebsiteHtml: async () => ({ html: "<html><body><h1>Hair Express</h1><p>Haircuts and color on Broadway.</p></body></html>" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) }, from: (table: string) => chain(table) }),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { googleWritesAllowed, googleWritesLivePlaces, googleWritesStartupWarnings } from "@/lib/gbpReviewPractice";
import { googleWriteContext } from "@/lib/gbpWriteContext.server";
import { supabaseChangeStore, type GbpEditTarget } from "@/lib/gbpAttributes.server";
import { applyWebsiteLink, getWebsiteLinkUndo, undoWebsiteLink } from "@/lib/gbpWebsiteLink.server";
import { PRACTICE_PROFILE_LOCATION, practiceProfileFetch, resetPracticeProfiles, setPracticeOutcome } from "@/lib/gbpProfilePractice.server";
import { resetPracticePlaceActions } from "@/lib/gbpPlaceActionsPractice.server";
import { applyWebsiteLinkAction, googleWritesPageState, openWebsiteLinkFix, undoWebsiteLinkAction } from "@/app/actions/gbpWebsiteLink";
import { applyCustomerDetailsAction, loadCustomerDetailsEditorAction, undoCustomerDetailsAction } from "@/app/actions/gbpCustomerDetails";
import { applyProfileEditAction, openProfileEdits, undoProfileEditAction } from "@/app/actions/gbpProfileEdits";
import { applyOrderLinkAction, openOrderLink, undoOrderLinkAction } from "@/app/actions/gbpOrderLink";
import { addPlatformLinkAction, undoPlatformLinkAction } from "@/app/actions/gbpPlaceActions";
import { changeGoogleReviewReply, listGoogleReviews } from "@/app/actions/googleReviews";
import { WebsiteLinkFix } from "@/components/gbp/WebsiteLinkFix";
import { CustomerDetailsGoogleEdit, GbpEditProvider, type GbpEditState } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { resetGbpQuota } from "@/lib/gbpQuota";
import { LocaleProvider, type Locale } from "@/lib/i18n";

const ENV_KEYS = ["REVIEW_REPLIES_PRACTICE", "GOOGLE_WRITES_LIVE_PLACES", "NODE_ENV", "REVIEW_REPLIES_LIVE_PLACES", "GBP_PROFILE_EDITS_LIVE_PLACES", "GBP_PLACE_ACTIONS_LIVE_PLACES"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const setEnv = (vars: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) => {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = v;
  }
};

const gate = () => ({
  ok: true,
  admin,
  plan: "premium",
  tokens: { markGbpReconnect },
  business: { id: "b1", language: "en", website: HAIR.website, verified_website_url: HAIR.verified_website_url, place_id: HAIR.place_id },
  target: { businessId: "b1", userId: "owner-1", locationName: "locations/222", accessToken: "test-token", locale: "en" },
});

/** A stand-in Google for READS only (empty answers); any write is recorded and refused. */
const writes: string[] = [];
const readOnlyGoogle = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    writes.push(`${method} ${String(input)}`);
    return new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), { status: 403 });
  }
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

/** Every write to Google there is, with the arguments a real owner would send. */
const EVERY_WRITE: Array<[string, () => Promise<{ status: string }>]> = [
  ["review reply: post", () => changeGoogleReviewReply("b1", "r1", "post", "Thank you!")],
  ["review reply: edit", () => changeGoogleReviewReply("b1", "r1", "edit", "Thank you!")],
  ["review reply: delete", () => changeGoogleReviewReply("b1", "r1", "delete")],
  ["profile: approve", () => applyProfileEditAction("b1", "phone", "302-555-2368")],
  ["profile: undo", () => undoProfileEditAction("b1", "phone", "batch-1")],
  ["order link: add", () => applyOrderLinkAction("b1", { op: "add", url: "https://www.vagaro.com/hairexpressbroadway" })],
  ["order link: undo", () => undoOrderLinkAction("b1", "batch-1")],
  ["platform card: add", () => addPlatformLinkAction("b1")],
  ["platform card: undo", () => undoPlatformLinkAction("b1", "batch-1")],
  ["website link: approve", () => applyWebsiteLinkAction("b1", "https://hairexpressbroadway.com")],
  ["website link: undo", () => undoWebsiteLinkAction("b1", "batch-1")],
  ["customer details: approve", () => applyCustomerDetailsAction("b1", { "attributes/pay_credit_card": true })],
  ["customer details: undo", () => undoCustomerDetailsAction("b1", "batch-1")],
];
const REFUSED = new Set(["editing_off", "posting_off"]);

beforeEach(() => {
  resetGbpQuota();
  resetPracticeProfiles();
  resetPracticePlaceActions();
  Object.assign(db, { changes: [], log: [], events: [] });
  networkCalls.length = 0;
  writes.length = 0;
  gbpEditGate.mockReset();
  gbpEditGate.mockResolvedValue(gate());
  getPlan.mockResolvedValue("premium");
  setEnv({ REVIEW_REPLIES_PRACTICE: undefined, GOOGLE_WRITES_LIVE_PLACES: undefined, REVIEW_REPLIES_LIVE_PLACES: undefined, GBP_PROFILE_EDITS_LIVE_PLACES: undefined, GBP_PLACE_ACTIONS_LIVE_PLACES: undefined });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  globalThis.fetch = throwingFetch;
  setEnv(savedEnv);
});

describe("GOOGLE_WRITES_LIVE_PLACES: one list for every write", () => {
  test("empty or unset: nothing; place ids: only those; \"all\": every connected business", () => {
    expect(googleWritesLivePlaces({})).toEqual([]);
    expect(googleWritesAllowed("ChIJ-hair-express", {})).toBe(false);
    expect(googleWritesAllowed("ChIJ-hair-express", { GOOGLE_WRITES_LIVE_PLACES: "" })).toBe(false);
    expect(googleWritesAllowed("ChIJ-hair-express", { GOOGLE_WRITES_LIVE_PLACES: " , " })).toBe(false);
    expect(googleWritesAllowed("ChIJ-hair-express", { GOOGLE_WRITES_LIVE_PLACES: "ChIJ-a, ChIJ-hair-express" })).toBe(true);
    expect(googleWritesAllowed("ChIJ-colorful", { GOOGLE_WRITES_LIVE_PLACES: "ChIJ-a, ChIJ-hair-express" })).toBe(false);
    for (const all of ["all", " ALL ", "All"]) {
      expect(googleWritesLivePlaces({ GOOGLE_WRITES_LIVE_PLACES: all })).toBe("all");
      expect(googleWritesAllowed("ChIJ-anyone", { GOOGLE_WRITES_LIVE_PLACES: all })).toBe(true);
    }
    // "all" is the whole value — never a place id mixed into a list.
    expect(googleWritesAllowed("ChIJ-anyone", { GOOGLE_WRITES_LIVE_PLACES: "all, ChIJ-a" })).toBe(false);
  });

  test("the three old per-feature lists are no longer read", () => {
    const old = { REVIEW_REPLIES_LIVE_PLACES: "ChIJ-hair-express", GBP_PROFILE_EDITS_LIVE_PLACES: "ChIJ-hair-express", GBP_PLACE_ACTIONS_LIVE_PLACES: "all" };
    expect(googleWritesAllowed("ChIJ-hair-express", old)).toBe(false);
  });

  test("startup: a warning for \"all\" outside production (not in production), and for each old list still set", () => {
    expect(googleWritesStartupWarnings({ GOOGLE_WRITES_LIVE_PLACES: "all", NODE_ENV: "development" })).toEqual([expect.stringContaining("GOOGLE_WRITES_LIVE_PLACES=all outside production")]);
    expect(googleWritesStartupWarnings({ GOOGLE_WRITES_LIVE_PLACES: "all", NODE_ENV: "production" })).toEqual([]);
    expect(googleWritesStartupWarnings({ GOOGLE_WRITES_LIVE_PLACES: "ChIJ-a", NODE_ENV: "development" })).toEqual([]);
    expect(googleWritesStartupWarnings({ REVIEW_REPLIES_LIVE_PLACES: "ChIJ-a", NODE_ENV: "production" })).toEqual([expect.stringContaining("REVIEW_REPLIES_LIVE_PLACES is no longer read")]);
    const instrumentation = readFileSync("instrumentation.ts", "utf8");
    expect(instrumentation).toContain("googleWritesStartupWarnings()");
    expect(readFileSync("next.config.mjs", "utf8")).toContain("instrumentationHook: true");
  });

  test("empty blocks everything: every writer refused on the server — nothing sent, nothing saved", async () => {
    for (const value of [undefined, ""]) {
      setEnv({ GOOGLE_WRITES_LIVE_PLACES: value });
      for (const [name, write] of EVERY_WRITE) expect([name, REFUSED.has((await write()).status)]).toEqual([name, true]);
    }
    expect(networkCalls).toEqual([]);
    expect(db.changes).toEqual([]);
    expect(db.log).toEqual([]);
  });

  test("each writer refused when the business isn't on the list (another business is)", async () => {
    setEnv({ GOOGLE_WRITES_LIVE_PLACES: "ChIJ-someone-else" });
    for (const [name, write] of EVERY_WRITE) expect([name, (await write()).status]).toEqual([name, name.startsWith("review") ? "posting_off" : "editing_off"]);
    expect(networkCalls).toEqual([]);
    expect(db.changes).toEqual([]);
  });

  test("the old lists don't open anything", async () => {
    setEnv({ REVIEW_REPLIES_LIVE_PLACES: "ChIJ-hair-express", GBP_PROFILE_EDITS_LIVE_PLACES: "ChIJ-hair-express", GBP_PLACE_ACTIONS_LIVE_PLACES: "ChIJ-hair-express" });
    for (const [name, write] of EVERY_WRITE) expect([name, REFUSED.has((await write()).status)]).toEqual([name, true]);
    expect(networkCalls).toEqual([]);
  });

  test("\"all\" works: every editor opens with Approve on — and still only reads", async () => {
    setEnv({ GOOGLE_WRITES_LIVE_PLACES: "all" });
    globalThis.fetch = readOnlyGoogle;
    expect(await listGoogleReviews("b1")).toMatchObject({ status: "ok", canPost: true });
    expect(await openProfileEdits("b1")).toMatchObject({ status: "ok", canEdit: true, practice: false });
    expect(await openOrderLink("b1")).toMatchObject({ status: "ok", canEdit: true });
    expect(await openWebsiteLinkFix("b1")).toMatchObject({ status: "ok", canEdit: true, practice: false });
    expect(await loadCustomerDetailsEditorAction("b1")).toMatchObject({ status: "ok", canEdit: true, practice: false });
    expect(await googleWritesPageState("b1")).toEqual({ practice: false, canEdit: true });
    expect(writes).toEqual([]);
  });

  test("on the list by place id: the website link and customer details open with Approve on; off it, read-only", async () => {
    globalThis.fetch = readOnlyGoogle;
    setEnv({ GOOGLE_WRITES_LIVE_PLACES: "ChIJ-hair-express" });
    expect((await googleWriteContext("b1")) as { canEdit: boolean }).toMatchObject({ canEdit: true });
    expect(await openWebsiteLinkFix("b1")).toMatchObject({ status: "ok", canEdit: true });
    setEnv({ GOOGLE_WRITES_LIVE_PLACES: undefined });
    expect(await openWebsiteLinkFix("b1")).toMatchObject({ status: "ok", canEdit: false });
    expect(await loadCustomerDetailsEditorAction("b1")).toMatchObject({ status: "ok", canEdit: false });
    expect(await googleWritesPageState("b1")).toEqual({ practice: false, canEdit: false });
    expect(writes).toEqual([]);
  });

  test("practice mode is refused in production: the real gate and the real list decide (empty: refused)", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "production" });
    expect(((await googleWriteContext("b1")) as { practice: boolean }).practice).toBe(false);
    expect(await applyWebsiteLinkAction("b1", "https://hairexpressbroadway.com", "accept")).toEqual({ status: "editing_off" });
    expect(await applyCustomerDetailsAction("b1", { "attributes/pay_credit_card": true }, "accept")).toEqual({ status: "editing_off" });
    expect(networkCalls).toEqual([]);
  });
});

describe("every write to Google is behind the switch", () => {
  // The files that send a non-GET request to a Google Business Profile API
  // (the OAuth token / revoke calls and the Places / PageSpeed / Safe
  // Browsing searches change nothing on a listing). A new one fails here
  // until it's behind GOOGLE_WRITES_LIVE_PLACES and added to this list.
  const WRITERS = ["lib/gbpReviewInbox.server.ts", "lib/gbpProfileEdits.server.ts", "lib/gbpOrderLink.server.ts", "lib/gbpWebsiteLink.server.ts", "lib/gbpAttributes.server.ts"];
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) return f === "node_modules" || f.startsWith(".") ? [] : files(p);
      return /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
    });

  test("only the five known writers send PATCH / PUT / POST / DELETE to a Business Profile API", () => {
    const google = /mybusiness[a-z]*\.googleapis\.com|PLACE_ACTIONS_BASE|reviewUrl\(|from "@\/lib\/gbpAttributes\.server"|from "@\/lib\/gbpPlaceActions\.server"/;
    const write = /method: ?["'](PATCH|PUT|POST|DELETE)["']/;
    const found = ["lib", "app", "components"].flatMap(files).filter((p) => {
      const src = readFileSync(p, "utf8");
      return google.test(src) && write.test(src);
    });
    expect(found.sort()).toEqual([...WRITERS].sort());
  });

  test("each writer's server action checks the switch before calling it", () => {
    const actions: Record<string, string> = {
      "app/actions/googleReviews.ts": "if (!t.canPost) return { status: \"posting_off\" }",
      "app/actions/gbpProfileEdits.ts": "if (!c.canEdit) return { status: \"editing_off\" }",
      "app/actions/gbpOrderLink.ts": "if (!c.canEdit) return { status: \"editing_off\" }",
      "app/actions/gbpPlaceActions.ts": "if (!c.canEdit) return { status: \"editing_off\" }",
      "app/actions/gbpWebsiteLink.ts": "if (!c.canEdit) return { status: \"editing_off\" }",
      "app/actions/gbpCustomerDetails.ts": "if (!c.canEdit) return { status: \"editing_off\" }",
    };
    for (const [file, check] of Object.entries(actions)) expect([file, readFileSync(file, "utf8").includes(check)]).toEqual([file, true]);
    // Every real-mode context reads the one list.
    for (const file of ["app/actions/googleReviews.ts", "app/actions/gbpProfileEdits.ts", "lib/gbpOrderLinkContext.server.ts", "lib/gbpWriteContext.server.ts"]) {
      expect([file, readFileSync(file, "utf8").includes("googleWritesAllowed(")]).toEqual([file, true]);
    }
  });
});

// ---------------------------------------------------------------------------
// The website link and customer details, on practice mode's fake Google.
// ---------------------------------------------------------------------------

const PRACTICE: GbpEditTarget = { businessId: "b1", userId: "owner-1", locationName: PRACTICE_PROFILE_LOCATION, accessToken: "practice-token", locale: "en" };
const REAL_SITE = "https://hairexpressbroadway.com/";
const okCheck = async () => ({ status: "ok" as const, url: REAL_SITE });
const store = () => supabaseChangeStore(admin as unknown as SupabaseClient);
/** The practice fake, recording each Google call in the shared event list. */
const recorded = (businessId = "b1") => {
  const f = practiceProfileFetch(businessId);
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (method !== "GET") db.events.push(`${method} ${url.pathname.replace(/^\/v1\//, "")}`);
    return f(input, init);
  }) as typeof fetch;
};
const linkOnFake = async () => ((await (await practiceProfileFetch("b1")(`https://mybusinessbusinessinformation.googleapis.com/v1/${PRACTICE_PROFILE_LOCATION}?readMask=websiteUri`)).json()) as { websiteUri?: string }).websiteUri ?? null;
const MIN = 60_000;

describe("website link: same flow as the other editors (practice mode's fake Google)", () => {
  test("Accept: the old link saved BEFORE the one PATCH, read back, ✓; the log has the outcome, never the URL", async () => {
    expect(await applyWebsiteLink(PRACTICE, REAL_SITE, store(), { fetchImpl: recorded(), checkImpl: okCheck, practice: true })).toEqual({ status: "sent", verified: true, before: "https://www.example.com/old-page", shown: REAL_SITE });
    expect(db.events).toEqual(["save:sending", `PATCH ${PRACTICE_PROFILE_LOCATION}`]);
    expect(db.changes).toEqual([expect.objectContaining({ kind: "website_uri_practice", field: "websiteUri", before_value: "https://www.example.com/old-page", after_value: REAL_SITE, status: "sent" })]);
    expect(await linkOnFake()).toBe(REAL_SITE);
    expect(db.log).toEqual([{ business_id: "b1", user_id: "owner-1", field: "website_link", action: "edit", outcome: "ok", practice: true, error_reason: null, changed_count: 1 }]);
    expect(JSON.stringify(db.log)).not.toContain("hairexpressbroadway");
    expect(JSON.stringify(db.log)).not.toContain("example.com");
  });

  test("Hold: a neutral wait (pending review), the change isn't applied, Undo is still offered", async () => {
    setPracticeOutcome("b1", "hold");
    expect(await applyWebsiteLink(PRACTICE, REAL_SITE, store(), { fetchImpl: recorded(), checkImpl: okCheck, practice: true })).toMatchObject({ status: "pending_review" });
    expect(await linkOnFake()).toBe("https://www.example.com/old-page");
    expect(db.log[0]).toMatchObject({ outcome: "pending_review" });
    expect(await getWebsiteLinkUndo(store(), "b1", PRACTICE_PROFILE_LOCATION, Date.now(), true)).toMatchObject({ status: "pending_review", before: "https://www.example.com/old-page" });
  });

  test("Refuse: Google didn't accept it — saved first, marked failed, nothing changed, no Undo", async () => {
    setPracticeOutcome("b1", "refuse");
    expect(await applyWebsiteLink(PRACTICE, REAL_SITE, store(), { fetchImpl: recorded(), checkImpl: okCheck, practice: true })).toEqual({ status: "error", error: "rejected" });
    expect(db.events).toEqual(["save:sending", `PATCH ${PRACTICE_PROFILE_LOCATION}`]);
    expect(db.changes[0]).toMatchObject({ status: "failed" });
    expect(db.log[0]).toMatchObject({ outcome: "failed", practice: true });
    expect(await linkOnFake()).toBe("https://www.example.com/old-page");
    expect(await getWebsiteLinkUndo(store(), "b1", PRACTICE_PROFILE_LOCATION, Date.now(), true)).toBeNull();
  });

  test("Undo: saved first, the old link back, read back; practice undo never touches real changes", async () => {
    const now = Date.now();
    await applyWebsiteLink(PRACTICE, REAL_SITE, store(), { fetchImpl: recorded(), checkImpl: okCheck, practice: true, now });
    const undo = (await getWebsiteLinkUndo(store(), "b1", PRACTICE_PROFILE_LOCATION, now + MIN, true))!;
    // Real changes (kind website_uri) don't see the practice row.
    expect(await getWebsiteLinkUndo(store(), "b1", PRACTICE_PROFILE_LOCATION, now + MIN, false)).toBeNull();
    db.events.length = 0;
    expect(await undoWebsiteLink(PRACTICE, undo.batchId, store(), { fetchImpl: recorded(), practice: true, now: now + MIN })).toEqual({ status: "sent", shown: "https://www.example.com/old-page" });
    expect(db.events).toEqual(["save:sending", `PATCH ${PRACTICE_PROFILE_LOCATION}`]);
    expect(await linkOnFake()).toBe("https://www.example.com/old-page");
    expect(db.log.map((l) => [l.action, l.outcome])).toEqual([["edit", "ok"], ["undo", "ok"]]);
  });

  test("the edit log not set up yet (supabase/gbp-google-writes.sql): nothing saved, nothing sent", async () => {
    const notReady = { ...store(), editLogReady: async () => false };
    expect(await applyWebsiteLink(PRACTICE, REAL_SITE, notReady, { fetchImpl: recorded(), checkImpl: okCheck, practice: true })).toEqual({ status: "error", error: "not_enabled" });
    expect(db.events).toEqual([]);
  });
});

describe("after a reload: On Google now and the Undo line come from Google and gbp_changes (practice mode)", () => {
  test("website link: Approve → open again shows the new link and the Undo; Undo → the old link, no Undo", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "test" });
    const before = (await openWebsiteLinkFix("b1")) as { current: string | null; undo: unknown };
    expect(before).toMatchObject({ status: "ok", current: "https://www.example.com/old-page", undo: null });
    const sent = (await applyWebsiteLinkAction("b1", REAL_SITE, "accept")) as { status: string; current: string; undo: { batchId: string; undoUntil: string } };
    expect(sent).toMatchObject({ status: "sent", verified: true, current: REAL_SITE });
    // The page reloads: the card reads Google and the saved change again.
    const reopened = (await openWebsiteLinkFix("b1")) as { current: string | null; undo: { batchId: string } | null };
    expect(reopened.current).toBe(REAL_SITE);
    expect(reopened.undo?.batchId).toBe(sent.undo.batchId);
    expect(await undoWebsiteLinkAction("b1", sent.undo.batchId, "accept")).toEqual({ status: "sent", current: "https://www.example.com/old-page" });
    expect(await openWebsiteLinkFix("b1")).toMatchObject({ current: "https://www.example.com/old-page", undo: null });
    expect(networkCalls).toEqual([]);
  });

  test("customer details: Approve → load again shows the new value and the Undo; Undo → no Undo", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "test" });
    expect(await loadCustomerDetailsEditorAction("b1")).toMatchObject({ status: "ok", undo: null });
    const sent = (await applyCustomerDetailsAction("b1", { "attributes/has_parking_street_free": true }, "accept")) as { undo: { batchId: string } };
    const reloaded = (await loadCustomerDetailsEditorAction("b1")) as { rows: Array<{ id: string; current: unknown }>; undo: { batchId: string } | null };
    expect(reloaded.rows.find((r) => r.id === "attributes/has_parking_street_free")?.current).toBe(true);
    expect(reloaded.undo?.batchId).toBe(sent.undo.batchId);
    expect(await undoCustomerDetailsAction("b1", sent.undo.batchId, "accept")).toMatchObject({ status: "sent" });
    const after = (await loadCustomerDetailsEditorAction("b1")) as { rows: Array<{ id: string; current: unknown }>; undo: unknown };
    expect(after.undo).toBeNull();
    expect(after.rows.find((r) => r.id === "attributes/has_parking_street_free")?.current).not.toBe(true);
    expect(networkCalls).toEqual([]);
  });
});

describe("customer details: same flow as the other editors (practice mode's fake Google)", () => {
  test("practice mode, from the server action: Accept saves first, one PATCH, reads back ✓, logs the count only", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "test" });
    const loaded = await loadCustomerDetailsEditorAction("b1");
    expect(loaded).toMatchObject({ status: "ok", practice: true, canEdit: true });
    // The sample listing: cards yes, nothing about parking yet.
    expect((loaded as { rows: Array<{ id: string; current: unknown }> }).rows.find((r) => r.id === "attributes/pay_credit_card")?.current).toBe(true);
    const r = await applyCustomerDetailsAction("b1", { "attributes/has_parking_street_free": true, "attributes/has_wheelchair_accessible_entrance": true }, "accept");
    expect(r).toMatchObject({ status: "sent", verified: true });
    expect(gbpEditGate).not.toHaveBeenCalled();
    expect(db.events[0]).toBe("save:sending");
    expect(db.changes.map((c) => [c.kind, c.field, c.status])).toEqual([
      ["attributes_practice", "attributes/has_parking_street_free", "sent"],
      ["attributes_practice", "attributes/has_wheelchair_accessible_entrance", "sent"],
    ]);
    expect(db.log).toEqual([{ business_id: "b1", user_id: "owner-1", field: "customer_details", action: "edit", outcome: "ok", practice: true, error_reason: null, changed_count: 2 }]);
    expect(networkCalls).toEqual([]);
  });

  test("Hold: pending review, not applied; Refuse: failed, nothing changed", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "test" });
    expect(await applyCustomerDetailsAction("b1", { "attributes/has_parking_lot_free": true }, "hold")).toMatchObject({ status: "pending_review" });
    expect(db.log[0]).toMatchObject({ outcome: "pending_review" });
    resetPracticeProfiles();
    resetGbpQuota();
    db.changes.length = 0;
    db.log.length = 0;
    expect(await applyCustomerDetailsAction("b1", { "attributes/has_parking_lot_free": true }, "refuse")).toMatchObject({ status: "error", error: "rejected" });
    expect(db.changes.map((c) => c.status)).toEqual(["failed"]);
    expect(db.log[0]).toMatchObject({ outcome: "failed" });
  });

  test("Undo in practice mode: the previous values back on the fake Google", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "test" });
    const r = (await applyCustomerDetailsAction("b1", { "attributes/pay_credit_card": false }, "accept")) as { status: string; undo: { batchId: string } | null };
    expect(r.undo).not.toBeNull();
    expect(await undoCustomerDetailsAction("b1", r.undo!.batchId, "accept")).toMatchObject({ status: "sent" });
    const after = (await loadCustomerDetailsEditorAction("b1")) as { rows: Array<{ id: string; current: unknown }> };
    expect(after.rows.find((row) => row.id === "attributes/pay_credit_card")?.current).toBe(true);
    expect(db.log.map((l) => [l.action, l.outcome])).toEqual([["edit", "ok"], ["undo", "ok"]]);
  });
});

// ---------------------------------------------------------------------------
// On the page (EN + ES).
// ---------------------------------------------------------------------------

const page = (node: ReactNode, state: Omit<GbpEditState, "enabled">, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <GbpEditProvider value={state}>{node}</GbpEditProvider>
    </LocaleProvider>
  );

describe("on the page", () => {
  const undo = { batchId: "u1", approvedAt: "2026-11-09T12:00:00.000Z", undoUntil: "2026-11-16T12:00:00.000Z", status: "sent" as const, before: "https://old.example.org", after: REAL_SITE };

  test("practice mode: the website link and customer details buttons show without a Google connection", () => {
    const state = { premium: true, connected: false, undo: null, websiteUndo: null, practice: true, canEdit: true };
    expect(page(<WebsiteLinkFix businessId="b1" suggested={null} />, state)).toContain('data-testid="website-link-fix"');
    expect(page(<CustomerDetailsGoogleEdit businessId="b1" />, state)).toContain('data-testid="gbp-edit"');
    // Not practice, not connected: the steps / "Connect Google".
    const off = { ...state, practice: false, canEdit: false };
    expect(page(<WebsiteLinkFix businessId="b1" suggested={null} />, off)).toContain('data-testid="website-link-fix-manual"');
    expect(page(<CustomerDetailsGoogleEdit businessId="b1" />, off)).toContain('data-testid="gbp-edit-connect"');
  });

  test("the website link's Undo is offered, with “Yes, undo” behind the same lock (EN + ES)", () => {
    const html = page(<WebsiteLinkFix businessId="b1" suggested={null} />, { premium: true, connected: true, undo: null, websiteUndo: undo, practice: false, canEdit: false });
    expect(html).toContain('data-testid="website-link-undo"');
    expect(page(<WebsiteLinkFix businessId="b1" suggested={null} />, { premium: true, connected: true, undo: null, websiteUndo: undo, practice: false, canEdit: false }, "es")).toContain("Deshacer");
  });

  test("the locked notes say one thing everywhere (EN + ES)", async () => {
    const { t } = await import("@/lib/i18n");
    expect(t("en", "dashboard.gbpProfileEdits.editingOff")).toBe("Changes to Google are off for this business");
    expect(t("en", "dashboard.googleReviews.postingOffTip")).toBe("Changes to Google are off for this business");
    expect(t("es", "dashboard.gbpProfileEdits.editingOff")).toBe("Los cambios en Google están desactivados para este negocio");
    expect(t("es", "dashboard.googleReviews.postingOffTip")).toBe("Los cambios en Google están desactivados para este negocio");
    expect(t("en", "dashboard.gbpEdit.error.editing_off")).toBe("Changes to Google are turned off for this business, so nothing was sent.");
    expect(t("es", "dashboard.gbpEdit.error.editing_off")).toBe("Los cambios en Google están desactivados para este negocio, así que no se envió nada.");
    expect(t("en", "dashboard.googleReviews.error.postingOff")).toBe(t("en", "dashboard.gbpEdit.error.editing_off"));
    expect(t("en", "dashboard.gbpProfileEdits.readOnly")).toContain("changes to Google are turned off for this business");
    expect(t("en", "dashboard.googleReviews.readOnly")).toContain("changes to Google are turned off for this business");
    // "✓" only for what Google shows.
    expect(t("en", "dashboard.gbpEdit.result.sent")).toBe("Updated on Google ✓");
    expect(t("es", "dashboard.websiteLinkFix.sent")).toContain("Actualizado en Google ✓");
  });

  test("Approve is the shared Beta button (locked when off) in both panels", () => {
    for (const file of ["components/gbp/WebsiteLinkFix.tsx", "components/gbp/CustomerDetailsGoogleEdit.tsx"]) {
      const src = readFileSync(file, "utf8");
      expect([file, src.includes("<ApproveButton")]).toEqual([file, true]);
      expect([file, src.includes("<PracticeChooser")]).toEqual([file, true]);
      expect([file, src.includes("<ReadOnlyNote")]).toEqual([file, true]);
      // "Yes, undo": the shared Undo line, locked the same way.
      expect([file, src.includes("<UndoLine")]).toEqual([file, true]);
    }
  });
});
