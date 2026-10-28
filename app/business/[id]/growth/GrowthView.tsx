"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { IconArrowLeft, IconBrandGoogle, IconLock, IconWorld } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/SegmentedControl";
import { TaskListCard, GrowthMoveCard, CompletedTasksCard, ReviewGoalLinesContext, type WebsiteRecheckProps } from "../ActionPlanSection";
import { WeeklyChecklist } from "./WeeklyChecklist";
import { WeeklyGoalCelebration } from "./WeeklyGoalCelebration";
import { WeeklyPlanCelebration } from "./WeeklyPlanCelebration";
import { FreeGrowthMoves, FreeGrowthPlan } from "./FreeGrowthPlan";
import { CONNECT_GOOGLE_STEP_ID, type ActionPlanTask, type CompletedTask, type WebsiteBanner } from "@/lib/actionPlan";
import { websiteRangeText, wholePointRange } from "@/lib/pointRange";
import type { GrowthMove } from "@/lib/growthMoves";
import { isPremiumPlan, type Plan } from "@/lib/plan";
import { type GoogleProfileConnection, GoogleProfilePanel, type GoogleListingFacts } from "@/components/gbp/GoogleProfilePanel";
import type { SearchDemandView } from "@/components/gbp/SearchDemandSection";
import { growthMoveOverlapsActionPlan } from "@/lib/growthMoveOverlap";
import type { WeeklyChecklistItem, WeeklyChecklistItemId } from "@/lib/weeklyChecklist";
import type { ScoreBreakdown } from "@/lib/scoring";
import type { BizProfile } from "@/config/bizProfiles";
import { t, tPlural, useLocale, type Locale } from "@/lib/i18n";
import { useScrollToHash } from "@/lib/useScrollToHash";
import { LINK_PILL_CLASS } from "@/components/ui/linkPill";
import type { LinkOptions } from "@/lib/postaiLinks";
import { cn } from "@/lib/utils";

type Segment = "plan" | "google-profile";

/** "an" before a vowel-sounding grade letter (A, E, F), "a" before every
 * other grade (B, C, D) — English article agreement, not a scoring
 * concept, so it lives here rather than as a lookup table anyone would
 * mistake for grade data. */
export function gradeArticle(grade: string): string {
  return ["A", "E", "F"].includes(grade) ? "an" : "a";
}

/** Honest grade-change copy: only claims a letter change when the real
 * projected grade actually differs from today's — otherwise it says so
 * plainly rather than implying movement that isn't there. */
export function gradeTransitionLabel(from: string, to: string, locale: Locale): string {
  return from === to
    ? t(locale, "dashboard.growth.view.gradeStays", { article: gradeArticle(to), grade: to })
    : t(locale, "dashboard.growth.view.gradeChangeArrow", { from, to });
}

/** The Growth page's ONE website element besides the Google-mismatch
 * card (Step 2f): every other website fix lives on the Website page,
 * summarized here with real live numbers — or, with no website at all,
 * the starter-site offer with its honest points range. */
export function WebsiteBannerCard({ banner, businessId }: { banner: WebsiteBanner; businessId: string }) {
  const locale = useLocale();
  const href = `/business/${businessId}/website`;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
          <IconWorld size={17} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          {banner.kind === "improve" ? (
            <p className="text-[13.5px] text-ink">
              {tPlural(locale, "dashboard.growth.websiteBanner.improve", banner.improvements, {
                score: banner.score,
                points: wholePointRange(banner.points, null).low,
              })}
            </p>
          ) : (
            <>
              <p className="text-[13.5px] font-semibold text-ink">{t(locale, "dashboard.growth.websiteBanner.getWebsite.title")}</p>
              <p className="text-[13px] text-ink-soft">{websiteRangeText(locale, banner.low, banner.high)}</p>
            </>
          )}
        </div>
      </div>
      <Link href={href} className={cn(LINK_PILL_CLASS, "shrink-0")}>
        {banner.kind === "improve"
          ? t(locale, "dashboard.growth.websiteBanner.openWebsitePage")
          : t(locale, "dashboard.growth.websiteBanner.getWebsite.cta")}
      </Link>
    </div>
  );
}

/** "This week" at a glance: today's score → where the plan below gets it,
 * on a soft brass bar — light, like the Overview's score card. */
