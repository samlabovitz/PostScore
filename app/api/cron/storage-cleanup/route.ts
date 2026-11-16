// The nightly storage cleanup (lib/storageCleanup.server.ts), driven by
// netlify/functions/storage-cleanup-scheduler.mts. Same bearer-secret gate
// as the other crons (fails closed). Dry run unless STORAGE_CLEANUP_LIVE is
// "true" — or always with ?dry=1. Returns and logs counts only.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorized } from "@/app/api/cron/monthly-reports/route";
import { runStorageCleanup, storageCleanupLive } from "@/lib/storageCleanup.server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dryRun = request.nextUrl.searchParams.get("dry") === "1" || !storageCleanupLive();
  const results = await runStorageCleanup(createAdminClient(), { dryRun });
  console.log(`[storage-cleanup] ${dryRun ? "dry run" : "live"}: ${results.map((r) => `${r.rule}=${r.count}${r.detail ? `(${Object.entries(r.detail).map(([k, v]) => `${k}=${v}`).join(",")})` : ""}${r.skipped ? " (skipped)" : ""}`).join(" ")}`);
  return NextResponse.json({ dryRun, results });
}
