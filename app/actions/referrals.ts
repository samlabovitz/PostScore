"use server";

import { createClient } from "@/lib/supabase/server";
import { MAX_ACTIVE_REFERRALS, type ReferralRow } from "@/lib/referrals";

const REFERRAL_COLUMNS = "id, business_id, referrer_reward, friend_reward, code, redemptions, active, created_at";

export type GetActiveReferralResult =
  | { status: "ok"; referral: ReferralRow | null }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/** RLS-scoped lookup of a business's currently active referral program
 * — at most one ever exists (see enforce_max_active_referrals in
 * supabase/schema.sql), so this returns a single row or null rather
 * than a list like listActivePromos does. */
export async function getActiveReferral(businessId: string): Promise<GetActiveReferralResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("referrals")
    .select(REFERRAL_COLUMNS)
    .eq("business_id", businessId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "ok", referral: (data as ReferralRow | null) ?? null };
}

export interface StartReferralInput {
  referrerReward: string;
  friendReward: string;
  code: string;
}

export type StartReferralResult =
  | { status: "ok"; referral: ReferralRow }
  | { status: "unauthenticated" }
  | { status: "limit_reached" }
  | { status: "error"; message: string };

/**
 * Saves the referral offer currently built in ReferralBuilder as the
 * business's active referral program. Checks the 1-active-max here
 * first so the owner gets a clear "limit_reached" result instead of a
 * raw database error — but the real guarantee is the
 * enforce_max_active_referrals trigger in supabase/schema.sql, which
 * still applies underneath this (e.g. against a race from a second
 * tab), so a Postgres error from that trigger is also mapped to
 * "limit_reached" below rather than surfaced as a generic failure.
 */
export async function startReferral(
  businessId: string,
  input: StartReferralInput
): Promise<StartReferralResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { count, error: countError } = await supabase
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("active", true);

  if (countError) {
    return { status: "error", message: countError.message };
  }
  if ((count ?? 0) >= MAX_ACTIVE_REFERRALS) {
    return { status: "limit_reached" };
  }

  const { data, error } = await supabase
    .from("referrals")
    .insert({
      business_id: businessId,
      referrer_reward: input.referrerReward,
      friend_reward: input.friendReward,
      code: input.code,
      redemptions: 0,
      active: true,
    })
    .select(REFERRAL_COLUMNS)
    .single();

  if (error || !data) {
    if (error?.message.includes("at most 1 active referral")) {
      return { status: "limit_reached" };
    }
    return { status: "error", message: error?.message ?? "Could not start this referral program." };
  }

  return { status: "ok", referral: data as ReferralRow };
}

export type IncrementReferralRedemptionResult =
  | { status: "ok"; redemptions: number }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/** The honest "+1 Referral" tap — the owner or staff hits this when a
 * referred friend actually comes in. Uses an atomic SQL increment (see
 * increment_referral_redemption in supabase/schema.sql) so concurrent
 * taps from different devices can't clobber each other, and stays
 * RLS-scoped since that function runs as the calling role, not
 * security definer. */
export async function incrementReferralRedemption(
  referralId: string
): Promise<IncrementReferralRedemptionResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase.rpc("increment_referral_redemption", {
    p_referral_id: referralId,
  });

  if (error) {
    return { status: "error", message: error.message };
  }
  if (data === null || data === undefined) {
    return { status: "not_found" };
  }

  return { status: "ok", redemptions: data as number };
}

export type EndReferralResult =
  | { status: "ok" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/** Deactivates the referral program, freeing up the single active slot. */
export async function endReferral(referralId: string): Promise<EndReferralResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { error } = await supabase.from("referrals").update({ active: false }).eq("id", referralId);

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "ok" };
}
