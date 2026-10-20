"use client";

// Growth on Free ("Free = a digital audit"): this week's plan, the weekly
// routine and the bigger projects are LockedPreviews of their REAL
// content — task titles, what's wrong and the points each is worth are
// visible; the steps and "I did this" are locked. Nothing here can run:
// no "I did this", no website Re-check (PageSpeed), no weekly-goal
// tracking or celebrations. Breakdown links into Growth (#task-…,
// #weekly-plan, #weekly-routine) still land on the matching preview.

import { IconMapPin, IconRefresh, IconStar, IconWorld } from "@tabler/icons-react";
import type { ActionPlanTask, WebsiteBanner } from "@/lib/actionPlan";
import type { WeeklyChecklistItem } from "@/lib/weeklyChecklist";
import { websiteRangeText, wholePointRange } from "@/lib/pointRange";
import { NO_FACTS, unlockLine } from "@/lib/upgradePromos";
import { t, tPlural, useLocale } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { LockedPreview } from "@/components/plan/LockedPreview";
import { useUpgrade } from "@/components/upgrade/UpgradeContext";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";

/** The same anchor the live task card uses (ActionPlanSection). */
export const taskAnchor = (checkId: string) => `task-${checkId.replace(/\./g, "-")}`;

function TaskIcon({ category }: { category: ActionPlanTask["category"] }) {
  const Icon = category === "visibility" ? IconStar : category === "completeness" ? IconMapPin : IconWorld;
  return (
    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
      <Icon size={15} />
    </span>
  );
}

/** One task as a read-only row: title, what's wrong, the points; the
 * steps and "I did this" shown as locked. */
function PreviewTask({ task }: { task: ActionPlanTask }) {
  const locale = useLocale();
  return (
    <li id={taskAnchor(task.checkId)} className="flex scroll-mt-20 gap-3 py-3 first:pt-0 last:pb-0">
      <TaskIcon category={task.category} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 text-sm font-semibold text-ink">{task.label}</span>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-paper">
            {t(locale, "dashboard.overview.recs.points", { points: wholePointRange(task.promisedPoints, null).low })}
          </span>
        </div>
        <span className="text-[12.5px] leading-snug text-ink-soft">{task.problem}</span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-paper px-2 py-1 text-[11.5px] font-medium text-ink-mute">{t(locale, "dashboard.free.stepsLocked")}</span>
          <span className="rounded-md border border-paper-deep px-2 py-1 text-[11.5px] font-medium text-ink-mute">{t(locale, "dashboard.free.didThis")}</span>
        </div>
      </div>
    </li>
  );
}

function BannerRow({ banner }: { banner: WebsiteBanner }) {
  const locale = useLocale();
  const improve = banner.kind === "improve";
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <TaskIcon category="website" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-semibold text-ink">
          {improve ? t(locale, "dashboard.overview.recs.improveWebsite") : t(locale, "dashboard.growth.websiteBanner.getWebsite.title")}
        </span>
        <span className="text-[12.5px] leading-snug text-ink-soft">
          {banner.kind === "improve"
            ? tPlural(locale, "dashboard.growth.websiteBanner.improve", banner.improvements, { score: banner.score, points: wholePointRange(banner.points, null).low })
            : websiteRangeText(locale, banner.low, banner.high)}
        </span>
      </div>
    </li>
  );
}

export function FreeGrowthPlan({
  weeklyTasks,
  laterTasks,
  websiteBanner,
  routineItems,
  weeklyHeading,
  laterHeading,
}: {
  weeklyTasks: ActionPlanTask[];
  laterTasks: ActionPlanTask[];
  websiteBanner: WebsiteBanner | null;
  routineItems: WeeklyChecklistItem[];
  weeklyHeading: string;
  laterHeading: string;
}) {
  const locale = useLocale();
  const facts = useUpgrade()?.facts ?? NO_FACTS;
  const planLine = unlockLine("plan", facts, locale);
  const hasWebsiteTask = [...weeklyTasks, ...laterTasks].some((task) => task.category === "website") || websiteBanner?.kind === "improve";

  return (
    <div data-testid="free-growth-plan" className="flex flex-col gap-6 nav:gap-8">
      <div id="weekly-routine" className="flex scroll-mt-20 flex-col gap-4">
        <SectionHeading title={t(locale, "dashboard.growth.checklist.sectionHeading")} />
        <LockedPreview title={t(locale, "dashboard.growth.checklist.sectionHeading")} unlock={planLine} height="max-h-48">
          <p className="mb-2 text-[12.5px] text-ink-soft">{t(locale, "dashboard.free.routinePreviewNote")}</p>
          <ul className="flex flex-col gap-2">
            {routineItems.map((item) => (
              <li key={item.id} className="flex items-center gap-2.5 text-[13.5px] text-ink">
                <span aria-hidden className="h-4 w-4 shrink-0 rounded border border-paper-deep bg-white" />
                {item.title}
              </li>
            ))}
          </ul>
        </LockedPreview>
      </div>

      <div id="weekly-plan" className="flex scroll-mt-20 flex-col gap-4">
        <SectionHeading title={weeklyHeading} />
        {weeklyTasks.length > 0 && (
          <LockedPreview title={weeklyHeading} unlock={planLine} height="max-h-80">
            <ol className="flex flex-col divide-y divide-paper-line">
              {weeklyTasks.map((task) => (
                <PreviewTask key={task.checkId} task={task} />
              ))}
            </ol>
          </LockedPreview>
        )}
        {hasWebsiteTask && (
          <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="free-recheck">
            <div className="flex min-w-0 items-start gap-2.5">
              <IconRefresh size={17} aria-hidden className="mt-0.5 shrink-0 text-ink-soft" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">{t(locale, "dashboard.websiteRecheck.button")}</div>
                <p className="text-[12.5px] text-ink-soft">{t(locale, "dashboard.free.recheckBody")}</p>
              </div>
            </div>
            <UpgradeTrigger feature="recheck" variant="button" className="w-fit shrink-0" label={t(locale, "dashboard.upgrade.trigger.unlockGrow")} />
          </Card>
        )}
      </div>

      {(laterTasks.length > 0 || websiteBanner) && (
        <div className="flex flex-col gap-4">
          <SectionHeading title={laterHeading} />
          <LockedPreview title={laterHeading} unlock={planLine} height="max-h-64">
            <ol className="flex flex-col divide-y divide-paper-line">
              {websiteBanner && <BannerRow banner={websiteBanner} />}
              {laterTasks.map((task) => (
                <PreviewTask key={task.checkId} task={task} />
              ))}
            </ol>
          </LockedPreview>
        </div>
      )}
    </div>
  );
}
