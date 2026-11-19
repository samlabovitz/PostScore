import { describe, expect, test, vi } from "vitest";

// Section 6 "Changes by anyone else": Google's own edits (getGoogleUpdated
// diffMask) kept as short old → new text, one open row per field, an
// Overview notification each, "Check now" at most every 10 minutes, and
// "Keep Google's version" / "Change it back" (allowed and read-only).

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/gbpTokens.server", () => ({
  getValidAccessTokenWithClient: async () => ({ status: "ok", accessToken: "tok" }),
  markGbpReconnect: async () => ({ status: "ok" }),
}));

import { canChangeBack, checkNowAllowed, decodeWeek, fieldsInMask, googleEditsFrom, hoursText, syncGoogleEdits, type GoogleEditRow } from "@/lib/gbpGoogleEdits";
import { notificationView } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// A tiny in-memory Supabase: just the query shapes these modules use.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  let n = 0;
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: Array<(r: Row) => boolean> = [];
    let op: { kind: "select" } | { kind: "update"; values: Row } = { kind: "select" };
    let lim = Infinity;
    const matching = () => rows.filter((r) => filters.every((f) => f(r)));
    const run = () => {
      if (op.kind === "update") {
        for (const r of matching()) Object.assign(r, (op as { values: Row }).values);
        return { data: null, error: null };
      }
      return { data: matching().slice(0, lim), error: null };
    };
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      or: (expr: string) => (expr.includes("resolution.eq.kept") && filters.push((r) => (r.resolved_at ?? null) === null || r.resolution === "kept"), q),
      order: () => q,
      limit: (k: number) => ((lim = k), q),
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      update: (values: Row) => ((op = { kind: "update", values }), q),
      insert: async (row: Row) => {
        rows.push({ id: `id${++n}`, resolved_at: null, resolution: null, ...row });
        return { error: null };
      },
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

const OWNER = {
  title: "Hair express on Broadway",
  phoneNumbers: { primaryPhone: "(914) 320-3012" },
  websiteUri: "https://hairexpress.example",
  regularHours: { periods: [{ openDay: "MONDAY", openTime: { hours: 9 }, closeDay: "MONDAY", closeTime: { hours: 18 } }] },
};
const GOOGLE = { ...OWNER, phoneNumbers: { primaryPhone: "(914) 555-0100" }, regularHours: { periods: [{ openDay: "MONDAY", openTime: { hours: 10 }, closeDay: "MONDAY", closeTime: { hours: 18 } }] } };

function googleFetch(diffMask: string, calls: string[] = []) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const body = url.includes(":getGoogleUpdated") ? { location: GOOGLE, diffMask, pendingMask: "" } : OWNER;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

const connected = (extra: Row = {}) => ({ business_id: "b1", status: "connected", google_location_id: "locations/1", google_edits_checked_at: null, ...extra });

// ---------------------------------------------------------------------------

