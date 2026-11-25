// Server-only. Day 25B step 5: Customer offers' data — the running coupons
// and referral program, and the tracking summary, never with test offers
// (lib/offerTesting.ts) unless the viewer is the dev test login.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { offerSummary, showsTestOffers, type OfferSummary } from "@/lib/offerTesting";
import type { PromoRow } from "@/lib/promos";
import type { ReferralRow } from "@/lib/referrals";

const PROMO_COLUMNS = "id, business_id, type, offer, code, instructions, terms, expiry, redemptions, active, created_at, is_test";
const REFERRAL_COLUMNS = "id, business_id, referrer_reward, friend_reward, code, redemptions, active, created_at, is_test";

export type OffersData =
  | { status: "ok"; promos: PromoRow[]; referral: ReferralRow | null; summary: OfferSummary; testAccount: boolean }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

export async function loadOffers(businessId: string): Promise<OffersData> {
  const db = createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { status: "unauthenticated" };
  const withTests = showsTestOffers(auth.user.email);
  const [promos, referrals] = await Promise.all([
    db.from("promos").select(PROMO_COLUMNS).eq("business_id", businessId).order("created_at", { ascending: false }),
    db.from("referrals").select(REFERRAL_COLUMNS).eq("business_id", businessId).order("created_at", { ascending: false }),
  ]);
  if (promos.error || referrals.error) return { status: "error", message: (promos.error ?? referrals.error)!.message };
  type Tagged = { is_test?: boolean | null; active: boolean; created_at: string; redemptions: number };
  const visible = <T extends Tagged>(rows: T[]) => rows.filter((r) => withTests || !r.is_test);
  const promoRows = visible((promos.data ?? []) as unknown as Array<PromoRow & Tagged>);
  const referralRows = visible((referrals.data ?? []) as unknown as Array<ReferralRow & Tagged>);
  return {
    status: "ok",
    promos: promoRows.filter((p) => p.active),
    referral: referralRows.find((r) => r.active) ?? null,
    summary: offerSummary([...promoRows, ...referralRows], true),
    testAccount: withTests && [...promoRows, ...referralRows].some((r) => r.is_test),
  };
}
