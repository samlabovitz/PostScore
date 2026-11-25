import { notFound, redirect } from "next/navigation";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { freeShowroom } from "@/components/plan/freeShowroom";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { Card } from "@/components/ui/Card";
import { getReviewsPageData } from "@/app/actions/reviews";
import { getPlan } from "@/lib/premium";
import { NEW_PAGES_LIVE, getReviewsHref } from "@/lib/routes";
import { GetReviewsView } from "./GetReviewsView";

/**
 * Growth → Get more reviews (Day 25B step 5): asking only. Only on the
 * new-design preview; elsewhere today's Reviews page (#get-more-reviews).
 * Free: today's rule — the Reviews showroom.
 */
export default async function GetReviewsPage({ params }: { params: { id: string } }) {
  if (!NEW_PAGES_LIVE) redirect(getReviewsHref(params.id, { hash: "get-more-reviews" }));
  const showroom = await freeShowroom(params.id, "reviews");
  if (showroom) return showroom;
  const [websiteOnly, result, upgrade, plan] = await Promise.all([websiteOnlyGuard(params.id, "reviews"), getReviewsPageData(params.id), loadUpgradeContext(params.id, "reviews"), getPlan()]);
  if (websiteOnly) return websiteOnly;
  if (result.status === "unauthenticated") redirect("/login");
  if (result.status === "not_found") notFound();
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
      business={{ id: params.id, name: data.businessName, address: data.address, category: data.category, primary_type: data.primaryType, language: data.language, time_zone: data.timeZone }}
    >
      <GetReviewsView businessId={params.id} businessName={data.businessName} placeId={data.placeId} verifiedSocials={data.verifiedSocials} plan={plan} />
    </DashboardShell>
  );
}
