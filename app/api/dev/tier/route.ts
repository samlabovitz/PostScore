// The dev-only preview tier (lib/devTier.ts): /api/dev/tier?tier=1..5[-set|-due|-quiet|-closed]|real&back=/business/…
// Only under `next dev` and only for the dev test login; anyone else 404.
// A cookie in this browser only — never saved, never counted.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEV_TIER_COOKIE, DEV_TIER_VALUE, devTierAllowed } from "@/lib/devTier";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { data } = await createClient().auth.getUser();
  if (!devTierAllowed(process.env, data.user?.email)) return new NextResponse(null, { status: 404 });
  const tier = request.nextUrl.searchParams.get("tier");
  const back = request.nextUrl.searchParams.get("back");
  const target = back && back.startsWith("/") && !back.startsWith("//") ? back : "/";
  const response = NextResponse.redirect(new URL(target, request.url));
  if (tier && DEV_TIER_VALUE.test(tier)) response.cookies.set(DEV_TIER_COOKIE, tier, { path: "/", sameSite: "lax", httpOnly: true });
  else response.cookies.delete(DEV_TIER_COOKIE);
  return response;
}
