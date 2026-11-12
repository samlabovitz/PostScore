// Server-only. Who may read and change the ordering / booking link on
// Google, and against which Google — shared by the "Order online" /
// "Booking link" card (app/actions/gbpOrderLink.ts) and "Add to 'Order
// online'" on the platform link card (app/actions/gbpPlaceActions.ts):
// - practice mode (REVIEW_REPLIES_PRACTICE=1, never in production): the
//   Premium owner's business against a fake Place Actions API
//   (lib/gbpPlaceActionsPractice.server.ts) — no connection needed,
//   nothing ever sent; changes allowed;
// - otherwise the real gate (lib/gbpEditGate.server.ts) and real links,
//   with changes allowed only when the business's place id is in
//   GOOGLE_WRITES_LIVE_PLACES (default: none — read-only).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";
import type { GbpEditError } from "@/lib/gbpAttributes.server";
import type { ProfileTarget } from "@/lib/gbpProfileEdits.server";
import { googleWritesAllowed, reviewRepliesPracticeOn } from "@/lib/gbpReviewPractice";
import { orderLinkKindFor, ownSiteHost, type OrderLinkKind, type OwnSite } from "@/lib/gbpOrderLink";

export interface OrderLinkContext {
  ok: true;
  admin: SupabaseClient;
  target: ProfileTarget;
  practice: boolean;
  premium: boolean;
  /** Practice mode, or the place id is on GOOGLE_WRITES_LIVE_PLACES. */
  canEdit: boolean;
  fetchImpl: typeof fetch;
  website: string | null;
  /** Which card the business gets ("Order online" / "Booking link"); null: none. */
  kind: OrderLinkKind | null;
  ownSite: OwnSite;
  /** Real mode only: mark the connection for reconnecting. */
  markReconnect: () => Promise<void>;
}
export type OrderLinkBlocked = { ok: false; result: { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: GbpEditError } };

async function businessFacts(admin: SupabaseClient, businessId: string) {
  const { data } = await admin
    .from("businesses")
    .select("place_id, name, website, category, primary_type, business_type_override, categories, language, website_analysis_json")
    .eq("id", businessId)
    .maybeSingle();
  const b = (data ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const [{ resolveBizProfile }, { parseWebsiteAnalysis }] = await Promise.all([import("@/config/bizProfiles"), import("@/lib/scoring")]);
  const profile = resolveBizProfile(str(b.category), str(b.primary_type), str(b.business_type_override), undefined, Array.isArray(b.categories) ? (b.categories as string[]) : null, str(b.name));
  const analysis = parseWebsiteAnalysis(b.website_analysis_json);
  const website = str(b.website);
  return {
    placeId: str(b.place_id),
    website,
    kind: orderLinkKindFor(profile.id),
    // "Not a parked domain": the last scan's own finding for the site.
    ownSite: { host: ownSiteHost(website), parked: !!analysis?.content?.parkedDomain || analysis?.websiteTrust?.listingLinkParked === true },
  };
}

/** `requirePremium: false` (reading the platform link card): a non-Premium owner reads the real links even in practice mode. */
export async function orderLinkContext(businessId: string, options: { requirePremium: boolean } = { requirePremium: true }): Promise<OrderLinkContext | OrderLinkBlocked> {
  if (reviewRepliesPracticeOn()) {
    const [{ practiceOwnerGate }, practice, { PRACTICE_PROFILE_LOCATION }] = await Promise.all([
      import("@/lib/gbpPracticeGate.server"),
      import("@/lib/gbpPlaceActionsPractice.server"),
      import("@/lib/gbpProfilePractice.server"),
    ]);
    const gate = await practiceOwnerGate(businessId);
    if (gate.ok) {
      const facts = await businessFacts(gate.admin, businessId);
      return {
        ok: true,
        admin: gate.admin,
        target: { businessId, userId: gate.userId, locationName: PRACTICE_PROFILE_LOCATION, accessToken: "practice-token" },
        practice: true,
        premium: true,
        canEdit: true,
        fetchImpl: practice.practicePlaceActionsFetch(businessId),
        website: facts.website,
        kind: facts.kind,
        ownSite: facts.ownSite,
        markReconnect: async () => {},
      };
    }
    if (options.requirePremium || gate.result.reason !== "not_premium") return gate;
  }
  const [{ gbpEditGate }, { isPremiumPlan }] = await Promise.all([import("@/lib/gbpEditGate.server"), import("@/lib/plan")]);
  const gate = await gbpEditGate(businessId, options);
  if (!gate.ok) return gate;
  const facts = await businessFacts(gate.admin, businessId);
  return {
    ok: true,
    admin: gate.admin,
    target: { businessId, userId: gate.target.userId, locationName: gate.target.locationName, accessToken: gate.target.accessToken },
    practice: false,
    premium: isPremiumPlan(gate.plan),
    canEdit: googleWritesAllowed(facts.placeId),
    fetchImpl: fetch,
    website: gate.business.website,
    kind: facts.kind,
    ownSite: facts.ownSite,
    markReconnect: async () => {
      await gate.tokens.markGbpReconnect(gate.admin, businessId);
    },
  };
}
