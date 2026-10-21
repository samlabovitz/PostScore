"use server";

// Weekly recap server actions — "Since your last visit" and "Show older"
// past reports. The work lives in lib/weekly/weeklyData.server.ts, loaded
// only when an action runs, so client components can import these.

import { createClient } from "@/lib/supabase/server";
import type { PastReport, VisitResult } from "@/lib/weekly/weeklyData.server";

export type { PastReport, VisitResult, SinceLastVisitData } from "@/lib/weekly/weeklyData.server";

/** The first time a business is opened in a browser session: records the
 * visit and returns the "Since your last visit" data when it's due. */
export async function openBusinessVisit(businessId: string): Promise<VisitResult | { status: "unauthenticated" }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  const [{ openBusinessVisitWithClient }, { getReportData }] = await Promise.all([import("@/lib/weekly/weeklyData.server"), import("@/lib/reports/reportData.server")]);
  // One report load for both the next steps and the review goal.
  let report: ReturnType<typeof getReportData> | null = null;
  const loadReport = () => (report ??= getReportData(businessId));
  return openBusinessVisitWithClient(supabase, user.id, businessId, {
    nextSteps: async () => {
      const r = await loadReport();
      return r.status === "ok" ? r.data.nextSteps : [];
    },
    reviewGoalLines: async () => {
      const r = await loadReport();
      return r.status === "ok" ? (r.data.reviews.goalLines ?? []) : [];
    },
  });
}

/** "Show older" / the year filter on Past reports (12 at a time). */
export async function getPastReports(businessId: string, offset: number, year: number | null): Promise<{ rows: PastReport[]; total: number } | { status: "unauthenticated" }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  const { getPastReportsWithClient } = await import("@/lib/weekly/weeklyData.server");
  return getPastReportsWithClient(supabase, businessId, offset, year);
}

/** "Run a fresh scan" from the pop-up — the normal full re-scan (its
 * 1-a-day limit applies), loaded on demand. */
export async function runFreshScan(businessId: string): Promise<{ status: string }> {
  const { rescanBusiness } = await import("@/app/actions/scoring");
  const result = await rescanBusiness(businessId);
  return { status: result.status };
}
