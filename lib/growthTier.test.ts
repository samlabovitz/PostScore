// Day 25B step 6: the Growth tier rules (docs/plans/day25a-spec.md §6.2–6.4).
import { describe, expect, test } from "vitest";
import { addDays, computeTiers, localDate, mondayOf, r1ForMonth, resultsAt, weekRecord, type GrowthAction, type GrowthFacts, type MonthInsights } from "./growthTier";

const TZ = "America/New_York";
const START = "2026-06-01"; // a Monday
// A verified action at noon on the Wednesday of week `i` (0 = the week of START).
const verifiedIn = (i: number, extra: Partial<GrowthAction> = {}): GrowthAction => ({ at: `${addDays(START, i * 7 + 2)}T16:00:00Z`, kind: "verified", source: "listing_change", ...extra });
const toldIn = (i: number, n = 1): GrowthAction[] => Array.from({ length: n }, (_, k) => ({ at: `${addDays(START, i * 7 + 2)}T1${k}:00:00Z`, kind: "told" as const, source: "task_marked" }));
const facts = (over: Partial<GrowthFacts> = {}): GrowthFacts => ({ timeZone: TZ, actions: [], countTestRows: false, countsFrom: null, insights: [], connected: false, reviewIncreases: [], offerUseLogSince: null, neutralWeeks: {}, freePeriods: [], ...over });
const tiersFor = (f: GrowthFacts, weeks: number) => computeTiers(f, START, addDays(START, weeks * 7));
const activeWeeks = (list: number[]) => list.map((i) => verifiedIn(i));
const last = <T,>(a: T[]) => a[a.length - 1];

describe("weeks", () => {
  test("Monday–Sunday in the business's time zone", () => {
    expect(mondayOf("2026-11-29")).toBe("2026-11-23"); // a Sunday
    expect(mondayOf("2026-11-23")).toBe("2026-11-23");
    // 11:30 PM Sunday in New York is already Monday in UTC: still the old week there.
    expect(localDate("2026-11-30T04:30:00Z", TZ)).toBe("2026-11-29");
    const f = facts({ actions: [{ at: "2026-11-30T04:30:00Z", kind: "verified", source: "x" }] });
    expect(weekRecord(f, "2026-11-23").active).toBe(true);
    expect(weekRecord(f, "2026-11-30").active).toBe(false);
  });
  test("active = 1 verified action, or 2 'You told us' check-offs (one alone isn't)", () => {
    expect(weekRecord(facts({ actions: toldIn(0, 1) }), START).active).toBe(false);
    expect(weekRecord(facts({ actions: toldIn(0, 2) }), START).active).toBe(true);
    expect(weekRecord(facts({ actions: [verifiedIn(0)] }), START).active).toBe(true);
  });
  test("test rows never count for a real owner; the dev test login counts them; undone changes count for no one", () => {
    const actions = [verifiedIn(0, { test: true }), verifiedIn(0, { undone: true })];
    expect(weekRecord(facts({ actions }), START).active).toBe(false);
    expect(weekRecord(facts({ actions, countTestRows: true }), START).verified).toBe(1);
    expect(weekRecord(facts({ actions: [verifiedIn(0, { undone: true })], countTestRows: true }), START).active).toBe(false);
  });
  test("nothing before the claim (or the reset) counts", () => {
    const f = facts({ actions: activeWeeks([0, 1, 2, 3]), countsFrom: `${addDays(START, 14)}T05:00:00Z` });
    expect(weekRecord(f, START).active).toBe(false);
    expect(weekRecord(f, addDays(START, 14)).active).toBe(true);
  });
});

