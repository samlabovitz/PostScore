"use client";

import { DetailsVersions, MergedActions, mergedOneClickItem, mergedTitle } from "@/components/overview/DetailsMismatchTasks";
import { PremiumOneClickLine } from "@/components/scoring/PremiumOneClickLine";
import { mergedKind, mismatchesCoveredBy, type DetailsMismatch } from "@/lib/detailsMismatch";
import { hoursWaitingOnGoogle, isHoursCheck, shownHoursState, type HoursCheckState } from "@/lib/hoursCheck";
import { fixRowSteps, moreHelpLinks, oneClickSentence } from "@/lib/fixRow";
import { isFixPlanStepsHref } from "@/lib/routes";
import { HoursDiffLines, RescanNowButton, WaitingForGoogleTag } from "@/components/scoring/HoursCheck";
import { useEffect, useState, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconChevronDown, IconLock, IconBrandGoogle, IconCircleCheck, IconPhoto, IconTag, IconTicket, IconTrendingUp, IconUsers, IconWorld } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LINK_PILL_CLASS } from "@/components/ui/linkPill";
import type { LinkOptions } from "@/lib/postaiLinks";
import { cn } from "@/lib/utils";
import { displayPoints, pointsText, wholePointRange } from "@/lib/pointRange";
import { markTaskDone } from "@/app/actions/actionPlan";
import { WebsiteRecheck } from "@/components/scoring/WebsiteRecheck";
import {
  MERGED_REVIEW_CHECK_ID,
  REVIEW_SPLIT_IDS,
  GOOGLE_MISMATCH_CHECK_ID,
  pendingCheckStatus,
  timeEstimateText,
  weeklyMetricProgress,
  type ActionPlanTask,
  type FixWhen,
  type CompletedTask,
  type PendingCheckStatus,
  type WeeklyMetricProgress,
} from "@/lib/actionPlan";
import type { GrowthMove } from "@/lib/growthMoves";
import { GoogleMapsAttribution } from "@/components/google/GoogleMapsAttribution";
import { FixButton, FIX_BUTTON_CLASS, useFixContext } from "@/components/scoring/FixButton";
import { fixDestination, hasGoogleTab } from "@/lib/fixDestination";
import { GOOGLE_BUSINESS_URL } from "@/lib/googleProfileTab";
import { formatMonthDayTime, t, useLocale, useTimeZone, type Locale, type MessageKey } from "@/lib/i18n";
import type { FixPriority } from "@/lib/overviewTiles";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";

/** What a website task needs for "Re-check my website". */
export interface WebsiteRecheckProps {
  left: number;
  hasWebsite: boolean;
}

/** Points are always shown as whole numbers ("about +2 pts", never "+1.5"). */
function wholePoints(value: number): number {
  return wholePointRange(value, null).low;
}

const STATUS_PILL: Record<"neutral" | "amber" | "green" | "red" | "brass", string> = {
  neutral: "border-paper-deep bg-paper text-ink-soft",
  amber: "border-[color:color-mix(in_srgb,var(--color-amber)_35%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_12%,white)] text-ink",
  green: "border-[color:color-mix(in_srgb,var(--color-green)_35%,white)] bg-[color:color-mix(in_srgb,var(--color-green)_10%,white)] text-green",
  red: "border-[color:color-mix(in_srgb,var(--color-red)_35%,white)] bg-[color:color-mix(in_srgb,var(--color-red)_10%,white)] text-red",
  brass: "border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_12%,white)] text-ink",
};

