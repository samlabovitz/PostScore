"use client";

// Day 25B v3 (docs/mockups/day25b/fix-plan-v3.html): the ONE weekly plan for
// the score. Above the rows, two separate sends — "Post {n} review replies" and
// "Update your Google listing ({m})", each with a confirm step naming what goes
// (Premium; Grow sees what's drafted and the Premium line); the
// replies and listing-details rows read the same drafts (the real saved ones),
// the review-earning rows name the Growth habit that earns them, and a holiday
// with no hours set gets its own row ("Protects customers · no points").
// From v2 (docs/mockups/day25b/fix-plan-v2.html): Presence → Fix
// plan. A slim top card ("This week: 78 → 87" · "When every fix is done:
// 100 · A"), then the fixes under "This week" · "Takes a few weeks" · "Takes
// months", each with its subtotal, as compact rows: number, priority, title,
// a status dot, one short why, "+6 pts → 84" and the one button to where
// it's fixed (lib/fixDestination.ts; outline under "Takes months"). A row
// opens to its evidence, how to fix it and "I did this" / "Check again";
// only the first starts open. "Website speed: not scored yet" ends "Takes a
// few weeks". The rows are the Growth recap's own step cards in compact mode
// (#task-…, ?open=howto), so anchors and the step-by-step keep working.
// Plans: Free sees the whole ranked list with points (it's the audit) and
// the steps as a locked preview; Grow gets the steps, "I did this" and
// "Premium does this for you in one click →"; Premium's "Fix it" lands on
// the one-click action.

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { IconWorld } from "@tabler/icons-react";
import { TaskCard, CompletedTasksCard, FixPriorityTag, ReviewGoalLinesContext, type FixRowExtra, type WebsiteRecheckProps } from "@/app/business/[id]/ActionPlanSection";
import { answersReady } from "@/components/gbp/ApproveAll";
import { SendToGoogle } from "@/components/fixPlan/SendToGoogle";
import { useWeekReplies, type WeekRepliesState } from "@/components/gbp/RepliesPreview";
import { useAnswers, type AnswersState } from "@/components/gbp/AnswersPreview";
import { useGbpEdit } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { ListingAnswersEditor } from "@/components/gbp/MoreWaysCards";
import { MERGED_REVIEW_CHECK_ID } from "@/lib/actionPlan";
import { isReviewGrowthRow } from "@/lib/overviewTiles";
import type { HolidayId } from "@/lib/gbpListingFields";
import { googleListingHref, growthPlanHref, reviewsHref } from "@/lib/routes";
import { WeeklyPlanCelebration } from "@/app/business/[id]/growth/WeeklyPlanCelebration";
import { DetailsMismatchTasks } from "@/components/overview/DetailsMismatchTasks";
import { FIX_BUTTON_CLASS } from "@/components/scoring/FixButton";
import { GoogleMapsAttribution } from "@/components/google/GoogleMapsAttribution";
import type { ActionPlanTask, CompletedTask } from "@/lib/actionPlan";
import { groupFixPlan, type FixPlan, type FixPlanRow } from "@/lib/fixPlan";
import type { DetailsMismatchState } from "@/lib/detailsMismatch.server";
import { mismatchesCoveredBy, URGENT_DETAILS } from "@/lib/detailsMismatch";
import { isHoursCheck, type HoursCheckState } from "@/lib/hoursCheck";
import { formatShortDate, t, tPlural, useLocale, useTimeZone } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { displayPoints } from "@/lib/pointRange";

const ORDER = ["this_week", "weeks", "months"] as const;
// One decimal under 10, whole from 10 up (lib/pointRange.ts).
const round1 = (n: number) => String(displayPoints(n));

function rowTitle(row: FixPlanRow, locale: ReturnType<typeof useLocale>): string {
  return row.kind === "website" ? t(locale, "dashboard.fixPlan.websiteRow") : (row.task.title ?? row.task.label);
}

