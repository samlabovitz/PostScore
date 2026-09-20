// Dev/admin-only single-business test send. Lets you verify one real
// business's monthly report — real re-scan, real content build, real
// render, real subject line, real Resend send, real monthly_reports
// reservation row — WITHOUT triggering the full batch route above, which
// processes every business with monthly_report_enabled = true. Reuses
// processBusiness() from the parent cron route completely unchanged, so
// this is provably the exact same real send path the production batch
// uses, never a second reimplementation that could drift from it.
//
// Gated by the same CRON_SECRET bearer check as the batch route (see
// isAuthorized there) — the one thing standing between this and a real,
// live send to a real owner's real inbox, so it can't fire by accident.
// Nothing here reads or validates monthly_report_enabled or
// MONTHLY_REPORTS_LIVE — this is a deliberate, explicit, one-business
// test call, not a policy decision about whether reports are "live" for
// real users, so it isn't gated by that flag. Only ever call this with a
// businessId you already know is a safe test business.
//
// The locale is never a separate parameter here — it comes from the
// SAME place the batch route reads it from inside processBusiness
// (the business's own real businesses.language column, run through
// normalizeLocale()), so this can't drift from the real send path either.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorized, processBusiness, type CronRunResult } from "../route";

export const dynamic = "force-dynamic";

async function handleSendOne(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be JSON: { "businessId": "..." }' },
      { status: 400 }
    );
  }

  const businessId = (body as { businessId?: unknown } | null)?.businessId;
  if (typeof businessId !== "string" || businessId.trim().length === 0) {
    return NextResponse.json(
      { error: "businessId (string) is required in the request body." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const now = new Date();
  // Same "start of this calendar month" cutoff processBusiness's own
  // idempotency check uses in the batch route — computed the same way
  // here so a test call is honestly subject to the same real guard.
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

  const result: CronRunResult = await processBusiness(supabase, businessId, startOfMonth.toISOString(), now);

  return NextResponse.json(result);
}

// POST only, deliberately — same reasoning as the batch route: this
// sends real email and writes a real row, so it should never be
// reachable by a plain GET (a crawler, a prefetch, a browser visit while
// debugging the secret).
export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleSendOne(request);
}