function StatusPill({ variant, children, className }: { variant: keyof typeof STATUS_PILL; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex w-fit items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold", STATUS_PILL[variant], className)}>{children}</span>;
}

type StatusVariant = "neutral" | "amber" | "green" | "red" | "brass";

/**
 * The ONE real status for a task, shown in exactly one place (the
 * card's top-right pill) — never restated or contradicted elsewhere on
 * the card. "open" tasks are simply "To do". When a real numeric weekly
 * target exists (metricProgress non-null — see weeklyMetricProgress in
 * lib/actionPlan.ts), the pill shows the real "X of Y" fraction for a
 * gradual check with actual progress; otherwise it falls back to the
 * points-based pendingCheckStatus() verdict (one-shot checks, or a
 * gradual check with no recorded numeric baseline yet). "Complete this
 * week" means real forward movement was detected on a re-scan — the
 * underlying check may still not be fully closed, so it's distinct from
 * a permanent Confirmed win.
 */
function taskStatus(
  task: ActionPlanTask,
  pendingStatus: PendingCheckStatus | null,
  metricProgress: WeeklyMetricProgress | null,
  locale: Locale
): { label: string; variant: StatusVariant } {
  if (task.status !== "pending_verification") {
    return { label: t(locale, "dashboard.overview.actionPlan.toDo"), variant: "neutral" };
  }

  if (metricProgress) {
    switch (metricProgress.kind) {
      case "complete":
        return { label: t(locale, "dashboard.overview.actionPlan.completeThisWeek"), variant: "green" };
      case "partial":
        return {
          label: t(locale, "dashboard.overview.actionPlan.inProgressFraction", {
            gained: metricProgress.gained,
            targetDelta: metricProgress.targetDelta,
          }),
          variant: "brass",
        };
      case "not_quite_yet":
        return { label: t(locale, "dashboard.overview.actionPlan.notQuiteYet"), variant: "amber" };
      case "not_yet_checked":
      default:
        return { label: t(locale, "dashboard.overview.actionPlan.inProgress"), variant: "amber" };
    }
  }

  switch (pendingStatus) {
    case "progressed":
      return { label: t(locale, "dashboard.overview.actionPlan.completeThisWeek"), variant: "green" };
    case "regressed":
      return { label: t(locale, "dashboard.overview.actionPlan.checkedWorse"), variant: "red" };
    case "unchanged":
      return { label: t(locale, "dashboard.overview.actionPlan.checkedNoChange"), variant: "amber" };
    case "not_yet_checked":
    default:
      return { label: t(locale, "dashboard.overview.actionPlan.inProgress"), variant: "amber" };
  }
}

/**
 * The card's one "where things stand" block, shown exactly once — never
 * restates the status word above (that's the pill's job). When a real
 * numeric weekly target exists (metricProgress), this shows the actual
 * re-scanned number against the real target ("Progress: 1 of 3 new
 * reviews — 15 so far, 2 to go"), replacing the generic check
 * explanation with a more specific, motivating real number. Otherwise it
 * falls back to the check's own live explanation (`task.problem`) plus a
 * short honest note from pendingCheckStatus() — one-shot checks, or a
 * gradual check with no recorded numeric baseline yet. Never frames real
 * progress as points already earned: score points only ever confirm
 * from reconcileTasks() after a re-scan, never from this note or a
 * click.
 */
function CurrentStatus({
  task,
  pendingStatus,
  metricProgress,
  lastScanAt,
}: {
  task: ActionPlanTask;
  pendingStatus: PendingCheckStatus | null;
  metricProgress: WeeklyMetricProgress | null;
  lastScanAt: string | null;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const checkedLabel = lastScanAt
    ? t(locale, "dashboard.overview.actionPlan.checkedWithDate", { date: formatMonthDayTime(lastScanAt, locale, timeZone) })
    : t(locale, "dashboard.overview.actionPlan.checkedNoDate");

  // Nothing to compare yet, either way — the honest wait, plus the real
  // current value for context.
  if (pendingStatus === "not_yet_checked" || metricProgress?.kind === "not_yet_checked") {
    return (
      <div className="rounded-lg bg-paper px-3 py-2.5">
        <ProblemText task={task} />
        <p className="mt-1 text-[12px] text-ink-mute">
          {t(locale, "dashboard.overview.actionPlan.willCheckNextRescan")}
        </p>
      </div>
    );
  }

  if (metricProgress) {
    const { kind, current, baseline, targetDelta, gained } = metricProgress;
    let line: string;
    if (kind === "complete") {
      line = `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.doneThisWeek", { current })}`;
    } else if (kind === "partial") {
      const remaining = Math.max(0, targetDelta - gained);
      line = `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.progressText", {
        gained,
        targetDelta,
        current,
        remaining,
      })}`;
    } else {
      // not_quite_yet
      line =
        current < baseline
          ? `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.downTo", { current, baseline })}`
          : `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.stillAt", { current })}`;
    }
    return (
      <div className="rounded-lg bg-paper px-3 py-2.5">
        <p className={cn("text-[12.5px]", kind === "complete" ? "font-medium text-green" : "text-ink-soft")}>
          {line}
        </p>
      </div>
    );
  }

  // Fallback: points-based, for one-shot checks or a gradual check with
  // no recorded numeric baseline yet.
  const gradual = task.effort === "quick_win_action";
  let note: string | null = null;
  if (pendingStatus === "regressed") {
    note = `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.movedWrongWay")}`;
  } else if (pendingStatus === "progressed") {
    note = `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.realProgress")}`;
  } else if (pendingStatus === "unchanged") {
    note = gradual
      ? `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.noRealChangeYet")}`
      : `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.googleStillDoesntShow")}`;
  }

  return (
    <div className="rounded-lg bg-paper px-3 py-2.5">
      <ProblemText task={task} />
      {note && <p className="mt-1 text-[12px] text-ink-mute">{note}</p>}
    </div>
  );
}

/** Fix plan's "What we found": the check's finding (or this week's real progress) on one line, and the checked
 * date — plus any honest wait note — in small text under it. */
function FixFound({
  task,
  pendingStatus,
  metricProgress,
  lastScanAt,
  noChangeYet,
}: {
  task: ActionPlanTask;
  pendingStatus: PendingCheckStatus | null;
  metricProgress: WeeklyMetricProgress | null;
  lastScanAt: string | null;
  noChangeYet: boolean;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const checked = lastScanAt ? t(locale, "dashboard.overview.actionPlan.checkedWithDate", { date: formatMonthDayTime(lastScanAt, locale, timeZone) }) : t(locale, "dashboard.overview.actionPlan.checkedNoDate");
  let line = (task.problemLines && task.problemLines.length > 0 ? task.problemLines : [task.problem]).join(" ");
  const notes: string[] = [];
  if (pendingStatus === "not_yet_checked" || metricProgress?.kind === "not_yet_checked") notes.push(t(locale, "dashboard.overview.actionPlan.willCheckNextRescan"));
  else if (metricProgress) {
    const { kind, current, baseline, targetDelta, gained } = metricProgress;
    line =
      kind === "complete"
        ? t(locale, "dashboard.overview.actionPlan.doneThisWeek", { current })
        : kind === "partial"
          ? t(locale, "dashboard.overview.actionPlan.progressText", { gained, targetDelta, current, remaining: Math.max(0, targetDelta - gained) })
          : current < baseline
            ? t(locale, "dashboard.overview.actionPlan.downTo", { current, baseline })
            : t(locale, "dashboard.overview.actionPlan.stillAt", { current });
  } else if (pendingStatus === "regressed") notes.push(t(locale, "dashboard.overview.actionPlan.movedWrongWay"));
  else if (pendingStatus === "progressed") notes.push(t(locale, "dashboard.overview.actionPlan.realProgress"));
  else if (pendingStatus === "unchanged") notes.push(t(locale, task.effort === "quick_win_action" ? "dashboard.overview.actionPlan.noRealChangeYet" : "dashboard.overview.actionPlan.googleStillDoesntShow"));
  if (noChangeYet) notes.push(t(locale, "dashboard.overview.actionPlan.checkAgainNote"));
  if (task.timingNote) notes.push(task.timingNote);
  return (
    <>
      <p className="text-[13.5px] text-ink" data-testid="fix-found-line">{line}</p>
      <p className="text-[11.5px] text-ink-mute" data-testid="fix-found-checked">{[checked, ...notes].join(" ")}</p>
    </>
  );
}

/** The review goal in words (lib/reviewGoal.ts), for the review task —
 * provided by the Growth page; empty elsewhere. */
export const ReviewGoalLinesContext = createContext<string[]>([]);

const isReviewTask = (task: ActionPlanTask) => task.checkId === MERGED_REVIEW_CHECK_ID || task.checkId === "visibility.review_count";

/** The check's own explanation — one line per check on the merged reviews
 * card (review count and rating each have their own "full credit at …") —
 * and, on the review task, the goal: beat the leader (shared wording). */
function ProblemText({ task }: { task: ActionPlanTask }) {
  const goalLines = useContext(ReviewGoalLinesContext);
  const lines = task.problemLines && task.problemLines.length > 0 ? task.problemLines : [task.problem];
  return (
    <>
      {lines.map((line) => (
        <p key={line} className="text-[12.5px] text-ink-soft">
          {line}
        </p>
      ))}
      {isReviewTask(task) &&
        goalLines.slice(1).map((line) => (
          <p key={line} className="text-[12.5px] font-semibold text-ink" data-testid="task-review-goal">
            {line}
          </p>
        ))}
    </>
  );
}

type MarkState = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string };

/** Which list a task card is rendered in — the SAME task (same checkId,
 * same effort) can legitimately appear in both "Growth recap" and
 * "Bigger projects" (see buildWeeklyPlan's duplication for
 * quick_win_action checks), so the badge/points framing is chosen by
 * context, not derived purely from the task's own effort field. */
export type TaskCardContext = "weekly" | "later";

function effortBadge(task: ActionPlanTask, context: TaskCardContext, locale: Locale): string {
  if (task.effort === "quick_win") return t(locale, "dashboard.overview.actionPlan.quickWin");
  if (task.effort === "quick_win_action") {
    return context === "weekly" ? t(locale, "dashboard.overview.actionPlan.thisWeeksAction") : t(locale, "dashboard.overview.actionPlan.ongoingOutcome");
  }
  return context === "weekly" ? t(locale, "dashboard.overview.actionPlan.firstStep") : t(locale, "dashboard.overview.actionPlan.longerTerm");
}

/** The small brass points chip — whole numbers only. Exported for tests. */
export function taskPointsLabel(task: ActionPlanTask, context: TaskCardContext, locale: Locale): string {
  // "+1 pt", never "+1 pts" (Day 23B).
  const label = taskPointsText(task, context, locale);
  return /\+1 pts\b/.test(label) ? label.replace(/\+1 pts\b/, "+1 pt") : label;
}

function taskPointsText(task: ActionPlanTask, context: TaskCardContext, locale: Locale): string {
  // The real weighted contribution to the 0-100 total (see
  // ActionPlanTask.weightedPoints) — what makes a weekly card's points
  // add up to "within reach".
  const range = task.weightedPointsHigh !== null ? wholePointRange(task.weightedPoints, task.weightedPointsHigh) : null;
  if (range !== null) {
    return range.high !== null
      ? t(locale, "dashboard.overview.actionPlan.pointsRangeOnceLive", { low: range.low, high: range.high })
      : t(locale, "dashboard.overview.actionPlan.pointsOnceLive", { points: range.low });
  }
  // Day 25B step 3: only a ceiling says "up to" ("Keep growing toward 150
  // reviews"); the other review rows are what they really earn ("+5 pts").
  if (task.upTo) return t(locale, "dashboard.overview.actionPlan.pointsUpTo", { points: wholePoints(task.weightedPoints) });
  if (REVIEW_SPLIT_IDS.includes(task.checkId) || task.when === "months") return pointsText(locale, wholePoints(task.weightedPoints));
  return context === "weekly" && task.effort !== "quick_win" && task.checkId !== MERGED_REVIEW_CHECK_ID
    ? t(locale, "dashboard.overview.actionPlan.pointsThisWeek", { points: wholePoints(task.weightedPoints) })
    : t(locale, "dashboard.overview.actionPlan.pointsUpTo", { points: wholePoints(task.weightedPoints) });
}

/** Fix plan: one decimal under 10, whole from 10 up ("+0.5 pts", "up to +6.8 pts", "+13 pts"). */
/** Fix plan v2: one short line on why the fix matters (fits one line; the full line when there's no short one). */
export function fixPlanWhy(task: Pick<ActionPlanTask, "checkId" | "why">, locale: Locale): string {
  const key = `dashboard.fixPlan.why.${task.checkId}` as MessageKey;
  const short = t(locale, key);
  return short === key ? task.why : short;
}

export function fixPlanPoints(task: Pick<ActionPlanTask, "weightedPoints" | "upTo">, locale: Locale): string {
  const points = String(displayPoints(task.weightedPoints));
  return t(locale, task.upTo ? "dashboard.fixPlan.upToPts" : "dashboard.fixPlan.pts", { points });
}

const PRIORITY_KEY: Record<FixPriority, MessageKey> = {
  urgent: "dashboard.overview.recs.urgent",
  high: "dashboard.overview.recs.high",
  medium: "dashboard.overview.recs.medium",
  low: "dashboard.fixPlan.priority.low",
};

export function FixPriorityTag({ priority }: { priority: FixPriority }) {
  const locale = useLocale();
  return (
    <span
      data-testid="fix-priority"
      data-priority={priority}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
        priority === "urgent" ? "bg-red text-white" : priority === "high" ? "bg-ink text-paper" : priority === "medium" ? "border border-ink/40 text-ink" : "border border-paper-deep text-ink-soft"
      )}
    >
      {t(locale, PRIORITY_KEY[priority])}
    </span>
  );
}

