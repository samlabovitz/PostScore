import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isWeekOver, localMidnight, weekBounds, weekOf } from "./weeks";
import { buildWeekSummary, pickerWeeks, type WeeklyScan } from "./weeklyReport";
import { shouldShowSinceLastVisit, sinceLastVisit } from "./sinceLastVisit";
import { groupByMonth, snapshotFromWeek, weeksNeedingSnapshots, type WeeklySnapshotRow } from "./snapshots";
import { weeklyViewFromSnapshot } from "./weeklyView";
import { ensureWeeklySnapshots } from "./weekly.server";
import { openBusinessVisitWithClient } from "./weeklyData.server";

const NY = "America/New_York";
const cats = (listing: number, website: number, reviews: number) => ({
  listing: { percent: listing, points: 0, weight: 0 },
  website: { percent: website, points: 0, weight: 0 },
  reviews: { percent: reviews, points: 0, weight: 0 },
});
const scan = (id: string, createdAt: string, total: number, over: Partial<WeeklyScan> = {}): WeeklyScan => ({
  id,
  total,
  grade: "C",
  createdAt,
  scoringVersion: "1.11.0",
  categories: cats(total, total - 10, total + 5),
  profile: { phone: null, website: null, openingHours: null, categories: null, photoCount: 10, rating: 4.5, reviewCount: 100, businessStatus: null },
  ...over,
});

describe("weeks: Monday–Sunday in the business's time zone", () => {
  test("Sunday 11 PM in New York is still that week; Monday 12:30 AM is the next", () => {
    expect(weekOf("2026-10-19T03:00:00Z", NY)).toBe("2026-10-12"); // Sun Oct 18, 11 PM EDT
    expect(weekOf("2026-10-19T04:30:00Z", NY)).toBe("2026-10-19"); // Mon Oct 19, 12:30 AM EDT
    expect(localMidnight("2026-10-19", NY).toISOString()).toBe("2026-10-19T04:00:00.000Z");
  });

  test("DST: the week of the fall-back change is 7 local days (169 hours)", () => {
    const { start, end } = weekBounds("2026-10-26", NY); // DST ends Sun Nov 1
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(169);
  });

  test("a week is over once its Sunday ends there", () => {
    expect(isWeekOver("2026-10-12", new Date("2026-10-19T03:59:00Z"), NY)).toBe(false);
    expect(isWeekOver("2026-10-12", new Date("2026-10-19T04:00:00Z"), NY)).toBe(true);
  });
});

describe("the weekly comparison (never fabricated, never '0 days')", () => {
  const scans = [scan("a", "2026-10-09T15:00:00Z", 66), scan("b", "2026-10-14T15:00:00Z", 71)];

  test("one scan this week → compared with the last scan before the week", () => {
    const w = buildWeekSummary("2026-10-12", scans, NY, "en");
    expect(w.scanCount).toBe(1);
    expect(w.comparison?.from.id).toBe("a");
    expect(w.comparison?.delta).toBe(5);
    expect(w.comparedInWeek).toBe(false);
  });

  test("first week with two scans → compared within the week; one scan and nothing before → no comparison", () => {
    const two = [scan("a", "2026-10-13T15:00:00Z", 60), scan("b", "2026-10-16T15:00:00Z", 64)];
    const w = buildWeekSummary("2026-10-12", two, NY, "en");
    expect(w.comparedInWeek).toBe(true);
    expect(w.comparison?.delta).toBe(4);
    expect(buildWeekSummary("2026-10-12", [scan("a", "2026-10-13T15:00:00Z", 60)], NY, "en").comparison).toBeNull();
  });

  test("a week without a scan: no comparison, the last known scan instead", () => {
    const w = buildWeekSummary("2026-10-19", scans, NY, "en");
    expect(w.current).toBeNull();
    expect(w.comparison).toBeNull();
    expect(w.lastKnown?.id).toBe("b");
  });

  test("like with like: skips an older-version scan for the last same-version one", () => {
    const mixed = [scan("v10", "2026-10-11T15:00:00Z", 72, { scoringVersion: "1.10.0" }), scan("m1", "2026-10-13T15:00:00Z", 69), scan("m2", "2026-10-16T15:00:00Z", 71)];
    const w = buildWeekSummary("2026-10-12", mixed, NY, "en");
    expect(w.comparison?.from.id).toBe("m1");
    expect(w.comparedInWeek).toBe(true);
    expect(w.comparison?.delta).toBe(2);
    const older = [scan("v11", "2026-10-02T15:00:00Z", 64), ...mixed];
    expect(buildWeekSummary("2026-10-12", older, NY, "en").comparison?.from.id).toBe("v11");
  });

  test("different scoring versions are never subtracted", () => {
    const w = buildWeekSummary("2026-10-12", [scan("a", "2026-10-09T15:00:00Z", 66, { scoringVersion: "1.10.0" }), scan("b", "2026-10-14T15:00:00Z", 71)], NY, "en");
    expect(w.comparison?.delta).toBeNull();
    expect(w.comparison?.categories.every((c) => c.before === null)).toBe(true);
  });

  test("the picker: this week first, then past weeks that have scans", () => {
    expect(pickerWeeks(scans, new Date("2026-10-21T12:00:00Z"), NY)).toEqual(["2026-10-19", "2026-10-12", "2026-10-05"]);
  });
});

