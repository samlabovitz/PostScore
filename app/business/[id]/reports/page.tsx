import { notFound, redirect } from "next/navigation";
import { ScanStatusStrip } from "@/components/scoring/ScanStatusStrip";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getReportsData } from "@/app/actions/reports";
import { ReportsView } from "./ReportsView";
import { getLastScanAt } from "@/app/actions/scoring";

export default async function ReportsPage({ params }: { params: { id: string } }) {
  const websiteOnly = await websiteOnlyGuard(params.id, "reports");
  if (websiteOnly) return websiteOnly;

  const summary = await getBusinessSummary(params.id);

  if (summary.status === "unauthenticated") {
    redirect("/login");
  }
  if (summary.status === "not_found") {
    notFound();
  }

  const reports = await getReportsData(params.id);

  if (reports.status === "unauthenticated") {
    redirect("/login");
  }
  if (reports.status === "not_found") {
    notFound();
  }

  const lastScanAt = await getLastScanAt(params.id);
  return (
    <DashboardShell business={summary.business}>
      <div className="flex flex-col gap-6">
        <ScanStatusStrip businessId={params.id} lastScanAt={lastScanAt} now={new Date().toISOString()} mode="link" />
        <ReportsView businessId={params.id} businessName={summary.business.name} reports={reports} />
      </div>
    </DashboardShell>
  );
}
