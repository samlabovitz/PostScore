"use client";

// The action plan's biggest open items (the same list as Growth), with
// a priority: Urgent when customers are hitting it right now
// (lib/urgency.ts), otherwise from their real points on the 0–100 total —
// High 5+, Medium 2+ (lib/overviewTiles.ts) — and ONE button to where each is fixed.

import { fixPlanHref } from "@/lib/routes";
import Link from "next/link";
import { IconArrowRight, IconMapPin, IconStar, IconWorld } from "@tabler/icons-react";
import { pointsText, recRangeText, websiteRangeText, wholePointRange } from "@/lib/pointRange";
import { FixButton, FIX_BUTTON_CLASS } from "@/components/scoring/FixButton";
import { DetailsMismatchTasks, DetailsVersions, MergedActions, mergedTitle } from "@/components/overview/DetailsMismatchTasks";
import { mergedKind, mismatchesCoveredBy, URGENT_DETAILS, type DetailsMismatch } from "@/lib/detailsMismatch";
import { hoursWaitingOnGoogle, isHoursCheck, type HoursCheckState } from "@/lib/hoursCheck";
import { HoursDiffLines, RescanNowButton, WaitingForGoogleTag } from "@/components/scoring/HoursCheck";
import type { OwnerDetails } from "@/lib/ownerDetails";
import { withFromScore } from "@/lib/fixDestination";
import { HIGH_PRIORITY_POINTS, MEDIUM_PRIORITY_POINTS, type Priority, type Recommendation } from "@/lib/overviewTiles";
import { t, tPlural, useLocale, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { GOOGLE_MISMATCH_CHECK_ID } from "@/lib/actionPlan";

function PriorityTag({ priority }: { priority: Priority }) {
  const locale = useLocale();
  return (
    <span
      data-priority={priority}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
        priority === "urgent"
          ? "bg-red text-white"
          : priority === "high"
            ? "bg-ink text-paper"
            : "border border-[color:color-mix(in_srgb,var(--color-brass)_50%,transparent)] bg-[color:color-mix(in_srgb,var(--color-brass)_15%,transparent)] text-ink"
      )}
    >
      {t(locale, priority === "urgent" ? "dashboard.overview.recs.urgent" : priority === "high" ? "dashboard.overview.recs.high" : "dashboard.overview.recs.medium")}
    </span>
  );
}

function RecIcon({ rec }: { rec: Recommendation }) {
  const category = rec.source.kind === "website" ? "website" : rec.source.task.category;
  const Icon = category === "visibility" ? IconStar : category === "completeness" ? IconMapPin : IconWorld;
  return (
    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
      <Icon size={17} />
    </span>
  );
}

