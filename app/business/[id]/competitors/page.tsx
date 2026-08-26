import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { getCompetitors } from "@/app/actions/competitors";
import { CompetitorsView } from "./CompetitorsView";

export default async function CompetitorsPage({ params }: { params: { id: string } }) {
  const fetched = await getCompetitors(params.id);

  if (fetched.status === "unauthenticated") {
    redirect("/login");
  }

  if (fetched.status === "not_found") {
    notFound();
  }

  if (fetched.status === "error") {
    return (
      <DashboardShell>
        <Card className="p-5 text-sm text-red">{fetched.message}</Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      business={{ id: params.id, name: fetched.businessName, address: fetched.businessAddress }}
    >
      <CompetitorsView
        businessId={params.id}
        businessName={fetched.businessName}
        competitorNoun={fetched.competitorNoun}
        result={fetched.result}
      />
    </DashboardShell>
  );
}
