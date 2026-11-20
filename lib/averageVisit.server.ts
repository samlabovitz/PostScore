import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** The saved average visit value, or null (none set, or before
 * supabase/gbp-monthly-insights.sql added the column). */
export async function loadAverageVisit(db: SupabaseClient, businessId: string): Promise<number | null> {
  const { data, error } = await db.from("businesses").select("average_visit_value").eq("id", businessId).maybeSingle();
  if (error) return null;
  const v = Number((data as { average_visit_value?: number | string | null } | null)?.average_visit_value);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** The owner's "how many of these become paying visits" (0–1), or null:
 * PostScore's default range (none set, or before supabase/day23c-google-tab.sql). */
export async function loadVisitShare(db: SupabaseClient, businessId: string): Promise<number | null> {
  const { data, error } = await db.from("businesses").select("visit_share").eq("id", businessId).maybeSingle();
  if (error) return null;
  const { cleanShare } = await import("@/lib/googleRecommendations");
  return cleanShare((data as { visit_share?: number | string | null } | null)?.visit_share);
}
