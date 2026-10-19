import { notFound, redirect } from "next/navigation";
import { StaleScanNotice } from "@/components/scoring/StaleScanNotice";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getReportsData } from "@/app/actions/reports";
import { ReportsView } from "./ReportsView";
import { getLastScanAt } from "@/app/actions/scoring";
import { getLocalBenchmark, getPreviousCompetitorRank } from "@/app/actions/competitors";
import { shareHeadline } from "@/lib/reports/reportPdf";
import { normalizeLocale } from "@/lib/i18n";

export default async function ReportsPage({ params }: { params: { id: string } }) {
  // Independent loads run together.
  const [websiteOnly, summary, reports, lastScanAt, benchmark] = await Promise.all([
    websiteOnlyGuard(params.id, "reports"),
    getBusinessSummary(params.id),
    getReportsData(params.id),
    getLastScanAt(params.id),
    getLocalBenchmark(params.id),
  ]);
  if (websiteOnly) return websiteOnly;

  if (summary.status === "unauthenticated") {
    redirect("/login");
  }
  if (summary.status === "not_found") {
    notFound();
  }

  if (reports.status === "unauthenticated") {
    redirect("/login");
  }
  if (reports.status === "not_found") {
    notFound();
  }

  // Share only with real good news: the score rose between two comparable
  // scans, or the shared local rank improved since the previous scan.
  const recap = reports.recap;
  const previousRank = benchmark.status === "ok" ? await getPreviousCompetitorRank(params.id, benchmark.benchmark.scanId) : null;
  const headline = shareHeadline({
    locale: normalizeLocale(summary.business.language),
    timeZone: reports.timeZone,
    generatedAt: new Date().toISOString(),
    business: { name: summary.business.name ?? "" },
    period: recap
      ? {
          from: recap.previous.created_at,
          to: recap.current.created_at,
          days: recap.daysBetween,
          fromScore: recap.previous.total,
          toScore: recap.current.total,
          comparable: recap.previous.scoring_version === recap.current.scoring_version,
        }
      : null,
    rank: benchmark.status === "ok" ? { rank: benchmark.benchmark.rank, of: benchmark.benchmark.peerCount, noun: benchmark.benchmark.competitorNoun, previousRank } : null,
  });

  return (
    <DashboardShell business={summary.business}>
      <div className="flex flex-col gap-6">
        <StaleScanNotice businessId={params.id} lastScanAt={lastScanAt} now={new Date().toISOString()} />
        <ReportsView businessId={params.id} businessName={summary.business.name} reports={reports} shareHeadline={summary.business.name ? headline : null} />
      </div>
    </DashboardShell>
  );
}
