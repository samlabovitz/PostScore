// One run over every saved business with no business type set (e.g.
// Rooted On Main, saved as a generic "Store"): the same detection that now
// runs when a business is added (lib/businessTypeDetect.server.ts).
//
// Dry run by default — prints what each business would get and saves
// nothing:
//   npx --no-install tsx --env-file=.env.local scripts/detect-business-types.ts
// Saves the confident picks (needs supabase/niche-source-auto.sql):
//   npx --no-install tsx --env-file=.env.local scripts/detect-business-types.ts --apply
//
// Never touches a business whose type is already set — by the owner or
// otherwise. Reads each homepage once (a plain fetch); no Google call.

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
import { nicheById } from "../lib/niches";
import type { detectAndSaveBusinessTypeWithClient as DetectFn } from "../lib/businessTypeDetect.server";

/** lib/businessTypeDetect.server.ts guards itself with "server-only", which
 * plain Node can't load — neutralized here, as in scripts/rescan-all.ts. */
async function loadDetect(): Promise<typeof DetectFn> {
  const nodeRequire = createRequire(import.meta.url);
  const Module = nodeRequire("module") as { _load: (request: string, ...rest: unknown[]) => unknown };
  const originalLoad = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, ...rest);
  };
  return ((await import("../lib/businessTypeDetect.server")) as { detectAndSaveBusinessTypeWithClient: typeof DetectFn }).detectAndSaveBusinessTypeWithClient;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const detect = await loadDetect();
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await db.from("businesses").select("id, name, category").is("niche_id", null).is("archived_at", null).order("name");
  if (error) throw new Error(error.message);
  console.log(`${apply ? "APPLY" : "DRY RUN"} — ${data?.length ?? 0} businesses with no type set\n`);
  const counts: Record<string, number> = {};
  for (const b of data ?? []) {
    const r = await detect(db, b.id, { apply });
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    const label = (id: string | null | undefined) => (id ? `${nicheById(id)?.label.en ?? id} (${id})` : "—");
    const line =
      r.status === "saved" || r.status === "would_save"
        ? `${r.status === "saved" ? "SAVED" : "WOULD PICK"}  ${label(r.nicheId)}${r.override ? ` · type → ${r.override}` : ""} · ${r.result.evidence.join("; ")}`
        : r.status === "unsure"
          ? `ASK OWNER   best guess ${label(r.result.nicheId)}${r.result.runnerUp ? ` vs ${label(r.result.runnerUp)}` : ""} · ${r.result.evidence.join("; ") || "nothing matched"}`
          : r.status === "not_enabled"
            ? `NOT SAVED   ${label(r.nicheId)} — run supabase/niche-source-auto.sql first`
            : r.status.toUpperCase();
    console.log(`${(b.name ?? b.id).padEnd(42).slice(0, 42)} [${b.category ?? "—"}]\n    ${line}`);
  }
  console.log(`\n${JSON.stringify(counts)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