export function FixWhenTag({ when }: { when: FixWhen }) {
  const locale = useLocale();
  return (
    <span
      data-testid="fix-when"
      data-when={when}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        when === "this_week" ? "border-[color:color-mix(in_srgb,var(--color-green)_35%,white)] bg-[color:color-mix(in_srgb,var(--color-green)_10%,white)] text-green" : "border-paper-deep text-ink-soft"
      )}
    >
      {t(locale, `dashboard.fixPlan.when.${when}` as MessageKey)}
    </span>
  );
}

const POINTS_CHIP =
  "inline-flex w-fit items-center whitespace-nowrap rounded-full border border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_10%,white)] px-2.5 py-0.5 text-[12px] font-semibold text-ink";

/** §2d: Fix plan rows that are also Growth-tier actions — replying to reviews, and listing fixes (hours, phone,
 * website link, categories, customer details, address) — get "Counts toward your Growth tier". */
const TIER_COUNTING_CHECKS = new Set(["visibility.review_replies", "completeness.hours", "completeness.phone", "completeness.website_link", "completeness.categories", "completeness.customer_details", "completeness.address", "website.info_consistency"]);
export function countsTowardTier(task: { checkId: string; mergedCheckIds?: string[] | null }): boolean {
  return TIER_COUNTING_CHECKS.has(task.checkId) || (task.mergedCheckIds ?? []).some((id) => TIER_COUNTING_CHECKS.has(id));
}

