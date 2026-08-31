import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { getReviewsPageData } from "@/app/actions/reviews";
import { ReviewsView } from "./ReviewsView";

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
      <ReviewsView businessId={params.id} reviews={data} />
    </DashboardShell>
  );
}
