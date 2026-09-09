import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getReportsData } from "@/app/actions/reports";
import { ReportsView } from "./ReportsView";

export default async function ReportsPage({ params }: { params: { id: string } }) {
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

  return (
    <DashboardShell business={summary.business}>
      <ReportsView businessId={params.id} businessName={summary.business.name} reports={reports} />
    </DashboardShell>
  );
}
