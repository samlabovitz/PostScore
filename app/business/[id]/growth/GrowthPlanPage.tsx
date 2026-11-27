import { notFound, redirect } from "next/navigation";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { GooglePageShell } from "@/components/gbp/GooglePageShell";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { GrowthFreePreview, GrowthPlanView } from "@/components/growth/GrowthPlanView";
import { loadGoogleResults } from "@/lib/googlePages.server";
import { loadGrowthView } from "@/lib/growthPlan.server";
import { getWeeklyChecklistState } from "@/app/actions/weeklyChecklist";
import { weekHabits } from "@/lib/growthHabits";
import { loadScoreRoom } from "@/lib/growthHabits.server";

/**
 * Growth → Growth plan on the new design (Day 25B; docs/mockups/day25b/growth-checklist.html): the tier, this
 * week's checklist of habits (lib/growthHabits.ts; score fixes live only on Fix plan), More ways to bring people
 * in and the link to Google results (the sidebar has the Growth tools). Free: the locked preview, never a made-up tier.
 */
export async function GrowthPlanPage({ businessId, gbp }: { businessId: string; gbp?: string }) {
  const websiteOnly = await websiteOnlyGuard(businessId, "growth");
  if (websiteOnly) return websiteOnly;
  const data = await loadGoogleResults(businessId, gbp);
  if (data.status === "unauthenticated") redirect("/login");
  if (data.status === "not_found") notFound();
  if (data.status !== "ok") return <GooglePageShell data={data} promoPage="growth" render={() => null} />;
  const { business, plan } = data;

  // The habits: a seasonal idea when a holiday is close, and "Also helps your score" from the saved scan.
  const habits = weekHabits(new Date(), await loadScoreRoom(businessId).catch(() => ({ reviews: false, photos: false })));
  if (plan === "free") {
    const upgrade = await loadUpgradeContext(businessId, "growth");
    return (
      <DashboardShell upgrade={upgrade && { ...upgrade, cards: [] }} business={business}>
        <GrowthFreePreview businessId={businessId} habits={habits} />
      </DashboardShell>
    );
  }

  const [view, checklist] = await Promise.all([loadGrowthView(businessId), getWeeklyChecklistState(businessId, { habits: true })]);
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
          habits={habits}
          checklist={checklist.status === "ok" ? checklist.state : null}
        />
      )}
    />
  );
}
