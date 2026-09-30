import { describe, expect, test } from "vitest";
import {
  buildWeeklyChecklistState,
  computeStreakWeeks,
  resolveToggleOutcome,
  weekStartFor,
  WEEKLY_CHECKLIST_ITEM_IDS,
  type WeeklyCheckRow,
} from "./weeklyChecklist";

const ALL_ITEMS = WEEKLY_CHECKLIST_ITEM_IDS;

function rowsForWeek(weekStart: string, itemIds: readonly string[] = ALL_ITEMS): WeeklyCheckRow[] {
  return itemIds.map((item_id) => ({ week_start: weekStart, item_id }));
}

describe("weekStartFor", () => {
  test("returns the Monday of the containing week, in the given timezone", () => {
    // Wednesday, Jan 15, 2025 (UTC noon) → Monday Jan 13, 2025.
    const wednesday = new Date("2025-01-15T12:00:00Z");
    expect(weekStartFor(wednesday, "America/New_York")).toBe("2025-01-13");
  });

  test("a Monday maps to itself", () => {
    const monday = new Date("2025-01-13T12:00:00Z");
    expect(weekStartFor(monday, "America/New_York")).toBe("2025-01-13");
  });

  test("a Sunday maps back to the PRECEDING Monday, not forward", () => {
    const sunday = new Date("2025-01-19T12:00:00Z");
    expect(weekStartFor(sunday, "America/New_York")).toBe("2025-01-13");
  });

  test("respects the timezone at a real UTC day boundary", () => {
    // 2025-01-13 01:00 UTC is still 2025-01-12 (Sunday) 20:00 in
    // America/New_York — a timezone-naive implementation would read
    // this as already-Monday and return itself instead of the
    // PREVIOUS Monday.
    const justAfterUtcMidnight = new Date("2025-01-13T01:00:00Z");
    expect(weekStartFor(justAfterUtcMidnight, "America/New_York")).toBe("2025-01-06");
  });
});

describe("buildWeeklyChecklistState", () => {
  const now = new Date("2025-01-15T12:00:00Z"); // Wednesday → week_start 2025-01-13

  test("only rows from the CURRENT week are ever checked, regardless of history", () => {
    const rows = [
      ...rowsForWeek("2025-01-13", ["post_update", "add_photo"]), // this week
      ...rowsForWeek("2025-01-06"), // last week, fully checked — irrelevant here
    ];
    const state = buildWeeklyChecklistState(rows, now, "America/New_York");
    expect(state.weekStart).toBe("2025-01-13");
    expect(Array.from(state.checkedItemIds).sort()).toEqual(["add_photo", "post_update"]);
  });

  test("the checklist resets on a new week: no rows for the new week means nothing is checked", () => {
    const lastWeekFullyChecked = rowsForWeek("2025-01-06"); // fully checked, but that week is over
    const state = buildWeeklyChecklistState(lastWeekFullyChecked, now, "America/New_York");
    expect(state.weekStart).toBe("2025-01-13");
    expect(state.checkedItemIds.size).toBe(0);
  });

  test("checking an item this week and then 'unchecking' (removing its row) both show up correctly", () => {
    const checkedRows = rowsForWeek("2025-01-13", ["reply_reviews"]);
    const checkedState = buildWeeklyChecklistState(checkedRows, now, "America/New_York");
    expect(checkedState.checkedItemIds.has("reply_reviews")).toBe(true);

    // Unchecking removes the row entirely (see setWeeklyCheckItem) — an
    // empty row list for the week is how "nothing checked" is
    // represented, never a false/true flag on a row that still exists.
    const uncheckedState = buildWeeklyChecklistState([], now, "America/New_York");
    expect(uncheckedState.checkedItemIds.has("reply_reviews")).toBe(false);
  });
});

describe("computeStreakWeeks", () => {
  const currentWeekStart = "2025-01-13";

  test("no streak (0) when no past week was ever fully completed", () => {
    expect(computeStreakWeeks([], currentWeekStart)).toBe(0);
  });

  test("counts consecutive fully-completed PAST weeks immediately before the current week", () => {
    const rows = [
      ...rowsForWeek("2025-01-06"), // 1 week ago — full
      ...rowsForWeek("2024-12-30"), // 2 weeks ago — full
      ...rowsForWeek("2024-12-23"), // 3 weeks ago — full
    ];
    expect(computeStreakWeeks(rows, currentWeekStart)).toBe(3);
  });

  test("a gap breaks the streak — weeks beyond the gap don't count", () => {
    const rows = [
      ...rowsForWeek("2025-01-06"), // 1 week ago — full
      // 2024-12-30 (2 weeks ago) has no rows at all — a real gap.
      ...rowsForWeek("2024-12-23"), // 3 weeks ago — full, but unreachable past the gap
    ];
    expect(computeStreakWeeks(rows, currentWeekStart)).toBe(1);
  });

  test("a partially-checked past week (not all 5 items) breaks the streak exactly like a missing week", () => {
    const rows = [
      ...rowsForWeek("2025-01-06", ["post_update", "reply_reviews"]), // only 2 of 5
      ...rowsForWeek("2024-12-30"), // full, but unreachable
    ];
    expect(computeStreakWeeks(rows, currentWeekStart)).toBe(0);
  });

  test("the CURRENT week never counts toward the streak, even if it's already fully checked", () => {
    const rows = [
      ...rowsForWeek(currentWeekStart), // this week, fully checked — still in progress
      ...rowsForWeek("2025-01-06"), // last week, fully checked — a real past week
    ];
    expect(computeStreakWeeks(rows, currentWeekStart)).toBe(1);
  });
});

describe("resolveToggleOutcome", () => {
  test("a successful save commits the server's real state", () => {
    const outcome = resolveToggleOutcome(["post_update"], {
      status: "ok",
      state: { checkedItemIds: ["post_update", "add_photo"], streakWeeks: 2 },
    });
    expect(outcome).toEqual({
      kind: "committed",
      checkedItemIds: ["post_update", "add_photo"],
      streakWeeks: 2,
    });
  });

  test("a failed save reverts to EXACTLY the pre-toggle state — never silently accepted", () => {
    const outcome = resolveToggleOutcome(["post_update"], { status: "error" });
    expect(outcome).toEqual({ kind: "reverted", checkedItemIds: ["post_update"] });
  });

  test("an unauthenticated result also reverts, same as any other non-ok result", () => {
    const outcome = resolveToggleOutcome([], { status: "unauthenticated" });
    expect(outcome).toEqual({ kind: "reverted", checkedItemIds: [] });
  });
});
