import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { scoreBusinessById, getScoreHistory, getRecentScoreSnapshots } from "@/app/actions/scoring";
import { BusinessScoreView } from "./BusinessScoreView";

export default async function BusinessPage({ params }: { params: { id: string } }) {
  const scored = await scoreBusinessById(params.id);

  if (scored.status === "unauthenticated") {
    redirect("/login");
  }

  if (scored.status === "not_found") {
    notFound();
  }

  if (scored.status === "error") {
    return (
      <DashboardShell>
        <Card className="p-5 text-sm text-red">{scored.message}</Card>
      </DashboardShell>
    );
  }

  const [history, recentSnapshots] = await Promise.all([
    getScoreHistory(params.id),
    getRecentScoreSnapshots(params.id, 2),
  ]);

  return (
    <DashboardShell business={scored.business}>
      <BusinessScoreView
        businessId={params.id}
        business={scored.business}
        result={scored.result}
        history={history}
        recentSnapshots={recentSnapshots}
      />
    </DashboardShell>
  );
}
