"use client";

// "Since your last visit" — mounted once in the dashboard shell. The first
// time a business is opened in a browser session it records the visit
// (app/actions/weekly.ts openBusinessVisit) and, when the previous visit
// was 7+ days ago, shows what changed since then. Never "no change" when
// nothing was re-scanned: it says so and offers a fresh scan (the 1-a-day
// limit applies). Esc / click outside closes it; no motion.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowDownRight, IconArrowUpRight, IconDownload, IconRefresh } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { GoogleMapsAttribution } from "@/components/google/GoogleMapsAttribution";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { formatDateTime, formatShortDate, t, useLocale, type MessageKey } from "@/lib/i18n";
import { openBusinessVisit, runFreshScan, type SinceLastVisitData } from "@/app/actions/weekly";
import { downloadWeeklyPdf } from "@/components/reports/weeklyPdfDownload";
import type { ChartCategoryId } from "@/lib/scoreHistory";

const k = (key: string) => `dashboard.visit.${key}` as MessageKey;
const CATEGORY_KEY: Record<ChartCategoryId, MessageKey> = {
  listing: "dashboard.reports.chartCategoryListing",
  website: "dashboard.reports.chartCategoryWebsite",
  reviews: "dashboard.reports.chartCategoryReviews",
};
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

export const VISIT_SESSION_PREFIX = "postscore.visitChecked.";

/** First time this business is opened in this browser session? Marks it.
 * Storage that throws (private mode) counts as "first" — the server's own
 * last-seen update still keeps it to one pop-up per visit. */
export function claimVisit(storage: Pick<Storage, "getItem" | "setItem"> | null, businessId: string): boolean {
  try {
    if (!storage) return true;
    if (storage.getItem(VISIT_SESSION_PREFIX + businessId)) return false;
    storage.setItem(VISIT_SESSION_PREFIX + businessId, "1");
    return true;
  } catch {
    return true;
  }
}

