import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { scoreBusinessById, getScoreHistory, getRecentScoreSnapshots } from "@/app/actions/scoring";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getAssistantPageData } from "@/app/actions/assistant";
import { getLocalBenchmark } from "@/app/actions/competitors";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { normalizeLocale, t } from "@/lib/i18n";
import { BusinessScoreView, type AssistantEmbedData } from "./BusinessScoreView";

export default async function BusinessPage({ params }: { params: { id: string } }) {
  // getBusinessSummary is awaited separately (not folded into the
  // Promise.all below) because its business.language is needed to derive
  // `locale` BEFORE scoring — scoreBusinessById needs the real locale to
  // produce Spanish-language check labels/explanations for a Spanish
  // business, not English ones re-labeled after the fact (same reasoning
  // as loadContext() in app/actions/assistant.ts).
  const summary = await getBusinessSummary(params.id);

  if (summary.status === "unauthenticated") {
    redirect("/login");
  }

  if (summary.status === "not_found") {
    notFound();
  }

  const locale = normalizeLocale(summary.business.language);

  const scored = await scoreBusinessById(params.id, locale);

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

  const [history, recentSnapshots, assistantPageData, benchmark, gbpStatus] = await Promise.all([
    getScoreHistory(params.id),
    getRecentScoreSnapshots(params.id, 2),
    getAssistantPageData(params.id),
    getLocalBenchmark(params.id),
    getGbpConnectionStatus(params.id),
  ]);

  const assistant: AssistantEmbedData =
    assistantPageData.status === "ok"
      ? {
          status: "ok",
          context: assistantPageData.context,
          starterPrompts: assistantPageData.starterPrompts,
          conversationCount: assistantPageData.conversationCount,
        }
      : {
          status: "unavailable",
          message:
            assistantPageData.status === "error"
              ? assistantPageData.message
              : t(locale, "dashboard.overview.assistantDataErrorFallback"),
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
        benchmark={benchmark}
        gbpConnected={gbpStatus.status === "ok" && gbpStatus.connected}
      />
    </DashboardShell>
  );
}
