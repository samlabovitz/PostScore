// The monthly report cron ORCHESTRATION route — for every business with
// monthly_report_enabled = true, run a real automatic re-scan, build
// this month's honest report content, email it to the real owner, and
// log it — using the EXACT SAME scan/scoring/diffing logic the manual
// "Re-scan now" button and Competitors page use (see
// app/actions/scoring.ts's *WithClient exports and
// app/actions/competitors.ts's *WithClient exports), never a second
// reimplementation that could drift from those on a future honesty fix.
// The in-app teaser UI is a separate piece (see
// components/reports/MonthlyEmailReportCard.tsx — already built). The
// real trigger is netlify/functions/monthly-reports-scheduler.mts +
// netlify/functions/monthly-reports-batch.mts — see those files for why
// this route is driven in small chunks rather than called once a month
// with no limit.
//
// No user session exists in a cron context, so this runs with the
// service-role admin client (lib/supabase/admin.ts) — the system acting
// for many owners at once, not one logged-in owner via RLS. Every write
// this route makes is therefore only as safe as the businessId it's
// currently iterating, which comes from this route's own trusted
// `monthly_report_enabled = true` query, never from client input.
//
// TIMING/COST: a single business's real re-scan can legitimately take up
// to ~30s on its own (lib/websiteAnalysis.ts's PAGESPEED_TIMEOUT_MS is
// 30000ms, and a slow-but-not-erroring PageSpeed call genuinely takes
// that long before this route can honestly report it as unmeasured —
// see lib/websiteAnalysis.ts), on top of an HTML fetch (up to ~8s, with
// one retry), an HTTPS probe (~5s), a sitemap fetch (~6s), a Google
// Places Details call, and — when this business has ever used the
// Competitors feature — up to MAX_COMPETITORS (10) SEQUENTIAL Places
// Details calls (lib/competitors.ts's findAndScoreCompetitors is
// deliberately sequential, "so a single failed lookup is easy to
// isolate"). Several of these run in parallel inside
// saveBusinessWithClient, but PageSpeed's own worst case alone can
// already approach or exceed a standard Netlify Function's synchronous
// duration limit. Netlify's current Next.js Runtime has deprecated
// support for configuring a Next.js API Route itself as a Background
// Function (that mechanism only applies to an older runtime version) —
// so this route stays a standard function, processed a handful of
// businesses at a time via the `limit`/`offset` query params below,
// driven by a genuine Netlify Background Function that has its own
// 15-minute budget to make many small, safe calls here. See
// netlify/functions/monthly-reports-batch.mts's own top comment for the
// full reasoning.
import { timingSafeEqual } from "crypto";
import { createElement } from "react";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rescanBusinessWithClient, type RescanBusinessResult } from "@/app/actions/scoring";
import { saveCompetitorScanWithClient } from "@/app/actions/competitors";
import {
  buildMonthlyReportContent,
  type CompetitorDelta,
  type CompetitorSnapshot,
  type MonthlyReportScoreRow,
} from "@/lib/monthlyReport";
import type { Grade } from "@/lib/scoring";
import { MonthlyReportEmail, monthlyReportSubject } from "@/emails/MonthlyReportEmail";
import { sendEmail } from "@/lib/email";
import { normalizeLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Bearer-secret auth — reject anything without the exact right secret.
// Constant-time comparison so a wrong guess can't be narrowed down by
// response-timing side channel, same discipline as any credential check.
// ---------------------------------------------------------------------------

// Exported so the dev-only single-business test route
// (app/api/cron/monthly-reports/send-one/route.ts) can reuse the EXACT
// same bearer-secret gate — never a second, separately-typed-out check
// that could drift from this one (e.g. quietly forgetting the
// timing-safe comparison).
export function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Never treat "not configured" as "no secret required" — an unset
    // CRON_SECRET must fail closed, not open.
    console.error("[cron/monthly-reports] CRON_SECRET is not configured — rejecting all requests.");
    return false;
  }

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);

  // timingSafeEqual throws on mismatched lengths rather than returning
  // false, so that has to be checked first — a length mismatch is itself
  // safe to leak (it reveals nothing about the real secret's content).
  if (headerBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(headerBuf, expectedBuf);
}

