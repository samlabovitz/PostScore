import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

// Premium "Edit on Google": hours, phone and description on the owner's
// own Google Business Profile — checked before anything is sent, the
// previous value saved for undo BEFORE the edit, read back from Google,
// a neutral wait when Google holds it for review, practice mode's fake
// Google, the live allow list, and never in production.
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

// The fake database: gbp_changes rows, the edit log, and what's read.
const db = {
  changes: [] as Array<Record<string, unknown>>,
  log: [] as Array<Record<string, unknown>>,
  logMissing: false,
  changesMissing: false,
  failInsert: false,
  placeId: "ChIJ-hair-express",
  events: [] as string[],
};
function chain(table: string) {
  const filters: Record<string, unknown> = {};
  let update: Record<string, unknown> | null = null;
  const c = {
    select: () => c,
    eq: (k: string, v: unknown) => ((filters[k] = v), c),
    gte: () => c,
    limit: async () => (table === "gbp_profile_edit_log" ? { data: [], error: db.logMissing ? { code: "42P01" } : null } : { data: [], error: null }),
    maybeSingle: async () => ({ data: table === "businesses" ? { place_id: db.placeId, name: "Hair express", website_analysis_json: null } : null }),
    insert: async (row: Record<string, unknown>) => {
      if (table === "gbp_changes") {
        if (db.failInsert) return { error: { code: "23514" } };
        db.events.push(`save:${row.status}`);
        db.changes.push(row);
      } else db.log.push(row);
      return { error: null };
    },
    update: (patch: Record<string, unknown>) => ((update = patch), c),
    then: (resolve: (v: unknown) => void) => {
      if (update) {
        for (const r of db.changes) if (Object.entries(filters).every(([k, v]) => r[k] === v)) Object.assign(r, update);
        return resolve({ error: null });
      }
      if (table === "gbp_changes") {
        if (db.changesMissing) return resolve({ data: null, error: { code: "42P01" } });
        const rows = db.changes.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
        return resolve({ data: rows, error: null });
      }
      return resolve({ data: [], error: null });
    },
  };
  return c;
}
const admin = { from: (table: string) => chain(table) };
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  closedWeek,
  descriptionProblems,
  hoursProblems,
  samePhone,
  usPhone,
  weekFromGoogle,
  weekFromSite,
  weekInput,
  weekToGoogle,
  type WeeklyHours,
} from "@/lib/gbpProfileEdits";
import { applyProfileEdit, getProfileUndo, readLiveProfile, supabaseProfileEditStore, undoProfileEdit, type ProfileTarget } from "@/lib/gbpProfileEdits.server";
import { practiceProfileFetch, PRACTICE_PROFILE_LOCATION, resetPracticeProfiles, setPracticeOutcome } from "@/lib/gbpProfilePractice.server";
import { applyProfileEditAction, openProfileEdits, undoProfileEditAction } from "@/app/actions/gbpProfileEdits";
import { ProfileEditsBody, resultMessage, weekLines } from "@/components/gbp/ProfileEditsOnGoogle";
import { profileEditsAllowed } from "@/lib/gbpReviewPractice";
import { resetGbpQuota } from "@/lib/gbpQuota";
import { LocaleProvider } from "@/lib/i18n";

const PRACTICE: ProfileTarget = { businessId: "b1", userId: "owner-1", locationName: PRACTICE_PROFILE_LOCATION, accessToken: "practice-token" };
const store = () => supabaseProfileEditStore(admin as unknown as SupabaseClient);
const open = (open: number, close: number) => ({ open, close });
const week = (days: Partial<Record<number, WeeklyHours[number]>>): WeeklyHours => closedWeek().map((d, i) => days[i] ?? d);
/** The practice fake, recording each Google call in the shared event list. */
const recorded = (businessId = "b1") => {
  const f = practiceProfileFetch(businessId);
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    db.events.push(`${init?.method ?? "GET"} ${url.pathname.replace(/^\/v1\//, "")}${url.searchParams.get("updateMask") ? `?${url.searchParams.get("updateMask")}` : ""}`);
    return f(input, init);
  }) as typeof fetch;
};

