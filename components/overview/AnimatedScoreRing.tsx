"use client";

// The Overview's hero score ring. The server renders the final, real
// score (no hydration mismatch). Every time the owner lands on or returns
// to the Overview — a full load, client-side navigation back, or the
// browser's back/forward cache — the ring fills and the number counts up
// from 0 to that same score (~1.2 s, ease-out), then a short glow when it
// lands. Never on in-page updates (a re-scan just shows the new number).
// "Reduce motion": the final state, instantly. Fixed size and tabular
// numerals, so nothing shifts while it animates.

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const VIEWBOX = 200;
const RADIUS = 84;
const STROKE = 14;
/** The thin dark track for the missing part. */
const TRACK = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
export const SCORE_ANIMATION_MS = 1200;
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Ease-out (cubic): fast at first, settling on the score. */
export function easeOutCubic(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return 1 - Math.pow(1 - p, 3);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Kept for links that still pass ?animate=1 — every visit animates now. */
export function animationSeenKey(businessId: string): string {
  return `postscore:overview-score-animated:${businessId}`;
}

export interface ScoreAnimationDeps {
  reducedMotion: boolean;
  now: () => number;
  requestFrame: (cb: (now: number) => void) => number;
  cancelFrame: (id: number) => void;
  setTimer: (cb: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
  setShown: (value: number) => void;
  setLanded: (value: boolean) => void;
}

/** One play: 0 → `target` over SCORE_ANIMATION_MS (ease-out), then the
 * landing pulse; with reduce motion, the final state at once. Returns a
 * stop function (route change, a replay). */
export function runScoreAnimation(target: number, d: ScoreAnimationDeps): () => void {
  if (d.reducedMotion) {
    d.setShown(target);
    d.setLanded(false);
    return () => {};
  }
  let frame = 0;
  let landTimer: unknown = null;
  d.setLanded(false);
  d.setShown(0);
  const start = d.now();
  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / SCORE_ANIMATION_MS);
    d.setShown(Math.round(target * easeOutCubic(progress)));
    if (progress < 1) frame = d.requestFrame(tick);
    else {
      d.setLanded(true);
      landTimer = d.setTimer(() => d.setLanded(false), 700);
    }
  };
  frame = d.requestFrame(tick);
  return () => {
    d.cancelFrame(frame);
    if (landTimer !== null) d.clearTimer(landTimer);
  };
}

export function AnimatedScoreRing({ score, size = 176 }: { score: number; businessId?: string; size?: number }) {
  const [shown, setShown] = useState(score);
  const [landed, setLanded] = useState(false);
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const gradientId = `ps-score-gold-${useId().replace(/:/g, "")}`;

  // On mount (every visit — this component remounts on every route
  // return) and on a back/forward-cache restore: count up from 0.
  useIsoLayoutEffect(() => {
    let stop = () => {};
    const play = () => {
      stop();
      stop = runScoreAnimation(scoreRef.current, {
        reducedMotion: prefersReducedMotion(),
        now: () => performance.now(),
        requestFrame: (cb) => requestAnimationFrame(cb),
        cancelFrame: (id) => cancelAnimationFrame(id),
        setTimer: (cb, ms) => setTimeout(cb, ms),
        clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
        setShown,
        setLanded,
      });
    };
    play();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) play();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      stop();
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  // A later update (after a re-scan) shows the new score directly — the
  // first run (mount) is skipped so it never cuts the intro short.
  const firstScoreRun = useRef(true);
  useEffect(() => {
    if (firstScoreRun.current) {
      firstScoreRun.current = false;
      return;
    }
    setShown(score);
  }, [score]);

  const clamped = Math.max(0, Math.min(100, shown));
  return (
    <div data-testid="score-ring" className="relative shrink-0" style={{ width: size, height: size }}>
      {/* The soft gold glow behind the ring. */}
      <div aria-hidden className={`ps-score-glow absolute inset-4 rounded-full ${landed ? "ps-score-glow-land" : ""}`} />
      <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} width={size} height={size} className="relative -rotate-90" aria-hidden>
        <defs>
          {/* Lighter → deeper brand gold along the stroke. */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: "color-mix(in srgb, var(--color-brass) 55%, white)" }} />
            <stop offset="100%" style={{ stopColor: "color-mix(in srgb, var(--color-brass) 85%, black)" }} />
          </linearGradient>
        </defs>
        <circle cx={VIEWBOX / 2} cy={VIEWBOX / 2} r={RADIUS} strokeWidth={TRACK} fill="none" stroke="rgba(0, 0, 0, 0.32)" />
        <circle
          data-testid="score-ring-arc"
          cx={VIEWBOX / 2}
          cy={VIEWBOX / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped / 100)}
          style={{ filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--color-brass) 45%, transparent))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" role="img" aria-label={`${score} / 100`}>
        <div
          data-testid="score-number"
          className={`min-w-[3ch] text-center font-serif text-[54px] font-bold leading-none tabular-nums text-paper ${landed ? "ps-score-land" : ""}`}
        >
          {shown}
        </div>
        <div className="mt-1 text-[13px] font-medium text-[color:color-mix(in_srgb,var(--color-paper)_60%,transparent)]">/100</div>
      </div>
    </div>
  );
}
