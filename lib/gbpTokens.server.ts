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
//
// A connection is never lost silently or by accident: only Google
// refusing the refresh token ends it (a single rejected API call first
// tries a refresh — the access token may just be stale), and then the
// owner gets an in-app notification and the Overview's amber banner, and
// the score keeps the last Google data with its date. Only the owner's
// own Disconnect deletes everything.
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
  // Google sends an expiry for the refresh token only when it will expire:
  // the OAuth consent screen is in Testing (7 days), so this connection
  // will drop. Kept (supabase/gbp-connection-health.sql) and said in the log.
  if (tokens.refreshTokenExpiresAt) {
    console.warn("[gbp-connect] Google says this refresh token expires", JSON.stringify({ at: tokens.refreshTokenExpiresAt, hint: "OAuth consent screen in Testing? Publish the app to production." }));
    await admin.from("gbp_tokens").update({ refresh_token_expires_at: tokens.refreshTokenExpiresAt }).eq("business_id", businessId);
  }

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
    .upsert({ ...row, location_title: location.title, location_address: location.address, disconnected_at: null, disconnect_reason: null }, { onConflict: "business_id" });
  // Before supabase/gbp-connection-health.sql the disconnect columns don't
  // exist, and before supabase/gbp-location.sql the title/address ones
  // (PostgREST PGRST204 / Postgres 42703). Connect anyway — the IDs are
  // what matter.
  if (statusError && MISSING_COLUMN.has(statusError.code ?? "")) {
    ({ error: statusError } = await admin.from("gbp_connections").upsert({ ...row, location_title: location.title, location_address: location.address }, { onConflict: "business_id" }));
  }
  if (statusError && MISSING_COLUMN.has(statusError.code ?? "")) {
    ({ error: statusError } = await admin.from("gbp_connections").upsert(row, { onConflict: "business_id" }));
  }
  if (statusError) {
    // Never leave tokens behind without a visible connection.
    await admin.from("gbp_tokens").delete().eq("business_id", businessId);
    return { ok: false };
  }
  // "Google disconnected" is fixed: it comes back unread as resolved.
  await resolveDisconnectNotification(admin, businessId, now);
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

  // Changes made on Google while connected can't be undone after a
  // disconnect — a reconnect may be a different listing.
  await closeOpenUndos(admin, businessId);
  const { error: tokenError } = await admin.from("gbp_tokens").delete().eq("business_id", businessId);
  const { error: statusError } = await admin.from("gbp_connections").delete().eq("business_id", businessId);
  // …and the copy scoring uses (supabase/scoring-v1-12.sql).
  await clearGbpScoringCounts(admin, businessId);
  // The owner let go on purpose: no "reconnect" reminder left open.
  try {
    await admin.from("notifications").delete().eq("business_id", businessId).eq("type", "google").eq("key", "disconnected").is("resolved_at", null);
  } catch {
    // Before supabase/notifications.sql: nothing to remove.
  }
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
    if (!row.refresh_token_enc) return loseGbpConnection(admin, businessId, "no_refresh_token");

    const refreshed = await refreshGbpAccessToken(decryptGbpToken(row.refresh_token_enc, businessId), fetchImpl);
    if (refreshed.status === "invalid_grant") return loseGbpConnection(admin, businessId, "refresh_rejected");
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

/**
 * Google rejected an API call (401). That alone doesn't mean access is
 * gone — the access token may just be stale — so the stored refresh token
 * is tried once: if Google takes it, the connection stays (and the caller's
 * one call simply failed); only if Google refuses it is the connection
 * marked lost. A network error changes nothing.
 */
export async function markGbpReconnect(admin: SupabaseClient, businessId: string, fetchImpl: typeof fetch = fetch): Promise<ValidAccessTokenResult> {
  try {
    const { data: row } = await admin.from("gbp_tokens").select("refresh_token_enc").eq("business_id", businessId).maybeSingle();
    // No tokens at all: not connected (or already lost) — nothing to drop.
    if (!row) return { status: "error", reason: "reconnect" };
    if (!row.refresh_token_enc) return loseGbpConnection(admin, businessId, "no_refresh_token");
    const refreshed = await refreshGbpAccessToken(decryptGbpToken(row.refresh_token_enc, businessId), fetchImpl);
    if (refreshed.status === "invalid_grant") return loseGbpConnection(admin, businessId, "refresh_rejected");
    if (refreshed.status === "ok") {
      await admin
        .from("gbp_tokens")
        .update({ access_token_enc: encryptGbpToken(refreshed.accessToken, businessId), token_expires_at: refreshed.expiresAt, updated_at: new Date().toISOString() })
        .eq("business_id", businessId);
      console.warn("[gbp-connection] a call was rejected but the refresh worked — still connected");
    }
    return { status: "error", reason: "failed" };
  } catch {
    return { status: "error", reason: "failed" };
  }
}

