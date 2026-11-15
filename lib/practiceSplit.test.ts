import { describe, expect, test, vi } from "vitest";

// Practice vs real: "Made from PostScore" shows only real changes when
// practice mode is off, only practice ones (tagged) when it's on; a real
// change stuck on "Google reviewing" for 3+ days is read again; and
// "Changes by anyone else" always uses the real Google data.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const h = vi.hoisted(() => ({ practice: true, checkCalls: [] as unknown[] }));
vi.mock("@/lib/gbpWriteContext.server", () => ({
  googleWriteContext: async () => ({ ok: true, admin: {}, target: { businessId: "b1", userId: "u1", locationName: "locations/practice", accessToken: "practice-token", locale: "en" }, practice: h.practice, canEdit: true, fetchImpl: vi.fn(), business: {}, markReconnect: vi.fn() }),
}));
vi.mock("@/lib/gbpProfilePractice.server", () => ({ setPracticeOutcome: vi.fn(), isPracticeOutcome: () => false }));
vi.mock("@/lib/gbpRealListing.server", () => ({ forgetRealListing: vi.fn() }));

import { isPracticeRow, madeFromPostScore, REJECTED_BY_GOOGLE, type ChangeRow } from "@/lib/googleProfileTab";
import { staleOutcome, staleRows } from "@/lib/gbpStaleChanges.server";

const NOW = Date.parse("2026-11-15T12:00:00Z");
const row = (over: Partial<ChangeRow>): ChangeRow => ({ batch_id: "x", kind: "website_uri", field: "websiteUri", status: "sent", approved_at: "2026-11-12T12:00:00Z", undone_at: null, undo_closed_at: null, undo_of: null, ...over });

// Hair Express's rows, as stored (Nov 4 real customer details; the rest practice).
const HAIR_EXPRESS: ChangeRow[] = [
  row({ batch_id: "real", kind: "attributes", field: "attributes/has_parking_lot_paid", approved_at: "2026-11-04T04:36:27Z", undone_at: "2026-11-04T05:00:20Z", location_name: "locations/15510298593847876242" }),
  row({ batch_id: "p-phone", kind: "profile_info_practice", field: "phone", status: "failed", approved_at: "2026-11-10T17:24:30Z", location_name: "locations/practice", after_value: "(302) 555-2368" }),
  row({ batch_id: "p-desc", kind: "profile_info_practice", field: "description", status: "pending_review", approved_at: "2026-11-10T17:26:44Z", location_name: "locations/practice" }),
  row({ batch_id: "p-site", kind: "website_uri_practice", approved_at: "2026-11-11T16:12:24Z", location_name: "locations/practice", after_value: "https://www.udel.edu/" }),
];

describe("practice vs real", () => {
  test("a row is practice by its flag, its kind or the practice listing", () => {
    expect(isPracticeRow({ kind: "website_uri", practice: true })).toBe(true);
    expect(isPracticeRow({ kind: "website_uri_practice" })).toBe(true);
    expect(isPracticeRow({ kind: "website_uri", location_name: "locations/practice" })).toBe(true);
    expect(isPracticeRow({ kind: "website_uri", practice: false, location_name: "locations/1" })).toBe(false);
  });

  test("practice mode OFF: only the real change (no udel.edu, no fake phone, no stuck description)", () => {
    const made = madeFromPostScore(HAIR_EXPRESS, NOW, false);
    expect(made.map((m) => [m.kind, m.status, m.practice ?? false])).toEqual([["customer_details", "undone", false]]);
  });

  test("practice mode ON: only practice changes, each tagged; never \"Google reviewing\"", () => {
    const made = madeFromPostScore(HAIR_EXPRESS, NOW, true);
    expect(made.map((m) => [m.kind, m.status, m.practice])).toEqual([
      ["website_link", "undo", true],
      ["description", "held", true],
      ["phone", "failed", true],
    ]);
    expect(made.some((m) => m.status === "reviewing")).toBe(false);
  });

  test("a held change Google later turned down: \"Google rejected it\"", () => {
    expect(madeFromPostScore([row({ status: "failed", error_reason: REJECTED_BY_GOOGLE })], NOW, false)[0].status).toBe("rejected");
  });
});

describe("stale \"Google reviewing\" (real only, 3+ days)", () => {
  const pending = (over: Partial<ChangeRow>) => row({ status: "pending_review", approved_at: "2026-11-10T12:00:00Z", ...over });

  test("which rows are re-read", () => {
    const rows = [
      pending({ batch_id: "old-real", kind: "profile_info", field: "description" }),
      pending({ batch_id: "new-real", kind: "profile_info", field: "description", approved_at: "2026-11-14T12:00:00Z" }),
      pending({ batch_id: "practice", kind: "profile_info_practice", field: "description", location_name: "locations/practice" }),
      pending({ batch_id: "details", kind: "attributes", field: "attributes/x" }),
    ];
    expect(staleRows(rows, NOW).map((r) => r.batch_id)).toEqual(["old-real"]);
  });

  test("still pending → unchanged; Google shows it → Live; something else → rejected", () => {
    const desc = pending({ kind: "profile_info", field: "description", after_value: "Hair Express on Broadway: color, balayage and keratin in Tarrytown." });
    expect(staleOutcome(desc, {}, "profile.description")).toBeNull();
    expect(staleOutcome(desc, { profile: { description: "Hair Express on Broadway: color, balayage and keratin in Tarrytown." } }, "")).toEqual({ status: "sent", error_reason: null });
    expect(staleOutcome(desc, { profile: { description: "Hair salon" } }, "")).toEqual({ status: "failed", error_reason: REJECTED_BY_GOOGLE });
    const site = pending({ kind: "website_uri", field: "websiteUri", after_value: "https://hairexpressonbroadway.com" });
    expect(staleOutcome(site, { websiteUri: "https://hairexpressonbroadway.com/" }, "")).toEqual({ status: "sent", error_reason: null });
  });
});

describe("Changes by anyone else in practice mode", () => {
  test("Check now reads the REAL listing, never the practice copy", async () => {
    h.practice = true;
    vi.doMock("@/lib/gbpGoogleEdits.server", () => ({
      checkGoogleEdits: async (_a: unknown, _b: string, options: unknown) => {
        h.checkCalls.push(options);
        return { status: "ok", open: [], checkedAt: "2026-11-15T12:00:00Z" };
      },
    }));
    const { checkGoogleEditsNow } = await import("@/app/actions/gbpGoogleEdits");
    await checkGoogleEditsNow("b1");
    expect(h.checkCalls).toEqual([{ rateLimited: true }]);
  });

  test("the tab loads the real rows (practice = false) even in practice mode", async () => {
    const asked: Array<[string, unknown]> = [];
    const q = (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ["select", "gte", "lt", "order", "limit", "in", "not", "is"]) chain[m] = self;
      chain.eq = (c: string, v: unknown) => {
        if (table === "gbp_google_edits") asked.push([c, v]);
        return chain;
      };
      chain.maybeSingle = async () => ({ data: null, error: null });
      chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
      return chain;
    };
    vi.resetModules();
    vi.doUnmock("@/lib/gbpGoogleEdits.server");
    const { loadGoogleTabSaved } = await import("@/lib/googleProfileTab.server");
    await loadGoogleTabSaved({ from: q } as never, "b1", { timeZone: "America/New_York", practice: true, businessStatus: "OPERATIONAL" });
    expect(asked.filter(([c]) => c === "practice").map(([, v]) => v)).toEqual([false, false]);
  });
});
