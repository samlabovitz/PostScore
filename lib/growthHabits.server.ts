import "server-only";

// The Growth checklist's "Also helps your score" tags: points left on the saved scan (never a live read, never a
// re-score). The owner-scoped client: RLS keeps it to the owner's own business.

import { createClient } from "@/lib/supabase/server";
import { scoreRoom, type ScoreRoom } from "@/lib/growthHabits";

export async function loadScoreRoom(businessId: string): Promise<ScoreRoom> {
  const { data } = await createClient().from("scores").select("checks:breakdown_json->checks").eq("business_id", businessId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const checks = (data as { checks?: unknown } | null)?.checks;
  return scoreRoom(Array.isArray(checks) ? (checks as Array<{ id: string; earnedPoints: number | null; maxPoints: number }>) : null);
}
