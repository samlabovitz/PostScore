// Starts the real Google OAuth consent flow for a business's Google
// Business Profile. A plain redirect, not a server action, since its
// whole job is to issue an HTTP redirect to accounts.google.com.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildGbpAuthUrl, isGbpOAuthConfigured } from "@/lib/googleBusinessProfile";

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

  // RLS-scoped — this only ever finds a row when the logged-in user owns
  // it, same as every other business lookup in the app.
  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .single();

  if (!business) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const connectPageUrl = new URL(`/business/${businessId}/connect-gbp`, req.url);

  if (!isGbpOAuthConfigured()) {
    connectPageUrl.searchParams.set(
      "error",
      "Google Business Profile connection isn't configured in this environment yet."
    );
    return NextResponse.redirect(connectPageUrl);
  }

  // Must exactly match a redirect URI registered on the Google Cloud
  // OAuth client for this to work — see the Phase 1 setup notes.
  const redirectUri = new URL("/api/gbp/callback", req.url).toString();
  const authUrl = buildGbpAuthUrl({ redirectUri, state: businessId });
  return NextResponse.redirect(authUrl);
}