describe("thresholds (§6.3)", () => {
  test("Building: 3 of the last 4 weeks", () => {
    // Weeks 0, 1, 3 active (week 2 quiet): Building on the Monday after week 3.
    const t = tiersFor(facts({ actions: activeWeeks([0, 1, 3]) }), 4);
    expect(last(t).tier).toBe(2);
    expect(last(t).change).toBe("up");
    expect(tiersFor(facts({ actions: activeWeeks([0, 3]) }), 4).at(-1)!.tier).toBe(1);
  });
  test("up at most one tier per Monday", () => {
    // 12 active weeks and every result: still one step a Monday.
    const t = tiersFor(facts({ actions: activeWeeks(Array.from({ length: 14 }, (_, i) => i)) }), 14);
    const ups = t.filter((x) => x.change === "up").map((x) => x.tier);
    expect(ups).toEqual([2]); // without results, Growing never comes
    expect(t.every((x, i) => i === 0 || x.tier - t[i - 1].tier <= 1)).toBe(true);
  });
  test("Growing: 5 of 6 + one result; Thriving: 7 of 8 + 2 (≥ 1 measured); Local favorite: 11 of 12 + 3 (≥ 2 measured) + R1 three months", () => {
    // Every week active; R2 met (3 reviews a month), R4 met (3 uses a month), R1 met every month.
    const weeks = 20;
    const reviewIncreases = Array.from({ length: weeks }, (_, i) => ({ at: `${addDays(START, i * 7 + 1)}T15:00:00Z`, delta: 1 }));
    const uses: GrowthAction[] = Array.from({ length: weeks }, (_, i) => ({ at: `${addDays(START, i * 7 + 3)}T15:00:00Z`, kind: "told", source: "offer_use" }));
    const insights: MonthInsights[] = [];
    for (let y = 2025; y <= 2026; y++) for (let m = 1; m <= 12; m++) insights.push({ month: `${y}-${String(m).padStart(2, "0")}`, calls: y === 2026 ? 120 : 100, directions: 50, bookings: 0, websiteClicks: 10 });
    const base = facts({ actions: [...activeWeeks(Array.from({ length: weeks }, (_, i) => i)), ...uses], reviewIncreases, insights, connected: true, offerUseLogSince: "2026-01-01T00:00:00Z" });
    const t = tiersFor(base, weeks);
    const firstAt = (tier: number) => t.findIndex((x) => x.tier === tier);
    expect(firstAt(2)).toBe(3); // 3 of 4: the Monday after the 3rd active week (the week before START counts as quiet)
    expect(firstAt(3)).toBeGreaterThan(firstAt(2));
    expect(firstAt(4)).toBeGreaterThan(firstAt(3));
    expect(firstAt(5)).toBeGreaterThan(firstAt(4));
    expect(t[firstAt(5)].reason.of).toBe(12);
    // Without R1 three months in a row: never Local favorite.
    const noR1 = tiersFor({ ...base, insights: [], connected: false }, weeks);
    expect(Math.max(...noR1.map((x) => x.tier))).toBe(4);
    // R4 is "You told us": Thriving needs one measured result too.
    const onlyR4 = tiersFor({ ...base, insights: [], connected: false, reviewIncreases: [] }, weeks);
    expect(Math.max(...onlyR4.map((x) => x.tier))).toBe(3);
  });
});

describe("results (§6.2)", () => {
  const month = (m: string, calls: number, directions: number, websiteClicks: number, bookings = 0): MonthInsights => ({ month: m, calls, directions, bookings, websiteClicks });
  test("R1: same month last year; else the 3-month average before it; not checked without data", () => {
    expect(r1ForMonth([month("2026-10", 60, 92, 0), month("2025-10", 40, 62, 0)], "2026-10")).toBe("met"); // Hair Express: 152 vs 102
    expect(r1ForMonth([month("2026-10", 30, 30, 5), month("2025-10", 40, 62, 5)], "2026-10")).toBe("not_met");
    expect(r1ForMonth([month("2026-10", 50, 50, 5), month("2026-09", 40, 40, 5), month("2026-08", 40, 40, 5), month("2026-07", 40, 40, 5)], "2026-10")).toBe("met");
    expect(r1ForMonth([month("2026-10", 50, 50, 5), month("2026-09", 40, 40, 5)], "2026-10")).toBe("not_checked");
    expect(r1ForMonth([], "2026-10")).toBe("not_checked");
  });
  test("R1: calls + directions only when either month has 0 website clicks (Google's counting break)", () => {
    // With clicks counted it would fail (60 + 40 vs 40 + 40 + 100); without, 60+40 ≥ 40+40.
    expect(r1ForMonth([month("2026-10", 60, 40, 0), month("2025-10", 40, 40, 100)], "2026-10")).toBe("met");
  });
  test("R3 never counts yet and is never failed; R5 waits for Day 37; R1 unavailable until Google is connected", () => {
    const r = resultsAt(facts(), "2026-11-23");
    expect(r.R3).toBe("unavailable");
    expect(r.R5).toBe("unavailable");
    expect(r.R1).toBe("unavailable");
  });
  test("R2: ≥ 3 new reviews in the 30 days before Monday; R4 not checked before dated +1 logging", () => {
    const f = facts({ reviewIncreases: [{ at: "2026-11-10T15:00:00Z", delta: 2 }, { at: "2026-11-20T15:00:00Z", delta: 1 }] });
    expect(resultsAt(f, "2026-11-23").R2).toBe("met");
    expect(resultsAt(f, "2026-12-21").R2).toBe("not_met");
    expect(resultsAt(f, "2026-11-23").R4).toBe("not_checked");
  });
});