export type GbpLossReason = "refresh_rejected" | "no_refresh_token";

/**
 * Google refused PostScore's access for good (refresh token revoked or
 * expired): the dead tokens are deleted and the status row says "error"
 * with when and why, so the owner is asked to reconnect — in-app
 * notification and the Overview's banner. The score keeps the last
 * Google data (the reply counts stay, with their date). Only a connected
 * business is touched.
 */
export async function loseGbpConnection(admin: SupabaseClient, businessId: string, reason: GbpLossReason, now: Date = new Date()): Promise<ValidAccessTokenResult> {
  const at = now.toISOString();
  await admin.from("gbp_tokens").delete().eq("business_id", businessId);
  let { data, error } = await admin
    .from("gbp_connections")
    .update({ status: "error", updated_at: at, disconnected_at: at, disconnect_reason: reason })
    .eq("business_id", businessId)
    .eq("status", "connected")
    .select("business_id");
  // Before supabase/gbp-connection-health.sql: no date or reason, same status.
  if (error && MISSING_COLUMN.has(error.code ?? "")) {
    ({ data, error } = await admin.from("gbp_connections").update({ status: "error", updated_at: at }).eq("business_id", businessId).eq("status", "connected").select("business_id"));
  }
  // Only a connection that was live just now is news.
  if (!error && (data?.length ?? 0) > 0) {
    console.warn("[gbp-connection] lost", JSON.stringify({ businessId, reason }));
    await openDisconnectNotification(admin, businessId, reason, at);
  }
  return { status: "error", reason: "reconnect" };
}

/** The in-app "Google disconnected" notification (lib/notifications.ts) — one open at a time. */
async function openDisconnectNotification(admin: SupabaseClient, businessId: string, reason: GbpLossReason, at: string): Promise<void> {
  try {
    // 23505: one is already open (notifications_one_open) — fine.
    await admin.from("notifications").insert({ business_id: businessId, type: "google", key: "disconnected", severity: "high", payload: { reason }, created_at: at });
  } catch {
    // Before supabase/notifications.sql: the banner still shows.
  }
}

async function resolveDisconnectNotification(admin: SupabaseClient, businessId: string, at: string): Promise<void> {
  try {
    await admin.from("notifications").update({ resolved_at: at, read_at: null }).eq("business_id", businessId).eq("type", "google").eq("key", "disconnected").is("resolved_at", null);
  } catch {
    // Nothing to resolve.
  }
}

/** Marks every open Google change (gbp_changes) as no longer undoable. */
export async function closeOpenUndos(admin: SupabaseClient, businessId: string, at: string = new Date().toISOString()): Promise<void> {
  try {
    await admin.from("gbp_changes").update({ undo_closed_at: at }).eq("business_id", businessId).is("undone_at", null).is("undo_closed_at", null);
  } catch {
    // supabase/gbp-changes-location.sql not run yet: rows can't be read for undo either.
  }
}

/** Clears the reply counts scoring v1.12.0 reads (businesses.gbp_*). */
async function clearGbpScoringCounts(admin: SupabaseClient, businessId: string): Promise<void> {
  try {
    await admin.from("businesses").update({ gbp_reviews_in_window: null, gbp_replied: null, gbp_has_recent_review: null }).eq("id", businessId);
    await admin.from("businesses").update({ gbp_recent_reviews: null }).eq("id", businessId);
  } catch {
    // Missing columns (SQL not run yet): nothing to clear.
  }
}

export async function getValidAccessToken(businessId: string): Promise<ValidAccessTokenResult> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  return getValidAccessTokenWithClient(createAdminClient(), businessId);
}
