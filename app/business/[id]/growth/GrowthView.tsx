"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { IconArrowLeft } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/SegmentedControl";
import { TaskListCard, GrowthMoveCard, CompletedTasksCard } from "../ActionPlanSection";
import { WeeklyChecklist } from "./WeeklyChecklist";
import type { ActionPlanTask, CompletedTask } from "@/lib/actionPlan";
import type { GrowthMove } from "@/lib/growthMoves";
import type { WeeklyChecklistItem, WeeklyChecklistItemId } from "@/lib/weeklyChecklist";
import type { ScoreBreakdown } from "@/lib/scoring";
import type { BizProfile } from "@/config/bizProfiles";
import type { PromoRow } from "@/lib/promos";
import type { ReferralRow } from "@/lib/referrals";
import { t, tPlural, useLocale, type Locale } from "@/lib/i18n";
import { useScrollToHash } from "@/lib/useScrollToHash";

// The builder generates a random coupon code and reads window.location
// on first render — genuinely client-only state, not something that
// can (or should) match a server-rendered pass. Loading it with
// ssr:false avoids a hydration mismatch entirely rather than papering
// over it with an effect-delayed placeholder.
const CouponsSection = dynamic(
  () => import("./CouponsSection").then((m) => m.CouponsSection),
  { ssr: false, loading: () => <Card className="p-8 text-sm text-ink-soft">Loading…</Card> }
);

// The referral builder generates a random code on first render — same
// genuinely client-only state as the coupon builder, same ssr:false fix.
const ReferralSection = dynamic(
  () => import("./ReferralSection").then((m) => m.ReferralSection),
  { ssr: false, loading: () => <Card className="p-8 text-sm text-ink-soft">Loading…</Card> }
);

type Segment = "plan" | "coupons" | "referral";

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

function segmentFromParam(param: string | null, referralOk: boolean): Segment {
  if (param === "coupons") return "coupons";
  if (param === "referral" && referralOk) return "referral";
  return "plan";
}

