// The Monday Growth tier recompute (lib/growthTierRun.server.ts), driven by
// netlify/functions/growth-tiers-scheduler.mts. Same bearer-secret gate as
// the other crons (fails closed). Dry run unless GROWTH_TIERS_LIVE is "true"
// — or always with ?dry=1. Returns and logs counts only; never emails or
// notifies anyone.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorized } from "@/app/api/cron/monthly-reports/route";
import { growthTiersLive, runGrowthTiers } from "@/lib/growthTierRun.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dryRun = request.nextUrl.searchParams.get("dry") === "1" || !growthTiersLive();
  const s = await runGrowthTiers(createAdminClient(), { dryRun });
  console.log(`[growth-tiers] ${dryRun ? "dry run" : "live"} ${s.monday}: ${s.businesses} businesses, tiers ${[1, 2, 3, 4, 5].map((t) => s.byTier[t]).join("/")}, ${s.ups} up, ${s.downs} down, ${s.warnings} warnings, ${s.written} written`);
  return NextResponse.json(s);
}