export function TaskCard({
  task,
  businessId,
  context = "later",
  lastScanAt = null,
  step = null,
  websiteRecheck = null,
  premium = false,
  merged = [],
  hoursCheck = null,
  fixPlan = null,
}: {
  task: ActionPlanTask;
  businessId: string;
  /** Day 25B step 3, Fix plan: its priority, the running score after it, and
   * Free's lock (the steps are a locked preview; no "I did this"). */
  fixPlan?: { priority: FixPriority; running: number; locked: boolean; compact?: { open: boolean; outline: boolean } } | null;
  /** Day 23B: the details mismatches this task shows with every version (one task per field). */
  merged?: DetailsMismatch[];
  /** Day 23B: this hours check as it is now — matching (re-scan) or the exact days that differ. */
  hoursCheck?: HoursCheckState | null;
  /** Premium: steps PostScore will one day do say "Coming soon". */
  premium?: boolean;
  context?: TaskCardContext;
  /** When the business's most recent scan ran — see getLastScanAt(). */
  lastScanAt?: string | null;
  /** 1, 2, 3… in "Growth recap". */
  step?: number | null;
  /** Which tools this business has — for the fix link (same as PostAI's). */
  linkOptions?: LinkOptions;
  /** Website re-checks left today — website fixes get "Re-check my website". */
  websiteRecheck?: WebsiteRecheckProps | null;
}) {
  const router = useRouter();
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  // Fix plan v2 (compact rows): the row itself opens; only the first starts open.
  const [rowOpen, setRowOpen] = useState(!!fixPlan?.compact?.open);
  const [state, setState] = useState<MarkState>({ kind: "idle" });
  const fixCtx = useFixContext(businessId);
  // Day 23B: ONE button (lib/fixDestination.ts). Premium with Google writes:
  // "PostScore can do this for you" (the editor); "Coming soon" only for
  // steps PostScore has no editor for yet.
  const fixItem = { checkId: task.checkId, mergedCheckIds: task.mergedCheckIds, hoursMismatch: task.checkId === GOOGLE_MISMATCH_CHECK_ID && (task.mismatchFields ?? []).includes("hours") };
  // An editor exists for this step at all (whatever this business's connection or writes).
  const hasEditor = fixDestination(fixItem, { ...fixCtx, premium: true, connected: true, canEdit: true }).kind === "do_it";
  // PostScore can make this change now (Premium, Google connected, writes allowed for this place).
  const canDo = fixDestination(fixItem, fixCtx)?.kind === "do_it";
  // Otherwise who does it: Grow/Free on Google (the Premium line says what Premium does); Premium not
  // connected: connect; connected but writes off here: read only for now; no editor at all: you, on Google.
  const whoMakesIt: "self" | "connect" | "read_only" | "manual" = !hasEditor ? "manual" : !fixCtx.premium ? "self" : !hasGoogleTab(fixCtx) ? "connect" : "read_only";
  const cardId = `task-${task.checkId.replace(/\./g, "-")}`;
  // "?open=howto#task-…" (the step-by-step from the Overview): open "How to fix it" here.
  useEffect(() => {
    const open = () => {
      if (window.location.hash.slice(1) === cardId && new URLSearchParams(window.location.search).get("open") === "howto") {
        setExpanded(true);
        setRowOpen(true);
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [cardId]);

  async function handleMarkDone() {
    setState({ kind: "saving" });
    // The merged reviews card stands in for 2-3 real checks (see
    // splitReviewTasks in lib/actionPlan.ts) — "I did this" marks every
    // one of their real underlying tasks rows, never the synthetic
    // checkId itself (which names no real task row).
    const checkIds = task.mergedCheckIds ?? [task.checkId];
    const results = await Promise.all(checkIds.map((checkId) => markTaskDone(businessId, checkId)));
    const failed = results.find((r) => r.status !== "ok");
    if (!failed) {
      router.refresh();
    } else {
      setState({
        kind: "error",
        message: failed.status === "error" ? failed.message : t(locale, "dashboard.overview.actionPlan.couldNotSave"),
      });
    }
  }

  const isPending = task.status === "pending_verification";
  const pendingStatus = isPending ? pendingCheckStatus(task, lastScanAt) : null;
  const metricProgress = isPending ? weeklyMetricProgress(task, lastScanAt) : null;
  // Once a re-scan has actually looked at this task (whichever way it
  // went), hand it back to the owner as a fresh weekly ask.
  const checkedAlready = metricProgress ? metricProgress.kind !== "not_yet_checked" : pendingStatus !== null && pendingStatus !== "not_yet_checked";
  const canMarkAgain = isPending && checkedAlready;
  // Checked, nothing changed yet: Google can be slow to show an edit.
  const noChangeYet = canMarkAgain && (metricProgress ? metricProgress.kind === "not_quite_yet" : pendingStatus === "unchanged");
  const status = taskStatus(task, pendingStatus, metricProgress, locale);
  // The obtainable ask, front and center — a weekly target for a
  // gradual check, or the one-shot action itself when there isn't one.
  const headline = task.weeklyTarget ?? task.action;
  const isSetup = task.effort === "setup";
  // The task's own links (PostScore tool, official Google pages): in "How to fix it".
  const stepLinks = task.links ?? [];
  // The card title is the action; the check's name is the small label.
  // Merged with the confirmed details: "Your hours don't match everywhere".
  const hours = merged.length === 0 ? shownHoursState(task, hoursCheck) : null;
  const stale = hours?.kind === "stale";
  const waiting = hoursWaitingOnGoogle(hours);
  // A hours check that matches now keeps its real title; "Changed since your last scan" is a note under it.
  const plainTitle = merged.length > 0 ? mergedTitle(merged, locale) : stale ? t(locale, "content.actionPlan.title.website.info_consistency.hours") : (task.title ?? task.label);
  // "Get 3 new reviews in the next 90 days (30 → 33)": the target already says the title — one line.
  const title = headline.startsWith(plainTitle) && merged.length === 0 && !stale ? headline : plainTitle;
  // Google and the website agree now: only the confirmed details differ — the
  // scan's "show different hours" line and its points are out of date.
  const ownerOnly = merged.length > 0 && mergedKind(merged) === "owner_only";

  // The one main button (lib/fixDestination.ts) and the rest of the row's actions — shared by the card and Fix plan's compact row.
  const mainButton = (
    <>
              {stale ? (
                <RescanNowButton businessId={businessId} lastScanAt={lastScanAt} />
              ) : fixPlan?.locked ? (
                // Free: "Fix it" opens the steps as a locked preview.
                <button type="button" onClick={() => { setExpanded(true); setRowOpen(true); }} data-testid="fix-button" data-kind="locked" className={fixPlan?.compact?.outline ? cn(FIX_BUTTON_CLASS, "!border-paper-deep !bg-white !text-ink hover:!bg-paper") : FIX_BUTTON_CLASS}>
                  {t(locale, "dashboard.fixPlan.fixIt")} →
                </button>
              ) : merged.length > 0 ? (
                <MergedActions businessId={businessId} mismatches={merged} only="button" premiumLine={false} />
              ) : (
                <FixButton
                  businessId={businessId}
                  item={fixItem}
                  premiumLine={false}
                  fixPlan={!!fixPlan}
                  className={fixPlan?.compact?.outline ? "!border-paper-deep !bg-white !text-ink hover:!bg-paper" : undefined}
                  onSteps={() => {
                    setExpanded(true);
                    setRowOpen(true);
                    requestAnimationFrame(() => document.getElementById(cardId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
                  }}
                />
              )}
    </>
  );
  const secondaryActions = (
    <>
              {/* A row that grows over time ("Grow to 40 reviews") has no "I did this": its one action is row 1's. */}
              {(!isPending || canMarkAgain) && !stale && task.markable !== false && !fixPlan?.locked && (
                <Button variant="default" size="sm" onClick={handleMarkDone} disabled={state.kind === "saving"}>
                  {state.kind === "saving"
                    ? t(locale, "dashboard.overview.actionPlan.saving")
                    : canMarkAgain
                      ? t(locale, "dashboard.overview.actionPlan.checkAgain")
                      : t(locale, "dashboard.overview.actionPlan.didThis")}
                </Button>
              )}
              {state.kind === "error" && <span className="text-[12px] text-red">{state.message}</span>}
              {merged.length > 0 && (
                <div className="w-full">
                  <MergedActions businessId={businessId} mismatches={merged} only="link" />
                </div>
              )}
              {/* CLAUDE.md "Plans": Grow/Free — under the steps, what Premium does in one click. */}
              {(merged.length === 0 || mergedKind(merged) !== "owner_only") && !stale && (
                <PremiumOneClickLine businessId={businessId} item={merged.length > 0 ? (mergedOneClickItem(merged) ?? fixItem) : fixItem} className="w-full" />
              )}
              {noChangeYet && (
                <p data-testid="check-again-note" className="w-full text-[12px] text-ink-mute">
                  {t(locale, "dashboard.overview.actionPlan.checkAgainNote")}
                </p>
              )}
    </>
  );

  // "How to fix it": the steps, or Free's locked preview.
  const howToBody = fixPlan?.locked ? (

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-paper-line bg-paper p-3.5 text-[13px] text-ink-soft" data-testid="fix-plan-steps-locked">
                <IconLock size={14} className="text-brass" aria-hidden />
                <span>{t(locale, "dashboard.googlePages.listing.locked")}</span>
                <UpgradeTrigger feature="grow" />
              </div>
  ) : (

              <div className="mt-2 rounded-xl border border-paper-line bg-paper p-3.5 text-[13px] leading-relaxed text-ink-soft">
                {canDo && (
                  <div className="mb-2.5 flex flex-col gap-2 border-b border-paper-line pb-2.5" data-testid="how-to-done-for-you">
                    <p className="font-medium text-ink">{t(locale, "dashboard.overview.actionPlan.doneForYou")}</p>
                    <div className="flex flex-wrap items-center gap-2">{mainButton}</div>
                  </div>
                )}
                <p className="mb-1.5">
                  <span className="font-semibold text-ink">{t(locale, "dashboard.overview.actionPlan.doThisLabel")}</span>
                  {task.action}
                </p>
                <p className="whitespace-pre-line">
                  <span className="font-semibold text-ink">{t(locale, "dashboard.overview.actionPlan.howLabel")}</span>
                  {task.fix}
                </p>
                {/* The steps' own pages (official Google help, the listing) — links, never a second button. */}
                {!isSetup && (stepLinks.length > 0 || (task.checkId.startsWith("completeness.") && !hasEditor)) && (
                  <p data-testid="how-to-links" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                    {task.checkId.startsWith("completeness.") && !hasEditor && <span className="text-ink-mute">{t(locale, "dashboard.fix.orOnGoogle")}</span>}
                    {stepLinks.map((link) =>
                      link.external ? (
                        <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline decoration-brass underline-offset-2">
                          {link.label} ↗
                        </a>
                      ) : (
                        <Link key={link.href} href={link.href} className="font-semibold text-ink underline decoration-brass underline-offset-2">
                          {link.label}
                        </Link>
                      )
                    )}
                    {task.checkId.startsWith("completeness.") && !hasEditor && !stepLinks.some((l) => l.external) && (
                      <a href={GOOGLE_BUSINESS_URL} target="_blank" rel="noopener noreferrer" data-testid="open-on-google" className="font-semibold text-ink underline decoration-brass underline-offset-2">
                        {t(locale, "dashboard.fix.openOnGoogle")} ↗
                      </a>
                    )}
                  </p>
                )}
                {/* Day 23B: one main button + "I did this" on the card; the re-check lives with the steps. */}
                {websiteRecheck && task.checkId.startsWith("website.") && task.checkId !== "website.has_website" && (
                  <div className="mt-2.5 border-t border-paper-line pt-2.5" data-testid="how-to-recheck">
                    <WebsiteRecheck businessId={businessId} initialLeft={websiteRecheck.left} hasWebsite={websiteRecheck.hasWebsite} compact />
                  </div>
                )}
                {/* Who makes this change, by plan, connection and whether PostScore can write it: never "we can't edit your listing" when it can. */}
                {task.ownerActionOnGoogle && !canDo && (
                  <p className="mt-2.5 flex items-start gap-1.5 border-t border-paper-line pt-2.5 text-[12px] text-ink-mute" data-testid="how-to-who" data-who={whoMakesIt}>
                    <IconBrandGoogle size={14} className="mt-0.5 shrink-0" aria-hidden />
                    <span>
                      {whoMakesIt === "connect" ? (
                        <>
                          <Link href={`/business/${businessId}/connect-gbp`} className="font-semibold text-ink underline decoration-brass underline-offset-2">{t(locale, "dashboard.overview.actionPlan.connectToDo")}</Link>{" "}
                        </>
                      ) : whoMakesIt === "read_only" ? (
                        <>{t(locale, "dashboard.googleTab.w.readOnly")} </>
                      ) : whoMakesIt === "manual" ? (
                        <>{t(locale, "dashboard.overview.actionPlan.manualOnGoogle")} </>
                      ) : null}
                      <span data-testid="after-google-change" className="font-medium text-ink-soft">{t(locale, "dashboard.rescan.afterGoogleChange")}</span>
                    </span>
                  </p>
                )}
              </div>
  );
  // Fix plan v2: one compact row — number, priority, title, status dot, one short "why", "+6 pts → 84" and the
  // main button; the row opens to the evidence, how to fix it, "I did this" / "Check again".
  if (fixPlan?.compact) {
    const dot = { neutral: "bg-[#c6c0b0]", amber: "bg-amber", brass: "bg-brass", green: "bg-green", red: "bg-red" }[status.variant as string] ?? "bg-[#c6c0b0]";
    // The row's ONE primary button: in the row while it's closed, in "What to do" once it's open — never both.
    // A Fix plan step that would only open this row again goes to Google instead.
    const dest = fixDestination(fixItem, fixCtx);
    const ownSteps = dest.kind === "steps" && isFixPlanStepsHref(dest.href);
    const oneClick = canDo && merged.length === 0 && !stale && !fixPlan.locked;
    const buttonHref = stale || merged.length > 0 || fixPlan.locked ? null : ownSteps ? GOOGLE_BUSINESS_URL : dest.href;
    const bodyButton = stale || merged.length > 0 || fixPlan.locked || !ownSteps ? (
      mainButton
    ) : (
      <a href={GOOGLE_BUSINESS_URL} target="_blank" rel="noopener noreferrer" data-testid="fix-button" data-kind="google" className={fixPlan.compact.outline ? cn(FIX_BUTTON_CLASS, "!border-paper-deep !bg-white !text-ink hover:!bg-paper") : FIX_BUTTON_CLASS}>
        {t(locale, "dashboard.fixPlan.row.openGoogle")} ↗
      </a>
    );
    const steps = fixRowSteps(task, locale);
    const stepList = (
      <ol className="flex list-none flex-col gap-1.5" data-testid="fix-steps">
        {steps.map((line, i) => (
          <li key={line} className="flex gap-2 text-[13px] leading-snug text-ink">
            <span aria-hidden className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-paper text-[11px] font-semibold text-ink-soft">{i + 1}</span>
            <span>{line}</span>
          </li>
        ))}
      </ol>
    );
    const help = moreHelpLinks(isSetup ? [] : stepLinks, buttonHref);
    const markable = (!isPending || canMarkAgain) && !stale && task.markable !== false && !fixPlan.locked;
    const section = "text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute";
    return (
      <li id={cardId} className="scroll-mt-20 border-t border-paper-line first:border-t-0" data-testid="fix-row" data-open={rowOpen || undefined}>
        <div className={cn("grid grid-cols-[26px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5 nav:grid-cols-[26px_112px_minmax(0,1fr)_auto]", rowOpen && "bg-[color:color-mix(in_srgb,var(--color-paper)_60%,white)]")}>
          <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full font-serif text-[12.5px] font-semibold text-ink ps-icon-tile">{step}</span>
          {/* The priority sits in its own column, so it lines up on every row whatever the title's length. */}
          <span className="hidden nav:block">{task.urgent ? <span data-testid="task-urgent" className="inline-flex whitespace-nowrap rounded-full bg-red px-2 py-0.5 text-[11px] font-semibold text-white">{t(locale, "dashboard.overview.recs.urgent")}</span> : waiting ? <WaitingForGoogleTag /> : !stale && <FixPriorityTag priority={fixPlan.priority} />}</span>
          <button type="button" onClick={() => setRowOpen((o) => !o)} aria-expanded={rowOpen} className="col-start-2 min-w-0 text-left nav:col-start-3">
            <span className="mb-1 flex nav:hidden">{task.urgent ? <span className="inline-flex whitespace-nowrap rounded-full bg-red px-2 py-0.5 text-[11px] font-semibold text-white">{t(locale, "dashboard.overview.recs.urgent")}</span> : waiting ? <WaitingForGoogleTag /> : !stale && <FixPriorityTag priority={fixPlan.priority} />}</span>
            <span className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
              <span>{title}</span>
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dot)} title={status.label} aria-label={status.label} data-testid="fix-row-status" data-variant={status.variant} />
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-mute" data-testid="fix-row-why">{stale ? t(locale, "dashboard.hoursCheck.staleTitle") : waiting ? t(locale, "dashboard.hoursCheck.profileMatches") : fixPlanWhy(task, locale)}</span>
            {/* §2d: a Presence fix that's also a Growth-tier action (replies, listing fixes). */}
            {countsTowardTier(task) && (
              <span className="mt-1 inline-flex w-fit rounded-full border border-paper-deep bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-soft" data-testid="counts-toward-tier">
                {t(locale, "dashboard.fixPlan.countsTowardTier")}
              </span>
            )}
          </button>
          <div className="col-start-2 flex items-center justify-between gap-3 nav:col-start-4 nav:justify-end" data-testid="fix-plan-points">
            <span className="whitespace-nowrap text-[13px] font-semibold text-ink-soft">
              {fixPlanPoints(task, locale)} → <b className="font-serif text-[16px] text-ink">{fixPlan.running}</b>
            </span>
            <span className="flex items-center gap-2">
              {/* Waiting on Google Maps: nothing for the owner to fix, so no button. */}
              {!rowOpen && !waiting && mainButton}
              <button type="button" onClick={() => setRowOpen((o) => !o)} aria-label={t(locale, rowOpen ? "dashboard.overview.actionPlan.hideHowToFix" : "dashboard.overview.actionPlan.howToFixIt")} className="text-ink-mute hover:text-ink">
                <IconChevronDown size={16} className={cn("transition-transform", rowOpen && "rotate-180")} aria-hidden />
              </button>
            </span>
          </div>
        </div>
        {rowOpen && (
          <div className="flex flex-col gap-3.5 px-4 pb-4 sm:px-5 nav:pl-[57px]" data-testid="fix-row-body">
            {/* 1. What we found: one line, the checked date small. */}
            <section className="flex flex-col gap-1" data-testid="fix-found">
              <h4 className={section}>{t(locale, "dashboard.fixPlan.row.found")}</h4>
              {stale ? (
                <p data-testid="hours-stale" className="text-[13.5px] text-ink">{t(locale, "dashboard.hoursCheck.staleTitle")}</p>
              ) : merged.length > 0 ? (
                <DetailsVersions mismatches={merged} />
              ) : hours?.kind === "differs" ? (
                <HoursDiffLines state={hours} />
              ) : (
                <FixFound task={task} pendingStatus={pendingStatus} metricProgress={metricProgress} lastScanAt={lastScanAt} noChangeYet={noChangeYet} />
              )}
            </section>
            {/* 2. What to do: one sentence + the button (one click), or up to 3 steps + the button. */}
            {!isSetup && (
              <section className="flex flex-col gap-2" data-testid="fix-todo" data-who={whoMakesIt} data-mode={stale ? "rescan" : waiting ? "waiting" : fixPlan.locked ? "locked" : oneClick ? "one_click" : "steps"}>
                <h4 className={section}>{t(locale, "dashboard.fixPlan.row.todo")}</h4>
                {waiting ? (
                  <p className="text-[13px] text-ink" data-testid="hours-waiting">{t(locale, "dashboard.fixPlan.row.waiting")}</p>
                ) : stale ? (
                  <>
                    <p className="text-[13px] text-ink">{t(locale, "dashboard.fixPlan.row.stale")}</p>
                    <div className="flex flex-wrap items-center gap-2">{mainButton}</div>
                  </>
                ) : fixPlan.locked ? (
                  <>
                    {stepList}
                    {howToBody}
                  </>
                ) : oneClick ? (
                  <>
                    <p className="text-[13px] text-ink">{oneClickSentence(task, locale)}</p>
                    <div className="flex flex-wrap items-center gap-2">{bodyButton}</div>
                    <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} data-testid="fix-diy" className="w-fit text-[12px] font-medium text-ink-mute underline decoration-paper-deep underline-offset-2 hover:text-ink">
                      {t(locale, expanded ? "dashboard.fixPlan.row.diyHide" : "dashboard.fixPlan.row.diy")}
                    </button>
                    {expanded && stepList}
                  </>
                ) : (
                  <>
                    {merged.length === 0 && stepList}
                    <div className="flex flex-wrap items-center gap-2">{bodyButton}</div>
                    {/* CLAUDE.md "Plans": Grow — what Premium does in one click, next to the steps. */}
                    {(merged.length === 0 || mergedKind(merged) !== "owner_only") && <PremiumOneClickLine businessId={businessId} item={merged.length > 0 ? (mergedOneClickItem(merged) ?? fixItem) : fixItem} />}
                    {/* Who makes this change (plan, connection, writes). */}
                    {task.ownerActionOnGoogle && whoMakesIt !== "self" && (
                      <p className="text-[12px] text-ink-mute" data-testid="how-to-who" data-who={whoMakesIt}>
                        {whoMakesIt === "connect" ? (
                          <Link href={`/business/${businessId}/connect-gbp`} className="font-semibold text-ink underline decoration-brass underline-offset-2">{t(locale, "dashboard.overview.actionPlan.connectToDo")}</Link>
                        ) : whoMakesIt === "read_only" ? (
                          t(locale, "dashboard.googleTab.w.readOnly")
                        ) : (
                          t(locale, "dashboard.overview.actionPlan.manualOnGoogle")
                        )}
                      </p>
                    )}
                  </>
                )}
              </section>
            )}
            {/* 3. Footer: "I did this" / "Check again" · More help ↗ (Google's help pages live inside). */}
            {!isSetup && (markable || help.length > 0 || merged.length > 0 || (websiteRecheck && task.checkId.startsWith("website.") && task.checkId !== "website.has_website")) && (
              <footer className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-paper-line pt-2.5 text-[12.5px]" data-testid="fix-footer">
                {markable && (
                  <button type="button" onClick={handleMarkDone} disabled={state.kind === "saving"} data-testid="fix-mark" className="font-semibold text-ink underline decoration-paper-deep underline-offset-2 hover:decoration-ink disabled:opacity-60">
                    {state.kind === "saving" ? t(locale, "dashboard.overview.actionPlan.saving") : canMarkAgain ? t(locale, "dashboard.overview.actionPlan.checkAgain") : t(locale, "dashboard.overview.actionPlan.didThis")}
                  </button>
                )}
                {merged.length > 0 && (
                  <>
                    {markable && <span aria-hidden className="text-ink-mute">·</span>}
                    <MergedActions businessId={businessId} mismatches={merged} only="link" />
                  </>
                )}
                {help.length > 0 && (
                  <details className="group" data-testid="fix-more-help">
                    <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                      {(markable || merged.length > 0) && <span aria-hidden className="font-normal text-ink-mute">·</span>}
                      <span className="underline decoration-paper-deep underline-offset-2 group-open:decoration-ink">{t(locale, "dashboard.fixPlan.row.moreHelp")} ↗</span>
                    </summary>
                    <span className="mt-1.5 flex flex-col gap-1 pl-3">
                      {help.map((link) =>
                        link.external ? (
                          <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="w-fit text-ink-soft underline decoration-brass underline-offset-2 hover:text-ink">
                            {link.label} ↗
                          </a>
                        ) : (
                          <Link key={link.href} href={link.href} className="w-fit text-ink-soft underline decoration-brass underline-offset-2 hover:text-ink">
                            {link.label}
                          </Link>
                        )
                      )}
                    </span>
                  </details>
                )}
                {websiteRecheck && task.checkId.startsWith("website.") && task.checkId !== "website.has_website" && (
                  <div className="w-full" data-testid="how-to-recheck">
                    <WebsiteRecheck businessId={businessId} initialLeft={websiteRecheck.left} hasWebsite={websiteRecheck.hasWebsite} compact />
                  </div>
                )}
                {state.kind === "error" && <span className="w-full text-[12px] text-red">{state.message}</span>}
              </footer>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <li id={cardId} className="scroll-mt-20 rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-3">
        {step !== null && (
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-serif text-[14px] font-semibold text-ink ps-icon-tile">
            {step}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {task.urgent && (
                <span data-testid="task-urgent" className="inline-flex items-center whitespace-nowrap rounded-full bg-red px-2 py-0.5 text-[11px] font-semibold text-white">
                  {t(locale, "dashboard.overview.recs.urgent")}
                </span>
              )}
              <h3 className="text-[14.5px] font-semibold text-ink">{title}</h3>
              {fixPlan ? (
                <>
                  {waiting ? (
                    <WaitingForGoogleTag />
                  ) : (
                    <>
                      {!task.urgent && !stale && <FixPriorityTag priority={fixPlan.priority} />}
                      <FixWhenTag when={task.when ?? "weeks"} />
                    </>
                  )}
                  {/* Phones: the status under the tags, so the title keeps its width. */}
                  {isPending && (
                    <StatusPill variant={status.variant} className="sm:hidden">
                      {status.label}
                    </StatusPill>
                  )}
                </>
              ) : (
                <>
                  {/* Day 25B step 3: the same tag as Fix plan (This week / Takes a few weeks / Takes months). */}
                  {!isSetup && (waiting ? <WaitingForGoogleTag /> : task.when ? <FixWhenTag when={task.when} /> : <span className="text-[11.5px] text-ink-mute">{effortBadge(task, context, locale)}</span>)}
                  {task.minutes ? <span className="text-[11.5px] text-ink-mute">· {timeEstimateText(task.minutes, locale)}</span> : null}
                </>
              )}
              {!fixPlan && title !== task.label && !task.mergedLabels && (
                <span data-testid="task-check-label" className="w-full text-[11.5px] text-ink-mute">
                  {task.label}
                </span>
              )}
            </div>
            {fixPlan ? (
              <div className="flex shrink-0 flex-col items-end gap-1.5" data-testid="fix-plan-points">
                <span className={POINTS_CHIP}>{fixPlanPoints(task, locale)}</span>
                <span className="whitespace-nowrap text-[13px] text-ink-soft">
                  {t(locale, "dashboard.fixPlan.scoreArrow", { score: "" }).trim()} <b className="font-serif text-[18px] text-ink">{fixPlan.running}</b>
                </span>
                {isPending && (
                  <StatusPill variant={status.variant} className="hidden shrink-0 sm:inline-flex">
                    {status.label}
                  </StatusPill>
                )}
              </div>
            ) : (
              !isSetup && (
                <StatusPill variant={status.variant} className="shrink-0">
                  {status.label}
                </StatusPill>
              )
            )}
          </div>

          {stale && (
            <p data-testid="hours-stale" className="-mt-1 text-[12.5px] text-ink-soft">
              {t(locale, "dashboard.hoursCheck.staleTitle")}
            </p>
          )}

          {premium && task.automatable && !hasEditor && (
            <p data-testid="step-coming-soon" className="w-fit rounded-full border border-paper-deep bg-paper px-2.5 py-0.5 text-[11.5px] font-medium text-ink-soft">
              {t(locale, "content.actionPlan.step.comingSoon")}
            </p>
          )}

          {!isSetup && !ownerOnly && !stale && (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              {/* Never the title twice ("Reply to your recent reviews"); the hours check names the days that differ. */}
              {hours?.kind === "differs" ? <HoursDiffLines state={hours} /> : headline !== title && <p className="text-[13.5px] font-medium text-ink">{headline}</p>}
              {!fixPlan && <span className={POINTS_CHIP}>{taskPointsLabel(task, context, locale)}</span>}
            </div>
          )}

          <p className="text-[12.5px] leading-snug text-ink-soft">{task.why}</p>

          {task.mergedLabels && task.mergedLabels.length > 0 && (
            <p className="text-[12px] text-ink-mute">
              <span className="font-medium text-ink-soft">{t(locale, "dashboard.overview.actionPlan.mergedReviewsHelpsLabel")}</span>{" "}
              {task.mergedLabels.join(", ")}
            </p>
          )}

          {task.timingNote && <p className="text-[12px] italic text-ink-mute">{task.timingNote}</p>}

          {/* The hours check as it is now already names the days; the scan's sentence would repeat (or contradict) them. */}
          {merged.length > 0 ? <DetailsVersions mismatches={merged} /> : hours ? null : <CurrentStatus task={task} pendingStatus={pendingStatus} metricProgress={metricProgress} lastScanAt={lastScanAt} />}


          <div>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink hover:text-brass"
            >
              {expanded ? t(locale, "dashboard.overview.actionPlan.hideHowToFix") : t(locale, "dashboard.overview.actionPlan.howToFixIt")}
              <IconChevronDown size={14} className={cn("transition-transform", expanded && "rotate-180")} aria-hidden />
            </button>
            {expanded && howToBody}
          </div>

          {isSetup && (task.href || stepLinks.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-paper-line pt-3">
              {task.href && (
                <Link href={task.href} data-testid="fix-button" className={FIX_BUTTON_CLASS}>
                  {t(locale, "content.actionPlan.connectGoogle.link")}
                </Link>
              )}
              {stepLinks.map((link) => (
                <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className={LINK_PILL_CLASS}>
                  {link.label} ↗
                </a>
              ))}
            </div>
          )}

          {!isSetup && (
            <div className="flex flex-wrap items-center gap-2 border-t border-paper-line pt-3">
              {/* Day 23B: Premium without Google connected — what connecting adds. */}
              {fixCtx.premium && !hasGoogleTab(fixCtx) && hasEditor && (
                <Link href={`/business/${businessId}/connect-gbp`} data-testid="fix-connect" className="w-full text-[12.5px] font-semibold text-ink underline decoration-brass underline-offset-2">
                  {t(locale, "dashboard.detailsMismatch.connect")}
                </Link>
              )}
              {mainButton}
              {secondaryActions}
            </div>
          )}

        </div>
      </div>
    </li>
  );
}

const MOVE_ICON: Record<GrowthMove["id"], typeof IconTicket> = {
  start_coupon: IconTicket,
  start_referral: IconUsers,
  run_price_check: IconTag,
  add_photos_vs_competitors: IconPhoto,
  build_starter_site: IconWorld,
  improve_website: IconWorld,
};

/**
 * A growth move's card — never a status pill, points, or a mark-done
 * button: a growth move never earns points on its own. The small neutral
 * pill is the one thing that must never be skipped — it keeps a growth
 * move from being mistaken for a scored task. `overlapsActionPlan` is real
 * live data (growthMoveOverlapsActionPlan): when this move's real check
 * is CURRENTLY an open task above, the pill says so instead of the
 * flatly-false "doesn't change your score".
 */
export function GrowthMoveCard({ move, overlapsActionPlan }: { move: GrowthMove; overlapsActionPlan: boolean }) {
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const Icon = MOVE_ICON[move.id] ?? IconTrendingUp;

  return (
    <li className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-paper-deep bg-white p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
          <Icon size={17} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-[14px] font-semibold text-ink">{move.title}</h3>
          <StatusPill variant="neutral" className="!text-[10.5px] !font-medium">
            {t(locale, overlapsActionPlan ? "dashboard.growth.moves.badgeAlsoScored" : "dashboard.growth.moves.badge")}
          </StatusPill>
        </div>
      </div>
      {move.meta && <p className="text-[11.5px] text-ink-mute">{move.meta}</p>}
      <p className="text-[12.5px] leading-snug text-ink-soft">{move.why}</p>
      <div>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink hover:text-brass"
        >
          {expanded ? t(locale, "dashboard.overview.actionPlan.hideHowToFix") : t(locale, "dashboard.overview.actionPlan.howToFixIt")}
          <IconChevronDown size={14} className={cn("transition-transform", expanded && "rotate-180")} aria-hidden />
        </button>
        {expanded && <p className="mt-2 rounded-xl border border-paper-line bg-paper p-3.5 text-[13px] leading-relaxed text-ink-soft">{move.howTo}</p>}
      </div>
      <Link href={move.href} className={cn(LINK_PILL_CLASS, "mt-auto")}>
        {t(locale, "dashboard.growth.moves.goLabel")} →
      </Link>
    </li>
  );
}

/** Tasks as separate cards (numbered in "Growth recap"), or an honest
 * empty-state message — the caller supplies it so "nothing left this
 * week" can read differently from "nothing longer-term either". */
export function TaskListCard({
  tasks,
  businessId,
  emptyMessage,
  footnote,
  context = "later",
  lastScanAt = null,
  linkOptions = {},
  websiteRecheck = null,
  premium = false,
  detailsMismatches = [],
  hoursCheck = null,
}: {
  tasks: ActionPlanTask[];
  businessId: string;
  /** See TaskCard's premium. */
  premium?: boolean;
  /** Day 23B: confirmed details that differ — merged into "Matches your Google listing". */
  detailsMismatches?: DetailsMismatch[];
  /** Day 23B: the scored hours check as it is now (lib/hoursCheck.ts). */
  hoursCheck?: HoursCheckState | null;
  emptyMessage: string;
  footnote?: string;
  context?: TaskCardContext;
  lastScanAt?: string | null;
  linkOptions?: LinkOptions;
  websiteRecheck?: WebsiteRecheckProps | null;
}) {
  if (tasks.length === 0) {
    return <Card className="p-5 text-sm text-ink-soft">{emptyMessage}</Card>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {tasks.map((task, i) => (
          <TaskCard
            key={task.checkId}
            task={task}
            businessId={businessId}
            context={context}
            lastScanAt={lastScanAt}
            step={context === "weekly" ? i + 1 : null}
            linkOptions={linkOptions}
            websiteRecheck={websiteRecheck}
            premium={premium}
            merged={mismatchesCoveredBy(task, detailsMismatches)}
            hoursCheck={isHoursCheck(task) ? hoursCheck : null}
          />
        ))}
      </ol>
      {/* Listing tasks quote the Google listing (reviews, rating, hours…):
          the logo shares the footnote's line. */}
      {tasks.some(showsListingData) ? (
        <GoogleMapsAttribution className="mt-0 px-1">{footnote && <p className="text-[12px] text-ink-mute">{footnote}</p>}</GoogleMapsAttribution>
      ) : (
        footnote && <p className="px-1 text-[12px] text-ink-mute">{footnote}</p>
      )}
    </div>
  );
}

/** A task about the Google listing (not the website), or the website task
 * that compares against Google's listing. */
function showsListingData(task: ActionPlanTask): boolean {
  return !task.checkId.startsWith("website.") || task.checkId.includes("google");
}

export function CompletedTasksCard({ completed }: { completed: CompletedTask[] }) {
  const locale = useLocale();
  if (completed.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        {t(locale, "dashboard.overview.actionPlan.confirmedWinsHeading")}
      </div>
      <div className="flex flex-col divide-y divide-paper-line">
        {completed.map((task) => (
          <div key={task.checkId} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <span className="flex items-center gap-2 text-sm text-ink">
              <IconCircleCheck size={16} className="shrink-0 text-green" aria-hidden />
              {task.label}
            </span>
            <StatusPill variant="green" className="shrink-0">
              {t(locale, "dashboard.overview.actionPlan.pointsConfirmed", { points: wholePoints(task.pointsGained) })}
            </StatusPill>
          </div>
        ))}
      </div>
    </Card>
  );
}
