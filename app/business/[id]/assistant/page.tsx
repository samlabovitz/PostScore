import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getAssistantPageData } from "@/app/actions/assistant";
import { AssistantView } from "./AssistantView";

export default async function AssistantPage({ params }: { params: { id: string } }) {
  const summary = await getBusinessSummary(params.id);

  if (summary.status === "unauthenticated") {
    redirect("/login");
  }
  if (summary.status === "not_found") {
    notFound();
  }

  const { business } = summary;
  const pageData = await getAssistantPageData(params.id);

  if (pageData.status === "unauthenticated") {
    redirect("/login");
  }
  if (pageData.status === "not_found") {
    notFound();
  }
  if (pageData.status === "error") {
    return (
      <DashboardShell business={business}>
        <Card className="p-5 text-sm text-red">{pageData.message}</Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell business={business}>
      <AssistantView
        businessId={business.id}
        businessName={business.name}
        context={pageData.context}
        starterPrompts={pageData.starterPrompts}
        initialMessages={pageData.messages}
      />
    </DashboardShell>
  );
}
