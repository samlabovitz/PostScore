// One-time (and on-demand) website-screenshots cleanup. Dry run by
// default: prints every file it would delete with the reason and the total
// size. `--live` deletes them (and clears captures older than 90 days from
// the business's analysis so the page shows "Refresh").
//   npx --no-install tsx --env-file=.env.local scripts/screenshot-orphans.ts [--live]
const Module = require("module");
const orig = Module._load;
Module._load = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return orig.call(this, req, ...rest);
};

(async () => {
  const live = process.argv.includes("--live");
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { sweepScreenshots } = await import("../lib/screenshotStorage.server");
  const { plan, deleted } = await sweepScreenshots(createAdminClient(), { dryRun: !live });
  for (const f of plan) console.log(`${live ? "deleted" : "would delete"}  ${f.reason.padEnd(19)} ${(f.bytes / 1024).toFixed(0).padStart(6)} KB  ${f.path}`);
  const mb = plan.reduce((s, f) => s + f.bytes, 0) / 1048576;
  const by = plan.reduce<Record<string, number>>((m, f) => ({ ...m, [f.reason]: (m[f.reason] ?? 0) + 1 }), {});
  console.log(`\n${live ? `Deleted ${deleted}` : `Would delete ${plan.length}`} file(s), ${mb.toFixed(1)} MB — ${JSON.stringify(by)}${live ? "" : "  (dry run: nothing changed; add --live to delete)"}`);
})().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
export {};