const ENV_KEYS = ["REVIEW_REPLIES_PRACTICE", "GBP_PROFILE_EDITS_LIVE_PLACES", "NODE_ENV"] as const;
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
  Object.assign(db, { changes: [], log: [], logMissing: false, changesMissing: false, failInsert: false, placeId: "ChIJ-hair-express", events: [] });
  networkCalls.length = 0;
  gbpEditGate.mockReset();
  getPlan.mockResolvedValue("premium");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => setEnv(savedEnv));

describe("hours: checked before anything is sent", () => {
  test("valid: one range, two ranges with a lunch break, overnight, closing at midnight, open 24 hours", () => {
    expect(hoursProblems(week({ 1: { mode: "open", ranges: [open(540, 1020)] } }))).toEqual([]);
    expect(hoursProblems(week({ 1: { mode: "open", ranges: [open(540, 720), open(780, 1080)] } }))).toEqual([]);
    expect(hoursProblems(week({ 5: { mode: "open", ranges: [open(1020, 60)] } }))).toEqual([]);
    expect(hoursProblems(week({ 5: { mode: "open", ranges: [open(1020, 0)] } }))).toEqual([]);
    expect(hoursProblems(week({ 0: { mode: "open24" } }))).toEqual([]);
  });

  test("refused: overlapping ranges, same open and close, no hours on an open day, a bad time", () => {
    expect(hoursProblems(week({ 1: { mode: "open", ranges: [open(540, 780), open(720, 1020)] } }))).toEqual([{ day: 1, problem: "overlap" }]);
    expect(hoursProblems(week({ 2: { mode: "open", ranges: [open(540, 540)] } }))).toEqual([{ day: 2, problem: "same_open_close" }]);
    expect(hoursProblems(week({ 3: { mode: "open", ranges: [] } }))).toEqual([{ day: 3, problem: "no_ranges" }]);
    expect(hoursProblems(week({ 4: { mode: "open", ranges: [open(540, 1500)] } }))).toEqual([{ day: 4, problem: "bad_time" }]);
  });

  test("overnight: close before open is the next day — but not into the next day's own hours, and only the last range", () => {
    // Friday 5 PM – 2 AM, Saturday opens 10 AM: fine.
    expect(hoursProblems(week({ 5: { mode: "open", ranges: [open(1020, 120)] }, 6: { mode: "open", ranges: [open(600, 960)] } }))).toEqual([]);
    // Friday 5 PM – 11 AM runs into Saturday's 10 AM opening.
    expect(hoursProblems(week({ 5: { mode: "open", ranges: [open(1020, 660)] }, 6: { mode: "open", ranges: [open(600, 960)] } }))).toEqual([{ day: 5, problem: "overnight_overlap" }]);
    // Saturday overnight into a 24-hour Sunday.
    expect(hoursProblems(week({ 6: { mode: "open", ranges: [open(1200, 60)] }, 0: { mode: "open24" } }))).toEqual([{ day: 6, problem: "overnight_overlap" }]);
    // An overnight range that isn't the day's last.
    expect(hoursProblems(week({ 1: { mode: "open", ranges: [open(1320, 60), open(1380, 1430)] } }))).toEqual([{ day: 1, problem: "overlap" }]);
  });

  test("Google's periods: overnight closes the next day; midnight is 24:00 the same day; 24 hours is 00:00–24:00 — and back again", () => {
    const w = week({ 1: { mode: "open", ranges: [open(540, 1080)] }, 5: { mode: "open", ranges: [open(1020, 60)] }, 6: { mode: "open", ranges: [open(600, 0)] }, 0: { mode: "open24" } });
    const periods = weekToGoogle(w);
    expect(periods).toEqual([
      { openDay: "SUNDAY", openTime: {}, closeDay: "SUNDAY", closeTime: { hours: 24 } },
      { openDay: "MONDAY", openTime: { hours: 9, minutes: 0 }, closeDay: "MONDAY", closeTime: { hours: 18, minutes: 0 } },
      { openDay: "FRIDAY", openTime: { hours: 17, minutes: 0 }, closeDay: "SATURDAY", closeTime: { hours: 1, minutes: 0 } },
      { openDay: "SATURDAY", openTime: { hours: 10, minutes: 0 }, closeDay: "SATURDAY", closeTime: { hours: 24 } },
    ]);
    expect(weekFromGoogle(periods)).toEqual(w);
    expect(weekFromGoogle(null)).toBeNull();
  });

  test("the website's week (saved with the hours finding) and the browser's week, rebuilt field by field", () => {
    expect(weekFromSite([{ day: 1, closed: false, open: 540, close: 1020 }, { day: 0, closed: true, open: null, close: null }])).toEqual(week({ 1: { mode: "open", ranges: [open(540, 1020)] } }));
    expect(weekInput(week({ 1: { mode: "open", ranges: [open(540, 1020)] } }))).toEqual(week({ 1: { mode: "open", ranges: [open(540, 1020)] } }));
    expect(weekInput([{ mode: "open", ranges: [{ open: "9", close: 1020 }] }, ...closedWeek().slice(1)])).toBeNull();
    expect(weekInput(closedWeek().slice(1))).toBeNull();
    expect(weekInput([{ mode: "open", ranges: Array.from({ length: 5 }, () => open(60, 120)) }, ...closedWeek().slice(1)])).toBeNull();
  });
});

