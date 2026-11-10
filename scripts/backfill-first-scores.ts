// Saves a first score snapshot for every business that has none — added
// before saveBusiness saved one (lib/businessAdded.server.ts), so its
// history, "Since your last scan" and Competitors had nothing to start
// from (the real Finders Keepers, Monkey's Uncle and You've Been Framed
// cases, saved Nov 10, 2026).
//
// No Google calls, no website fetches, no screenshots: each business's
// saved data is scored with the current scoring code and saved as a
// scoring update (scanKind "scoring_update"), not a scan — the data is the
// add's own, so it never uses up the daily re-scan or moves "last scan".
// Skipped: archived and website-only businesses (no PostScore).
//
// Usage (from the project root):
//   npx tsx --env-file=.env.local scripts/backfill-first-scores.ts --dry-run
//   npx tsx --env-file=.env.local scripts/backfill-first-scores.ts

import { createRequire } from "module";
import { createClient } from "@supabase/supabase-js";

/** app/actions/scoring.ts reaches a top-level `import "server-only"`
 * (see scripts/rescan-all.ts) — neutralized before it's loaded. */
async function load() {
  const nodeRequire = createRequire(import.meta.url);
  const Module = nodeRequire("module") as { _load: (request: string, ...rest: unknown[]) => unknown };
  const originalLoad = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, ...rest);
  };
  const actions = await import("../app/actions/scoring");
  const added = await import("../lib/businessAdded.server");
  const policy = await import("../lib/websiteRecheckPolicy");
  return { ...actions, ...added, SCORING_UPDATE_KIND: policy.SCORING_UPDATE_KIND };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (run with --env-file=.env.local).");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { scoreBusinessWithClient, saveScoreSnapshotWithClient, saveFirstScoreSnapshotWithClient, SCORING_UPDATE_KIND } = await load();

  const { data: rows, error } = await supabase.from("businesses").select("id, name, archived_at, listing_mode").order("name", { ascending: true });
  if (error || !rows) {
    console.error("Could not read businesses:", error?.message);
    process.exit(1);
  }

  const targets: Array<{ id: string; name: string; total: number; grade: string }> = [];
  for (const b of rows as Array<{ id: string; name: string | null; archived_at: string | null; listing_mode: string | null }>) {
    if (b.archived_at || b.listing_mode === "website_only") continue;
    const { data: existing } = await supabase.from("scores").select("id").eq("business_id", b.id).limit(1);
    if ((existing ?? []).length > 0) continue;
    const scored = await scoreBusinessWithClient(supabase, b.id);
    if (scored.status !== "ok") {
      console.log(`  skipped ${b.name ?? b.id}: ${scored.status}`);
      continue;
    }
    targets.push({ id: b.id, name: b.name ?? "(unnamed)", total: scored.result.breakdown.total, grade: scored.result.breakdown.grade });
  }

  console.log(`${dryRun ? "DRY RUN — " : ""}Businesses with no saved score: ${targets.length}\n`);
  for (const t of targets) console.log(`  ${t.name}: first score ${t.total} (${t.grade})  [${t.id}]`);
  if (dryRun || targets.length === 0) {
    console.log(dryRun ? "\nNo writes made. Run without --dry-run to save these." : "\nNothing to save.");
    return;
  }

  let saved = 0;
  for (const t of targets) {
    const result = await saveFirstScoreSnapshotWithClient(supabase, t.id, (s, id) => saveScoreSnapshotWithClient(s, id, SCORING_UPDATE_KIND));
    if (result.status === "saved") saved++;
    else console.error(`  FAILED ${t.name}: ${result.message ?? result.status}`);
  }
  console.log(`\nSaved ${saved} of ${targets.length} first score(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
