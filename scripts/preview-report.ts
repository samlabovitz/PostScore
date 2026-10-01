// Dev-only, READ-ONLY preview of the monthly report email for one real
// business. Builds content via the exact same real function the cron
// route uses (buildMonthlyReportContent, lib/monthlyReport.ts) and
// renders the exact same real email component (MonthlyReportEmail,
// emails/MonthlyReportEmail.tsx) with the business's own real locale —
// never a second, hand-written reimplementation of either that could
// drift from what a real send actually looks like.
//
// Never re-scans the BUSINESS itself, never sends email, and never
// writes a monthly_reports row — reads the business's LATEST already-
// saved `scores` row as-is (never re-scored). The ONE real write this
// script does make is a genuine competitor scan (saveCompetitorScanWithClient,
// the exact same real function the cron route calls) — the real cron
// now runs this every month for every business (see app/api/cron/
// monthly-reports/route.ts), so previewing without it would show a
// different "competitor standing" section than the real report will.
// That scan inserts a normal competitor_scans row, same as the
// Competitors page's own "Save this scan" button — real, billed Google
// Places Details calls, not a mock.
//
// Writes the rendered HTML to ~/Desktop/report-preview-{business
// name}.html instead of emailing it, so you can open it straight in a
// browser.
//
// Usage (from the project root):
//   npx tsx scripts/preview-report.ts <businessId>
//   npx tsx scripts/preview-report.ts <businessId> --baseline
//
// --baseline forces this to render as a genuine FIRST (baseline)
// report, ignoring any real monthly_reports history for this business —
// useful for previewing what an owner's very first report would
// honestly look like, independent of whatever has actually been sent
// before. Without it, this looks up the real previous monthly_reports
// row (if any) and renders an "update" report against it, exactly like
// a real scheduled run would.
//
// --locale=es (or any other supported locale) renders in that language
// instead of the business's own real stored `language` column — never
// writes that column, just overrides which language THIS preview uses.
//
// Finding a businessId: open that business's Overview page in the app —
// the id is the segment right after /business/ in the URL
// (postscore.app/business/<businessId>).

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

