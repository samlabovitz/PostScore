// Backfills in-app notifications (supabase/notifications.sql) for every
// business from its SAVED data — the same rules as after a scan
// (lib/notifications.server.ts syncNotificationsFromSavedRow): one urgent
// notification per urgent issue, never a duplicate, and the open ones the
// saved data shows are fixed resolved. No Google call, no website fetch,
// nothing scanned.
//
//   npx tsx --env-file=.env.local scripts/backfill-notifications.ts --dry-run
//   npx tsx --env-file=.env.local scripts/backfill-notifications.ts
//
// --dry-run: prints what it would create and resolve, writes nothing.

import { createRequire } from "module";
import { createClient } from "@supabase/supabase-js";

/** lib/notifications.server.ts guards itself with `import "server-only"`,
 * which throws outside Next — neutralized at the module loader (the same
 * workaround as scripts/rescan-all.ts). */
function allowServerOnly(): void {
  const nodeRequire = createRequire(import.meta.url);
  const Module = nodeRequire("module") as { _load: (request: string, ...rest: unknown[]) => unknown };
  const originalLoad = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, ...rest);
  };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (use --env-file=.env.local).");
  allowServerOnly();
  const { SAVED_SCORING_SELECT, syncNotificationsFromSavedRow } = await import("../lib/notifications.server");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const table = await admin.from("notifications").select("id", { head: true, count: "exact" });
  if (table.error) throw new Error(`The notifications table isn't there yet — run supabase/notifications.sql first (${table.error.code ?? table.error.message}).`);

  const { data, error } = await admin.from("businesses").select(SAVED_SCORING_SELECT).order("name");
  if (error) throw new Error(`Couldn't read businesses: ${error.message}`);
  const rows = (data ?? []) as unknown as Array<Parameters<typeof syncNotificationsFromSavedRow>[1] & { name: string | null }>;

  console.log(`${dryRun ? "DRY RUN — nothing is written. " : ""}${rows.length} business(es), from saved data only.\n`);
  let toCreate = 0;
  let toResolve = 0;
  for (const row of rows) {
    const r = await syncNotificationsFromSavedRow(admin, row, new Date(), dryRun);
    const create = dryRun ? (r.plan?.create ?? []) : null;
    const resolve = dryRun ? (r.plan?.resolve.map((n) => n.key) ?? []) : null;
    const created = dryRun ? create!.length : r.created;
    const resolved = dryRun ? resolve!.length : r.resolved;
    toCreate += created;
    toResolve += resolved;
    if (created === 0 && resolved === 0) continue;
    const verb = dryRun ? "would" : "did";
    console.log(
      `${row.name ?? row.id}: ${verb} create ${created}${create && create.length ? ` (${create.join(", ")})` : ""}; ${verb} resolve ${resolved}${resolve && resolve.length ? ` (${resolve.join(", ")})` : ""}`
    );
  }
  console.log(`\n${dryRun ? "Would create" : "Created"} ${toCreate}, ${dryRun ? "would resolve" : "resolved"} ${toResolve}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