describe("phone: a real US number", () => {
  test("formats real numbers; refuses N11 codes, 555-01xx, too few digits, letters", () => {
    expect(usPhone("302-555-2368")).toBe("(302) 555-2368");
    expect(usPhone("+1 (954) 441-3833")).toBe("(954) 441-3833");
    expect(usPhone("1 954 441 3833")).toBe("(954) 441-3833");
    for (const bad of ["411-555-2368", "302-911-2368", "302-555-0123", "102-555-2368", "302-155-2368", "555-2368", "302-555-23688", "302-FLOWERS", ""]) expect(usPhone(bad), bad).toBeNull();
    expect(samePhone("+1 954-441-3833", "(954) 441-3833")).toBe(true);
    expect(samePhone("(954) 441-3833", "(954) 441-3834")).toBe(false);
  });
});

describe("description: Google's rules", () => {
  test("a plain, honest description passes", () => {
    expect(descriptionProblems("Hair express is a family hair salon on Broadway in Newark, offering cuts, color and blowouts for the whole family.")).toEqual([]);
    expect(descriptionProblems("Salón de belleza familiar en Newark. Ofrecemos cortes, color y peinados para toda la familia.")).toEqual([]);
  });

  test("links, phone numbers, prices and promotions, ALL CAPS, too long, empty", () => {
    expect(descriptionProblems("Book at www.hairexpress.com today")).toContain("link");
    expect(descriptionProblems("Visit hairexpress.com")).toContain("link");
    expect(descriptionProblems("Call us at (302) 555-2368")).toContain("phone");
    expect(descriptionProblems("Cuts from $25")).toContain("price");
    expect(descriptionProblems("20% off your first visit")).toContain("price");
    expect(descriptionProblems("Big sale this month")).toContain("price");
    expect(descriptionProblems("Oferta especial para clientes nuevos")).toContain("price");
    expect(descriptionProblems("THE BEST SALON IN TOWN FOR CUTS")).toContain("caps");
    expect(descriptionProblems("x".repeat(751))).toContain("too_long");
    expect(descriptionProblems("   ")).toEqual(["empty"]);
  });
});

