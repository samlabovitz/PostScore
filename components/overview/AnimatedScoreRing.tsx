"use client";

// The Overview's hero score ring. The server renders the final, real
// score (no hydration mismatch); on the browser's FIRST view of this
// business the ring fills and the number counts up to that same score
// over ~1s, once. Never on later in-page updates (a re-scan just shows
// the new number), never with "reduce motion". To replay: add
// ?animate=1 to the Overview URL, or clear this site's local storage.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

const VIEWBOX = 200;
const RADIUS = 84;
const STROKE = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const DURATION_MS = 1000;
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function animationSeenKey(businessId: string): string {
  return `postscore:overview-score-animated:${businessId}`;
}

export function AnimatedScoreRing({ score, businessId, size = 176 }: { score: number; businessId: string; size?: number }) {
  const [shown, setShown] = useState(score);
  const animatedOnce = useRef(false);
  const searchParams = useSearchParams();
  const forceReplay = searchParams?.get("animate") === "1";

  // First view only: start from 0 before the first paint, then count up.
  useIsoLayoutEffect(() => {
    if (animatedOnce.current) return;
    animatedOnce.current = true;
    let seen = false;
    try {
      seen = window.localStorage.getItem(animationSeenKey(businessId)) === "1";
    } catch {
      seen = false;
    }
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if ((seen && !forceReplay) || reduceMotion) return;
    try {
      window.localStorage.setItem(animationSeenKey(businessId), "1");
    } catch {
      // storage unavailable — the animation just plays again next time
    }
    setShown(0);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(score * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Runs once per mount — later score updates just show the new value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div aria-hidden className="absolute inset-3 rounded-full bg-[color:color-mix(in_srgb,var(--color-brass)_20%,transparent)] blur-2xl" />
      <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} width={size} height={size} className="relative -rotate-90" aria-hidden>
        <circle cx={VIEWBOX / 2} cy={VIEWBOX / 2} r={RADIUS} strokeWidth={STROKE} fill="none" stroke="var(--color-paper)" strokeOpacity={0.14} />
        <circle
          cx={VIEWBOX / 2}
          cy={VIEWBOX / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          fill="none"
          stroke="var(--color-brass)"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" role="img" aria-label={`${score} / 100`}>
        <div className="font-serif text-[52px] font-bold leading-none tabular-nums text-paper">{shown}</div>
        <div className="mt-1 text-[13px] text-[color:color-mix(in_srgb,var(--color-paper)_70%,transparent)]">/ 100</div>
      </div>
    </div>
  );
}
