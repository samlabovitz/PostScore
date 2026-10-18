import { notFound, redirect } from "next/navigation";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { getReviewsPageData } from "@/app/actions/reviews";
import { ReviewsView } from "./ReviewsView";
import { getLastScanAt } from "@/app/actions/scoring";
import { StaleScanNotice } from "@/components/scoring/StaleScanNotice";
import { showRescanNotice } from "@/lib/rescanPolicy";
import { getPlan } from "@/lib/premium";

export default async function WebsiteReviewsPage({ params }: { params: { id: string } }) {
  // Independent loads run together.
  const [websiteOnly, result, lastScanAt] = await Promise.all([
    websiteOnlyGuard(params.id, "reviews"),
    getReviewsPageData(params.id),
    getLastScanAt(params.id),
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
        plan={getPlan()}
        devPlanSwitch={process.env.NODE_ENV === "development"}
      />
    </DashboardShell>
  );
}
