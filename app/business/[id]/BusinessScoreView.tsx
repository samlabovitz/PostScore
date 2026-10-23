"use client";

import { useState } from "react";
import { IconChevronDown, IconExternalLink } from "@tabler/icons-react";
import type { ProfileTools } from "@/lib/growBannerTools";
import { GrowMoreCustomers } from "@/components/overview/GrowMoreCustomers";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { HackedSiteBanner } from "@/components/scoring/HackedSiteBanner";
import { hackSignsFor } from "@/lib/siteSecurity";
import { businessWebsiteUrl } from "@/lib/businessWebsite";
import { cn } from "@/lib/utils";
import type { BusinessRecord, ScoreHistoryRow, ScoreSnapshot } from "@/app/actions/scoring";
import { formatCount, formatDateTime, t, useLocale, useTimeZone } from "@/lib/i18n";
import {
  parseWebsiteAnalysis,
  ratingBand,
  scoreBasisPoints,
  type ScoreWithSuggestions,
} from "@/lib/scoring";
import { AssistantLauncher } from "@/components/assistant/AssistantLauncher";
import { ScoreBand } from "@/components/overview/ScoreBand";
import { ListingPhoto } from "@/components/overview/ListingPhoto";
import { ListingChips } from "@/components/overview/ListingChips";
import { SinceLastScanCard } from "@/components/overview/SinceLastScanCard";
import { NextRescanNote, RescanCompetitorsNote, RescanButton, RescanMessages, ScanFreshnessLine, SnapshotNotice, useRescan } from "@/components/scoring/ScanStatusStrip";
import { StatTile } from "@/components/ui/StatTile";
import { LocalBenchmarkTile } from "@/components/dashboard/LocalBenchmarkTile";
import { GoogleMapsAttribution } from "@/components/google/GoogleMapsAttribution";
import { ScoreBreakdownPanel } from "@/components/overview/ScoreBreakdownPanel";
import { TopRecommendations } from "@/components/overview/TopRecommendations";
import { StudioComingSoon } from "@/components/overview/StudioComingSoon";
import { reviewCountChange, type Recommendation } from "@/lib/overviewTiles";
import type { LinkOptions } from "@/lib/postaiLinks";
import type { AssistantBusinessContext } from "@/lib/assistant";
import type { GetLocalBenchmarkResult } from "@/app/actions/competitors";
import { LiveListingSection } from "@/components/gbp/LiveListingSection";
import { InfoTip } from "@/components/reports/ScoreHistoryChart";
import { FreeReviews, FreeSection, RankUnlockLine } from "@/components/overview/FreeOverview";
import { FixPlanBox } from "@/components/overview/FixPlanUpsell";
import { FreePostAI } from "@/components/overview/FreePostAI";
import { freeWaitingPoints } from "@/lib/freeUpsell";
import { freeSection } from "@/lib/freeOverviewSections";
import type { FreeAiAllowance } from "@/lib/freeAiAllowance";
import { ReviewReplyDrafter } from "@/components/reviews/ReviewReplyDrafter";
import { GbpReplyCheckConnect, type GbpReplyCheckState } from "@/components/gbp/GbpReplyCheckConnect";
import type { ReplyDraftStatus } from "@/app/actions/reviewReplies";
import type { Plan } from "@/lib/plan";



export type AssistantEmbedData =
  | {
      status: "ok";
      context: AssistantBusinessContext;
      starterPrompts: string[];
      conversationCount: number;
      /** Grow: PostAI questions left this month. */
      monthly?: { left: number; total: number; resetsAt: string } | null;
    }
  | { status: "unavailable"; message: string }
  /** Free: only the showroom's starter prompts — no business context
   * (it carries fix details) ever reaches a Free page. */
  | { status: "showroom"; starterPrompts: string[] };