// ---------------------------------------------------------------------------
// Real per-business result shapes — a business can end in exactly one of
// these three states, and "sent" is only ever recorded once the send
// genuinely succeeded (see sendEmail's own never-throws contract in
// lib/email.ts) — never optimistically before that.
// ---------------------------------------------------------------------------

// Exported for the same reason as isAuthorized above — the single-business
// test route returns this exact shape rather than a separately-typed one.
export interface CronRunResult {
  businessId: string;
  status: "sent" | "skipped" | "failed";
  reason?: string;
}

interface CronRunSummary {
  /** How many businesses were in THIS page (after limit/offset) — never
   * a total across every eligible business site-wide, since a single
   * limit/offset query never computes that separately. A chunked caller
   * (netlify/functions/monthly-reports-batch.mts) uses this — together
   * with `hasMore` — to know when to stop paginating, never by guessing
   * from `processed` (which only reflects businesses this call actually
   * got through before returning, not the page's real size). */
  pageSize: number;
  /** True when this page came back exactly as large as requested,
   * meaning there's likely at least one more business past it worth a
   * follow-up call at the next offset. False (a short or empty page) is
   * the reliable "that was the last page" signal — comparing offsets or
   * counts across separate calls is not, since eligibility
   * (monthly_report_enabled = true) doesn't shrink as reports go out
   * within a single run. */
  hasMore: boolean;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  results: CronRunResult[];
}

/** One real saved score row, read directly off `scores` — the same
 * columns MonthlyReportScoreRow needs, including the full real
 * breakdown_json every `scores` row has always stored. */
async function readScoreRow(
  supabase: ReturnType<typeof createAdminClient>,
  scoreId: string
): Promise<MonthlyReportScoreRow | null> {
  const { data, error } = await supabase
    .from("scores")
    .select("id, total, grade, created_at, breakdown_json, profile_snapshot_json")
    .eq("id", scoreId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    total: data.total,
    // Always genuinely one of the five real grades — scoreBusiness()'s
    // own gradeFromTotal() is the only thing that ever writes this
    // column, so this narrowing cast reflects a real write-time
    // guarantee, not an unchecked assumption.
    grade: data.grade as Grade,
    createdAt: data.created_at,
    profileSnapshot: data.profile_snapshot_json,
    breakdown: data.breakdown_json,
  };
}

/** The real competitor standing from one specific saved scan (all rows
 * sharing one scan_id) — rank/totalCompetitors/topCompetitorReviewCount
 * computed the exact same way getLocalBenchmark (app/actions/competitors.ts)
 * already does: sort the scan's own rows by real PostScore, find the
 * subject's position. null only when the scan genuinely has no rows for
 * this business (shouldn't happen for a real scan_id, but never assumed). */
async function readCompetitorSnapshotForScan(
  supabase: ReturnType<typeof createAdminClient>,
  businessId: string,
  scanId: string
): Promise<CompetitorSnapshot | null> {
  const { data, error } = await supabase
    .from("competitor_scans")
    .select("is_subject, total, review_count")
    .eq("business_id", businessId)
    .eq("scan_id", scanId);

  if (error || !data || data.length === 0) return null;

  const sorted = [...data].sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  const subjectRank = sorted.findIndex((r) => r.is_subject);
  if (subjectRank === -1) return null;

  return {
    rank: subjectRank + 1,
    totalCompetitors: sorted.length,
    topCompetitorReviewCount: sorted[0]?.review_count ?? null,
  };
}

/**
 * The real competitor standing as of the LAST scan saved at or before
 * `cutoffIso` — used to find "what did competitor standing look like
 * around last month's report," since monthly_reports doesn't (yet) store
 * a direct competitor-scan pointer the way it does baseline_score_id/
 * current_score_id for scores. This is an honest best-effort heuristic,
 * not a guaranteed-aligned baseline: if the owner never saved a
 * competitor scan before that cutoff, this honestly returns null and the
 * report shows competitor movement as unavailable rather than fabricate
 * a "previous" rank that was never real at that point in time.
 */
async function readCompetitorSnapshotAsOf(
  supabase: ReturnType<typeof createAdminClient>,
  businessId: string,
  cutoffIso: string
): Promise<CompetitorSnapshot | null> {
  const { data, error } = await supabase
    .from("competitor_scans")
    .select("scan_id")
    .eq("business_id", businessId)
    .lte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return readCompetitorSnapshotForScan(supabase, businessId, data.scan_id);
}

