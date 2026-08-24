import { notFound, redirect } from "next/navigation";
import { IconTrendingUp } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ComingTogether } from "@/components/dashboard/ComingTogether";
import { getBusinessSummary } from "@/app/actions/businesses";

export default async function GrowthPage({ params }: { params: { id: string } }) {
  const summary = await getBusinessSummary(params.id);

  if (summary.status === "unauthenticated") {
    redirect("/login");
  }
  if (summary.status === "not_found") {
    notFound();
  }

  return (
    <DashboardShell business={summary.business}>
      <ComingTogether
        section="Growth"
        businessId={summary.business.id}
        businessName={summary.business.name}
        icon={IconTrendingUp}
      />
    </DashboardShell>
  );
}
