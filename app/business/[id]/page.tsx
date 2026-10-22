import { notFound, redirect } from "next/navigation";
import { getListingModeForPage } from "@/components/scoring/websiteOnlyGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { getPlan } from "@/lib/premium";
import { rescanGate } from "@/lib/rescanPolicy";
import { lastOwnerRescanAt } from "@/lib/placesSearchBudget.server";
import { Card } from "@/components/ui/Card";
import { scoreBusinessById, getScoreHistory, getRecentScoreSnapshots } from "@/app/actions/scoring";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getAssistantPageData } from "@/app/actions/assistant";
import { getLocalBenchmark } from "@/app/actions/competitors";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { resolveBizProfile } from "@/config/bizProfiles";
import { normalizeLocale, t } from "@/lib/i18n";
import { BusinessScoreView, type AssistantEmbedData } from "./BusinessScoreView";
import { withoutAdvice } from "@/lib/freeUpsell";
import { freeAiAllowance } from "@/lib/freeAiUsage.server";
import { WebsiteOnlyOverview } from "./WebsiteOnlyOverview";
import { businessRowToScoringInput, parseWebsiteAnalysis } from "@/lib/scoring";
import { getActionPlan } from "@/app/actions/actionPlan";
import { topRecommendations } from "@/lib/overviewTiles";
import { websiteFixPlan } from "@/lib/websiteFixes";
import { resolveWebsiteBuilder } from "@/lib/websiteBuilder";
import { businessWebsiteUrl } from "@/lib/businessWebsite";
import { createClient } from "@/lib/supabase/server";
import { NicheBanner } from "@/components/niche/NicheBanner";
import { nicheBannerKind } from "@/lib/businessNiche";
import { loadBusinessNiche } from "@/lib/businessNiche.server";
import { getReplyDraftStatus } from "@/app/actions/reviewReplies";

export default async function BusinessPage({ params }: { params: { id: string } }) {
  // getBusinessSummary is awaited separately (not folded into the
  // Promise.all below) because its business.language is needed to derive
  // `locale` BEFORE scoring — scoreBusinessById needs the real locale to
  // produce Spanish-language check labels/explanations for a Spanish
  // business, not English ones re-labeled after the fact (same reasoning
  // as loadContext() in app/actions/assistant.ts).
  // The listing mode needs only the id — read it alongside the summary.
  // Summary, listing mode and score together — the score reads the
  // business's own language from its row ("business").
  const [summary, listingMode, scored] = await Promise.all([
    getBusinessSummary(params.id),
    getListingModeForPage(params.id),
    scoreBusinessById(params.id, "business"),
  ]);

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
  if (listingMode === "website_only") {
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

  const [history, recentSnapshots, assistantPageData, benchmark, gbpStatus, actionPlan, niche, upgrade, lastOwnerRescan, replyDrafts, freePostai] = await Promise.all([
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
    loadBusinessNiche(createClient(), params.id),
    loadUpgradeContext(params.id, "overview"),
    // Free: when the month's free re-scan was last used (no Google call).
    (await getPlan()) === "free" ? lastOwnerRescanAt(params.id) : Promise.resolve(null),
    // Free: the AI review reply drafts left (DB only).
    (await getPlan()) === "free" ? getReplyDraftStatus(params.id) : Promise.resolve(null),
    // Free: PostAI questions left this week (DB only).
    (await getPlan()) === "free" ? freeAiAllowance(params.id, "postai") : Promise.resolve(null),
  ]);
  const bannerKind = niche ? nicheBannerKind(niche.resolved) : null;
  const freeGate = rescanGate(upgrade.plan === "free", null, lastOwnerRescan, new Date());
  const freeRescanNextAt = freeGate.limit === "weekly" ? freeGate.nextAvailableAt : null;

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

  // Free: the page gets only what the Free Overview shows — the score
  // without any fix advice, no recommendations, and PostAI's starter
  // prompts without the business context — so no real fix text is ever
  // in a Free page's HTML (lib/freeUpsell.ts).
  const free = upgrade.plan === "free";

  return (
    <DashboardShell upgrade={upgrade} business={scored.business}>
      {niche && bannerKind && (
        <div className="mb-6">
          <NicheBanner
            businessId={params.id}
            kind={bannerKind}
            nicheId={niche.resolved.nicheId}
            suggestion={niche.resolved.suggestion}
            parentLabel={profile.label}
          />
        </div>
      )}
      <BusinessScoreView
        businessId={params.id}
        business={scored.business}
        result={free ? withoutAdvice(scored.result) : scored.result}
        history={history}
        recentSnapshots={recentSnapshots}
        assistant={free && assistant.status === "ok" ? { status: "showroom", starterPrompts: assistant.starterPrompts } : assistant}
        benchmark={benchmark}
        gbpConnected={gbpStatus.status === "ok" && gbpStatus.connected}
        profileTools={{ referralOk: profile.referralOk, couponsOk: profile.couponsOk, pricingOk: profile.pricingOk }}
        now={new Date().toISOString()}
        recommendations={free ? null : recommendations}
        websiteFixCount={websiteFixCount}
        linkOptions={linkOptions}
        plan={upgrade.plan}
        freeRescanNextAt={freeRescanNextAt}
        replyDrafts={replyDrafts}
        freePostai={freePostai}
      />
    </DashboardShell>
  );
}
