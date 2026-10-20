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
import { NextRescanNote, RescanButton, RescanMessages, ScanFreshnessLine, useRescan } from "@/components/scoring/ScanStatusStrip";
import { StatTile } from "@/components/ui/StatTile";
import { LocalBenchmarkTile } from "@/components/dashboard/LocalBenchmarkTile";
import { ScoreBreakdownPanel } from "@/components/overview/ScoreBreakdownPanel";
import { TopRecommendations } from "@/components/overview/TopRecommendations";
import { StudioComingSoon } from "@/components/overview/StudioComingSoon";
import { reviewCountChange, type Recommendation } from "@/lib/overviewTiles";
import type { LinkOptions } from "@/lib/postaiLinks";
import type { AssistantBusinessContext } from "@/lib/assistant";
import type { GetLocalBenchmarkResult } from "@/app/actions/competitors";
import { LiveListingSection } from "@/components/gbp/LiveListingSection";
import { InfoTip } from "@/components/reports/ScoreHistoryChart";
import { FreePostAIPreview, FreeReviewFocus, HoldingBack, RankUnlockLine } from "@/components/overview/FreeOverview";
import type { Plan } from "@/lib/plan";



export type AssistantEmbedData =
  | {
      status: "ok";
      context: AssistantBusinessContext;
      starterPrompts: string[];
      conversationCount: number;
    }
  | { status: "unavailable"; message: string };

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
  /** The account's plan (lib/premium.ts). Free is an audit: next steps
   * become "What's holding your score back" (fixes are locked previews),
   * reviews lead, PostAI is a locked preview, 1 re-scan a month. Grow and
   * above see the Overview unchanged. */
  plan?: Plan;
  /** Free: when the month's free re-scan opens again (null = available). */
  freeRescanNextAt?: string | null;
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

  return (
    <div className="flex flex-col gap-5 nav:gap-6">
      {showHackedBanner && <HackedSiteBanner href={`/business/${businessId}/website#check-security`} />}

      {/* Name and address on top, as before; the listing's own photo when
          Google has one; freshness and Re-scan on the right. */}
      <div id="rescan" className="flex scroll-mt-20 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <ListingPhoto
          businessId={businessId}
          businessName={displayName}
          footer={<ScanFreshnessLine lastScanAt={lastScanAt} now={now} scoringVersion={breakdown.scoringVersion} />}
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">{displayName}</h1>
            <p className="text-sm text-ink-soft">{business.address ?? t(locale, "dashboard.overview.noAddressOnFile")}</p>
            {/* The Google listing at a glance (replaces the old "Business listing" card). */}
            <ListingChips business={business} now={now} />
          </div>
        </ListingPhoto>
        <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
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
          <NextRescanNote nextAt={rescan.nextAt} monthly={rescan.monthly} />
        </div>
      </div>

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
        <p className="px-1 text-[12px] text-ink-soft">{t(locale, "dashboard.rescan.updateOnlyOnRescan")}</p>
        <RescanMessages state={rescan.state} />
      </div>

      {free ? (
        <FreePostAIPreview starterPrompts={assistant.status === "ok" ? assistant.starterPrompts : []} />
      ) : assistant.status === "ok" ? (
        <AssistantLauncher
          businessId={businessId}
          businessName={business.name}
          context={assistant.context}
          starterPrompts={assistant.starterPrompts}
          conversationCount={assistant.conversationCount}
        />
      ) : (
        <Card className="p-5 text-sm text-ink-soft">
          {t(locale, "dashboard.overview.assistantUnavailablePrefix", { message: assistant.message })}
        </Card>
      )}

      {free ? (
        <FreeReviewFocus
          businessId={businessId}
          reviewCount={business.review_count}
          nearbyAverage={benchmark.status === "ok" ? benchmark.benchmark.competitorReviewAverage : null}
          competitorNoun={benchmark.status === "ok" ? benchmark.benchmark.competitorNoun : null}
        />
      ) : (
        <GrowMoreCustomers
          businessId={businessId}
          profileTools={profileTools}
          reviewCount={business.review_count}
          nearbyReviewAverage={benchmark.status === "ok" ? benchmark.benchmark.competitorReviewAverage : null}
        />
      )}

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
        {free && <RankUnlockLine />}
      </Card>

      <ScoreBreakdownPanel
        businessId={businessId}
        categories={breakdown.categories}
        hasWebsite={hasWebsite}
        scoreBasis={scoreBasis}
        linkOptions={linkOptions}
        websiteFixCount={websiteFixCount}
      />

      {/* Side by side at equal height (each card centers its own content
          if shorter); stacked on mobile. PostStudio gets its own row. */}
      <div className="grid grid-cols-1 gap-4 nav:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {free ? (
          <HoldingBack suggestions={result.suggestions} checks={breakdown.checks} />
        ) : (
          <TopRecommendations businessId={businessId} recommendations={recommendations} />
        )}
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
