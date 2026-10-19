import { notFound, redirect } from "next/navigation";
import { StaleScanNotice } from "@/components/scoring/StaleScanNotice";
import { showRescanNotice } from "@/lib/rescanPolicy";
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
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { businessRowToScoringInput } from "@/lib/scoring";
import { buildPriceCheckMove } from "@/lib/growthMoves";
import { buildWeeklyChecklistItems, weekStartFor } from "@/lib/weeklyChecklist";
import { resolveBizProfile } from "@/config/bizProfiles";
import { normalizeLocale } from "@/lib/i18n";
import { GrowthView } from "./GrowthView";
import { getPlan } from "@/lib/premium";
import { getPrintStudioData } from "@/app/actions/printStudio";

export default async function GrowthPage({ params }: { params: { id: string } }) {
  // Independent loads run together; see lib/requestCache.ts for why the
  // repeated business/score reads cost one query each.
  const [websiteOnly, summary, scored] = await Promise.all([
    websiteOnlyGuard(params.id, "growth"),
    getBusinessSummary(params.id),
    // The score reads the business's own language from its row.
    scoreBusinessById(params.id, "business"),
  ]);
  if (websiteOnly) return websiteOnly;

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

  // These need only the business, not its score — start them now.
  const promosPromise = listActivePromos(params.id);
  const checklistPromise = getWeeklyChecklistState(params.id);
  const lastScanPromise = getLastScanAt(params.id);
  // Only businesses with referralOk ever see the Refer a friend segment
  // (see GrowthView), so there's no reason to query it for the rest.
  const referralPromise = profile.referralOk ? getActiveReferral(params.id) : Promise.resolve(null);
  const gbpPromise = getGbpConnectionStatus(params.id);
  // The coupon and referral designers print the business's own facts
  // (every plan sees the live preview; printing is gated by getPlan()).
  const plan = getPlan();
  const printPromise = getPrintStudioData(params.id);


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
  const [actionPlanResult, growthMovesResult, promosResult, checklistStateResult, lastScanAt, referralResult, gbpStatus, printData] = await Promise.all([
    getActionPlan(params.id, input, scored.result.breakdown, scored.result.suggestions, locale, {
      businessRow: scored.business,
      businessName: business.name ?? "Your business",
      googleMapsUri: scored.business.google_maps_uri ?? null,
      profileId: profile.id,
    }),
    getGrowthMoves(params.id, scored.result.breakdown, profile, locale),
    promosPromise,
    checklistPromise,
    lastScanPromise,
    referralPromise,
    gbpPromise,
    printPromise,
  ]);
  const initialPromos = promosResult.status === "ok" ? promosResult.promos : [];

  // The price check always shows for every business (Step 2f) — even if
  // the rest of the growth signals couldn't load.
  const growthMoves =
    growthMovesResult.status === "ok" ? growthMovesResult.moves : [buildPriceCheckMove(params.id, null, locale, business.time_zone)];

  const weeklyChecklist = {
    items: buildWeeklyChecklistItems(locale),
    checkedItemIds: checklistStateResult.status === "ok" ? checklistStateResult.state.checkedItemIds : [],
    streakWeeks: checklistStateResult.status === "ok" ? checklistStateResult.state.streakWeeks : 0,
    weekStart: checklistStateResult.status === "ok" ? checklistStateResult.state.weekStart : weekStartFor(new Date(), business.time_zone ?? undefined),
  };

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
      {showRescanNotice(lastScanAt, new Date()) && (
        <div className="mb-6">
          <StaleScanNotice businessId={params.id} lastScanAt={lastScanAt} now={new Date().toISOString()} />
        </div>
      )}
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
        gbpConnected={gbpStatus.status === "ok" && gbpStatus.connected}
        linkOptions={{ referralOk: profile.referralOk, couponsOk: profile.couponsOk, pricingOk: profile.pricingOk }}
        plan={plan}
        devPlanSwitch={process.env.NODE_ENV === "development"}
        printBusiness={printData && printData.status === "ok" ? printData.business : null}
      />
    </DashboardShell>
  );
}
