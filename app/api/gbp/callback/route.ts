// Where Google redirects back to after the owner approves (or declines)
// access on Google's own consent screen. Exchanges the real code for
// real tokens and stores them — never marks a business "connected"
// without an actual successful token exchange.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeGbpAuthCode } from "@/lib/googleBusinessProfile";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  // The business id, carried through the redirect round trip — see the
  // RLS note on gbp_connections in supabase/schema.sql for why this
  // doesn't need to be signed: the upsert below can only ever succeed
  // for a business the logged-in user actually owns.
  const state = req.nextUrl.searchParams.get("state");
  const googleError = req.nextUrl.searchParams.get("error");

  if (!state) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  function connectPageUrl(params: Record<string, string>) {
    const url = new URL(`/business/${state}/connect-gbp`, req.url);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url;
  }

  if (googleError) {
    // The owner clicked "Cancel" on Google's own consent screen, or
    // Google itself rejected the request — either way, graceful and
    // honest, never treated as a connection.
    return NextResponse.redirect(
      connectPageUrl({
        error:
          googleError === "access_denied"
            ? "You didn't approve access, so nothing was connected."
            : `Google returned an error: ${googleError}`,
      })
    );
  }

  if (!code) {
    return NextResponse.redirect(
      connectPageUrl({ error: "Google didn't return an authorization code." })
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const redirectUri = new URL("/api/gbp/callback", req.url).toString();
    const tokens = await exchangeGbpAuthCode({ code, redirectUri });

    // Google only re-sends a refresh_token when it feels like it should
    // (in practice: reliably, since we pass prompt=consent, but never
    // trust that blindly) — never overwrite a working refresh_token with
    // null just because this particular exchange didn't return a new one.
    const { data: existing } = await supabase
      .from("gbp_connections")
      .select("refresh_token")
      .eq("business_id", state)
      .maybeSingle();

    const { error } = await supabase.from("gbp_connections").upsert(
      {
        business_id: state,
        status: "connected",
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken ?? existing?.refresh_token ?? null,
        token_expires_at: tokens.expiresAt,
        scope: tokens.scope,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "business_id" }
    );

    if (error) {
      return NextResponse.redirect(connectPageUrl({ error: error.message }));
    }

    return NextResponse.redirect(connectPageUrl({ connected: "1" }));
  } catch (err) {
    return NextResponse.redirect(
      connectPageUrl({
        error: err instanceof Error ? err.message : "Could not complete the Google connection.",
      })
    );
  }
}
