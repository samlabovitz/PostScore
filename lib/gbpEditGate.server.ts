// Server-only. The one check before PostScore reads or changes anything on
// an owner's Google Business Profile ("Update on Google", "Add to Order
// online"): the signed-in owner (RLS), the plan when the action needs
// Premium, not archived, Google connected with a matched location, and a
// usable token. Never trusts anything from the browser.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/premium";
import { isPremiumPlan, type Plan } from "@/lib/plan";
import { normalizeLocale } from "@/lib/i18n";
import { isBusinessArchived } from "@/lib/businessArchive.server";
import type { GbpEditError, GbpEditTarget } from "@/lib/gbpAttributes.server";

export type GbpEditBlock = "unauthenticated" | "not_found" | "not_premium" | "archived" | "not_connected";

export type GbpGate =
  | {
      ok: true;
      target: GbpEditTarget;
      plan: Plan;
      admin: import("@supabase/supabase-js").SupabaseClient;
      tokens: typeof import("@/lib/gbpTokens.server");
      /** The business row fields the actions need (read through RLS). */
      business: { id: string; language: string | null; website: string | null; verified_website_url: string | null };
    }
  | { ok: false; result: { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: GbpEditError } };

export async function gbpEditGate(businessId: string, options: { requirePremium: boolean }): Promise<GbpGate> {
  const blocked = (reason: GbpEditBlock): GbpGate => ({ ok: false, result: { status: "blocked", reason } });
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return blocked("unauthenticated");
  // RLS: only the owner's own business comes back.
  const { data: business } = await supabase.from("businesses").select("id, language, website, verified_website_url").eq("id", businessId).eq("owner_id", user.id).maybeSingle();
  if (!business) return blocked("not_found");
  const plan = await getPlan();
  if (options.requirePremium && !isPremiumPlan(plan)) return blocked("not_premium");
  if (await isBusinessArchived(supabase, businessId)) return blocked("archived");

  const [tokens, { createAdminClient }] = await Promise.all([import("@/lib/gbpTokens.server"), import("@/lib/supabase/admin")]);
  const admin = createAdminClient();
  const { data: conn } = await admin.from("gbp_connections").select("status, google_location_id").eq("business_id", businessId).maybeSingle();
  if (conn?.status !== "connected" || typeof conn.google_location_id !== "string" || !conn.google_location_id.startsWith("locations/")) return blocked("not_connected");
  const token = await tokens.getValidAccessTokenWithClient(admin, businessId);
  if (token.status !== "ok") {
    if (token.reason === "not_connected") return blocked("not_connected");
    return { ok: false, result: { status: "error", error: token.reason === "reconnect" ? "reconnect" : "failed" } };
  }
  return {
    ok: true,
    plan,
    admin,
    tokens,
    business: business as { id: string; language: string | null; website: string | null; verified_website_url: string | null },
    target: { businessId, userId: user.id, locationName: conn.google_location_id, accessToken: token.accessToken, locale: normalizeLocale(business.language) },
  };
}
