// One-time (and on-demand) clearing of Google's values from saved
// competitor scans (Day 23 2b-3, lib/competitorRawCleanup.server.ts) — the
// same rule the nightly cleanup runs, without its 300-rows-a-night limit.
// Dry run by default: prints the counts, changes nothing. `--live` clears.
//   npx --no-install tsx --env-file=.env.local scripts/competitor-raw-cleanup.ts [--live]
import { allowServerOnly } from "./allowServerOnly";

(async () => {
  const live = process.argv.includes("--live");
  allowServerOnly();
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { cleanCompetitorRawValues } = await import("../lib/competitorRawCleanup.server");
  const c = await cleanCompetitorRawValues(createAdminClient(), { dryRun: !live });
  console.log(
    `${live ? "Cleared" : "Would clear"} ${c.rows} competitor row(s) in ${c.scans} scan(s); ${c.expiredJobs} scan(s) still being scored after 24 hours ${live ? "closed" : "would be closed"} first; ${c.overrideNames} Remove / Add name(s) ${live ? "blanked" : "would be blanked"}.${live ? "" : "  (dry run: nothing changed; add --live to clear)"}`
  );
})().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
