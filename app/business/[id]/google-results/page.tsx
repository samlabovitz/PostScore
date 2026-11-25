import { redirect } from "next/navigation";
import { NEW_PAGES_LIVE, googleResultsHref } from "@/lib/routes";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { canOpenNewGooglePages, loadGoogleResults } from "@/lib/googlePages.server";
import { GooglePageShell } from "@/components/gbp/GooglePageShell";
import { GoogleResults } from "@/components/gbp/GoogleResults";
import { TierPlanProvider } from "@/components/growth/GrowthPlanView";
import { loadGrowthView } from "@/lib/growthPlan.server";
import { weekPlanFor } from "@/lib/growthWeekPlan.server";
import { getWeeklyChecklistState } from "@/app/actions/weeklyChecklist";
import { isPremiumPlan } from "@/lib/plan";
import { DEFAULT_BUSINESS_TIMEZONE } from "@/lib/i18n/format";
import type { WeeklyChecklistItemId } from "@/lib/weeklyChecklist";

/** Growth → Google results (Day 25B step 2; docs/plans/day25a-spec.md §2).
 * Behind NEW_PAGES_LIVE: until then only the dev test login may open it;
 * everyone else lands on the old Google Profile tab. Its "What to do this
 * week" is the Growth plan's list, in the same order (Day 25B step 6). */
export default async function GoogleResultsPage({ params, searchParams = {} }: { params: { id: string }; searchParams?: { gbp?: string } }) {
  if (!(await canOpenNewGooglePages())) redirect(googleResultsHref(params.id));
  const websiteOnly = await websiteOnlyGuard(params.id, "growth");
  if (websiteOnly) return websiteOnly;
  const data = await loadGoogleResults(params.id, searchParams.gbp);
  // The tier's order and lines: the new-design preview only (localhost:3000 stays as today).
  if (!NEW_PAGES_LIVE || data.status !== "ok" || data.plan === "free") return <GooglePageShell data={data} promoPage="growth" render={(props) => <GoogleResults {...props} />} />;
  const [view, checklist] = await Promise.all([loadGrowthView(params.id), getWeeklyChecklistState(params.id)]);
  const oneTap = isPremiumPlan(data.plan) && (data.props.connected || data.props.practice);
  const week = weekPlanFor(data.props, data.business.time_zone ?? DEFAULT_BUSINESS_TIMEZONE, view, (checklist.status === "ok" ? checklist.state.checkedItemIds : []) as WeeklyChecklistItemId[], oneTap);
  return (
    <GooglePageShell
      data={data}
      promoPage="growth"
      render={(props) => (
        <TierPlanProvider businessId={params.id} plan={week} week didThis={!oneTap}>
          <GoogleResults {...props} />
        </TierPlanProvider>
      )}
    />
  );
}
