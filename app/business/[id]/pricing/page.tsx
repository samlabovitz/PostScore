import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getPrices, getPricingAssessment } from "@/app/actions/pricing";
import { bizProfile } from "@/config/bizProfiles";
import { PricingView } from "./PricingView";

export default async function PricingPage({ params }: { params: { id: string } }) {
  const summary = await getBusinessSummary(params.id);

  if (summary.status === "unauthenticated") {
    redirect("/login");
  }
  if (summary.status === "not_found") {
    notFound();
  }

  const { business } = summary;
  const profile = bizProfile(business.category, business.primary_type);
  const [pricesResult, assessmentResult] = await Promise.all([
    getPrices(params.id),
    getPricingAssessment(params.id),
  ]);

  if (pricesResult.status === "unauthenticated" || assessmentResult.status === "unauthenticated") {
    redirect("/login");
  }
  if (pricesResult.status === "error") {
    return (
      <DashboardShell business={business}>
        <Card className="p-5 text-sm text-red">{pricesResult.message}</Card>
      </DashboardShell>
    );
  }
  if (assessmentResult.status === "error") {
    return (
      <DashboardShell business={business}>
        <Card className="p-5 text-sm text-red">{assessmentResult.message}</Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell business={business}>
      <PricingView
        businessId={business.id}
        businessName={business.name}
        profile={profile}
        initialPrices={pricesResult.prices}
        initialAssessment={assessmentResult.assessment}
      />
    </DashboardShell>
  );
}
