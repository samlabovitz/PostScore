// Day 23 2d-5: reads only PostScore's own saved results and the owner's
// confirmed details; Google's values are read live when needed (counted,
// capped Places reads — Business Profile when connected), never saved.
// Applies the niche corrections approved in ~/Desktop/business-types-plan.md
// (the ⚠ rows, and one law firm whose practice area the name can't show).
// Needs supabase/business-niches.sql to have been run. Applied Nov 2026;
// finding each business by name costs one live read (Day 23 2d-5). Each correction is marked 'approved', so the owner still
// sees the one-time "We think you're…" banner and can change it.
//
//   npx tsx --env-file=.env.local scripts/apply-niche-corrections.ts          (dry run)
//   npx tsx --env-file=.env.local scripts/apply-niche-corrections.ts --apply

import { createClient } from "@supabase/supabase-js";
import { resolveBizProfile } from "@/config/bizProfiles";
import { nicheById } from "@/lib/niches";
import { findBusinessByName } from "./liveBusinessRow";

export const APPROVED_CORRECTIONS: Array<{ name: string; nicheId: string }> = [
  { name: "Canadian Tire", nicheId: "department_store" },
  { name: "National 5 & 10", nicheId: "discount_variety" },
  { name: "Pop Culture Vulture", nicheId: "comics_collectibles" },
  { name: "Rainbow Records", nicheId: "record_store" },
  { name: "Minnesota Jewish Community Center - Capp Center", nicheId: "ymca_jcc" },
  { name: "Michael S. Lamonsoff PLLC", nicheId: "personal_injury" },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const c of APPROVED_CORRECTIONS) {
    const niche = nicheById(c.nicheId);
    if (!niche) throw new Error(`Unknown niche ${c.nicheId}`);
    // Day 23 2d-5: found by the shown name (owner-confirmed or live — one
    // counted Places read per business); the type from our own saved reading.
    const found = await findBusinessByName(supabase, c.name);
    const { data, error } = found ? await supabase.from("businesses").select("id, biz_type_resolved").eq("id", found.id) : { data: [], error: null };
    if (error) throw error;
    for (const b of (data ?? []).map((r) => ({ ...r, name: found?.name ?? c.name }))) {
      const autoParent = resolveBizProfile(null, null, null, "en", null, null, b.biz_type_resolved).id;
      const override = niche.parent === autoParent ? null : niche.parent;
      console.log(`${apply ? "APPLY" : "dry run"}: ${b.name} → ${niche.label.en} (type ${niche.parent}${override ? ", set as the business type" : ""})`);
      if (!apply) continue;
      const update = await supabase
        .from("businesses")
        .update({ niche_id: niche.id, niche_source: "approved", niche_confirmed_at: null, business_type_override: override })
        .eq("id", b.id);
      if (update.error) throw update.error;
    }
  }
  if (!apply) console.log("\nNothing written. Run with --apply (after supabase/business-niches.sql).");
}

if (process.argv[1]?.endsWith("apply-niche-corrections.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
