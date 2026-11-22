"use client";

// Growth → Google results (Day 25B step 2; docs/plans/day25a-spec.md §2,
// mockups 04 and 04b): what people did after they found the business on
// Google — last month's rate and numbers, what to do this week, "Since you
// did this", how searches became actions, and the search terms. Growth
// content only: no listing rows, no OK / to fix counts, no points. The
// sections are also the old Google Profile tab's 1–3.

import Link from "next/link";
import { googleListingHref } from "@/lib/routes";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { specialFor, upcomingHolidays } from "@/lib/gbpListingFields";
import { isFresh } from "@/lib/gbpMediaPosts";
import { IconBuildingStore, IconDiscount2, IconPencil, IconPhoto, IconStar } from "@tabler/icons-react";
import { formatCount, formatShortDate, t, useLocale, useTimeZone, type Locale, type MessageKey } from "@/lib/i18n";
import { conversionRate, formatRate, levers, nextMonthlyUpdate, per100Change, rateTrend, deviceAdvice, deviceSplit, SAMPLE_AVERAGE_VISIT, lastSixMonths, lastTwo, rateChart, type GoogleTabSaved, type Lever, type LeverId, type Tone } from "@/lib/googleProfileTab";
import { actions, addMonths, callsByDays, isSmallMonth, leftOnTable, totalViews, whoTable, type Audience, type InsightsMonth, type WhoRow } from "@/lib/gbpInsights";
import { cn } from "@/lib/utils";
import { change, chartMarkers, leftMoney, revenueMath, SAMPLE_SINCE, SHARE_PRESETS, shareChoice, parseSharePercent, sharePercent, sinceActions, sinceStatus, localToday, within, type ActionEvent, type VisitShare, type WindowTotals } from "@/lib/googleRecommendations";
import { shortDate } from "@/components/gbp/GoogleRecs";
import { loadMonthSoFar, loadSinceNumbers, saveVisitShare, type MonthSoFarResult, type SinceResult } from "@/app/actions/googleSince";
import { saveAverageVisitValue } from "@/app/actions/averageVisit";
import { ThisWeekList } from "@/components/gbp/ThisWeekList";
import { IconLock } from "@tabler/icons-react";
import { RecItem } from "@/components/gbp/GoogleRecs";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";
import { gbpResultText } from "@/components/gbp/GbpResultMessage";
import { GBP_PROFILE_ANCHOR, gbpConnectHref } from "@/lib/gbpLanding";
import { growthPlanHref, offersHref } from "@/lib/routes";
import { isPremiumPlan, type Plan } from "@/lib/plan";
import { RESULTS_SECTIONS, type JumpSectionId } from "@/lib/googleProfileTab";
import { SAMPLE_INSIGHTS } from "@/lib/googleProfileTab";
import { audience, SAMPLE_AUDIENCE } from "@/lib/gbpInsights";
import { JumpMenu, SyncContext, useSync } from "@/components/gbp/googleTabParts";
import { K, type GoogleProfileTabProps, GOLD_LIGHT, NAVY_2, NAVY_LINE, SectionHead, Box, SampleTag, SyncMessage, ComingCard, monthName, spanLabel, monthYear, useTabIdeas, thisWeekRecs } from "@/components/gbp/googleTabParts";

/** The hero's "How it's calculated" line: only with views to divide by. */
export function howCalculated(interactions: number, views: number): { interactions: number; views: number } | null {
  return views > 0 ? { interactions, views } : null;
}

// ---------------------------------------------------------------------------
// 1 Last month on Google
// ---------------------------------------------------------------------------

/** On Google results (a Growth page), a link stays only when it stays in
 * Growth: the page's own anchors and Customer offers. Anything in Presence
 * (listing editors, Reviews, Website) shows as plain words — the page's one
 * link to Presence is "Fix your listing →" in the top bar (spec §2). */