function ProjectedSummary({
  today,
  projected,
  projectedHigh,
  withinReach,
  gradeNote,
  note,
}: {
  today: number;
  projected: number;
  projectedHigh: number | null;
  withinReach: string;
  gradeNote: string;
  note: string;
}) {
  const locale = useLocale();
  const top = projectedHigh ?? projected;
  return (
    <section className="rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">{t(locale, "dashboard.growth.view.weeklyCardLabel")}</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-2 font-serif text-ink">
          <span className="text-[34px] font-semibold leading-none tabular-nums">{today}</span>
          <span aria-hidden className="text-[22px] text-brass">→</span>
          <span className="text-[34px] font-semibold leading-none tabular-nums">{projectedHigh !== null ? `${projected}–${projectedHigh}` : projected}</span>
          <span className="sr-only">{t(locale, "dashboard.growth.view.statProjected")}</span>
        </div>
        <div className="flex flex-col items-start gap-0.5 sm:items-end">
          <span className="text-[14px] font-semibold text-ink">{withinReach}</span>
          <span className="text-[12.5px] text-ink-soft">{gradeNote}</span>
        </div>
      </div>
      {/* Today (solid) and this week's reach (soft) on a 0–100 bar. */}
      <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-paper-deep" role="img" aria-label={`${today} → ${top}`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-[color:color-mix(in_srgb,var(--color-brass)_35%,white)]" style={{ width: `${Math.min(100, top)}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-brass" style={{ width: `${Math.min(100, today)}%` }} />
      </div>
      <p className="mt-3 text-[12px] text-ink-mute">{note}</p>
    </section>
  );
}

/** Connecting Google is a PostScore Premium feature — a small card, never
 * one of the week's tasks. Links to the (read-only for now) Connect page. */
function PremiumConnectCard({ businessId, premium }: { businessId: string; premium: boolean }) {
  const locale = useLocale();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-paper-deep bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
          <IconBrandGoogle size={16} />
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13.5px] font-semibold text-ink">{t(locale, "dashboard.growth.premiumConnect.title")}</span>
          <span className="rounded-full bg-ink px-2 py-px text-[10.5px] font-semibold text-paper">{t(locale, "dashboard.overview.connectPremiumPill")}</span>
        </div>
      </div>
      {/* Free and Grow are never sent to the Premium connect page. */}
      <Link href={premium ? `/business/${businessId}/connect-gbp` : `/business/${businessId}/settings#compare-plans`} className={LINK_PILL_CLASS}>
        {t(locale, "dashboard.overview.seeWhatsIncluded")}
      </Link>
    </div>
  );
}

/** ?tab=google-profile opens the Google Profile tab; anything else is
 * the plan. (Coupons and referrals moved to the Campaigns page — the
 * Growth page redirects their old ?tab= links there.) */
export function segmentFromParam(param: string | null): Segment {
  return param === "google-profile" ? "google-profile" : "plan";
}

export function GrowthView({
  reviewGoalLines = [],
  businessId,
  businessName,
  breakdown,
  actionPlan,
  growthMoves,
  weeklyChecklist,
  googleProfile,
  lastScanAt,
  websiteRecheck = null,
  gbpConnected = false,
  linkOptions = {},
  plan = "free",
}: {
  businessId: string;
  businessName: string | null;
  profile: BizProfile;
  breakdown: ScoreBreakdown;
  /** The Google Profile tab's real data (see GoogleProfilePanel). */
  googleProfile: {
    listing: GoogleListingFacts | null;
    websiteOnly: boolean;
    connected: boolean;
    searchDemand: SearchDemandView;
    connection?: GoogleProfileConnection | null;
  };
  /** When this business was last re-scanned — see getLastScanAt() in
   * app/actions/scoring.ts. Lets a still-pending task tell "hasn't been
   * re-checked yet" apart from "checked, no real change" (see
   * pendingCheckStatus in lib/actionPlan.ts). */
  lastScanAt: string | null;
  /** Website re-checks left today ("Re-check my website" on website tasks). */
  websiteRecheck?: WebsiteRecheckProps | null;
  /** Connecting Google is Premium-only — when not connected, a small
   * "Unlock live Google insights" card (never one of the plan's tasks). */
  /** The account's plan (lib/premium.ts) — the Google Profile tab is
   * Premium (Free/Grow see a preview with a lock on the tab). */
  plan?: Plan;
  /** Show the dev-only plan switch (the page passes true only in local dev). */
  devPlanSwitch?: boolean;
  gbpConnected?: boolean;
  /** Which tools this business has — for each task's fix link. */
  linkOptions?: LinkOptions;
  actionPlan: {
    tasks: ActionPlanTask[];
    completed: CompletedTask[];
    weeklyTasks: ActionPlanTask[];
    laterTasks: ActionPlanTask[];
    weeklyProjectedBreakdown: ScoreBreakdown;
    /** Set only when a weekly task is itself a range (currently only
     * the no-website starter-site card) — see WeeklyPlan's own doc. */
    weeklyProjectedBreakdownHigh: ScoreBreakdown | null;
    /** Exactly the sum of the weekly cards' points — see
     * WeeklyPlan.weeklyPointsWithinReach. */
    weeklyPointsWithinReach: number;
    /** The one website summary in "Bigger projects" — see
     * buildWebsiteBanner (lib/actionPlan.ts). */
    websiteBanner: WebsiteBanner | null;
    error?: string;
  };
  /** Every growth move currently firing for this business — real,
   * honest customer-getting actions with no scoring gap behind them.
   * See lib/growthMoves.ts. Rendered in its own "Ways to bring in more
   * customers" section below, entirely separate from the score-based
   * action plan. */
  growthMoves: GrowthMove[];
  /** "Your weekly routine" checklist state — see lib/weeklyChecklist.ts.
   * Rendered above the growth moves section, entirely separate from
   * both the score-based action plan and growth moves: these five
   * items never earn points and are never counted in any projected
   * score. */
  weeklyChecklist: {
    items: WeeklyChecklistItem[];
    checkedItemIds: WeeklyChecklistItemId[];
    streakWeeks: number;
    /** This routine week's Monday (business time zone). */
    weekStart: string;
  };
  /** The shared review goal in words (lib/reviewGoal.ts) for the review task. */
  reviewGoalLines?: string[];
}) {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  // A link straight to this page's own #weekly-routine/#ways-to-grow
  // anchors (e.g. the Overview page's growth strip) needs this: Next's
  // own scroll-to-hash can land before this client component has
  // rendered the section, so the browser's native jump finds nothing.
  useScrollToHash();
  // The tab is in the URL (?tab=google-profile) so links and
  // back/forward land on it.
  const segment = segmentFromParam(searchParams.get("tab"));
  // Free is an audit: the plan tab shows locked previews (FreeGrowthPlan).
  const free = plan === "free";

  function setSegment(next: Segment) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "plan") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const query = params.toString();
    router.push(`/business/${businessId}/growth${query ? `?${query}` : ""}`, { scroll: false });
  }

  const { weeklyProjectedBreakdown, weeklyProjectedBreakdownHigh } = actionPlan;
  const pointsWithinReachLow = actionPlan.weeklyPointsWithinReach;
  const pointsWithinReachHigh = weeklyProjectedBreakdownHigh
    ? weeklyProjectedBreakdownHigh.total - breakdown.total
    : null;
  // Whenever no quick score task qualified and nothing longer_term had
  // an honest weekly first step either, buildWeeklyPlan leaves the week
  // truly empty — the only time that happens for a business with real
  // remaining gaps is when there simply aren't any left to show.
  const hasNoRemainingScoreGaps = actionPlan.tasks.length === 0 && actionPlan.websiteBanner === null;
  // Every real open score-gap task on this page, "This week's plan" and
  // "Bigger projects" together — the live source of truth a growth
  // move's badge checks itself against (see growthMoveOverlapsActionPlan
  // in lib/growthMoveOverlap.ts), never a separate/stale copy.
  const openActionPlanTasks = [...actionPlan.weeklyTasks, ...actionPlan.laterTasks];
  // Whole points only: "+2 within reach this week".
  const reach = wholePointRange(Math.max(0, pointsWithinReachLow), pointsWithinReachHigh !== null ? Math.max(0, pointsWithinReachHigh) : null);
  const withinReachText =
    pointsWithinReachLow <= 0 && pointsWithinReachHigh === null
      ? t(locale, "dashboard.growth.view.nothingWithinReach")
      : reach.high !== null
        ? t(locale, "dashboard.growth.view.withinReachRange", { low: reach.low, high: reach.high })
        : t(locale, "dashboard.growth.view.withinReach", { points: reach.low });

  const options: SegmentedControlOption<Segment>[] = [
    { value: "plan", label: t(locale, "dashboard.growth.view.tabPlan") },
    {
      value: "google-profile",
      label: t(locale, "dashboard.growth.view.tabGoogleProfile"),
      // Premium feature: a lock on the tab for Free and Grow.
      icon: isPremiumPlan(plan) ? undefined : <IconLock size={13} aria-label={t(locale, "dashboard.googleProfile.needsPremium")} />,
    },
  ];

  return (
    <ReviewGoalLinesContext.Provider value={reviewGoalLines}>
      <div className="flex flex-col gap-6 nav:gap-8">
        <div>
          <Link
            href={`/business/${businessId}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
          >
            <IconArrowLeft size={15} />
            {t(locale, "dashboard.growth.view.backTo", {
              name: businessName ?? t(locale, "dashboard.growth.view.businessFallback"),
            })}
          </Link>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">
            {t(locale, "dashboard.growth.view.title")}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">{t(locale, "dashboard.growth.view.subtitle")}</p>
        </div>

        <SegmentedControl options={options} value={segment} onChange={setSegment} />

        {segment === "plan" && (
          <div className="flex flex-col gap-6 nav:gap-8">
            {free ? (
              <>
                {/* Free: no weekly-goal tracking or celebrations; the plan,
                    routine and projects are locked previews (FreeGrowthPlan). */}
                <ProjectedSummary
                  today={breakdown.total}
                  projected={weeklyProjectedBreakdown.total}
                  projectedHigh={weeklyProjectedBreakdownHigh ? weeklyProjectedBreakdownHigh.total : null}
                  withinReach={withinReachText}
                  gradeNote={gradeTransitionLabel(breakdown.grade, weeklyProjectedBreakdown.grade, locale)}
                  note={
                    actionPlan.weeklyTasks.length > 0
                      ? tPlural(locale, "dashboard.growth.view.weeklyPlanNote", actionPlan.weeklyTasks.length)
                      : t(locale, "dashboard.growth.view.weeklyPlanNoteEmpty")
                  }
                />
                {actionPlan.error ? (
                  <Card className="p-5 text-sm text-red">{t(locale, "dashboard.growth.view.actionPlanErrorPrefix", { error: actionPlan.error })}</Card>
                ) : (
                  <FreeGrowthPlan
                    weeklyTasks={actionPlan.weeklyTasks}
                    laterTasks={actionPlan.laterTasks}
                    websiteBanner={actionPlan.websiteBanner}
                    routineItems={weeklyChecklist.items}
                    weeklyHeading={t(locale, "dashboard.growth.view.weeklyPlanHeading", { count: actionPlan.weeklyTasks.length })}
                    laterHeading={t(locale, "dashboard.growth.view.laterTasksHeading", { count: actionPlan.laterTasks.length })}
                  />
                )}
              </>
            ) : (
              <>
                <WeeklyPlanCelebration
                  businessId={businessId}
                  weekStart={weeklyChecklist.weekStart}
                  today={breakdown.total}
                  weeklyTasks={actionPlan.weeklyTasks}
                  completed={actionPlan.completed}
                  gbpConnected={gbpConnected}
                  lastScanAt={lastScanAt}
                />
                <WeeklyGoalCelebration
                  businessId={businessId}
                  weekStart={weeklyChecklist.weekStart}
                  today={breakdown.total}
                  projected={weeklyProjectedBreakdown.total}
                  lastScanAt={lastScanAt}
                >
                  <ProjectedSummary
                    today={breakdown.total}
                    projected={weeklyProjectedBreakdown.total}
                    projectedHigh={weeklyProjectedBreakdownHigh ? weeklyProjectedBreakdownHigh.total : null}
                    withinReach={withinReachText}
                    gradeNote={gradeTransitionLabel(breakdown.grade, weeklyProjectedBreakdown.grade, locale)}
                    note={
                      actionPlan.weeklyTasks.length > 0
                        ? tPlural(locale, "dashboard.growth.view.weeklyPlanNote", actionPlan.weeklyTasks.length)
                        : t(locale, "dashboard.growth.view.weeklyPlanNoteEmpty")
                    }
                  />
                </WeeklyGoalCelebration>

                <div id="weekly-routine" className="scroll-mt-20">
                  <WeeklyChecklist
                    businessId={businessId}
                    items={weeklyChecklist.items}
                    initialCheckedItemIds={weeklyChecklist.checkedItemIds}
                    initialStreakWeeks={weeklyChecklist.streakWeeks}
                    weekStart={weeklyChecklist.weekStart}
                  />
                </div>

                {actionPlan.error ? (
                  <Card className="p-5 text-sm text-red">
                    {t(locale, "dashboard.growth.view.actionPlanErrorPrefix", { error: actionPlan.error })}
                  </Card>
                ) : (
                  <>
                    <div id="weekly-plan" className="scroll-mt-20">
                      <SectionHeading
                        title={t(locale, "dashboard.growth.view.weeklyPlanHeading", {
                          count: actionPlan.weeklyTasks.length,
                        })}
                      />
                    </div>
                    {/* The "Connect Google" step replaces this card when it's in the plan. */}
                    {!gbpConnected && !actionPlan.weeklyTasks.some((task) => task.checkId === CONNECT_GOOGLE_STEP_ID) && (
                      <PremiumConnectCard businessId={businessId} premium={isPremiumPlan(plan)} />
                    )}
                    <TaskListCard
                      premium={isPremiumPlan(plan)}
                      tasks={actionPlan.weeklyTasks}
                      businessId={businessId}
                      context="weekly"
                      lastScanAt={lastScanAt}
                      linkOptions={linkOptions}
                      websiteRecheck={websiteRecheck}
                      emptyMessage={
                        hasNoRemainingScoreGaps
                          ? t(locale, "dashboard.growth.view.fullPointsMessage")
                          : t(locale, "dashboard.growth.view.weeklyEmptyMessage")
                      }
                      footnote={
                        actionPlan.weeklyTasks.length > 0 ? t(locale, "dashboard.growth.view.weeklyFootnote") : undefined
                      }
                    />

                    <SectionHeading
                      title={t(locale, "dashboard.growth.view.laterTasksHeading", {
                        count: actionPlan.laterTasks.length,
                      })}
                    />
                    {actionPlan.websiteBanner && (
                      <WebsiteBannerCard banner={actionPlan.websiteBanner} businessId={businessId} />
                    )}
                    {(actionPlan.laterTasks.length > 0 || !actionPlan.websiteBanner) && (
                      <TaskListCard
                        tasks={actionPlan.laterTasks}
                        businessId={businessId}
                        lastScanAt={lastScanAt}
                        linkOptions={linkOptions}
                        websiteRecheck={websiteRecheck}
                        emptyMessage={
                          hasNoRemainingScoreGaps
                            ? t(locale, "dashboard.growth.view.fullPointsMessage")
                            : t(locale, "dashboard.growth.view.laterEmptyMessage")
                        }
                      />
                    )}
                  </>
                )}
              </>
            )}

            {!free && <CompletedTasksCard completed={actionPlan.completed} />}

            {free && growthMoves.length > 0 && <FreeGrowthMoves count={growthMoves.length} heading={t(locale, "dashboard.growth.moves.sectionHeading")} />}

            {!free && growthMoves.length > 0 && (
            <div id="ways-to-grow" className="flex flex-col gap-6 scroll-mt-20 nav:gap-8">
              <SectionHeading title={t(locale, "dashboard.growth.moves.sectionHeading")} />
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {growthMoves.map((move) => (
                  <GrowthMoveCard key={move.id} move={move} overlapsActionPlan={growthMoveOverlapsActionPlan(move.id, openActionPlanTasks)} />
                ))}
              </ul>
            </div>
            )}
          </div>
        )}

        {segment === "google-profile" && (
          <GoogleProfilePanel
            businessId={businessId}
            plan={plan}
            listing={googleProfile.listing}
            websiteOnly={googleProfile.websiteOnly}
            lastScanAt={lastScanAt}
            connected={googleProfile.connected}
            searchDemand={googleProfile.searchDemand}
            connection={googleProfile.connection ?? null}
          />
        )}
      </div>
    </ReviewGoalLinesContext.Provider>
  );
}
