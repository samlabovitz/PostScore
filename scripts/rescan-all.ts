// Dev-only bulk re-scan of every (or a selected subset of) business's
// real Google listing + website data — calls the EXACT SAME
// rescanBusinessWithClient (app/actions/scoring.ts) the interactive
// "Re-scan now" button and the monthly-report cron use, sequentially,
// one business at a time, with a short pause between each — never a
// second, hand-written re-fetch/save/score sequence that could drift
// from either of those.
//
// Deliberately does LESS than the monthly-report cron: no competitor
// scan (saveCompetitorScanWithClient is never called here), no email,
// no monthly_reports row. This script only ever touches the same three
// tables a single "Re-scan now" click touches — businesses, scores,
// tasks.
//
// COST: one real, billed Google Places Details call per business
// (Enterprise-tier pricing, ~$0.02/call as of writing — see Day 4 Part
// D's audit in ~/Desktop/day4-prep.md / the earlier website audit
// report). PageSpeed Insights (the mobile-speed check) is free. A
// business being analyzed for the very first time (no
// website_analysis_json saved yet) also triggers up to 5 real, billed
// ScreenshotOne captures (1 homepage + up to 4 discovered pages —
// MAX_ADDITIONAL_PAGES in lib/websiteAnalysis.ts) UNLESS --no-screenshots
// is passed. Exact ScreenshotOne pricing isn't hardcoded anywhere in
// this codebase, so the dry-run below flags the COUNT of such
// businesses honestly rather than inventing a dollar figure for it.
//
// --no-screenshots: skips ScreenshotOne entirely for every business in
// this run, even ones being analyzed for the first time — real Places
// Details, HTTPS probe, HTML fetch, PageSpeed, and scoring still run
// and still get saved. Use this whenever ScreenshotOne quota is tight
// (see Day 4 Part 2); a business re-scanned this way simply keeps
// showing its real "no screenshot captured yet" state (see
// WebsiteVisualAnalysis.tsx) until a later scan — with quota available,
// or via the explicit "Refresh screenshots" action — captures one.
//
// Sequential, not parallel — same reasoning the cron route documents
// for itself: PageSpeed alone can take up to ~30s per business with
// retries, and firing many at once risks exhausting
// GOOGLE_PLACES_API_KEY/PAGESPEED_API_KEY rate limits and running up
// the Enterprise-SKU Places bill across every business at once.
//
// Usage (from the project root):
//   npx tsx scripts/rescan-all.ts --dry-run
//   npx tsx scripts/rescan-all.ts --only=<id,id,...>
//   npx tsx scripts/rescan-all.ts --limit=N
//   npx tsx scripts/rescan-all.ts --no-screenshots
//   npx tsx scripts/rescan-all.ts --only=<id,id> --dry-run
//
// --dry-run: lists every business that WOULD be re-scanned, plus an
// estimated total cost, then exits. No real API calls, no writes.
// --only=<id,id,...>: restricts the run to exactly these businessIds
// (comma-separated, no spaces).
// --limit=N: caps how many businesses are actually processed, applied
// AFTER --only filtering when both are given.
//
// Writes a full before/after report to ~/Desktop/rescan-report.md —
// per business: score before -> after, each website check's state
// before -> after (full/partial/zero/not scored), and any failure with
// its real reason. Plus totals, including how many businesses now have
// a real measured mobile-speed score.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

