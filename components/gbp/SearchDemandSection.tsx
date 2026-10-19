"use client";

// The Search demand section (Premium, needs a connected Google Business
// Profile). Three states:
//   preview  — connection isn't live: SEARCH_DEMAND_EXAMPLE under an
//              "Example" watermark, never presented as the owner's data
//   awaiting — connected, but PostScore doesn't read Performance data yet
//   live     — real data (lib/gbp/searchDemand.ts types)
// Numbers are formatted by hand (formatCount etc.), not toLocaleString,
// so server and browser render the same text.

import { useState } from "react";
import Link from "next/link";
import { IconArrowRight, IconClockHour4, IconMinus, IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { formatCount, formatMonthDay, formatMonthLabel, formatShortDate, t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import {
  TIP_LINKS,
  funnelOf,
  keywordTrend,
  seoTips,
  topKeywords,
  visibilityShare,
  type AreaVolume,
  type FunnelPeriod,
  type Granularity,
  type InsightsCount,
  type SearchDemandData,
  type SearchKeyword,
  type SeoTip,
  type Trend,
} from "@/lib/gbp/searchDemand";

export type SearchDemandView = { kind: "preview"; data: SearchDemandData } | { kind: "awaiting" } | { kind: "live"; data: SearchDemandData };

const k = (key: string) => `dashboard.searchDemand.${key}` as MessageKey;

/** "6.8%" / "6,8 %" under 10%, whole percent above. */
export function formatPercent(fraction: number, locale: Locale): string {
  const pct = fraction * 100;
  const text = pct < 10 ? pct.toFixed(1).replace(/\.0$/, "") : String(Math.round(pct));
  return locale === "es" ? `${text.replace(".", ",")} %` : `${text}%`;
}

/** "1.3K" / "1,3 mil" for 1,000 and up. */
function compact(n: number, locale: Locale): string {
  if (n < 1000) return formatCount(n, locale);
  const short = n >= 1_000_000 ? [n / 1_000_000, locale === "es" ? " M" : "M"] : [n / 1000, locale === "es" ? " mil" : "K"];
  const value = (short[0] as number).toFixed(1).replace(/\.0$/, "");
  return `${locale === "es" ? value.replace(".", ",") : value}${short[1]}`;
}

export function formatAreaVolume(v: AreaVolume, locale: Locale): string {
  return v.kind === "range" ? `${compact(v.low, locale)}–${compact(v.high, locale)}` : `≈${formatCount(v.value, locale)}`;
}

/** A keyword count: the number, or "fewer than 15" — never a number for a hidden count. */
export function formatInsightsCount(c: InsightsCount, locale: Locale): string {
  return c.kind === "exact" ? formatCount(c.value, locale) : t(locale, k("keywords.fewerThan"), { n: c.threshold });
}

function periodLabel(p: FunnelPeriod, g: Granularity, locale: Locale): string {
  const start = `${p.start}T00:00:00Z`;
  return g === "weekly" ? t(locale, k("funnel.weekOf"), { date: formatMonthDay(start, locale, "UTC") }) : formatMonthLabel(start, locale);
}

function ExampleBadge() {
  const locale = useLocale();
  return (
    <span className="shrink-0 rounded-full border border-brass/40 bg-brass/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
      {t(locale, k("example.badge"))}
    </span>
  );
}

function SectionCard({ title, example, children, className }: { title: string; example: boolean; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("flex min-w-0 flex-col gap-3 p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-serif text-[17px] font-semibold text-ink">{title}</h2>
        {example && <ExampleBadge />}
      </div>
      {children}
    </Card>
  );
}

function GranularityToggle({ value, onChange }: { value: Granularity; onChange: (g: Granularity) => void }) {
  const locale = useLocale();
  return (
    <span className="inline-flex rounded-lg border border-paper-deep bg-white p-0.5" role="group" aria-label={t(locale, k("toggle.label"))}>
      {(["weekly", "monthly"] as const).map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onChange(g)}
          aria-pressed={value === g}
          className={cn("rounded-md px-3 py-1 text-[12.5px] font-semibold", value === g ? "bg-ink text-white" : "text-ink-soft hover:text-ink")}
        >
          {t(locale, k(`toggle.${g}`))}
        </button>
      ))}
    </span>
  );
}

