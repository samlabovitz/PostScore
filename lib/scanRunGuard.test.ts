/* eslint-disable @typescript-eslint/no-explicit-any -- an in-memory stand-in for the Supabase query builder */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { firstScanRun, SCAN_RUN_KIND, SCAN_RUN_WINDOW_MS } from "./scanRunGuard";
import { claimScanRun } from "./scanRunGuard.server";
import { t } from "./i18n/messages";

/** places_calls in memory; `failInsert` simulates an unreadable table. */
function fakeDb(opts: { failInsert?: boolean } = {}) {
  const rows: Array<{ id: string; business_id: string; kind: string; calls: number; created_at: string }> = [];
  let n = 0;
  let clock = Date.parse("2026-11-18T16:04:22Z");
  const db = {
    from: () => ({
      insert: (row: any) => ({
        select: () => ({
          single: async () => {
            if (opts.failInsert) return { data: null, error: { message: "down" } };
            const r = { ...row, id: `m${++n}`, created_at: new Date(clock++).toISOString() };
            rows.push(r);
            return { data: { id: r.id }, error: null };
          },
        }),
      }),
      select: () => {
        const f: Array<(r: any) => boolean> = [];
        const chain: any = {
          eq: (k: string, v: unknown) => (f.push((r) => r[k] === v), chain),
          gte: (k: string, v: string) => (f.push((r) => r[k] >= v), chain),
          then: (resolve: any) => resolve({ data: rows.filter((r) => f.every((p) => p(r))).map((r) => ({ id: r.id, created_at: r.created_at })), error: null }),
        };
        return chain;
      },
      delete: () => ({ eq: async (_k: string, id: string) => void rows.splice(rows.findIndex((r) => r.id === id), 1) }),
    }),
  };
  return { db: db as unknown as SupabaseClient, rows };
}
const NOW = new Date("2026-11-18T16:05:00Z");

describe("one scan run at a time per business (the real Kee's case: two re-scans 28 s apart)", () => {
  test("the earliest marker runs; ties go by id", () => {
    expect(firstScanRun([{ id: "b", created_at: "2026-11-18T16:04:50Z" }, { id: "a", created_at: "2026-11-18T16:04:22Z" }])).toBe("a");
    expect(firstScanRun([{ id: "z", created_at: "2026-11-18T16:04:22Z" }, { id: "y", created_at: "2026-11-18T16:04:22Z" }])).toBe("y");
    expect(firstScanRun([])).toBeNull();
    expect(SCAN_RUN_KIND).toBe("scan_run");
    expect(SCAN_RUN_WINDOW_MS).toBe(5 * 60 * 1000);
  });

  test("a second request while the first is running is ignored and leaves no marker; after the run, the next one goes ahead", async () => {
    const { db, rows } = fakeDb();
    const first = await claimScanRun("kees", { db, now: NOW });
    const second = await claimScanRun("kees", { db, now: NOW });
    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(false);
    expect(rows).toHaveLength(1);
    await first.release();
    expect(rows).toHaveLength(0);
    expect((await claimScanRun("kees", { db, now: NOW })).claimed).toBe(true);
  });

  test("another business is never blocked", async () => {
    const { db } = fakeDb();
    expect((await claimScanRun("kees", { db, now: NOW })).claimed).toBe(true);
    expect((await claimScanRun("clay", { db, now: NOW })).claimed).toBe(true);
  });

  test("the marker can't be written: the owner isn't blocked (the plan's own limits still apply)", async () => {
    const { db } = fakeDb({ failInsert: true });
    expect((await claimScanRun("kees", { db, now: NOW })).claimed).toBe(true);
  });

  test("'Re-scan now' and 'Refresh competitors' both claim the run before any work, and release it after", () => {
    const scoring = readFileSync("app/actions/scoring.ts", "utf8");
    const competitors = readFileSync("app/actions/competitors.ts", "utf8");
    for (const [src, fn] of [[scoring, "rescanClaimed"], [competitors, "refreshClaimed"]] as const) {
      expect(src).toContain('const run = await claimScanRun(businessId);\n  if (!run.claimed) return { status: "in_progress" };');
      expect(src).toContain(`return await ${fn}(supabase, businessId);\n  } finally {\n    await run.release()`);
    }
  });

  test("both buttons ignore a second click while the first is starting or running", () => {
    const strip = readFileSync("components/scoring/ScanStatusStrip.tsx", "utf8");
    const view = readFileSync("app/business/[id]/competitors/CompetitorsView.tsx", "utf8");
    for (const src of [strip, view]) {
      expect(src).toContain("const busy = useRef(false);");
      expect(src).toContain("if (busy.current) return;");
    }
    expect(strip).toContain('disabled={state.kind === "scanning" || nextAt !== null}');
    expect(view).toContain("disabled={!allowed || pending}");
  });

  test("the server's 'already running' answer is said plainly (EN + ES)", () => {
    expect(t("en", "dashboard.rescan.inProgress")).toBe("A scan is already running for this business — it finishes on its own.");
    expect(t("es", "dashboard.rescan.inProgress")).toBe("Ya hay un análisis en curso para este negocio; terminará por sí solo.");
  });
});
