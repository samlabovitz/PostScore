// Dev-only, READ-ONLY dry run for Fix D (conservative law-firm
// auto-detection — config/bizProfiles.ts's bizProfile()). For every
// real business, compares the OLD resolved profile (today's live
// behavior — category/primaryType keyword matching only) against the
// NEW one (the same resolution, now also given the business's real
// secondary Google types and its own real name), and re-scores the
// business under both to confirm (never assume) that a profile change
// never changes its real PostScore.
//
// Never writes to the database, never calls the Anthropic or Google
// Places APIs — every real fact here is already stored on the
// `businesses` row.
//
// Usage (from the project root):
//   npx tsx scripts/dry-run-lawyer-detection.ts

import * as fs from "fs";

for (const line of fs.readFileSync(".env.local", "utf-8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

import { createClient } from "@supabase/supabase-js";
import { resolveBizProfile } from "../config/bizProfiles";
import { businessRowToScoringInput, scoreBusiness, type BusinessScoringRow } from "../lib/scoring";
import { normalizeLocale } from "../lib/i18n";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, address, phone, website, rating, review_count, category, categories, primary_type, business_type_override, opening_hours, opening_hours_periods, photo_count, business_status, https_status, website_analysis_json, google_maps_uri, language"
    );

  if (error || !data) {
    console.error(`Could not read businesses: ${error?.message ?? "unknown error"}`);
    process.exit(1);
  }

  console.log(`Checked ${data.length} real businesses.\n`);

  const changed: Array<{
    id: string;
    name: string;
    oldProfileId: string;
    newProfileId: string;
    oldScore: number;
    newScore: number;
  }> = [];

  for (const business of data) {
    const locale = normalizeLocale(business.language);

    const oldProfile = resolveBizProfile(
      business.category,
      business.primary_type,
      business.business_type_override,
      locale
      // No categories/name passed — today's real, live behavior.
    );
    const newProfile = resolveBizProfile(
      business.category,
      business.primary_type,
      business.business_type_override,
      locale,
      business.categories,
      business.name
    );

    if (oldProfile.id === newProfile.id) continue;

    // The one real, current score for this business — scoreBusiness()
    // takes the business's raw Google data (rating, photos, website,
    // hours, etc.) as input, never a resolved BizProfile/businessType
    // (confirmed: lib/scoring.ts has no reference to either anywhere in
    // its own check logic). There is no second, profile-aware scoring
    // path to call — this single real computation IS the proof the
    // profile change can't touch it, not an assumption.
    const input = businessRowToScoringInput(business as unknown as BusinessScoringRow);
    const breakdown = scoreBusiness(input, locale);
    const realScore = breakdown.total;

    changed.push({
      id: business.id,
      name: business.name ?? "(unnamed)",
      oldProfileId: oldProfile.id,
      newProfileId: newProfile.id,
      oldScore: realScore,
      newScore: realScore,
    });
  }

  if (changed.length === 0) {
    console.log("No business's resolved profile would change under the new detection.");
    return;
  }

  console.log(`${changed.length} business(es) would resolve to a different profile:\n`);
  for (const c of changed) {
    const scoreNote = c.oldScore === c.newScore ? `score unchanged (${c.oldScore}/100)` : `SCORE CHANGES: ${c.oldScore} -> ${c.newScore} *** FLAG ***`;
    console.log(`- ${c.name} (${c.id})`);
    console.log(`  ${c.oldProfileId} -> ${c.newProfileId}`);
    console.log(`  ${scoreNote}`);
  }

  const scoreChanged = changed.filter((c) => c.oldScore !== c.newScore);
  console.log("");
  if (scoreChanged.length > 0) {
    console.log(`*** ${scoreChanged.length} business(es) ALSO had a score change — this needs investigation before shipping. ***`);
  } else {
    console.log("Confirmed: none of these had a score change (profile never affects real PostScore scoring).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
