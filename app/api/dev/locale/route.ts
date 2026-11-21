// Local development only: show pages (and drafts) in a language without
// changing any business's saved language — scripts/devShot.ts --lang=es.
// /api/dev/locale?lang=es&back=/business/…  (lang=clear removes it).
// Production: 404.

import { NextResponse, type NextRequest } from "next/server";
import { DEV_LOCALE_COOKIE } from "@/lib/viewLocale.server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });
  const lang = request.nextUrl.searchParams.get("lang");
  const back = request.nextUrl.searchParams.get("back");
  const target = back && back.startsWith("/") && !back.startsWith("//") ? back : "/";
  const response = NextResponse.redirect(new URL(target, request.url));
  if (lang === "en" || lang === "es") response.cookies.set(DEV_LOCALE_COOKIE, lang, { path: "/", sameSite: "lax", httpOnly: true });
  else response.cookies.delete(DEV_LOCALE_COOKIE);
  return response;
}
