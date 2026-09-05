import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { scoreBusinessById, getScoreHistory, getRecentScoreSnapshots } from "@/app/actions/scoring";
import { getAssistantPageData } from "@/app/actions/assistant";
import { BusinessScoreView, type AssistantEmbedData } from "./BusinessScoreView";

export default async function BusinessPage({ params }: { params: { id: string } }) {
  const scored = await scoreBusinessById(params.id);

  if (scored.status === "unauthenticated") {
    redirect("/login");
  }

  if (scored.status === "not_found") {
    notFound();
  }

  if (scored.status === "error") {
    return (
      <DashboardShell>
        <Card className="p-5 text-sm text-red">{scored.message}</Card>
      </DashboardShell>
    );
  }

  const [history, recentSnapshots, assistantPageData] = await Promise.all([
    getScoreHistory(params.id),
    getRecentScoreSnapshots(params.id, 2),
    getAssistantPageData(params.id),
  ]);

  const assistant: AssistantEmbedData =
    assistantPageData.status === "ok"
      ? {
          status: "ok",
          context: assistantPageData.context,
          starterPrompts: assistantPageData.starterPrompts,
          messages: assistantPageData.messages,
        }
      : {
          status: "unavailable",
          message:
            assistantPageData.status === "error"
              ? assistantPageData.message
              : "Couldn't load the assistant's grounding data.",
        };

  return (
    <DashboardShell business={scored.business}>
      <BusinessScoreView
        businessId={params.id}
        business={scored.business}
        result={scored.result}
        history={history}
        recentSnapshots={recentSnapshots}
        assistant={assistant}
      />
    </DashboardShell>
  );
}
