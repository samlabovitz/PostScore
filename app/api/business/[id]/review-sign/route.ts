// POST: the review sign PDF. The plan is re-checked here on every
// download and print, so editing the page can't unlock Premium output.
// Body: { design, logo: { aspect } | null } — never the logo image.

import { NextResponse, type NextRequest } from "next/server";
import { getReviewsPageData } from "@/app/actions/reviews";
import { getPlan } from "@/lib/premium";
import { normalizeLocale } from "@/lib/i18n";
import { buildSignPdf } from "@/lib/signStudio/build.server";
import { signFileName } from "@/lib/signStudio/design";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = (await request.json().catch(() => null)) as { design?: unknown; logo?: unknown } | null;
  const page = await getReviewsPageData(params.id);
  if (page.status === "unauthenticated") return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (page.status === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (page.status === "error") return NextResponse.json({ error: "error" }, { status: 500 });

  const { data } = page;
  const result = await buildSignPdf({
    plan: await getPlan(),
    requested: body?.design,
    logo: body?.logo,
    placeId: data.placeId,
    content: { businessName: data.businessName, verifiedSocials: data.verifiedSocials },
    locale: normalizeLocale(data.language),
  });
  if (result.status === "plan_required") return NextResponse.json({ error: "plan_required" }, { status: 403 });
  if (result.status === "low_contrast") return NextResponse.json({ error: "low_contrast" }, { status: 422 });
  if (result.status === "no_place_id") return NextResponse.json({ error: "no_place_id" }, { status: 409 });

  return new NextResponse(result.bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${signFileName(result.design.size)}"`,
      "Cache-Control": "no-store",
      // Where the browser draws the owner's logo (it never comes here).
      "X-Sign-Logo-Slots": JSON.stringify(result.logoSlots),
      // What the plan allowed: "basic" (Grow) or "studio" (Premium/Multi).
      "X-Sign-Access": result.credit ? "basic" : "studio",
    },
  });
}
