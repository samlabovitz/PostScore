// Day 23 2d-1: fills each business's saved business type
// (lib/bizTypeResolvedBackfill.server.ts). Dry run by default; `--live`
// writes. Writes nothing if any business would show a different type.
//   npx --no-install tsx --env-file=.env.local scripts/biz-type-resolved-backfill.ts [--live]
import { allowServerOnly } from "./allowServerOnly";

(async () => {
  const live = process.argv.includes("--live");
  allowServerOnly();
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { backfillBizTypeResolved } = await import("../lib/bizTypeResolvedBackfill.server");
  const c = await backfillBizTypeResolved(createAdminClient(), { dryRun: !live });
  console.log(
    `${c.businesses} business(es): ${c.current} already saved, ${live && c.mismatches.length === 0 ? `filled ${c.written}` : `would fill ${c.due}`}; ${c.mismatches.length} would show a different type.` +
      (live ? "" : "  (dry run: nothing changed; add --live to write)")
  );
  for (const m of c.mismatches) console.log(`  ${m.id}: ${m.before} → ${m.after}`);
  if (c.mismatches.length > 0) process.exit(1);
})().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
