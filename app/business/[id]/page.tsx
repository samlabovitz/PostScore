import { notFound, redirect } from "next/navigation";
import { loadHoursCheck } from "@/lib/hoursCheck.server";
import { withHoursWhen } from "@/lib/hoursCheck";
import { loadDetailsMismatches } from "@/lib/detailsMismatch.server";
import { loadOverviewListing } from "@/lib/overviewListing.server";
import { canConnectGbp } from "@/lib/premium";
import { isGbpOAuthConfigured } from "@/lib/googleBusinessProfile";
import { DEFAULT_BUSINESS_TIMEZONE } from "@/lib/i18n";
import { getListingModeForPage } from "@/components/scoring/websiteOnlyGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { getPlan } from "@/lib/premium";
import { rescanGate } from "@/lib/rescanPolicy";
import { lastOwnerRescanAt } from "@/lib/placesSearchBudget.server";
import { Card } from "@/components/ui/Card";
import { scoreBusinessById, getScoreHistory, getRecentScoreSnapshots, syncScoreSnapshot } from "@/app/actions/scoring";
import { GoogleConnectedNote, GoogleDisconnectedBanner } from "@/components/gbp/GoogleConnectionNotices";
import { connectedScoreChange } from "@/lib/gbpConnectedNote";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getLocalBenchmark } from "@/app/actions/competitors";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { getCustomerDetailsUndo } from "@/app/actions/gbpCustomerDetails";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { googleWritesPageState } from "@/app/actions/gbpWebsiteLink";
import { getWebsiteLinkUndoForPage } from "@/app/actions/gbpWebsiteLink";
import { shownWebsite } from "@/lib/businessWebsite";
import { isPremiumPlan } from "@/lib/plan";
import { mismatchedFields } from "@/lib/actionPlan";
import { NEW_PAGES_LIVE } from "@/lib/routes";
import { resolveBizProfile } from "@/config/bizProfiles";
import { viewLocale } from "@/lib/viewLocale.server";
import { BusinessScoreView } from "./BusinessScoreView";
import { featureMapFor } from "@/lib/postaiFeatureMap";
import { postaiPageQuestions } from "@/lib/postaiDock";
import { scoringNoteApplies, SCORING_NOTE_KEY } from "@/lib/scoringUpdateNote";
import { getUiPreference } from "@/app/actions/uiPreferences";
import { isBusinessArchived } from "@/lib/businessArchive.server";
import { oneTimeNoteDismissed } from "@/app/actions/oneTimeNotes";
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
import { gbpReplyCheckState } from "@/lib/gbpReplyCheck";
import { isMonthlyReportsLive } from "@/lib/monthlyReportsFeatureFlag";
import { isFoodBusiness } from "@/lib/serviceOptions";
import { readServiceOptions } from "@/lib/serviceOptions.server";

