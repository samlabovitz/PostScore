/* eslint-disable @typescript-eslint/no-explicit-any -- a tiny stand-in for the Supabase query builder */
import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { latestScoringProgress, SCORING_STALL_MS, scoringProgressOf, SUPERSEDED_JOB_ERROR } from "./competitorScoringStatus";

const job = (over: Record<string, unknown> = {}) => ({ scan_id: "s", kind: "new_scan" as const, status: "running" as const, done: 4, total: 10, error: null as string | null, ...over });

describe("the 'Checking competitor websites…' note", () => {
  test("a scan a newer one replaced is never shown as paused (the real Kee's and Centered Clay case)", () => {
    expect(scoringProgressOf(job({ status: "failed", done: 0, error: SUPERSEDED_JOB_ERROR }))).toBeNull();
    expect(scoringProgressOf(job({ status: "done" }))).toBeNull();
  });

  test("a real pause (PageSpeed budget) or a scan still being checked is shown", () => {
    expect(scoringProgressOf(job())).toMatchObject({ status: "running", done: 4, total: 10 });
    expect(scoringProgressOf(job({ status: "failed", error: "Paused: today's PageSpeed budget…" }))).toMatchObject({ status: "failed" });
  });

  test("only the business's newest job counts — an older unfinished one under a finished newer scan shows nothing", async () => {
    // Newest first, as the query orders them; the note looks at the newest only.
    const jobs = [job({ scan_id: "new", status: "done", done: 4, total: 4 }), job({ scan_id: "old", status: "failed", done: 0, total: 5 })];
    const calls: string[] = [];
    const db = {
      from: () => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          neq: (k: string) => (calls.push(`neq:${k}`), chain),
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: jobs[0], error: null }),
        };
        return chain;
      },
    } as unknown as SupabaseClient;
    expect(await latestScoringProgress(db, "b")).toBeNull();
    expect(calls).toEqual([]);
  });

  test("the cleanup closes a replaced scan with the same marker", async () => {
    const src = (await import("node:fs")).readFileSync("lib/competitorRawCleanup.server.ts", "utf8");
    expect(src).toContain("error: SUPERSEDED_JOB_ERROR");
  });
});

describe("a job that stopped is never shown as 'Updating' (the real Hair Express case: running 4/10, silent since 15:25)", () => {
  const now = new Date("2026-11-18T19:00:00Z");
  test("running or queued but silent for 15+ minutes: nothing shown; the last finished scan stays", () => {
    expect(SCORING_STALL_MS).toBe(15 * 60 * 1000);
    expect(scoringProgressOf(job({ updated_at: "2026-11-18T15:25:28Z" }), now)).toBeNull();
    expect(scoringProgressOf(job({ status: "queued", updated_at: "2026-11-18T18:40:00Z" }), now)).toBeNull();
  });

  test("a job that updated in the last 15 minutes is shown; a real pause still says so", () => {
    expect(scoringProgressOf(job({ updated_at: "2026-11-18T18:50:00Z" }), now)).toMatchObject({ status: "running", done: 4 });
    expect(scoringProgressOf(job({ status: "failed", error: "Paused: today's PageSpeed budget…", updated_at: "2026-11-18T10:00:00Z" }), now)).toMatchObject({ status: "failed" });
  });
});
