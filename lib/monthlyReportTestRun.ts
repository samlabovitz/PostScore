// Testing mode for the monthly report job (MONTHLY_REPORTS_LIVE not exactly
// "true" — see lib/reportSendPolicy.ts): which businesses get a test report
// this month.
// Shared by the scheduled run (app/api/cron/monthly-reports/route.ts) and
// scripts/preview-report.ts --testing-mode, so the preview shows the real
// pick. Reads with the service-role client; never writes.

import type { SupabaseClient } from "@supabase/supabase-js";
import { pickTestBusinesses } from "./reportSendPolicy";

export const TEST_PICK_COUNT = 3;
/** Testing mode reuses a saved score younger than this instead of paying
 * for a re-scan (Places Details + PageSpeed). */
export const TEST_RESCAN_MAX_AGE_DAYS = 30;

/** The latest saved score's id when it's under TEST_RESCAN_MAX_AGE_DAYS
 * old, else null (a re-scan is due). */
export async function readRecentScoreId(supabase: SupabaseClient, businessId: string, now: Date): Promise<string | null> {
  const { data } = await supabase
    .from("scores")
    .select("id, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const ageMs = now.getTime() - new Date(data.created_at).getTime();
  return ageMs < TEST_RESCAN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000 ? data.id : null;
}

/** "YYYY-MM" (UTC) for `now`, shifted by `deltaMonths`. */
export function runMonth(now: Date, deltaMonths = 0): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface TestRunPlan {
  picked: Array<{ id: string; name: string | null }>;
  /** Last month's picks (avoided when there are enough others). */
  lastMonth: string[];
  /** This month's picks were already made (and sent) — null if not. */
  alreadyPicked: string[] | null;
  /** monthly_report_test_runs can't be read (supabase/monthly-report-test-runs.sql not run yet). */
  noHistoryTable: boolean;
}

/** Which businesses testing mode picks this month — random, scored, with
 * a Google listing, avoiding last month's picks. Read-only. */
export async function planTestRun(supabase: SupabaseClient, now: Date, random: () => number = Math.random): Promise<TestRunPlan> {
  const { data: history, error: historyError } = await supabase
    .from("monthly_report_test_runs")
    .select("run_month, business_ids")
    .in("run_month", [runMonth(now), runMonth(now, -1)]);
  const rows = (history ?? []) as Array<{ run_month: string; business_ids: string[] }>;
  const thisMonth = rows.find((r) => r.run_month === runMonth(now));
  const lastMonth = rows.find((r) => r.run_month === runMonth(now, -1))?.business_ids ?? [];

  const { data: scored } = await supabase.from("scores").select("business_id").limit(100_000);
  const scoredIds = Array.from(new Set(((scored ?? []) as Array<{ business_id: string }>).map((r) => r.business_id)));
  const { data: businesses } = scoredIds.length
    ? await supabase.from("businesses").select("id, name, listing_mode").in("id", scoredIds)
    : { data: [] };
  const eligible = ((businesses ?? []) as Array<{ id: string; name: string | null; listing_mode: string | null }>).filter(
    (b) => b.listing_mode !== "website_only"
  );
  const names = new Map(eligible.map((b) => [b.id, b.name]));
  const ids = pickTestBusinesses(eligible.map((b) => b.id), lastMonth, TEST_PICK_COUNT, random);
  return {
    picked: ids.map((id) => ({ id, name: names.get(id) ?? null })),
    lastMonth,
    alreadyPicked: thisMonth?.business_ids ?? null,
    noHistoryTable: !!historyError,
  };
}
