// Server-only. Day 25B step 6: each +1 on an offer, dated, in offer_uses
// (supabase/growth-tiers.sql) — R4 "≥ 3 offer uses logged in 30 days" and a
// "You told us" action for the Growth tier. A test offer's +1 is a test too.
// Never fails the +1 itself (the running total is already saved).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function logOfferUse(db: SupabaseClient, kind: "promo" | "referral", offerId: string, userId: string): Promise<void> {
  try {
    const { data } = await db.from(kind === "promo" ? "promos" : "referrals").select("business_id, is_test").eq("id", offerId).maybeSingle();
    const row = data as { business_id: string; is_test: boolean | null } | null;
    if (!row) return;
    await db.from("offer_uses").insert({ business_id: row.business_id, offer_kind: kind, offer_id: offerId, is_test: row.is_test === true, logged_by: userId });
  } catch {
    // The +1 stands; only its date is missing from the log.
  }
}