describe("since your last visit", () => {
  const now = new Date("2026-10-19T15:00:00Z");
  test("only after 7+ days", () => {
    expect(shouldShowSinceLastVisit("2026-10-13T15:00:00Z", now)).toBe(false);
    expect(shouldShowSinceLastVisit("2026-10-12T15:00:00Z", now)).toBe(true);
    expect(shouldShowSinceLastVisit(null, now)).toBe(false);
  });

  test("compares the scan current at the last visit with the latest — even after 3 months", () => {
    const scans = [scan("old", "2026-07-01T15:00:00Z", 60), scan("mid", "2026-07-10T15:00:00Z", 66), scan("new", "2026-10-18T15:00:00Z", 71)];
    const s = sinceLastVisit("2026-07-15T15:00:00Z", scans, "en");
    expect(s.baseline?.id).toBe("mid");
    expect(s.comparison?.delta).toBe(5);
    expect(s.noNewScan).toBe(false);
  });

  test("no scan since the last visit → noNewScan, no comparison", () => {
    const s = sinceLastVisit("2026-10-18T16:00:00Z", [scan("a", "2026-10-18T15:00:00Z", 71)], "en");
    expect(s.noNewScan).toBe(true);
    expect(s.comparison).toBeNull();
  });
});

// ---- A tiny in-memory Supabase for the server functions -----------------
function fakeDb(init: { scans: WeeklyScan[]; snapshots?: WeeklySnapshotRow[]; lastSeen?: string | null; snapshotsTable?: boolean; lastSeenTable?: boolean }) {
  const db = {
    snapshots: [...(init.snapshots ?? [])],
    lastSeen: init.lastSeen ?? null,
    upserts: 0,
  };
  const scoreRows = init.scans.map((s) => ({
    id: s.id,
    total: s.total,
    grade: s.grade,
    created_at: s.createdAt,
    scoring_version: s.scoringVersion,
    profile_snapshot_json: s.profile,
    breakdown_categories: [
      { id: "completeness", relativeScore: s.categories?.listing.percent, earnedPoints: 1, weight: 1 },
      { id: "website", relativeScore: s.categories?.website.percent, earnedPoints: 1, weight: 1 },
      { id: "visibility", relativeScore: s.categories?.reviews.percent, earnedPoints: 1, weight: 1 },
    ],
    scan_kind: null,
  }));
  const missing = { data: null, error: { code: "42P01", message: "relation does not exist" } };
  const from = (table: string) => {
    let single = false;
    const chain: Record<string, unknown> = {};
    const result = () => {
      if (table === "businesses") return { data: { name: "Modern Liquors", address: "1 Main St", language: "en", lat: 39.68, lng: -75.75, category: null, primary_type: null, business_type_override: null, categories: null } };
      if (table === "scores") return { data: single ? scoreRows.at(-1) : scoreRows };
      if (table === "weekly_snapshots") return init.snapshotsTable === false ? missing : { data: single ? db.snapshots[0] ?? null : db.snapshots };
      if (table === "business_last_seen") return init.lastSeenTable === false ? missing : { data: db.lastSeen ? { last_seen_at: db.lastSeen } : null, error: null };
      if (table === "tasks") return { count: 0 };
      return { data: [] };
    };
    Object.assign(chain, {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      lte: () => chain,
      gte: () => chain,
      lt: () => chain,
      order: () => chain,
      limit: () => chain,
      range: () => chain,
      maybeSingle: async () => ((single = true), result()),
      upsert: async (rows: unknown, opts: { ignoreDuplicates?: boolean } = {}) => {
        db.upserts++;
        if (table === "business_last_seen") {
          db.lastSeen = (rows as { last_seen_at: string }).last_seen_at;
          return { error: null };
        }
        for (const row of rows as WeeklySnapshotRow[]) {
          const i = db.snapshots.findIndex((s) => s.week_start === row.week_start);
          if (i < 0) db.snapshots.push(row);
          else if (!opts.ignoreDuplicates) db.snapshots[i] = row;
        }
        return { error: null };
      },
      then: (resolve: (v: unknown) => void) => resolve(result()),
    });
    return chain;
  };
  return { client: { from } as unknown as SupabaseClient, db };
}

