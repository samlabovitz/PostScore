// Day 23 2c-4: removes Google's side from saved website-vs-listing findings
// (lib/infoConflictsCleanup.server.ts). Dry run by default; `--live` writes.
//   npx --no-install tsx --env-file=.env.local scripts/info-conflicts-cleanup.ts [--live]
import { allowServerOnly } from "./allowServerOnly";

(async () => {
  const live = process.argv.includes("--live");
  allowServerOnly();
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { cleanInfoConflicts } = await import("../lib/infoConflictsCleanup.server");
  const c = await cleanInfoConflicts(createAdminClient(), { dryRun: !live });
  console.log(
    `${live ? "Cleaned" : "Would clean"}: ${c.findings} finding(s) quoting Google on ${c.withGoogleSide} of ${c.businesses} business(es) with a website analysis.` +
      (live ? "" : "  (dry run: nothing changed; add --live to clean)")
  );
})().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
