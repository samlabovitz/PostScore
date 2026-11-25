"use client";

// Day 25B step 4: what the two-tab sidebar shows beside its tabs — the
// saved scan's score and grade (Presence), the plan (Free locks) and the
// dev "Test account" tag. Loaded once by the business layout
// (lib/shellData.server.ts) and only on the new-design preview; null
// everywhere else.

import { createContext, useContext, type ReactNode } from "react";
import type { Plan } from "@/lib/plan";

export interface ShellData {
  /** The latest saved scan; null before the first scan (or website only). */
  presence: { score: number; grade: string } | null;
  plan: Plan;
  /** The dev test login under `next dev`: the "Test account" tag. */
  testAccount: boolean;
  /** The Reports "New" dot (lib/reportDot.ts). */
  reportsNew?: boolean;
  /** "How your two scores work together" was hidden by this user (their own account metadata, every business). */
  twoScoresHidden?: boolean;
  /** The real Growth tier (lib/growthPlan.server.ts); null on Free ("?") or when it couldn't load. */
  growth?: { tier: 1 | 2 | 3 | 4 | 5; warning: boolean; preview: boolean } | null;
}

const Ctx = createContext<ShellData | null>(null);

export function ShellDataProvider({ value, children }: { value: ShellData | null; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShellData(): ShellData | null {
  return useContext(Ctx);
}
