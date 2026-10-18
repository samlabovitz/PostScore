import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCompetitorScoringJob } from "@/lib/competitorScoringJob";

// One step of a scan's full competitor scoring: scores at most ONE
// competitor site, saves it, and reports progress. Called repeatedly by
//.netlify/functions/competitor-scoring-batch.mts (a standard
// function has a short time limit; one site's analysis fits, a whole scan
// may not). Secret-protected like the monthly-report cron route.

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { scanId?: unknown } | null;
  const scanId = typeof body?.scanId === "string" && /^[0-9a-f-]{36}$/i.test(body.scanId) ? body.scanId : null;
  if (!scanId) return NextResponse.json({ error: "scanId required" }, { status: 400 });
  const outcome = await runCompetitorScoringJob(createAdminClient(), scanId, { maxSites: 1 });
  return NextResponse.json(outcome);
}
