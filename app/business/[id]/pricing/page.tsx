import { notFound, redirect } from "next/navigation";
import { IconTag } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ComingTogether } from "@/components/dashboard/ComingTogether";
import { getBusinessSummary } from "@/app/actions/businesses";

export default async function PricingPage({ params }: { params: { id: string } }) {
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
        section="Pricing"
        businessId={summary.business.id}
        businessName={summary.business.name}
        icon={IconTag}
      />
    </DashboardShell>
  );
}
