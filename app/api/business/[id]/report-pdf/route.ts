// GET: the one-page PostScore report PDF for the Reports page's
// "Download report (PDF)". Owner-only (RLS via getReportData); the
// language is the business's own (EN or ES).

import { NextResponse } from "next/server";
import { getReportData } from "@/lib/reports/reportData.server";
import { buildReportPdf, reportFileName } from "@/lib/reports/reportPdf.server";
import { getPlan } from "@/lib/premium";
import { isPremiumPlan } from "@/lib/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const result = await getReportData(params.id);
  if (result.status === "unauthenticated") return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (result.status === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (result.status === "error") return NextResponse.json({ error: "error" }, { status: 500 });
  // The PDF report is Premium (Settings → Compare plans: "Weekly + PDF").
  if (!isPremiumPlan(await getPlan())) return NextResponse.json({ error: "premium_only" }, { status: 403 });
  const bytes = await buildReportPdf(result.data);
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${reportFileName(result.data.business.name, result.data.generatedAt)}"`,
      "Cache-Control": "no-store",
    },
  });
}