export function SinceLastVisitBody({ businessId, data }: { businessId: string; data: SinceLastVisitData }) {
  const locale = useLocale();
  const router = useRouter();
  const [scan, setScan] = useState<"idle" | "working" | "done" | "error">("idle");
  const since = formatShortDate(data.since, locale, data.timeZone);

  if (data.noNewScan) {
    return (
      <div className="flex flex-col gap-3" data-testid="no-new-scan">
        <p className="text-[14px] text-ink">{t(locale, k("noNewScan"))}</p>
        <p className="text-[12.5px] text-ink-soft">{t(locale, k("lastVisit"), { date: since })}</p>
        {data.rescan.allowed ? (
          <Button
            variant="brass"
            className="w-fit"
            disabled={scan === "working" || scan === "done"}
            onClick={async () => {
              setScan("working");
              const result = await runFreshScan(businessId).catch(() => null);
              if (result?.status === "ok") {
                setScan("done");
                router.refresh();
              } else setScan("error");
            }}
          >
            <IconRefresh size={15} aria-hidden />
            {scan === "working" ? t(locale, k("scanning")) : t(locale, k("runScan"))}
          </Button>
        ) : (
          <p className="text-[12.5px] text-ink-mute">
            {t(locale, k("nextScan"), { date: data.rescan.nextAvailableAt ? formatDateTime(data.rescan.nextAvailableAt, locale, data.timeZone) : "" })}
          </p>
        )}
        {scan === "done" && <p className="text-[12.5px] text-green">{t(locale, k("scanDone"))}</p>}
        {scan === "error" && <p className="text-[12.5px] text-red">{t(locale, k("scanError"))}</p>}
      </div>
    );
  }

  const moved = data.categories.filter((c) => c.before !== null && c.after !== null && c.before !== c.after);
  return (
    <div className="flex flex-col gap-4" data-testid="since-last-visit">
      <p className="font-serif text-[22px] font-bold text-ink" data-testid="since-score">
        {data.baselineScore === null
          ? t(locale, k("scoreNow"), { score: data.latestScore ?? "—" })
          : data.delta !== null
            ? t(locale, k("scoreLine"), { date: since, from: data.baselineScore, to: data.latestScore ?? "—", change: signed(data.delta) })
            : t(locale, k("scoreLineNoDelta"), { date: since, from: data.baselineScore, to: data.latestScore ?? "—" })}
      </p>
      {data.baselineScore !== null && !data.comparable && <p className="-mt-3 text-[12px] text-ink-mute">{t(locale, k("scoringUpdated"))}</p>}

      {moved.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="since-categories">
          {moved.map((c) => {
            const d = (c.after as number) - (c.before as number);
            return (
              <li key={c.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-ink">{t(locale, CATEGORY_KEY[c.id])}</span>
                  <span className={cn("inline-flex items-center gap-0.5 font-semibold", d > 0 ? "text-green" : "text-red")}>
                    {d > 0 ? <IconArrowUpRight size={14} aria-hidden /> : <IconArrowDownRight size={14} aria-hidden />}
                    {c.before} → {c.after}
                  </span>
                </div>
                <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-paper-deep" aria-hidden>
                  <div className={cn("h-full rounded-full", d > 0 ? "bg-green" : "bg-red")} style={{ width: `${c.after}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
        {data.rank && (
          <div className="rounded-lg bg-paper px-3 py-2">
            <dt className="text-ink-mute">{t(locale, k("rank"))}</dt>
            <dd className="font-semibold text-ink">
              #{data.rank.now} / {data.rank.of}
              {data.rank.then !== null && data.rank.then !== data.rank.now && (
                <span className={cn("ml-1 font-medium", data.rank.now < data.rank.then ? "text-green" : "text-red")}>{t(locale, k("rankWas"), { rank: data.rank.then })}</span>
              )}
            </dd>
          </div>
        )}
        <div className="rounded-lg bg-paper px-3 py-2">
          <dt className="text-ink-mute">{t(locale, k("fixes"))}</dt>
          <dd className="font-semibold text-ink">{data.fixesConfirmed}</dd>
        </div>
        {data.reviews.countChange !== null && (
          <div className="col-span-2 rounded-lg bg-paper px-3 py-2">
            <dt className="text-ink-mute">{t(locale, k("reviews"))}</dt>
            <dd className="font-semibold text-ink">
              {data.reviews.countChange === 0
                ? t(locale, k("noNewReviews"))
                : data.reviews.countChange > 0
                  ? t(locale, k("newReviews"), { change: signed(data.reviews.countChange) })
                  : t(locale, k("fewerReviews"), { count: Math.abs(data.reviews.countChange) })}
              {data.reviews.rating !== null && data.reviews.ratingChange !== null && data.reviews.ratingChange !== 0 && (
                <span className="ml-1 font-medium text-ink-soft">
                  · {t(locale, k("ratingMove"), { from: (data.reviews.rating - data.reviews.ratingChange).toFixed(1), to: data.reviews.rating.toFixed(1) })}
                </span>
              )}
            </dd>
            {/* The goal (beat the leader) — the shared wording, then "Next up". */}
            {(data.reviewGoalLines ?? []).slice(1).map((line) => (
              <dd key={line} className="mt-0.5 text-[12.5px] font-medium text-ink" data-testid="visit-review-goal">
                {line}
              </dd>
            ))}
          </div>
        )}
      </dl>
      {/* The rank and reviews are Google Maps data. */}
      {(data.rank || data.reviews.countChange !== null) && <GoogleMapsAttribution className="mt-0" />}

      {data.nextSteps.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mute">{t(locale, k("nextSteps"))}</div>
          <ol className="mt-1.5 flex flex-col gap-1.5">
            {data.nextSteps.map((s, i) => (
              <li key={s.title} className="flex items-start gap-2 text-[13px] text-ink">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">{i + 1}</span>
                <span className="min-w-0 flex-1">{s.title}</span>
                <span className="shrink-0 text-[12px] font-semibold text-green">{s.points}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function SinceLastVisit({ businessId }: { businessId: string }) {
  const locale = useLocale();
  const [data, setData] = useState<SinceLastVisitData | null>(null);
  const [open, setOpen] = useState(false);
  const [pdf, setPdf] = useState<"idle" | "working" | "error">("idle");

  useEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }
    if (!claimVisit(storage, businessId)) return;
    let cancelled = false;
    openBusinessVisit(businessId)
      .then((result) => {
        if (!cancelled && result.status === "ok" && result.show) {
          setData(result.data);
          setOpen(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  if (!data) return null;
  return (
    <Modal open={open} onClose={() => setOpen(false)} title={t(locale, k("title"))}>
      <SinceLastVisitBody businessId={businessId} data={data} />
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-paper-line pt-4">
        {pdf === "error" && <span className="mr-auto text-[12px] text-red">{t(locale, "dashboard.reports.pdf.error")}</span>}
        <Button
          variant="default"
          size="sm"
          disabled={pdf === "working"}
          onClick={async () => {
            setPdf("working");
            setPdf((await downloadWeeklyPdf(businessId, data.weekStart, false)) ? "idle" : "error");
          }}
        >
          <IconDownload size={14} aria-hidden />
          {pdf === "working" ? t(locale, "dashboard.reports.recapPreparingDownload") : t(locale, k("downloadWeekly"))}
        </Button>
        <Button variant="brass" size="sm" onClick={() => setOpen(false)}>
          {t(locale, k("gotIt"))}
        </Button>
      </div>
    </Modal>
  );
}