describe("diffMask → changed fields", () => {
  test("names map to fields, sub-fields included, unknown ones ignored", () => {
    expect(fieldsInMask("phoneNumbers.primaryPhone,regularHours,metadata.foo")).toEqual(["phone", "hours"]);
    expect(fieldsInMask("")).toEqual([]);
  });

  test("hours read as one short line, consecutive same days joined", () => {
    const p = (d: string) => ({ openDay: d, openTime: { hours: 9 }, closeDay: d, closeTime: { hours: 18 } });
    expect(hoursText(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map(p))).toBe("Mon–Fri 9 AM–6 PM, Sat–Sun closed");
    expect(hoursText(["MONDAY"].map(p), "es")).toBe("lun 9:00–18:00, mar–dom cerrado");
  });

  test("old → new values; a mask entry with the same text isn't a change", () => {
    expect(googleEditsFrom("phoneNumbers,regularHours,title", OWNER, GOOGLE)).toEqual([
      { field: "phone", ownerValue: "(914) 320-3012", googleValue: "(914) 555-0100" },
      { field: "hours", ownerValue: "0|540-1080\n1|c\n2|c\n3|c\n4|c\n5|c\n6|c", googleValue: "0|600-1080\n1|c\n2|c\n3|c\n4|c\n5|c\n6|c" },
    ]);
  });

  test("open rows: created, updated in place, closed when gone; a kept one stays quiet", () => {
    const open: GoogleEditRow[] = [
      { id: "a", field: "phone", owner_value: "1", google_value: "2", detected_at: "x", resolved_at: null, resolution: null },
      { id: "b", field: "website", owner_value: "u", google_value: "v", detected_at: "x", resolved_at: null, resolution: null },
    ];
    const kept: GoogleEditRow[] = [{ id: "k", field: "title", owner_value: "A", google_value: "B", detected_at: "x", resolved_at: "y", resolution: "kept" }];
    const plan = syncGoogleEdits(open, [
      { field: "phone", ownerValue: "1", googleValue: "3" },
      { field: "title", ownerValue: "A", googleValue: "B" },
      { field: "hours", ownerValue: "h1", googleValue: "h2" },
    ], kept);
    expect(plan.create.map((e) => e.field)).toEqual(["hours"]);
    expect(plan.update).toEqual([{ id: "a", edit: { field: "phone", ownerValue: "1", googleValue: "3" } }]);
    expect(plan.gone).toEqual(["b"]);
    // Google changes the kept name again → flagged again.
    expect(syncGoogleEdits([], [{ field: "title", ownerValue: "A", googleValue: "C" }], kept).create).toHaveLength(1);
  });

  test("hours are kept per day and read back", () => {
    expect(decodeWeek("0|540-1080\n1|c")).toEqual([
      { day: 0, ranges: [[540, 1080]] },
      { day: 1, ranges: [] },
    ]);
    expect(decodeWeek("Mon 9 AM–6 PM")).toBeNull();
  });

  test("only phone, hours and website can be changed back from PostScore", () => {
    expect(["phone", "hours", "website"].every((f) => canChangeBack(f as never))).toBe(true);
    expect(["title", "address", "categories", "description"].some((f) => canChangeBack(f as never))).toBe(false);
  });

  test("the Overview notification links to the row", () => {
    expect(notificationView({ type: "google", key: "edit_phone", payload: {}, business_id: "b1" })).toEqual({
      message: "dashboard.notifications.google.edit.phone",
      fixLabel: "dashboard.notifications.google.review",
      fixHref: "/business/b1/growth?tab=google#others",
    });
    expect(notificationView({ type: "google", key: "edit_nonsense", payload: {}, business_id: "b1" })).toBeNull();
  });
});

