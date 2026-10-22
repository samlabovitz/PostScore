"use client";

// The Reports page's weekly recap (Monday–Sunday, business time zone):
// a hero band (score ring, change chip, sparkline, rank chip), "What
// changed" rows and "What we've verified" for the week. Every number is
// from WeeklyView (lib/weekly/weeklyView.ts): the week's last scan,
// compared with the last scan before the week — never a fabricated
// comparison, never "(0 days)".

import { GoogleMapsAttribution } from "@/components/google/GoogleMapsAttribution";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconCircleCheck,
  IconDownload,
  IconListDetails,
  IconMinus,
  IconStar,
  IconTrophy,
  IconLock,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { formatShortDate, t, useLocale, useTimeZone, type Locale, type MessageKey } from "@/lib/i18n";
import type { WeeklyView } from "@/lib/weekly/weeklyView";
import type { ChartCategoryId } from "@/lib/scoreHistory";
import { downloadWeeklyPdf } from "./weeklyPdfDownload";
import { ShareGoodNews } from "./ShareGoodNews";
import { useUpgrade } from "@/components/upgrade/UpgradeContext";
import { UpgradeButton } from "@/components/upgrade/UpgradeTrigger";
import { isPremiumPlan } from "@/lib/plan";

const k = (key: string) => `dashboard.reports.weekly.${key}` as MessageKey;
const CATEGORY_KEY: Record<ChartCategoryId, MessageKey> = {
  listing: "dashboard.reports.chartCategoryListing",
  website: "dashboard.reports.chartCategoryWebsite",
  reviews: "dashboard.reports.chartCategoryReviews",
};

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

function ScoreRing({ score, muted }: { score: number | null; muted: boolean }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="relative h-[104px] w-[104px] shrink-0" aria-hidden>
      <svg viewBox="0 0 104 104" className="h-full w-full -rotate-90">
        <circle cx="52" cy="52" r={r} fill="none" strokeWidth="10" className="stroke-paper-deep" />
        {score !== null && (
          <circle cx="52" cy="52" r={r} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} stroke={muted ? "var(--color-ink-mute)" : "var(--color-brass)"} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-[30px] font-bold leading-none text-ink">{score ?? "—"}</span>
        <span className="mt-0.5 text-[10px] text-ink-mute">/ 100</span>
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const step = w / (values.length - 1);
  const y = (v: number) => (max === min ? h / 2 : h - 3 - ((v - min) / (max - min)) * (h - 6));
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="overflow-visible">
      <polyline points={points} fill="none" stroke="var(--color-brass)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last * step} cy={y(values[last])} r={3} fill="var(--color-ink)" />
    </svg>
  );
}

export function changeChip(view: WeeklyView, locale: Locale): { text: string; tone: "green" | "red" | "grey" } {
  if (view.score === null) return { text: t(locale, k("noScanThisWeek")), tone: "grey" };
  if (!view.change) return { text: t(locale, k("firstScanChip")), tone: "grey" };
  if (view.change.delta === null) return { text: t(locale, k("scoringUpdatedChip")), tone: "grey" };
  const d = view.change.delta;
  return { text: d === 0 ? t(locale, k("noChange")) : signed(d), tone: d > 0 ? "green" : d < 0 ? "red" : "grey" };
}

const CHIP = { green: "bg-green/10 text-green", red: "bg-red/10 text-red", grey: "bg-ink/5 text-ink-soft" } as const;

function Row({ icon: Icon, tone = "neutral", children }: { icon: typeof IconStar; tone?: "up" | "down" | "neutral"; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", tone === "up" ? "bg-green/10 text-green" : tone === "down" ? "bg-red/10 text-red" : "ps-icon-tile")}>
        <Icon size={15} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink">{children}</div>
    </li>
  );
}

