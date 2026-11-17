// Server-only. Day 23 2c-4: removes Google's side ("googleValue") from the
// website-vs-listing findings already saved on businesses
// (website_analysis_json.websiteTrust.infoConflicts). The website's side,
// the comparison and the week read from the site stay; Google's side is
// rebuilt when shown (lib/websiteTrust.ts googleSideOf). New analyses
// already save this way.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withoutGoogleSide } from "@/lib/websiteTrust";

export async function cleanInfoConflicts(db: SupabaseClient, options: { dryRun: boolean }): Promise<{ businesses: number; withGoogleSide: number; findings: number }> {
  const { data, error } = await db.from("businesses").select("id, website_analysis_json").not("website_analysis_json", "is", null);
  if (error) throw new Error(`businesses: ${error.message}`);
  const counts = { businesses: (data ?? []).length, withGoogleSide: 0, findings: 0 };
  for (const b of (data ?? []) as Array<{ id: string; website_analysis_json: unknown }>) {
    const conflicts = (b.website_analysis_json as { websiteTrust?: { infoConflicts?: Array<{ googleValue?: unknown }> } } | null)?.websiteTrust?.infoConflicts ?? [];
    const quoted = conflicts.filter((f) => f.googleValue !== undefined && f.googleValue !== null).length;
    if (quoted === 0) continue;
    counts.withGoogleSide++;
    counts.findings += quoted;
    if (options.dryRun) continue;
    const { error: e } = await db.from("businesses").update({ website_analysis_json: withoutGoogleSide(b.website_analysis_json) }).eq("id", b.id);
    if (e) throw new Error(`businesses: ${e.message}`);
  }
  return counts;
}