describe("an edit: the previous value saved first, one patch, then read back", () => {
  test("accepted: read → save before → after as “sending” → PATCH (that field only) → getGoogleUpdated → read back → sent; logged without values", async () => {
    const before = await readLiveProfile(PRACTICE, practiceProfileFetch("b1"));
    expect(before.ok && before.data.description.value).toMatch(/^A neighborhood practice listing/);
    db.events.length = 0;
    const text = "A family hair salon on Broadway offering cuts, color and blowouts.";
    const out = await applyProfileEdit(PRACTICE, { field: "description", value: text }, store(), { fetchImpl: recorded(), practice: true });
    expect(out).toMatchObject({ status: "updated", value: { field: "description", value: text } });
    expect(db.events).toEqual(["GET locations/practice", "save:sending", "PATCH locations/practice?profile", "GET locations/practice:getGoogleUpdated", "GET locations/practice"]);
    expect(db.changes).toEqual([
      expect.objectContaining({ business_id: "b1", kind: "profile_info_practice", field: "description", before_value: expect.stringMatching(/^A neighborhood practice listing/), after_value: text, approved_by: "owner-1", location_name: PRACTICE_PROFILE_LOCATION, status: "sent" }),
    ]);
    expect(db.log).toEqual([{ business_id: "b1", user_id: "owner-1", field: "description", action: "edit", outcome: "ok", practice: true, error_reason: null }]);
    expect(JSON.stringify(db.log)).not.toMatch(/salon|neighborhood/i);
    expect(networkCalls).toEqual([]);
  });

  test("the phone: the additional phones are sent back exactly as Google has them", async () => {
    let body: Record<string, unknown> | null = null;
    const f = practiceProfileFetch("b1");
    const spy = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") body = JSON.parse(String(init.body));
      return f(input, init);
    }) as typeof fetch;
    expect((await applyProfileEdit(PRACTICE, { field: "phone", value: "(302) 555-2368" }, store(), { fetchImpl: spy, practice: true })).status).toBe("updated");
    expect(body).toEqual({ phoneNumbers: { primaryPhone: "(302) 555-2368", additionalPhones: ["(302) 555-0143"] } });
  });

  test("hours: overnight Friday sent as Google's periods and read back", async () => {
    const next = week({ 1: { mode: "open", ranges: [open(540, 1020)] }, 5: { mode: "open", ranges: [open(1020, 120)] } });
    const out = await applyProfileEdit(PRACTICE, { field: "hours", value: next }, store(), { fetchImpl: practiceProfileFetch("b1"), practice: true });
    expect(out.status).toBe("updated");
    const live = await readLiveProfile(PRACTICE, practiceProfileFetch("b1"));
    expect(live.ok && live.data.hours.value).toEqual(next);
  });

  test("refused by Google: a clear reason, nothing changed, the row says failed", async () => {
    setPracticeOutcome("b1", "refuse");
    const out = await applyProfileEdit(PRACTICE, { field: "phone", value: "(302) 555-2368" }, store(), { fetchImpl: practiceProfileFetch("b1"), practice: true });
    expect(out).toMatchObject({ status: "error", error: "rejected", reason: "INVALID_ARGUMENT" });
    expect(db.changes).toMatchObject([{ status: "failed", error_reason: "INVALID_ARGUMENT" }]);
    expect(db.log).toMatchObject([{ outcome: "failed", error_reason: "INVALID_ARGUMENT" }]);
    const live = await readLiveProfile(PRACTICE, practiceProfileFetch("b1"));
    expect(live.ok && live.data.phone.value).toBe("(302) 555-0142");
  });

  test("held for review (getGoogleUpdated's pendingMask): a neutral wait, Google still shows the old value", async () => {
    setPracticeOutcome("b1", "hold");
    const out = await applyProfileEdit(PRACTICE, { field: "description", value: "A family hair salon on Broadway." }, store(), { fetchImpl: practiceProfileFetch("b1"), practice: true });
    expect(out).toMatchObject({ status: "pending_review" });
    expect(db.changes).toMatchObject([{ status: "pending_review" }]);
    expect(db.log).toMatchObject([{ outcome: "pending_review" }]);
    const live = await readLiveProfile(PRACTICE, practiceProfileFetch("b1"));
    expect(live.ok && live.data.pending).toEqual(["description"]);
    expect(live.ok && live.data.description.value).toMatch(/^A neighborhood practice listing/);
  });

  test("nothing sent when: the logs aren't set up, the previous value can't be saved, it's the same, or within a minute of the last", async () => {
    const calls: string[] = [];
    const f = practiceProfileFetch("b1");
    const spy = (async (input: RequestInfo | URL, init?: RequestInit) => (calls.push(init?.method ?? "GET"), f(input, init))) as typeof fetch;
    db.logMissing = true;
    expect(await applyProfileEdit(PRACTICE, { field: "phone", value: "(302) 555-2368" }, store(), { fetchImpl: spy, practice: true })).toEqual({ status: "error", error: "not_set_up" });
    db.logMissing = false;
    db.changesMissing = true;
    expect(await applyProfileEdit(PRACTICE, { field: "phone", value: "(302) 555-2368" }, store(), { fetchImpl: spy, practice: true })).toEqual({ status: "error", error: "not_set_up" });
    expect(calls).toEqual([]);
    db.changesMissing = false;
    db.failInsert = true;
    expect(await applyProfileEdit(PRACTICE, { field: "phone", value: "(302) 555-2368" }, store(), { fetchImpl: spy, practice: true })).toEqual({ status: "error", error: "not_set_up" });
    expect(calls).toEqual(["GET"]);
    db.failInsert = false;
    expect(await applyProfileEdit(PRACTICE, { field: "phone", value: "302.555.0142" }, store(), { fetchImpl: spy, practice: true })).toEqual({ status: "no_change" });
    expect(calls).not.toContain("PATCH");
    // One approval a minute (the shared Google edit limit).
    db.changes.push({ business_id: "b1", batch_id: "x", approved_at: new Date().toISOString(), status: "sent" });
    expect(await applyProfileEdit(PRACTICE, { field: "phone", value: "(302) 555-2368" }, store(), { fetchImpl: spy, practice: true })).toEqual({ status: "error", error: "wait_minute" });
    expect(calls).not.toContain("PATCH");
  });
});

