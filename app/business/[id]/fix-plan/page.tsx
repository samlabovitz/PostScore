import { notFound, redirect } from "next/navigation";
import { fixPlanHref } from "@/lib/routes";
import { canOpenNewGooglePages } from "@/lib/googlePages.server";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { StaleScanNotice } from "@/components/scoring/StaleScanNotice";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { FixPlanView } from "@/components/fixPlan/FixPlanView";
import { showRescanNotice } from "@/lib/rescanPolicy";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { getBusinessSummary } from "@/app/actions/businesses";
import { scoreBusinessById, getLastScanAt } from "@/app/actions/scoring";
import { getActionPlan } from "@/app/actions/actionPlan";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { getWebsiteRecheckStatus } from "@/app/actions/websiteRecheck";
import { getLocalBenchmark } from "@/app/actions/competitors";
import { getCustomerDetailsUndo } from "@/app/actions/gbpCustomerDetails";
import { getWebsiteLinkUndoForPage, googleWritesPageState } from "@/app/actions/gbpWebsiteLink";
import { loadHoursCheck } from "@/lib/hoursCheck.server";
import { withHoursWhen } from "@/lib/hoursCheck";
import { loadDetailsMismatches } from "@/lib/detailsMismatch.server";
import { reviewGoalLines } from "@/lib/reviewGoal";
import { shownWebsite } from "@/lib/businessWebsite";
import { businessRowToScoringInput } from "@/lib/scoring";
import { buildFixPlan } from "@/lib/fixPlan";
import { weekStartFor } from "@/lib/weeklyChecklist";
import { viewLocale } from "@/lib/viewLocale.server";
import { resolveBizProfile } from "@/config/bizProfiles";
import { getPlan, hasPremium } from "@/lib/premium";
import { createClient } from "@/lib/supabase/server";

/** Presence → Fix plan (Day 25B step 3; docs/plans/day25a-spec.md §2b,
 * mockup 07). Behind NEW_PAGES_LIVE: until then only the dev test login
 * may open it; everyone else lands on today's Growth recap. Reads the saved
 * scan and PostScore's own rows only — nothing is saved on load. */
export default async function FixPlanRoute({ params }: { params: { id: string } }) {
  if (!(await canOpenNewGooglePages())) redirect(fixPlanHref(params.id));
  const [websiteOnly, summary, scored, upgrade, plan] = await Promise.all([
    websiteOnlyGuard(params.id, "growth"),
    getBusinessSummary(params.id),
    scoreBusinessById(params.id, "business"),
    loadUpgradeContext(params.id, "growth"),
    getPlan(),
  ]);
  if (websiteOnly) return websiteOnly;
  if (summary.status === "unauthenticated" || scored.status === "unauthenticated") redirect("/login");
  if (summary.status === "not_found" || scored.status === "not_found") notFound();
  const { business } = summary;
  if (scored.status === "error") {
    return (
      <DashboardShell business={business}>
        <Card className="p-5 text-sm text-red">{scored.message}</Card>
      </DashboardShell>
    );
  }
  const locale = viewLocale(business.language);
  const input = businessRowToScoringInput(scored.scoringBusiness ?? scored.business);
  const breakdown = scored.result.breakdown;
  const [actionPlan, lastScanAt, gbpStatus, recheck, benchmark] = await Promise.all([
    getActionPlan(params.id, input, breakdown, scored.result.suggestions, locale, {
      businessRow: scored.scoringBusiness ?? scored.business,
      businessName: business.name ?? "Your business",
      googleMapsUri: scored.business.google_maps_uri ?? null,
      profileId: resolveBizProfile(business.category, business.primary_type, business.business_type_override, locale, business.categories, business.name, business.biz_type_resolved).id,
    }),
    getLastScanAt(params.id),
    getGbpConnectionStatus(params.id),
    getWebsiteRecheckStatus(params.id),
    getLocalBenchmark(params.id),
  ]);
  if (actionPlan.status !== "ok") {
    return (
      <DashboardShell upgrade={upgrade} business={business}>
        <Card className="p-5 text-sm text-red">{actionPlan.status === "error" ? actionPlan.message : "Couldn't load your fix plan — try refreshing."}</Card>
      </DashboardShell>
    );
  }
  const gbpConnected = gbpStatus.status === "ok" && gbpStatus.connected;
  // The scored hours check as it is now; waiting on Google → "Takes a few weeks".
  const hoursCheck = await loadHoursCheck(params.id, scored.scoringBusiness ?? scored.business, actionPlan.tasks).catch(() => null);
  const fixPlan = buildFixPlan({ tasks: withHoursWhen(actionPlan.tasks, hoursCheck), websiteBanner: actionPlan.websiteBanner, breakdown });
  const row = scored.business;
  return (
    <DashboardShell upgrade={upgrade} business={business}>
      {showRescanNotice(lastScanAt, new Date()) && (
        <div className="mb-6">
          <StaleScanNotice businessId={params.id} lastScanAt={lastScanAt} now={new Date().toISOString()} />
        </div>
      )}
      <GbpEditProvider
        value={{
          premium: hasPremium(plan),
          connected: gbpConnected,
          undo: await getCustomerDetailsUndo(params.id),
          websiteUndo: await getWebsiteLinkUndoForPage(params.id),
          ...(await googleWritesPageState(params.id)),
          websiteSuggested: (() => {
            const shown = shownWebsite(row);
            return shown.kind === "site" && shown.source !== "listing" ? shown.url : null;
          })(),
        }}
      >
        <FixPlanView
          businessId={params.id}
          plan={fixPlan}
          every={{ score: scored.result.projectedBreakdown.total, grade: scored.result.projectedBreakdown.grade }}
          free={plan === "free"}
          premium={hasPremium(plan)}
          lastScanAt={lastScanAt}
          weekStart={weekStartFor(new Date(), business.time_zone ?? undefined)}
          completed={actionPlan.completed}
          gbpConnected={gbpConnected}
          websiteRecheck={recheck.status === "ok" ? { left: recheck.availability.left, hasWebsite: recheck.hasWebsite } : null}
          hoursCheck={hoursCheck}
          detailsMismatch={await loadDetailsMismatches(createClient(), params.id, scored.scoringBusiness ?? scored.business).catch(() => null)}
          reviewGoalLines={benchmark.status === "ok" && benchmark.benchmark.reviewGoal ? reviewGoalLines(benchmark.benchmark.reviewGoal, benchmark.benchmark.reviewGroup, locale) : []}
        />
      </GbpEditProvider>
    </DashboardShell>
  );
}
