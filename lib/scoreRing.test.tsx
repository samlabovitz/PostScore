import { describe, expect, test } from "vitest";
import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { AnimatedScoreRing, easeOutCubic, runScoreAnimation, SCORE_ANIMATION_MS, type ScoreAnimationDeps } from "@/components/overview/AnimatedScoreRing";
import { GRADE_ACCENT, ScoreBand } from "@/components/overview/ScoreBand";

/** A fake clock + frame queue to drive one play. */
function harness(reducedMotion = false) {
  let t = 0;
  let frames: Array<(now: number) => void> = [];
  const shown: number[] = [];
  const landed: boolean[] = [];
  const timers: Array<() => void> = [];
  const deps: ScoreAnimationDeps = {
    reducedMotion,
    now: () => t,
    requestFrame: (cb) => frames.push(cb),
    cancelFrame: () => {
      frames = [];
    },
    setTimer: (cb) => timers.push(cb),
    clearTimer: () => {},
    setShown: (v) => shown.push(v),
    setLanded: (v) => landed.push(v),
  };
  const advance = (ms: number) => {
    t += ms;
    const run = frames;
    frames = [];
    run.forEach((cb) => cb(t));
  };
  return { deps, shown, landed, timers, advance, pending: () => frames.length };
}

describe("the score ring's count-up", () => {
  test("from 0 to the score over ~1.2 s, ease-out, then a landing pulse", () => {
    const h = harness();
    runScoreAnimation(87, h.deps);
    expect(SCORE_ANIMATION_MS).toBe(1200);
    expect(h.shown[0]).toBe(0);
    h.advance(300);
    const quarter = h.shown.at(-1)!;
    // Ease-out: a quarter of the time is well past a quarter of the score.
    expect(quarter).toBe(Math.round(87 * easeOutCubic(0.25)));
    expect(quarter).toBeGreaterThan(87 / 4);
    for (let i = 0; i < 10; i++) h.advance(100);
    expect(h.shown.at(-1)).toBe(87);
    expect(h.pending()).toBe(0);
    expect(h.landed.at(-1)).toBe(true);
    h.timers.forEach((cb) => cb());
    expect(h.landed.at(-1)).toBe(false);
  });

  test("“Reduce motion”: the final state instantly — no frames, no pulse", () => {
    const h = harness(true);
    runScoreAnimation(87, h.deps);
    expect(h.shown).toEqual([87]);
    expect(h.pending()).toBe(0);
    expect(h.landed).toEqual([false]);
  });

  test("a replay (route return) starts over from 0; stopping cancels the old play", () => {
    const h = harness();
    const stop = runScoreAnimation(87, h.deps);
    h.advance(400);
    stop();
    expect(h.pending()).toBe(0);
    runScoreAnimation(87, h.deps);
    expect(h.shown.at(-1)).toBe(0);
  });

  test("replays on every visit: on every mount (no “seen once” gate) and on a back/forward-cache restore", () => {
    const src = fs.readFileSync("components/overview/AnimatedScoreRing.tsx", "utf8");
    expect(src).not.toMatch(/localStorage\.(getItem|setItem)/);
    expect(src).toContain('window.addEventListener("pageshow", onPageShow)');
    expect(src).toContain("if (e.persisted) play();");
    // Server HTML is the final score (no hydration mismatch, no layout shift).
    const html = renderToStaticMarkup(<AnimatedScoreRing score={87} size={164} />);
    expect(html).toMatch(/data-testid="score-number"[^>]*>87</);
    expect(html).toContain("tabular-nums");
    expect(html).toContain('style="width:164px;height:164px"');
  });

  test("the look: gold gradient stroke, rounded ends, a thin dark track, a soft glow; “/100” small and muted", () => {
    const html = renderToStaticMarkup(<AnimatedScoreRing score={87} />);
    expect(html).toMatch(/<linearGradient id="ps-score-gold-/);
    expect(html).toMatch(/stroke="url\(#ps-score-gold-/);
    expect(html).toContain('stroke-linecap="round"');
    expect(html).toContain('stroke-width="6"');
    expect(html).toContain("ps-score-glow");
    expect(html).toContain(">/100<");
    const css = fs.readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.ps-score-glow-land,\s*\.ps-score-land \{\s*animation: none;/);
  });
});

describe("the score card", () => {
  const band = (locale: "en" | "es" = "en", grade: "A" | "B" | "C" | "D" | "F" = "B") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale}>
        <ScoreBand businessId="b1" score={84} grade={grade} history={[]} projectedScore={90} projectedGrade="A" biggestBoost={null} />
      </LocaleProvider>
    );

  test("“See your score breakdown ↓” centered under the ring, in one centered column with even spacing (EN + ES)", () => {
    const html = band();
    const i = html.indexOf('data-testid="score-ring-column"');
    const col = html.slice(i, html.indexOf(">", i));
    expect(col).toContain("flex w-max flex-col items-center gap-3");
    expect(html.indexOf('data-testid="score-ring"')).toBeLessThan(html.indexOf('data-testid="see-breakdown"'));
    expect(band("es")).toContain("Ver el desglose de su puntuación ↓");
  });

  test("the grade chip has its own accent per grade; the letter stays cream for contrast", () => {
    for (const g of ["A", "B", "C", "D", "F"] as const) {
      const html = band("en", g);
      expect(html).toContain(`data-grade="${g}"`);
      expect(html).toContain(GRADE_ACCENT[g].replace(/"/g, "&quot;").slice(0, 12));
    }
    expect(new Set(Object.values(GRADE_ACCENT)).size).toBe(5);
  });
});