export function BusinessScoreView({
  businessId,
  business,
  result,
  history,
  recentSnapshots,
  assistant,
  benchmark,
  gbpConnected,
  profileTools,
  now,
  recommendations,
  websiteFixCount,
  linkOptions,
  plan = "grow",
  freeRescanNextAt = null,
  replyDrafts = null,
  freePostai = null,
  gbpReplyCheck = null,
}: {
  businessId: string;
  business: BusinessRecord;
  result: ScoreWithSuggestions;
  history: ScoreHistoryRow[];
  recentSnapshots: ScoreSnapshot[];
  assistant: AssistantEmbedData;
  benchmark: GetLocalBenchmarkResult;
  gbpConnected: boolean;
  /** BizProfile.referralOk/couponsOk/pricingOk (config/bizProfiles.ts) —
   * the same flags that hide the Growth page's Refer a friend / Coupons
   * tabs and the price check. Passed through to the growth strip so it
   * never links to a tool that isn't there for this business (lawyer:
   * no referrals; place of worship: none of the three). */
  profileTools: ProfileTools;
  /** The server's "now" (ISO) — freshness and re-scan availability are
   * worked out from it so server and browser agree. */
  now: string;
  /** The action plan's biggest open items (lib/overviewTiles.ts), or
   * null when the plan couldn't be loaded. */
  recommendations: Recommendation[] | null;
  /** The Website page's own fix count (lib/websiteFixes.ts). */
  websiteFixCount: number;
  linkOptions: LinkOptions;
  /** The account's plan (lib/premium.ts). Free gets its own layout (the
   * audit — see FreeOverviewLayout below); Grow and above see the Overview
   * unchanged. */
  plan?: Plan;
  /** Free: when the month's free re-scan opens again (null = available). */
  freeRescanNextAt?: string | null;
  /** Free: the AI review reply drafts left (the reviews section's drafter). */
  replyDrafts?: ReplyDraftStatus | null;
  /** Free: PostAI questions left this week (DB only — no AI call). */
  freePostai?: FreeAiAllowance | null;
  /** Free: connect Google for the "Replying to reviews" check (null = hidden). */
  gbpReplyCheck?: GbpReplyCheckState | null;
}) {
  const locale = useLocale();
  const { breakdown, projectedBreakdown } = result;
  // Real stored spam findings only — see hackSignsFor (lib/siteSecurity.ts).
  const showHackedBanner =
    hackSignsFor(
      breakdown.checks.find((c) => c.id === "website.security"),
      parseWebsiteAnalysis(business.website_analysis_json)
    ).length > 0;

  // The last FULL scan: a website-only re-check refreshes the website
  // part only, so it neither uses up the daily re-scan nor makes the
  // Google listing data look fresh.
  const lastScanAt = history.find((h) => h.scan_kind !== "website_recheck")?.created_at ?? null;
  const hasWebsite = businessWebsiteUrl(business) !== null;
  const liveSiteUrl = businessWebsiteUrl(business);
  const scoreBasis = scoreBasisPoints(breakdown.categories);
  const free = plan === "free";
  const rescan = useRescan(businessId, lastScanAt, now, free ? freeRescanNextAt : null);
  const displayName = business.name ?? t(locale, "dashboard.overview.untitledBusiness");

  const header = (
    <>
    {/* Name and address on top, as before; the listing's own photo when
        Google has one; freshness and Re-scan on the right. */}
    <div id="rescan" className="scroll-mt-20">
      <ListingPhoto
        businessId={businessId}
        businessName={displayName}
        footer={<ScanFreshnessLine lastScanAt={lastScanAt} now={now} scoringVersion={breakdown.scoringVersion} />}
        // The Google listing at a glance, on its own full-width row: one
        // line on a desktop (replaces the old "Business listing" card).
        chips={<ListingChips business={business} now={now} />}
        // The score is a snapshot: re-scan to update it (replaces the old
        // grey line under the score card).
        note={<SnapshotNotice businessId={businessId} lastScanAt={lastScanAt} now={now} nextAt={rescan.nextAt} free={free} />}
        aside={
          <>
            <div className="flex flex-wrap items-center gap-2">
              {liveSiteUrl && (
                <a
                  href={liveSiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-paper-deep bg-white px-[13px] py-[7px] text-[13px] font-semibold text-ink transition-colors hover:border-ink-soft"
                >
                  <IconExternalLink size={14} />
                  {t(locale, "dashboard.overview.header.viewLiveSite")}
                </a>
              )}
              <RescanButton state={rescan.state} nextAt={rescan.nextAt} onClick={rescan.run} />
            </div>
            <NextRescanNote nextAt={rescan.nextAt} weekly={rescan.weekly} />
            <RescanCompetitorsNote businessId={businessId} plan={plan} latestCompetitorScanAt={benchmark.status === "ok" ? benchmark.benchmark.scanAt : null} now={now} />
          </>
        }
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">{displayName}</h1>
          <p className="text-sm text-ink-soft">{business.address ?? t(locale, "dashboard.overview.noAddressOnFile")}</p>
        </div>
      </ListingPhoto>
    </div>
    </>
  );

  // The shared review goal (beat the leader), same scope as the rank.
  const reviewGoal = benchmark.status === "ok" ? benchmark.benchmark.reviewGoal : null;
  const reviewGroup = benchmark.status === "ok" ? benchmark.benchmark.reviewGroup : null;

  // Free = the audit, in four headed sections, in this order: A. Your
  // score (score card, re-scan message); C. What's behind your score (the
  // breakdown, checks behind a gold "See all N checks"; the competitor
  // rank); D. Free tools (Reviews; PostAI, 3 questions a week); B. Earn
  // more points and more customers, last (one card: the plans + the
  // locked More customers tiles; then "See everything in each plan").
  // The shell adds the Grow + Premium cards after.
  if (free) {
    // Every point the score is missing (100 − score): the step-by-step
    // plan on Grow and Premium covers each one.
    const waiting = freeWaitingPoints(breakdown.total);
    return (
      <div data-testid="free-overview" className="flex flex-col gap-5 nav:gap-6">
        {showHackedBanner && <HackedSiteBanner href={`/business/${businessId}/website#check-security`} />}

        {header}

        {/* A. Your score: the score card and the re-scan message. */}
        <FreeSection id="score" title={t(locale, freeSection("score").titleKey)} body={t(locale, freeSection("score").bodyKey)}>
          <ScoreBand
            businessId={businessId}
            score={breakdown.total}
            grade={breakdown.grade}
            history={history}
            projectedScore={projectedBreakdown.total}
            projectedGrade={projectedBreakdown.grade}
            biggestBoost={null}
            freeWaitingPoints={waiting > 0 ? waiting : 0}
          />
          <RescanMessages state={rescan.state} />
        </FreeSection>

        {/* C. What's behind the score: the breakdown (collapsed), then the
            competitor rank. */}
        <FreeSection id="behind" title={t(locale, freeSection("behind").titleKey)} body={t(locale, freeSection("behind").bodyKey)}>
          <ScoreBreakdownPanel businessId={businessId} categories={breakdown.categories} hasWebsite={hasWebsite} scoreBasis={scoreBasis} audit websiteFixCount={null} lastScanAt={lastScanAt} />
          <Card className="p-5" data-testid="free-rank">
            <h3 className="mb-3 font-serif text-[15px] font-semibold text-ink">{t(locale, "dashboard.free.rankHeading")}</h3>
            <LocalBenchmarkTile businessId={businessId} result={benchmark} />
            <RankUnlockLine />
            <GoogleMapsAttribution />
          </Card>
        </FreeSection>

        {/* D. Free tools: Reviews (link, QR, reply drafts), then PostAI —
            3 free questions a week. */}
        <FreeSection id="tools" title={t(locale, freeSection("tools").titleKey)} body={t(locale, freeSection("tools").bodyKey)}>
          <FreeReviews placeId={business.place_id ?? null} rating={business.rating} reviewCount={business.review_count} goal={reviewGoal} group={reviewGroup}>
            {replyDrafts && <ReviewReplyDrafter businessId={businessId} plan="free" placeId={business.place_id ?? null} initial={replyDrafts} embedded />}
            {gbpReplyCheck && <GbpReplyCheckConnect businessId={businessId} state={gbpReplyCheck} />}
          </FreeReviews>
          {freePostai && <FreePostAI businessId={businessId} starterPrompts={assistant.status === "unavailable" ? [] : assistant.starterPrompts} initial={freePostai} />}
        </FreeSection>
        {/* B. Earn more, last: ONE card (the plans, then the More
            customers tiles, then the collapsed "See everything in each
            plan") — every "How to fix this" row and "See how to fix it"
            scrolls down to it. */}
        <FreeSection id="earn" title={t(locale, freeSection("earn").titleKey)} body={t(locale, freeSection("earn").bodyKey)}>
          <FixPlanBox businessId={businessId} extras={{ hasWebsite, pricingOk: profileTools.pricingOk, campaignsOk: profileTools.couponsOk || profileTools.referralOk }}>
            <GrowMoreCustomers
              businessId={businessId}
              profileTools={profileTools}
              reviewCount={business.review_count}
              nearbyReviewAverage={benchmark.status === "ok" ? benchmark.benchmark.competitorReviewAverage : null}
              goal={reviewGoal}
              group={reviewGroup}
              locked
              embedded
            />
          </FixPlanBox>
        </FreeSection>

      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 nav:gap-6">
      {showHackedBanner && <HackedSiteBanner href={`/business/${businessId}/website#check-security`} />}

      {header}

      <div className="flex flex-col gap-2">
        <ScoreBand
          businessId={businessId}
          score={breakdown.total}
          grade={breakdown.grade}
          history={history}
          projectedScore={projectedBreakdown.total}
          projectedGrade={projectedBreakdown.grade}
          // The single biggest real gain available right now
          // (generateSuggestions order) — never a decorative number.
          biggestBoost={result.suggestions[0] ?? null}
        />
        <RescanMessages state={rescan.state} />
      </div>

      {assistant.status === "ok" ? (
        <AssistantLauncher
          businessId={businessId}
          businessName={business.name}
          context={assistant.context}
          starterPrompts={assistant.starterPrompts}
          conversationCount={assistant.conversationCount}
          monthly={assistant.monthly ?? null}
        />
      ) : (
        <Card className="p-5 text-sm text-ink-soft">
          {t(locale, "dashboard.overview.assistantUnavailablePrefix", { message: assistant.status === "unavailable" ? assistant.message : "" })}
        </Card>
      )}

      <GrowMoreCustomers
        businessId={businessId}
        profileTools={profileTools}
        reviewCount={business.review_count}
        nearbyReviewAverage={benchmark.status === "ok" ? benchmark.benchmark.competitorReviewAverage : null}
        goal={reviewGoal}
        group={reviewGroup}
      />

      <SectionHeading title={t(locale, "dashboard.overview.atAGlanceHeading")} />
      <Card className="p-5">
        <div className="grid grid-cols-2 gap-6 sm:w-fit sm:grid-cols-3 sm:gap-10">
          <div className="flex flex-col gap-1.5">
            <StatTile
              label={t(locale, "dashboard.overview.googleRatingLabel")}
              value={business.rating === null ? "—" : `${business.rating.toFixed(1)} ★`}
            />
            {business.rating !== null && <RatingBandTag rating={business.rating} />}
          </div>
          <div className="flex flex-col gap-1.5">
            <StatTile
              label={t(locale, "dashboard.overview.googleReviewsLabel")}
              value={business.review_count === null ? "—" : formatCount(business.review_count, locale)}
            />
            <ReviewChangeLine change={reviewCountChange(recentSnapshots)} />
          </div>
          <LocalBenchmarkTile businessId={businessId} result={benchmark} />
        </div>
        <GoogleMapsAttribution />
      </Card>

      <ScoreBreakdownPanel
        businessId={businessId}
        categories={breakdown.categories}
        hasWebsite={hasWebsite}
        scoreBasis={scoreBasis}
        linkOptions={linkOptions}
        websiteFixCount={websiteFixCount}
        lastScanAt={lastScanAt}
      />

      {/* Side by side at equal height (each card centers its own content
          if shorter); stacked on mobile. PostStudio gets its own row. */}
      <div className="grid grid-cols-1 gap-4 nav:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <TopRecommendations businessId={businessId} recommendations={recommendations} />
        <SinceLastScanCard businessId={businessId} snapshots={recentSnapshots} liveBreakdown={breakdown} />
      </div>
      <StudioComingSoon businessId={businessId} />

      <SectionHeading title={t(locale, "dashboard.overview.liveListingHeading")} />
      <LiveListingSection businessId={businessId} connected={gbpConnected} />

      <SectionHeading title={t(locale, "dashboard.overview.scanHistoryHeading")} />
      <ScanHistory history={history} />
    </div>
  );
}

/** The rating's own word (lib/scoring.ts ratingBand): Excellent / Good /
 * Needs work — navy text with a status dot, so it reads at any size. */
function RatingBandTag({ rating }: { rating: number }) {
  const locale = useLocale();
  const band = ratingBand(rating);
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-paper px-2 py-0.5 text-[12px] font-semibold text-ink">
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", band === "low" ? "bg-amber" : "bg-green")} />
      {t(locale, band === "excellent" ? "dashboard.checkResult.excellent" : band === "good" ? "dashboard.checkResult.good" : "dashboard.checkResult.needsWork")}
    </span>
  );
}

/** New reviews between the last two scans — only when both recorded a count. */
function ReviewChangeLine({ change }: { change: number | null }) {
  const locale = useLocale();
  if (change === null) return null;
  return (
    <span className="text-[12.5px] text-ink-soft">
      {change === 0
        ? t(locale, "dashboard.overview.tiles.noNewReviews")
        : t(locale, "dashboard.overview.tiles.reviewsSinceLastScan", { delta: change > 0 ? `+${change}` : `−${Math.abs(change)}` })}
    </span>
  );
}

/** Saved scans, newest first: the latest two inline, the rest one tap away. */
function ScanHistory({ history }: { history: ScoreHistoryRow[] }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [showAll, setShowAll] = useState(false);
  if (history.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm text-ink-soft">
          {t(locale, "dashboard.overview.noSavedScans", { rescanNow: t(locale, "dashboard.overview.rescanNow") })}
        </p>
      </Card>
    );
  }
  const rows = showAll ? history : history.slice(0, 2);
  return (
    <Card className="p-5">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-mute">
            <th className="pb-2 font-medium">{t(locale, "dashboard.overview.dateColumn")}</th>
            <th className="pb-2 font-medium">{t(locale, "dashboard.overview.scoreColumn")}</th>
            <th className="pb-2 font-medium">{t(locale, "dashboard.overview.gradeColumn")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            // The scoring version is internal: no column, just a tag on
            // the scan where it changed, with the version in its tooltip.
            const older = history[i + 1];
            const scoringUpdated = !!older && older.scoring_version !== row.scoring_version;
            return (
              <tr key={row.id} className="border-t border-paper-line align-top">
                <td className="py-2 pr-2 text-ink">
                  <div>{formatDateTime(row.created_at, locale, timeZone)}</div>
                  {scoringUpdated && (
                    <span className="mt-1 inline-flex items-center gap-0.5 rounded-md bg-paper px-1.5 py-0.5 text-[11px] text-ink-soft">
                      {t(locale, "dashboard.reports.chartScoringUpdated")}
                      <InfoTip text={t(locale, "dashboard.overview.scoringUpdatedVersionTip", { version: row.scoring_version })} />
                    </span>
                  )}
                </td>
                <td className="py-2 text-ink">{row.total}</td>
                <td className="py-2 text-ink">{row.grade}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {history.length > 2 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink hover:text-brass"
        >
          {showAll ? t(locale, "dashboard.overview.showFewerScans") : t(locale, "dashboard.overview.showAllScans", { count: history.length })}
          <IconChevronDown size={14} className={cn("transition-transform", showAll && "rotate-180")} />
        </button>
      )}
    </Card>
  );
}