describe("going down (§6.4)", () => {
  test("two quiet weeks in a row → down one tier, with the two weeks named; one quiet week → a warning only", () => {
    // Building by week 4, then weeks 4 and 5 quiet.
    const t = tiersFor(facts({ actions: activeWeeks([0, 1, 2, 3]) }), 7);
    const warned = t.find((x) => x.warning)!;
    expect(warned.tier).toBe(2);
    const down = t.find((x) => x.change === "down_quiet")!;
    expect(down.tier).toBe(1);
    expect(down.reason.quietWeeks).toHaveLength(2);
    expect(t.indexOf(warned)).toBeLessThan(t.indexOf(down));
  });
  test("neutral weeks are skipped, never quiet (Closed this week, the listing closed, the first weeks on a plan, Google failures)", () => {
    const quietWeek4 = addDays(START, 4 * 7);
    const quietWeek5 = addDays(START, 5 * 7);
    const t = tiersFor(facts({ actions: activeWeeks([0, 1, 2, 3]), neutralWeeks: { [quietWeek4]: "closed_marked", [quietWeek5]: "google_failure" } }), 7);
    expect(t.some((x) => x.change === "down_quiet")).toBe(false);
    expect(t.at(-1)!.tier).toBe(2);
  });
  test("coming back is quick: 2 active weeks in a row restore the tier they had", () => {
    // Building (weeks 0–3), weeks 4–5 quiet → Starting out, weeks 6–7 active → Building again at once.
    const t = tiersFor(facts({ actions: activeWeeks([0, 1, 2, 3, 6, 7]) }), 9);
    const restored = t.find((x) => x.change === "restored")!;
    expect(restored.tier).toBe(2);
    expect(restored.reason.restoredFrom).toBe(1);
  });
  test("never more than one step down per two weeks; never below Starting out", () => {
    const t = tiersFor(facts({ actions: activeWeeks([0, 1, 2, 3]) }), 20);
    const downs = t.filter((x) => x.change.startsWith("down"));
    for (let i = 1; i < downs.length; i++) expect(Date.parse(downs[i].monday) - Date.parse(downs[i - 1].monday)).toBeGreaterThanOrEqual(14 * 86_400_000);
    expect(Math.min(...t.map((x) => x.tier))).toBe(1);
  });
});

describe("plan changes (§6.4.5)", () => {
  const building = facts({ actions: activeWeeks(Array.from({ length: 30 }, (_, i) => i)) });
  test("on Free the tier is frozen; back within 60 days it resumes", () => {
    const t = tiersFor({ ...building, freePeriods: [{ from: addDays(START, 49), to: addDays(START, 77) }] }, 14);
    expect(t.filter((x) => x.change === "frozen").length).toBeGreaterThan(0);
    const after = t.find((x) => x.monday === addDays(START, 77))!;
    expect(after.tier).toBe(2);
  });
  test("back after more than 60 days: one step lower", () => {
    const t = tiersFor({ ...building, freePeriods: [{ from: addDays(START, 49), to: addDays(START, 133) }] }, 20);
    const back = t.find((x) => x.monday === addDays(START, 133))!;
    expect(back.change).toBe("resumed");
    expect(back.tier).toBe(1);
  });
});
