import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Google API cost limits (code review Nov 7, M5 and M6). The database is
// in memory and Google's search is a mock: no test calls Google.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** places_calls (and competitor_scans), in memory. `mode`: "ok", the
 * table "missing" (development, SQL not run), or a database "error". */
type Row = { id: string; business_id: string | null; kind: string; calls: number; created_at: string };
const db = { rows: [] as Row[], scans: [] as Array<{ scan_id: string; is_subject: boolean; created_at: string }>, mode: "ok" as "ok" | "missing" | "error", nextId: 1 };
const ERR = { missing: { code: "42P01", message: 'relation "public.places_calls" does not exist' }, error: { code: "57014", message: "canceling statement due to statement timeout" } };

function query(table: string) {
  const filters: Array<(r: Record<string, unknown>) => boolean> = [];
  let op: "select" | "insert" | "delete" = "select";
  let head = false;
  let inserted: Row | null = null;
  const source = () => (table === "places_calls" ? db.rows : db.scans) as unknown as Array<Record<string, unknown>>;
  const result = () => {
    if (table === "places_calls" && db.mode !== "ok") return { data: null, count: null, error: ERR[db.mode] };
    if (op === "insert") return { data: inserted, error: null };
    const hits = source().filter((r) => filters.every((f) => f(r)));
    if (op === "delete") {
      db.rows = db.rows.filter((r) => !hits.includes(r as never));
      return { data: null, error: null };
    }
    return head ? { data: null, count: hits.length, error: null } : { data: hits, count: hits.length, error: null };
  };
  const chain: Record<string, unknown> = {
    select: (_cols?: string, opts?: { head?: boolean }) => ((head = !!opts?.head), chain),
    insert: (row: Omit<Row, "id" | "created_at">) => {
      op = "insert";
      if (db.mode === "ok") {
        inserted = { id: `r${db.nextId++}`, created_at: new Date().toISOString(), ...row } as Row;
        db.rows.push(inserted);
      }
      return chain;
    },
    delete: () => ((op = "delete"), chain),
    eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), chain),
    in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), chain),
    gte: (col: string, v: string) => (filters.push((r) => String(r[col]) >= v), chain),
    single: async () => result(),
    then: (resolve: (v: unknown) => unknown) => resolve(result()),
  };
  return chain;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: query }) }));

// The signed-in owner's own business (RLS client), for searchCompetitorToAdd.
const BIZ = { id: "biz-1", place_id: "own-place", lat: 40.81, lng: -73.95, address: "2880 Broadway, New York, NY", language: "en" };
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) },
    from: () => {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: BIZ, error: null }), then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }) });
      return chain;
    },
  }),
}));

// Google's Text Search: never called for real.
const googleSearches: string[] = [];
vi.mock("@/lib/google/places", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google/places")>("@/lib/google/places");
  return { ...actual, searchTextCompetitors: async (p: { textQuery: string }) => (googleSearches.push(p.textQuery), []) };
});

import { placesSearchCallsThisMonth, recordCompetitorNameSearch } from "@/lib/placesSearchBudget.server";
import { detailsCallAllowed, placesDetailsCallsThisMonth } from "@/lib/placesDetailsBudget.server";
import { COMPETITOR_NAME_SEARCH_KIND, COMPETITOR_SEARCHES_PER_DAY, competitorSearchAllowed, countUnreadableAllows } from "@/lib/placesSearchBudget";
import { isInteractiveDetailsKind } from "@/lib/placesDetailsBudget";
import { runAndSaveCompetitorScanWithClient } from "@/app/actions/competitors";
import { searchCompetitorToAdd } from "@/app/actions/competitorOverrides";
import { t } from "@/lib/i18n";

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  db.rows = [];
  db.scans = [];
  db.mode = "ok";
  googleSearches.length = 0;
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const logged = (kind: string, calls: number) => db.rows.push({ id: `r${db.nextId++}`, business_id: "biz-1", kind, calls, created_at: new Date().toISOString() });

