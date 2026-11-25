// Day 25B step 6 (docs/plans/day25a-spec.md §6.2, CLAUDE.md "Before launch"):
// the Growth tier reset. Wipes every business's tier rows (growth_tiers) and
// the weekly activity built from its history (growth_weeks), for ALL
// accounts — the dev test login included — and sets the reset date
// (growth_settings.reset_at): from then on every tier starts fresh, and tier
// queries ignore anything older.
//
// Never touches PostScore scores, scans, scan_changes, the Google listing, or
// the source rows themselves (offers, tasks, gbp_changes, reply logs, +1s,
// "Closed this week" marks). Runs only when Sam asks.
//
//   npx --no-install tsx --env-file=.env.local scripts/reset-growth-tiers.ts           # dry run (default)
//   npx --no-install tsx --env-file=.env.local scripts/reset-growth-tiers.ts --apply   # after Sam's OK
import { createClient } from "@supabase/supabase-js";

setTimeout(() => {
  console.error("timed out");
  process.exit(1);
}, 5 * 60_000);

async function main() {
  const apply = process.argv.includes("--apply");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const count = async (table: string) => {
    const { data, error } = await admin.from(table).select("business_id");
    if (error) throw new Error(`${table}: ${error.message}`);
    const by = new Map<string, number>();
    for (const r of (data ?? []) as Array<{ business_id: string }>) by.set(r.business_id, (by.get(r.business_id) ?? 0) + 1);
    return by;
  };
  const [tiers, weeks] = await Promise.all([count("growth_tiers"), count("growth_weeks")]);
  const ids = Array.from(new Set(Array.from(tiers.keys()).concat(Array.from(weeks.keys()))));
  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${ids.length} businesses · ${Array.from(tiers.values()).reduce((a, b) => a + b, 0)} tier rows · ${Array.from(weeks.values()).reduce((a, b) => a + b, 0)} weekly activity rows`);
  for (const id of ids) console.log(`  ${id}: ${tiers.get(id) ?? 0} tier rows, ${weeks.get(id) ?? 0} weekly activity rows`);
  const resetAt = new Date().toISOString();
  console.log(`  reset date → ${resetAt} (tiers start fresh from here)`);
  if (!apply) {
    console.log("Nothing changed. Re-run with --apply after Sam's OK.");
    process.exit(0);
  }
  for (const table of ["growth_tiers", "growth_weeks"]) {
    const { error } = await admin.from(table).delete().not("business_id", "is", null);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  const { error } = await admin.from("growth_settings").upsert({ id: 1, reset_at: resetAt, updated_at: resetAt }, { onConflict: "id" });
  if (error) throw new Error(`growth_settings: ${error.message}`);
  console.log("Done: tier data cleared, reset date saved.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
