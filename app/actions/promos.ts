"use server";

import { createClient } from "@/lib/supabase/server";
import { MAX_ACTIVE_PROMOS, type PromoRow } from "@/lib/promos";

const PROMO_COLUMNS =
  "id, business_id, type, offer, code, instructions, terms, expiry, redemptions, active, created_at";

export type ListActivePromosResult =
  | { status: "ok"; promos: PromoRow[] }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/** RLS-scoped list of a business's currently active promos, most
 * recently started first. */
export async function listActivePromos(businessId: string): Promise<ListActivePromosResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("promos")
    .select(PROMO_COLUMNS)
    .eq("business_id", businessId)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "ok", promos: (data ?? []) as PromoRow[] };
}

export interface StartPromoInput {
  type: string;
  offer: string;
  code: string;
  instructions: string;
  terms: string;
  expiry: string;
}

export type StartPromoResult =
  | { status: "ok"; promo: PromoRow }
  | { status: "unauthenticated" }
  | { status: "limit_reached" }
  | { status: "error"; message: string };

/**
 * Saves the coupon currently built in CouponBuilder as an active
 * promotion. Checks the 2-active-max here first so the owner gets a
 * clear "limit_reached" result instead of a raw database error — but
 * the real guarantee is the enforce_max_active_promos trigger in
 * supabase/schema.sql, which still applies underneath this (e.g.
 * against a race from a second tab), so a Postgres error from that
 * trigger is also mapped to "limit_reached" below rather than surfaced
 * as a generic failure.
 */
export async function startPromo(businessId: string, input: StartPromoInput): Promise<StartPromoResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { count, error: countError } = await supabase
    .from("promos")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("active", true);

  if (countError) {
    return { status: "error", message: countError.message };
  }
  if ((count ?? 0) >= MAX_ACTIVE_PROMOS) {
    return { status: "limit_reached" };
  }

  const { data, error } = await supabase
    .from("promos")
    .insert({
      business_id: businessId,
      type: input.type,
      offer: input.offer,
      code: input.code,
      instructions: input.instructions || null,
      terms: input.terms || null,
      expiry: input.expiry || null,
      redemptions: 0,
      active: true,
    })
    .select(PROMO_COLUMNS)
    .single();

  if (error || !data) {
    if (error?.message.includes("at most 2 active promotions")) {
      return { status: "limit_reached" };
    }
    return { status: "error", message: error?.message ?? "Could not start this promotion." };
  }

  return { status: "ok", promo: data as PromoRow };
}

export type IncrementRedemptionResult =
  | { status: "ok"; redemptions: number }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/** The honest "+1 Redeemed" tap — staff hits this at checkout. Uses an
 * atomic SQL increment (see increment_promo_redemption in
 * supabase/schema.sql) so concurrent taps from different devices can't
 * clobber each other, and stays RLS-scoped since that function runs as
 * the calling role, not security definer. */
export async function incrementPromoRedemption(promoId: string): Promise<IncrementRedemptionResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase.rpc("increment_promo_redemption", { p_promo_id: promoId });

  if (error) {
    return { status: "error", message: error.message };
  }
  if (data === null || data === undefined) {
    return { status: "not_found" };
  }

  return { status: "ok", redemptions: data as number };
}

export type EndPromoResult =
  | { status: "ok" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/** Deactivates a promo, freeing up a slot toward the 2-active max. */
export async function endPromo(promoId: string): Promise<EndPromoResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { error } = await supabase.from("promos").update({ active: false }).eq("id", promoId);

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "ok" };
}