function describeRescanFailure(result: RescanBusinessResult): string {
  switch (result.status) {
    case "not_found":
      return "rescan: business not found";
    case "unauthenticated":
      // Structurally unreachable via rescanBusinessWithClient (it never
      // checks a session), kept only because RescanBusinessResult's type
      // is shared with the interactive path — see rescanBusinessWithClient's
      // doc comment in app/actions/scoring.ts.
      return "rescan: unauthenticated (unexpected via admin client)";
    case "no_results":
      return "rescan: Google Places returned no results for this business's saved place_id";
    case "error":
      return `rescan: ${result.message}`;
    default:
      // "ok" never reaches here — the caller only calls this after
      // checking result.status !== "ok" — but the shared type still
      // includes it, so this stays exhaustive rather than relying on
      // callers to never pass it.
      return `rescan: unexpected status "${result.status}"`;
  }
}

/**
 * Processes exactly one business: idempotency check, real re-scan,
 * real optional competitor scan, real baseline lookup, real content
 * build, real send, real log — every step using the same reused
 * *WithClient logic the manual paths use. Never throws: every failure
 * mode is caught by the caller's per-business try/catch (see POST
 * below), so one business's real scan/send failure can never take down
 * the whole run.
 *
 * Exported so the dev-only single-business test route
 * (app/api/cron/monthly-reports/send-one/route.ts) can call the EXACT
 * same real render/subject/send/reservation logic for one businessId —
 * never a second reimplementation that could drift from this one. That
 * also means it inherits this function's own idempotency guard as-is: if
 * this business already has a monthly_reports row for the current
 * calendar month, a test call returns "skipped" rather than sending
 * again — the same real behavior a production run would have.
 */
