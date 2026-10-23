// Starts the real Google OAuth consent flow for a business's Google
// Business Profile. A plain redirect, not a server action, since its
// whole job is to issue an HTTP redirect to accounts.google.com.
//
// Every plan can connect (canConnectGbp — GBP_CONNECT_PUBLIC is the one
// switch). Only the business's owner can start it. The state sent to
// Google is signed and names this user and this business; its nonce and
// the PKCE verifier stay in an httpOnly cookie, so the callback only
// completes in this browser, for this user (lib/gbpSecurity.ts).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildGbpAuthUrl, gbpRedirectUri, isGbpOAuthConfigured } from "@/lib/googleBusinessProfile";
import { GBP_OAUTH_COOKIE, GBP_STATE_MAX_AGE_SECONDS, startGbpConnect } from "@/lib/gbpSecurity";
import { gbpLandingPath } from "@/lib/gbpLanding";
import { canConnectGbp, getPlan } from "@/lib/premium";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // The owner only — RLS scopes the read, and owner_id makes it explicit.
  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!business) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const plan = await getPlan();

  // Switched off → back where they came from, never Google's consent screen.
  if (!canConnectGbp()) {
    return NextResponse.redirect(new URL(gbpLandingPath(businessId, plan, "setup"), req.url));
  }

  const redirectUri = gbpRedirectUri();
  if (!isGbpOAuthConfigured() || !redirectUri) {
    return NextResponse.redirect(new URL(gbpLandingPath(businessId, plan, "setup"), req.url));
  }

  const attempt = startGbpConnect(user.id, businessId);
  const res = NextResponse.redirect(
    buildGbpAuthUrl({ redirectUri, state: attempt.state, codeChallenge: attempt.codeChallenge })
  );
  res.cookies.set(GBP_OAUTH_COOKIE, attempt.cookieValue, {
    httpOnly: true,
    secure: redirectUri.startsWith("https://"),
    sameSite: "lax",
    path: "/api/gbp",
    maxAge: GBP_STATE_MAX_AGE_SECONDS,
  });
  return res;
}
