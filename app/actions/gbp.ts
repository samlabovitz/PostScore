"use server";

import { requestCache } from "@/lib/requestCache";
import { createClient } from "@/lib/supabase/server";

export interface GbpConnectionStatus {
  connected: boolean;
  connectedAt: string | null;
  /** The matched Google location (null until matched, or before
   * supabase/gbp-location.sql has been run). */
  locationTitle: string | null;
  locationAddress: string | null;
  /** Google stopped accepting the stored token: show "Reconnect Google". */
  needsReconnect: boolean;
}

export type GetGbpConnectionStatusResult =
  | ({ status: "ok" } & GbpConnectionStatus)
  | { status: "unauthenticated" }
  | { status: "not_found" };

const NOT_CONNECTED: GbpConnectionStatus = { connected: false, connectedAt: null, locationTitle: null, locationAddress: null, needsReconnect: false };

/**
 * The one honest question every gated feature in the app asks before
 * showing real Google Business Profile data: has this business actually
 * connected? Never assumes yes — a missing row (or an error reading it)
 * is always treated as "not connected," never silently as connected.
 */
async function getGbpConnectionStatusUncached(businessId: string): Promise<GetGbpConnectionStatusResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  // "*" so a column that isn't there yet can't make this fail.
  const { data, error } = await supabase.from("gbp_connections").select("*").eq("business_id", businessId).maybeSingle();

  if (error || !data) {
    return { status: "ok", ...NOT_CONNECTED };
  }

  const row = data as Record<string, unknown>;
  if (row.status !== "connected") {
    return { status: "ok", ...NOT_CONNECTED, needsReconnect: row.status === "error" };
  }
  return {
    status: "ok",
    connected: true,
    connectedAt: (row.connected_at as string | null) ?? null,
    locationTitle: (row.location_title as string | null) ?? null,
    locationAddress: (row.location_address as string | null) ?? null,
    needsReconnect: false,
  };
}

export type DisconnectGbpResult =
  | { status: "ok"; revoked: boolean }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * A real, owner-initiated disconnect: revokes PostScore's access at
 * Google, then deletes the stored tokens and every GBP-derived value
 * (lib/gbpTokens.server.ts). Tokens are readable only by the service
 * role, so the owner check happens here first. `revoked: false` means
 * Google didn't confirm the revoke — the data is still deleted, and the
 * UI points the owner to their Google account permissions.
 */
export async function disconnectGbp(businessId: string): Promise<DisconnectGbpResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!business) {
    return { status: "error", message: "not_found" };
  }

  // Loaded here, not at the top: client components import this file's
  // actions, and these two modules are server-only.
  const [{ createAdminClient }, { disconnectGbpData }] = await Promise.all([
    import("@/lib/supabase/admin"),
    import("@/lib/gbpTokens.server"),
  ]);
  const result = await disconnectGbpData(createAdminClient(), businessId);
  if (!result.ok) {
    return { status: "error", message: "delete_failed" };
  }

  return { status: "ok", revoked: result.revoke !== "failed" };
}

/** Request-scoped (lib/requestCache.ts): one query per page render. */
const getGbpConnectionStatusCached = requestCache(getGbpConnectionStatusUncached);
export async function getGbpConnectionStatus(...args: Parameters<typeof getGbpConnectionStatusUncached>): Promise<Awaited<ReturnType<typeof getGbpConnectionStatusUncached>>> {
  return getGbpConnectionStatusCached(...args);
}
