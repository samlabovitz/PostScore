import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { scoreBusinessById, getScoreHistory, getRecentScoreSnapshots } from "@/app/actions/scoring";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getAssistantPageData } from "@/app/actions/assistant";
import { getLocalBenchmark } from "@/app/actions/competitors";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { resolveBizProfile } from "@/config/bizProfiles";
import { normalizeLocale, t } from "@/lib/i18n";
import { BusinessScoreView, type AssistantEmbedData } from "./BusinessScoreView";
import { WebsiteOnlyOverview } from "./WebsiteOnlyOverview";
import { getListingMode } from "@/lib/listingMode";
import { createClient } from "@/lib/supabase/server";
import { businessRowToScoringInput, parseWebsiteAnalysis } from "@/lib/scoring";
import { getActionPlan } from "@/app/actions/actionPlan";
import { topRecommendations } from "@/lib/overviewTiles";
import { websiteFixPlan } from "@/lib/websiteFixes";
import { resolveWebsiteBuilder } from "@/lib/websiteBuilder";
import { businessWebsiteUrl } from "@/lib/businessWebsite";

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
  const profile = resolveBizProfile(
    summary.business.category,
    summary.business.primary_type,
    summary.business.business_type_override,
    locale,
    summary.business.categories,
    summary.business.name
  );

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

  // Day 2b: no Google listing — the website alone, clearly labeled; no
  // PostScore, grade, history, competitor rank or PostAI (all of those
  // read the listing).
  if ((await getListingMode(createClient(), params.id)) === "website_only") {
    const websiteCategory = scored.result.breakdown.categories.find((c) => c.id === "website") ?? null;
    return (
      <DashboardShell business={scored.business}>
        <WebsiteOnlyOverview
          businessId={params.id}
          businessName={scored.business.name}
          website={scored.business.website}
          websiteCategory={websiteCategory}
          websiteFixes={scored.result.suggestions.filter((s) => s.category === "website")}
          checkedAt={parseWebsiteAnalysis(scored.business.website_analysis_json)?.checkedAt ?? null}
        />
      </DashboardShell>
    );
  }

  const [history, recentSnapshots, assistantPageData, benchmark, gbpStatus, actionPlan] = await Promise.all([
    getScoreHistory(params.id),
    getRecentScoreSnapshots(params.id, 2),
    getAssistantPageData(params.id),
    getLocalBenchmark(params.id),
    getGbpConnectionStatus(params.id),
    // The same plan the Growth page shows — Top recommendations are its
    // biggest open items.
    getActionPlan(params.id, businessRowToScoringInput(scored.business), scored.result.breakdown, scored.result.suggestions, locale, {
      businessRow: scored.business,
      businessName: scored.business.name ?? "Your business",
      googleMapsUri: scored.business.google_maps_uri ?? null,
      profileId: profile.id,
    }),
  ]);

  const linkOptions = { referralOk: profile.referralOk, couponsOk: profile.couponsOk, pricingOk: profile.pricingOk };
  const recommendations =
    actionPlan.status === "ok" ? topRecommendations(actionPlan.tasks, actionPlan.websiteBanner, params.id, linkOptions) : null;
  // The Website page's own fix count (same builder rule, same plan).
  const websiteAnalysis = parseWebsiteAnalysis(scored.business.website_analysis_json);
  const websiteChecks = scored.result.breakdown.categories.find((c) => c.id === "website")?.checks ?? [];
  const websiteFixCount = websiteFixPlan(
    websiteChecks,
    resolveWebsiteBuilder(websiteAnalysis?.builder, businessWebsiteUrl(scored.business))?.id ?? null
  ).fixes.length;

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
        profileTools={{ referralOk: profile.referralOk, couponsOk: profile.couponsOk, pricingOk: profile.pricingOk }}
        now={new Date().toISOString()}
        recommendations={recommendations}
        websiteFixCount={websiteFixCount}
        linkOptions={linkOptions}
      />
    </DashboardShell>
  );
}
