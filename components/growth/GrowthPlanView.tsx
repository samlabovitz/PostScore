"use client";

// Day 25B step 6 (docs/plans/day25a-spec.md §2 Growth plan, §2c, §6, mockups
// 03, 03b and 06): Growth → Growth plan on the new design. Top to bottom:
// the tier card (name, "Tier N of 5", the next step, active weeks, the 5-step
// track, "To reach …" and "After that"), this week's plan (one list, ranked
// by what each task does for the tier; Premium approves, Grow does the steps
// and checks them off), "More ways to bring people in", the link to Google
// results, and "More customers, whatever your score". Tier terms only:
// never PostScore points. Free: a locked preview, never a made-up tier.

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { IconArrowRight, IconCheck, IconLock, IconPlugConnected } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { TierPlanContext, type TierPlanValue } from "@/components/growth/TierPlanContext";
import { ThisWeek, GrowThisWeek } from "@/components/gbp/GoogleResults";
import { PresenceUnder70Note, TwoScoresStrip } from "@/components/overview/TwoScoresStrip";
import { MoreWaysCards } from "@/components/gbp/MoreWaysCards";
import { GrowMoreCustomers } from "@/components/overview/GrowMoreCustomers";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";
import { itemText } from "@/components/gbp/ThisWeekList";
import { setWeeklyCheckItem } from "@/app/actions/weeklyChecklist";
import type { GoogleProfileTabProps } from "@/components/gbp/googleTabParts";
import type { GrowthState, TierLine } from "@/lib/growthPlan";
import type { WeekPlanData } from "@/lib/growthWeekPlan.server";
import type { ResultId, TierNumber } from "@/lib/growthTier";
import type { Rec } from "@/lib/googleRecommendations";
import type { IdeaType } from "@/lib/listingIdeas";
import type { WeeklyChecklistItemId } from "@/lib/weeklyChecklist";
import type { GrowthExtra } from "@/lib/growthWeek";
import { TIER_NAME_KEYS } from "@/lib/navTabs";
import { gbpConnectHref } from "@/lib/gbpLanding";
import { isPremiumPlan, type Plan } from "@/lib/plan";
import { fixPlanHref, getReviewsHref, googleResultsHref, offersHref } from "@/lib/routes";
import { formatShortDate, t, tPlural, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import type { PluralKeyBase } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

const G = (key: string) => `dashboard.growthPlan.${key}` as MessageKey;
const tierName = (locale: Locale, n: number) => t(locale, TIER_NAME_KEYS[n - 1]);
/** "Mon, Nov 30" from "YYYY-MM-DD" (a calendar day, never shifted by time zone). */
function dayLabel(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
const shortDay = (date: string, locale: Locale) => new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/** One task's tier line, in words. */
export function tierLineText(line: TierLine, locale: Locale): string {
  switch (line.key) {
    case "goesOutNextWeekTier":
      return t(locale, G("line.nextWeekTier"), { day: dayLabel(line.day!, locale), tier: tierName(locale, line.tier!), date: dayLabel(line.date!, locale) });
    case "goesOutNextWeek":
      return t(locale, G("line.nextWeek"), { day: dayLabel(line.day!, locale) });
    case "makesThisWeek":
      return t(locale, G("line.makesThisWeek"));
    case "alreadyCounts":
      return t(locale, G("line.alreadyCounts"));
    case "photos":
      return t(locale, G("line.photos"));
    case "checkOff":
      return t(locale, G("line.checkOff"));
  }
}

/** The plan's order and tier lines (and "I did this" on Grow / not connected) for the shared list. */
export function TierPlanProvider({ businessId, plan, week, didThis, children }: { businessId: string; plan: WeekPlanData; week: boolean; didThis: boolean; children: ReactNode }) {
  const locale = useLocale();
  const value: TierPlanValue = useMemo(
    () => ({
      businessId,
      order: plan.order,
      lines: week ? Object.fromEntries(Object.entries(plan.lines).map(([k, l]) => [k, { text: tierLineText(l!, locale), first: !!l!.first }])) : {},
      didThis: didThis ? { checked: plan.checked } : null,
    }),
    [businessId, plan, week, didThis, locale]
  );
  return <TierPlanContext.Provider value={value}>{children}</TierPlanContext.Provider>;
}

// ------------------------------------------------------------------ tier card

const RESULT_KEY: Record<ResultId, string> = { R1: "result.r1", R2: "result.r2", R3: "result.r3", R4: "result.r4", R5: "result.r5" };

function Track({ tier }: { tier: TierNumber }) {
  const locale = useLocale();
  return (
    <ol className="grid grid-cols-5 gap-1.5" data-testid="tier-track">
      {[1, 2, 3, 4, 5].map((n) => (
        <li key={n} data-tier={n} data-current={n === tier || undefined} className={cn("flex flex-col gap-1 rounded-lg border px-2 py-1.5 text-center", n === tier ? "border-brass bg-[color:color-mix(in_srgb,var(--color-brass)_12%,white)]" : n < tier ? "border-paper-deep bg-paper" : "border-paper-deep bg-white")}>
          <span className="truncate text-[11.5px] font-semibold text-ink">{tierName(locale, n)}</span>
          <span className="text-[10.5px] text-ink-mute">{n === tier ? t(locale, G("track.you"), { n }) : t(locale, G("track.tier"), { n })}</span>
        </li>
      ))}
    </ol>
  );
}

/** A requirement row's mark: a green ✓ only when it's met, an empty circle when it isn't. */
function MetMark({ met }: { met: boolean }) {
  return met ? (
    <IconCheck size={13} aria-hidden className="mr-1 inline text-green" data-mark="met" />
  ) : (
    <span aria-hidden data-mark="open" className="mr-1 inline-block h-[13px] w-[13px] translate-y-[2px] rounded-full border-[1.5px] border-ink-mute" />
  );
}

function Needs({ title, needs, have, active, results, nextResult }: { title: string; needs: NonNullable<GrowthState["next"]>; have: string; active: string; results: string | null; nextResult: string | null }) {
  const locale = useLocale();
  const parts = needs.results > 0 ? 2 : 1;
  const done = (needs.activeMet ? 1 : 0) + (needs.results > 0 && needs.resultsMet ? 1 : 0);
  return (
    <Card className="flex flex-col gap-2 p-4" data-testid="tier-needs" data-tier={needs.tier}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
        <span className="text-[12px] font-semibold text-ink-mute" data-testid="needs-progress">{t(locale, G("needs.progress"), { done, of: parts })}</span>
      </div>
      <p className="text-[13px] text-ink" data-testid="needs-active" data-met={needs.activeMet || undefined}>
        <MetMark met={needs.activeMet} />
        {active}
      </p>
      <p className="-mt-1 pl-[18px] text-[12.5px] text-ink-soft">{have}</p>
      {results && (
        <>
          <p className="text-[13px] text-ink" data-testid="needs-results" data-met={needs.resultsMet || undefined}>
            <MetMark met={needs.resultsMet} />
            {results}
          </p>
          {nextResult && <p className="-mt-1 pl-[18px] text-[12.5px] text-ink-soft">{nextResult}</p>}
        </>
      )}
      {needs.needsR1ThreeMonths && <p className="text-[12.5px] text-ink-soft">{t(locale, G("needs.r1Three"))}</p>}
    </Card>
  );
}

export function TierCard({ state, testAccount }: { state: GrowthState; testAccount: boolean }) {
  const locale = useLocale();
  const name = tierName(locale, state.tier);
  const metResults = (Object.keys(state.results) as ResultId[]).filter((id) => state.results[id] === "met");
  const resultsWords = (ids: ResultId[]) => ids.map((id) => t(locale, G(RESULT_KEY[id]))).join(", ");
  const activeDates = state.weeks.filter((w) => w.active).map((w) => shortDay(w.weekStart, locale));
  const nextResultLine = state.nextResult ? t(locale, G("needs.nextResult"), { result: t(locale, G(`${RESULT_KEY[state.nextResult]}.goal`)) }) : null;
  const needsCard = (needs: NonNullable<GrowthState["next"]>, title: string) => (
    <Needs
      title={title}
      needs={needs}
      active={t(locale, G("needs.active"), { n: needs.activeWeeks, of: needs.of })}
      have={tPlural(locale, G("needs.have") as PluralKeyBase, needs.activeNow, { count: needs.activeNow })}
      results={needs.results > 0 ? t(locale, G(needs.results === 1 ? "needs.results1" : needs.results === 2 ? "needs.results2" : "needs.results3")) : null}
      nextResult={needs.resultsNow > 0 ? t(locale, G("needs.youHave"), { list: resultsWords(metResults) }) + (nextResultLine ? ` ${nextResultLine}` : "") : nextResultLine}
    />
  );
  return (
    <section className="flex flex-col gap-4" data-testid="tier-card" data-tier={state.tier}>
      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute">{t(locale, G("card.label"))}</span>
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="font-serif text-[28px] font-semibold leading-tight text-ink">{name}</h2>
              {testAccount && <span className="rounded-full bg-paper-deep px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{t(locale, "dashboard.nav.testAccount")}</span>}
            </div>
            <span className="text-[13px] font-medium text-ink-soft">{t(locale, G("card.tierOf"), { n: state.tier })}</span>
          </div>
        </div>
        {/* The one-line next step: when the next tier comes (after a quiet week, "Keep your tier" below says what to do). */}
        {!state.warning && state.onTrack ? (
          <p data-testid="tier-on-track" className="text-[14px] font-semibold text-green">
            {t(locale, G("onTrack"), { tier: tierName(locale, state.onTrack.tier), date: dayLabel(state.onTrack.monday, locale) })}
          </p>
        ) : null}
        {/* Every change says why, in plain words (spec §6.4.7). */}
        {state.change && <ChangeLine change={state.change} tier={state.tier} metResults={resultsWords(metResults)} />}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-ink-mute">{t(locale, G("card.activeWeeks"))}</span>
          <ol className="grid grid-cols-8 gap-1" data-testid="active-weeks">
            {state.weeks.map((w) => (
              <li key={w.weekStart} data-active={w.active || undefined} data-neutral={w.neutral || undefined} className="flex flex-col items-center gap-1">
                <span aria-hidden className={cn("h-3 w-full rounded-full", w.active ? "bg-green" : w.neutral ? "border border-dashed border-ink-mute" : "bg-paper-deep")} />
                <span className="text-[10px] text-ink-mute">{shortDay(w.weekStart, locale)}</span>
              </li>
            ))}
          </ol>
          <span className="sr-only">{activeDates.join(", ")}</span>
        </div>
        <KeepStrip state={state} />
        <Track tier={state.tier} />
      </Card>
      {state.stay && <TopCard stay={state.stay} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {state.next && needsCard(state.next, t(locale, G("needs.toReach"), { tier: tierName(locale, state.next.tier) }))}
        {state.after && needsCard(state.after, t(locale, G("needs.after"), { tier: tierName(locale, state.after.tier) }))}
      </div>
      {!state.connected && state.tier < 5 && <p className="text-[12.5px] text-ink-soft" data-testid="r1-connect">{t(locale, G("r1Connect"))}</p>}
    </section>
  );
}

/** "Keep your tier" (§6.4–6.5): one calm sentence from the real decay rules — no red, no countdowns, no
 * game words — and when the tier is next worked out. Tier 1: "Make this week count". */
export function keepLine(state: Pick<GrowthState, "tier" | "keep">, locale: Locale): string {
  const tier = tierName(locale, state.tier);
  if (state.keep === "closed") return t(locale, G(state.tier === 1 ? "keep.closedStart" : "keep.closed"), { tier });
  if (state.tier === 1) return t(locale, G(state.keep === "set" ? "keep.startSet" : "keep.start"));
  if (state.keep === "quiet") return t(locale, G("keep.quiet"), { tier, lower: tierName(locale, state.tier - 1) });
  return t(locale, G(state.keep === "set" ? "keep.set" : "keep.due"), { tier });
}

const KEEP_DOT: Record<GrowthState["keep"], string> = { set: "bg-green", due: "bg-brass", quiet: "bg-amber", closed: "bg-ink-mute" };

function KeepStrip({ state }: { state: GrowthState }) {
  const locale = useLocale();
  // Tier 1 has nothing to lose: no amber there.
  const tone = state.tier === 1 && state.keep === "quiet" ? "due" : state.keep;
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-paper px-3.5 py-2.5" data-testid="keep-strip" data-keep={tone}>
      <span aria-hidden className={cn("mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full", KEEP_DOT[tone])} />
      <p className="text-[13.5px] text-ink">
        {keepLine({ tier: state.tier, keep: tone }, locale)} <span className="whitespace-nowrap text-ink-mute">{t(locale, G("keep.next"), { date: dayLabel(state.nextUpdate, locale) })}</span>
      </p>
    </div>
  );
}

/** Local favorite: no "To reach…" — what it takes to stay, with ✓ for what's met. */
function TopCard({ stay }: { stay: NonNullable<GrowthState["stay"]> }) {
  const locale = useLocale();
  const row = (ok: boolean, text: string, sub: string, id: string) => (
    <li className="flex flex-col" data-testid={`top-${id}`} data-met={ok || undefined}>
      <span className="text-[13px] text-ink">
        <MetMark met={ok} />
        {text}
      </span>
      <span className="pl-[18px] text-[12.5px] text-ink-soft">{sub}</span>
    </li>
  );
  return (
    <Card className="flex flex-col gap-2 border-2 border-brass p-4" data-testid="tier-top">
      <h3 className="text-[15px] font-semibold text-ink">{t(locale, G("top.title"))}</h3>
      <p className="text-[13.5px] text-ink-soft">{t(locale, G("top.body"))}</p>
      <ul className="flex flex-col gap-1.5">
        {row(stay.activeOk, t(locale, G("top.active")), t(locale, G("top.activeHave"), { n: stay.activeNow, of: stay.of }), "active")}
        {row(stay.resultsOk, t(locale, G("top.results")), t(locale, G("top.resultsHave"), { n: stay.resultsNow }), "results")}
      </ul>
    </Card>
  );
}

function ChangeLine({ change, tier, metResults }: { change: NonNullable<GrowthState["change"]>; tier: TierNumber; metResults: string }) {
  const locale = useLocale();
  const name = tierName(locale, tier);
  let text: string;
  if (change.kind === "up") text = t(locale, G(metResults ? "change.upResults" : "change.up"), { tier: name, count: change.activeWeeks ?? 0, results: metResults });
  else if (change.kind === "restored") text = t(locale, G("change.restored"), { tier: name });
  else if (change.kind === "down_quiet") text = t(locale, G("change.downQuiet"), { tier: name, a: shortDay(change.quietWeeks?.[0] ?? "", locale), b: shortDay(change.quietWeeks?.[1] ?? "", locale), back: tierName(locale, Math.min(5, tier + 1)) });
  else text = t(locale, G("change.downResults"), { tier: name, back: tierName(locale, Math.min(5, tier + 1)) });
  return (
    <p data-testid="tier-change" className="text-[13px] text-ink-soft">
      {text}
    </p>
  );
}

// ------------------------------------------------------------------ this week's plan

/** Each Growth task's own way in (§2d): the review link & QR, Customer offers, or a holiday offer. */
function routineLink(businessId: string, id: WeeklyChecklistItemId, locale: Locale): { href: string; label: string; howTo?: string } | null {
  if (id === "share_review_link") return { href: getReviewsHref(businessId, { hash: "review-link" }), label: t(locale, G("routine.reviewLink")), howTo: t(locale, G("routine.reviewLinkHowTo")) };
  if (id === "start_offer") return { href: offersHref(businessId), label: t(locale, "dashboard.growth.week.offerLink") };
  if (id === "seasonal_idea") return { href: offersHref(businessId), label: t(locale, "dashboard.growth.week.seasonalLink") };
  return null;
}

/** A Growth task's title and how-to (lib/growthWeek.ts): the seasonal idea names the holiday and its date. */
function extraText(extra: GrowthExtra, locale: Locale): { title: string; howTo: string } {
  const key = extra.id === "share_review_link" ? "shareReviewLink" : extra.id === "start_offer" ? "startOffer" : "seasonalIdea";
  const holiday = extra.holiday ? t(locale, `dashboard.googleTab.fields.holiday.${extra.holiday.id}` as MessageKey) : "";
  const date = extra.holiday ? formatShortDate(`${extra.holiday.date}T12:00:00Z`, locale, "UTC") : "";
  return {
    title: t(locale, `dashboard.growth.checklist.items.${key}.title` as MessageKey, { holiday, date }),
    howTo: t(locale, `dashboard.growth.checklist.items.${key}.howTo` as MessageKey),
  };
}

function RoutineExtra({ businessId, id, title, howTo, checked: initial }: { businessId: string; id: WeeklyChecklistItemId; title: string; howTo: string; checked: boolean }) {
  const locale = useLocale();
  const link = routineLink(businessId, id, locale);
  const [checked, setChecked] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-col gap-2 border-t border-paper-line py-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`routine-${id}`}>
      <div className="min-w-0">
        <p className="text-[14.5px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[12.5px] text-ink-mute">{link?.howTo ?? howTo}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
      {link && (
        <Link href={link.href} className="inline-flex w-fit items-center rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-ink-soft" data-testid={`routine-link-${id}`}>
          {link.label}
        </Link>
      )}
      <button
        type="button"
        aria-pressed={checked}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const next = !checked;
            setChecked(next);
            const r = await setWeeklyCheckItem(businessId, id, next).catch(() => null);
            if (!r || r.status !== "ok") setChecked(!next);
          })
        }
        className={cn("inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold", checked ? "border-green text-green" : "border-paper-deep bg-white text-ink hover:border-ink-soft")}
      >
        <IconCheck size={14} aria-hidden />
        {t(locale, checked ? G("didIt") : G("didThis"))}
      </button>
      </div>
    </li>
  );
}

