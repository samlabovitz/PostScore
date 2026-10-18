// Local development only: switch this browser's plan for testing
// (Free / Grow / Premium / Multi) — /api/dev/plan?plan=grow&back=/business/…
// A production build answers 404 and lib/premium.ts ignores the cookie.

import { NextResponse, type NextRequest } from "next/server";
import { DEV_PLAN_COOKIE } from "@/lib/premium";
import { PLANS, type Plan } from "@/lib/plan";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });
  const plan = request.nextUrl.searchParams.get("plan");
  const back = request.nextUrl.searchParams.get("back");
  // Only same-site paths, never an outside address.
  const target = back && back.startsWith("/") && !back.startsWith("//") ? back : "/";
  const response = NextResponse.redirect(new URL(target, request.url));
  if (plan && (PLANS as string[]).includes(plan)) {
    response.cookies.set(DEV_PLAN_COOKIE, plan as Plan, { path: "/", sameSite: "lax", httpOnly: true });
  }
  return response;
}
