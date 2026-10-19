import { afterEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/weeklyChecklist", () => ({ setWeeklyCheckItem: vi.fn() }));

import { LocaleProvider } from "@/lib/i18n";
import { ProgressRing, WeeklyChecklist } from "./WeeklyChecklist";
import { buildWeeklyChecklistItems } from "@/lib/weeklyChecklist";
import { celebrationKey, claimCelebration, goalHit } from "@/lib/celebrate";

const C = 2 * Math.PI * 15;
const ring = (done: number, total = 5) => renderToStaticMarkup(<ProgressRing done={done} total={total} />);
const offset = (html: string) => Number(html.match(/stroke-dashoffset="([\d.e-]+)"/)![1]);

describe("weekly routine ring (bug: it showed empty at 5 of 5)", () => {
  test("fills in brass as items are checked: 0 → 20% → … → full", () => {
    for (let done = 0; done <= 5; done++) expect(offset(ring(done))).toBeCloseTo(C * (1 - done / 5), 3);
    // The colors are styles (an SVG attribute can't read a CSS variable).
    expect(ring(1)).toContain("stroke:var(--color-brass)");
    expect(ring(1)).not.toContain('stroke="var(');
  });

  test("at 5 of 5 it's fully filled and turns into a brass check badge", () => {
    const html = ring(5);
    expect(offset(html)).toBeCloseTo(0, 5);
    expect(html).toContain('data-complete="true"');
    expect(html).toContain("bg-brass");
    expect(ring(4)).not.toContain('data-complete="true"');
  });

  test("the header reads 'Weekly routine complete 🎉 · resets Monday' (EN + ES)", () => {
    const items = buildWeeklyChecklistItems("en");
    const render = (ids: string[], locale: "en" | "es" = "en") =>
      renderToStaticMarkup(
        <LocaleProvider locale={locale} timeZone="America/New_York">
          <WeeklyChecklist businessId="b1" items={buildWeeklyChecklistItems(locale)} initialCheckedItemIds={ids as never} initialStreakWeeks={0} weekStart="2026-10-12" />
        </LocaleProvider>
      );
    expect(render(items.map((i) => i.id))).toContain("Weekly routine complete 🎉 · resets Monday");
    expect(render(items.map((i) => i.id), "es")).toContain("Rutina semanal completa 🎉 · se reinicia el lunes");
    expect(render(items.slice(0, 2).map((i) => i.id))).toContain("2 of 5 done this week");
  });
});

describe("celebrations play once per business per week", () => {
  const store = new Map<string, string>();
  const g = globalThis as unknown as { window?: unknown };
  afterEach(() => {
    store.clear();
    delete g.window;
  });
  const withStorage = () => {
    g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } };
  };

  test("first claim plays; reloading or re-checking the same week doesn't; next week does", () => {
    withStorage();
    const week1 = celebrationKey("routine", "b1", "2026-10-12");
    expect(claimCelebration(week1)).toBe(true);
    expect(claimCelebration(week1)).toBe(false);
    expect(claimCelebration(celebrationKey("routine", "b2", "2026-10-12"))).toBe(true);
    expect(claimCelebration(celebrationKey("routine", "b1", "2026-10-19"))).toBe(true);
  });
});

describe("the weekly-goal celebration counts only real, re-scanned points", () => {
  const goal = { start: 71, goal: 73, setAt: "2026-10-13T15:00:00Z" };

  test("hit: a scan after the goal was set raised the real score to it — 71 → 73 (+2)", () => {
    expect(goalHit(goal, 73, "2026-10-15T10:00:00Z")).toEqual({ start: 71, now: 73, diff: 2 });
    expect(goalHit(goal, 75, "2026-10-15T10:00:00Z")).toEqual({ start: 71, now: 75, diff: 4 });
  });

  test("not hit: no scan since (clicking 'I did this' never changes the score), or the score didn't reach the goal", () => {
    expect(goalHit(goal, 73, "2026-10-13T09:00:00Z")).toBeNull(); // the last scan was before the goal was set
    expect(goalHit(goal, 73, null)).toBeNull();
    expect(goalHit(goal, 72, "2026-10-15T10:00:00Z")).toBeNull();
    expect(goalHit(null, 80, "2026-10-15T10:00:00Z")).toBeNull();
  });
});
