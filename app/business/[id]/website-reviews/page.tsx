import { notFound, redirect } from "next/navigation";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { freeShowroom } from "@/components/plan/freeShowroom";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { Card } from "@/components/ui/Card";
import { getReviewsPageData } from "@/app/actions/reviews";
import { ReviewsView } from "./ReviewsView";
import { getLastScanAt } from "@/app/actions/scoring";
import { StaleScanNotice } from "@/components/scoring/StaleScanNotice";
import { showRescanNotice } from "@/lib/rescanPolicy";
import { getPlan } from "@/lib/premium";
import { getLocalBenchmark } from "@/app/actions/competitors";
import { getReplyDraftStatus } from "@/app/actions/reviewReplies";

export default async function WebsiteReviewsPage({ params }: { params: { id: string } }) {
  // Free: this tab is locked — its showroom, before any of its own data loads.
  const showroom = await freeShowroom(params.id, "reviews");
  if (showroom) return showroom;
  // Independent loads run together.
  const [websiteOnly, result, lastScanAt, upgrade, benchmark, replyDrafts] = await Promise.all([
    websiteOnlyGuard(params.id, "reviews"),
    getReviewsPageData(params.id),
    getLastScanAt(params.id),
    loadUpgradeContext(params.id, "reviews"),
    // The shared nearby review average (DB only; request-cached).
    getLocalBenchmark(params.id),
    // The AI review reply drafts left (DB only).
    getReplyDraftStatus(params.id),
  ]);
  if (websiteOnly) return websiteOnly;

  if (result.status === "unauthenticated") {
    redirect("/login");
  }
  if (result.status === "not_found") {
    notFound();
  }
  if (result.status === "error") {
    return (
      <DashboardShell>
        <Card className="p-5 text-sm text-red">{result.message}</Card>
      </DashboardShell>
    );
  }

  const { data } = result;

  return (
    <DashboardShell
      upgrade={upgrade}
      business={{
        id: params.id,
        name: data.businessName,
        address: data.address,
        category: data.category,
        primary_type: data.primaryType,
        language: data.language,
        time_zone: data.timeZone,
      }}
    >
      {showRescanNotice(lastScanAt, new Date()) && (
        <div className="mb-6">
          <StaleScanNotice businessId={params.id} lastScanAt={lastScanAt} now={new Date().toISOString()} />
        </div>
      )}
      <ReviewsView
        businessId={params.id}
        reviews={data}
        plan={await getPlan()}
        nearby={benchmark.status === "ok" ? { goal: benchmark.benchmark.reviewGoal, group: benchmark.benchmark.reviewGroup } : null}
        devPlanSwitch={process.env.NODE_ENV === "development"}
        replyDrafts={replyDrafts}
      />
    </DashboardShell>
  );
}