function RecText({ rec }: { rec: Recommendation }) {
  const locale = useLocale();
  if (rec.source.kind === "task") {
    const { task } = rec.source;
    return (
      <>
        <span className="text-sm font-semibold text-ink">{task.label}</span>
        <span className="text-[12.5px] leading-snug text-ink-soft">{task.weeklyTarget ?? task.action}</span>
      </>
    );
  }
  const { banner } = rec.source;
  if (banner.kind === "improve") {
    return (
      <>
        <span className="text-sm font-semibold text-ink">{t(locale, "dashboard.overview.recs.improveWebsite")}</span>
        <span className="text-[12.5px] leading-snug text-ink-soft">
          {tPlural(locale, "dashboard.growth.websiteBanner.improve", banner.improvements, { earned: banner.earned, of: banner.of, points: wholePointRange(banner.points, null).low })}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="text-sm font-semibold text-ink">{t(locale, "dashboard.growth.websiteBanner.getWebsite.title")}</span>
      <span className="text-[12.5px] leading-snug text-ink-soft">
        {websiteRangeText(locale, banner.low, banner.high)}
      </span>
    </>
  );
}

/** Whole points everywhere ("+19 pts", "about +29–31 pts"); the website
 * item is an estimate, so it says "about". */
function recPointsText(locale: Locale, rec: Recommendation): string {
  if (rec.pointsHigh !== null) return recRangeText(locale, rec.points, rec.pointsHigh);
  const points = wholePointRange(rec.points, null).low;
  // "Keep growing toward 150 reviews": a ceiling.
  if (rec.source.kind === "task" && rec.source.task.upTo) return t(locale, "dashboard.overview.actionPlan.pointsUpTo", { points });
  return pointsText(locale, points, rec.source.kind === "website");
}

export function TopRecommendations({
  businessId,
  recommendations: allRecommendations,
  detailsMismatch = null,
  hoursCheck = null,
  limit = Infinity,
  lastScanAt = null,
}: {
  businessId: string;
  recommendations: Recommendation[] | null;
  /** How many to show (after the merged details task moves first). */
  limit?: number;
  /** Day 23B: the scored hours check as it is now (lib/hoursCheck.ts). */
  hoursCheck?: HoursCheckState | null;
  /** The latest scan: "Re-scan now" only once the next re-scan is open. */
  lastScanAt?: string | null;
  /** Day 23B: confirmed details that differ from Google or the website — tasks first, no points. */
  detailsMismatch?: { mismatches: DetailsMismatch[]; owner: OwnerDetails | null } | null;
}) {
  const locale = useLocale();
  // Day 23B: a details mismatch and the scored "Matches your Google listing"
  // check about the same field are ONE task — first, Urgent for hours/phone.
  const mismatches = detailsMismatch?.mismatches ?? [];
  const covered = (rec: Recommendation) => (rec.source.kind === "task" ? mismatchesCoveredBy(rec.source.task, mismatches) : []);
  // Day 25B step 3: an hours check that matches now (a re-scan away) or
  // waits on Google (Business Profile ahead of Maps) is never in the top
  // items — after every other one.
  const staleHours = (r: Recommendation) =>
    (hoursCheck?.kind === "stale" || hoursWaitingOnGoogle(hoursCheck)) && covered(r).length === 0 && r.source.kind === "task" && isHoursCheck(r.source.task);
  const recommendations =
    allRecommendations === null
      ? null
      : [
          ...allRecommendations.filter((r) => covered(r).length > 0),
          ...allRecommendations.filter((r) => covered(r).length === 0 && !staleHours(r)),
          ...allRecommendations.filter(staleHours),
        ].slice(0, limit);
  const coveredFields = new Set((recommendations ?? []).flatMap((r) => covered(r).map((m) => m.field)));
  const standalone = mismatches.filter((m) => !coveredFields.has(m.field));
  return (
    <section className="flex h-full flex-col rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.overview.recs.heading")}</h2>
        <Link href={fixPlanHref(businessId)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink hover:text-brass">
          {t(locale, "dashboard.overview.recs.viewAll")}
          <IconArrowRight size={14} />
        </Link>
      </div>

      <Link
        href={fixPlanHref(businessId, { hash: "weekly-plan" })}
        className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-paper transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-ink)_90%,transparent)]"
      >
        <span className="text-[13.5px] font-semibold">
          <span className="text-brass">{t(locale, "dashboard.overview.recs.startHereLabel")}</span> {t(locale, "dashboard.overview.recs.startHere")}
        </span>
        <IconArrowRight size={16} className="shrink-0 text-brass" aria-hidden />
      </Link>

      {/* Equal height with "Since your last scan": the list always sits
          right under the banner; any extra height goes below it, above
          the footer note — never spread between items. */}
      <div className="flex-1">
        {detailsMismatch && standalone.length > 0 && <DetailsMismatchTasks businessId={businessId} mismatches={standalone} owner={detailsMismatch.owner} className="mt-3 border-b border-paper-line pb-2" />}
        {recommendations === null ? (
          <p className="mt-3 text-sm text-ink-soft">{t(locale, "dashboard.overview.recs.unavailable")}</p>
        ) : recommendations.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">{t(locale, "dashboard.overview.recs.empty")}</p>
        ) : (
          <ol className="mt-3 flex flex-col divide-y divide-paper-line">
            {recommendations.map((rec) => {
              const merged = covered(rec);
              // Google and the website agree: only the confirmed details differ — no points to win.
              const ownerOnly = merged.length > 0 && mergedKind(merged) === "owner_only";
              // The scored hours check, as it is now: matching (re-scan) or the exact days that differ.
              const hours = merged.length === 0 && rec.source.kind === "task" && isHoursCheck(rec.source.task) ? hoursCheck : null;
              const stale = hours?.kind === "stale";
              const waiting = hoursWaitingOnGoogle(hours);
              const priority = merged.some((m) => URGENT_DETAILS.includes(m.field)) ? "urgent" : rec.priority;
              return (
              <li key={rec.key} data-merged={merged.length > 0 ? merged.map((m) => m.field).join(",") : undefined} className="flex gap-3 py-3 first:pt-1 last:pb-1">
                <RecIcon rec={rec} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {/* Pill + points sit in the same top-right spot on every
                      item (stacked, so long text never pushes them around). */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {merged.length > 0 ? (
                        <span className="text-sm font-semibold text-ink">{mergedTitle(merged, locale)}</span>
                      ) : stale ? (
                        // The fix's real title; "Changed since your last scan · Re-scan to update" is only a note under it.
                        <>
                          <span className="text-sm font-semibold text-ink">{t(locale, "content.actionPlan.title.website.info_consistency.hours")}</span>
                          <span data-testid="hours-stale" className="text-[12.5px] leading-snug text-ink-soft">{t(locale, "dashboard.hoursCheck.staleTitle")}</span>
                        </>
                      ) : hours?.kind === "differs" && rec.source.kind === "task" ? (
                        <>
                          <span className="text-sm font-semibold text-ink">{rec.source.task.label}</span>
                          <HoursDiffLines state={hours} />
                        </>
                      ) : (
                        <RecText rec={rec} />
                      )}
                      {rec.pending && <span className="text-[12px] font-medium text-ink-soft">{t(locale, "dashboard.overview.recs.pending")}</span>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {waiting ? <WaitingForGoogleTag /> : priority && !stale && <PriorityTag priority={priority} />}
                      {!ownerOnly && !stale && <span className="whitespace-nowrap text-[12px] font-semibold tabular-nums text-ink">{recPointsText(locale, rec)}</span>}
                    </div>
                  </div>
                  {merged.length > 0 && <DetailsVersions mismatches={merged} />}
                  {/* Day 23B: ONE button, straight to where it's fixed (lib/fixDestination.ts). */}
                  {stale ? (
                    <RescanNowButton businessId={businessId} lastScanAt={lastScanAt} />
                  ) : merged.length > 0 ? (
                    <MergedActions businessId={businessId} mismatches={merged} fromScore />
                  ) : rec.source.kind === "task" ? (
                    <FixButton
                      businessId={businessId}
                      fromScore
                      item={{
                        checkId: rec.source.task.checkId,
                        mergedCheckIds: rec.source.task.mergedCheckIds,
                        hoursMismatch: rec.source.task.checkId === GOOGLE_MISMATCH_CHECK_ID && (rec.source.task.mismatchFields ?? []).includes("hours"),
                      }}
                    />
                  ) : (
                    <Link href={withFromScore(rec.href)} data-testid="fix-button" data-kind="steps" className={FIX_BUTTON_CLASS}>
                      {(rec.linkLabel ? t(locale, rec.linkLabel) : t(locale, "dashboard.overview.recs.seeCheck")).replace(/\s*→$/, "")} →
                    </Link>
                  )}
                </div>
              </li>
              );
            })}
          </ol>
        )}
      </div>

      <p className="mt-3 border-t border-paper-line pt-3 text-[11.5px] text-ink-soft">
        {t(locale, "dashboard.overview.recs.priorityNote", { high: HIGH_PRIORITY_POINTS, medium: MEDIUM_PRIORITY_POINTS })}
      </p>
    </section>
  );
}
