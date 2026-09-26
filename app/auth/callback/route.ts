// Supabase sends users here from the confirmation link in the sign-up
// email, and (with ?next=/reset-password) from the password-reset
// email — both exchange the one-time code in the URL for a real
// session, then land on `next`.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** `next` comes straight from a query param on a public URL, so it must
 * never be trusted as a redirect target without validation — a
 * "/\evil.com"-style value here would otherwise turn this route into an
 * open redirect. Only a single-leading-slash relative path is safe:
 * rejects a protocol-relative "//evil.com" (a bare `/` prefix check
 * alone would let that through) and rejects any full URL outright
 * (those never start with "/" at all). */
function isSafeRedirectPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  const next = nextParam && isSafeRedirectPath(nextParam) ? nextParam : "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(
      "Could not confirm account. The link may have expired."
    )}`
  );
}