function FunnelCard({ period, granularity, example }: { period: FunnelPeriod | null; granularity: Granularity; example: boolean }) {
  const locale = useLocale();
  const title = t(locale, k("funnel.title"));
  if (!period) return null;
  const f = funnelOf(period);
  const searchShare = f.views > 0 ? period.views.search / f.views : 0;
  const actionShare = f.views > 0 ? Math.min(1, f.actions / f.views) : 0;
  const actions = [
    { key: "calls", value: period.calls },
    { key: "website", value: period.websiteClicks },
    { key: "directions", value: period.directions },
  ] as const;
  return (
    <SectionCard title={title} example={example}>
      <p className="-mt-2 text-[12.5px] text-ink-mute" data-testid="funnel-period">
        {periodLabel(period, granularity, locale)}
      </p>
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold text-ink">{t(locale, k("funnel.seen"))}</span>
            <span className="font-serif text-xl font-semibold text-ink" data-testid="funnel-views">
              {formatCount(f.views, locale)}
            </span>
          </div>
          <div className="mt-1.5 flex h-3 w-full gap-[2px] overflow-hidden rounded" aria-hidden>
            <span className="h-full rounded-s bg-brass" style={{ width: `${searchShare * 100}%` }} />
            <span className="h-full flex-1 rounded-e bg-brass/45" />
          </div>
          <p className="mt-1 text-[12px] text-ink-mute">
            {t(locale, k("funnel.seenSplit"), { search: formatCount(period.views.search, locale), maps: formatCount(period.views.maps, locale) })}
          </p>
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold text-ink">{t(locale, k("funnel.acted"))}</span>
            <span className="font-serif text-xl font-semibold text-ink" data-testid="funnel-actions">
              {formatCount(f.actions, locale)}
            </span>
          </div>
          <div className="mt-1.5 h-3 w-full overflow-hidden rounded bg-paper-deep" aria-hidden>
            <span className="block h-full rounded bg-ink" style={{ width: `${f.actions > 0 ? Math.max(actionShare * 100, 1.5) : 0}%` }} />
          </div>
          <ul className="mt-2 grid grid-cols-3 gap-2">
            {actions.map((a) => (
              <li key={a.key} className="rounded-lg bg-paper px-2.5 py-2">
                <div className="text-[11.5px] text-ink-mute">{t(locale, k(`funnel.${a.key}`))}</div>
                <div className="text-[15px] font-semibold text-ink">{formatCount(a.value, locale)}</div>
              </li>
            ))}
          </ul>
        </div>
        <p className="rounded-lg border border-paper-deep px-3 py-2 text-[13px] text-ink" data-testid="funnel-conversion">
          {f.conversion === null ? t(locale, k("funnel.noViews")) : t(locale, k("funnel.conversion"), { percent: formatPercent(f.conversion, locale) })}
        </p>
      </div>
    </SectionCard>
  );
}

