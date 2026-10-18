import { notFound, redirect } from "next/navigation";
import { StaleScanNotice } from "@/components/scoring/StaleScanNotice";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getReportsData } from "@/app/actions/reports";
import { ReportsView } from "./ReportsView";
import { getLastScanAt } from "@/app/actions/scoring";

export default async function ReportsPage({ params }: { params: { id: string } }) {
  // Independent loads run together.
  const [websiteOnly, summary, reports, lastScanAt] = await Promise.all([
    websiteOnlyGuard(params.id, "reports"),
    getBusinessSummary(params.id),
    getReportsData(params.id),
    getLastScanAt(params.id),
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

  return (
    <DashboardShell business={summary.business}>
      <div className="flex flex-col gap-6">
        <StaleScanNotice businessId={params.id} lastScanAt={lastScanAt} now={new Date().toISOString()} />
        <ReportsView businessId={params.id} businessName={summary.business.name} reports={reports} />
      </div>
    </DashboardShell>
  );
}
