// Re-scores every business from its latest saved data with the current
// scoring code — after a scoring change, so every page shows the same
// number (the real Colorful Yun Nan case: the score card said 80 while
// "Since your last scan" still said 79 → 77).
//
// No Google calls, no website fetches, no screenshots: it reads the saved
// businesses row and scores it — the exact saveScoreSnapshotWithClient
// every scan uses — saved as a scoring update (scanKind "scoring_update"):
// - "Since your last scan" and history show "PostScore updated how it
//   scores", never the owner's gain or loss;
// - it never uses up the daily re-scan or moves "last scan";
// - it never confirms or reopens "I did this" tasks;
// - notifications are refreshed from the new score.
//
// Skipped: archived businesses, businesses with no saved scan yet (nothing
// to re-score), and ones whose latest scan already has this version and
// total (nothing to update).
//
// Usage (from the project root):
//   npx tsx --env-file=.env.local scripts/rescore-all.ts --dry-run
//   npx tsx --env-file=.env.local scripts/rescore-all.ts --only=<id,id,...>
//   npx tsx --env-file=.env.local scripts/rescore-all.ts

import { createRequire } from "module";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** app/actions/scoring.ts reaches a top-level `import "server-only"`
 * (see scripts/rescan-all.ts) — neutralized before it's loaded. */
async function loadScoring() {
  const nodeRequire = createRequire(import.meta.url);
  const Module = nodeRequire("module") as { _load: (request: string, ...rest: unknown[]) => unknown };
  const originalLoad = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, ...rest);
  };
  const actions = await import("../app/actions/scoring");
  const policy = await import("../lib/websiteRecheckPolicy");
  const scoring = await import("../lib/scoring");
  return { ...actions, SCORING_UPDATE_KIND: policy.SCORING_UPDATE_KIND, SCORING_VERSION: scoring.SCORING_VERSION };
}

interface Plan {
  id: string;
  name: string;
  before: { total: number; grade: string; version: string | null; at: string };
  after: { total: number; grade: string; version: string };
}

async function latestScore(supabase: SupabaseClient, businessId: string) {
  const { data } = await supabase.from("scores").select("total, grade, scoring_version, created_at").eq("business_id", businessId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data as { total: number; grade: string; scoring_version: string | null; created_at: string } | null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const onlyIds = onlyArg ? onlyArg.slice("--only=".length).split(",").filter(Boolean) : null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (run with --env-file=.env.local).");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { scoreBusinessWithClient, saveScoreSnapshotWithClient, SCORING_UPDATE_KIND, SCORING_VERSION } = await loadScoring();

  let query = supabase.from("businesses").select("id, name, archived_at");
  if (onlyIds) query = query.in("id", onlyIds);
  const { data: rows, error } = await query.order("name", { ascending: true });
  if (error || !rows) {
    console.error("Could not read businesses:", error?.message);
    process.exit(1);
  }

  const plans: Plan[] = [];
  const unchanged: string[] = [];
  const skipped: string[] = [];
  for (const b of rows as Array<{ id: string; name: string | null; archived_at: string | null }>) {
    const name = b.name ?? "(unnamed)";
    if (b.archived_at) {
      skipped.push(`${name}: archived`);
      continue;
    }
    const before = await latestScore(supabase, b.id);
    if (!before) {
      skipped.push(`${name}: no saved scan yet`);
      continue;
    }
    const scored = await scoreBusinessWithClient(supabase, b.id);
    if (scored.status !== "ok") {
      skipped.push(`${name}: ${scored.status}`);
      continue;
    }
    const after = { total: scored.result.breakdown.total, grade: scored.result.breakdown.grade, version: scored.result.breakdown.scoringVersion };
    if (before.scoring_version === after.version && before.total === after.total) {
      unchanged.push(`${name}: ${before.total} (already ${after.version})`);
      continue;
    }
    plans.push({ id: b.id, name, before: { total: before.total, grade: before.grade, version: before.scoring_version, at: before.created_at }, after });
  }

  console.log(`${dryRun ? "DRY RUN — " : ""}Re-score with scoring ${SCORING_VERSION} (no Google calls, no website fetches, no screenshots)\n`);
  console.log(`Will save a scoring update for ${plans.length} business(es):\n`);
  for (const p of plans) {
    const delta = p.after.total - p.before.total;
    const grade = p.before.grade === p.after.grade ? p.after.grade : `${p.before.grade} → ${p.after.grade}`;
    console.log(`  ${p.name}: ${p.before.total} → ${p.after.total} (${delta > 0 ? "+" : ""}${delta}), grade ${grade}, ${p.before.version ?? "?"} → ${p.after.version}  [${p.id}]`);
  }
  if (unchanged.length) console.log(`\nUnchanged, nothing saved (${unchanged.length}):\n${unchanged.map((l) => `  ${l}`).join("\n")}`);
  if (skipped.length) console.log(`\nSkipped (${skipped.length}):\n${skipped.map((l) => `  ${l}`).join("\n")}`);

  if (dryRun) {
    console.log(`\nNo writes made. Run without --dry-run to save these.`);
    return;
  }

  let saved = 0;
  for (const p of plans) {
    const result = await saveScoreSnapshotWithClient(supabase, p.id, SCORING_UPDATE_KIND);
    if (result.status === "saved") {
      saved++;
      console.log(`  saved ${p.name}`);
    } else {
      console.error(`  FAILED ${p.name}: ${result.status === "error" ? result.message : result.status}`);
    }
  }
  console.log(`\nSaved ${saved} of ${plans.length} scoring update(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