function Sparkline({ months }: { months: SearchKeyword["months"] }) {
  const values = months.map((m) => (m.count.kind === "exact" ? m.count.value : null));
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return <span className="inline-block w-14" aria-hidden />;
  const max = Math.max(...known);
  const min = Math.min(...known);
  const w = 56;
  const h = 18;
  const step = w / Math.max(1, values.length - 1);
  const y = (v: number) => (max === min ? h / 2 : h - 2 - ((v - min) / (max - min)) * (h - 4));
  // Hidden ("fewer than") months break the line instead of being drawn as a number.
  const segments: string[][] = [[]];
  values.forEach((v, i) => {
    if (v === null) segments.push([]);
    else segments[segments.length - 1].push(`${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0 overflow-visible">
      {segments
        .filter((s) => s.length > 1)
        .map((s, i) => (
          <polyline key={i} points={s.join(" ")} fill="none" stroke="var(--color-brass)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}
    </svg>
  );
}

function TrendMark({ trend }: { trend: Trend | null }) {
  const locale = useLocale();
  const label = t(locale, k(`keywords.trend.${trend ?? "none"}`));
  const Icon = trend === "up" ? IconTrendingUp : trend === "down" ? IconTrendingDown : IconMinus;
  return (
    <span title={label} className={cn("inline-flex", trend === "up" ? "text-green" : trend === "down" ? "text-red" : "text-ink-mute")}>
      <Icon size={15} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function KeywordsCard({ keywords, example }: { keywords: SearchKeyword[]; example: boolean }) {
  const locale = useLocale();
  const top = topKeywords(keywords, 10);
  const lastMonth = top.find((kw) => kw.months.length > 0)?.months.at(-1)?.month;
  return (
    <SectionCard title={t(locale, k("keywords.title"))} example={example}>
      {lastMonth && (
        <p className="-mt-2 text-[12.5px] text-ink-mute">{t(locale, k("keywords.note"), { month: formatMonthLabel(`${lastMonth}-01T00:00:00Z`, locale) })}</p>
      )}
      <div className="flex items-center gap-3 border-b border-paper-line pb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-mute">
        <span className="min-w-0 flex-1">{t(locale, k("keywords.colTerm"))}</span>
        <span className="text-end">{t(locale, k("keywords.colCount"))}</span>
        <span className="w-[86px] text-end">{t(locale, k("keywords.colTrend"))}</span>
      </div>
      <ol className="flex flex-col" data-testid="keyword-list">
        {top.map((kw, i) => {
          const latest = kw.months.at(-1)?.count;
          return (
            <li key={kw.keyword} className="flex items-center gap-3 border-b border-paper-line py-2 last:border-0">
              <span className="w-4 shrink-0 text-[12px] text-ink-mute">{i + 1}</span>
              <span className="min-w-0 flex-1 break-words text-[13.5px] text-ink">{kw.keyword}</span>
              <span className={cn("shrink-0 text-end text-[13px]", latest?.kind === "exact" ? "font-semibold text-ink" : "text-ink-mute")}>
                {latest ? formatInsightsCount(latest, locale) : "—"}
              </span>
              <span className="flex w-[86px] shrink-0 items-center justify-end gap-1.5">
                <Sparkline months={kw.months} />
                <TrendMark trend={keywordTrend(kw)} />
              </span>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}

function AreaCard({ data, example }: { data: SearchDemandData; example: boolean }) {
  const locale = useLocale();
  const area = data.area;
  if (!area) return null;
  const searches = [...area.searches].sort((a, b) => mid(b.volume) - mid(a.volume)).slice(0, 10);
  return (
    <SectionCard title={t(locale, k("area.title"))} example={example}>
      <p className="-mt-2 text-[12.5px] text-ink-mute" data-testid="area-subtitle">
        {data.city ? t(locale, k("area.subtitle"), { city: data.city }) : t(locale, k("area.subtitleNoCity"))}
      </p>
      <div className="flex items-center justify-between gap-3 border-b border-paper-line pb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-mute">
        <span>{t(locale, k("area.colSearch"))}</span>
        <span>{t(locale, k("area.colVolume"))}</span>
      </div>
      <ul className="flex flex-col" data-testid="area-list">
        {searches.map((s) => (
          <li key={s.keyword} className="flex items-center justify-between gap-3 border-b border-paper-line py-2 last:border-0">
            <span className="min-w-0 break-words text-[13.5px] text-ink">{s.keyword}</span>
            <span className="shrink-0 text-[13px] font-semibold text-ink">{formatAreaVolume(s.volume, locale)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11.5px] text-ink-mute">{t(locale, k(`area.source.${area.source}`), { date: formatShortDate(area.fetchedAt, locale, "UTC") })}</p>
    </SectionCard>
  );
}

function mid(v: AreaVolume): number {
  return v.kind === "range" ? (v.low + v.high) / 2 : v.value;
}

function RoomCard({ data, example }: { data: SearchDemandData; example: boolean }) {
  const locale = useLocale();
  const month = data.funnel.monthly.at(-1);
  const share = month && data.area ? visibilityShare(funnelOf(month).views, data.area.searches) : null;
  const pct = (n: number) => (locale === "es" ? `${n} %` : `${n}%`);
  const percent = share ? (share.low === share.high ? pct(share.low) : `${share.low}–${pct(share.high)}`) : null;
  return (
    <SectionCard title={t(locale, k("room.title"))} example={example}>
      {percent ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-serif text-[30px] font-semibold leading-none text-ink" data-testid="room-share">
              ~{percent}
            </span>
            <span className="rounded-full bg-paper-deep px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{t(locale, k("room.estimate"))}</span>
          </div>
          <p className="text-[13.5px] text-ink">{t(locale, k("room.share"), { percent })}</p>
          <p className="text-[13px] text-ink-soft">{t(locale, k("room.rest"))}</p>
          <p className="text-[11.5px] text-ink-mute">{t(locale, k("room.caveat"))}</p>
        </>
      ) : (
        <p className="text-[13px] text-ink-mute">{t(locale, k("room.unavailable"))}</p>
      )}
    </SectionCard>
  );
}

function tipText(tip: SeoTip, locale: Locale): string {
  switch (tip.kind) {
    case "missing_term":
      return t(locale, k("tips.missing_term"), { term: tip.term, search: tip.searchedAs });
    case "branded_heavy":
      return t(locale, k("tips.branded_heavy"), { percent: locale === "es" ? `${tip.percent} %` : `${tip.percent}%` });
    case "use_top_keyword":
      return t(locale, k("tips.use_top_keyword"), { keyword: tip.keyword });
    case "near_me":
      return t(locale, k("tips.near_me"), { search: tip.searchedAs });
  }
}

function TipsCard({ businessId, data, example }: { businessId: string; data: SearchDemandData; example: boolean }) {
  const locale = useLocale();
  const tips = seoTips({ keywords: data.keywords, area: data.area?.searches ?? [], businessName: data.businessName, city: data.city, region: data.region });
  return (
    <SectionCard title={t(locale, k("tips.title"))} example={example}>
      {tips.length === 0 ? (
        <p className="text-[13px] text-ink-mute">{t(locale, k("tips.empty"))}</p>
      ) : (
        <ol className="flex flex-col gap-3" data-testid="tips-list">
          {tips.map((tip, i) => {
            const target = TIP_LINKS[tip.link];
            return (
              <li key={tip.kind} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[13.5px] leading-snug text-ink">{tipText(tip, locale)}</p>
                  <Link
                    href={`/business/${businessId}${target.path}#${target.anchor}`}
                    className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline"
                  >
                    {t(locale, k(`tips.link.${tip.link}`))}
                    <IconArrowRight size={13} aria-hidden />
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}

function Watermark() {
  const locale = useLocale();
  const word = t(locale, k("example.badge"));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-xl" data-testid="example-watermark">
      <div className="absolute -inset-1/2 flex rotate-[-24deg] flex-wrap content-start gap-x-16 gap-y-20 p-10">
        {Array.from({ length: 60 }, (_, i) => (
          <span key={i} className="font-serif text-[44px] font-semibold uppercase tracking-[0.12em] text-ink/[0.06]">
            {word}
          </span>
        ))}
      </div>
    </div>
  );
}

function DemandBody({ businessId, data }: { businessId: string; data: SearchDemandData }) {
  const locale = useLocale();
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const example = data.example;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-ink-soft">{t(locale, k("toggle.label"))}</span>
        <GranularityToggle value={granularity} onChange={setGranularity} />
      </div>
      <FunnelCard period={data.funnel[granularity].at(-1) ?? null} granularity={granularity} example={example} />
      <div className="grid grid-cols-1 gap-4 nav:grid-cols-2">
        <KeywordsCard keywords={data.keywords} example={example} />
        <div className="flex min-w-0 flex-col gap-4">
          <AreaCard data={data} example={example} />
          <RoomCard data={data} example={example} />
        </div>
      </div>
      <TipsCard businessId={businessId} data={data} example={example} />
    </div>
  );
}

export function SearchDemandSection({ businessId, view }: { businessId: string; view: SearchDemandView }) {
  const locale = useLocale();
  if (view.kind === "awaiting") {
    return (
      <Card className="flex items-start gap-3 p-5" data-testid="search-demand-awaiting">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
          <IconClockHour4 size={17} />
        </span>
        <div>
          <div className="text-sm font-semibold text-ink">{t(locale, k("awaiting.title"))}</div>
          <p className="mt-1 max-w-xl text-[13px] text-ink-mute">{t(locale, k("awaiting.body"))}</p>
        </div>
      </Card>
    );
  }
  if (view.kind === "live") {
    // Real data only; an example can't be passed off as live.
    if (view.data.example) return null;
    return <DemandBody businessId={businessId} data={view.data} />;
  }
  return (
    <div className="flex flex-col gap-4" data-testid="search-demand-preview">
      <Card className="flex flex-col gap-1 border-brass/40 bg-brass/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <ExampleBadge />
          <span className="text-sm font-semibold text-ink">{t(locale, k("example.title"))}</span>
        </div>
        <p className="text-[13px] text-ink">{t(locale, k("example.availability"))}</p>
        <p className="text-[12px] text-ink-mute">{t(locale, k("example.caption"))}</p>
      </Card>
      <div className="relative">
        <Watermark />
        <DemandBody businessId={businessId} data={{ ...view.data, example: true }} />
      </div>
    </div>
  );
}
