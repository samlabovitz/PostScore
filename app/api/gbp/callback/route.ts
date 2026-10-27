// Where Google redirects back to after the owner approves (or declines)
// access on Google's own consent screen. Exchanges the real code for
// real tokens and stores them encrypted — never marks a business
// "connected" without an actual successful token exchange.
//
// After the exchange, the business's Google location is found by its Maps
// place ID (lib/gbpLocations.ts). No match → nothing is kept: the grant is
// revoked and any stored tokens for the business are deleted.
//
// Rejected before anything is exchanged or stored: a state whose
// signature is wrong or that's expired, a state started by another
// PostScore user, a nonce that doesn't match this browser's cookie, or a
// business the signed-in user doesn't own (lib/gbpSecurity.ts).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeGbpAuthCode, gbpRedirectUri, isGbpOAuthConfigured, revokeGbpToken } from "@/lib/googleBusinessProfile";
import { findGbpLocation } from "@/lib/gbpLocations";
import { GBP_OAUTH_COOKIE, checkGbpCallback, readSignedGbpState } from "@/lib/gbpSecurity";
import { gbpLandingPath, resolveGbpOrigin, type GbpConnectResult } from "@/lib/gbpLanding";
import { disconnectGbpData, saveGbpConnection } from "@/lib/gbpTokens.server";
import { runGbpReplyCheck } from "@/lib/gbpReplyCounts.server";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { canConnectGbp, getPlan } from "@/lib/premium";

/** One line in the server log for each failed step — never tokens, codes or
 * the state; only the step and Google's own status/reason. */
function logFailure(step: string, details: Record<string, unknown> = {}) {
  console.warn(`[gbp-connect] ${step} failed`, JSON.stringify(details));
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  // Every way out clears the one-time cookie.
  function done(path: string) {
    const res = NextResponse.redirect(new URL(path, req.url));
    res.cookies.set(GBP_OAUTH_COOKIE, "", { path: "/api/gbp", maxAge: 0 });
    return res;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return done("/login");
  }

  async function ownsBusiness(businessId: string) {
    const { data } = await supabase
      .from("businesses")
      .select("id, place_id")
      .eq("id", businessId)
      .eq("owner_id", user!.id)
      .maybeSingle();
    return data as { id: string; place_id: string | null } | null;
  }

  const state = params.get("state");
  const check = checkGbpCallback({
    state,
    cookieValue: req.cookies.get(GBP_OAUTH_COOKIE)?.value ?? null,
    userId: user.id,
  });
  if (!check.ok) {
    logFailure("state", { reason: check.reason });
    // Our own signature, this user's own attempt (expired, or the cookie
    // was lost — another browser, cleared cookies): send them back where
    // they started to try again. Anything else (forged, someone else's) → home.
    const signed = state ? readSignedGbpState(state) : null;
    if (signed && signed.u === user.id && (check.reason === "bad_state" || check.reason === "missing" || check.reason === "nonce_mismatch") && (await ownsBusiness(signed.b))) {
      return done(gbpLandingPath(signed.b, resolveGbpOrigin(await getPlan(), signed.o), "state"));
    }
    return done("/");
  }

  const businessId = check.businessId;
  const business = await ownsBusiness(businessId);
  if (!business) {
    return done("/");
  }

  const plan = await getPlan();
  const origin = resolveGbpOrigin(plan, check.origin);
  const land = (result: GbpConnectResult) => done(gbpLandingPath(businessId, origin, result));

  const googleError = params.get("error");
  if (googleError) {
    // "Cancel" on Google's consent screen, or Google refused the request.
    if (googleError === "access_denied") return land("denied");
    logFailure("consent", { error: googleError.slice(0, 60) });
    return land("exchange_failed");
  }

  const code = params.get("code");
  if (!code) {
    logFailure("consent", { error: "no_code" });
    return land("exchange_failed");
  }

  const redirectUri = gbpRedirectUri();
  if (!canConnectGbp() || !isGbpOAuthConfigured() || !redirectUri) {
    logFailure("setup");
    return land("setup");
  }

  let tokens;
  try {
    tokens = await exchangeGbpAuthCode({ code, redirectUri, codeVerifier: check.codeVerifier });
  } catch (err) {
    // Google's own short description (e.g. "Missing code verifier."), no secrets.
    logFailure("token exchange", { error: err instanceof Error ? err.message.slice(0, 120) : "unknown", redirectUri });
    return land("exchange_failed");
  }

  // Which Google location is this business? Match its Maps place ID —
  // never "pick another location". No match: nothing is stored, and the
  // grant is revoked at Google.
  const listingCalls = { calls: 0 };
  const found = await findGbpLocation(tokens.accessToken, business.place_id ?? null, gbpFetch(listingCalls));
  logGbpCalls("connect location listing", listingCalls);
  if (found.kind !== "match") {
    await revokeGbpToken(tokens.refreshToken ?? tokens.accessToken);
    // And any earlier connection for this business goes too (revoked, deleted).
    await disconnectGbpData(createAdminClient(), businessId);
    if (found.kind === "error") {
      logFailure("location listing", { step: found.step, status: found.status, reason: found.reason });
      return land("google_api");
    }
    logFailure("location match", { unverified: found.unverified, businessHasPlaceId: !!business.place_id });
    return land(found.unverified ? "no_match_unverified" : "no_match");
  }

  try {
    const saved = await saveGbpConnection(createAdminClient(), { businessId, userId: user.id, tokens, location: found.match });
    if (!saved.ok) {
      logFailure("save");
      return land("failed");
    }
    // The reply counts, once, so the owner sees them as they land. Never
    // fails the connect (an error keeps "connected"; a rejected token
    // shows "Reconnect Google").
    await runGbpReplyCheck(businessId);
    return land("connected");
  } catch (err) {
    logFailure("save", { error: err instanceof Error ? err.message.slice(0, 120) : "unknown" });
    return land("failed");
  }
}
