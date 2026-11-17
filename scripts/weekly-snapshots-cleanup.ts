// Day 23 2c-4: weekly snapshots stop keeping Google's rating and review
// count; their changes are recomputed from our own change records
// (lib/weeklySnapshotsCleanup.server.ts). Dry run by default; `--live` writes.
//   npx --no-install tsx --env-file=.env.local scripts/weekly-snapshots-cleanup.ts [--live]
import { allowServerOnly } from "./allowServerOnly";

(async () => {
  const live = process.argv.includes("--live");
  allowServerOnly();
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { cleanWeeklySnapshots } = await import("../lib/weeklySnapshotsCleanup.server");
  const c = await cleanWeeklySnapshots(createAdminClient(), { dryRun: !live });
  console.log(
    `${live ? "Updated" : "Would update"}: of ${c.rows} weekly snapshot(s), ${c.withGoogleValues} lose Google's rating / review count; ${c.changesRecomputed} get their changes recomputed from our records.` +
      (live ? ` ${c.updated} row(s) written.` : "  (dry run: nothing changed; add --live to write)")
  );
})().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