export async function processBusiness(
  supabase: ReturnType<typeof createAdminClient>,
  businessId: string,
  startOfMonthIso: string,
  now: Date
): Promise<CronRunResult> {
  // 3a. Idempotency first — a retry or double-trigger must never
  // double-send. Checked against the real table, not an in-memory guess.
  // This is a cheap early-exit, not the actual guarantee: it's a plain
  // check-then-act read, so two truly concurrent runs could both pass it
  // before either has written a row. The real guarantee is the
  // reservation insert further down (3f) racing against a DB-level
  // unique index (see supabase/schema.sql) — this pre-check just avoids
  // paying for a real re-scan on every retry of a business that's
  // obviously already done for the month.
  const { data: alreadySent, error: alreadySentError } = await supabase
    .from("monthly_reports")
    .select("id")
    .eq("business_id", businessId)
    .gte("sent_at", startOfMonthIso)
    .limit(1)
    .maybeSingle();

  if (alreadySentError) {
    return { businessId, status: "failed", reason: `idempotency check failed: ${alreadySentError.message}` };
  }
  if (alreadySent) {
    return { businessId, status: "skipped", reason: "a monthly_reports row already exists for this business this calendar month" };
  }

  // 3d. The baseline is the PREVIOUS monthly_reports row's
  // current_score_id — never an arbitrary date lookback. Looked up
  // before the re-scan below so "previous" unambiguously means "before
  // this run," never accidentally this run's own new row.
  const { data: previousReport, error: previousReportError } = await supabase
    .from("monthly_reports")
    .select("current_score_id, sent_at")
    .eq("business_id", businessId)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousReportError) {
    return { businessId, status: "failed", reason: `baseline lookup failed: ${previousReportError.message}` };
  }

  let baselineRow: MonthlyReportScoreRow | null = null;
  if (previousReport) {
    baselineRow = await readScoreRow(supabase, previousReport.current_score_id);
    if (!baselineRow) {
      // A previous report row exists but its own score row is missing —
      // a real data-integrity problem, not a genuine first report. Fail
      // honestly rather than silently rendering this as a fabricated
      // "baseline" report.
      return {
        businessId,
        status: "failed",
        reason: `previous monthly_reports row references missing score ${previousReport.current_score_id}`,
      };
    }
  }

  // 3b. The real automatic re-scan — the exact same Google refetch →
  // save → score sequence "Re-scan now" runs, so every honesty rail
  // (PageSpeed timeout → "not measured this period," screenshot capture-
  // once/30-day cooldown, etc.) is inherited for free, never reimplemented.
  const rescanResult = await rescanBusinessWithClient(supabase, businessId);
  if (rescanResult.status !== "ok") {
    return { businessId, status: "failed", reason: describeRescanFailure(rescanResult) };
  }

  const currentRow = await readScoreRow(supabase, rescanResult.scoreId);
  if (!currentRow) {
    return { businessId, status: "failed", reason: `rescan reported success but score ${rescanResult.scoreId} could not be read back` };
  }

  // 3c. Competitor scan — only if this business has EVER used the
  // feature (a real saved competitor_scans row exists for it); otherwise
  // the report honestly shows competitor data as unavailable rather than
  // running the feature for the first time on the business's behalf.
  let competitorDelta: CompetitorDelta | null = null;
  const { data: everScanned, error: everScannedError } = await supabase
    .from("competitor_scans")
    .select("id")
    .eq("business_id", businessId)
    .limit(1)
    .maybeSingle();

  if (everScannedError) {
    // Non-fatal: competitor data just stays unavailable for this report,
    // same as a business that's never used the feature at all — this is
    // a "nice to have" section, not core to the report's real value.
    console.error(`[cron/monthly-reports] competitor-history check failed for ${businessId}: ${everScannedError.message}`);
  } else if (everScanned) {
    const competitorResult = await saveCompetitorScanWithClient(supabase, businessId);
    if (competitorResult.status === "saved") {
      const currentSnapshot = await readCompetitorSnapshotForScan(supabase, businessId, competitorResult.scanId);
      const previousSnapshot = previousReport
        ? await readCompetitorSnapshotAsOf(supabase, businessId, previousReport.sent_at)
        : null;
      // Both sides real, or neither — never a fabricated "previous."
      if (currentSnapshot && previousSnapshot) {
        competitorDelta = { previous: previousSnapshot, current: currentSnapshot };
      }
    }
    // competitorResult.status !== "saved" (e.g. "no_data" — no comparable
    // competitors found this run) is honestly left as unavailable too.
  }

  // 3e. Real content, real email, real owner address.
  const { data: freshBusiness, error: freshBusinessError } = await supabase
    .from("businesses")
    .select("name, owner_id, unsubscribe_token, language")
    .eq("id", businessId)
    .single();

  if (freshBusinessError || !freshBusiness) {
    return { businessId, status: "failed", reason: "could not re-read business after rescan" };
  }

  // A bad/unknown value can never reach the email render or subject
  // builder — same discipline as saveBusinessWithClient's own write-time
  // normalization (app/actions/businesses.ts).
  const locale = normalizeLocale(freshBusiness.language);

  const { data: ownerUser, error: ownerError } = await supabase.auth.admin.getUserById(freshBusiness.owner_id);
  if (ownerError || !ownerUser?.user?.email) {
    return { businessId, status: "failed", reason: "no real email on file for this business's owner" };
  }

  const content = buildMonthlyReportContent(baselineRow, currentRow, competitorDelta);
  const reportDate = now.toISOString();
  const businessName = freshBusiness.name ?? "Your business";
  // A real, working unsubscribe link — app/unsubscribe/page.tsx validates
  // this exact businessId+token pair (the real per-business
  // unsubscribe_token from supabase/schema.sql, never a guessable id
  // alone) and flips monthly_report_enabled off, no login required.
  const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
  const unsubscribeUrl = `${siteUrl}/unsubscribe?business=${businessId}&token=${freshBusiness.unsubscribe_token}`;

  // 3f — RESERVE before sending, not after. The idempotency pre-check
  // above (3a) is only a check-then-act race: two truly concurrent runs
  // can both pass it before either has written a row. Inserting here,
  // BEFORE sendEmail, turns this same insert into the actual guard: the
  // unique index on (business_id, calendar month of sent_at) — see
  // supabase/schema.sql — means at most one concurrent run's insert can
  // ever succeed for this business this month. A concurrent duplicate
  // loses HERE, before it ever calls sendEmail, which is what actually
  // prevents a double-send — catching the same conflict AFTER an
  // already-sent email would only prevent a double-LOG, not the double-
  // send itself.
  const { data: reserved, error: reserveError } = await supabase
    .from("monthly_reports")
    .insert({
      business_id: businessId,
      baseline_score_id: baselineRow?.id ?? null,
      current_score_id: currentRow.id,
      sent_at: reportDate,
    })
    .select("id")
    .single();

  if (reserveError) {
    if (reserveError.code === "23505") {
      // Postgres unique_violation — a concurrent run already reserved
      // (or by now, sent) this business's report for this calendar
      // month. Exactly the same real state the idempotency pre-check
      // above is trying to catch, just discovered a little later —
      // never a failure, and this run must NOT send.
      return {
        businessId,
        status: "skipped",
        reason: "a concurrent run already claimed this business's report for this calendar month",
      };
    }
    return { businessId, status: "failed", reason: `could not reserve this month's report row: ${reserveError.message}` };
  }

  const sendResult = await sendEmail({
    to: ownerUser.user.email,
    subject: monthlyReportSubject(businessName, reportDate, locale),
    react: createElement(MonthlyReportEmail, { businessName, reportDate, content, unsubscribeUrl, locale }),
  });

  if (sendResult.status !== "sent") {
    // The reservation succeeded but the real send didn't — release it,
    // so this business stays genuinely retryable (a later chunk this
    // run, or next month) instead of permanently — and wrongly — looking
    // "already sent" for a report that never actually went out.
    const { error: releaseError } = await supabase.from("monthly_reports").delete().eq("id", reserved.id);
    if (releaseError) {
      console.error(
        `[cron/monthly-reports] business ${businessId}: send failed AND could not release the reservation (row ${reserved.id}): ${releaseError.message} — this business will incorrectly look "already sent" until that row is manually removed.`
      );
    }
    return { businessId, status: "failed", reason: `email send failed: ${sendResult.message}` };
  }

  return { businessId, status: "sent" };
}

