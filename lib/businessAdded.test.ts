import { describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));

// Adding a business saves its first score snapshot (like a scan does), so
// history, "Since your last scan" and Competitors work from day one — the
// real JT's case: added Nov 9, no `scores` row until a website re-check.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { afterBusinessAdded, saveFirstScoreSnapshotWithClient } from "./businessAdded.server";

function fakeDb(existingScores: number, error: { message: string } | null = null) {
  const queries: string[] = [];
  const db = {
    from(table: string) {
      queries.push(table);
      const chain = { select: () => chain, eq: () => chain, limit: async () => ({ data: error ? null : Array.from({ length: existingScores }, (_, i) => ({ id: `s${i}` })), error }) };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { db, queries };
}

describe("the first score snapshot", () => {
  test("no saved scan yet: saves one", async () => {
    const save = vi.fn(async () => ({ status: "saved" }));
    const { db, queries } = fakeDb(0);
    expect(await saveFirstScoreSnapshotWithClient(db, "jts", save)).toEqual({ status: "saved" });
    expect(save).toHaveBeenCalledWith(db, "jts");
    expect(queries).toEqual(["scores"]);
  });

  test("already has a saved scan (re-adding the same listing): never a second one", async () => {
    const save = vi.fn();
    expect(await saveFirstScoreSnapshotWithClient(fakeDb(2).db, "jts", save)).toEqual({ status: "already_saved" });
    expect(save).not.toHaveBeenCalled();
  });

  test("a read error: nothing saved, the error returned", async () => {
    const save = vi.fn();
    expect(await saveFirstScoreSnapshotWithClient(fakeDb(0, { message: "timeout" }).db, "jts", save)).toEqual({ status: "error", message: "timeout" });
    expect(save).not.toHaveBeenCalled();
  });
});

describe("after a business is added", () => {
  test("first score, then the first competitor scan (which ranks it)", async () => {
    const order: string[] = [];
    await afterBusinessAdded(fakeDb(0).db, "jts", {
      saveFirst: async () => (order.push("score"), { status: "saved" }),
      ensureCompetitors: async () => order.push("competitors"),
    });
    expect(order).toEqual(["score", "competitors"]);
  });

  test("a failed first score never stops the add or the competitor scan", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ensureCompetitors = vi.fn(async () => {});
    await afterBusinessAdded(fakeDb(0).db, "jts", { saveFirst: async () => { throw new Error("boom"); }, ensureCompetitors });
    expect(ensureCompetitors).toHaveBeenCalledTimes(1);
  });

  test("saveBusiness runs it for every saved business", () => {
    expect(readFileSync("app/actions/businesses.ts", "utf8")).toContain('if (result.status === "saved") await afterBusinessAdded(supabase, result.businessId);');
  });
});
