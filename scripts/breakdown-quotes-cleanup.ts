// Day 23 2c-3: removes the text quoting Google's values from saved score
// breakdowns — the owner's scans and competitors' (lib/breakdownQuotesCleanup.server.ts).
// Points stay. Dry run by default: counts only. `--live` cleans.
//   npx --no-install tsx --env-file=.env.local scripts/breakdown-quotes-cleanup.ts [--live]
import { allowServerOnly } from "./allowServerOnly";

(async () => {
  const live = process.argv.includes("--live");
  allowServerOnly();
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { cleanBreakdownQuotes } = await import("../lib/breakdownQuotesCleanup.server");
  const c = await cleanBreakdownQuotes(createAdminClient(), { dryRun: !live });
  console.log(
    `${live ? "Cleaned" : "Would clean"}: ${c.scoresWithQuotes} of ${c.scores} owner scan(s); ${c.competitorRowsWithQuotes} of ${c.competitorRows} competitor row(s).` +
      (live ? "" : "  (dry run: nothing changed; add --live to clean)")
  );
})().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
