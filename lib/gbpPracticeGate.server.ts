// Server-only. The gate for practice mode (lib/gbpReviewPractice.ts —
// never in production): the signed-in owner (RLS), Premium, not archived —
// like gbpEditGate (lib/gbpEditGate.server.ts) minus Google, since the fake
// Google needs no connection or token. Shared by review replies and Edit
// on Google.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";

export type PracticeGate =
  | { ok: true; admin: SupabaseClient; userId: string; business: { id: string; name: string | null; language: string | null } }
  | { ok: false; result: { status: "blocked"; reason: GbpEditBlock } };

export async function practiceOwnerGate(businessId: string): Promise<PracticeGate> {
  const blocked = (reason: GbpEditBlock): PracticeGate => ({ ok: false, result: { status: "blocked", reason } });
  const [{ createClient }, { getPlan }, { isPremiumPlan }, { isBusinessArchived }, { createAdminClient }] = await Promise.all([
    import("@/lib/supabase/server"),
    import("@/lib/premium"),
    import("@/lib/plan"),
    import("@/lib/businessArchive.server"),
    import("@/lib/supabase/admin"),
  ]);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return blocked("unauthenticated");
  const { data: business } = await supabase.from("businesses").select("id, name, language").eq("id", businessId).eq("owner_id", user.id).maybeSingle();
  if (!business) return blocked("not_found");
  if (!isPremiumPlan(await getPlan())) return blocked("not_premium");
  if (await isBusinessArchived(supabase, businessId)) return blocked("archived");
  return { ok: true, admin: createAdminClient(), userId: user.id, business: business as { id: string; name: string | null; language: string | null } };
}
