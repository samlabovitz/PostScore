// Server-only. Day 23E: one approval for a sitting (Approve all, or the
// answers preview's "Apply to Google"). The limits — one approval a
// minute, the daily cap (lib/gbpAttributes.ts approvalAllowed) — are
// checked ONCE here, before anything is sent; every write in the sitting
// then uses inSitting(store, at), so it isn't held back by the sitting's
// own earlier writes.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { approvalAllowed } from "@/lib/gbpAttributes";

export type SittingStart = { status: "ok"; at: number } | { status: "wait"; error: "wait_minute" | "daily_cap" } | { status: "not_enabled" };

export async function startSitting(admin: SupabaseClient, businessId: string, now: number = Date.now()): Promise<SittingStart> {
  const { supabaseChangeStore } = await import("@/lib/gbpAttributes.server");
  const approvals = await supabaseChangeStore(admin).approvalsSince(businessId, new Date(now - 86_400_000).toISOString());
  if (approvals === null) return { status: "not_enabled" };
  const allowed = approvalAllowed(approvals, now);
  return allowed === "ok" ? { status: "ok", at: now } : { status: "wait", error: allowed };
}
