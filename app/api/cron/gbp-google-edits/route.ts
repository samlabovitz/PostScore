// The daily check for Google's own edits, one chunk of connected
// businesses per call (?offset=&limit=): for each, getGoogleUpdated vs the
// owner's values (lib/gbpGoogleEdits.server.ts). Driven once a day by
// netlify/functions/gbp-google-edits-scheduler.mts → gbp-google-edits-batch.mts.
// Same bearer-secret gate as the monthly reports (fails closed).
//
// No user session: the service-role client, only for business ids from
// gbp_connections. A failure leaves that business's rows as they were and
// is logged; the next business goes on.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorized } from "@/app/api/cron/monthly-reports/route";
import { connectedBusinessIds } from "@/lib/gbpInsights.server";
import { checkGoogleEdits } from "@/lib/gbpGoogleEdits.server";

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
      const run = await checkGoogleEdits(admin, businessId);
      results.push({ businessId, status: run.status, detail: run.status === "failed" ? run.error : run.status === "ok" ? `${run.open.length} open` : undefined });
      if (run.status === "failed") console.warn(`[cron/gbp-google-edits] ${businessId}: ${run.error} — rows kept`);
    } catch (err) {
      results.push({ businessId, status: "failed", detail: "error" });
      console.error(`[cron/gbp-google-edits] ${businessId}: ${err instanceof Error ? err.message.slice(0, 120) : "error"} — rows kept`);
    }
  }
  return NextResponse.json({ pageSize: ids.length, hasMore: ids.length === limit, results });
}