describe("M5: a count that can't be read", () => {
  test("search count: a database error is “unreadable” (logged), never “0 used”", async () => {
    logged("competitor_scan", 5);
    expect(await placesSearchCallsThisMonth()).toEqual({ used: 5, estimated: false });
    db.mode = "error";
    expect(await placesSearchCallsThisMonth()).toEqual({ used: null, estimated: false, unreadable: true });
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("couldn't read this month's search count"));
  });

  test("search count: the table missing in development is unchanged — the estimate from saved scans", async () => {
    db.mode = "missing";
    db.scans = [{ scan_id: "s1", is_subject: true, created_at: new Date().toISOString() }];
    expect(await placesSearchCallsThisMonth()).toEqual({ used: 5, estimated: true });
    expect(errors).not.toHaveBeenCalled();
  });

  test("Details count: “missing” and “unreadable” are told apart", async () => {
    logged("owner_rescan", 3);
    expect(await placesDetailsCallsThisMonth()).toBe(3);
    db.mode = "missing";
    expect(await placesDetailsCallsThisMonth()).toBe("missing");
    db.mode = "error";
    expect(await placesDetailsCallsThisMonth()).toBe("unreadable");
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("couldn't read this month's Details count"));
  });

  test("Details, unreadable: the monthly job, rescan-all and scripts are blocked; one owner re-scan still runs", async () => {
    db.mode = "error";
    for (const kind of ["monthly", "rescan_all", "rescan", "dry_run", "website_only"] as const) expect(await detailsCallAllowed(kind)).toBe(false);
    expect(await detailsCallAllowed("owner_rescan")).toBe(true);
    expect(await detailsCallAllowed("competitor_added")).toBe(true);
    // Never blocked (free SKU).
    expect(await detailsCallAllowed("photos")).toBe(true);
    // A re-scan's second look follows the re-scan it belongs to.
    expect(await detailsCallAllowed("website_retry", { interactive: true })).toBe(true);
    expect(await detailsCallAllowed("website_retry", { interactive: false })).toBe(false);
    expect(await detailsCallAllowed("website_retry")).toBe(false);
  });

  test("Details, table missing (development): every call still allowed, as before", async () => {
    db.mode = "missing";
    for (const kind of ["monthly", "rescan_all", "owner_rescan", "website_retry"] as const) expect(await detailsCallAllowed(kind)).toBe(true);
  });

  test("Details, readable: the cap decides, as before", async () => {
    vi.stubEnv("PLACES_DETAILS_MONTHLY_CAP", "2");
    logged("monthly", 2);
    expect(await detailsCallAllowed("owner_rescan")).toBe(false);
    expect(await detailsCallAllowed("photos")).toBe(true);
    vi.unstubAllEnvs();
  });

  test("pure: only interactive callers run blind", () => {
    expect(countUnreadableAllows(true)).toBe(true);
    expect(countUnreadableAllows(false)).toBe(false);
    expect(isInteractiveDetailsKind("owner_rescan")).toBe(true);
    expect(isInteractiveDetailsKind("monthly")).toBe(false);
  });

  // Enough of a client for the scan's first checks (not archived, no business row).
  const client = {
    from: () => {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: { message: "no row" } }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
      });
      return chain;
    },
  } as unknown as SupabaseClient;

  test("competitor scans, unreadable: a batch scan (monthly job, rescan-all) is skipped before any search", async () => {
    const scan = vi.fn();
    const r = await runAndSaveCompetitorScanWithClient(client, "biz-1", { enforceCooldown: false, budget: async () => ({ used: null, unreadable: true }), scan: scan as never, logCalls: async () => undefined });
    expect(r).toMatchObject({ status: "error", message: expect.stringContaining("couldn't be read") });
    expect(scan).not.toHaveBeenCalled();
    // A count that throws is the same.
    const thrown = await runAndSaveCompetitorScanWithClient(client, "biz-1", { enforceCooldown: false, budget: async () => Promise.reject(new Error("db down")), scan: scan as never, logCalls: async () => undefined });
    expect(thrown.status).toBe("error");
  });

  test("competitor scans, unreadable: the owner's own scan goes on past the budget check", async () => {
    const r = await runAndSaveCompetitorScanWithClient(client, "biz-1", { enforceCooldown: false, interactive: true, budget: async () => ({ used: null, unreadable: true }), logCalls: async () => undefined });
    // Past the budget: it stops at loading the business (the stub has none).
    expect(r.status).not.toBe("error");
    expect(r.status).not.toBe("capped");
  });

  test("competitor scans, readable: the cap decides, interactive or not", async () => {
    const r = await runAndSaveCompetitorScanWithClient(client, "biz-1", { enforceCooldown: false, interactive: true, now: new Date("2026-11-08T12:00:00Z"), budget: async () => ({ used: 800 }), logCalls: async () => undefined });
    expect(r).toEqual({ status: "capped", nextAvailableAt: "2026-12-01T00:00:00.000Z" });
  });

  test("the owner's name search still runs once when the count can't be read", async () => {
    db.mode = "error";
    expect(await searchCompetitorToAdd("biz-1", "Hair Salon")).toEqual({ status: "ok", hits: [] });
    expect(googleSearches).toEqual(["Hair Salon"]);
  });
});

