import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { devTestLoginRefusal, safeNextPath } from "@/lib/devTestLogin";

// Dev only: signs the browser in as the test account in .env.local
// (DEV_TEST_LOGIN_EMAIL / DEV_TEST_LOGIN_PASSWORD) so Playwright can open
// signed-in pages on localhost. The password never leaves the server and is
// never typed into a page. Refused unless `next dev` is serving localhost.
//
//   http://localhost:3000/dev/test-login?next=/business/<id>/website
export async function GET(request: NextRequest) {
  const refusal = devTestLoginRefusal(process.env, request.headers.get("host"), request.headers.get("x-forwarded-for"));
  if (refusal) return new NextResponse("Not found", { status: 404, headers: { "x-dev-test-login": refusal } });

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.DEV_TEST_LOGIN_EMAIL!,
    password: process.env.DEV_TEST_LOGIN_PASSWORD!,
  });
  if (error) return new NextResponse(`Test login failed: ${error.message}`, { status: 401 });

  return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get("next")), request.nextUrl.origin));
}
