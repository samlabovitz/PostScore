// GET ?week=YYYY-MM-DD: the weekly report — the one-page PostScore report
// layout with the week in the header and the change compared with the
// last scan before that week. Drawn on demand from the week's frozen
// snapshot (finished weeks) or the live report data (this week), never
// stored. Owner-only (RLS); the business's own language.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { weeklyReportDataWithClient } from "@/lib/weekly/weeklyData.server";
import { getReportData } from "@/lib/reports/reportData.server";
import { buildReportPdf } from "@/lib/reports/reportPdf.server";
import { weeklyReportFileName } from "@/lib/reports/reportPdf";
import { getPlan } from "@/lib/premium";
import { isPremiumPlan } from "@/lib/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  // The PDF report is Premium (Settings → Compare plans: "Weekly + PDF").
  if (!isPremiumPlan(await getPlan())) return NextResponse.json({ error: "premium_only" }, { status: 403 });
  const week = new URL(request.url).searchParams.get("week");
  const data = await weeklyReportDataWithClient(supabase, params.id, week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : null, {
    current: async () => {
      const report = await getReportData(params.id);
      return report.status === "ok" ? report.data : null;
    },
  });
  if (!data || !data.weekly) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const bytes = await buildReportPdf(data);
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${weeklyReportFileName(data.business.name, data.weekly.weekStart)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
