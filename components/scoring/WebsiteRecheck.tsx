"use client";

// "Re-check my website" (Website page, and website fixes in the Action
// plan): re-scans only the website part, then shows what changed. 3 a
// day (lib/websiteRecheckPolicy.ts), separate from the daily full
// re-scan; the result is saved as a normal scan, so the page refreshes
// with the new website score and PostScore.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconRefresh } from "@tabler/icons-react";
import { recheckWebsite, type WebsiteRecheckResult } from "@/app/actions/websiteRecheck";
import { t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { WEBSITE_RECHECKS_PER_DAY, type CheckStatus, type WebsiteCheckChange } from "@/lib/websiteRecheckPolicy";
import { cn } from "@/lib/utils";

const k = (key: string) => `dashboard.websiteRecheck.${key}` as MessageKey;
const STATUS_KEY: Record<CheckStatus, MessageKey> = {
  done: "dashboard.checkResult.done",
  needs_work: "dashboard.checkResult.needsWork",
  couldnt_check: "dashboard.checkResult.couldntCheck",
};

/** "Mobile-friendly: Needs work → Done, +3 pts". */
export function changeLine(c: WebsiteCheckChange, locale: Locale): string {
  const label = c.labelKey ? t(locale, c.labelKey) : c.label;
  const move = `${label}: ${t(locale, STATUS_KEY[c.from])} → ${t(locale, STATUS_KEY[c.to])}`;
  if (c.points === 0) return move;
  return `${move}, ${t(locale, k("points"), { points: c.points > 0 ? `+${c.points}` : `−${Math.abs(c.points)}` })}`;
}

type Ok = Extract<WebsiteRecheckResult, { status: "ok" }>;

export function RecheckSummary({ result }: { result: Ok }) {
  const locale = useLocale();
  const nothing = result.changes.length === 0 && result.scoreBefore === result.scoreAfter;
  return (
    <div role="status" data-testid="recheck-summary" className="flex flex-col gap-1.5 rounded-lg border border-paper-deep bg-paper px-3 py-2.5 text-[13px] text-ink">
      {nothing ? (
        <>
          <p className="font-semibold">{t(locale, k("nothingChanged"))}</p>
          <p className="text-[12.5px] text-ink-soft">{t(locale, k("publishHint"))}</p>
        </>
      ) : (
        <>
          <p className="font-semibold">{t(locale, k("whatChanged"))}</p>
          {result.changes.length > 0 && (
            <ul className="ml-4 list-disc space-y-0.5">
              {result.changes.map((c) => (
                <li key={c.checkId}>{changeLine(c, locale)}</li>
              ))}
            </ul>
          )}
          {result.scoreBefore !== null && (
            <p className="text-[12.5px] text-ink-soft">
              {t(locale, k("scoreLine"), { before: result.scoreBefore, after: result.scoreAfter })}
              {result.websiteBefore !== null && result.websiteAfter !== null && ` · ${t(locale, k("websiteLine"), { before: result.websiteBefore, after: result.websiteAfter })}`}
            </p>
          )}
          {result.changes.length === 0 && <p className="text-[12.5px] text-ink-soft">{t(locale, k("publishHint"))}</p>}
        </>
      )}
      {result.tasksConfirmed > 0 && (
        <p className="text-[12.5px] font-medium text-green">{t(locale, k("tasksConfirmed"), { count: result.tasksConfirmed, points: Math.round(result.pointsConfirmed) })}</p>
      )}
    </div>
  );
}

export function WebsiteRecheck({
  businessId,
  initialLeft,
  hasWebsite,
  compact = false,
}: {
  businessId: string;
  /** Re-checks left today (from getWebsiteRecheckStatus). */
  initialLeft: number;
  hasWebsite: boolean;
  /** The Action plan's small version: the button and its note only. */
  compact?: boolean;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [left, setLeft] = useState(initialLeft);
  const [state, setState] = useState<{ kind: "idle" } | { kind: "running"; seconds: number } | { kind: "done"; result: Ok } | { kind: "error"; message: string }>({ kind: "idle" });

  useEffect(() => setLeft(initialLeft), [initialLeft]);
  useEffect(() => {
    if (state.kind !== "running") return;
    const timer = setInterval(() => setState((s) => (s.kind === "running" ? { kind: "running", seconds: s.seconds + 1 } : s)), 1000);
    return () => clearInterval(timer);
  }, [state.kind]);

  if (!hasWebsite) return null;
  const running = state.kind === "running";

  async function run() {
    setState({ kind: "running", seconds: 0 });
    const result = await recheckWebsite(businessId).catch(() => ({ status: "error", message: "" }) as const);
    if (result.status === "ok") {
      setLeft(result.availability.left);
      setState({ kind: "done", result });
      router.refresh();
    } else if (result.status === "limit_reached") {
      setLeft(0);
      setState({ kind: "error", message: t(locale, k("limitReached"), { total: WEBSITE_RECHECKS_PER_DAY }) });
    } else if (result.status === "no_website") {
      setState({ kind: "error", message: t(locale, k("noWebsite")) });
    } else {
      setState({ kind: "error", message: t(locale, k("failed")) });
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", !compact && "rounded-xl border border-paper-deep bg-white p-4 shadow-card")} data-testid="website-recheck">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button
          type="button"
          onClick={run}
          disabled={running || left <= 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ink bg-white px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconRefresh size={15} aria-hidden className={cn(running && "animate-spin motion-reduce:animate-none")} />
          {running ? t(locale, k("running")) : t(locale, k("button"))}
        </button>
        <span className="text-[12.5px] text-ink-soft" data-testid="recheck-left">
          {left > 0 ? t(locale, k("left"), { left, total: WEBSITE_RECHECKS_PER_DAY }) : t(locale, k("noneLeft"), { total: WEBSITE_RECHECKS_PER_DAY })}
        </span>
      </div>
      {!compact && state.kind === "idle" && <p className="text-[12px] text-ink-mute">{t(locale, k("explain"))}</p>}
      {running && (
        <div className="flex flex-col gap-1" aria-live="polite">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-deep">
            <div className="h-full rounded-full bg-brass transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(95, (state.seconds / 60) * 100)}%` }} />
          </div>
          <p className="text-[12px] text-ink-soft">{t(locale, k("progress"), { seconds: state.seconds })}</p>
        </div>
      )}
      {state.kind === "done" && <RecheckSummary result={state.result} />}
      {state.kind === "error" && (
        <p role="alert" className="text-[12.5px] text-red">
          {state.message}
        </p>
      )}
      {compact && state.kind === "done" && (
        <a href={`/business/${businessId}/website`} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
          {t(locale, k("seeWebsite"))}
          <IconArrowRight size={13} aria-hidden />
        </a>
      )}
    </div>
  );
}