describe("undo: the previous value saved before every edit", () => {
  test("after an edit, Undo puts Google's previous value back (and can't be undone twice)", async () => {
    const t0 = Date.now() - 120_000;
    const edited = await applyProfileEdit(PRACTICE, { field: "phone", value: "(302) 555-2368" }, store(), { fetchImpl: practiceProfileFetch("b1"), practice: true, now: t0 });
    expect(edited.status).toBe("updated");
    const undo = await getProfileUndo(store(), "b1", PRACTICE_PROFILE_LOCATION, "phone", true);
    expect(undo).toMatchObject({ field: "phone", status: "sent", before: { value: "(302) 555-0142" }, after: { value: "(302) 555-2368" } });
    // Undo is never held back by the one-a-minute limit.
    const out = await undoProfileEdit(PRACTICE, "phone", undo!.batchId, store(), { fetchImpl: practiceProfileFetch("b1"), practice: true });
    expect(out.status).toBe("updated");
    const live = await readLiveProfile(PRACTICE, practiceProfileFetch("b1"));
    expect(live.ok && live.data.phone.value).toBe("(302) 555-0142");
    expect(db.changes.find((r) => r.undo_of === undo!.batchId)).toMatchObject({ before_value: "(302) 555-2368", after_value: "(302) 555-0142", status: "sent" });
    expect(db.log.map((r) => r.action)).toEqual(["edit", "undo"]);
    expect(await getProfileUndo(store(), "b1", PRACTICE_PROFILE_LOCATION, "phone", true)).toBeNull();
  });

  test("never over a newer change made on Google since", async () => {
    await applyProfileEdit(PRACTICE, { field: "phone", value: "(302) 555-2368" }, store(), { fetchImpl: practiceProfileFetch("b1"), practice: true, now: Date.now() - 120_000 });
    const undo = await getProfileUndo(store(), "b1", PRACTICE_PROFILE_LOCATION, "phone", true);
    // Someone changes it on Google directly.
    await practiceProfileFetch("b1")(`https://mybusinessbusinessinformation.googleapis.com/v1/${PRACTICE_PROFILE_LOCATION}?updateMask=phoneNumbers`, { method: "PATCH", body: JSON.stringify({ phoneNumbers: { primaryPhone: "(302) 555-9999" } }) });
    expect(await undoProfileEdit(PRACTICE, "phone", undo!.batchId, store(), { fetchImpl: practiceProfileFetch("b1"), practice: true })).toEqual({ status: "error", error: "changed_since" });
  });

  test("practice rows never mix with real ones (their own kind), and real undo never sees them", async () => {
    await applyProfileEdit(PRACTICE, { field: "phone", value: "(302) 555-2368" }, store(), { fetchImpl: practiceProfileFetch("b1"), practice: true, now: Date.now() - 120_000 });
    expect(await getProfileUndo(store(), "b1", PRACTICE_PROFILE_LOCATION, "phone", false)).toBeNull();
  });
});

