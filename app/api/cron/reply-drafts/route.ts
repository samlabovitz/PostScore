// The daily review reply drafts (lib/replyBatch.server.ts), driven by
// netlify/functions/reply-drafts-scheduler.mts. Same bearer-secret gate as the
// other crons (fails closed). For every business with Google connected: reads
// its reviews live, writes the drafts that are missing or out of date. Never
// posts anything; never stores review text. Logs counts only.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorized } from "@/app/api/cron/monthly-reports/route";
import { writeReplyDrafts } from "@/lib/replyBatch.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data } = await admin.from("gbp_connections").select("business_id").eq("status", "connected");
  const ids = ((data ?? []) as Array<{ business_id: string }>).map((r) => r.business_id);
  const totals = { businesses: ids.length, written: 0, kept: 0, removed: 0, skipped: 0 };
  for (const id of ids) {
    const r = await writeReplyDrafts(admin, id).catch(() => ({ status: "skipped" as const, reason: "failed" as const }));
    if (r.status === "ok") {
      totals.written += r.written;
      totals.kept += r.kept;
      totals.removed += r.removed;
    } else totals.skipped++;
  }
  console.log(`[reply-drafts] ${totals.businesses} businesses: ${totals.written} written, ${totals.kept} kept, ${totals.removed} removed, ${totals.skipped} skipped`);
  return NextResponse.json(totals);
}
