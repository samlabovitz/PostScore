"use server";

import { createClient } from "@/lib/supabase/server";

export interface GbpConnectionStatus {
  connected: boolean;
  connectedAt: string | null;
}

export type GetGbpConnectionStatusResult =
  | ({ status: "ok" } & GbpConnectionStatus)
  | { status: "unauthenticated" }
  | { status: "not_found" };

/**
 * The one honest question every gated feature in the app asks before
 * showing real Google Business Profile data: has this business actually
 * connected? Never assumes yes — a missing row (or an error reading it)
 * is always treated as "not connected," never silently as connected.
 */
export async function getGbpConnectionStatus(businessId: string): Promise<GetGbpConnectionStatusResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("gbp_connections")
    .select("connected_at, status")
    .eq("business_id", businessId)
    .eq("status", "connected")
    .maybeSingle();

  if (error) {
    return { status: "ok", connected: false, connectedAt: null };
  }

  return { status: "ok", connected: !!data, connectedAt: data?.connected_at ?? null };
}

export type DisconnectGbpResult =
  | { status: "ok" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * A real, owner-initiated disconnect — deletes the stored tokens rather
 * than just flipping a flag, so there's nothing left to leak or misuse.
 * RLS (the same owner-scoped delete policy every other table here uses)
 * is what actually guarantees this can only ever touch the caller's own
 * business.
 */
export async function disconnectGbp(businessId: string): Promise<DisconnectGbpResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { error } = await supabase.from("gbp_connections").delete().eq("business_id", businessId);

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "ok" };
}
