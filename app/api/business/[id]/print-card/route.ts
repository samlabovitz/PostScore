// POST: coupon / referral card output. The plan, the owner's own offer
// and expiration, and the colors are re-checked here on every download,
// print and PNG — editing the page can't unlock Premium output.
// Body: { kind, design, logo: { aspect } | null, format: "pdf" | "design" }
// ("design" returns the approved design for the single-card PNG).

import { NextResponse, type NextRequest } from "next/server";
import { getPrintStudioData } from "@/app/actions/printStudio";
import { getPlan } from "@/lib/premium";
import { buildCardPdf, resolveCard } from "@/lib/printStudio/build.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = (await request.json().catch(() => null)) as { kind?: unknown; design?: unknown; logo?: unknown; format?: unknown } | null;
  const data = await getPrintStudioData(params.id);
  if (data.status === "unauthenticated") return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (data.status === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const kind = body?.kind === "referral" ? "referral" : "coupon";
  const locale = data.locale === "es" ? "es" : "en";
  const common = { plan: await getPlan(), kind, requested: body?.design, business: data.business, locale } as const;

  if (body?.format === "design") {
    const resolved = await resolveCard(common);
    if (resolved.status === "plan_required") return NextResponse.json({ error: "plan_required" }, { status: 403 });
    if (resolved.status !== "ok") return NextResponse.json({ error: resolved.status, fields: "fields" in resolved ? resolved.fields : undefined }, { status: 422 });
    return NextResponse.json({ design: resolved.design, credit: resolved.credit }, { headers: { "Cache-Control": "no-store" } });
  }

  const result = await buildCardPdf({ ...common, logo: body?.logo });
  if (result.status === "plan_required") return NextResponse.json({ error: "plan_required" }, { status: 403 });
  if (result.status === "missing") return NextResponse.json({ error: "missing", fields: result.fields }, { status: 422 });
  if (result.status === "low_contrast") return NextResponse.json({ error: "low_contrast" }, { status: 422 });

  return new NextResponse(result.bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${kind}-cards.pdf"`,
      "Cache-Control": "no-store",
      "X-Sign-Logo-Slots": JSON.stringify(result.logoSlots),
      "X-Sign-Access": result.credit ? "basic" : "studio",
    },
  });
}
