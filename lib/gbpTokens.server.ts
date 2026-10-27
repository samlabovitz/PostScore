// Server-only. Stores and removes Google Business Profile tokens.
//
// Tokens live in public.gbp_tokens (supabase/gbp-tokens.sql): no RLS
// policy and no grants for anon/authenticated, so only the service role
// (lib/supabase/admin.ts) can read or write them — never a browser
// session. Each token is encrypted with AES-256-GCM (lib/gbpSecurity.ts)
// before it's written. gbp_connections keeps only the status the app
// shows (connected, since when, granted scope) and is also written only
// here.
//
// Every caller must already have proven the signed-in user owns the
// business (the connect callback and disconnectGbp both do).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptGbpToken, encryptGbpToken } from "@/lib/gbpSecurity";
import { refreshGbpAccessToken, revokeGbpToken, type GbpRevokeResult, type GbpTokenResult } from "@/lib/googleBusinessProfile";
import type { GbpLocationMatch } from "@/lib/gbpLocations";

const MISSING_COLUMN = new Set(["PGRST204", "42703"]);

export async function saveGbpConnection(
  admin: SupabaseClient,
  params: { businessId: string; userId: string; tokens: GbpTokenResult; location: GbpLocationMatch }
): Promise<{ ok: true } | { ok: false }> {
  const { businessId, userId, tokens, location } = params;
  const now = new Date().toISOString();

  // Google doesn't always re-send a refresh token — keep the stored one
  // rather than overwrite it with nothing.
  const { data: existing } = await admin
    .from("gbp_tokens")
    .select("refresh_token_enc")
    .eq("business_id", businessId)
    .maybeSingle();

  const { error: tokenError } = await admin.from("gbp_tokens").upsert(
    {
      business_id: businessId,
      connected_by: userId,
      access_token_enc: encryptGbpToken(tokens.accessToken, businessId),
      refresh_token_enc: tokens.refreshToken
        ? encryptGbpToken(tokens.refreshToken, businessId)
        : (existing?.refresh_token_enc ?? null),
      token_expires_at: tokens.expiresAt,
      updated_at: now,
    },
    { onConflict: "business_id" }
  );
  if (tokenError) return { ok: false };

  const row = {
    business_id: businessId,
    status: "connected",
    scope: tokens.scope,
    // Matched once here and cached — later steps never re-list.
    google_account_id: location.accountName,
    google_location_id: location.locationName,
    connected_at: now,
    updated_at: now,
  };
  let { error: statusError } = await admin
    .from("gbp_connections")
    .upsert({ ...row, location_title: location.title, location_address: location.address }, { onConflict: "business_id" });
  // Before supabase/gbp-location.sql has been run the title/address columns
  // don't exist (PostgREST PGRST204 / Postgres 42703). Connect anyway — the
  // IDs are what matter; the "Connected: {title}" line appears once it's run.
  if (statusError && MISSING_COLUMN.has(statusError.code ?? "")) {
    ({ error: statusError } = await admin.from("gbp_connections").upsert(row, { onConflict: "business_id" }));
  }
  if (statusError) {
    // Never leave tokens behind without a visible connection.
    await admin.from("gbp_tokens").delete().eq("business_id", businessId);
    return { ok: false };
  }
  return { ok: true };
}

export type DisconnectGbpDataResult =
  | { ok: true; revoke: GbpRevokeResult | "no_token" }
  | { ok: false };

/**
 * Disconnect: revoke the grant at Google first, then delete the stored
 * tokens and the connection row (which holds every GBP-derived value we
 * keep). The delete happens even when Google's revoke fails — the owner
 * asked us to let go — and the result says so, so the UI can point them
 * to their Google account permissions.
 */
export async function disconnectGbpData(
  admin: SupabaseClient,
  businessId: string,
  fetchImpl: typeof fetch = fetch
): Promise<DisconnectGbpDataResult> {
  const { data: row } = await admin
    .from("gbp_tokens")
    .select("access_token_enc, refresh_token_enc")
    .eq("business_id", businessId)
    .maybeSingle();

  let revoke: GbpRevokeResult | "no_token" = "no_token";
  const sealed = row?.refresh_token_enc ?? row?.access_token_enc ?? null;
  if (sealed) {
    try {
      revoke = await revokeGbpToken(decryptGbpToken(sealed, businessId), fetchImpl);
    } catch {
      revoke = "failed";
    }
  }

  const { error: tokenError } = await admin.from("gbp_tokens").delete().eq("business_id", businessId);
  const { error: statusError } = await admin.from("gbp_connections").delete().eq("business_id", businessId);
  if (tokenError || statusError) return { ok: false };
  return { ok: true, revoke };
}

/** Refresh this long before expiry. */
export const REFRESH_MARGIN_MS = 2 * 60 * 1000;

export type ValidAccessTokenResult =
  | { status: "ok"; accessToken: string }
  /** `reconnect`: Google rejected the refresh token (invalid_grant) — the
   * connection is marked "error" and the owner sees "Reconnect Google". */
  | { status: "error"; reason: "not_connected" | "reconnect" | "failed" };

/**
 * A usable access token for this business: the stored one while it has
 * more than 2 minutes left, otherwise a refreshed one (saved encrypted).
 * Server only; the caller must already have checked ownership or be a
 * trusted server job.
 */
export async function getValidAccessTokenWithClient(
  admin: SupabaseClient,
  businessId: string,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now()
): Promise<ValidAccessTokenResult> {
  const { data: row } = await admin
    .from("gbp_tokens")
    .select("access_token_enc, refresh_token_enc, token_expires_at")
    .eq("business_id", businessId)
    .maybeSingle();
  if (!row?.access_token_enc) return { status: "error", reason: "not_connected" };

  try {
    const expiresAt = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
    if (expiresAt - now > REFRESH_MARGIN_MS) {
      return { status: "ok", accessToken: decryptGbpToken(row.access_token_enc, businessId) };
    }
    if (!row.refresh_token_enc) return markGbpReconnect(admin, businessId);

    const refreshed = await refreshGbpAccessToken(decryptGbpToken(row.refresh_token_enc, businessId), fetchImpl);
    if (refreshed.status === "invalid_grant") return markGbpReconnect(admin, businessId);
    if (refreshed.status !== "ok") return { status: "error", reason: "failed" };

    await admin
      .from("gbp_tokens")
      .update({
        access_token_enc: encryptGbpToken(refreshed.accessToken, businessId),
        token_expires_at: refreshed.expiresAt,
        updated_at: new Date(now).toISOString(),
      })
      .eq("business_id", businessId);
    return { status: "ok", accessToken: refreshed.accessToken };
  } catch {
    return { status: "error", reason: "failed" };
  }
}

/** The dead tokens are deleted; the status row says "error" so the owner
 * is asked to reconnect. The last reply counts stay, with their date. */
export async function markGbpReconnect(admin: SupabaseClient, businessId: string): Promise<ValidAccessTokenResult> {
  await admin.from("gbp_tokens").delete().eq("business_id", businessId);
  await admin
    .from("gbp_connections")
    .update({ status: "error", updated_at: new Date().toISOString() })
    .eq("business_id", businessId);
  return { status: "error", reason: "reconnect" };
}

export async function getValidAccessToken(businessId: string): Promise<ValidAccessTokenResult> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  return getValidAccessTokenWithClient(createAdminClient(), businessId);
}
