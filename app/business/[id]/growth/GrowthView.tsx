"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { IconArrowLeft } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/SegmentedControl";
import { TaskListCard, CompletedTasksCard } from "../ActionPlanSection";
import type { ActionPlanTask, CompletedTask } from "@/lib/actionPlan";
import type { ScoreBreakdown } from "@/lib/scoring";
import type { BizProfile } from "@/config/bizProfiles";
import type { PromoRow } from "@/lib/promos";
import type { ReferralRow } from "@/lib/referrals";
import { t, tPlural, useLocale, type Locale } from "@/lib/i18n";

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

/** Honest grade-change copy: only claims a letter change when the real
 * projected grade actually differs from today's — otherwise it says so
 * plainly rather than implying movement that isn't there. */
function gradeTransitionLabel(from: string, to: string, locale: Locale): string {
  return from === to
    ? t(locale, "dashboard.growth.view.gradeStays", { grade: to })
    : t(locale, "dashboard.growth.view.gradeChangeArrow", { from, to });
}

export function GrowthView({
  businessId,
  businessName,
  businessPhone,
  profile,
  referralOk,
  breakdown,
  actionPlan,
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
    error?: string;
  };
}) {
  const locale = useLocale();
  const [segment, setSegment] = useState<Segment>("plan");

  const { weeklyProjectedBreakdown } = actionPlan;
  const pointsWithinReach = weeklyProjectedBreakdown.total - breakdown.total;

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
                value={weeklyProjectedBreakdown.total}
              />
              <StatTile
                label={t(locale, "dashboard.growth.view.statPointsWithinReach")}
                value={pointsWithinReach > 0 ? `+${pointsWithinReach}` : "0"}
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
                emptyMessage={t(locale, "dashboard.growth.view.weeklyEmptyMessage")}
                footnote={t(locale, "dashboard.growth.view.weeklyFootnote")}
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
                emptyMessage={t(locale, "dashboard.growth.view.laterEmptyMessage")}
              />
            </>
          )}

          <CompletedTasksCard completed={actionPlan.completed} />
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
