import { notFound, redirect } from "next/navigation";
import { StaleScanNotice } from "@/components/scoring/StaleScanNotice";
import { showRescanNotice } from "@/lib/rescanPolicy";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { getBusinessSummary } from "@/app/actions/businesses";
import { scoreBusinessById, getLastScanAt } from "@/app/actions/scoring";
import { getWebsiteRecheckStatus } from "@/app/actions/websiteRecheck";
import { getActionPlan } from "@/app/actions/actionPlan";
import { getGrowthMoves } from "@/app/actions/growthMoves";
import { getWeeklyChecklistState } from "@/app/actions/weeklyChecklist";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { businessRowToScoringInput } from "@/lib/scoring";
import { buildPriceCheckMove } from "@/lib/growthMoves";
import { buildWeeklyChecklistItems, weekStartFor } from "@/lib/weeklyChecklist";
import { resolveBizProfile } from "@/config/bizProfiles";
import { normalizeLocale } from "@/lib/i18n";
import { GrowthView } from "./GrowthView";
import { canConnectGbp, getPlan } from "@/lib/premium";
import { SEARCH_DEMAND_EXAMPLE } from "@/lib/gbp/searchDemand";
import { campaignsHref } from "@/lib/campaignsTabs";

export default async function GrowthPage({ params, searchParams = {} }: { params: { id: string }; searchParams?: { tab?: string } }) {
  // Coupons and referrals moved to the Campaigns page: old links to
  // Growth's ?tab=coupons / ?tab=referral land on the matching tab there.
  if (searchParams.tab === "coupons") redirect(campaignsHref(params.id, "coupons"));
  if (searchParams.tab === "referral" || searchParams.tab === "referrals") redirect(campaignsHref(params.id, "referrals"));

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
  const checklistPromise = getWeeklyChecklistState(params.id);
  const lastScanPromise = getLastScanAt(params.id);
  const gbpPromise = getGbpConnectionStatus(params.id);
  // The Google Profile tab is Premium (Free/Grow see a preview).
  const plan = getPlan();


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
  const [actionPlanResult, growthMovesResult, checklistStateResult, lastScanAt, gbpStatus, recheckStatus] = await Promise.all([
    getActionPlan(params.id, input, scored.result.breakdown, scored.result.suggestions, locale, {
      businessRow: scored.business,
      businessName: business.name ?? "Your business",
      googleMapsUri: scored.business.google_maps_uri ?? null,
      profileId: profile.id,
    }),
    getGrowthMoves(params.id, scored.result.breakdown, profile, locale),
    checklistPromise,
    lastScanPromise,
    gbpPromise,
    getWebsiteRecheckStatus(params.id),
  ]);

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

  const gbpConnected = gbpStatus.status === "ok" && gbpStatus.connected;
  const row = scored.business;
  const googleProfile = {
    listing: {
      rating: row.rating,
      reviewCount: row.review_count,
      photoCount: row.photo_count,
      hasHours: !!row.opening_hours && row.opening_hours.length > 0,
      phone: row.phone,
      website: row.website,
      category: row.category,
      googleMapsUri: row.google_maps_uri ?? null,
    },
    // Website-only businesses never reach this page (websiteOnlyGuard).
    websiteOnly: false,
    connected: gbpConnected,
    // Same rule as search demand everywhere: example data under an
    // "Example" watermark until the connection is live.
    searchDemand: canConnectGbp() && gbpConnected ? ({ kind: "awaiting" } as const) : ({ kind: "preview", data: SEARCH_DEMAND_EXAMPLE } as const),
  };

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
        profile={profile}
        breakdown={scored.result.breakdown}
        googleProfile={googleProfile}
        actionPlan={actionPlan}
        growthMoves={growthMoves}
        weeklyChecklist={weeklyChecklist}
        lastScanAt={lastScanAt}
        websiteRecheck={recheckStatus.status === "ok" ? { left: recheckStatus.availability.left, hasWebsite: recheckStatus.hasWebsite } : null}
        gbpConnected={gbpConnected}
        linkOptions={{ referralOk: profile.referralOk, couponsOk: profile.couponsOk, pricingOk: profile.pricingOk }}
        plan={plan}
        devPlanSwitch={process.env.NODE_ENV === "development"}
      />
    </DashboardShell>
  );
}