for (const line of fs.readFileSync(".env.local", "utf-8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

import { createClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { render } from "@react-email/components";
import {
  buildMonthlyReportContent,
  type CompetitorDelta,
  type CompetitorSnapshot,
  type MonthlyReportScoreRow,
} from "../lib/monthlyReport";
import type { Grade } from "../lib/scoring";
import { MonthlyReportEmail, monthlyReportSubject } from "../emails/MonthlyReportEmail";
import { normalizeLocale } from "../lib/i18n";
import { saveCompetitorScanWithClient } from "../app/actions/competitors";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** One real `scores` row by id — same shape/columns as the cron route's
 * own readScoreRow (app/api/cron/monthly-reports/route.ts). */
async function readScoreRow(scoreId: string): Promise<MonthlyReportScoreRow | null> {
  const { data, error } = await supabase
    .from("scores")
    .select("id, total, grade, created_at, breakdown_json, profile_snapshot_json")
    .eq("id", scoreId)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    total: data.total,
    grade: data.grade as Grade,
    createdAt: data.created_at,
    profileSnapshot: data.profile_snapshot_json,
    breakdown: data.breakdown_json,
  };
}

/** The most recent `scores` row for this business — "the latest saved
 * score," never a fresh re-scan. */
async function readLatestScoreRow(businessId: string): Promise<MonthlyReportScoreRow | null> {
  const { data, error } = await supabase
    .from("scores")
    .select("id")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return readScoreRow(data.id);
}

/** The real competitor standing from one specific saved scan — same
 * logic as the cron route's own readCompetitorSnapshotForScan. */
async function readCompetitorSnapshotForScan(businessId: string, scanId: string): Promise<CompetitorSnapshot | null> {
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

/** Runs a REAL, fresh competitor scan — the exact same real function
 * the cron route now calls for every business every month
 * (saveCompetitorScanWithClient, app/actions/competitors.ts) — and
 * reads back the real standing it just saved. Real, billed Google
 * Places Details calls; a real new competitor_scans row. null only
 * when the scan genuinely found no comparable nearby businesses, or
 * failed outright — never a stale read of some OLDER scan. */
async function runFreshCompetitorScan(businessId: string): Promise<CompetitorSnapshot | null> {
  const result = await saveCompetitorScanWithClient(supabase, businessId);
  if (result.status !== "saved") return null;
  return readCompetitorSnapshotForScan(businessId, result.scanId);
}

/** The real competitor standing as of the last scan at or before
 * `cutoffIso` — same real best-effort heuristic as the cron route's own
 * readCompetitorSnapshotAsOf, used to find "what did standing look like
 * around the previous report." */
async function readCompetitorSnapshotAsOf(businessId: string, cutoffIso: string): Promise<CompetitorSnapshot | null> {
  const { data, error } = await supabase
    .from("competitor_scans")
    .select("scan_id")
    .eq("business_id", businessId)
    .lte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return readCompetitorSnapshotForScan(businessId, data.scan_id);
}

async function main() {
  const args = process.argv.slice(2);
  const forceBaseline = args.includes("--baseline");
  const businessId = args.find((a) => !a.startsWith("--"));
  const localeOverrideArg = args.find((a) => a.startsWith("--locale="));
  const localeOverride = localeOverrideArg ? localeOverrideArg.slice("--locale=".length) : null;

  if (!businessId) {
    console.error("Usage: npx tsx scripts/preview-report.ts <businessId> [--baseline] [--locale=es]");
    process.exit(1);
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, language")
    .eq("id", businessId)
    .single();
  if (businessError || !business) {
    console.error(`Could not find business ${businessId}: ${businessError?.message ?? "not found"}`);
    process.exit(1);
  }

  const currentRow = await readLatestScoreRow(businessId);
  if (!currentRow) {
    console.error(`Business ${businessId} has no saved scores row yet — nothing to preview.`);
    process.exit(1);
  }

  // The real previous report, unless --baseline deliberately ignores it
  // to preview a genuine first report instead.
  let baselineRow: MonthlyReportScoreRow | null = null;
  let previousReportSentAt: string | null = null;
  if (!forceBaseline) {
    const { data: previousReport } = await supabase
      .from("monthly_reports")
      .select("current_score_id, sent_at")
      .eq("business_id", businessId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousReport) {
      baselineRow = await readScoreRow(previousReport.current_score_id);
      previousReportSentAt = previousReport.sent_at;
    }
  }

  const currentCompetitorSnapshot = await runFreshCompetitorScan(businessId);
  let competitorDelta: CompetitorDelta | null = null;
  if (currentCompetitorSnapshot && previousReportSentAt) {
    const previousSnapshot = await readCompetitorSnapshotAsOf(businessId, previousReportSentAt);
    if (previousSnapshot) {
      competitorDelta = { previous: previousSnapshot, current: currentCompetitorSnapshot };
    }
  }

  // Normally the business's own real stored language — --locale lets
  // you preview a different language WITHOUT touching that real column,
  // for a business whose language hasn't been set to what you want to
  // check yet.
  const locale = normalizeLocale(localeOverride ?? business.language);
  const content = buildMonthlyReportContent(baselineRow, currentRow, competitorDelta, currentCompetitorSnapshot, locale);

  const businessName = business.name ?? "Your business";
  const reportDate = new Date().toISOString();
  // Obviously fake — this is a preview file, never a real send, so the
  // unsubscribe link must never look like a working one.
  const unsubscribeUrl = `https://postscore.app/unsubscribe?business=${businessId}&token=PREVIEW-NOT-REAL`;

  // MonthlyReportEmail.tsx relies on Next's own build pipeline to inject
  // the JSX runtime automatically (tsconfig's "jsx": "preserve" is a
  // Next/SWC-only setting) — tsx's own esbuild-based transform doesn't
  // replicate that, so the compiled component references a bare
  // `React` global that's otherwise never defined when run standalone
  // like this. A real global, not a hack around the component itself:
  // same thing a plain <script> include of React would provide.
  (globalThis as unknown as { React: unknown }).React = require("react");

  const html = await render(
    createElement(MonthlyReportEmail, { businessName, reportDate, content, unsubscribeUrl, locale })
  );
  const subject = monthlyReportSubject(businessName, reportDate, locale);

  const safeName = businessName.replace(/[\\/:*?"<>|]/g, "").trim() || businessId;
  const outPath = path.join(os.homedir(), "Desktop", `report-preview-${safeName}.html`);
  fs.writeFileSync(outPath, html, "utf-8");

  console.log(`${businessName}: ${content.kind} report, locale "${locale}"${forceBaseline ? " (forced baseline)" : ""}`);
  console.log(`Subject: ${subject}`);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