describe("checkGoogleEdits", () => {
  test("stores only the changed fields + values, opens one notification each, and closes them when Google stops", async () => {
    const { checkGoogleEdits } = await import("@/lib/gbpGoogleEdits.server");
    const tables: Record<string, Row[]> = { gbp_connections: [connected()], gbp_google_edits: [], notifications: [] };
    const db = fakeDb(tables);
    const calls: string[] = [];
    const r = await checkGoogleEdits(db, "b1", { fetchImpl: googleFetch("phoneNumbers.primaryPhone", calls), now: new Date("2026-11-15T12:00:00Z") });
    expect(r.status).toBe("ok");
    expect(calls.some((u) => u.includes("locations/1:getGoogleUpdated"))).toBe(true);
    expect(tables.gbp_google_edits).toHaveLength(1);
    expect(tables.gbp_google_edits[0]).toMatchObject({ field: "phone", owner_value: "(914) 320-3012", google_value: "(914) 555-0100", practice: false });
    expect(tables.notifications).toEqual([expect.objectContaining({ type: "google", key: "edit_phone", severity: "high" })]);
    expect(tables.gbp_connections[0].google_edits_checked_at).toBe("2026-11-15T12:00:00.000Z");

    // Same edit next time: no duplicate row or notification.
    await checkGoogleEdits(db, "b1", { fetchImpl: googleFetch("phoneNumbers"), now: new Date("2026-11-16T12:00:00Z") });
    expect(tables.gbp_google_edits).toHaveLength(1);
    expect(tables.notifications).toHaveLength(1);

    // Google no longer shows a different phone: closed as "gone".
    const after = await checkGoogleEdits(db, "b1", { fetchImpl: googleFetch(""), now: new Date("2026-11-17T12:00:00Z") });
    expect(after.status === "ok" && after.open).toEqual([]);
    expect(tables.gbp_google_edits[0]).toMatchObject({ resolution: "gone" });
    expect(tables.notifications[0].resolved_at).toBe("2026-11-17T12:00:00.000Z");
  });

  test("Google filled in the website the owner left empty, matching our scan: stored (info only), no notification", async () => {
    const { checkGoogleEdits } = await import("@/lib/gbpGoogleEdits.server");
    const tables: Record<string, Row[]> = { gbp_connections: [connected()], gbp_google_edits: [], notifications: [], businesses: [{ id: "b1", place_id: "p1", listing_mode: "google" }] };
    // "Our scan": the listing as this visit read it (Day 23 2d-5 — never the saved columns).
    const { rememberOwnerListing, forgetOwnerListing } = await import("@/lib/ownerListing.server");
    const { emptyListingColumns } = await import("@/lib/listingScoringRow");
    rememberOwnerListing("b1", { status: "ok", source: "business_profile", values: { rating: null, reviewCount: null, phone: null, website: "https://www.hairexpress.example/", openingHours: null, openingHoursPeriods: null, businessStatus: null, photoCount: null, googleMapsUri: null }, columns: { ...emptyListingColumns(), website: "https://www.hairexpress.example/" } });
    const f = (async (input: RequestInfo | URL) => {
      const url = String(input);
      const owner = { ...OWNER, websiteUri: undefined };
      const body = url.includes(":getGoogleUpdated") ? { location: { ...owner, websiteUri: "https://www.hairexpress.example/" }, diffMask: "websiteUri" } : owner;
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    await checkGoogleEdits(fakeDb(tables), "b1", { fetchImpl: f });
    expect(tables.gbp_google_edits).toEqual([expect.objectContaining({ field: "website", owner_value: null })]);
    expect(tables.notifications).toEqual([]);
    forgetOwnerListing("b1");
  });

  test("none changed: nothing stored", async () => {
    const { checkGoogleEdits } = await import("@/lib/gbpGoogleEdits.server");
    const tables: Record<string, Row[]> = { gbp_connections: [connected()], gbp_google_edits: [], notifications: [] };
    const r = await checkGoogleEdits(fakeDb(tables), "b1", { fetchImpl: googleFetch("") });
    expect(r.status === "ok" && r.open).toEqual([]);
    expect(tables.gbp_google_edits).toEqual([]);
  });

  test("Check now: refused within 10 minutes, no Google call", async () => {
    const { checkGoogleEdits } = await import("@/lib/gbpGoogleEdits.server");
    const now = new Date("2026-11-15T12:00:00Z");
    expect(checkNowAllowed("2026-11-15T11:51:00Z", now.getTime())).toBe(false);
    expect(checkNowAllowed("2026-11-15T11:50:00Z", now.getTime())).toBe(true);
    const calls: string[] = [];
    const tables: Record<string, Row[]> = { gbp_connections: [connected({ google_edits_checked_at: "2026-11-15T11:55:00Z" })], gbp_google_edits: [] };
    const r = await checkGoogleEdits(fakeDb(tables), "b1", { fetchImpl: googleFetch("phoneNumbers", calls), now, rateLimited: true });
    expect(r).toEqual({ status: "too_soon", checkedAt: "2026-11-15T11:55:00Z" });
    expect(calls).toEqual([]);
  });

  test("a failed read changes nothing", async () => {
    const { checkGoogleEdits } = await import("@/lib/gbpGoogleEdits.server");
    const tables: Record<string, Row[]> = { gbp_connections: [connected()], gbp_google_edits: [], notifications: [] };
    const fail = (async () => new Response("{}", { status: 500 })) as typeof fetch;
    expect((await checkGoogleEdits(fakeDb(tables), "b1", { fetchImpl: fail })).status).toBe("failed");
    expect(tables.gbp_connections[0].google_edits_checked_at).toBeNull();
  });
});
