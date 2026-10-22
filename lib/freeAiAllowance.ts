// Free plan AI allowance: 3 PostAI questions and 3 review reply drafts per
// business per week, plus a spending guard across all Free accounts.
// Pure — the counting lives in lib/freeAiUsage.server.ts.
//
// The week runs on the Free re-scan clock (lib/rescanPolicy.ts,
// FREE_RESCAN_DAYS): it starts at the business's last owner re-scan (or,
// before any, its first scan) and repeats every 7 days from there, whether
// or not the owner re-scans again — so "resets {date}" is the same date
// the Overview shows for the next free re-scan.

import { FREE_RESCAN_DAYS } from "@/lib/rescanPolicy";
import { monthStartUtc, nextMonthStartUtc } from "@/lib/placesSearchBudget";

export type FreeAiKind = "postai" | "reply_draft";

/** Free questions / drafts per week, each. */
export const FREE_AI_WEEKLY = 3;
/** Free PostAI + reply-draft calls per month across ALL Free accounts. */
export const DEFAULT_FREE_AI_MONTHLY_CAP = 500;

const WEEK_MS = FREE_RESCAN_DAYS * 86_400_000;

export function freeAiMonthlyCap(env: Record<string, string | undefined> = process.env): number {
  const raw = Number.parseInt(env.FREE_AI_MONTHLY_CAP ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_FREE_AI_MONTHLY_CAP;
}

/** The current week: from the anchor (last owner re-scan, else first
 * scan; none → now) in 7-day steps. */
export function allowanceWindow(anchor: string | null, now: Date): { start: string; resetsAt: string } {
  const a = anchor ? Date.parse(anchor) : NaN;
  const base = Number.isFinite(a) && a <= now.getTime() ? a : now.getTime();
  const weeks = Math.floor((now.getTime() - base) / WEEK_MS);
  const start = base + weeks * WEEK_MS;
  return { start: new Date(start).toISOString(), resetsAt: new Date(start + WEEK_MS).toISOString() };
}

/** The spending guard's month (UTC, like Google and Anthropic bill). */
export function capMonth(now: Date): { start: string; resumesAt: string } {
  return { start: monthStartUtc(now), resumesAt: nextMonthStartUtc(now) };
}

export type FreeAiAllowance =
  | { status: "ok"; left: number; resetsAt: string }
  /** The month's Free AI budget is used up — paused until `until`. */
  | { status: "paused"; left: number; resetsAt: string; until: string }
  /** supabase/free-ai-usage.sql hasn't been run, or the count failed. */
  | { status: "unavailable" };

/** Questions / drafts left this week (never negative). */
export function allowanceLeft(usedThisWeek: number): number {
  return Math.max(0, FREE_AI_WEEKLY - Math.max(0, usedThisWeek));
}
