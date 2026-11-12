// Server-only. Who may read and change the website link and customer
// details on Google, and against which Google — shared by "Update website
// on Google" (app/actions/gbpWebsiteLink.ts) and customer details' "Update
// on Google" (app/actions/gbpCustomerDetails.ts):
// - practice mode (REVIEW_REPLIES_PRACTICE=1, never in production): the
//   Premium owner's business against practice mode's fake Google
//   (lib/gbpProfilePractice.server.ts) — no connection needed, nothing
//   ever sent; changes allowed;
// - otherwise the real gate (lib/gbpEditGate.server.ts) and the real
//   listing, with changes allowed only when the business is on
//   GOOGLE_WRITES_LIVE_PLACES (default: none — read-only).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";
import type { GbpEditError, GbpEditTarget } from "@/lib/gbpAttributes.server";
import { googleWritesAllowed, reviewRepliesPracticeOn } from "@/lib/gbpReviewPractice";
import { normalizeLocale } from "@/lib/i18n";

export interface GoogleWriteContext {
  ok: true;
  admin: SupabaseClient;
  target: GbpEditTarget;
  practice: boolean;
  /** Practice mode, or the business is on GOOGLE_WRITES_LIVE_PLACES. */
  canEdit: boolean;
  fetchImpl: typeof fetch;
  business: { verified_website_url: string | null };
  /** Real mode only: mark the connection for reconnecting. */
  markReconnect: () => Promise<void>;
}
export type GoogleWriteBlocked = { ok: false; result: { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: GbpEditError } };

export async function googleWriteContext(businessId: string): Promise<GoogleWriteContext | GoogleWriteBlocked> {
  if (reviewRepliesPracticeOn()) {
    const [{ practiceOwnerGate }, practice] = await Promise.all([import("@/lib/gbpPracticeGate.server"), import("@/lib/gbpProfilePractice.server")]);
    const gate = await practiceOwnerGate(businessId);
    if (!gate.ok) return gate;
    const { data } = await gate.admin.from("businesses").select("verified_website_url").eq("id", businessId).maybeSingle();
    return {
      ok: true,
      admin: gate.admin,
      target: { businessId, userId: gate.userId, locationName: practice.PRACTICE_PROFILE_LOCATION, accessToken: "practice-token", locale: normalizeLocale(gate.business.language) },
      practice: true,
      canEdit: true,
      fetchImpl: practice.practiceProfileFetch(businessId),
      business: { verified_website_url: (data as { verified_website_url?: string | null } | null)?.verified_website_url ?? null },
      markReconnect: async () => {},
    };
  }
  const { gbpEditGate } = await import("@/lib/gbpEditGate.server");
  const gate = await gbpEditGate(businessId, { requirePremium: true });
  if (!gate.ok) return gate;
  return {
    ok: true,
    admin: gate.admin,
    target: gate.target,
    practice: false,
    canEdit: googleWritesAllowed(gate.business.place_id),
    fetchImpl: fetch,
    business: { verified_website_url: gate.business.verified_website_url },
    markReconnect: async () => {
      await gate.tokens.markGbpReconnect(gate.admin, businessId);
    },
  };
}