describe("the actions: practice mode, never in production; the live allow list", () => {
  const gate = { ok: true, admin, plan: "premium", tokens: {}, business: { id: "b1", language: "en", website: null, verified_website_url: null }, target: { businessId: "b1", userId: "owner-1", locationName: "locations/222", accessToken: "test-token", locale: "en" } };

  test("practice mode (dev): the sample listing, the website's different hours and phone offered, editing on — nothing sent to Google", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "development" });
    const view = await openProfileEdits("b1");
    expect(view).toMatchObject({ status: "ok", practice: true, canEdit: true, phone: "(302) 555-0142", fromWebsite: { phone: "(302) 555-2368" } });
    expect(view.status === "ok" && view.fromWebsite.hours).not.toBeNull();
    expect((await applyProfileEditAction("b1", "phone", "302-555-2368", "accept")).status).toBe("updated");
    expect(gbpEditGate).not.toHaveBeenCalled();
    expect(networkCalls).toEqual([]);
  });

  test("practice outcomes from the action: refuse → rejected; hold → pending_review", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "development" });
    expect(await applyProfileEditAction("b1", "description", "A family hair salon on Broadway.", "refuse")).toEqual({ status: "error", error: "rejected" });
    db.changes.length = 0;
    expect((await applyProfileEditAction("b1", "description", "A family hair salon on Broadway.", "hold")).status).toBe("pending_review");
  });

  test("production refuses practice mode even with the variable set: the real gate, never the fake Google", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "production" });
    gbpEditGate.mockResolvedValue({ ok: false, result: { status: "blocked", reason: "not_connected" } });
    expect(await openProfileEdits("b1")).toEqual({ status: "blocked", reason: "not_connected" });
    expect(await applyProfileEditAction("b1", "phone", "302-555-2368")).toEqual({ status: "blocked", reason: "not_connected" });
    expect(gbpEditGate).toHaveBeenCalledWith("b1", { requirePremium: true });
  });

  test("not on GBP_PROFILE_EDITS_LIVE_PLACES (default: none): Approve and Undo refused on the server — nothing sent", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: undefined, GBP_PROFILE_EDITS_LIVE_PLACES: undefined });
    gbpEditGate.mockResolvedValue(gate);
    expect(profileEditsAllowed("ChIJ-hair-express", {})).toBe(false);
    expect(profileEditsAllowed("ChIJ-hair-express", { GBP_PROFILE_EDITS_LIVE_PLACES: "ChIJ-a, ChIJ-hair-express" })).toBe(true);
    expect(await applyProfileEditAction("b1", "phone", "302-555-2368")).toEqual({ status: "editing_off" });
    expect(await undoProfileEditAction("b1", "phone", "batch-1")).toEqual({ status: "editing_off" });
    expect(networkCalls).toEqual([]);
    expect(db.changes).toEqual([]);
  });

  test("checked on the server before the gate: bad hours, a fake phone, a description with a link", async () => {
    expect(await applyProfileEditAction("b1", "hours", week({ 1: { mode: "open", ranges: [open(540, 780), open(720, 1020)] } }))).toEqual({ status: "invalid", hours: [{ day: 1, problem: "overlap" }] });
    expect(await applyProfileEditAction("b1", "phone", "302-555-0123")).toEqual({ status: "invalid" });
    expect(await applyProfileEditAction("b1", "description", "Visit www.hairexpress.com")).toEqual({ status: "invalid", description: ["link"] });
    expect(gbpEditGate).not.toHaveBeenCalled();
  });

  test("a successful edit never marks a recommendation done — a later scan confirms it", () => {
    for (const file of ["app/actions/gbpProfileEdits.ts", "lib/gbpProfileEdits.server.ts"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/reconcile|saveScoreSnapshot|markTaskDone|from\("tasks"\)|syncUrgentNotifications/);
    }
  });
});