describe("weekly snapshots", () => {
  const scans = [scan("w1", "2026-09-29T15:00:00Z", 60), scan("w2", "2026-10-07T15:00:00Z", 66), scan("w4", "2026-10-21T15:00:00Z", 71)];
  const now = new Date("2026-10-22T15:00:00Z");

  test("finished weeks with scans only: the week in progress and empty weeks are skipped", () => {
    expect(weeksNeedingSnapshots(scans.map((s) => s.createdAt), new Set(), now, NY)).toEqual(["2026-09-28", "2026-10-05"]);
    expect(weeksNeedingSnapshots(scans.map((s) => s.createdAt), new Set(["2026-09-28"]), now, NY)).toEqual(["2026-10-05"]);
  });

  test("created once per week and never duplicated", async () => {
    const { client, db } = fakeDb({ scans });
    expect((await ensureWeeklySnapshots(client, "b1", scans, NY, "en", now)).added).toEqual(["2026-09-28", "2026-10-05"]);
    expect((await ensureWeeklySnapshots(client, "b1", scans, NY, "en", now)).added).toEqual([]);
    expect(db.snapshots.map((s) => s.week_start)).toEqual(["2026-09-28", "2026-10-05"]);
    expect(db.snapshots[1]).toMatchObject({ score: 66, prev_score: 60, scan_id: "w2", compared_scan_id: "w1" });
    expect(JSON.stringify(db.snapshots[1]).length).toBeLessThan(2048);
  });

  test("old snapshots don't change: a later scoring change shows the frozen numbers, labeled with their version", () => {
    const frozen = snapshotFromWeek("b1", buildWeekSummary("2026-10-05", scans, NY, "en"), { rank: 3, rankOf: 11, prevRank: 5, fixesConfirmed: 1 })!;
    // Scoring changed later: the same saved scans would now score differently.
    const rescored = scans.map((s) => ({ ...s, total: s.total + 9, scoringVersion: "1.12.0" }));
    const view = weeklyViewFromSnapshot(frozen, buildWeekSummary("2026-10-05", rescored, NY, "en"), "1.12.0");
    expect(view.score).toBe(66);
    expect(view.change?.delta).toBe(6);
    expect(view.olderScoringVersion).toBe("1.11.0");
    expect(view.rank).toEqual({ rank: 3, of: 11, previous: 5 });
  });

  test("before the SQL is run: nothing breaks, nothing is written", async () => {
    const { client, db } = fakeDb({ scans, snapshotsTable: false });
    expect(await ensureWeeklySnapshots(client, "b1", scans, NY, "en", now)).toEqual({ enabled: false, added: [] });
    expect(db.upserts).toBe(0);
  });

  test("past reports grouped by month, newest first", () => {
    const groups = groupByMonth([{ week_start: "2026-09-28" }, { week_start: "2026-10-12" }, { week_start: "2026-10-05" }]);
    expect(groups.map((g) => [g.month, g.rows.map((r) => r.week_start)])).toEqual([
      ["2026-10", ["2026-10-12", "2026-10-05"]],
      ["2026-09", ["2026-09-28"]],
    ]);
  });
});

describe("opening a business: the pop-up shows once per visit", () => {
  const scans = [scan("a", "2026-10-01T15:00:00Z", 66), scan("b", "2026-10-18T15:00:00Z", 71)];
  const deps = { nextSteps: async () => [{ title: "Add photos", detail: "", points: "+3 pts" }, { title: "Reply to reviews", detail: "", points: "+2 pts" }, { title: "Third", detail: "", points: "+1 pt" }] };
  const now = new Date("2026-10-19T15:00:00Z");

  test("first visit ever: recorded, no pop-up", async () => {
    const { client, db } = fakeDb({ scans, lastSeen: null });
    expect(await openBusinessVisitWithClient(client, "u1", "b1", deps, now)).toEqual({ status: "ok", show: false });
    expect(db.lastSeen).toBe(now.toISOString());
  });

  test("8 days later: shows the change once; opening again right after doesn't", async () => {
    const { client } = fakeDb({ scans, lastSeen: "2026-10-11T15:00:00Z" });
    const first = await openBusinessVisitWithClient(client, "u1", "b1", deps, now);
    expect(first.status === "ok" && first.show).toBe(true);
    if (first.status === "ok" && first.show) {
      expect(first.data).toMatchObject({ baselineScore: 66, latestScore: 71, delta: 5, noNewScan: false, comparable: true });
      expect(first.data.nextSteps).toHaveLength(2);
    }
    const again = await openBusinessVisitWithClient(client, "u1", "b1", deps, new Date(now.getTime() + 60_000));
    expect(again).toEqual({ status: "ok", show: false });
  });

  test("no scan since the last visit: the 'haven't re-scanned' state, with the daily limit", async () => {
    const { client } = fakeDb({ scans, lastSeen: "2026-10-18T16:00:00Z" });
    const result = await openBusinessVisitWithClient(client, "u1", "b1", deps, new Date("2026-10-27T15:00:00Z"));
    expect(result.status === "ok" && result.show && result.data.noNewScan).toBe(true);
    if (result.status === "ok" && result.show) {
      expect(result.data.delta).toBeNull();
      expect(result.data.rescan.allowed).toBe(true);
      expect(result.data.nextSteps).toEqual([]);
    }
  });

  test("before supabase/last-seen.sql is run: not_enabled, no crash", async () => {
    const { client } = fakeDb({ scans, lastSeenTable: false });
    expect(await openBusinessVisitWithClient(client, "u1", "b1", deps, now)).toEqual({ status: "not_enabled" });
  });
});
