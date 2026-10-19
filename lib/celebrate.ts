// Small, light celebrations for the Growth page: a short confetti burst
// from an element (canvas, ~60 pieces, ~1.5 s, never blocks clicks), the
// "reduce motion" check, and "once per business per week" bookkeeping on
// this device. Plus the one rule for the weekly-goal celebration: it only
// counts real scores from scans — never "I did this" clicks.

import { readStorage, writeStorage } from "@/lib/signStudio/design";

export const CONFETTI_COLORS = ["#14243f", "#b8862f", "#e2b961", "#f7f1e3"];

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function celebrationKey(kind: "routine" | "goal", businessId: string, weekStart: string): string {
  return `postscore.celebrated.${kind}.${businessId}.${weekStart}`;
}

/** True the first time for this key (and marks it played); false after —
 * so a reload, or unchecking and re-checking, doesn't replay it. */
export function claimCelebration(key: string): boolean {
  if (readStorage(key)) return false;
  writeStorage(key, "1");
  return true;
}

/** A short burst from the middle of `rect`: pieces fly up and out, fall,
 * and fade. A fixed, click-through canvas; removed when done. */
export function confettiBurst(rect: { left: number; top: number; width: number; height: number }, pieces = 60, durationMs = 1500): void {
  if (typeof document === "undefined" || prefersReducedMotion()) return;
  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:60";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.remove();
  ctx.scale(dpr, dpr);
  const ox = rect.left + rect.width / 2;
  const oy = rect.top + rect.height / 2;
  const bits = Array.from({ length: pieces }, (_, i) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = 4 + Math.random() * 5;
    return { x: ox, y: oy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: Math.random() * 6, rot: Math.random() * Math.PI, w: 5 + Math.random() * 4, h: 3 + Math.random() * 3, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] };
  });
  const start = performance.now();
  const frame = (now: number) => {
    const t = (now - start) / durationMs;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (t >= 1) return canvas.remove();
    ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    for (const b of bits) {
      b.vy += 0.22;
      b.vx *= 0.985;
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.spin * 0.02;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ---- The weekly goal: real scan scores only ----

export interface WeekGoal {
  /** The real score when the week's goal was set. */
  start: number;
  /** The plan's projected score that week. */
  goal: number;
  /** When the goal was set (ISO). Only a scan after this can hit it. */
  setAt: string;
}

export function weekGoalKey(businessId: string, weekStart: string): string {
  return `postscore.weekGoal.${businessId}.${weekStart}`;
}

export function parseWeekGoal(raw: string | null): WeekGoal | null {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<WeekGoal>) : null;
    return v && typeof v.start === "number" && typeof v.goal === "number" && typeof v.setAt === "string" ? { start: v.start, goal: v.goal, setAt: v.setAt } : null;
  } catch {
    return null;
  }
}

/** Whether this week's goal was really hit: a re-scan after the goal was
 * set raised the real score to the goal (or past it). Clicking "I did
 * this" never changes `now` — only a scan does. */
export function goalHit(goal: WeekGoal | null, now: number, lastScanAt: string | null): { start: number; now: number; diff: number } | null {
  if (!goal || lastScanAt === null) return null;
  if (Date.parse(lastScanAt) <= Date.parse(goal.setAt)) return null;
  if (now < goal.goal || now <= goal.start) return null;
  return { start: goal.start, now, diff: now - goal.start };
}