export default async function BusinessPage({ params, searchParams = {} }: { params: { id: string }; searchParams?: { gbp?: string } }) {
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

  const locale = viewLocale(summary.business.language);
  const profile = resolveBizProfile(
    summary.business.category,
    summary.business.primary_type,
    summary.business.business_type_override,
    locale,
    summary.business.categories,
    summary.business.name,
    summary.business.biz_type_resolved
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

  // One score everywhere: the ring scores the saved data live, so if that
  // changed since the last snapshot (Google, an owner answer), save one
  // first — the ring, "Since last scan" and its card then agree.
  await syncScoreSnapshot(params.id);

  const [history, recentSnapshots, benchmark, gbpStatus, actionPlan, niche, upgrade, lastOwnerRescan, replyDrafts, freePostai] = await Promise.all([
    getScoreHistory(params.id),
    getRecentScoreSnapshots(params.id, 2),
    getLocalBenchmark(params.id),
    getGbpConnectionStatus(params.id),
    // The same plan the Growth page shows — Top recommendations are its
    // biggest open items.
    getActionPlan(params.id, businessRowToScoringInput(scored.scoringBusiness ?? scored.business), scored.result.breakdown, scored.result.suggestions, locale, {
      businessRow: scored.scoringBusiness ?? scored.business,
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

  // The Google Profile tab's section 4, from the same reads (connected only).
  const overviewListing = async () =>
    gbpStatus.status === "ok" && gbpStatus.connected
      ? await loadOverviewListing(createClient(), params.id, {
          business: scored.business,
          checks: scored.result.breakdown.checks,
          connected: true,
          practice: false,
          timeZone: scored.business.time_zone ?? DEFAULT_BUSINESS_TIMEZONE,
          replyCounts: gbpStatus.replyCounts,
          lastScanAt: history[0]?.created_at ?? null,
        }).catch(() => null)
      : null;
  // Free's compact listing row: the same rows the Google listing page builds from the scan.
  const freeListingInput = () => {
    const row = scored.business;
    return {
      businessId: params.id,
      checks: scored.result.breakdown.checks,
      phone: row.phone,
      website: row.website,
      category: row.category,
      openingHours: row.opening_hours ?? null,
      photoCount: row.photo_count,
      rating: row.rating,
      reviewCount: row.review_count,
      messagingOn: null,
      replies: gbpStatus.status === "ok" && gbpStatus.replyCounts ? { replied: gbpStatus.replyCounts.replied, inWindow: gbpStatus.replyCounts.reviewsInWindow } : null,
      booking: null,
      media: null,
      extras: null,
    };
  };
  const linkOptions = { referralOk: profile.referralOk, couponsOk: profile.couponsOk, pricingOk: profile.pricingOk };
  // The scored hours check as it is now; waiting on Google → "Takes a few weeks".
  const hoursCheck = actionPlan.status === "ok" ? await loadHoursCheck(params.id, scored.scoringBusiness ?? scored.business, actionPlan.tasks).catch(() => null) : null;
  const recommendations =
    actionPlan.status === "ok" ? topRecommendations(withHoursWhen(actionPlan.tasks, hoursCheck), actionPlan.websiteBanner, params.id, linkOptions, Infinity, actionPlan.urgentIssues) : null;
  // The Website page's own fix count (same builder rule, same plan).
  const websiteAnalysis = parseWebsiteAnalysis(scored.business.website_analysis_json);
  const websiteChecks = scored.result.breakdown.categories.find((c) => c.id === "website")?.checks ?? [];
  const websitePlan = websiteFixPlan(websiteChecks, resolveWebsiteBuilder(websiteAnalysis?.builder, businessWebsiteUrl(scored.business))?.id ?? null);
  const websiteFixCount = websitePlan.fixes.length;
  // Guides on checks we couldn't score: "things to look at", never fixes.
  const websiteLookAtCount = websitePlan.lookAt.length;

  // Free: the page gets only what the Free Overview shows — the score
  // without any fix advice, no recommendations, and PostAI's starter
  // questions without the business context — so no real fix text is ever
  // in a Free page's HTML (lib/freeUpsell.ts).
  const free = upgrade.plan === "free";
  // The Free PostAI card's questions: the "Ask PostAI" panel's own
  // Overview questions (lib/postaiDock.ts), plan-aware.
  const freePostaiQuestions = free
    ? postaiPageQuestions(
        "overview",
        featureMapFor(upgrade.plan, { couponsOk: profile.couponsOk, referralOk: profile.referralOk, pricingOk: profile.pricingOk, hasWebsite: businessWebsiteUrl(scored.business) !== null, monthlyReportsLive: isMonthlyReportsLive() }),
        locale
      )
    : [];

  return (
    // Free: the combined upgrade card is the Overview's one upgrade prompt —
    // no Grow/Premium promo cards under it (they stay on Website and
    // Competitors, and on every page for Grow).
    <DashboardShell upgrade={free ? { ...upgrade, cards: [] } : upgrade} business={scored.business}>
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
      {gbpStatus.status === "ok" && gbpStatus.needsReconnect && (
        <div className="mb-6">
          <GoogleDisconnectedBanner businessId={params.id} premium={isPremiumPlan(upgrade.plan)} dataFrom={gbpStatus.dataFrom ?? null} />
        </div>
      )}
      {searchParams.gbp === "connected" && gbpStatus.status === "ok" && gbpStatus.connected && (
        <div className="mb-6">
          <GoogleConnectedNote {...connectedScoreChange(recentSnapshots, Date.now())} />
        </div>
      )}
      <GbpEditProvider
        value={{
          premium: isPremiumPlan(upgrade.plan),
          connected: gbpStatus.status === "ok" && gbpStatus.connected,
          undo: await getCustomerDetailsUndo(params.id),
          websiteUndo: await getWebsiteLinkUndoForPage(params.id),
          ...(await googleWritesPageState(params.id)),
          websiteSuggested: (() => {
            const shown = shownWebsite(scored.business);
            return shown.kind === "site" && shown.source !== "listing" ? shown.url : null;
          })(),
        }}
      >
      <BusinessScoreView
        businessId={params.id}
        business={scored.business}
        archived={await isBusinessArchived(createClient(), params.id)}
        // Food businesses: Google's service options, as information (no points).
        serviceOptions={isFoodBusiness(profile.id) ? await readServiceOptions(createClient(), params.id) : null}
        result={free ? withoutAdvice(scored.result) : scored.result}
        history={history}
        recentSnapshots={recentSnapshots}
        freePostaiQuestions={freePostaiQuestions}
        scoringNote={scoringNoteApplies(history) && !(await oneTimeNoteDismissed(params.id, SCORING_NOTE_KEY))}
        uiPrefs={{ breakdownCollapsed: await getUiPreference("overview.breakdownCollapsed.v2"), planListCollapsed: await getUiPreference("free.planListCollapsed") }}
        benchmark={benchmark}
        gbpConnected={gbpStatus.status === "ok" && gbpStatus.connected}
        profileTools={{ referralOk: profile.referralOk, couponsOk: profile.couponsOk, pricingOk: profile.pricingOk }}
        now={new Date().toISOString()}
        recommendations={free ? null : recommendations}
        someTakeMonths={actionPlan.status === "ok" && actionPlan.tasks.some((task) => task.when === "months")}
        websiteFixCount={websiteFixCount}
        websiteLookAtCount={websiteLookAtCount}
        linkOptions={linkOptions}
        plan={upgrade.plan}
        freeRescanNextAt={freeRescanNextAt}
        replyDrafts={replyDrafts}
        freePostai={freePostai}
        monthlyReportsLive={isMonthlyReportsLive()}
        hoursCheck={hoursCheck}
        detailsMismatch={await loadDetailsMismatches(createClient(), params.id, scored.scoringBusiness ?? scored.business).catch(() => null)}
        googleListing={
          !NEW_PAGES_LIVE && isPremiumPlan(upgrade.plan)
            ? {
                businessId: params.id,
                connected: gbpStatus.status === "ok" && gbpStatus.connected,
                canStart: canConnectGbp() && isGbpOAuthConfigured(),
                // Day 23B: the Google Profile tab's section 4, from the same reads.
                data: await overviewListing(),
              }
            : null
        }
        growthCount={NEW_PAGES_LIVE && upgrade.plan !== "free" ? await growthPlanCount(params.id, scored.business.time_zone ?? DEFAULT_BUSINESS_TIMEZONE).catch(() => null) : null}
        googleListingRow={
          // Day 25B step 4 (new-design preview): one compact row on every paid plan.
          NEW_PAGES_LIVE && upgrade.plan === "free"
            ? {
                // Free: the scan's counts + "Connect Google with Grow →" in place of the connection.
                businessId: params.id,
                connected: false,
                needsReconnect: false,
                canStart: false,
                free: true,
                hoursMismatch: mismatchedFields(businessRowToScoringInput(scored.scoringBusiness ?? scored.business)).includes("hours"),
                // Connected (a downgrade, or the dev plan switch): the same rows as the Google listing page.
                data: (await overviewListing()) ?? { input: freeListingInput(), saved: null, syncedAt: null },
              }
            : NEW_PAGES_LIVE
            ? {
                businessId: params.id,
                connected: gbpStatus.status === "ok" && gbpStatus.connected,
                needsReconnect: gbpStatus.status === "ok" && gbpStatus.needsReconnect === true,
                canStart: canConnectGbp() && isGbpOAuthConfigured(),
                // The same counts as the Google listing page header: a website hours mismatch is "to improve".
                hoursMismatch: mismatchedFields(businessRowToScoringInput(scored.scoringBusiness ?? scored.business)).includes("hours"),
                data: await overviewListing(),
              }
            : null
        }
        gbpReplyCheck={free ? gbpReplyCheckState(upgrade.plan, gbpStatus, searchParams.gbp, { name: scored.business.name ?? null, address: scored.business.address ?? null }) : null}
      />
      </GbpEditProvider>
    </DashboardShell>
  );
}

/** New design: how many tasks this week's Growth plan has (the Overview's Growth line). */
async function growthPlanCount(businessId: string, timeZone: string): Promise<number | null> {
  const [{ loadGoogleResults }, { tabIdeasFor, weekKinds }] = await Promise.all([import("@/lib/googlePages.server"), import("@/lib/tabIdeas")]);
  const data = await loadGoogleResults(businessId);
  return data.status === "ok" ? weekKinds(tabIdeasFor(data.props, timeZone, Date.now()).recs).length : null;
}
