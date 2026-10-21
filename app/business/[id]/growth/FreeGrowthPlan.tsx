"use client";

// Growth on Free ("Free = a digital audit"): the weekly routine, this
// week's plan, the bigger projects and the ways to bring in customers are
// LockedPreviews — only each section's title, a real count ("3 fixes · 13
// pts") and its OWN unlock line are readable; the tasks, steps and tips
// themselves are never put into the page. Nothing here can run: no "I did
// this", no website Re-check (PageSpeed), no weekly-goal tracking or
// celebrations. Links into Growth (#weekly-plan, #weekly-routine, #task-…)
// still land on the matching section.

import { IconRefresh } from "@tabler/icons-react";
import type { ActionPlanTask, WebsiteBanner } from "@/lib/actionPlan";
import type { WeeklyChecklistItem } from "@/lib/weeklyChecklist";
import { NO_FACTS, projectsUnlockLine, unlockLine } from "@/lib/upgradePromos";
import { t, useLocale } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import { LockedPreview } from "@/components/plan/LockedPreview";
import { useUpgrade } from "@/components/upgrade/UpgradeContext";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";
import { fixesSummary } from "@/components/overview/FreeOverview";

/** The same anchor the live task card uses (ActionPlanSection). */
export const taskAnchor = (checkId: string) => `task-${checkId.replace(/\./g, "-")}`;

const points = (tasks: ActionPlanTask[]) => Math.round(tasks.reduce((sum, task) => sum + task.promisedPoints, 0));

/** Bigger projects in real numbers: website work (the banner's own count
 * and points, plus website tasks) or every project. */
export function biggerProjectsTotals(laterTasks: ActionPlanTask[], banner: WebsiteBanner | null): { count: number; points: number; website: boolean } {
  const websiteTasks = laterTasks.filter((task) => task.category === "website");
  const others = laterTasks.filter((task) => task.category !== "website");
  if (banner?.kind === "improve" && others.length === 0)
    return { count: banner.improvements + websiteTasks.length, points: banner.points + points(websiteTasks), website: true };
  const bannerPoints = banner ? (banner.kind === "improve" ? banner.points : banner.low) : 0;
  return { count: laterTasks.length + (banner ? 1 : 0), points: points(laterTasks) + bannerPoints, website: others.length === 0 && (banner !== null || websiteTasks.length > 0) };
}

/** Empty anchors so a link to one task still lands on its section. */
function TaskAnchors({ tasks }: { tasks: ActionPlanTask[] }) {
  return (
    <>
      {tasks.map((task) => (
        <span key={task.checkId} id={taskAnchor(task.checkId)} aria-hidden="true" className="block h-0 scroll-mt-20" />
      ))}
    </>
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
  const projects = biggerProjectsTotals(laterTasks, websiteBanner);
  const hasWebsiteWork = laterTasks.some((task) => task.category === "website") || weeklyTasks.some((task) => task.category === "website") || websiteBanner?.kind === "improve";

  return (
    <div data-testid="free-growth-plan" className="flex flex-col gap-6 nav:gap-8">
      <LockedPreview
        id="weekly-routine"
        title={t(locale, "dashboard.growth.checklist.sectionHeading")}
        summary={routineItems.length > 0 ? t(locale, "dashboard.free.sumHabits", { count: routineItems.length }) : null}
        unlock={unlockLine("routine", facts, locale)}
        rows={Math.min(routineItems.length, 4) || 3}
      />

      <div className="flex flex-col gap-3">
        <TaskAnchors tasks={weeklyTasks} />
        {weeklyTasks.length > 0 ? (
          <LockedPreview
            id="weekly-plan"
            title={weeklyHeading}
            summary={fixesSummary(weeklyTasks.length, points(weeklyTasks), locale)}
            unlock={unlockLine("plan", facts, locale)}
            rows={Math.min(weeklyTasks.length, 4)}
          />
        ) : (
          <Card id="weekly-plan" className="scroll-mt-20 p-4">
            <h3 className="text-[14px] font-semibold text-ink">{weeklyHeading}</h3>
            <p className="mt-1 text-[13px] text-ink-soft" data-testid="no-quick-wins">
              {t(locale, "dashboard.free.noQuickWins")}
            </p>
          </Card>
        )}
      </div>

      {(laterTasks.length > 0 || websiteBanner) && (
        <div className="flex flex-col gap-3">
          <TaskAnchors tasks={laterTasks} />
          <LockedPreview
            title={laterHeading}
            summary={fixesSummary(projects.count, projects.points > 0 ? Math.round(projects.points) : null, locale)}
            unlock={projectsUnlockLine(projects.count, projects.points, projects.website, locale)}
            rows={Math.min(projects.count, 4) || 2}
          />
          {hasWebsiteWork && (
            <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="free-recheck">
              <div className="flex min-w-0 items-start gap-2.5">
                <IconRefresh size={17} aria-hidden className="mt-0.5 shrink-0 text-ink-soft" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">{t(locale, "dashboard.websiteRecheck.button")}</div>
                  <p className="text-[12.5px] text-ink-soft">{t(locale, "dashboard.free.recheckBody")}</p>
                </div>
              </div>
              <UpgradeTrigger feature="recheck" className="w-fit shrink-0" />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/** "Ways to bring in more customers" on Free: locked, its own line. */
export function FreeGrowthMoves({ count, heading }: { count: number; heading: string }) {
  const locale = useLocale();
  const facts = useUpgrade()?.facts ?? NO_FACTS;
  return (
    <LockedPreview
      id="ways-to-grow"
      title={heading}
      summary={count > 0 ? t(locale, count === 1 ? "dashboard.free.sumIdeasOne" : "dashboard.free.sumIdeas", { count }) : null}
      unlock={unlockLine("tools", facts, locale)}
      shape="card"
    />
  );
}
