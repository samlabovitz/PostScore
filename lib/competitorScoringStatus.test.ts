/* eslint-disable @typescript-eslint/no-explicit-any -- a tiny stand-in for the Supabase query builder */
import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { latestScoringProgress, scoringProgressOf, SUPERSEDED_JOB_ERROR } from "./competitorScoringStatus";

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
