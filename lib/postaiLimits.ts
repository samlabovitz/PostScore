// Grow's PostAI limit: 100 questions per business per calendar month (UTC,
// like the other monthly budgets) — Settings → Compare plans: "Monthly
// limit". Free has its own weekly allowance (lib/freeAiAllowance.ts);
// Premium and Multi are unlimited. Counted on the server before the AI is
// called: an answer PostAI actually saved is one question, so a failed
// call never counts. Pure.

import { monthStartUtc, nextMonthStartUtc } from "@/lib/placesSearchBudget";
import type { Plan } from "@/lib/plan";

export const GROW_POSTAI_MONTHLY = 100;

/** The monthly question limit for a plan; null = none (Free counts weekly, Premium/Multi unlimited). */
export function postaiMonthlyLimit(plan: Plan): number | null {
  return plan === "grow" ? GROW_POSTAI_MONTHLY : null;
}

export function postaiMonth(now: Date): { start: string; resetsAt: string } {
  return { start: monthStartUtc(now), resetsAt: nextMonthStartUtc(now) };
}

/** Questions left this month (never negative). */
export function postaiMonthlyLeft(limit: number, used: number): number {
  return Math.max(0, limit - Math.max(0, used));
}
