// Where Google redirects back to after the owner approves (or declines)
// access on Google's own consent screen. Exchanges the real code for
// real tokens and stores them encrypted — never marks a business
// "connected" without an actual successful token exchange.
//
// Rejected before anything is exchanged or stored: a state whose
// signature is wrong or that's expired, a state started by another
// PostScore user, a nonce that doesn't match this browser's cookie, or a
// business the signed-in user doesn't own (lib/gbpSecurity.ts).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeGbpAuthCode, gbpRedirectUri, isGbpOAuthConfigured } from "@/lib/googleBusinessProfile";
import { GBP_OAUTH_COOKIE, checkGbpCallback } from "@/lib/gbpSecurity";
import { gbpLandingPath, type GbpConnectResult } from "@/lib/gbpLanding";
import { saveGbpConnection } from "@/lib/gbpTokens.server";
import { canConnectGbp, getPlan } from "@/lib/premium";

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

  const check = checkGbpCallback({
    state: params.get("state"),
    cookieValue: req.cookies.get(GBP_OAUTH_COOKIE)?.value ?? null,
    userId: user.id,
  });
  if (!check.ok) {
    return done("/");
  }

  const businessId = check.businessId;
  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!business) {
    return done("/");
  }

  const plan = await getPlan();
  const land = (result: GbpConnectResult) => done(gbpLandingPath(businessId, plan, result));

  const googleError = params.get("error");
  if (googleError) {
    // "Cancel" on Google's consent screen, or Google refused the request.
    return land(googleError === "access_denied" ? "denied" : "failed");
  }

  const code = params.get("code");
  if (!code) {
    return land("failed");
  }

  const redirectUri = gbpRedirectUri();
  if (!canConnectGbp() || !isGbpOAuthConfigured() || !redirectUri) {
    return land("setup");
  }

  try {
    const tokens = await exchangeGbpAuthCode({ code, redirectUri, codeVerifier: check.codeVerifier });
    const saved = await saveGbpConnection(createAdminClient(), { businessId, userId: user.id, tokens });
    return land(saved.ok ? "connected" : "failed");
  } catch {
    return land("failed");
  }
}
