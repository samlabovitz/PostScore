"use server";

// Hiding an upgrade promo (the showcase strip's ×) for 14 days, for this
// user and business. Before supabase/promo-dismissals.sql is run this
// returns "not_enabled" and the browser keeps the hide on the device.

import { createClient } from "@/lib/supabase/server";
import { hiddenUntilFrom, isValidPromoKey } from "@/lib/upgradePromos";

export type HidePromoResult = { status: "ok"; hiddenUntil: string } | { status: "not_enabled" } | { status: "unauthenticated" } | { status: "error" };

export async function hidePromo(businessId: string, key: string): Promise<HidePromoResult> {
  if (!isValidPromoKey(key) || typeof businessId !== "string") return { status: "error" };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  const hiddenUntil = hiddenUntilFrom(new Date());
  const { error } = await supabase
    .from("promo_dismissals")
    .upsert({ user_id: user.id, business_id: businessId, promo_key: key, hidden_until: hiddenUntil }, { onConflict: "user_id,business_id,promo_key" });
  if (error) return /promo_dismissals|42P01|PGRST205/.test(`${error.code} ${error.message}`) ? { status: "not_enabled" } : { status: "error" };
  return { status: "ok", hiddenUntil };
}
