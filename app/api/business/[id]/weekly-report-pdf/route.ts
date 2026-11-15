// GET ?week=YYYY-MM-DD: the weekly report. This week (from
// WEEKLY_REPORT_V2_FROM on): the three-page report (lib/reports/
// weeklyReportV2.ts). Finished weeks keep the one-page layout they were
// made with, from their frozen snapshot. Drawn on demand, never stored.
// Owner-only (RLS); the business's own language.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { weeklyReportDataWithClient } from "@/lib/weekly/weeklyData.server";
import { getReportDataWithSources, type ReportSources } from "@/lib/reports/reportData.server";
import { buildReportPdf, buildWeeklyReportV2Pdf } from "@/lib/reports/reportPdf.server";
import { buildWeeklyReportV2Data } from "@/lib/reports/weeklyReportV2Data.server";
import { usesWeeklyReportV2 } from "@/lib/reports/weeklyReportV2";
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
  const plan = await getPlan();
  if (!isPremiumPlan(plan)) return NextResponse.json({ error: "premium_only" }, { status: 403 });
  const week = new URL(request.url).searchParams.get("week");
  let sources: ReportSources | null = null;
  const data = await weeklyReportDataWithClient(supabase, params.id, week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : null, {
    current: async () => {
      const report = await getReportDataWithSources(params.id);
      if (report.status !== "ok") return null;
      if ("sources" in report) sources = report.sources;
      return report.data;
    },
  });
  if (!data || !data.weekly) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const bytes =
    sources && usesWeeklyReportV2(data.weekly.weekStart, data.weekly.pastWeek)
      ? await buildWeeklyReportV2Pdf(await buildWeeklyReportV2Data(supabase, params.id, data, sources, { plan }))
      : await buildReportPdf(data);
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${weeklyReportFileName(data.business.name, data.weekly.weekStart)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
