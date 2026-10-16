import { notFound, redirect } from "next/navigation";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { getBusinessSummary } from "@/app/actions/businesses";
import { scoreBusinessById, getLastScanAt } from "@/app/actions/scoring";
import { getActionPlan } from "@/app/actions/actionPlan";
import { getGrowthMoves } from "@/app/actions/growthMoves";
import { getWeeklyChecklistState } from "@/app/actions/weeklyChecklist";
import { listActivePromos } from "@/app/actions/promos";
import { getActiveReferral } from "@/app/actions/referrals";
import { businessRowToScoringInput } from "@/lib/scoring";
import { buildPriceCheckMove } from "@/lib/growthMoves";
import { buildWeeklyChecklistItems } from "@/lib/weeklyChecklist";
import { resolveBizProfile } from "@/config/bizProfiles";
import { normalizeLocale } from "@/lib/i18n";
import { GrowthView } from "./GrowthView";

export default async function GrowthPage({ params }: { params: { id: string } }) {
  const websiteOnly = await websiteOnlyGuard(params.id, "growth");
  if (websiteOnly) return websiteOnly;

  const summary = await getBusinessSummary(params.id);

  if (summary.status === "unauthenticated") {
    redirect("/login");
  }
  if (summary.status === "not_found") {
    notFound();
  }

  const { business } = summary;
  const locale = normalizeLocale(business.language);
  const profile = resolveBizProfile(
    business.category,
    business.primary_type,
    business.business_type_override,
    locale,
    business.categories,
    business.name
  );

  const scored = await scoreBusinessById(params.id, locale);

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
    scored.result.suggestions,
    locale,
    {
      businessRow: scored.business,
      businessName: business.name ?? "Your business",
      googleMapsUri: scored.business.google_maps_uri ?? null,
      profileId: profile.id,
    }
  );

  const promosResult = await listActivePromos(params.id);
  const initialPromos = promosResult.status === "ok" ? promosResult.promos : [];

  const growthMovesResult = await getGrowthMoves(params.id, scored.result.breakdown, profile, locale);
  // The price check always shows for every business (Step 2f) — even if
  // the rest of the growth signals couldn't load.
  const growthMoves =
    growthMovesResult.status === "ok" ? growthMovesResult.moves : [buildPriceCheckMove(params.id, null, locale)];

  const checklistStateResult = await getWeeklyChecklistState(params.id);
  const weeklyChecklist = {
    items: buildWeeklyChecklistItems(locale),
    checkedItemIds: checklistStateResult.status === "ok" ? checklistStateResult.state.checkedItemIds : [],
    streakWeeks: checklistStateResult.status === "ok" ? checklistStateResult.state.streakWeeks : 0,
  };

  const lastScanAt = await getLastScanAt(params.id);

  // Only businesses with referralOk ever see the Refer a friend segment
  // (see GrowthView), so there's no reason to query it for the rest.
  const referralResult = profile.referralOk ? await getActiveReferral(params.id) : null;
  const initialReferral = referralResult?.status === "ok" ? referralResult.referral : null;

  const actionPlan =
    actionPlanResult.status === "ok"
      ? actionPlanResult
      : {
          tasks: [],
          completed: [],
          weeklyTasks: [],
          laterTasks: [],
          weeklyProjectedBreakdown: scored.result.breakdown,
          weeklyProjectedBreakdownHigh: null,
          weeklyPointsWithinReach: 0,
          websiteBanner: null,
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
        businessPhone={business.phone ?? null}
        profile={profile}
        referralOk={profile.referralOk}
        breakdown={scored.result.breakdown}
        actionPlan={actionPlan}
        growthMoves={growthMoves}
        weeklyChecklist={weeklyChecklist}
        initialPromos={initialPromos}
        initialReferral={initialReferral}
        lastScanAt={lastScanAt}
      />
    </DashboardShell>
  );
}
