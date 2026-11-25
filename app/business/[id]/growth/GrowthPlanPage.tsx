import { notFound, redirect } from "next/navigation";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { GooglePageShell } from "@/components/gbp/GooglePageShell";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { GrowthFreePreview, GrowthPlanView } from "@/components/growth/GrowthPlanView";
import { loadGoogleResults } from "@/lib/googlePages.server";
import { loadGrowthView } from "@/lib/growthPlan.server";
import { weekPlanFor } from "@/lib/growthWeekPlan.server";
import { tabIdeasFor, weekKinds } from "@/lib/tabIdeas";
import { getWeeklyChecklistState } from "@/app/actions/weeklyChecklist";
import { getLocalBenchmark } from "@/app/actions/competitors";
import { buildWeeklyChecklistItems, type WeeklyChecklistItemId } from "@/lib/weeklyChecklist";
import { resolveBizProfile } from "@/config/bizProfiles";
import { viewLocale } from "@/lib/viewLocale.server";
import { DEFAULT_BUSINESS_TIMEZONE } from "@/lib/i18n/format";
import { isPremiumPlan } from "@/lib/plan";

/**
 * Growth → Growth plan on the new design (Day 25B step 6; spec §2, §2c, §6,
 * mockups 03, 03b, 06): the tier, this week's plan ranked for the tier, More
 * ways to bring people in, the link to Google results, and More customers.
 * Free: the locked preview (06), never a made-up tier.
 */
export async function GrowthPlanPage({ businessId, gbp }: { businessId: string; gbp?: string }) {
  const websiteOnly = await websiteOnlyGuard(businessId, "growth");
  if (websiteOnly) return websiteOnly;
  const data = await loadGoogleResults(businessId, gbp);
  if (data.status === "unauthenticated") redirect("/login");
  if (data.status === "not_found") notFound();
  if (data.status !== "ok") return <GooglePageShell data={data} promoPage="growth" render={() => null} />;
  const { business, plan, props } = data;
  const timeZone = business.time_zone ?? DEFAULT_BUSINESS_TIMEZONE;
  const locale = viewLocale(business.language);

  if (plan === "free") {
    const { recs, type } = tabIdeasFor(props, timeZone, Date.now());
    const upgrade = await loadUpgradeContext(businessId, "growth");
    return (
      <DashboardShell upgrade={upgrade && { ...upgrade, cards: [] }} business={business}>
        <GrowthFreePreview businessId={businessId} recs={weekKinds(recs)} type={type} />
      </DashboardShell>
    );
  }

  const [view, checklist, benchmark] = await Promise.all([loadGrowthView(businessId), getWeeklyChecklistState(businessId), getLocalBenchmark(businessId)]);
  const checked = (checklist.status === "ok" ? checklist.state.checkedItemIds : []) as WeeklyChecklistItemId[];
  const week = weekPlanFor(props, timeZone, view, checked, isPremiumPlan(plan) && (props.connected || props.practice));
  const profile = resolveBizProfile(business.category, business.primary_type, business.business_type_override, locale, business.categories, business.name, business.biz_type_resolved);
  const routine = buildWeeklyChecklistItems(locale).map((i) => ({ id: i.id, title: i.title, howTo: i.howTo }));
  return (
    <GooglePageShell
      data={data}
      promoPage="growth"
      render={(p) => (
        <GrowthPlanView
          props={p}
          plan={plan}
          state={view.status === "ok" ? view.state : null}
          testAccount={view.status === "ok" && view.testAccount}
          week={week}
          routine={routine}
          growMore={{
            businessId,
            profileTools: { referralOk: profile.referralOk, couponsOk: profile.couponsOk, pricingOk: profile.pricingOk },
            reviewCount: p.listing.reviewCount ?? null,
            nearbyReviewAverage: benchmark.status === "ok" ? benchmark.benchmark.competitorReviewAverage : null,
            goal: benchmark.status === "ok" ? benchmark.benchmark.reviewGoal : null,
            group: benchmark.status === "ok" ? benchmark.benchmark.reviewGroup : null,
            growthPlan: true,
          }}
        />
      )}
    />
  );
}