for (const line of fs.readFileSync(".env.local", "utf-8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
import { parseWebsiteAnalysis, type ScoreBreakdown, type WebsiteAnalysis } from "../lib/scoring";
import type { rescanBusinessWithClient as RescanBusinessWithClientFn } from "../app/actions/scoring";
import {
  mergeBusinessEntries,
  parseExistingReport,
  renderFullReport,
  toBusinessEntry,
  type BusinessEntry,
} from "./rescanReportFormat";

/**
 * app/actions/scoring.ts transitively imports lib/websiteScreenshotUpload.ts,
 * which has a top-level `import "server-only"` guard meant to be
 * stripped by Next's own bundler for Server Components — outside
 * Next's build, plain Node sees the raw package and it unconditionally
 * throws, even though this script never touches screenshot upload at
 * all. Every other script in this repo dodges this by vi.mock()'ing it
 * (vitest-only) or by never importing anything that reaches it — this
 * script is the first that genuinely needs rescanBusinessWithClient, so
 * the one real workaround outside a test runner is neutralizing the
 * package at the Node module-loader level before it's ever required,
 * then dynamically importing the real module afterward (inside an
 * async function, never at top level, since this project's tsconfig
 * doesn't enable top-level await). Safe: the package has zero real
 * behavior to lose (it only ever throws).
 */
async function loadRescanBusinessWithClient(): Promise<typeof RescanBusinessWithClientFn> {
  const nodeRequire = createRequire(import.meta.url);
  const Module = nodeRequire("module") as { _load: (request: string, ...rest: unknown[]) => unknown };
  const originalLoad = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, ...rest);
  };
  const mod = (await import("../app/actions/scoring")) as { rescanBusinessWithClient: typeof RescanBusinessWithClientFn };
  return mod.rescanBusinessWithClient;
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** A short, polite pause between businesses — never hammer Google or
 * Supabase back-to-back across 50+ real, billed calls. */
const PAUSE_BETWEEN_BUSINESSES_MS = 1500;

/** Enterprise-tier Places Details pricing, per Day 4 Part D's real,
 * looked-up Google pricing audit — this app's field mask pulls
 * Enterprise-only fields (phone, website, hours, rating, price level,
 * photos), so it bills at this rate, not the cheaper Pro/Basic tiers. */
const PLACES_DETAILS_COST_USD = 0.02;

interface BusinessRow {
  id: string;
  name: string | null;
  website: string | null;
  website_analysis_json: unknown;
}

interface ScoreRow {
  total: number;
  grade: string;
  breakdown: ScoreBreakdown;
}

async function readLatestScoreRow(businessId: string): Promise<ScoreRow | null> {
  const { data, error } = await supabase
    .from("scores")
    .select("total, grade, breakdown_json")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { total: data.total, grade: data.grade, breakdown: data.breakdown_json as ScoreBreakdown };
}

async function readScoreRow(scoreId: string): Promise<ScoreRow | null> {
  const { data, error } = await supabase.from("scores").select("total, grade, breakdown_json").eq("id", scoreId).single();
  if (error || !data) return null;
  return { total: data.total, grade: data.grade, breakdown: data.breakdown_json as ScoreBreakdown };
}

/** The business's CURRENT (post-rescan, when called after one) real
 * website_analysis_json — this is where the real stored reasons live
 * (Day 4 Part 3), separate from the scores table's breakdown_json. */
async function readWebsiteAnalysis(businessId: string): Promise<WebsiteAnalysis | null> {
  const { data, error } = await supabase.from("businesses").select("website_analysis_json").eq("id", businessId).single();
  if (error || !data) return null;
  return parseWebsiteAnalysis(data.website_analysis_json);
}

/** A short, honest, human-readable reason string for a check that's
 * still not scored after this run — read straight from the real stored
 * reason fields, never guessed. null when the check IS scored, or no
 * reason was recorded (e.g. no website at all, or a legacy row). */
function reasonFor(checkId: string, websiteAnalysis: WebsiteAnalysis | null): string | null {
  if (!websiteAnalysis) return null;
  if (checkId === "website.performance_mobile") {
    const f = websiteAnalysis.mobilePerformanceFailureReason;
    if (!f) return null;
    return f.kind === "http_error" ? `http_error (status ${f.status})` : f.kind;
  }
  if (checkId === "website.https") return websiteAnalysis.httpsUnreachableReason;
  if (checkId === "website.content_depth" || checkId === "website.contact_conversion") {
    return websiteAnalysis.contentFetchFailureReason;
  }
  return null;
}

interface BusinessReportLine {
  businessId: string;
  businessName: string;
  status: "ok" | "failed";
  reason?: string;
  before: ScoreRow | null;
  after: ScoreRow | null;
  /** The business's real post-rescan website_analysis_json — where the
   * honest "why isn't this scored" reasons actually live (Day 4 Part
   * 3). null on a failed rescan, or a business with no website. */
  afterWebsiteAnalysis: WebsiteAnalysis | null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const noScreenshots = args.includes("--no-screenshots");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const onlyIds = onlyArg ? onlyArg.slice("--only=".length).split(",").filter(Boolean) : null;
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.slice("--limit=".length), 10) : null;

  let query = supabase.from("businesses").select("id, name, website, website_analysis_json");
  if (onlyIds) query = query.in("id", onlyIds);
  const { data: allBusinesses, error } = await query.order("created_at", { ascending: true });
  if (error || !allBusinesses) {
    console.error("Could not read businesses:", error?.message);
    process.exit(1);
  }

  const businesses: BusinessRow[] = limit ? allBusinesses.slice(0, limit) : allBusinesses;

  if (dryRun) {
    // ScreenshotOne only ever fires when there's a real website to
    // screenshot (app/actions/businesses.ts:229's `captureScreenshots
    // && websiteAnalysis` gate) — a no-website business never triggers
    // it regardless of website_analysis_json being null.
    const firstTimeAnalysis = businesses.filter((b) => b.website_analysis_json === null && b.website);
    console.log(`DRY RUN — would re-scan ${businesses.length} business(es):\n`);
    for (const b of businesses) {
      const firstTime = b.website_analysis_json === null && b.website;
      console.log(`  ${b.name ?? "(unnamed)"} (${b.id})${firstTime ? " — first-ever website analysis" : ""}`);
    }
    const placesCost = businesses.length * PLACES_DETAILS_COST_USD;
    console.log(`\nEstimated real, billed cost:`);
    console.log(`  Google Places Details: ${businesses.length} calls x $${PLACES_DETAILS_COST_USD.toFixed(2)} = $${placesCost.toFixed(2)}`);
    console.log(`  PageSpeed Insights: free (up to 3 calls/business)`);
    if (noScreenshots) {
      console.log(`  ScreenshotOne: SKIPPED (--no-screenshots) — 0 calls, even for the ${firstTimeAnalysis.length} first-time business(es) above.`);
    } else {
      console.log(
        `  ScreenshotOne: ${firstTimeAnalysis.length} business(es) being analyzed for the first time will also trigger up to 5 real, billed ScreenshotOne captures each (1 homepage + up to 4 discovered pages) — exact per-call rate not hardcoded in this codebase, so no dollar estimate is given for it. Pass --no-screenshots to skip these entirely.`
      );
    }
    console.log(`\nNo real calls made, no writes made. Pass without --dry-run to actually run this.`);
    return;
  }

  const rescanBusinessWithClient = await loadRescanBusinessWithClient();
  const reports: BusinessReportLine[] = [];

  for (let i = 0; i < businesses.length; i++) {
    const b = businesses[i];
    const businessName = b.name ?? "(unnamed)";
    console.log(`\n[${i + 1}/${businesses.length}] Re-scanning ${businessName} (${b.id})...`);

    const before = await readLatestScoreRow(b.id);
    const result = await rescanBusinessWithClient(supabase, b.id, noScreenshots);

    if (result.status !== "ok") {
      const reason =
        result.status === "error"
          ? result.message
          : result.status === "no_results"
            ? "Google returned no results for this business's saved place ID"
            : result.status === "not_found"
              ? "business not found"
              : "unauthenticated (should never happen with the admin client)";
      console.log(`  FAILED: ${reason}`);
      reports.push({ businessId: b.id, businessName, status: "failed", reason, before, after: null, afterWebsiteAnalysis: null });
    } else {
      const after = await readScoreRow(result.scoreId);
      const afterWebsiteAnalysis = await readWebsiteAnalysis(b.id);
      console.log(`  OK: ${before?.total ?? "?"} -> ${after?.total ?? "?"}`);
      reports.push({ businessId: b.id, businessName, status: "ok", before, after, afterWebsiteAnalysis });
    }

    if (i < businesses.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_BUSINESSES_MS));
    }
  }

  // --- Build this run's fresh entries ---
  const freshEntries: BusinessEntry[] = reports.map((r) =>
    r.status === "failed"
      ? { businessId: r.businessId, businessName: r.businessName, status: "failed" as const, failReason: r.reason }
      : toBusinessEntry({
          businessId: r.businessId,
          businessName: r.businessName,
          beforeTotal: r.before?.total,
          beforeBreakdown: r.before?.breakdown,
          afterTotal: r.after?.total,
          afterBreakdown: r.after?.breakdown,
          reasonFor: (checkId) => reasonFor(checkId, r.afterWebsiteAnalysis),
        })
  );

  // --- Write the report ---
  // Day 4 Task B: --only and --limit both mean this run covers less
  // than every business — never let a partial run overwrite the full
  // report and silently delete every OTHER business's results. When
  // this run is partial AND a previous report already exists and
  // parses as a real one, MERGE: replace only the entries this run
  // touched, keep everyone else exactly as they were, and recompute
  // Totals/significant-changes from the full merged set. A full run
  // (no --only, no --limit) always writes a clean, complete report, as
  // before.
  const outPath = path.join(os.homedir(), "Desktop", "rescan-report.md");
  const isPartialRun = onlyIds !== null || limit !== null;

  let finalEntries = freshEntries;
  let trailingContent = "";
  let subtitle = `Re-scanned ${freshEntries.length} business(es). No competitor scans, no emails, no monthly_reports writes.`;

  if (isPartialRun && fs.existsSync(outPath)) {
    const existingContent = fs.readFileSync(outPath, "utf-8");
    const parsed = parseExistingReport(existingContent);
    if (parsed) {
      finalEntries = mergeBusinessEntries(parsed.entries, freshEntries);
      trailingContent = parsed.trailingContent;
      subtitle = `${finalEntries.length} business(es) total in this report — ${freshEntries.length} re-scanned just now (this run), the rest carried over unchanged from the previous report. No competitor scans, no emails, no monthly_reports writes.`;
      console.log(
        `\nPartial run: merging ${freshEntries.length} fresh result(s) into the existing report (${parsed.entries.length} business(es) already there) — nothing else was touched.`
      );
    } else {
      console.log(
        `\nWarning: couldn't parse the existing report at ${outPath} as a recognized rescan report — writing a report for just this run's ${freshEntries.length} business(es) instead of guessing at a merge.`
      );
    }
  }

  const report = renderFullReport(finalEntries, new Date().toISOString(), subtitle, trailingContent);
  fs.writeFileSync(outPath, report, "utf-8");
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
