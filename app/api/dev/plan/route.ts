// Switch this browser's plan for testing (Free / Grow / Premium / Multi):
// /api/dev/plan?plan=grow&back=/business/…
// Local development: always. Production: only for a signed-in user whose
// email is in PLAN_SWITCHER_EMAILS — checked here on the server; anyone
// else gets 404 (switching off) or 403 (not allowed), and lib/premium.ts
// re-checks the email on every request, so the cookie alone does nothing.

import { NextResponse, type NextRequest } from "next/server";
import { DEV_PLAN_COOKIE, canSwitchPlan, switcherEmails } from "@/lib/premium";
import { PLANS, type Plan } from "@/lib/plan";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const dev = process.env.NODE_ENV === "development";
  if (!dev && switcherEmails().length === 0) return new NextResponse(null, { status: 404 });
  if (!(await canSwitchPlan())) {
    const refused = NextResponse.json({ error: "not_allowed" }, { status: 403 });
    refused.cookies.delete(DEV_PLAN_COOKIE);
    return refused;
  }
  const plan = request.nextUrl.searchParams.get("plan");
  const back = request.nextUrl.searchParams.get("back");
  // Only same-site paths, never an outside address.
  const target = back && back.startsWith("/") && !back.startsWith("//") ? back : "/";
  const response = NextResponse.redirect(new URL(target, request.url));
  if (plan && (PLANS as string[]).includes(plan)) {
    response.cookies.set(DEV_PLAN_COOKIE, plan as Plan, { path: "/", sameSite: "lax", httpOnly: true, secure: !dev });
  }
  return response;
}
