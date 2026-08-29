import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { getBusinessSummary } from "@/app/actions/businesses";
import { scoreBusinessById } from "@/app/actions/scoring";
import { getActionPlan } from "@/app/actions/actionPlan";
import { businessRowToScoringInput } from "@/lib/scoring";
import { bizProfile } from "@/config/bizProfiles";
import { GrowthView } from "./GrowthView";

export default async function GrowthPage({ params }: { params: { id: string } }) {
  const summary = await getBusinessSummary(params.id);

  if (summary.status === "unauthenticated") {
    redirect("/login");
  }
  if (summary.status === "not_found") {
    notFound();
  }

  const { business } = summary;
  const profile = bizProfile(business.category, business.primary_type);

  const scored = await scoreBusinessById(params.id);

  if (scored.status === "unauthenticated") {
    redirect("/login");
  }
  if (scored.status === "not_found") {
    notFound();
  }
  if (scored.status === "error") {
    return (
      <DashboardShell business={business}>
        <Card className="p-5 text-sm text-red">{scored.message}</Card>
      </DashboardShell>
    );
  }

  const input = businessRowToScoringInput(scored.business);
  const actionPlanResult = await getActionPlan(
    params.id,
    input,
    scored.result.breakdown,
    scored.result.suggestions
  );

  const actionPlan =
    actionPlanResult.status === "ok"
      ? actionPlanResult
      : {
          tasks: [],
          completed: [],
          weeklyTasks: [],
          laterTasks: [],
          weeklyProjectedBreakdown: scored.result.breakdown,
          error:
            actionPlanResult.status === "error"
              ? actionPlanResult.message
              : "Couldn't load your action plan — try refreshing.",
        };

  return (
    <DashboardShell business={business}>
      <GrowthView
        businessId={params.id}
        businessName={business.name}
        profile={profile}
        referralOk={profile.referralOk}
        breakdown={scored.result.breakdown}
        actionPlan={actionPlan}
      />
    </DashboardShell>
  );
}
