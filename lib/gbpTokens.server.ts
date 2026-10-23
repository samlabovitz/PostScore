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
import { revokeGbpToken, type GbpRevokeResult, type GbpTokenResult } from "@/lib/googleBusinessProfile";

export async function saveGbpConnection(
  admin: SupabaseClient,
  params: { businessId: string; userId: string; tokens: GbpTokenResult }
): Promise<{ ok: true } | { ok: false }> {
  const { businessId, userId, tokens } = params;
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

  const { error: statusError } = await admin.from("gbp_connections").upsert(
    {
      business_id: businessId,
      status: "connected",
      scope: tokens.scope,
      connected_at: now,
      updated_at: now,
    },
    { onConflict: "business_id" }
  );
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
