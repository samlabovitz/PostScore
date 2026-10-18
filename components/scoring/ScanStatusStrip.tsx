"use client";

// "Last scanned {date} · Your score, history and competitor comparison
// update only when you re-scan." — on the Overview with the Re-scan
// button (plus progress and an honest summary afterwards), elsewhere
// with a link to it. Freshness: today (green), N days (neutral), 30+
// days (amber). `now` comes from the server so the server and browser
// render the same words (no hydration mismatch).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconInfoCircle, IconRefresh } from "@tabler/icons-react";
import { rescanBusiness, type RescanSummary } from "@/app/actions/scoring";
import { rescanAvailability, scanFreshness } from "@/lib/rescanPolicy";
import { cn } from "@/lib/utils";
import { formatPoints } from "@/components/scoring/CategoryCard";
import { formatDateTime, t, tPlural, useLocale, useTimeZone, type Locale } from "@/lib/i18n";

export function freshnessLabel(lastScanAt: string | null, now: Date, timeZone: string, locale: Locale): { text: string; tone: "green" | "neutral" | "amber" } {
  const f = scanFreshness(lastScanAt, now, timeZone);
  switch (f.kind) {
    case "never":
      return { text: t(locale, "dashboard.rescan.never"), tone: "neutral" };
    case "today":
      return { text: t(locale, "dashboard.rescan.freshToday"), tone: "green" };
    case "days":
      return { text: tPlural(locale, "dashboard.rescan.freshDays", f.days, { count: f.days }), tone: "neutral" };
    case "stale":
      return { text: t(locale, "dashboard.rescan.stale", { count: f.days }), tone: "amber" };
  }
}

/** One honest sentence summarizing a completed re-scan — every number in
 * it comes straight from the real reconciliation/diff the scan just ran,
 * never a generic "Done!". A scan that genuinely found nothing new says
 * so plainly, rather than a silent or ambiguous success. */
export function summarizeRescan(
  tasksConfirmed: number,
  pointsConfirmed: number,
  tasksReopened: number,
  changeCount: number,
  locale: Locale
): string {
  const parts: string[] = [];
  if (tasksConfirmed > 0) {
    parts.push(
      tPlural(locale, "dashboard.overview.rescanTasksConfirmed", tasksConfirmed, {
        count: tasksConfirmed,
        points: formatPoints(pointsConfirmed),
      })
    );
  }
  if (tasksReopened > 0) {
    parts.push(
      tPlural(locale, "dashboard.overview.rescanTasksReopened", tasksReopened, { count: tasksReopened })
    );
  }
  if (changeCount > 0) {
    parts.push(
      tPlural(locale, "dashboard.overview.rescanListingChangesFound", changeCount, { count: changeCount })
    );
  }
  return parts.length > 0
    ? t(locale, "dashboard.overview.rescanSummary", { parts: parts.join(", ") })
    : t(locale, "dashboard.overview.rescanNothingChanged");
}

/** "Score 86 → 87 · 2 checks changed", or the honest scoring-update line. */
export function rescanToast(summary: RescanSummary, locale: Locale): string {
  if (summary.scoringUpdated) return t(locale, "dashboard.rescan.toastScoringUpdated", { after: summary.scoreAfter });
  const score =
    summary.scoreBefore === null
      ? t(locale, "dashboard.rescan.toastScoreFirst", { after: summary.scoreAfter })
      : t(locale, "dashboard.rescan.toastScore", { before: summary.scoreBefore, after: summary.scoreAfter });
  const checks =
    summary.checksChanged === 0
      ? t(locale, "dashboard.rescan.toastNoChecks")
      : tPlural(locale, "dashboard.rescan.toastChecks", summary.checksChanged, { count: summary.checksChanged });
  return `${score} · ${checks}`;
}

const TONE: Record<"green" | "neutral" | "amber", string> = {
  green: "bg-[color:color-mix(in_srgb,var(--color-green)_10%,transparent)] text-green",
  neutral: "bg-[color:color-mix(in_srgb,var(--color-ink)_5%,transparent)] text-ink-soft",
  amber: "bg-[color:color-mix(in_srgb,var(--color-amber)_10%,transparent)] text-amber",
};

type RescanState =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string }
  | { kind: "too_soon"; at: string };

/** The Re-scan action and its honest outcome, shared by the strip and
 * the Overview header. `nextAt` is when the next re-scan opens (null =
 * allowed now). */