describe("M6: 10 competitor name searches per business per day", () => {
  test("the 11th search is refused before Google is called, with a friendly message (EN + ES)", async () => {
    for (let i = 0; i < COMPETITOR_SEARCHES_PER_DAY; i++) expect((await searchCompetitorToAdd("biz-1", `Salon ${i}`)).status).toBe("ok");
    expect(googleSearches).toHaveLength(10);
    expect(await searchCompetitorToAdd("biz-1", "Salon 11")).toEqual({ status: "daily_limit" });
    expect(googleSearches).toHaveLength(10);
    expect(t("en", "dashboard.competitors.owner.dailyLimit")).toBe("You've reached today's competitor search limit — try again tomorrow.");
    expect(t("es", "dashboard.competitors.owner.dailyLimit")).toBe("Ya alcanzó el límite de búsquedas de competidores de hoy. Inténtelo de nuevo mañana.");
  });

  test("rapid repeated submits can't slip past: each search is counted before Google answers", async () => {
    const results = await Promise.all(Array.from({ length: 15 }, (_, i) => searchCompetitorToAdd("biz-1", `Rapid ${i}`)));
    expect(results.filter((r) => r.status === "ok").length).toBeLessThanOrEqual(10);
    expect(googleSearches.length).toBeLessThanOrEqual(10);
  });

  test("a refused search doesn't count; another business has its own 10", async () => {
    for (let i = 0; i < 10; i++) await searchCompetitorToAdd("biz-1", `Salon ${i}`);
    await searchCompetitorToAdd("biz-1", "one more");
    await searchCompetitorToAdd("biz-1", "and another");
    expect(db.rows.filter((r) => r.kind === COMPETITOR_NAME_SEARCH_KIND)).toHaveLength(10);
    expect((await recordCompetitorNameSearch("biz-2"))?.count).toBe(1);
  });

  test("searches older than 24 hours don't count", async () => {
    for (let i = 0; i < 10; i++) db.rows.push({ id: `old${i}`, business_id: "biz-1", kind: COMPETITOR_NAME_SEARCH_KIND, calls: 0, created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });
    expect((await searchCompetitorToAdd("biz-1", "Salon")).status).toBe("ok");
  });

  test("the marks are 0-call rows: they never count against the monthly search cap", async () => {
    await searchCompetitorToAdd("biz-1", "Salon");
    // The Text Search itself is logged once as a competitor_scan call.
    expect(await placesSearchCallsThisMonth()).toEqual({ used: 1, estimated: false });
  });

  test("pure: up to 10 including this one; uncountable → the monthly cap still holds", () => {
    expect(competitorSearchAllowed(10)).toBe(true);
    expect(competitorSearchAllowed(11)).toBe(false);
    expect(competitorSearchAllowed(null)).toBe(true);
  });
});
