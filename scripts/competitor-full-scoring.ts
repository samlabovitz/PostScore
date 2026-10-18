// Re-scores saved competitor scans with each competitor's FULL PostScore
// (lib/competitorScoringJob.ts — the same job a new scan runs in the
// background). Uses each business's latest finished scan and the saved
// competitor list: no Places calls, no Browserless, no screenshots.
// PageSpeed (free, budgeted: 80% of PAGESPEED_DAILY_LIMIT incl. owner
// re-scans), Safe Browsing (free) and plain page fetches only.
//
//   --only "Name" [--only "Name2" …]   these businesses
//   --all                              every business with a saved scan
//   --rescore                          score again even if already done
//   --report <path>                    write a Markdown report
// Nothing runs without --only or --all.
//
//   npx --no-install tsx --env-file=.env.local scripts/competitor-full-scoring.ts --only "Modern Liquors"

/* eslint-disable no-console */
const Module = require("module");
const origLoad = Module._load;
Module._load = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return origLoad.call(this, req, ...rest);
};

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const ONLY = argv.flatMap((a, i) => (a === "--only" ? [argv[i + 1]] : []));
const ALL = argv.includes("--all");
/** Score again even when a scan's job already finished. */
const RESCORE = argv.includes("--rescore");
const REPORT = argv[argv.indexOf("--report") + 1] && argv.includes("--report") ? argv[argv.indexOf("--report") + 1] : null;

(async () => {
  if (!ALL && ONLY.length === 0) {
    console.log("Nothing to do: pass --only \"Business name\" (repeatable) or --all.");
    return;
  }
  const { createAdminClient } = require("../lib/supabase/admin");
  const { groupSavedScans, SAVED_SCAN_COLUMNS } = require("../lib/savedCompetitorScans");
  const { ownerStanding } = require("../lib/competitorComparison");
  const { queueScoringJob, runCompetitorScoringJob, pagespeedUsedToday } = require("../lib/competitorScoringJob");
  const { unfinishedNewScanIds, withoutUnfinished } = require("../lib/competitorScoringStatus");
  const { pagespeedDailyBudget, pagespeedDailyLimit } = require("../lib/pagespeedBudget");
  const db = createAdminClient();

  if (pagespeedDailyLimit() === null) {
    console.log("PAGESPEED_DAILY_LIMIT is not set — add the daily limit from the Cloud Console to .env.local first.");
    return;
  }

  let q = db.from("businesses").select("id, name").order("name");
  if (!ALL) q = q.in("name", ONLY);
  const { data: businesses, error } = await q;
  if (error) throw error;

  // "Before": the comparable score pages showed until now (the same checks
  // for everyone: rating, review count, listing fields, basic website check).
  const COMPARABLE: Record<string, string[]> = {
    reviews: ["visibility.rating", "visibility.review_count"],
    listing: ["completeness.phone", "completeness.address", "completeness.hours", "completeness.website_link", "completeness.categories", "completeness.photos", "completeness.business_status"],
  };
  const WEIGHTS: Record<string, number> = { reviews: 40, listing: 30, website: 30 };
  function oldComparable(row: any): number | null {
    let weighted = 0;
    let weights = 0;
    for (const v of ["reviews", "listing", "website"]) {
      let share: number | null = null;
      if (v === "website") {
        const b = row.website_basic_json;
        if (row.has_website === false) share = 0;
        else if (b?.status === "checked") {
          const vals = Object.values(b.checks).filter((x) => x !== null && x !== undefined);
          share = vals.length ? vals.filter((x) => x === true).length / vals.length : null;
        }
      } else {
        let e = 0;
        let m = 0;
        for (const id of COMPARABLE[v]) {
          const c = row.breakdown_json?.checks?.find((x: any) => x.id === id);
          if (!c || c.earnedPoints === null || c.earnedPoints === undefined) continue;
          e += c.earnedPoints;
          m += c.maxPoints;
        }
        share = m > 0 ? e / m : null;
      }
      if (share === null) continue;
      weighted += share * WEIGHTS[v];
      weights += WEIGHTS[v];
    }
    return weights > 0 ? Math.round((weighted / weights) * 100) : null;
  }
  function rankOf(rows: any[], score: (r: any) => number | null) {
    const sorted = rows
      .map((r) => ({ r, s: score(r) }))
      .sort((a, b) => (b.s ?? -1) - (a.s ?? -1) || String(a.r.place_id).localeCompare(String(b.r.place_id)));
    const i = sorted.findIndex((x) => x.r.is_subject);
    return i < 0 ? null : { rank: i + 1, of: rows.length, score: sorted[i].s };
  }

  const lines: string[] = [];
  let pagespeedTotal = 0;
  for (const b of businesses) {
    const { data: rows } = await db.from("competitor_scans").select("*").eq("business_id", b.id).order("created_at", { ascending: false }).limit(600);
    const finished = withoutUnfinished(rows ?? [], await unfinishedNewScanIds(db, b.id));
    if (!finished.length) continue;
    const scanId = finished[0].scan_id;
    const scanRows = finished.filter((r: any) => r.scan_id === scanId);
    const before = rankOf(scanRows, oldComparable);
    const competitors = scanRows.filter((r: any) => !r.is_subject).length;

    const { data: existing } = await db.from("competitor_scoring_jobs").select("status").eq("scan_id", scanId).maybeSingle();
    if (!existing || existing.status !== "done" || RESCORE) await queueScoringJob(db, scanId, b.id, "backfill", competitors);
    const t0 = Date.now();
    const out = await runCompetitorScoringJob(db, scanId, { log: (l: string) => console.log(`${b.name}:${l}`) });
    pagespeedTotal += out.pagespeedCalls;

    const { data: fresh } = await db.from("competitor_scans").select(SAVED_SCAN_COLUMNS).eq("scan_id", scanId);
    const after = ownerStanding(groupSavedScans(fresh)[0]);
    const line = `| ${b.name} | ${before ? `#${before.rank} of ${before.of} (comparable ${before.score})` : "—"} | ${after ? `#${after.rank} of ${after.of} (PostScore ${after.ownerScore})` : "—"} | ${out.status}${out.stopped ? ` (${out.stopped})` : ""} | ${out.pagespeedCalls} | ${Math.round((Date.now() - t0) / 1000)}s |`;
    lines.push(line);
    console.log(line);
    if (out.stopped === "pagespeed_budget") {
      console.log("Stopped: today's PageSpeed budget (80% of the daily limit) is used up.");
      break;
    }
  }
  const used = await pagespeedUsedToday(db);
  console.log(`\nPageSpeed requests by this run: ${pagespeedTotal}. Used today (estimate, incl. owner re-scans): ${used} of a ${pagespeedDailyBudget()} budget.`);

  if (REPORT) {
    const md = [
      `# Competitor full PostScore — ${new Date().toISOString().slice(0, 10)}`,
      "",
      `Each competitor re-scored with the same full PostScore as the owner (saved competitor lists, no Places calls, no Browserless, no screenshots). PageSpeed requests by this run: ${pagespeedTotal}; used today (estimate, incl. owner re-scans): ${used} of a ${pagespeedDailyBudget()} budget (80% of the daily limit).`,
      "",
      "| Business | Before (comparable score) | After (full PostScore) | Job | PageSpeed | Time |",
      "|---|---|---|---|---|---|",
      ...lines,
      "",
    ].join("\n");
    const out = REPORT.replace(/^~/, os.homedir());
    fs.writeFileSync(path.resolve(out), md);
    console.log(`Report: ${out}`);
  }
})();
