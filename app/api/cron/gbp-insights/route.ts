// The monthly Google insights job, one chunk of connected businesses per
// call (?offset=&limit=): for each, the month that just ended — or the
// 18-month backfill when nothing is stored yet — via
// lib/gbpInsights.server.ts. Driven on the 1st of every month by
// netlify/functions/gbp-insights-scheduler.mts → gbp-insights-batch.mts.
// Same bearer-secret gate as the monthly reports (fails closed).
//
// No user session: the service-role client, only for business ids from
// this route's own gbp_connections query. A failure leaves that business's
// stored months as they were and is logged; the next business goes on.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorized } from "@/app/api/cron/monthly-reports/route";
import { connectedBusinessIds, runMonthlyInsightsForBusiness } from "@/lib/gbpInsights.server";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 25;

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const offset = Math.max(0, Number.parseInt(params.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(params.get("limit") ?? "10", 10) || 10));
  const admin = createAdminClient();
  const ids = await connectedBusinessIds(admin, offset, limit);
  const results: Array<{ businessId: string; status: string; detail?: string }> = [];
  for (const businessId of ids) {
    try {
      const run = await runMonthlyInsightsForBusiness(admin, businessId);
      results.push({ businessId, status: run.status === "busy" ? "skipped" : run.status, detail: run.status === "failed" ? run.step : run.status === "skipped" ? run.reason : run.status === "busy" ? "busy" : undefined });
      if (run.status !== "ok") console.warn(`[cron/gbp-insights] ${businessId}: ${run.status}${run.status === "failed" ? ` (${run.step})` : ""} — stored months kept`);
    } catch (err) {
      results.push({ businessId, status: "failed", detail: "error" });
      console.error(`[cron/gbp-insights] ${businessId}: ${err instanceof Error ? err.message.slice(0, 120) : "error"} — stored months kept`);
    }
  }
  return NextResponse.json({ pageSize: ids.length, hasMore: ids.length === limit, results });
}
