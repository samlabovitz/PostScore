import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { getReviewsPageData } from "@/app/actions/reviews";
import { bizProfile, renderFaq } from "@/config/bizProfiles";
import { ReviewsAndWebsiteView } from "./ReviewsAndWebsiteView";

export default async function WebsiteReviewsPage({ params }: { params: { id: string } }) {
  const result = await getReviewsPageData(params.id);

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
  const profile = bizProfile(data.category, data.primaryType);
  const faq = renderFaq(profile.faq, { name: data.businessName, address: data.address });

  return (
    <DashboardShell
      business={{
        id: params.id,
        name: data.businessName,
        address: data.address,
        category: data.category,
        primary_type: data.primaryType,
      }}
    >
      <ReviewsAndWebsiteView businessId={params.id} reviews={data} faq={faq} />
    </DashboardShell>
  );
}