export function WeeklyRecapCard({
  businessId,
  view,
  weeks,
  weekLabels,
  rankNoun,
  shareHeadline = null,
}: {
  businessId: string;
  /** Real good news only (null otherwise) — offered on this week. */
  shareHeadline?: string | null;
  view: WeeklyView;
  /** The picker: this week, then past weeks with scans (newest first). */
  weeks: string[];
  /** "Oct 13 – Oct 19, 2026", per week — formatted on the server. */
  weekLabels: Record<string, string>;
  rankNoun: string;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const router = useRouter();
  const [pdf, setPdf] = useState<"idle" | "working" | "error">("idle");
  // The PDF report is Premium (Settings → Compare plans: "Weekly + PDF");
  // below Premium the button is a locked Premium feature. The download
  // routes refuse it on the server too.
  const upgrade = useUpgrade();
  const pdfLocked = !!upgrade && !isPremiumPlan(upgrade.plan);
  const chip = changeChip(view, locale);
  const shownScore = view.score ?? view.lastKnown?.score ?? null;
  const moved = view.categories.filter((c) => c.before !== null && c.after !== null && c.before !== c.after);

  async function download() {
    setPdf("working");
    setPdf((await downloadWeeklyPdf(businessId, view.weekStart, !view.isCurrentWeek)) ? "idle" : "error");
  }

  return (
    <Card className="overflow-hidden p-0" data-testid="weekly-recap">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-line px-5 py-3">
        <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-soft">
          {t(locale, k("weekLabel"))}
          <select
            value={view.weekStart}
            onChange={(e) => router.push(`/business/${businessId}/reports?week=${e.target.value}`, { scroll: false })}
            className="rounded-lg border border-paper-deep bg-white px-2 py-1 text-[13px] font-semibold text-ink outline-none focus:border-ink-soft"
            data-testid="week-picker"
          >
            {weeks.map((w, i) => (
              <option key={w} value={w}>
                {i === 0 ? t(locale, k("thisWeek"), { range: weekLabels[w] }) : weekLabels[w]}
              </option>
            ))}
          </select>
        </label>
        <span className="flex flex-wrap items-start gap-2">
          {pdfLocked ? (
            <UpgradeButton
              feature="premium"
              testId="weekly-pdf-locked"
              className="inline-flex items-center gap-1.5 rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:border-ink-soft"
            >
              <IconLock size={13} aria-hidden className="text-brass" />
              {t(locale, k("download"))}
              <span className="rounded-full bg-paper px-1.5 py-px text-[10.5px] font-semibold text-ink-soft">{t(locale, "dashboard.settings.plan.name.premium")}</span>
            </UpgradeButton>
          ) : (
            <Button variant="default" size="sm" onClick={download} disabled={pdf === "working"} data-testid="weekly-pdf-download">
              <IconDownload size={14} />
              {pdf === "working" ? t(locale, "dashboard.reports.recapPreparingDownload") : t(locale, k("download"))}
            </Button>
          )}
          {shareHeadline && view.isCurrentWeek && view.score !== null && view.grade && <ShareGoodNews headline={shareHeadline} score={view.score} grade={view.grade} />}
        </span>
      </div>
      {pdf === "error" && <p className="px-5 pt-2 text-xs text-red">{t(locale, "dashboard.reports.pdf.error")}</p>}

      {/* Hero band */}
      <div className="flex flex-col gap-4 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-brass)_9%,white),white_65%)] px-5 py-5 sm:flex-row sm:items-center" data-testid="weekly-hero">
        <ScoreRing score={shownScore} muted={view.score === null} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span data-testid="change-chip" className={cn("rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold", CHIP[chip.tone])}>
              {chip.text}
            </span>
            {view.rank && (
              <span data-testid="rank-chip" className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-semibold text-paper">
                <IconTrophy size={12} aria-hidden />
                {t(locale, "dashboard.reports.pdf.rank", { rank: view.rank.rank, of: view.rank.of, noun: rankNoun })}
              </span>
            )}
          </div>
          <p className="text-[13px] text-ink-soft" data-testid="compared-with">
            {view.score === null
              ? view.lastKnown
                ? t(locale, k("lastKnown"), { date: formatShortDate(view.lastKnown.date, locale, timeZone), score: view.lastKnown.score })
                : t(locale, k("noScansYet"))
              : view.change
                ? `${view.change.delta !== null ? `${view.change.fromScore} → ${view.score} · ` : ""}${t(locale, k(view.change.comparedInWeek ? "comparedWithInWeek" : "comparedWith"), { date: formatShortDate(view.change.comparedDate, locale, timeZone) })}`
                : t(locale, k("firstScan"))}
          </p>
          {view.change?.delta === null && view.score !== null && <p className="text-[12px] text-ink-mute">{t(locale, k("scoringUpdated"))}</p>}
          {view.olderScoringVersion && <p className="text-[12px] text-ink-mute">{t(locale, k("scoredWith"), { version: view.olderScoringVersion })}</p>}
          {view.sparkline.length >= 2 && (
            <div className="flex items-center gap-2 text-[11.5px] text-ink-mute">
              <Sparkline values={view.sparkline} />
              {t(locale, k("recentScans"))}
            </div>
          )}
        </div>
      </div>

      {/* What changed */}
      <div className="border-t border-paper-line px-5 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mute">{t(locale, k("whatChanged"))}</div>
        {view.score === null ? (
          <p className="mt-2 text-[13px] text-ink-soft">{t(locale, k("noScanChanges"))}</p>
        ) : !view.change ? (
          <p className="mt-2 text-[13px] text-ink-soft">{t(locale, k("firstScanChanges"))}</p>
        ) : (
          <ul className="mt-1 divide-y divide-paper-line" data-testid="what-changed">
            {moved.map((c) => {
              const d = (c.after as number) - (c.before as number);
              return (
                <Row key={c.id} icon={d > 0 ? IconArrowUpRight : IconArrowDownRight} tone={d > 0 ? "up" : "down"}>
                  {t(locale, k("categoryMove"), { category: t(locale, CATEGORY_KEY[c.id]), from: c.before as number, to: c.after as number, change: signed(d) })}
                </Row>
              );
            })}
            {view.listingChanges.map((line) => (
              <Row key={line} icon={IconListDetails}>
                {line}
              </Row>
            ))}
            {view.reviews.countChange !== null && view.reviews.countChange !== 0 && (
              <Row icon={IconStar} tone={view.reviews.countChange > 0 ? "up" : "down"}>
                {t(locale, k("reviewsMove"), { change: signed(view.reviews.countChange), count: view.reviews.count ?? 0 })}
              </Row>
            )}
            {moved.length === 0 && view.listingChanges.length === 0 && (view.reviews.countChange ?? 0) === 0 && (
              <Row icon={IconMinus}>{view.changesUnavailable ? t(locale, "dashboard.reports.recapChangesUnavailable") : t(locale, k("nothingMoved"))}</Row>
            )}
          </ul>
        )}
        {/* Listing changes and the review count come from Google. */}
        {(view.listingChanges.length > 0 || (view.reviews.countChange ?? 0) !== 0) && <GoogleMapsAttribution />}
      </div>

      {/* What we've verified this week */}
      <div className="border-t border-paper-line px-5 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mute">{t(locale, k("verifiedHeading"))}</div>
        <dl className="mt-2 grid grid-cols-3 gap-2" data-testid="week-stats">
          {(
            [
              [view.fixesConfirmed, "statFixes", IconCircleCheck],
              [view.listingChanges.length, "statChanges", IconListDetails],
              [view.scanCount, "statScans", IconTrophy],
            ] as const
          ).map(([n, key]) => (
            <div key={key} className="rounded-lg bg-paper px-3 py-2">
              <dd className="font-serif text-xl font-bold text-ink">{n}</dd>
              <dt className="text-[11.5px] leading-snug text-ink-soft">{t(locale, k(key))}</dt>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}