export function GrowthView({
  businessId,
  businessName,
  businessPhone,
  profile,
  referralOk,
  breakdown,
  actionPlan,
  growthMoves,
  weeklyChecklist,
  initialPromos,
  initialReferral,
  lastScanAt,
}: {
  businessId: string;
  businessName: string | null;
  businessPhone: string | null;
  profile: BizProfile;
  referralOk: boolean;
  breakdown: ScoreBreakdown;
  initialPromos: PromoRow[];
  initialReferral: ReferralRow | null;
  /** When this business was last re-scanned — see getLastScanAt() in
   * app/actions/scoring.ts. Lets a still-pending task tell "hasn't been
   * re-checked yet" apart from "checked, no real change" (see
   * pendingCheckStatus in lib/actionPlan.ts). */
  lastScanAt: string | null;
  actionPlan: {
    tasks: ActionPlanTask[];
    completed: CompletedTask[];
    weeklyTasks: ActionPlanTask[];
    laterTasks: ActionPlanTask[];
    weeklyProjectedBreakdown: ScoreBreakdown;
    /** Set only when a weekly task is itself a range (currently only
     * the no-website starter-site card) — see WeeklyPlan's own doc. */
    weeklyProjectedBreakdownHigh: ScoreBreakdown | null;
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
  };
}) {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  // A link straight to this page's own #weekly-routine/#ways-to-grow
  // anchors (e.g. the Overview page's growth strip) needs this: Next's
  // own scroll-to-hash can land before this client component has
  // rendered the section, so the browser's native jump finds nothing.
  useScrollToHash();
  // The Growth page's tab is URL-driven (?tab=coupons / ?tab=referral)
  // so a growth move's link (e.g. "start a coupon") can deep-link
  // straight to the right tab instead of just landing on this page's
  // default "plan" segment.
  const segment = segmentFromParam(searchParams.get("tab"), referralOk);

  function setSegment(next: Segment) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "plan") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const query = params.toString();
    router.replace(`/business/${businessId}/growth${query ? `?${query}` : ""}`, { scroll: false });
  }

  const { weeklyProjectedBreakdown, weeklyProjectedBreakdownHigh } = actionPlan;
  const pointsWithinReachLow = weeklyProjectedBreakdown.total - breakdown.total;
  const pointsWithinReachHigh = weeklyProjectedBreakdownHigh
    ? weeklyProjectedBreakdownHigh.total - breakdown.total
    : null;
  // Whenever no quick score task qualified and nothing longer_term had
  // an honest weekly first step either, buildWeeklyPlan leaves the week
  // truly empty — the only time that happens for a business with real
  // remaining gaps is when there simply aren't any left to show.
  const hasNoRemainingScoreGaps = actionPlan.tasks.length === 0;

  const options: SegmentedControlOption<Segment>[] = [
    { value: "plan", label: t(locale, "dashboard.growth.view.tabPlan") },
    { value: "coupons", label: t(locale, "dashboard.growth.view.tabCoupons") },
  ];
  if (referralOk) {
    options.push({ value: "referral", label: t(locale, "dashboard.growth.view.tabReferral") });
  }

  return (
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
          <Card className="p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
              {t(locale, "dashboard.growth.view.weeklyCardLabel")}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-6 sm:grid-cols-4">
              <StatTile label={t(locale, "dashboard.growth.view.statScoreToday")} value={breakdown.total} />
              <StatTile
                label={t(locale, "dashboard.growth.view.statProjected")}
                value={
                  weeklyProjectedBreakdownHigh
                    ? `${weeklyProjectedBreakdown.total}–${weeklyProjectedBreakdownHigh.total}`
                    : weeklyProjectedBreakdown.total
                }
              />
              <StatTile
                label={t(locale, "dashboard.growth.view.statPointsWithinReach")}
                value={
                  pointsWithinReachHigh !== null
                    ? `+${Math.max(0, pointsWithinReachLow)}–${Math.max(0, pointsWithinReachHigh)}`
                    : pointsWithinReachLow > 0
                      ? `+${pointsWithinReachLow}`
                      : "0"
                }
              />
              <StatTile
                label={t(locale, "dashboard.growth.view.statGrade")}
                value={gradeTransitionLabel(breakdown.grade, weeklyProjectedBreakdown.grade, locale)}
              />
            </div>
            <p className="mt-4 border-t border-paper-line pt-3 text-[12px] text-ink-mute">
              {actionPlan.weeklyTasks.length > 0
                ? tPlural(locale, "dashboard.growth.view.weeklyPlanNote", actionPlan.weeklyTasks.length)
                : t(locale, "dashboard.growth.view.weeklyPlanNoteEmpty")}
            </p>
          </Card>

          <div id="weekly-routine" className="scroll-mt-20">
            <WeeklyChecklist
              businessId={businessId}
              items={weeklyChecklist.items}
              initialCheckedItemIds={weeklyChecklist.checkedItemIds}
              initialStreakWeeks={weeklyChecklist.streakWeeks}
            />
          </div>

          {actionPlan.error ? (
            <Card className="p-5 text-sm text-red">
              {t(locale, "dashboard.growth.view.actionPlanErrorPrefix", { error: actionPlan.error })}
            </Card>
          ) : (
            <>
              <SectionHeading
                title={t(locale, "dashboard.growth.view.weeklyPlanHeading", {
                  count: actionPlan.weeklyTasks.length,
                })}
              />
              <TaskListCard
                tasks={actionPlan.weeklyTasks}
                businessId={businessId}
                context="weekly"
                lastScanAt={lastScanAt}
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
              <TaskListCard
                tasks={actionPlan.laterTasks}
                businessId={businessId}
                lastScanAt={lastScanAt}
                emptyMessage={
                  hasNoRemainingScoreGaps
                    ? t(locale, "dashboard.growth.view.fullPointsMessage")
                    : t(locale, "dashboard.growth.view.laterEmptyMessage")
                }
              />
            </>
          )}

          <CompletedTasksCard completed={actionPlan.completed} />

          {growthMoves.length > 0 && (
            <div id="ways-to-grow" className="flex flex-col gap-6 scroll-mt-20 nav:gap-8">
              <SectionHeading title={t(locale, "dashboard.growth.moves.sectionHeading")} />
              <Card className="p-5">
                <div className="flex flex-col divide-y divide-paper-line">
                  {growthMoves.map((move) => (
                    <GrowthMoveCard key={move.id} move={move} />
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {segment === "coupons" && (
        <CouponsSection
          businessId={businessId}
          businessName={businessName ?? t(locale, "dashboard.growth.view.businessNameFallback")}
          businessPhone={businessPhone}
          profile={profile}
          initialPromos={initialPromos}
        />
      )}

      {segment === "referral" && referralOk && (
        <ReferralSection
          businessId={businessId}
          businessName={businessName ?? t(locale, "dashboard.growth.view.businessNameFallback")}
          businessPhone={businessPhone}
          profile={profile}
          initialReferral={initialReferral}
        />
      )}
    </div>
  );
}