async function handleCronRun(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pagination so the real caller (netlify/functions/monthly-reports-batch.mts)
  // can chunk this run across multiple small invocations — see the
  // TIMING/COST note at the top of this file for why that's necessary.
  // Omitted, this processes every eligible business in one call — fine
  // for local testing against a handful of businesses, not for the real
  // scheduled run.
  const limitParam = request.nextUrl.searchParams.get("limit");
  const offsetParam = request.nextUrl.searchParams.get("offset");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : null;
  const offset = offsetParam ? Number.parseInt(offsetParam, 10) : 0;

  if ((limitParam && (!Number.isFinite(limit) || (limit as number) <= 0)) || !Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ error: "limit must be a positive integer and offset a non-negative integer" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Stable order (by id) so limit/offset pagination across separate
  // invocations doesn't skip or repeat a business just because created_at
  // ties or concurrent inserts reordered a default ordering. .range()
  // needs an explicit upper bound either way, so an offset with no limit
  // just asks for "everything from offset onward" up to this cap — real
  // installs are nowhere near this many businesses today, and a caller
  // that needs more can always pass an explicit, larger limit instead.
  const UNBOUNDED_PAGE_SIZE = 100_000;
  const rangeSize = limit ?? UNBOUNDED_PAGE_SIZE;
  const query = supabase
    .from("businesses")
    .select("id")
    .eq("monthly_report_enabled", true)
    .order("id", { ascending: true })
    .range(offset, offset + rangeSize - 1);

  const { data: businesses, error } = await query;
  if (error) {
    return NextResponse.json({ error: `Could not list eligible businesses: ${error.message}` }, { status: 500 });
  }

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const startOfMonthIso = startOfMonth.toISOString();

  const results: CronRunResult[] = [];

  // 4. Sequential and per-business try/caught on purpose — one
  // business's scan/send failure must never kill the whole run, and
  // sequential keeps real, billed external calls (PageSpeed, ScreenshotOne
  // when a capture is due, Places) from all firing at once across many
  // businesses.
  for (const business of businesses ?? []) {
    try {
      results.push(await processBusiness(supabase, business.id, startOfMonthIso, now));
    } catch (err) {
      results.push({
        businessId: business.id,
        status: "failed",
        reason: err instanceof Error ? err.message : "Unexpected error during processing.",
      });
    }
  }

  const pageSize = businesses?.length ?? 0;
  const summary: CronRunSummary = {
    pageSize,
    hasMore: pageSize === rangeSize,
    processed: results.length,
    sent: results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };

  return NextResponse.json(summary);
}

// POST only, deliberately — this route sends real email and writes real
// rows; a plain GET is more exposed to being triggered by accident (a
// crawler, a prefetch, a browser visit while debugging the secret) even
// behind the bearer check, so side-effecting work like this is POST-only
// as a matter of defense in depth.
export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleCronRun(request);
}