// One color per group, the same in the score card's track and on the group headings below.
const GROUP_COLOR: Record<(typeof ORDER)[number], string> = {
  this_week: "#d9a443",
  weeks: "#8fa6c4",
  months: "repeating-linear-gradient(135deg,#5d6f8c 0 5px,#4a5a75 5px 9px)",
};

/**
 * Option A (docs/mockups/day25b/fix-plan-scorecard.html, Sam's pick, zoomed): "78 → 87" big on top, then one
 * track from today's score to "100 · A", so the This week / few weeks / months segments fill the width.
 */
export function TopCard({ plan, every, lastScanAt }: { plan: FixPlan; every: { score: number; grade: string }; lastScanAt: string | null }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const from = plan.today;
  const span = Math.max(1, every.score - from);
  const at = (n: number) => `${(Math.max(0, Math.min(span, n - from)) / span) * 100}%`;
  let prev = from;
  const segments = groupFixPlan(plan).map((g, i, all) => {
    const to = i === all.length - 1 ? every.score : g.to;
    const seg = { when: g.when, left: at(prev), width: `calc(${at(to)} - ${at(prev)})` };
    prev = to;
    return seg;
  });
  const weekStop = !plan.thisWeekDone && plan.thisWeek > from && plan.thisWeek < every.score;
  const soft = "text-[color:color-mix(in_srgb,var(--color-paper)_72%,transparent)]";
  return (
    <section data-testid="fix-plan-top" className="rounded-2xl bg-ink px-4 pb-4 pt-4 text-paper shadow-card sm:px-6 sm:pt-5">
      {plan.thisWeekDone ? (
        <>
          <p className="font-serif text-[24px] font-semibold leading-tight sm:text-[28px]" data-testid="fix-plan-done">
            {plan.thisWeekCount > 0 ? t(locale, "dashboard.fixPlan.doneTitle") : t(locale, "dashboard.fixPlan.noneThisWeek")}
          </p>
          {plan.next && (
            <p className="mt-1.5 text-[14px] text-[color:color-mix(in_srgb,var(--color-paper)_80%,transparent)]" data-testid="fix-plan-next">
              {t(locale, "dashboard.fixPlan.next", { fix: rowTitle(plan.next, locale), points: round1(plan.next.points) })}
            </p>
          )}
        </>
      ) : (
        <>
          <p className={cn("text-[13.5px]", soft)}>{tPlural(locale, "dashboard.fixPlan.thisWeekLabel", plan.thisWeekCount, { count: plan.thisWeekCount })}</p>
          <p className="mt-1 flex items-baseline gap-3 font-serif font-semibold leading-none" data-testid="fix-plan-this-week">
            <span className="text-[38px] tabular-nums sm:text-[44px]">{plan.today}</span>
            <span aria-hidden className="text-[28px] text-brass sm:text-[32px]">→</span>
            <span className="text-[38px] tabular-nums text-brass sm:text-[44px]">{plan.thisWeek}</span>
          </p>
        </>
      )}
      <div className="mt-5 flex items-center gap-3 sm:gap-4" data-testid="fix-plan-track-row">
        <div className="relative min-w-0 flex-1 pb-7">
          <div
            className="relative h-2.5 rounded-full bg-[color:color-mix(in_srgb,var(--color-paper)_12%,transparent)]"
            role="img"
            aria-label={t(locale, "dashboard.fixPlan.trackLabel", { now: from, week: plan.thisWeek, every: every.score })}
            data-testid="fix-plan-track"
          >
            {segments.map((seg, i) => (
              <div
                key={seg.when}
                data-segment={seg.when}
                className={cn("absolute inset-y-0", i === 0 && "rounded-l-full", i === segments.length - 1 && "rounded-r-full")}
                style={{ left: seg.left, width: seg.width, background: GROUP_COLOR[seg.when] }}
              />
            ))}
            <span aria-hidden className="absolute -top-[5px] left-0 h-5 w-0.5 rounded bg-paper" />
            {weekStop && <span aria-hidden className="absolute -top-[5px] h-5 w-0.5 -translate-x-px rounded bg-paper" style={{ left: at(plan.thisWeek) }} />}
          </div>
          <span className="absolute left-0 top-[18px] whitespace-nowrap text-[12px]" data-testid="fix-plan-now">
            <b className="font-serif text-[15px] text-white">{from}</b> <span className={soft}>{t(locale, "dashboard.fixPlan.trackNow")}</span>
          </span>
          {weekStop && (
            <span className="absolute top-[18px] translate-x-1.5 whitespace-nowrap text-[12px]" style={{ left: at(plan.thisWeek) }} data-testid="fix-plan-week">
              <b className="font-serif text-[15px] text-white">{plan.thisWeek}</b> <span className={cn("hidden sm:inline", soft)}>{t(locale, "dashboard.fixPlan.trackWeek")}</span>
            </span>
          )}
        </div>
        <p className="-mt-7 whitespace-nowrap font-serif text-[18px] font-semibold leading-none sm:text-[22px]" data-testid="fix-plan-every">
          {every.score} <span className="text-[15px] text-[color:color-mix(in_srgb,var(--color-paper)_80%,transparent)]">· {every.grade}</span>
          <span className={cn("mt-1 hidden font-sans text-[12px] font-medium sm:block", soft)}>{t(locale, "dashboard.fixPlan.trackEvery")}</span>
        </p>
      </div>
      <div className={cn("flex flex-wrap justify-between gap-x-4 gap-y-1 text-[12px]", soft)}>
        {plan.rows.some((r) => r.when === "months") && <span>{t(locale, "dashboard.overview.someFixesTakeMonths")}</span>}
        <span>{lastScanAt ? t(locale, "dashboard.fixPlan.fromLastScan", { date: formatShortDate(lastScanAt, locale, timeZone) }) : t(locale, "dashboard.fixPlan.fromLastScanNoDate")}</span>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ this week's one-click items (v3)

/** The drafts behind "Approve this week" and the rows that show them: one state, so a reply left out on its row is
 * left out of the button too. Premium: posting on; Grow: the same drafts, read only. */
interface FixWeek {
  replies: WeekRepliesState | null;
  answers: AnswersState | null;
  /** Premium, Google connected (or practice): one click sends them. */
  oneClick: boolean;
  /** Grow, connected: the drafts to read and copy; Premium does them in one click. */
  grow: boolean;
  premium: boolean;
}
const FixWeekContext = createContext<FixWeek>({ replies: null, answers: null, oneClick: false, grow: false, premium: false });

function FixWeekProvider({ businessId, free, children }: { businessId: string; free: boolean; children: ReactNode }) {
  const gbp = useGbpEdit();
  const connected = gbp.enabled && (gbp.connected || !!gbp.practice);
  const oneClick = connected && gbp.premium;
  const grow = connected && !gbp.premium && !free;
  // Every drafted reply (the same set and count as Reviews' "Approve all replies"); Grow reads them, never posts.
  const replies = useWeekReplies(businessId, { auto: oneClick || grow, all: true });
  const answers = useAnswers(businessId, { auto: oneClick || grow, suggest: [] });
  return <FixWeekContext.Provider value={{ replies: oneClick || grow ? replies : null, answers: oneClick || grow ? answers : null, oneClick, grow, premium: gbp.premium }}>{children}</FixWeekContext.Provider>;
}

/** Premium: two separate sends (components/fixPlan/SendToGoogle.tsx), each with its own confirm step. Grow: what's
 * drafted, and the Premium line. */
function ApproveWeek({ businessId }: { businessId: string }) {
  const locale = useLocale();
  const gbp = useGbpEdit();
  const week = useContext(FixWeekContext);
  if (week.oneClick) return <SendToGoogle businessId={businessId} replies={week.replies} answers={week.answers} canEdit={gbp.canEdit === true} practice={!!gbp.practice} />;
  if (!week.grow || !week.replies || week.replies.status !== "ok") return null;
  const drafted = week.replies.items.filter((i) => i.reply).length;
  const total = week.replies.items.length + (week.answers?.status === "ok" ? week.answers.ready.length : 0);
  if (drafted === 0 && total === 0) return null;
  return (
    <section className="flex flex-col gap-1 rounded-2xl border border-paper-deep bg-white px-4 py-3.5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:px-5" data-testid="approve-week-grow">
      <p className="text-[14px] font-semibold text-ink">{tPlural(locale, "dashboard.fixPlan.approve.grow", drafted, { count: drafted })}</p>
      <Link href={`/business/${businessId}/settings#compare-plans`} className="text-[13px] font-semibold text-[#8a6420] underline decoration-brass/60 underline-offset-2 hover:text-ink" data-testid="approve-week-premium">
        {total > 0 ? t(locale, "dashboard.fixPlan.approve.growPremium", { count: total }) : t(locale, "dashboard.fixPlan.approve.growPremiumNoCount")}
      </Link>
    </section>
  );
}

/** The replies row's panel: the real drafts (the ones that passed the checks), up to 5, each with "Include". */
function RepliesPanel({ businessId }: { businessId: string }) {
  const locale = useLocale();
  const week = useContext(FixWeekContext);
  const items = (week.replies?.items ?? []).filter((i) => i.reply);
  if (items.length === 0) return <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.fixPlan.repliesPanel.none")}</p>;
  return (
    <div className="flex flex-col gap-2" data-testid="fix-replies-panel">
      <p className="text-[13px] text-ink-soft">{t(locale, week.oneClick ? "dashboard.fixPlan.repliesPanel.note" : "dashboard.fixPlan.repliesPanel.growNote")}</p>
      <ul className="flex flex-col gap-1.5">
        {items.slice(0, 5).map((i) => (
          <li key={i.reviewId} className="flex items-start gap-2.5 rounded-lg border border-paper-line bg-paper/50 px-3 py-2" data-testid="fix-reply-draft">
            {week.oneClick && <input type="checkbox" checked={i.include} onChange={(e) => week.replies!.setInclude(i.reviewId, e.target.checked)} className="mt-1 accent-ink" aria-label={i.reviewer ?? ""} />}
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-ink">
                {i.reviewer ?? "—"} {i.stars ? <span className="text-brass">{"★".repeat(i.stars)}</span> : null}
              </p>
              <p className="text-[12.5px] text-ink-soft">“{i.text || i.reply}”</p>
            </div>
          </li>
        ))}
      </ul>
      <Link href={reviewsHref(businessId)} className="w-fit text-[13px] font-semibold text-ink underline decoration-brass underline-offset-[3px]">
        {t(locale, "dashboard.fixPlan.repliesPanel.all")}
      </Link>
    </div>
  );
}

const TAG = "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11.5px] font-semibold";

/** What a row adds on v3 (never on Free: its rows are the locked audit). */
function useRowExtra(businessId: string, task: ActionPlanTask, free: boolean): FixRowExtra | null {
  const locale = useLocale();
  const week = useContext(FixWeekContext);
  if (free) return null;
  if (task.checkId === "visibility.review_replies") {
    const ready = week.oneClick && week.replies?.canPost ? new Set(week.replies.ready).size : 0;
    const drafted = (week.replies?.items ?? []).filter((i) => i.reply).length;
    return {
      badge: ready > 0 ? <span className={cn(TAG, "border-[#cfe3d5] bg-[#eaf3ec] text-green")} data-testid="in-approve">✓ {tPlural(locale, "dashboard.fixPlan.inApprove.replies", ready, { count: ready })}</span> : null,
      label: drafted > 0 ? t(locale, "dashboard.fixPlan.readReplies") : undefined,
      panel: <RepliesPanel businessId={businessId} />,
    };
  }
  if (task.checkId === "completeness.customer_details") {
    const inApprove = week.oneClick && answersReady(week.answers);
    return {
      title: t(locale, "dashboard.fixPlan.listing.title"),
      why: t(locale, "dashboard.fixPlan.listing.why"),
      badge: inApprove ? <span className={cn(TAG, "border-[#cfe3d5] bg-[#eaf3ec] text-green")} data-testid="in-approve">✓ {t(locale, "dashboard.fixPlan.inApprove.listing")}</span> : null,
      label: week.answers ? t(locale, "dashboard.fixPlan.readDrafts") : undefined,
      panel: week.answers ? <ListingAnswersEditor businessId={businessId} premium={week.premium} state={week.answers} /> : null,
    };
  }
  if (task.checkId === MERGED_REVIEW_CHECK_ID || isReviewGrowthRow(task)) {
    return {
      habit: (
        <span className="inline-block rounded-lg border border-[#cfe3d5] bg-[#eef5f0] px-2.5 py-1 text-[12.5px] text-[#234f35]" data-testid="from-habit">
          ↻ {t(locale, "dashboard.fixPlan.fromHabit.before")}{" "}
          <Link href={growthPlanHref(businessId, { hash: "this-week" })} className="font-semibold underline underline-offset-2">
            {t(locale, "dashboard.habits.reviews.title")}
          </Link>{" "}
          {t(locale, "dashboard.fixPlan.fromHabit.after")}
        </span>
      ),
    };
  }
  return null;
}

/** A row of the plan, with its v3 extras. */
function PlanRow(props: Parameters<typeof TaskCard>[0] & { free: boolean }) {
  const { free, ...card } = props;
  const extra = useRowExtra(card.businessId, card.task, free);
  return <TaskCard {...card} fixPlan={card.fixPlan ? { ...card.fixPlan, compact: card.fixPlan.compact ? { ...card.fixPlan.compact, extra } : undefined } : null} />;
}

/** A holiday within 30 days with no hours on the listing: set them. No points — it protects customers. */
function HolidayRow({ businessId, holiday }: { businessId: string; holiday: { holiday: HolidayId; date: string } }) {
  const locale = useLocale();
  const name = t(locale, `dashboard.googleTab.fields.holiday.${holiday.holiday}` as Parameters<typeof t>[1]);
  const date = formatShortDate(`${holiday.date}T12:00:00Z`, locale, "UTC");
  return (
    <li className="border-t border-paper-line first:border-t-0" data-testid="fix-plan-holiday">
      <div className="grid grid-cols-[26px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5 nav:grid-cols-[26px_112px_minmax(0,1fr)_auto]">
        <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-paper-deep text-[12px] text-ink-mute">–</span>
        <span className="hidden nav:block" />
        <div className="col-start-2 min-w-0 nav:col-start-3">
          <p className="text-[14.5px] font-semibold text-ink">{t(locale, "dashboard.fixPlan.holiday.title", { holiday: name, date })}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-mute">{t(locale, "dashboard.fixPlan.holiday.why")}</p>
          <span className={cn(TAG, "mt-1.5 border-paper-deep bg-paper text-ink-soft")} data-testid="holiday-tag">
            {t(locale, "dashboard.fixPlan.holiday.tag")}
          </span>
        </div>
        <div className="col-start-2 flex items-center justify-end gap-3 nav:col-start-4">
          <Link href={googleListingHref(businessId, { hash: "edit-holiday" })} data-testid="fix-button" data-kind="holiday" className={FIX_BUTTON_CLASS}>
            {t(locale, "dashboard.fixPlan.holiday.button")} →
          </Link>
          <span className="w-4" aria-hidden />
        </div>
      </div>
    </li>
  );
}

/** The other website checks, as one compact row to the Website page. */
function WebsiteRow({ row, step, businessId, outline }: { row: Extract<FixPlanRow, { kind: "website" }>; step: number; businessId: string; outline: boolean }) {
  const locale = useLocale();
  return (
    <li id="fix-website" className="scroll-mt-20 border-t border-paper-line first:border-t-0" data-testid="fix-plan-website">
      <div className="grid grid-cols-[26px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5 nav:grid-cols-[26px_112px_minmax(0,1fr)_auto]">
        <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full font-serif text-[12.5px] font-semibold text-ink ps-icon-tile">{step}</span>
        <span className="hidden nav:block"><FixPriorityTag priority={row.priority} /></span>
        <div className="col-start-2 min-w-0 nav:col-start-3">
          <span className="mb-1 flex nav:hidden"><FixPriorityTag priority={row.priority} /></span>
          <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink"><IconWorld size={15} className="text-ink-soft" aria-hidden />{rowTitle(row, locale)}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-mute">{tPlural(locale, "dashboard.growth.websiteBanner.improve", row.banner.improvements, { earned: row.banner.earned, of: row.banner.of, points: Math.max(1, Math.round(row.points)) })}</p>
        </div>
        <div className="col-start-2 flex items-center justify-between gap-3 nav:col-start-4 nav:justify-end">
          <span className="whitespace-nowrap text-[13px] font-semibold text-ink-soft">
            {t(locale, "dashboard.fixPlan.pts", { points: round1(row.points) })} → <b className="font-serif text-[16px] text-ink">{row.running}</b>
          </span>
          <Link href={`/business/${businessId}/website`} data-testid="fix-button" data-kind="steps" className={cn(FIX_BUTTON_CLASS, outline && "!border-paper-deep !bg-white !text-ink hover:!bg-paper")}>
            {t(locale, "dashboard.fixPlan.fixIt")} →
          </Link>
          <span className="w-4" aria-hidden />
        </div>
      </div>
    </li>
  );
}

export function FixPlanView({
  businessId,
  plan,
  every,
  free,
  premium,
  lastScanAt,
  weekStart,
  completed,
  gbpConnected,
  websiteRecheck = null,
  detailsMismatch = null,
  hoursCheck = null,
  reviewGoalLines = [],
  holiday = null,
}: {
  /** A holiday within 30 days with no hours set (Business Profile read; null when unknown or none). */
  holiday?: { holiday: HolidayId; date: string } | null;
  businessId: string;
  plan: FixPlan;
  /** The Overview's projection: every fix done. */
  every: { score: number; grade: string };
  free: boolean;
  premium: boolean;
  lastScanAt: string | null;
  weekStart: string;
  completed: CompletedTask[];
  gbpConnected: boolean;
  websiteRecheck?: WebsiteRecheckProps | null;
  detailsMismatch?: DetailsMismatchState | null;
  hoursCheck?: HoursCheckState | null;
  reviewGoalLines?: string[];
}) {
  const locale = useLocale();
  const mismatches = detailsMismatch?.mismatches ?? [];
  const tasks = plan.rows.flatMap((r) => (r.kind === "task" ? [r.task] : []));
  const covered = new Set(tasks.flatMap((task) => mismatchesCoveredBy(task, mismatches).map((m) => m.field)));
  const standalone = mismatches.filter((m) => !covered.has(m.field));
  const weekTasks: ActionPlanTask[] = plan.rows.flatMap((r) => (r.kind === "task" && r.when === "this_week" ? [r.task] : []));
  return (
    <ReviewGoalLinesContext.Provider value={reviewGoalLines}>
      <FixWeekProvider businessId={businessId} free={free}>
      <div className="flex flex-col gap-6 nav:gap-8" data-testid="fix-plan">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[30px]">{t(locale, "dashboard.fixPlan.title")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t(locale, "dashboard.fixPlan.subtitleV3")}</p>
        </div>

        {!free && <WeeklyPlanCelebration businessId={businessId} weekStart={weekStart} today={plan.today} weeklyTasks={weekTasks} completed={completed} gbpConnected={gbpConnected} lastScanAt={lastScanAt} />}
        <TopCard plan={plan} every={every} lastScanAt={lastScanAt} />
        <ApproveWeek businessId={businessId} />

        {standalone.length > 0 && <DetailsMismatchTasks businessId={businessId} mismatches={standalone} owner={detailsMismatch?.owner ?? null} />}

        <div id="weekly-plan" className="scroll-mt-20 flex flex-col gap-6">
          {plan.rows.length === 0 ? (
            <p className="rounded-2xl border border-paper-deep bg-white p-5 text-sm text-ink-soft">{t(locale, "dashboard.fixPlan.empty")}</p>
          ) : (
            (() => {
              const groups = groupFixPlan(plan);
              // "Website speed: not scored yet" ends "Takes a few weeks" (its own group when there's none).
              const withSpeed = plan.speed && !groups.some((g) => g.when === "weeks") ? [...groups, { when: "weeks" as const, rows: [], points: 0, upTo: false, to: 0 }].sort((a, b) => ORDER.indexOf(a.when) - ORDER.indexOf(b.when)) : groups;
              let step = 0;
              return withSpeed.map((g) => (
                <section key={g.when} className="flex flex-col gap-2.5" data-testid={`fix-group-${g.when}`}>
                  <div className="flex items-baseline gap-3 px-0.5">
                    <span aria-hidden data-dot={g.when} className="h-2.5 w-2.5 shrink-0 self-center rounded-full" style={{ background: GROUP_COLOR[g.when] }} />
                    <h2 className="font-serif text-[18px] font-semibold text-ink">{t(locale, `dashboard.fixPlan.when.${g.when}` as Parameters<typeof t>[1])}</h2>
                    {g.rows.length > 0 && (
                      <span className="ml-auto whitespace-nowrap text-[13px] font-semibold text-ink-soft" data-testid="fix-group-subtotal">
                        {t(locale, g.upTo ? "dashboard.fixPlan.upToPts" : "dashboard.fixPlan.pts", { points: round1(g.points) })} → <b className="font-serif text-[16px] text-ink">{g.to}</b>
                      </span>
                    )}
                  </div>
                  <ol className="overflow-hidden rounded-2xl border border-paper-deep bg-white shadow-card" data-testid="fix-plan-rows">
                    {g.rows.map((row) => {
                      step++;
                      const outline = g.when === "months";
                      return row.kind === "website" ? (
                        <WebsiteRow key={row.key} row={row} step={step} businessId={businessId} outline={outline} />
                      ) : (
                        <PlanRow
                          key={row.key}
                          free={free}
                          task={mismatchesCoveredBy(row.task, mismatches).some((m) => URGENT_DETAILS.includes(m.field)) ? { ...row.task, urgent: true } : row.task}
                          businessId={businessId}
                          context="weekly"
                          step={step}
                          lastScanAt={lastScanAt}
                          websiteRecheck={websiteRecheck}
                          premium={premium}
                          merged={mismatchesCoveredBy(row.task, mismatches)}
                          hoursCheck={isHoursCheck(row.task) ? hoursCheck : null}
                          fixPlan={{ priority: row.priority, running: row.running, locked: free, compact: { open: step === 1, outline } }}
                        />
                      );
                    })}
                    {g.when === "this_week" && holiday && <HolidayRow businessId={businessId} holiday={holiday} />}
                    {g.when === "weeks" && plan.speed && (
                      <li className="grid grid-cols-[26px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-t border-dashed border-paper-deep bg-paper/60 px-4 py-3.5 first:border-t-0 sm:px-5 nav:grid-cols-[26px_112px_minmax(0,1fr)_auto]" data-testid="fix-plan-speed">
                        <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-paper-deep text-[12px] text-ink-mute">–</span>
                        <span className="hidden nav:block" />
                        <div className="col-start-2 min-w-0 nav:col-start-3">
                          <p className="text-[14px] font-medium text-ink-soft">{t(locale, "dashboard.fixPlan.speedTitle")}</p>
                          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-mute">{t(locale, "dashboard.fixPlan.speedShort")}</p>
                        </div>
                        <span className="col-start-2 whitespace-nowrap text-[13px] font-semibold text-ink-mute nav:col-start-4">{t(locale, "dashboard.fixPlan.speedUpTo", { points: plan.speed.upTo })}</span>
                      </li>
                    )}
                  </ol>
                </section>
              ));
            })()
          )}
          {/* Rows quote the Google listing (reviews, rating, hours…). */}
          <GoogleMapsAttribution className="mt-0 px-1">
            <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.fixPlan.footnote")}</p>
          </GoogleMapsAttribution>
        </div>

        {!free && <CompletedTasksCard completed={completed} />}
      </div>
      </FixWeekProvider>
    </ReviewGoalLinesContext.Provider>
  );
}