export function resultsPageHref(href: string, businessId: string): string | null {
  if (/^#(this-week|last-month|since|funnel|searches|google-tab-levers)/.test(href)) return href;
  const offers = offersHref(businessId).split(/[?#]/)[0];
  return href.startsWith(offers) ? href : null;
}

const LEVER_ICON: Record<LeverId, ReactNode> = {
  reviews: <IconStar size={15} aria-hidden />,
  photos: <IconPhoto size={15} aria-hidden />,
  posts: <IconPencil size={15} aria-hidden />,
  deals: <IconDiscount2 size={15} aria-hidden />,
  website: <IconBuildingStore size={15} aria-hidden />,
};

/** The chip's short label: "Reviews · 0%", "Photos · 2 mo", "Posts · none", "Deals · none", "Website · 29/30". */
export function leverShort(lever: Lever, locale: Locale): string {
  const status = lever.id === "deals" && lever.status === "running" && lever.params.count === 1 ? "runningOne" : lever.id === "photos" && lever.status === "newest" && lever.params.months === 1 ? "newestOne" : lever.status;
  return `${t(locale, K(`lever.short.${lever.id}.title`))} · ${t(locale, K(`lever.short.${lever.id}.${status}`), lever.params)}`;
}

/** The lever's grey status and its pill, in words. */
export function leverText(lever: Lever, locale: Locale): { status: string; pill: string } {
  const p = lever.params;
  const status =
    lever.id === "deals" && lever.status === "running" && p.count === 1
      ? t(locale, K("lever.deals.status.runningOne"))
      : t(locale, K(`lever.${lever.id}.status.${lever.status}`), p);
  const pill = lever.pill === "fixes" ? t(locale, K(p.count === 1 ? "lever.pill.fixesOne" : "lever.pill.fixes"), p) : t(locale, K(`lever.pill.${lever.pill}`), p);
  return { status, pill };
}

/** The last 6 full months' conversion rate: a 0-based scale with faint
 * gridlines, a month under every point, the latest value labelled, the
 * rest on hover/tap, gaps for months with no data. Lines are drawn in a
 * stretched SVG (strokes keep their width); dots and labels are positioned
 * over it so they stay round and sharp at any width. */
const CHART_H = 84;
function RateChartBox({ trend, months, events = [] }: { trend: Array<{ month: string; rate: number | null }>; months: InsightsMonth[]; events?: ActionEvent[] }) {
  const locale = useLocale();
  const chart = rateChart(trend, CHART_H);
  if (!chart) return null;
  // Day 23C: small dots on the bottom line for what the owner did, by day.
  const markers = chartMarkers(events, trend.map((p) => p.month));
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const lastIndex = chart.points.map((p) => p.rate !== null).lastIndexOf(true);
  const summary = chart.points.map((p) => `${monthName(p.month, locale, "short")} ${p.rate === null ? "—" : formatRate(p.rate, locale)}`).join(", ");
  return (
    <div className={cn("rounded-xl border px-3.5 py-3", NAVY_2, NAVY_LINE)} data-testid="google-tab-trend">
      <div className="flex items-baseline justify-between gap-2 text-[11.5px] leading-tight">
        <span className="text-white/65">{trend.length ? spanLabel(trend[trend.length - 1].month, locale) : t(locale, K("rate.trend"))}</span>
        {chart.best && (
          <span className="text-white/80" data-testid="google-tab-trend-best">
            {t(locale, K("rate.best"), { month: monthName(chart.best.month, locale, "short"), rate: formatRate(chart.best.rate, locale) })}
          </span>
        )}
      </div>
      <div className="mt-2 flex" role="img" aria-label={t(locale, K("rate.trendAria"), { values: summary })}>
        {/* Y labels: 0% at the bottom, the top of the scale at the top. */}
        <div className="relative w-7 shrink-0 text-[10px] text-white/45" style={{ height: CHART_H }} aria-hidden>
          {chart.grid.map((g) => (
            <span key={g} className="absolute right-1 -translate-y-1/2" style={{ top: CHART_H - (g / chart.yMax) * CHART_H }}>
              {g}%
            </span>
          ))}
        </div>
        {/* Inset so the first and last month labels don't touch the edges. */}
        <div className="relative min-w-0 flex-1 px-3" aria-hidden>
          <div className="relative" style={{ height: CHART_H }}>
            <svg viewBox={`0 0 100 ${CHART_H}`} preserveAspectRatio="none" width="100%" height={CHART_H} className="absolute inset-0 overflow-visible">
              <defs>
                <linearGradient id="rate-area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-brass)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--color-brass)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {chart.grid.map((g) => (
                <line key={g} x1="0" x2="100" y1={CHART_H - (g / chart.yMax) * CHART_H} y2={CHART_H - (g / chart.yMax) * CHART_H} stroke="white" strokeOpacity={g === 0 ? 0.18 : 0.08} vectorEffect="non-scaling-stroke" />
              ))}
              {chart.segments.map((seg, i) => (
                <g key={i}>
                  <path d={seg.area} fill="url(#rate-area)" />
                  <path d={seg.line} fill="none" stroke="color-mix(in srgb, var(--color-brass) 70%, white)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                </g>
              ))}
            </svg>
            {chart.points.map((p, i) => {
              if (p.y === null || p.rate === null) return null;
              const latest = i === lastIndex;
              const m = byMonth.get(p.month);
              const tip = t(locale, K("rate.tooltip"), { month: monthName(p.month, locale, "short"), rate: formatRate(p.rate, locale), actions: formatCount(m ? actions(m) : 0, locale), viewers: formatCount(m ? totalViews(m) : 0, locale) });
              return (
                <span key={p.month} className="group absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: p.y }} data-testid={latest ? "google-tab-trend-latest" : "google-tab-trend-dot"}>
                  {latest && (
                    <span className={cn("absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold", GOLD_LIGHT)}>{formatRate(p.rate, locale)}</span>
                  )}
                  <span
                    tabIndex={latest ? -1 : 0}
                    title={tip}
                    className={cn("block rounded-full outline-none", latest ? "h-2.5 w-2.5 bg-brass ring-2 ring-[color:color-mix(in_srgb,var(--color-ink)_88%,white)]" : "h-1.5 w-1.5 bg-[color:color-mix(in_srgb,var(--color-brass)_70%,white)] focus-visible:ring-2 focus-visible:ring-white/60")}
                  />
                  {!latest && (
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-1.5 py-0.5 text-[11px] text-ink shadow group-hover:block group-focus-within:block">{tip}</span>
                  )}
                </span>
              );
            })}
          {markers.map((mk) => {
            const tip = eventLine(mk.date, mk.events, locale);
            return (
              <span key={mk.date} className="group absolute z-[5] -translate-x-1/2" style={{ left: `${mk.x}%`, top: CHART_H - 4 }} data-testid="google-tab-trend-action">
                <span tabIndex={0} title={tip} aria-label={tip} className="block h-2 w-2 rounded-full border border-[color:color-mix(in_srgb,var(--color-ink)_88%,white)] bg-white outline-none focus-visible:ring-2 focus-visible:ring-white/60" />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-1.5 py-0.5 text-[11px] text-ink shadow group-hover:block group-focus-within:block">{tip}</span>
              </span>
            );
          })}
          </div>
          {/* A month under every point; the latest bold. */}
          <div className="relative mt-1 h-3.5 text-[10.5px] leading-none text-white/50">
            {chart.points.map((p, i) => (
              <span key={p.month} className={cn("absolute -translate-x-1/2", i === lastIndex && "font-semibold text-white/85")} style={{ left: `${p.x}%` }}>
                {monthName(p.month, locale, "short")}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The change as a small pill: "▼ 3 vs September" — customers per 100
 * people, red down, green up; under half a customer per 100 is "Same as
 * September". The full sentence is its title. Never "points" or "%". */
function PointsChange({ now, before, month }: { now: number; before: number; month: string }) {
  const locale = useLocale();
  const change = per100Change(now, before);
  return (
    <span
      data-testid="google-tab-points"
      data-dir={change.dir}
      title={t(locale, K(`rate.per100.${change.dir}`), { count: change.count, month })}
      className={cn("inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold", change.dir === "up" ? "bg-[#7fd3a0]/15 text-[#7fd3a0]" : change.dir === "down" ? "bg-[#e8a59b]/15 text-[#e8a59b]" : "bg-white/10 text-white/80")}
    >
      {t(locale, K(`rate.change.${change.dir}`), { count: change.count, month })}
    </span>
  );
}

/** Google results: "Down from 24.6% in September" — the rate itself, never
 * points (Growth pages show no PostScore points). Under 0.1 apart: "About the same". */
function RateCompare({ now, before, month }: { now: number; before: number; month: string }) {
  const locale = useLocale();
  const diff = Math.round((now - before) * 10) / 10;
  const dir = diff < 0 ? "down" : diff > 0 ? "up" : "same";
  return (
    <span data-testid="google-results-compare" data-dir={dir} className="text-[14px] font-semibold text-white/85">
      {t(locale, `dashboard.googlePages.results.compare.${dir}`, { rate: formatRate(before, locale), month })}
    </span>
  );
}

/** "ⓘ": a 44px tap target that opens a small panel (and closes on a second tap, Escape or a tap outside).
 * The panel stays in the page (hidden) so screen readers and tests find its words. */
function InfoPop({ label, children, onDark = false, align = "left", testId }: { label: string; children: ReactNode; onDark?: boolean; align?: "left" | "right"; testId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={cn("-m-2.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-[15px]", onDark ? "text-white/70 hover:text-white" : "text-ink-mute hover:text-ink")}
        data-testid={testId}
      >
        ⓘ
      </button>
      <span
        hidden={!open}
        role="dialog"
        aria-label={label}
        className={cn("absolute bottom-full z-50 mb-2 w-[min(340px,85vw)] rounded-xl border border-paper-deep bg-white p-4 text-left text-[13px] leading-snug text-ink shadow-card", align === "right" ? "right-0" : "left-0")}
      >
        {children}
      </span>
    </span>
  );
}

/** "What that could be worth", honestly: a range (a third to all of last
 * month's customer actions as visits, or the owner's own share) and what
 * last month's viewers would have meant at the best rate of the last 6
 * months. Both estimates. Day 23C: "How we calculated this" opens the real
 * math inline, where the owner can change the average visit (the same
 * value as Settings) and how many actions become paying visits — the
 * numbers update as they change. */
export function WorthBox({ businessId, months, last, averageVisit, visitShare = null, sample = false }: { businessId: string; months: InsightsMonth[]; last: InsightsMonth; averageVisit: number | null; visitShare?: VisitShare; sample?: boolean }) {
  const locale = useLocale();
  const [avg, setAvg] = useState<number | null>(averageVisit);
  const [share, setShare] = useState<VisitShare>(visitShare);
  const [open, setOpen] = useState(false);
  const acted = actions(last);
  const math = revenueMath(acted, avg, share);
  const left = leftOnTable(months, avg);
  const leftRange = left?.kind === "missed" ? leftMoney(left.extra, avg, share) : null;
  const money = (v: number) => `$${formatCount(v, locale)}`;
  const shareWord = (v: number) => (Math.abs(v - 1 / 3) < 0.005 ? t(locale, K("worth.share.third")) : v === 1 ? t(locale, K("worth.share.all")) : t(locale, K("worth.share.pct"), { percent: formatCount(sharePercent(v), locale) }));
  const toggle = (
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="google-tab-worth-how" className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-white underline decoration-brass underline-offset-2 lg:min-h-[36px]">
      {t(locale, K(open ? "worth.howClose" : "worth.howOpen"))}
    </button>
  );
  const panel = open && (
    <WorthPanel
      businessId={businessId}
      sample={sample}
      avg={avg}
      share={share}
      onAvg={setAvg}
      onShare={setShare}
      mathLines={math ? (math.source === "default" ? [math.shares[0], math.shares[1]] : [math.shares[0]]).map((sh, i) => t(locale, K("worth.math"), { actions: formatCount(acted, locale), avg: money(math.averageVisit), share: shareWord(sh), result: money(Math.round(math.exact[i])) })) : []}
    />
  );
  const strip = "rounded-xl bg-ink px-5 py-3 text-white lg:px-4 lg:py-2";
  if (!math) {
    return (
      <div className={strip} data-testid="google-tab-worth">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-[15px] font-semibold">{t(locale, K("worth.label"))}</p>
          <Link href={`/business/${businessId}/settings#average-visit`} data-testid="google-tab-worth-set" className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-white underline decoration-brass underline-offset-2">
            {t(locale, K("worth.setIt"))}
          </Link>
          {acted > 0 && toggle}
        </div>
        {panel}
      </div>
    );
  }
  return (
    <div className={strip} data-testid="google-tab-worth">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-[15px] leading-snug">
          <b className="font-semibold" data-testid="google-tab-worth-brought">
            {math.low === math.high ? t(locale, K("worth.broughtOne"), { amount: money(math.low) }) : t(locale, K("worth.brought"), { low: money(math.low), high: money(math.high) })}
          </b>
          <span data-testid="google-tab-left">
            {left?.kind === "missed" && leftRange ? (
              <span className="text-white/80"> · {leftRange.low === leftRange.high ? t(locale, K("worth.strip.leftOne"), { amount: money(leftRange.high) }) : t(locale, K("worth.strip.left"), { low: money(leftRange.low), high: money(leftRange.high) })}</span>
            ) : left?.kind === "matched" ? (
              <span className="text-white/80"> · {t(locale, K("worth.matched"))}</span>
            ) : null}
          </span>
          <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 align-middle text-[13px] text-white/80">{t(locale, K("worth.estimate"))}</span>
        </p>
        {toggle}
      </div>
      {open && (
        <div className="mt-1 text-[13px] leading-snug text-white/75">
          <p>
            {math.source === "default"
              ? t(locale, K("worth.broughtSub"), { actions: formatCount(acted, locale), avg: formatCount(math.averageVisit, locale) })
              : t(locale, K("worth.broughtSubOwn"), { actions: formatCount(acted, locale), avg: formatCount(math.averageVisit, locale), share: shareWord(math.shares[0]) })}
          </p>
          {left?.kind === "missed" && <p>{t(locale, K("worth.leftSub"), { month: monthName(left.best.month, locale), best: formatRate(left.best.rate, locale), views: formatCount(totalViews(last), locale), extra: left.extra })}</p>}
          <p>{t(locale, K("worth.info"))}</p>
        </div>
      )}
      {panel}
    </div>
  );
}

/** The inline panel: the real math, which actions count, and the two assumptions (saved for the owner). */
function WorthPanel({ businessId, sample, avg, share, onAvg, onShare, mathLines }: { businessId: string; sample: boolean; avg: number | null; share: VisitShare; onAvg: (v: number | null) => void; onShare: (v: VisitShare) => void; mathLines: string[] }) {
  const locale = useLocale();
  const [avgText, setAvgText] = useState(avg !== null ? String(avg) : "");
  const [choice, setChoice] = useState(shareChoice(share));
  const [ownText, setOwnText] = useState(choice === "own" && share !== null ? String(sharePercent(share)) : "");
  const [status, setStatus] = useState<{ field: "avg" | "share"; kind: "saved" | "failed" | "notReady" | "invalidAvg" | "invalidShare" } | null>(null);
  const field = "h-8 rounded-lg border border-white/30 bg-white px-2 text-[13px] text-ink";
  const tag = (mine: boolean) => (
    <span className={cn("rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-semibold", mine ? "bg-brass text-ink" : "bg-white/10 text-white/80")} data-testid={mine ? "worth-tag-yours" : "worth-tag-default"}>
      {t(locale, K(mine ? "worth.tag.yours" : "worth.tag.default"))}
    </span>
  );
  async function saveAvg() {
    const raw = avgText.trim();
    const parsed = raw === "" ? null : Number(raw.replace(/[$,\s]/g, ""));
    if (parsed !== null && !(Number.isFinite(parsed) && parsed > 0 && parsed < 100000)) return setStatus({ field: "avg", kind: "invalidAvg" });
    onAvg(parsed);
    if (sample) return setStatus({ field: "avg", kind: "saved" });
    const r = await saveAverageVisitValue(businessId, raw).catch(() => null);
    setStatus({ field: "avg", kind: r?.status === "ok" ? "saved" : r?.status === "error" && r.error === "not_ready" ? "notReady" : r?.status === "error" && r.error === "invalid" ? "invalidAvg" : "failed" });
  }
  async function saveShare(v: VisitShare) {
    onShare(v);
    if (sample) return setStatus({ field: "share", kind: "saved" });
    const r = await saveVisitShare(businessId, v).catch(() => null);
    setStatus({ field: "share", kind: r?.status === "ok" ? "saved" : r?.status === "error" && r.error === "not_ready" ? "notReady" : "failed" });
  }
  const statusLine = (f: "avg" | "share") =>
    status?.field === f && (
      <span role="status" className={cn("text-[11.5px]", status.kind === "saved" ? "text-[#7fd3a0]" : "text-[#e8a59b]")} data-testid={`worth-status-${f}`}>
        {t(locale, K({ saved: "worth.saved", failed: "worth.saveFailed", notReady: "worth.notReady", invalidAvg: "worth.invalidAvg", invalidShare: "worth.invalidShare" }[status.kind]))}
      </span>
    );
  const radio = (id: "default" | "third" | "half" | "most" | "own") => (
    <label key={id} className="flex items-center gap-1.5 text-[12.5px] text-white/90">
      <input
        type="radio"
        name={`visit-share-${businessId}`}
        checked={choice === id}
        onChange={() => {
          setChoice(id);
          setStatus(null);
          if (id === "default") void saveShare(null);
          else if (id !== "own") void saveShare(SHARE_PRESETS[id]);
          else {
            // "My own %": saved once a number is typed.
            const v = parseSharePercent(ownText);
            if (v !== "invalid") void saveShare(v);
          }
        }}
        data-testid={`worth-share-${id}`}
        className="accent-[color:var(--color-brass)]"
      />
      {t(locale, K(`worth.choice.${id}`))}
    </label>
  );
  return (
    <div className="mt-2.5 border-t border-white/15 pt-2.5 text-white" data-testid="google-tab-worth-panel">
      {mathLines.map((line) => (
        <p key={line} className="text-[12.5px] font-semibold leading-snug" data-testid="worth-math">
          {line}
        </p>
      ))}
      <p className="mt-1 text-[12px] leading-snug text-white/70">{t(locale, K("worth.counts"))}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-white/85">
            {t(locale, K("worth.avgLabel"))} {avg !== null && tag(true)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[13px]">$</span>
            <input value={avgText} onChange={(e) => setAvgText(e.target.value)} inputMode="decimal" aria-label={t(locale, K("worth.avgLabel"))} className={cn(field, "w-24")} data-testid="worth-avg-input" />
            <button type="button" onClick={() => void saveAvg()} className="h-8 rounded-lg border border-white/40 px-2.5 text-[12.5px] font-semibold text-white hover:bg-white/10" data-testid="worth-avg-save">
              {t(locale, K("worth.save"))}
            </button>
            {statusLine("avg")}
          </div>
          <p className="mt-0.5 text-[11.5px] text-white/60">{t(locale, K("worth.avgSettings"))}</p>
        </div>
        <div>
          <p className="flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-white/85">
            {t(locale, K("worth.shareLabel"))} {tag(share !== null)}
          </p>
          <div className="mt-1 flex flex-col gap-0.5">
            {(["default", "third", "half", "most"] as const).map(radio)}
            <div className="flex flex-wrap items-center gap-1.5">
              {radio("own")}
              <input
                value={ownText}
                onChange={(e) => setOwnText(e.target.value)}
                onFocus={() => setChoice("own")}
                onBlur={() => {
                  if (ownText.trim() === "") return;
                  const v = parseSharePercent(ownText);
                  if (v === "invalid") setStatus({ field: "share", kind: "invalidShare" });
                  else void saveShare(v);
                }}
                inputMode="decimal"
                aria-label={t(locale, K("worth.choice.own"))}
                className={cn(field, "w-16")}
                data-testid="worth-share-own-input"
              />
              <span className="text-[12.5px]">%</span>
            </div>
            {statusLine("share")}
          </div>
        </div>
      </div>
    </div>
  );
}

/** `page`: the Google results page — the hero's own wording and comparison,
 * and This week / Since you did this as their own sections (not in here). */
export function LastMonthSection(props: GoogleProfileTabProps & { months: InsightsMonth[]; sample: boolean; page?: boolean }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const { months, sample } = props;
  const { last, prev } = lastTwo(months);
  const rate = last ? conversionRate(actions(last), totalViews(last)) : null;
  const prevRate = prev ? conversionRate(actions(prev), totalViews(prev)) : null;
  const small = isSmallMonth(last);
  const trend = rateTrend(months);
  const next = formatShortDate(nextMonthlyUpdate(new Date(), timeZone), locale, "UTC").replace(/,? \d{4}$/, "");
  const ls = levers({
    businessId: props.businessId,
    replies: props.replyCounts ? { replied: props.replyCounts.replied, inWindow: props.replyCounts.reviewsInWindow } : null,
    couponsRunning: props.saved?.couponsRunning ?? 0,
    website: props.website,
    media: props.media ?? null,
  });
  const averageVisit = sample ? SAMPLE_AVERAGE_VISIT : (props.averageVisit ?? null);
  const of = last ? { actions: formatCount(actions(last), locale), viewers: formatCount(totalViews(last), locale) } : null;

  return (
    <SectionHead n={1} id="last-month" title={t(locale, K("s1.title"))} first={props.page ? true : undefined}>
      <div className="mt-4 flex flex-col gap-5">
        {/* 1. The hero: the month's conversion rate and the 6-month chart. */}
        <div className="rounded-xl bg-ink p-5 text-white sm:p-6" data-testid="google-tab-hero">
          {rate !== null && last && of ? (
            <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" data-testid="google-tab-rate">
              <div className="flex min-w-0 flex-col">
                <p className="text-[15px] font-semibold">
                  {t(locale, K("s1.heroTitle"))}
                  {sample && <SampleTag className="ml-2" />}
                </p>
                <p className="text-[13px] text-white/70" data-testid="google-tab-rate-month">
                  {t(locale, K("s1.lastFull"), { month: monthName(last.month, locale) })}
                </p>
                <div className={cn("mt-4 font-serif text-[56px] font-semibold leading-none", GOLD_LIGHT)}>{formatRate(rate, locale)}</div>
                <p className="mt-2 max-w-[440px] text-[15px] leading-snug text-white/85">{t(locale, props.page ? "dashboard.googlePages.results.heroSentence" : K("rate.sentenceShort"))}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {prev && prevRate !== null && !small && (props.page ? <RateCompare now={rate} before={prevRate} month={monthName(prev.month, locale)} /> : <PointsChange now={rate} before={prevRate} month={monthName(prev.month, locale)} />)}
                  <InfoPop label={t(locale, K("rate.infoLabel"))} onDark testId="google-tab-rate-info">
                    {howCalculated(actions(last), totalViews(last)) && (
                      <span className="block" data-testid="google-tab-rate-how">
                        {t(locale, K("rate.how"), { interactions: formatCount(actions(last), locale), views: formatCount(totalViews(last), locale) })}
                      </span>
                    )}
                    <span className="mt-2 block" data-testid="google-tab-rate-change">
                      <span className="block font-semibold">{t(locale, K("rate.monthLine"), { month: monthName(last.month, locale), rate: formatRate(rate, locale), ...of })}</span>
                      {prev && prevRate !== null && <span className="block text-ink-soft">{t(locale, K("rate.monthLine"), { month: monthName(prev.month, locale), rate: formatRate(prevRate, locale), actions: formatCount(actions(prev), locale), viewers: formatCount(totalViews(prev), locale) })}</span>}
                      {small && <span className="block text-ink-soft">{t(locale, K("rate.small"))}</span>}
                    </span>
                    <span className="mt-2 block text-ink-mute">{t(locale, K("rate.howTip"))}</span>
                  </InfoPop>
                </div>
                <p className="mt-4 text-[13px] text-white/60">{t(locale, K("rate.updates"), { date: next })}</p>
              </div>
              <RateChartBox trend={trend} months={months} events={sample ? [] : (props.actionEvents ?? [])} />
            </div>
          ) : (
            <div data-testid="google-tab-rate-empty">
              <p className="text-[15px] font-semibold">{t(locale, K("s1.heroTitle"))}</p>
              <SyncMessage className={cn("mt-3 font-serif text-[22px] font-semibold leading-snug", GOLD_LIGHT)} onDark />
              <p className="mt-2 max-w-[620px] text-[15px] leading-snug text-white/75">{t(locale, K("rate.emptyBody"))}</p>
              <p className="mt-4 text-[13px] text-white/60">{t(locale, K("rate.updates"), { date: next })}</p>
            </div>
          )}
        </div>

        {/* 2. The numbers. */}
        {last ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="google-tab-kpis">
              {(["calls", "directions", "bookings", "websiteClicks"] as const).map((k) => {
                const d = prev ? last[k] - prev[k] : null;
                const note =
                  k === "bookings" && last.bookings === 0 && props.booking?.tracking.kind === "partner_not_counted" ? (
                    <span data-testid="booking-tile-note">{t(locale, K("booking.notCountedA"), { provider: props.booking.tracking.provider })}</span>
                  ) : k === "bookings" && last.bookings === 0 && props.booking?.tracking.kind === "turn_on" ? (
                    <a href="#edit-booking-steps" data-testid="booking-tile-note" className="font-semibold text-ink underline underline-offset-2">
                      {t(locale, K("booking.tileB"), { partner: props.booking.tracking.provider })}
                    </a>
                  ) : null;
                return (
                  <Box key={k} className="flex min-w-0 flex-col gap-1 p-4 lg:px-3.5 lg:py-3" data-testid={`google-tab-kpi-${k}`}>
                    <span className="flex items-start justify-between gap-2">
                      <b className="font-serif text-[28px] font-semibold leading-none text-ink">{formatCount(last[k], locale)}</b>
                      {note && (
                        <InfoPop label={t(locale, K("kpi.infoLabel"))} align="right">
                          {note}
                        </InfoPop>
                      )}
                    </span>
                    <span className="text-[13px] leading-snug text-ink-soft">{t(locale, K(`kpi.in.${k}`), { month: monthName(last.month, locale) })}</span>
                    {prev && (
                      <span className={cn("text-[13px] font-semibold", d && d > 0 ? "text-green" : d && d < 0 ? "text-red" : "text-ink-mute")}>
                        {d && d > 0 ? `▲${d} ` : d && d < 0 ? `▼${-d} ` : "= "}
                        <span className="font-normal text-ink-mute">{t(locale, K("kpi.vsMonth"), { month: monthName(prev.month, locale, "short") })}</span>
                      </span>
                    )}
                  </Box>
                );
              })}
            </div>
            {props.connected && !sample && <SoFarLine businessId={props.businessId} last={last.month} />}
          </div>
        ) : (
          <Box className="p-4 text-[13px] text-ink-soft" data-testid="google-tab-kpis-empty">
            {t(locale, K("kpi.empty"))}
          </Box>
        )}

        {/* 3. The money. */}
        {last && <WorthBox businessId={props.businessId} months={months} last={last} averageVisit={averageVisit} visitShare={sample ? null : (props.visitShare ?? null)} sample={sample} />}

        {/* 4. What to do this week: the levers as status chips, Approve all, the to-dos. */}
        {!props.page && (
          <Box className="p-5 sm:p-6 lg:px-5 lg:py-4">
            <ThisWeek props={props} chips={<LeverChips levers={ls} />} />
          </Box>
        )}

        {/* 5. Since you did this (with what you did last month first). */}
        {!props.page && <SinceCard businessId={props.businessId} connected={props.connected} sample={sample} events={props.actionEvents ?? []} recap={<RecapLine saved={props.saved} />} />}
      </div>
    </SectionHead>
  );
}

/** The five levers as one row of small status chips ("Reviews · 0% replied"); a tap shows the research line and where to do it. */
/** `page` (Google results): the Website chip shows ✓ or "needs work", never
 * its PostScore points; a hash link to the listing goes to Google listing. */
export function LeverChips({ levers: ls, page = null }: { levers: Lever[]; page?: { businessId: string } | null }) {
  const locale = useLocale();
  const websiteWords = (lever: Lever) => (lever.tone === "ok" ? "✓" : t(locale, "dashboard.googlePages.results.websiteWork"));
  const short = (lever: Lever) => (page && lever.id === "website" && lever.status === "score" ? `${t(locale, K("lever.short.website.title"))} ${lever.tone === "ok" ? "✓" : `· ${websiteWords(lever)}`}` : leverShort(lever, locale));
  const status = (lever: Lever) => (page && lever.id === "website" && lever.status === "score" ? websiteWords(lever) : leverText(lever, locale).status);
  const href = (h: string): string | null => (page ? resultsPageHref(h, page.businessId) : h);
  const [open, setOpen] = useState<LeverId | null>(null);
  const shown = ls.find((l) => l.id === open) ?? null;
  const DOT: Record<Tone, string> = { ok: "bg-green", warn: "bg-amber", bad: "bg-red", neutral: "bg-paper-deep" };
  return (
    <div id="google-tab-levers" className="flex scroll-mt-20 flex-col gap-2" data-testid="google-tab-levers">
      <div className="flex flex-wrap gap-2" data-testid="google-tab-lever-grid">
        {ls.map((lever) => {
          const text = leverText(lever, locale);
          return (
            <button
              key={lever.id}
              type="button"
              onClick={() => setOpen(open === lever.id ? null : lever.id)}
              aria-expanded={open === lever.id}
              title={t(locale, K(`lever.${lever.id}.why`))}
              className={cn("inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-[13px] text-ink lg:min-h-[32px] lg:px-3", open === lever.id ? "border-ink" : "border-paper-line hover:border-ink")}
              data-testid={`lever-${lever.id}`}
            >
              <span className="text-brass">{LEVER_ICON[lever.id]}</span>
              <span className="font-semibold">{short(lever)}</span>
              <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[lever.tone])} data-testid={`lever-pill-${lever.id}`} data-tone={lever.tone} title={text.pill} aria-label={text.pill} />
            </button>
          );
        })}
      </div>
      {shown && (
        <p className="rounded-lg bg-paper px-3.5 py-2.5 text-[13px] leading-snug text-ink-soft" data-testid="lever-why">
          <b className="text-ink">
            {t(locale, K(`lever.${shown.id}.title`))}: {status(shown)} · {leverText(shown, locale).pill}.
          </b>{" "}
          {t(locale, K(`lever.${shown.id}.why`))}{" "}
          {href(shown.href) === null ? null : href(shown.href)!.startsWith("#") ? (
            <a href={href(shown.href)!} className="font-semibold text-ink underline underline-offset-2">
              {t(locale, K("lever.go"))}
            </a>
          ) : (
            <Link href={href(shown.href)!} className="font-semibold text-ink underline underline-offset-2">
              {t(locale, K("lever.go"))}
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

/** "Last month you: … Not yet: …" from the real logs. */
export function recapSentence(saved: GoogleTabSaved | null, locale: Locale): { did: string; notYet: string | null } {
  const did = saved?.recap.did ?? [];
  const parts = did.map((d) => (d.count !== undefined ? t(locale, K(`recap.${d.key}${d.count === 1 ? "One" : ""}`), { count: d.count }) : t(locale, K(`recap.${d.key}`))));
  const notYet = (saved?.recap.notYet ?? []).map((k) => t(locale, K(`recap.not.${k}`)));
  return { did: parts.length > 0 ? parts.join(" · ") : t(locale, K("recap.nothing")), notYet: notYet.length > 0 ? notYet.join(", ") : null };
}

export function RecapLine({ saved }: { saved: GoogleTabSaved | null }) {
  const locale = useLocale();
  const s = recapSentence(saved, locale);
  return (
    <p data-testid="google-tab-recap" className="text-[13px] leading-snug text-ink-soft">
      <b className="text-ink">{t(locale, K("recap.did"))}</b> {s.did}.{" "}
      {s.notYet && (
        <>
          <b className="text-ink">{t(locale, K("recap.notYetLabel"))}</b> {s.notYet}.{" "}
        </>
      )}
      {t(locale, K("recap.tail"))}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Day 23C: this week's to-dos, what you did on the chart, "Since you did this"
// ---------------------------------------------------------------------------

/** "November so far: 12 calls, 20 website clicks, 31 direction requests" —
 * this month's live daily numbers (never stored), only once the month after
 * the last full one has begun and Google has a day of it. */
function SoFarLine({ businessId, last }: { businessId: string; last: string }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [r, setR] = useState<MonthSoFarResult | null>(null);
  useEffect(() => {
    let alive = true;
    void within(loadMonthSoFar(businessId, timeZone), 20_000, { status: "failed" } as MonthSoFarResult).then((v) => alive && setR(v));
    return () => {
      alive = false;
    };
  }, [businessId, timeZone]);
  if (!r || r.status !== "ok" || r.month <= last) return null;
  const item = (k: "calls" | "websiteClicks" | "directions", n: number) => t(locale, K(`soFar.${k}${n === 1 ? "One" : ""}`), { count: formatCount(n, locale) });
  const next = addMonths(r.month, 1);
  return (
    <p className="px-4 text-[13px] leading-snug text-ink-soft lg:px-3.5" data-testid="google-tab-so-far">
      <b className="font-semibold text-ink">
        {t(locale, K("soFar.line"), { month: monthName(r.month, locale).replace(/^./, (c) => c.toUpperCase()), date: shortDate(r.through, locale), list: [item("calls", r.calls), item("websiteClicks", r.websiteClicks), item("directions", r.directions)].join(", ") })}
      </b>{" "}
      <span className="text-ink-mute">{t(locale, K("soFar.note"), { month: monthName(next, locale, "short"), from: 1, to: 5 })}</span>
    </p>
  );
}

/** Under the levers: the levers' to-dos in exact numbers (replies, photos,
 * the post) and the answers, with Approve all (components/gbp/ThisWeekList.tsx). */
export function ThisWeek({ props, chips, noTitle = false }: { props: GoogleProfileTabProps; chips?: ReactNode; noTitle?: boolean }) {
  const locale = useLocale();
  const { recs, type } = useTabIdeas(props);
  // The page's section already says "What to do this week": no second label (ThisWeekList's "This week").
  const title = noTitle ? <></> : <h3 className="text-[15px] font-bold text-ink">{t(locale, K("s1.todo.title"))}</h3>;
  return <ThisWeekList businessId={props.businessId} recs={thisWeekRecs(recs)} type={type} canEdit={props.canEditGoogle === true} practice={props.practice} title={title} chips={chips} />;
}

/** "Nov 3: replied to 10 reviews". */
export function eventText(e: ActionEvent, locale: Locale): string {
  const what =
    e.kind === "listing"
      ? (e.what ?? []).map((k) => t(locale, K(`recap.listing.${k}`))).join(", ")
      : t(locale, K(`ev.${e.kind}${e.count === 1 ? "One" : ""}`), { count: e.count });
  return what;
}
export function eventLine(date: string, events: ActionEvent[], locale: Locale): string {
  return t(locale, K("ev.line"), { date: shortDate(date, locale), what: events.map((e) => eventText(e, locale)).join(" · ") });
}

const SINCE_METRICS = ["calls", "websiteClicks", "directions", "rate"] as const;

/** `page` (Google results): decreases in gray, increases in green. */
function SinceTable({ result, page = false }: { result: { days: number; before: WindowTotals; after: WindowTotals }; page?: boolean }) {
  const locale = useLocale();
  const cell = "whitespace-nowrap px-1.5 py-0.5 text-right tabular-nums";
  return (
    <table className="mt-2 w-full text-[13px]">
      <thead>
        <tr className="text-[13px] text-ink-mute">
          <th className="py-0.5 pr-1.5 text-left font-semibold">
            <span className="sm:hidden">{t(locale, K("since.windowShort"), { days: result.days })}</span>
            <span className="hidden sm:inline">{t(locale, K("since.window"), { days: result.days })}</span>
          </th>
          <th className={cn(cell, "font-semibold")}>{t(locale, K("since.before"))}</th>
          <th className={cn(cell, "font-semibold")}>{t(locale, K("since.after"))}</th>
          <th className={cn(cell, "pr-0 font-semibold")} />
        </tr>
      </thead>
      <tbody>
        {SINCE_METRICS.map((m) => {
          const rate = m === "rate";
          const b = rate ? result.before.rate : result.before[m];
          const a = rate ? result.after.rate : result.after[m];
          const c = change(b, a, rate ? "rate" : "count");
          const show = (v: number | null) => (v === null ? "—" : rate ? formatRate(v, locale) : formatCount(v, locale));
          return (
            <tr key={m} className="border-t border-paper-line/60" data-testid={`since-row-${m}`}>
              <td className="py-0.5 pr-1.5 text-ink-soft">{t(locale, K(`since.metric.${m}`))}</td>
              <td className={cn(cell, "text-ink-soft")}>{show(b)}</td>
              <td className={cn(cell, "font-semibold text-ink")}>{show(a)}</td>
              {/* The change may wrap on a phone ("▼ 4 menos por cada 100") — never cut off. */}
              <td className={cn("px-1.5 py-0.5 pr-0 text-right font-semibold tabular-nums", c?.dir === "up" ? "text-green" : c?.dir === "down" && !page ? "text-red" : "text-ink-mute")} data-dir={c?.dir ?? "none"}>
                {!c ? "" : c.dir === "same" ? (
                  t(locale, K("since.same"))
                ) : rate ? (
                  <>
                    {/* Phones: "▼ 4" with its label under it; wider: one line. */}
                    <span className="whitespace-nowrap">{`${c.dir === "up" ? "▲" : "▼"} ${c.value}`}</span>
                    <span className="block text-[12px] font-normal sm:ml-1 sm:inline">{t(locale, K(`since.per100Label.${c.dir}`))}</span>
                  </>
                ) : (
                  `${c.dir === "up" ? "▲" : "▼"} ${formatCount(c.value, locale)}`
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** "Since you did this": up to 3 recent actions, the 30 days after vs the
 * 30 days before (read live, never stored); "Check back on {date}" under
 * 14 days. "After", never "because". */
/** `page` (Google results): its own numbered section, the "other things
 * also affect these numbers" note above the tables, decreases in gray. */
export function SinceCard({ businessId, connected, sample, events, recap = null, page = false }: { businessId: string; connected: boolean; sample: boolean; events: ActionEvent[]; recap?: ReactNode; page?: boolean }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const today = localToday(Date.now(), timeZone).date;
  const picks = sinceActions(events);
  const ready = picks.filter((e) => sinceStatus(e.date, today).ready).map((e) => e.date);
  const readyKey = Array.from(new Set(ready)).sort().join(",");
  const [data, setData] = useState<SinceResult | "loading" | null>(null);
  useEffect(() => {
    if (sample || !connected || !readyKey) return;
    let alive = true;
    setData("loading");
    // Never stuck on "Reading…": a failed or slow read says it couldn't load.
    void within(loadSinceNumbers(businessId, readyKey.split(",")), 20_000, { status: "failed" } as SinceResult).then((r) => alive && setData(r));
    return () => {
      alive = false;
    };
  }, [businessId, connected, sample, readyKey]);
  const box = "flex flex-col gap-3 rounded-xl border border-paper-deep bg-white p-5 text-ink shadow-card sm:p-6 lg:px-5 lg:py-4";
  const noteEl = <p className="text-[13px] text-ink-mute" data-testid="since-note">{t(locale, K("since.note"))}</p>;
  // The page shows the note once, above the tables; the old tab, under them.
  const note = page ? null : noteEl;
  const head = (
    <>
      {!page ? (
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <h3 className="text-[15px] font-bold">{t(locale, K("since.title"))}</h3>
          {sample && <SampleTag />}
        </div>
      ) : (
        sample && <SampleTag className="w-fit" />
      )}
      {recap}
      {page && noteEl}
    </>
  );
  if (sample) {
    return (
      <div className={box} data-testid="google-tab-since">
        {head}
        <p className="text-[15px] font-semibold">{eventLine(SAMPLE_SINCE.event.date, [SAMPLE_SINCE.event], locale)}</p>
        <SinceTable result={SAMPLE_SINCE.result} page={page} />
        {note}
      </div>
    );
  }
  if (!connected) {
    return (
      <div className={box} data-testid="google-tab-since">
        {head}
        <p className="text-[13px] text-ink-soft" data-testid="since-not-connected">{t(locale, K("since.notConnected"))}</p>
      </div>
    );
  }
  if (picks.length === 0) {
    return (
      <div className={box} data-testid="google-tab-since">
        {head}
        <p className="text-[13px] text-ink-soft" data-testid="since-none">{t(locale, K("since.none"))}</p>
      </div>
    );
  }
  return (
    <div className={box} data-testid="google-tab-since">
      {head}
      <div className="grid items-start gap-3 sm:grid-cols-2">
        {/* Cards with before/after numbers first (full width), then the "Check back on…" ones. */}
        {[...picks].sort((a, b) => Number(sinceStatus(b.date, today).ready) - Number(sinceStatus(a.date, today).ready)).map((e) => {
          const st = sinceStatus(e.date, today);
          const r = data && data !== "loading" && data.status === "ok" ? data.results.find((x) => x.date === e.date) : null;
          return (
            // A card with before/after numbers takes the full width; "Check back on…" cards sit 2 per row below it.
            <div key={`${e.date}-${e.kind}`} className={cn("min-w-0 rounded-xl border border-paper-line p-4 lg:p-3", st.ready && "sm:col-span-2")} data-testid="since-action" data-ready={st.ready ? "1" : "0"}>
              <p className="text-[15px] font-medium leading-snug">{eventLine(e.date, [e], locale)}</p>
              {!st.ready ? (
                <p className="mt-1 text-[13px] text-ink-soft" data-testid="since-check-back">
                  <b className="text-ink">{t(locale, K("since.checkBack"), { date: shortDate(st.checkBack, locale) })}</b> · {t(locale, K("since.checkBackWhy"))}
                </p>
              ) : data === "loading" || data === null ? (
                <p className="mt-1 text-[13px] text-ink-mute" role="status">{t(locale, K("since.loading"))}</p>
              ) : data.status !== "ok" ? (
                <p className="mt-1 text-[13px] text-ink-mute" data-testid="since-failed">{t(locale, K(data.status === "not_connected" ? "since.notConnected" : "since.failed"))}</p>
              ) : r && r.days !== null ? (
                <SinceTable result={r} page={page} />
              ) : (
                <p className="mt-1 text-[13px] text-ink-mute">{t(locale, K("since.noData"))}</p>
              )}
            </div>
          );
        })}
      </div>
      {note}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 How searches became customers · 3 What people searched · 5 Show up for more
// ---------------------------------------------------------------------------

function Bar({ share, navy = false, thin = false }: { share: number; navy?: boolean; thin?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden rounded bg-paper-deep", thin ? "h-2" : "h-[14px]")}>
      <i className={cn("absolute inset-y-0 left-0 rounded", navy ? "bg-ink" : "bg-brass")} style={{ width: `${Math.max(1, Math.min(100, share * 100))}%` }} />
    </div>
  );
}

/** The donut's colors, in AUDIENCE_ROWS order: navy, gold, light gold, grey. */
const AUDIENCE_COLORS = ["var(--color-ink)", "var(--color-brass)", "color-mix(in srgb, var(--color-brass) 50%, white)", "color-mix(in srgb, var(--color-ink-mute) 45%, white)"];

function Donut({ parts }: { parts: number[] }) {
  const total = parts.reduce((a, b) => a + b, 0) || 1;
  const r = 15.9155; // circumference 100
  let offset = 25;
  return (
    <svg viewBox="0 0 42 42" width="90" height="90" aria-hidden className="shrink-0">
      <circle cx="21" cy="21" r={r} fill="none" stroke="var(--color-paper-deep)" strokeWidth="7" />
      {parts.map((p, i) => {
        const len = (p / total) * 100;
        const el = <circle key={i} cx="21" cy="21" r={r} fill="none" stroke={AUDIENCE_COLORS[i]} strokeWidth="7" strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={offset} />;
        offset -= len;
        return el;
      })}
    </svg>
  );
}

/** A card header: the title, and the time period its numbers cover. */
function CardHead({ title, period, extra }: { title: string; period: string; extra?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h4 className="text-[13px] font-semibold">
        {title}
        {extra}
      </h4>
      <span className="shrink-0 text-[11.5px] text-ink-mute" data-testid="card-period">
        {period}
      </span>
    </div>
  );
}

/** "Who saw you": people and interactions over the last 6 months. */
/** "Who saw you": this period vs the same 6 calendar months a year
 * earlier, as a small table (views, interactions, customers per 100
 * viewers), then one fixed takeaway from the two directions. */
function WhoCard({ a, sample, span, page = false }: { a: Audience; sample: boolean; span: string; page?: boolean }) {
  const locale = useLocale();
  const table = whoTable(a);
  if (!table) return null;
  const lastSpan = spanLabel(table.lastTo, locale);
  const history = table.rows[0].last !== null;
  const cell = "px-1.5 py-1 text-right tabular-nums";
  const changeText = (r: WhoRow) => {
    if (!r.change) return t(locale, K("who.noHistory"));
    if (r.change.kind === "more") return r.change.value === 0 ? t(locale, K("who.same")) : t(locale, K(r.change.value > 0 ? "who.more" : "who.fewer"), { count: Math.abs(r.change.value) });
    return r.change.value === 0 ? "0%" : `${Math.abs(r.change.value)}%`;
  };
  return (
    <div className="rounded-xl border border-paper-line p-3" data-testid="google-tab-who">
      <CardHead title={t(locale, K("s2.whoTitle"))} period={history ? t(locale, K("who.vs"), { now: span, last: lastSpan }) : span} extra={sample ? <SampleTag className="ml-2" /> : undefined} />
      <table className="mt-2 w-full text-[12.5px]" data-testid="google-tab-who-table">
        <thead>
          <tr className="text-[13px] text-ink-mute">
            <th className="py-1 pr-1.5 text-left font-semibold" />
            <th className={cn(cell, "font-semibold")}>{span}</th>
            <th className={cn(cell, "font-semibold")}>{lastSpan}</th>
            <th className={cn(cell, "pr-0 font-semibold")}>{t(locale, K("who.change"))}</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => {
            const up = r.change && r.change.value > 0;
            const down = r.change && r.change.value < 0;
            return (
              <tr key={r.id} className="border-t border-paper-line/60" data-testid={`who-row-${r.id}`}>
                <td className="py-1 pr-1.5 text-ink-soft">
                  {r.id === "interactions" ? (
                    <span title={t(locale, K("who.interactionsTip"))} className="cursor-help underline decoration-dotted underline-offset-2">
                      {t(locale, K("who.interactions"))}
                    </span>
                  ) : (
                    t(locale, page && r.id === "per100" ? "dashboard.googlePages.results.per100" : K(`who.${r.id}`))
                  )}
                </td>
                <td className={cn(cell, "font-semibold text-ink")}>{formatCount(r.now, locale)}</td>
                <td className={cn(cell, "text-ink-soft")}>{r.last === null ? "—" : formatCount(r.last, locale)}</td>
                <td className={cn(cell, "whitespace-nowrap pr-0 font-semibold", !r.change ? "font-normal text-ink-mute" : up ? "text-green" : down ? "text-red" : "text-ink-mute")} data-testid={`who-change-${r.id}`}>
                  {r.change && (up || down) && <span aria-hidden>{up ? "▲ " : "▼ "}</span>}
                  {changeText(r)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {a.small && <p className="mt-1.5 text-[12px] text-ink-mute">{t(locale, K("rate.small"))}</p>}
      {table.takeaway && !a.small && (
        <p className="mt-1.5 text-[12.5px] text-ink" data-testid="google-tab-who-takeaway">
          {t(locale, page ? `dashboard.googlePages.results.takeaway.${table.takeaway}` : K(`who.takeaway.${table.takeaway}`))}
        </p>
      )}
      <p className="mt-1.5 text-[11.5px] text-ink-mute">{t(locale, K("s2.counted"))}</p>
      <p className="mt-0.5 text-[11.5px] text-ink-mute">{t(locale, K("s2.otherRange"))}</p>
    </div>
  );
}

/** "Devices and platforms": the same 6 months' views in 4 parts (adding up
 * to the "Who saw you" total, labels never cut off), the phone / computer
 * and Search / Maps split, and "What this means for you" from the real
 * numbers and checks. */
function DevicesCard({ a, className, span, props, page = false }: { a: Audience; className?: string; span: string; props: GoogleProfileTabProps; page?: boolean }) {
  const locale = useLocale();
  const go = (h: string): string | null => (page ? resultsPageHref(h, props.businessId) : h);
  const split = deviceSplit(a.rows);
  const now = Date.now();
  const extras = props.extras ?? null;
  const holiday = extras ? upcomingHolidays(new Date(now)).find((h) => !specialFor(extras.specialPeriods, h.date)) : undefined;
  const speed = props.checks.find((c) => c.id === "website.performance_mobile");
  const advice = deviceAdvice(split, {
    businessId: props.businessId,
    tapToCall: props.websiteHours?.hasPhoneLink ?? null,
    mobileSlow: speed && speed.earnedPoints !== null ? speed.earnedPoints < speed.maxPoints : null,
    bookingLink: !!props.booking && props.booking.link.kind !== "none",
    descriptionLength: extras && extras.description !== undefined ? (extras.description ?? "").trim().length : null,
    photosFresh: props.media?.photos ? !!props.media.photos.newestAt && isFresh(props.media.photos.newestAt, now) : null,
    holidayUnset: holiday?.id ?? null,
    listingRead: !!extras,
  });
  return (
    <div className={cn("flex flex-col rounded-xl border border-paper-line p-3", className)} data-testid="google-tab-devices">
      <CardHead title={t(locale, K("s2.devices"))} period={span} />
      <div className="mt-1.5 flex flex-col items-center gap-3 lg:flex-row lg:items-start">
        <Donut parts={a.rows.map((r) => r.count)} />
        <ul className="w-full min-w-0 flex-1 text-[12.5px]">
          {a.rows.map((r, i) => (
            <li key={r.id} data-testid={`google-tab-device-${r.id}`} className="flex items-start justify-between gap-2 py-0.5">
              <span className="flex min-w-0 items-start gap-1.5">
                <i className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: AUDIENCE_COLORS[i] }} />
                <span className="leading-tight">
                  <b className="block font-semibold text-ink">{t(locale, K(`s2.platform.${r.id.startsWith("search") ? "search" : "maps"}`))}</b>
                  <span className="text-[11.5px] text-ink-mute">{t(locale, K(`s2.device.${r.id.endsWith("Phone") ? "phone" : "computer"}`))}</span>
                </span>
              </span>
              <b className="whitespace-nowrap text-right font-semibold">
                {formatCount(r.count, locale)} · {r.percent}%
              </b>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-paper px-2.5 py-2 text-[12px]" data-testid="google-tab-device-split">
        <p>
          <b className="font-serif text-[17px] font-semibold text-ink">{split.phone}%</b> {t(locale, K("s2.split.phone"))}
          <span className="block text-ink-mute">{t(locale, K("s2.split.computer"), { percent: split.computer })}</span>
        </p>
        <p>
          <b className="font-serif text-[17px] font-semibold text-ink">{split.search}%</b> {t(locale, K("s2.split.search"))}
          <span className="block text-ink-mute">{t(locale, K("s2.split.maps"), { percent: split.maps })}</span>
        </p>
      </div>
      {advice.length === 0 && (split.phone >= 60 || split.search >= 50 || split.maps >= 25) && (
        // Nothing to check yet (no listing or website read): the plain facts.
        <div className="mt-2.5 flex-1" data-testid="google-tab-advice">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brass">{t(locale, K("s2.means"))}</p>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-[12.5px] text-ink-soft">
            {(["phone", "search", "maps"] as const)
              .filter((g) => (g === "phone" ? split.phone >= 60 : g === "search" ? split.search >= 50 : split.maps >= 25))
              .map((g) => (
                <li key={g}>{t(locale, K(`s2.lead.${g}`), { tenths: Math.round(split.maps / 10) })}</li>
              ))}
          </ul>
        </div>
      )}
      {advice.length > 0 && (
        <div className="mt-2.5 flex-1" data-testid="google-tab-advice">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brass">{t(locale, K("s2.means"))}</p>
          <ul className="mt-1 flex flex-col gap-1.5 text-[12.5px]">
            {advice.map((it, i) => {
              const firstOfGroup = advice.findIndex((x) => x.group === it.group) === i;
              const text = t(locale, K(`s2.advice.${it.key}`), it.holiday ? { holiday: t(locale, K(`fields.holiday.${it.holiday}`)) } : undefined);
              return (
                <li key={`${it.group}-${it.key}`} data-testid={`advice-${it.key}`} data-status={it.status}>
                  {firstOfGroup && <span className="block text-ink-soft">{t(locale, K(`s2.lead.${it.group}`), { tenths: Math.round(split.maps / 10) })}</span>}
                  <span className="flex items-start gap-1.5">
                    {page && it.status !== "ok" ? (
                      // Google results: advice, not a to-do — a plain bullet, no orange "!".
                      <span aria-hidden className="mt-0.5 w-4 shrink-0 text-center text-ink-mute" data-testid="advice-bullet">
                        •
                      </span>
                    ) : (
                      <span aria-hidden className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white", it.status === "ok" ? "bg-green" : "bg-amber")}>
                        {it.status === "ok" ? "✓" : "!"}
                      </span>
                    )}
                    {it.href && go(it.href) ? (
                      go(it.href)!.startsWith("#") ? (
                        <a href={go(it.href)!} className="font-semibold text-ink underline underline-offset-2">
                          {text}
                        </a>
                      ) : (
                        <Link href={go(it.href)!} className="font-semibold text-ink underline underline-offset-2">
                          {text}
                        </Link>
                      )
                    ) : (
                      <span className={page ? "text-ink" : "font-semibold text-ink"}>{text}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** `page` (Google results): section 4, "How searches became actions". */
export function FunnelSection({ months, sample, who, props, page = false }: { months: InsightsMonth[]; sample: boolean; who: Audience | null; props: GoogleProfileTabProps; page?: boolean }) {
  const locale = useLocale();
  const n = page ? 4 : 2;
  const title = t(locale, page ? "dashboard.googlePages.results.funnelTitle" : K("s2.title"));
  const { last } = lastTwo(months);
  if (!last) {
    return (
      <SectionHead n={n} id="funnel" title={title} meta={t(locale, K("monthly"))}>
        <ComingCard body={t(locale, K("s2.empty"))} sync />
      </SectionHead>
    );
  }
  const views = totalViews(last);
  const acted = actions(last);
  const span = spanLabel(last.month, locale);
  const six = lastSixMonths(months);
  const max = Math.max(1, ...six.map(actions));
  const days = callsByDays(six);
  const share = (v: number, of: number) => (of > 0 ? v / of : 0);
  return (
    <SectionHead n={n} id="funnel" title={title} meta={`${monthYear(last.month, locale)} · ${t(locale, K("monthly"))}`}>
      <Box className="mt-3 p-3.5">
        <CardHead title={t(locale, page ? "dashboard.googlePages.results.funnelCard" : K("s2.funnel"))} period={monthYear(last.month, locale)} extra={sample ? <SampleTag className="ml-2" /> : undefined} />
        {[
          { label: t(locale, K("s2.saw")), sub: t(locale, K("s2.sawSub")), value: views, share: 1, navy: false },
          { label: t(locale, K("s2.acted")), sub: t(locale, K("s2.actedSub")), value: acted, share: share(acted, views), navy: true },
          { label: t(locale, K("s2.called")), sub: t(locale, K("s2.calledSub"), { percent: Math.round(share(last.calls, acted) * 100) }), value: last.calls, share: share(last.calls, views), navy: true },
        ].map((s) => (
          <div key={s.label} className="my-2 grid grid-cols-[1fr_60px] items-center gap-x-3 gap-y-1 sm:grid-cols-[170px_1fr_70px]">
            <span className="text-[13px] font-semibold leading-tight">
              {s.label}
              <small className="block text-[11.5px] font-normal text-ink-mute">{s.sub}</small>
            </span>
            <div className="order-3 col-span-2 sm:order-none sm:col-span-1">
              <Bar share={s.share} navy={s.navy} />
            </div>
            <b className="text-right font-serif text-[18px] leading-none">{formatCount(s.value, locale)}</b>
          </div>
        ))}

        {/* Left: who saw you, then which days they call; right: devices — same height, no gaps. */}
        <div className="mt-3 grid items-stretch gap-3 sm:grid-cols-2">
          {/* The left column's last card stretches, so both columns end together. */}
          <div className="flex flex-col gap-3 [&>*:last-child]:flex-1">
            {who && <WhoCard a={who} sample={sample} span={span} page={page} />}
            <div className="flex-1 rounded-xl border border-paper-line p-3" data-testid="google-tab-days">
              <CardHead title={t(locale, K("s2.days"))} period={span} />
              {days ? (
                <div className="mt-1.5">
                  {(["midweek", "weekend", "sunMon"] as const).map((g) => (
                    <div key={g} className="my-1 grid grid-cols-[96px_1fr_44px] items-center gap-2 text-[12.5px]">
                      <span className="text-ink-soft">{t(locale, K(`s2.dayGroup.${g}`))}</span>
                      <Bar share={share(days.groups[g], days.groups.midweek + days.groups.weekend + days.groups.sunMon)} thin />
                      <b className="text-right">{formatCount(days.groups[g], locale)}</b>
                    </div>
                  ))}
                  <p className="mt-1.5 text-[12px] text-ink-mute">{t(locale, K(`s2.dayTip.${days.top}`))}</p>
                </div>
              ) : (
                <p className="mt-1.5 text-[12.5px] text-ink-mute">{t(locale, K("s2.noCalls"))}</p>
              )}
            </div>
          </div>
          {who && <DevicesCard a={who} className="h-full" span={span} props={props} page={page} />}
        </div>

        <div className="mt-3 rounded-xl border border-paper-line p-3">
          <CardHead title={t(locale, K("s2.trendTitle"))} period={span} />
          <div className="mt-1 flex h-[110px] items-end gap-3 border-b border-paper-line px-1.5 pt-2 sm:gap-[22px]">
            {six.map((m) => {
              const h = (v: number) => Math.round((v / max) * 98);
              return (
                <div key={m.month} className="flex flex-1 flex-col items-center">
                  <div className="flex w-full max-w-[22px] flex-col-reverse overflow-hidden rounded-t-md" style={{ height: h(actions(m)) }}>
                    <i className="block bg-ink" style={{ height: h(m.calls) }} />
                    <i className="block bg-brass" style={{ height: h(m.directions) }} />
                    <i className="block bg-[color:color-mix(in_srgb,var(--color-brass)_55%,white)]" style={{ height: h(m.bookings + m.websiteClicks) }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 px-1.5 pt-1.5 sm:gap-[22px]">
            {six.map((m) => (
              <span key={m.month} className="flex-1 text-center text-[12px] text-ink-mute">
                {monthName(m.month, locale, "short")}
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-ink-mute">
            <span>
              <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-ink align-[-1px]" />
              {t(locale, K("kpi.calls"))}
            </span>
            <span>
              <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-brass align-[-1px]" />
              {t(locale, K("kpi.directions"))}
            </span>
            <span>
              <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-[color:color-mix(in_srgb,var(--color-brass)_55%,white)] align-[-1px]" />
              {t(locale, K("s2.otherActions"))}
            </span>
          </div>
        </div>
      </Box>
    </SectionHead>
  );
}

export function SearchesSection({ months, sample, page = false }: { months: InsightsMonth[]; sample: boolean; page?: boolean }) {
  const locale = useLocale();
  const n = page ? 5 : 3;
  const { last } = lastTwo(months);
  if (!last) {
    return (
      <SectionHead n={n} id="searches" title={t(locale, K("s3.title"))} meta={t(locale, K("monthly"))}>
        <ComingCard body={t(locale, K("s3.empty"))} sync />
      </SectionHead>
    );
  }
  const terms = (last.topKeywords ?? []).slice(0, 5);
  const max = terms[0]?.count ?? 1;
  return (
    <SectionHead n={n} id="searches" title={t(locale, K("s3.title"))} meta={t(locale, K("s3.meta"), { month: monthYear(last.month, locale) })}>
      <Box className="mt-3 p-3.5" data-testid="google-tab-terms">
        {sample && <SampleTag className="mb-1" />}
        {terms.length === 0 ? (
          <p className="text-[13px] text-ink-soft">{t(locale, K("s3.none"), { month: monthYear(last.month, locale) })}</p>
        ) : (
          terms.map((s, i) => (
            <div key={s.term} className="grid grid-cols-[28px_1fr_70px] items-center gap-2.5 border-t border-paper-line/70 py-1.5 text-[13px] leading-5 first:border-t-0 sm:grid-cols-[28px_1fr_120px_70px]">
              <span className="text-ink-mute">{i + 1}</span>
              <span className="min-w-0 break-words">{s.term}</span>
              <div className="hidden h-2 overflow-hidden rounded bg-paper-deep sm:block">
                <i className="block h-full bg-brass" style={{ width: `${(s.count / max) * 100}%` }} />
              </div>
              <b className="text-right">{formatCount(s.count, locale)}</b>
            </div>
          ))
        )}
        <p className="mt-2 text-[12px] text-ink-mute">{t(locale, K("s3.noteReal"))}</p>
      </Box>
    </SectionHead>
  );
}

// ---------------------------------------------------------------------------
// The Google results page (Growth). Day 25B step 2.
// ---------------------------------------------------------------------------

export interface GoogleResultsProps extends GoogleProfileTabProps {
  plan: Plan;
  /** When Google's monthly numbers were last read (shown while the connection is lost). */
  lastInsightsAt?: string | null;
}

const RESULTS_LABELS: Partial<Record<string, MessageKey>> = {
  thisWeek: "dashboard.googlePages.results.jump.thisWeek",
  since: "dashboard.googlePages.results.jump.since",
  funnel: "dashboard.googlePages.results.jump.funnel",
};
const LINK = "font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink";

/** Growth → Google results (mockups 04, 04b). Free: a locked preview with no
 * numbers. Grow and Premium: every number; This week as steps on Grow, with
 * Approve all on Premium. Not connected: only the Connect card and the link
 * to Growth plan. Growth content only — the one link to Presence is "Fix
 * your listing →" in the top bar. */
export function GoogleResults(props: GoogleResultsProps) {
  const locale = useLocale();
  const free = props.plan === "free";
  const connectedView = props.connected || props.practice;
  return (
    <div className="flex flex-col pb-[68px]" data-testid="google-results-page" data-view={free ? "locked" : connectedView ? "connected" : "not-connected"}>
      <header className="mb-3">
        <h1 className="font-serif text-[28px] font-semibold leading-tight text-ink">{t(locale, "dashboard.googlePages.results.title")}</h1>
        <p className="mt-1 max-w-[720px] text-[14px] leading-snug text-ink-soft">{t(locale, "dashboard.googlePages.results.lead")}</p>
      </header>
      {free ? <ResultsLocked /> : connectedView ? <ResultsConnected {...props} /> : <ResultsNotConnected {...props} />}
    </div>
  );
}

/** Free: no numbers at all, only what Grow unlocks. */
function ResultsLocked() {
  const locale = useLocale();
  return (
    <Box className="flex flex-col gap-2.5 p-5" data-testid="google-results-locked">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-paper-deep px-2.5 py-1 text-[12px] font-semibold text-ink-soft">
        <IconLock size={13} aria-hidden />
        {t(locale, "dashboard.googlePages.results.locked.badge")}
      </span>
      <h2 className="font-serif text-xl font-semibold text-ink">{t(locale, "dashboard.googlePages.results.locked.title")}</h2>
      <p className="text-[14px] text-ink-soft">{t(locale, "dashboard.googlePages.results.locked.body")}</p>
      <UpgradeTrigger feature="grow" />
    </Box>
  );
}

/** 04b: what connecting shows, the Connect button, and the one line to Growth plan. No numbers, no tasks. */
function ResultsNotConnected(props: GoogleResultsProps) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const button = "inline-flex w-fit items-center rounded-lg bg-ink px-4 py-2 text-[13.5px] font-semibold text-paper hover:bg-ink/90";
  const items = [
    ["calls", "callsSub"],
    ["saw", "sawSub"],
    ["searched", "searchedSub"],
    ["since", "sinceSub"],
  ] as const;
  const P = (k: string) => `dashboard.googlePages.results.notConnected.${k}` as MessageKey;
  return (
    <div className="flex flex-col gap-3">
      <Box id={GBP_PROFILE_ANCHOR} className="flex scroll-mt-20 flex-col gap-3 p-5" data-testid="google-results-not-connected">
        {props.result && (
          <p role="status" className={cn("text-[13px] font-medium", props.result === "connected" ? "text-green" : "text-red")}>
            {gbpResultText(locale, props.result, props.business)}
          </p>
        )}
        <h2 className="font-serif text-xl font-semibold text-ink">{t(locale, P("title"))}</h2>
        <p className="max-w-[720px] text-[13.5px] leading-snug text-ink-soft">{t(locale, P(props.needsReconnect ? "reconnectLead" : "lead"))}</p>
        <ul className="flex flex-col gap-2 text-[13.5px]">
          {items.map(([head, sub]) => (
            <li key={head} className="leading-snug">
              <b className="font-semibold text-ink">{t(locale, P(head))}</b> <span className="text-ink-mute">· {t(locale, P(sub))}</span>
            </li>
          ))}
        </ul>
        {props.needsReconnect && props.lastInsightsAt && (
          <p className="text-[12.5px] text-ink-mute" data-testid="google-results-last-update">
            {t(locale, P("lastUpdate"), { date: formatShortDate(props.lastInsightsAt, locale, timeZone) })}
          </p>
        )}
        {props.canStart ? (
          <a href={gbpConnectHref(props.businessId, "profile")} className={button} data-testid="google-results-connect">
            {t(locale, P(props.needsReconnect ? "reconnect" : "connect"))}
          </a>
        ) : (
          <Link href={`/business/${props.businessId}/connect-gbp`} className={button} data-testid="google-results-connect">
            {t(locale, P("connect"))}
          </Link>
        )}
      </Box>
      <Link href={growthPlanHref(props.businessId)} className={cn("w-fit text-[13.5px]", LINK)} data-testid="google-results-tasks-link">
        {t(locale, "dashboard.googlePages.results.tasksLink")}
      </Link>
    </div>
  );
}

function ResultsConnected(props: GoogleResultsProps) {
  const locale = useLocale();
  const sync = useSync(props.businessId, props.connected ? props.insightsState : undefined);
  const sample = props.practice && !(props.insights && props.insights.length > 0);
  const months = props.insights && props.insights.length > 0 ? props.insights : sample ? SAMPLE_INSIGHTS : [];
  const who = sample ? SAMPLE_AUDIENCE : audience(months);
  const premium = isPremiumPlan(props.plan);
  const ls = levers({
    businessId: props.businessId,
    replies: props.replyCounts ? { replied: props.replyCounts.replied, inWindow: props.replyCounts.reviewsInWindow } : null,
    couponsRunning: props.saved?.couponsRunning ?? 0,
    website: props.website,
    media: props.media ?? null,
  });
  const chips = <LeverChips levers={ls} page={{ businessId: props.businessId }} />;
  return (
    <SyncContext.Provider value={sync}>
      <div className="flex flex-col" data-sync={sync.status}>
        {props.result && (
          <p id={GBP_PROFILE_ANCHOR} role="status" className={cn("mb-3 scroll-mt-20 text-[13px] font-medium", props.result === "connected" ? "text-green" : "text-red")}>
            {gbpResultText(locale, props.result, props.business)}
          </p>
        )}
        {/* The Growth line: these are Google's numbers, not PostScore points; the one link to Presence. */}
        <p className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border border-paper-line bg-white px-3.5 py-2.5 text-[13px] text-ink-soft" data-testid="google-results-info">
          <span>{t(locale, "dashboard.googlePages.results.info")}</span>
          <Link href={googleListingHref(props.businessId)} className={LINK} data-testid="google-results-fix-listing">
            {t(locale, "dashboard.googlePages.results.fixListing")}
          </Link>
        </p>
        <JumpMenu sample={sample} sections={RESULTS_SECTIONS} labels={RESULTS_LABELS} />
        <LastMonthSection {...props} months={months} sample={sample} page />
        <SectionHead n={2} id={"this-week" satisfies JumpSectionId} title={t(locale, K("s1.todo.title"))}>
          <Box className="mt-3 p-5 sm:p-6 lg:px-5 lg:py-4" data-testid="google-results-this-week">
            {premium ? <ThisWeek props={props} chips={chips} noTitle /> : <GrowThisWeek props={props} chips={chips} />}
          </Box>
        </SectionHead>
        <SectionHead n={3} id={"since" satisfies JumpSectionId} title={t(locale, K("since.title"))}>
          <div className="mt-3">
            <SinceCard businessId={props.businessId} connected={props.connected} sample={sample} events={props.actionEvents ?? []} recap={<RecapLine saved={props.saved} />} page />
          </div>
        </SectionHead>
        <FunnelSection months={months} sample={sample} who={who} props={props} page />
        <SearchesSection months={months} sample={sample} page />
      </div>
    </SyncContext.Provider>
  );
}

/** Grow: the same to-dos as Premium's list, each with the steps to do it
 * yourself (and its draft), and "Premium approves all of these in one click →". */
function GrowThisWeek({ props, chips }: { props: GoogleProfileTabProps; chips: ReactNode }) {
  const locale = useLocale();
  const { recs, type } = useTabIdeas(props);
  const list = thisWeekRecs(recs);
  return (
    <div className="flex flex-col gap-3" data-testid="google-results-grow-week">
      {chips}
      <p className="text-[12.5px] text-ink-mute">{t(locale, K("grow.sub"))}</p>
      {list.length > 0 && (
        <Link href={`/business/${props.businessId}/settings#compare-plans`} className="w-fit text-[13px] font-medium text-ink-mute underline decoration-brass/60 underline-offset-2 hover:text-ink" data-testid="premium-approve-all-line">
          {t(locale, K("w.grow.premiumAll"))}
        </Link>
      )}
      {list.length > 0 ? (
        <ul>
          {list.map((rec) => (
            <RecItem key={rec.kind} rec={rec} businessId={props.businessId} premium={false} canEdit={false} type={type} drafts />
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-soft">{t(locale, K("grow.none"))}</p>
      )}
    </div>
  );
}
