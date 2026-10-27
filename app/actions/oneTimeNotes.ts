"use server";

// One-time notes an owner dismisses for good ("Got it"), per user and
// business, in promo_dismissals (supabase/promo-dismissals.sql) with a
// hidden-until far in the future. Only known note keys.

import { createClient } from "@/lib/supabase/server";
import { SCORING_NOTE_KEY } from "@/lib/scoringUpdateNote";

const KNOWN = new Set([SCORING_NOTE_KEY]);

export async function oneTimeNoteDismissed(businessId: string, key: string): Promise<boolean> {
  if (!KNOWN.has(key)) return true;
  try {
    const { data, error } = await createClient().from("promo_dismissals").select("promo_key").eq("business_id", businessId).eq("promo_key", key).maybeSingle();
    return !error && !!data;
  } catch {
    return false;
  }
}

export async function dismissOneTimeNote(businessId: string, key: string): Promise<{ status: "ok" | "not_enabled" | "unauthenticated" | "error" }> {
  if (!KNOWN.has(key)) return { status: "error" };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  const { error } = await supabase
    .from("promo_dismissals")
    .upsert({ user_id: user.id, business_id: businessId, promo_key: key, hidden_until: "2100-01-01T00:00:00Z" }, { onConflict: "user_id,business_id,promo_key" });
  if (error) return /promo_dismissals|42P01|PGRST205/.test(`${error.code} ${error.message}`) ? { status: "not_enabled" } : { status: "error" };
  return { status: "ok" };
}
