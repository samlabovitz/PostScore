// Day 23 2c-5: blanks the copies of Google's listing values saved with
// each scan (lib/profileSnapshotsCleanup.server.ts) — only where the
// scan's fingerprints stand in for them. Dry run by default; `--live` blanks.
//   npx --no-install tsx --env-file=.env.local scripts/profile-snapshots-cleanup.ts [--live]
import { allowServerOnly } from "./allowServerOnly";

(async () => {
  const live = process.argv.includes("--live");
  allowServerOnly();
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { cleanProfileSnapshots } = await import("../lib/profileSnapshotsCleanup.server");
  const c = await cleanProfileSnapshots(createAdminClient(), { dryRun: !live });
  console.log(
    `${c.withSnapshot} of ${c.scores} scan(s) still keep Google's listing values: ${live ? `blanked ${c.blanked}` : `would blank ${c.blankable}`}; ${c.missingFingerprints} kept (no fingerprints yet).` +
      (live ? "" : "  (dry run: nothing changed; add --live to blank)")
  );
})().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