export function WeekPlanCard({
  props,
  plan,
  state,
  week,
  routine,
}: {
  props: GoogleProfileTabProps;
  plan: Plan;
  state: GrowthState | null;
  week: WeekPlanData;
  routine: Array<{ id: WeeklyChecklistItemId; title: string; howTo: string }>;
}) {
  const locale = useLocale();
  const premium = isPremiumPlan(plan);
  const connected = week.connected;
  const oneTap = premium && connected;
  // The top line, from the real tier rules (spec §2c).
  const target = state ? (state.thisWeekCounts ? "next" : "this") : "this";
  // Check-offs (Grow, or not connected): 2 make a week count; one tap (Premium, connected): 1 task.
  const top = !oneTap
    ? state?.onTrack
      ? t(locale, G("top.checkOffOnTrack"), { tier: tierName(locale, state.onTrack.tier), date: dayLabel(state.onTrack.monday, locale) })
      : t(locale, G(target === "next" ? "top.checkOffNext" : "top.checkOffThis"))
    : state?.onTrack
      ? t(locale, G("top.onTrack"), { tier: tierName(locale, state.onTrack.tier), date: dayLabel(state.onTrack.monday, locale) })
      : t(locale, G(target === "next" ? "top.nextWeek" : "top.thisWeek"));
  const sub = state?.thisWeekCounts ? t(locale, G("top.alreadyCounts")) : null;
  // §2d: the quickest way to make this week count can be a Presence fix — the drafted replies, approved on Fix plan
  // (they count toward the tier as "Replied to reviews").
  const ready = props.readyReplies ?? 0;
  const presenceFirst = oneTap && state && !state.thisWeekCounts && ready > 0;
  // The next result is for the first tier above whose results aren't in hand yet.
  const resultTier = state?.next ? (state.next.results > 0 && !state.next.resultsMet ? state.next.tier : state.after?.tier ?? null) : null;
  const nextResult = state?.nextResult && resultTier ? t(locale, G("top.nextResult"), { tier: tierName(locale, resultTier), result: t(locale, G(`${RESULT_KEY[state.nextResult]}.goal`)) }) : null;
  // §2d: the Growth-only tasks after the Google ones — one list, 3–5 tasks, all of them Growth.
  const extras = (week.extras ?? []).map((e) => ({ id: e.id as WeeklyChecklistItemId, ...extraText(e, locale) }));
  void routine;
  return (
    <section id="this-week" className="scroll-mt-20" data-testid="week-plan">
      <div className="mb-3 flex flex-col gap-1">
        <h2 className="font-serif text-xl font-semibold text-ink">{t(locale, G("week.title"))}</h2>
        <p className="text-[13px] text-ink-soft">
          {oneTap ? tPlural(locale, G("week.subOneTap") as PluralKeyBase, week.count, { count: week.count }) : connected ? tPlural(locale, G("week.subSteps") as PluralKeyBase, week.count, { count: week.count }) : t(locale, G("week.subNotConnected"))}
        </p>
      </div>
      <Card className="flex flex-col gap-3 p-5 sm:p-6">
        <div className="rounded-lg bg-[color:color-mix(in_srgb,var(--color-green)_8%,white)] px-3.5 py-2.5" data-testid="week-top-line">
          {presenceFirst ? (
            <p className="text-[14px] font-semibold text-ink" data-testid="week-top-presence">
              <Link href={fixPlanHref(props.businessId)} className="underline decoration-brass underline-offset-2 hover:text-ink-soft">
                {state.onTrack
                  ? tPlural(locale, "dashboard.growthPlan.top.approveRepliesOnTrack", ready, { count: ready, tier: tierName(locale, state.onTrack.tier) })
                  : tPlural(locale, "dashboard.growthPlan.top.approveReplies", ready, { count: ready })}
              </Link>
            </p>
          ) : (
            <p className="text-[14px] font-semibold text-ink">{top}</p>
          )}
          {(sub || nextResult) && <p className="mt-0.5 text-[12.5px] text-ink-soft">{[sub, nextResult].filter(Boolean).join(" ")}</p>}
        </div>
        <TierPlanProvider businessId={props.businessId} plan={week} week didThis={!oneTap}>
          {oneTap ? <ThisWeek props={props} noTitle /> : <GrowThisWeek props={props} chips={null} />}
        </TierPlanProvider>
        {!connected && <p className="text-[12.5px] text-ink-soft" data-testid="week-connect-line">{t(locale, G("week.connectOneTap"))}</p>}
        {extras.length > 0 && (
          <ul data-testid="week-routine" className="-mt-1">
            {extras.map((r) => (
              <RoutineExtra key={r.id} businessId={props.businessId} id={r.id} title={r.title} howTo={r.howTo} checked={week.checked.includes(r.id)} />
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

// ------------------------------------------------------------------ the page

export function GrowthPlanView({
  props,
  plan,
  state,
  testAccount,
  week,
  routine,
  growMore,
}: {
  props: GoogleProfileTabProps;
  plan: Plan;
  state: GrowthState | null;
  testAccount: boolean;
  week: WeekPlanData;
  routine: Array<{ id: WeeklyChecklistItemId; title: string; howTo: string }>;
  growMore: Parameters<typeof GrowMoreCustomers>[0];
}) {
  const locale = useLocale();
  const connected = week.connected;
  const lost = !props.connected && props.needsReconnect;
  return (
    <div className="flex flex-col gap-8" data-testid="growth-plan">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">{t(locale, G("title"))}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t(locale, G("subtitle"))}</p>
      </div>
      {/* Presence under 70: fixing it is the fastest way to be found. Then how the two scores work together. */}
      <PresenceUnder70Note businessId={props.businessId} />
      <TwoScoresStrip businessId={props.businessId} />
      {/* Not connected (03b): the banner. Lost (401 → refresh failed): Reconnect, the tier kept. */}
      {!connected && (
        <Card className={cn("flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between", lost && "border-red/40")} data-testid={lost ? "growth-reconnect" : "growth-connect"}>
          <p className={cn("flex items-center gap-2 text-[13.5px] font-medium", lost ? "text-red" : "text-ink")}>
            <IconPlugConnected size={16} aria-hidden className={lost ? "text-red" : "text-brass"} />
            {t(locale, G(lost ? "reconnectBanner" : "connectBanner"))}
          </p>
          <a href={props.canStart ? gbpConnectHref(props.businessId, "profile") : `/business/${props.businessId}/connect-gbp`} className={cn("inline-flex h-9 w-fit shrink-0 items-center rounded-lg px-3.5 text-[13px] font-semibold text-white", lost ? "bg-red" : "bg-ink")}>
            {t(locale, lost ? "dashboard.overview.listingRow.reconnect" : "dashboard.overview.listingRow.connect")}
          </a>
        </Card>
      )}
      {state ? <TierCard state={state} testAccount={testAccount} /> : <Card className="p-5 text-sm text-ink-soft">{t(locale, G("unavailable"))}</Card>}
      <WeekPlanCard props={props} plan={plan} state={state} week={week} routine={routine} />
      <section id="more-ways" className="scroll-mt-20 flex flex-col gap-3">
        {/* The cards carry their own "More ways to bring people in" heading. */}
        <MoreWaysCards businessId={props.businessId} premium={isPremiumPlan(plan)} connected={connected} />
      </section>
      <Link href={googleResultsHref(props.businessId)} className="flex items-center justify-between gap-3 rounded-xl border border-paper-deep bg-white px-4 py-3 text-[14px] font-semibold text-ink hover:border-ink-soft" data-testid="growth-results-link">
        <span>{t(locale, G(connected ? "resultsLink" : "resultsLinkNotConnected"))}</span>
        <span className="inline-flex items-center gap-1 text-brass">
          {t(locale, "dashboard.nav.googleResults")}
          <IconArrowRight size={15} aria-hidden />
        </span>
      </Link>
      <div id="more" className="scroll-mt-20">
        <GrowMoreCustomers {...growMore} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Free (06)

/** Free: "?" (never a made-up tier), what the tier would measure, this week's real task titles blurred, Grow vs Premium. */
export function GrowthFreePreview({ businessId, recs, type }: { businessId: string; recs: Rec[]; type: IdeaType | null }) {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-6" data-testid="growth-free">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">{t(locale, G("title"))}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t(locale, G("subtitle"))}</p>
      </div>
      <PresenceUnder70Note businessId={businessId} />
      <TwoScoresStrip businessId={businessId} />
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <span aria-hidden className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-[3px] border-dashed border-ink-mute font-serif text-3xl text-ink-mute">?</span>
        <div className="flex flex-col gap-1.5">
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-paper-deep px-2.5 py-0.5 text-[12px] font-semibold text-ink-soft">
            <IconLock size={12} aria-hidden />
            {t(locale, "dashboard.free.lockedLabel")}
          </span>
          <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, G("free.title"))}</h2>
          <ul className="flex flex-col gap-0.5 text-[13px] text-ink-soft">
            <li>· {t(locale, G("free.measure1"))}</li>
            <li>· {t(locale, G("free.measure2"))}</li>
            <li>· {t(locale, G("free.measure3"))}</li>
          </ul>
          <p className="text-[12.5px] text-ink-mute">{[1, 2, 3, 4, 5].map((n) => tierName(locale, n)).join(" → ")}</p>
        </div>
      </Card>
      <Card className="flex flex-col gap-2 p-5" data-testid="growth-free-week">
        <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, G("week.title"))}</h2>
        <ul className="flex flex-col divide-y divide-paper-line">
          {recs.map((rec) => {
            const x = itemText(rec, locale, type);
            return (
              <li key={rec.kind} className="py-2.5">
                <p className="text-[14.5px] font-medium text-ink">{x.text}</p>
                <p aria-hidden className="mt-1 select-none text-[13px] text-ink-mute blur-[3px]">{t(locale, G("free.blurred"))}</p>
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="flex flex-col gap-2 p-4" data-testid="growth-free-grow">
          <h3 className="text-[14px] font-semibold text-ink">{t(locale, "dashboard.settings.plan.name.grow")}</h3>
          <p className="text-[13px] text-ink-soft">{t(locale, G("free.grow"))}</p>
          <UpgradeTrigger feature="grow" />
        </Card>
        <Card className="flex flex-col gap-2 p-4" data-testid="growth-free-premium">
          <h3 className="text-[14px] font-semibold text-ink">{t(locale, "dashboard.settings.plan.name.premium")}</h3>
          <p className="text-[13px] text-ink-soft">{t(locale, G("free.premium"))}</p>
          <UpgradeTrigger feature="premium" />
        </Card>
      </div>
    </div>
  );
}