describe("on the page (EN + ES)", () => {
  const view = (over: Record<string, unknown> = {}) => ({
    status: "ok" as const,
    hours: week({ 1: { mode: "open", ranges: [open(540, 1080)] }, 5: { mode: "open", ranges: [open(1020, 60)] }, 0: { mode: "open24" } }),
    phone: "(302) 555-0142",
    description: null,
    pending: [] as Array<"hours" | "phone" | "description">,
    fromWebsite: { hours: null, phone: null },
    undo: {},
    practice: false,
    canEdit: true,
    ...over,
  });
  const render = (v: ReturnType<typeof view>, locale: "en" | "es" = "en") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale} timeZone="America/New_York">
        <ProfileEditsBody businessId="b1" initial={v} />
      </LocaleProvider>
    );

  test("what Google has now: Monday first, overnight marked “next day”, 24 hours, and “Not set on Google”", () => {
    const html = render(view());
    expect(weekLines(view().hours, "en")).toEqual([
      "Monday · 9:00 AM – 6:00 PM",
      "Tuesday · Closed",
      "Wednesday · Closed",
      "Thursday · Closed",
      "Friday · 5:00 PM – 1:00 AM (next day)",
      "Saturday · Closed",
      "Sunday · Open 24 hours",
    ]);
    expect(html).toContain("(302) 555-0142");
    expect(html).toContain("Not set on Google");
    expect(weekLines(view().hours, "es")[0]).toBe("lunes · 9:00 a.m. – 6:00 p.m.");
  });

  test("practice banner with the outcome choice; read-only note; a field Google is reviewing", () => {
    const practice = render(view({ practice: true }));
    expect(practice).toContain("Practice mode — nothing is sent to Google.");
    expect(practice).toMatch(/data-testid="practice-outcome"[\s\S]*Accept it[\s\S]*Refuse it[\s\S]*Hold it for review/);
    expect(render(view({ canEdit: false }))).toContain('data-testid="profile-read-only"');
    expect(render(view())).not.toContain("profile-read-only");
    const pending = render(view({ pending: ["description"] }));
    expect(pending).toContain('data-testid="pending-description"');
    expect(pending).toContain("Google is reviewing your change — this can take a few days.");
    expect(render(view({ practice: true }), "es")).toContain("Modo de práctica: no se envía nada a Google.");
  });

  test("messages: green when Google shows it, a neutral wait for review, red only for real failures", () => {
    expect(resultMessage({ status: "updated", value: { field: "phone", value: "x" }, undo: null }, "en")).toEqual({ text: "Updated on Google ✓", tone: "done" });
    expect(resultMessage({ status: "pending_review", undo: null }, "en")).toEqual({ text: "Google is reviewing your change — this can take a few days.", tone: "waiting" });
    expect(resultMessage({ status: "error", error: "rejected" }, "en")).toEqual({ text: "Google didn't accept this change, so nothing changed. Check it and try again, or edit it on Google Maps.", tone: "failure" });
    expect(resultMessage({ status: "editing_off" }, "es").text).toBe("Editar está desactivado para este negocio");
    expect(resultMessage({ status: "error", error: "wait_minute" }, "en").text).toBe("Please wait a minute between changes.");
  });

  test("Approve says Beta and locks the same way as review replies when editing is off; holiday hours “coming later”", () => {
    const component = readFileSync("components/gbp/ProfileEditsOnGoogle.tsx", "utf8");
    expect(component).toContain('if (!canEdit) return <LockedButton label={t(locale, K("approve"))} testId={testId} />;');
    expect(component).toContain('<span data-testid="beta-label"');
    expect(component).toContain('title={tip}');
    expect(component).toContain('t(locale, K("hours.special"))');
  });
});