export function useRescan(businessId: string, lastScanAt: string | null, now: string) {
  const locale = useLocale();
  const router = useRouter();
  const availability = rescanAvailability(lastScanAt, new Date(now));
  const [state, setState] = useState<RescanState>({ kind: "idle" });

  async function run() {
    setState({ kind: "scanning" });
    const result = await rescanBusiness(businessId);
    if (result.status === "ok") {
      // The score line, plus what the scan confirmed (tasks, listing changes).
      const details = summarizeRescan(result.tasksConfirmed, result.pointsConfirmed, result.tasksReopened, result.changes.length, locale);
      setState({ kind: "done", message: result.summary ? `${rescanToast(result.summary, locale)}. ${details}` : details });
      router.refresh();
    } else if (result.status === "too_soon") {
      setState({ kind: "too_soon", at: result.nextAvailableAt });
    } else if (result.status === "no_results") {
      setState({ kind: "error", message: t(locale, "dashboard.overview.rescanNoResultsError") });
    } else if (result.status === "error") {
      setState({ kind: "error", message: result.message });
    } else {
      setState({ kind: "error", message: t(locale, "dashboard.overview.rescanErrorFallback") });
    }
  }

  const nextAt = state.kind === "too_soon" ? state.at : availability.allowed ? null : availability.nextAvailableAt;
  return { state, run, nextAt };
}

/** Freshness chip · "Last scanned {date}" · scoring-version ⓘ. */
export function ScanFreshnessLine({
  lastScanAt,
  now,
  scoringVersion = null,
  className,
}: {
  lastScanAt: string | null;
  now: string;
  scoringVersion?: string | null;
  className?: string;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const fresh = freshnessLabel(lastScanAt, new Date(now), timeZone, locale);
  const [showVersion, setShowVersion] = useState(false);
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-[13px] text-ink", className)}>
      <span className={cn("rounded-md px-2 py-0.5 text-[12px] font-semibold", TONE[fresh.tone])}>{fresh.text}</span>
      {lastScanAt && (
        <span className="text-ink-soft">{t(locale, "dashboard.rescan.lastScanned", { date: formatDateTime(lastScanAt, locale, timeZone) })}</span>
      )}
      {scoringVersion && (
        <span className="relative">
          <button
            type="button"
            onClick={() => setShowVersion((v) => !v)}
            aria-label={t(locale, "dashboard.rescan.versionInfoAria")}
            aria-expanded={showVersion}
            className="align-middle text-ink-mute hover:text-ink"
          >
            <IconInfoCircle size={15} />
          </button>
          {showVersion && (
            <span className="absolute left-0 top-full z-20 mt-1 w-max max-w-[240px] rounded-lg border border-paper-deep bg-white px-2.5 py-1.5 text-[12px] text-ink-soft shadow-card">
              {t(locale, "dashboard.rescan.versionInfo", { version: scoringVersion })}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/** Progress / result / error lines after a re-scan. */
export function RescanMessages({ state }: { state: RescanState }) {
  const locale = useLocale();
  if (state.kind === "scanning") return <p className="text-[12.5px] font-medium text-ink" role="status">{t(locale, "dashboard.rescan.scanning")}</p>;
  if (state.kind === "done") return <p className="text-[12.5px] font-semibold text-green" role="status">{state.message}</p>;
  if (state.kind === "error") return <p className="text-[12.5px] text-red">{state.message}</p>;
  return null;
}

export function RescanButton({ state, nextAt, onClick }: { state: RescanState; nextAt: string | null; onClick: () => void }) {
  const locale = useLocale();
  return (
    // Navy text on brass (4.8:1) — white on brass is only 3.2:1.
    <button
      type="button"
      onClick={onClick}
      disabled={state.kind === "scanning" || nextAt !== null}
      className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-brass bg-brass px-[15px] py-[7px] text-[13px] font-semibold text-ink transition-colors hover:bg-[#a5772a] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <IconRefresh size={14} className={cn(state.kind === "scanning" && "animate-spin")} />
      {state.kind === "scanning" ? t(locale, "dashboard.overview.rescanning") : t(locale, "dashboard.overview.rescanNow")}
    </button>
  );
}

export function NextRescanNote({ nextAt }: { nextAt: string | null }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  if (!nextAt) return null;
  return <span className="text-[12px] text-ink-mute">{t(locale, "dashboard.rescan.nextAvailable", { time: formatDateTime(nextAt, locale, timeZone) })}</span>;
}
