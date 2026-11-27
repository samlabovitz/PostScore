"use client";

import { displayPoints } from "@/lib/pointRange";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { IconAlertTriangle, IconCheck, IconChevronDown, IconCircleCheck, IconMinus } from "@tabler/icons-react";
import { WebsiteCoverageNote } from "./WebsiteCoverageNote";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/utils";
import type { CategoryResult, CheckResult } from "@/lib/scoring";
import { checkOutcome, formatPoints, isNotScoredYet, type CheckOutcome } from "@/lib/checkOutcome";
import { ChangedOnGoogleNote } from "@/components/scoring/ChangedOnGoogleNote";

// Kept here for the UI that already imports them from this file.
export { checkOutcome, formatPoints, ChangedOnGoogleNote };
import { t, tPlural, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { hoursExplanation, type HoursCheckState } from "@/lib/hoursCheck";
import { HoursDiffLines, StillWaitingLine, WaitingForGoogleTag } from "@/components/scoring/HoursCheck";
import { LockedFixRow } from "@/components/overview/FixPlanUpsell";
import { checkAnchorId } from "@/lib/postaiLinks";
import { readStorage, writeStorage } from "@/lib/signStudio/design";
import { timeEstimateText, type CheckHowTo } from "@/lib/actionPlan";
import { FixButton } from "@/components/scoring/FixButton";
import { PremiumOneClickLine } from "@/components/scoring/PremiumOneClickLine";

/** A needs-work row's fix: its own "How to fix it" (steps, a rough time,
 * official links) and the PostScore page as a secondary link. */
export interface BreakdownFix {
  href: string;
  label: string;
  howTo?: CheckHowTo;
}

const OUTCOME_PILL: Record<CheckOutcome, { variant: "green" | "amber" | "neutral"; labelKey: MessageKey }> = {
  done: { variant: "green", labelKey: "dashboard.checkResult.done" },
  needs_work: { variant: "amber", labelKey: "dashboard.checkResult.needsWork" },
  couldnt_check: { variant: "neutral", labelKey: "dashboard.checkResult.couldntCheck" },
  not_scored_yet: { variant: "neutral", labelKey: "dashboard.checkResult.notScoredYet" },
  excellent: { variant: "green", labelKey: "dashboard.checkResult.excellent" },
  good: { variant: "green", labelKey: "dashboard.checkResult.good" },
};

function OutcomeIcon({ outcome }: { outcome: CheckOutcome }) {
  switch (outcome) {
    case "done":
    case "excellent":
    case "good":
      return <IconCircleCheck size={17} className="shrink-0 text-green" />;
    case "needs_work":
      return <IconAlertTriangle size={17} className="shrink-0 text-amber" />;
    case "couldnt_check":
    case "not_scored_yet":
      return <IconMinus size={17} className="shrink-0 text-ink-mute" />;
  }
}


/** Renders one scoring category's real checks — label, earned/max
 * points, and confidence — straight off a live ScoreBreakdown. Used by
 * the full score breakdown (BusinessScoreView) and by any page that
 * wants to show just one category's real rubric (e.g. the Reviews page
 * showing only "visibility") without re-deriving or re-styling it. */
export function CategoryCard({
  category,
  hasWebsite = false,
  scoreBasis = null,
  embedded = false,
  fixLinks,
  lockedFixes = false,
  businessId = null,
  gainPoints = false,
  openPassed = false,
}: {
  category: CategoryResult;
  /** The passed checks start open (tests, and pages that want every row). */
  openPassed?: boolean;
  /** Day 25B step 5 (Presence → Reviews): "+N pts" on each row that needs work. */
  gainPoints?: boolean;
  /** The owner's own business: shows the customer-details answers
   * ("No parking available"…). Omitted = read-only. */
  businessId?: string | null;
  /** See WebsiteCoverageNote's scoreBasis. */
  scoreBasis?: number | null;
  /** Only used by the Website category's "partly checked" note. */
  hasWebsite?: boolean;
  /** Overview: just the check rows, inside the category's own card
   * (its heading and score are already shown there). */
  embedded?: boolean;
  /** Overview: a "how to fix it" link per check id, shown on rows that
   * need work (PostAI's link targets — lib/postaiLinks.ts). */
  fixLinks?: Record<string, BreakdownFix>;
  /** Free (the audit): a locked, blurred "How to fix this" row on rows
   * that need work — never the advice itself. */
  lockedFixes?: boolean;
}) {
  const locale = useLocale();
  if (embedded) {
    return <CheckRows category={category} fixLinks={fixLinks} lockedFixes={lockedFixes} businessId={businessId} openPassed={openPassed} />;
  }
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-base font-semibold text-ink">{category.label}</h3>
        <span className="text-sm text-ink-mute">
          {formatPoints(category.earnedPoints)} / {formatPoints(category.possiblePoints)}{" "}
          {t(locale, "dashboard.website.ptsAbbrev")}
          <span className="ml-1.5 text-ink-mute/70">
            {t(locale, "dashboard.overview.categoryWeightAnnotation", { weight: category.weight })}
          </span>
        </span>
      </div>
      <WebsiteCoverageNote category={category} hasWebsite={hasWebsite} scoreBasis={scoreBasis} className="mt-1 text-[12px] text-ink-mute" />

      <div className="mt-4">
        <CheckRows category={category} businessId={businessId} gainPoints={gainPoints} openPassed={openPassed} />
      </div>
    </Card>
  );
}

/** A check that passes (full or good enough): folded into "✓ N checks passed · Show all". */
const passed = (outcome: CheckOutcome) => outcome === "done" || outcome === "excellent" || outcome === "good";

/** "Matches your Google listing": the scan's hours line shows the same hours on both sides — changed since that scan. */
/** The hours check as it is now (lib/hoursCheck.server.ts loadHoursCheck), for the "Matches your Google listing" row. */
export const HoursStateContext = createContext<HoursCheckState | null>(null);

/** That row's state: "stale" (Maps matches the website now: re-scan), "waiting" (the Business Profile matches,
 * Maps hasn't published it), "differs" (the days, side by side), or null (nothing live: the scan's own words). */
export function hoursRowState(check: Pick<CheckResult, "id">, state: HoursCheckState | null | undefined): "stale" | "waiting" | "differs" | null {
  if (check.id !== "website.info_consistency" || !state) return null;
  if (state.kind === "stale") return "stale";
  return state.profileAhead ? "waiting" : "differs";
}

export function hoursChangedSinceScan(check: Pick<CheckResult, "id">, state: HoursCheckState | null | undefined): boolean {
  return hoursRowState(check, state) === "stale";
}

function CheckRows({
  category,
  fixLinks,
  lockedFixes = false,
  businessId = null,
  gainPoints = false,
  openPassed = false,
}: {
  category: CategoryResult;
  openPassed?: boolean;
  gainPoints?: boolean;
  fixLinks?: Record<string, BreakdownFix>;
  lockedFixes?: boolean;
  businessId?: string | null;
}) {
  const locale = useLocale();
  const rows = category.checks.map((check) => ({ check, outcome: checkOutcome(check) }));
  // The checks that need work show first, one compact line each (title, points, the one button; the description
  // on tap). "Not scored yet" folds into one muted line, and the passed ones into "✓ N checks passed".
  const open = rows.filter((r) => !passed(r.outcome) && r.outcome !== "not_scored_yet");
  const waiting = rows.filter((r) => r.outcome === "not_scored_yet");
  const done = rows.filter((r) => passed(r.outcome));
  // A passed row, as before: its status under it.
  const row = ({ check, outcome }: (typeof rows)[number]) => {
      const pill = OUTCOME_PILL[outcome];
      const isFull = check.earnedPoints !== null && check.earnedPoints >= check.maxPoints;
      return (
        <div
          key={check.id}
          id={checkAnchorId(check.id)}
          data-row="check"
          data-outcome={outcome}
          className="flex scroll-mt-20 flex-col gap-1 rounded-lg py-3 transition-colors duration-700 first:pt-0 last:pb-0"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
              <OutcomeIcon outcome={outcome} />
              {/* One line, like every row (the status goes under the points when it's longer). */}
              <span className={cn(outcome === "not_scored_yet" && "whitespace-nowrap")}>{check.label}</span>
            </span>
            <div className={cn("flex shrink-0 gap-2", outcome === "not_scored_yet" ? "flex-col items-end gap-0.5" : "items-center")}>
              <span className={cn("text-sm tabular-nums", check.earnedPoints === null ? "text-ink-mute" : isFull ? "text-green" : "text-ink-soft")}>
                {formatPoints(check.earnedPoints)} / {formatPoints(check.maxPoints)}
              </span>
              <Pill variant={pill.variant}>{t(locale, pill.labelKey)}</Pill>
            </div>
          </div>
          <RowStatus check={check} businessId={businessId} />
        </div>
      );
  };
  return (
    <div className="flex flex-col">
      {open.length > 0 && (
        <div className="flex flex-col divide-y divide-paper-line">
          {open.map((r) => (
            <CompactRow key={r.check.id} check={r.check} outcome={r.outcome} fix={fixLinks?.[r.check.id]} lockedFixes={lockedFixes} businessId={businessId} gainPoints={gainPoints} />
          ))}
        </div>
      )}
      {waiting.length > 0 && <NotScoredYetLine checks={waiting.map((r) => r.check)} separated={open.length > 0} />}
      {done.length > 0 && (
        <PassedChecks count={done.length} allPass={open.length === 0} anchors={done.map((r) => checkAnchorId(r.check.id))} initialOpen={openPassed}>
          {done.map(row)}
        </PassedChecks>
      )}
    </div>
  );
}

/** A check that needs work, on one line: its title (tap: the description), the points it has, and its one button.
 * An hours row that only changed since the last scan gets "Re-scan to update" instead of a fix. */
function CompactRow({
  check,
  outcome,
  fix,
  lockedFixes,
  businessId,
  gainPoints,
}: {
  check: CheckResult;
  outcome: CheckOutcome;
  fix: BreakdownFix | undefined;
  lockedFixes: boolean;
  businessId: string | null;
  gainPoints: boolean;
}) {
  const locale = useLocale();
  const hoursState = useContext(HoursStateContext);
  const hours = hoursRowState(check, hoursState);
  const sinceScan = hours === "stale";
  const waiting = hours === "waiting";
  const id = checkAnchorId(check.id);
  // Rows losing points (and waiting on Google) start open; passed ones closed. The owner's own open/close for a row
  // is kept in this browser only (read after the first paint, so the server and the page agree).
  const losing = check.earnedPoints !== null && check.earnedPoints < check.maxPoints;
  const startOpen = losing || waiting;
  const memo = rowMemoKey(businessId, check.id);
  const [show, setShowState] = useState(startOpen);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const saved = readStorage(memo);
    if (saved === "open" || saved === "closed") setShowState(saved === "open");
  }, [memo]);
  const setShow = (next: boolean | ((v: boolean) => boolean)) =>
    setShowState((v) => {
      const value = typeof next === "function" ? next(v) : next;
      writeStorage(memo, value === startOpen ? null : value ? "open" : "closed");
      return value;
    });
  // A link to this check (Top issue, PostAI) opens its description.
  useEffect(() => {
    const open = () => window.location.hash.slice(1) === id && setShowState(true);
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [id]);
  const gain = check.earnedPoints !== null && check.maxPoints > check.earnedPoints ? check.maxPoints - check.earnedPoints : 0;
  const item = { checkId: check.id, missingParts: missingParts(check) ?? undefined, hoursMismatch: check.id === "website.info_consistency" && /hour|horario/i.test(check.explanation) };
  return (
    // The whole row opens and closes its details; a button or link inside it does its own thing.
    <div
      id={id}
      data-row="check"
      data-outcome={outcome}
      data-compact="true"
      data-open={show || undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, label, summary")) return;
        setShow((v) => !v);
      }}
      className={cn(
        "-mx-2 flex scroll-mt-20 cursor-pointer flex-col gap-1.5 border-l-2 px-2 py-2.5 transition-colors duration-200 first:mt-0",
        show ? "rounded-r-lg border-brass bg-[color:color-mix(in_srgb,var(--color-brass)_7%,white)]" : "border-transparent hover:rounded-lg hover:bg-paper"
      )}
    >
      {/* One line when there's room (title, points, the button, the chevron); in a narrow card the button goes under the title. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={show}
          aria-controls={`more-${id}`}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            setShow((v) => !v);
          }}
          data-testid="row-title"
          className="flex min-w-[11rem] flex-1 items-start gap-2.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-brass"
        >
          <span className="flex min-w-0 flex-1 items-start gap-2 text-left text-sm font-medium leading-snug text-ink">
            <OutcomeIcon outcome={outcome} />
            <span>{check.label}</span>
            {/* The status in words: read out with the icon, and shown for a row with no button. */}
            {outcome === "needs_work" ? <span className="sr-only">{t(locale, OUTCOME_PILL[outcome].labelKey)}</span> : null}
          </span>
          {outcome !== "needs_work" && <Pill variant={OUTCOME_PILL[outcome].variant}>{t(locale, OUTCOME_PILL[outcome].labelKey)}</Pill>}
          <span className={cn("shrink-0 pt-px text-[13px] tabular-nums", check.earnedPoints === null ? "text-ink-mute" : "text-ink-soft")}>
            {gainPoints && gain > 0 ? (
              <span data-testid="check-gain" className="font-semibold text-ink">
                {t(locale, "dashboard.fixPlan.pts", { points: displayPoints(gain) })}
              </span>
            ) : (
              <>
                {formatPoints(check.earnedPoints)} / {formatPoints(check.maxPoints)}
              </>
            )}
          </span>
        </div>
        {!sinceScan && !waiting && outcome === "needs_work" && businessId && !lockedFixes ? (
          <span className="shrink-0 pl-[25px] sm:pl-0" data-testid="row-actions">
            <FixButton businessId={businessId} fromScore premiumLine={false} item={item} />
          </span>
        ) : null}
        <span aria-hidden className="ml-auto flex shrink-0 items-center gap-1 text-[12px] font-medium text-ink-mute" data-testid="row-chevron">
          <span className="hidden lg:inline">{t(locale, "dashboard.breakdown.details")}</span>
          <IconChevronDown size={16} className={cn("transition-transform duration-200", show && "rotate-180")} />
        </span>
      </div>
      {waiting && (
        // The Business Profile already shows the website's hours; Maps hasn't published them: no fix button.
        <p data-testid="hours-waiting" className="flex flex-col gap-1 pl-[25px] text-[12.5px] text-ink-mute">
          <span className="w-fit">
            <WaitingForGoogleTag />
          </span>
          <span>{t(locale, "dashboard.hoursCheck.profileMatches")}</span>
          <StillWaitingLine state={hoursState} />
        </p>
      )}
      {hours === "differs" && hoursState?.kind === "differs" && hoursState.days.length > 0 && (
        <div className="pl-[25px]">
          <HoursDiffLines state={hoursState} />
        </div>
      )}
      {sinceScan && (
        // The same rule as Fix plan and the Overview's recommendations: the saved points, never "different hours".
        <p data-testid="hours-stale" className="pl-[25px] text-[12.5px] text-ink-mute">
          {t(locale, "dashboard.breakdown.changedSince")}
          {" · "}
          <Link href={businessId ? `/business/${businessId}#rescan` : "#rescan"} className="font-medium text-ink underline decoration-brass underline-offset-2 hover:text-ink-soft">
            {t(locale, "dashboard.breakdown.rescanShort")}
          </Link>
        </p>
      )}
      <div id={`more-${id}`} data-testid="row-detail" data-open={show || undefined} className={cn("flex-col gap-1.5", show ? "flex" : "hidden")}>
        {/* A live hours state replaces the scan's words (their Google side can be the Business Profile, not Maps). */}
        {hours ? null : (
          <>
            {/* One or two lines (what we found, and the target); longer help behind "More help". */}
            <RowStatus check={check} businessId={businessId} short={!more} />
            {helpSplit(hoursExplanation(check, locale)).rest && (
              <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="ml-[25px] w-fit text-[12px] font-medium text-ink-mute underline decoration-paper-deep underline-offset-2 hover:text-ink" data-testid="row-more-help">
                {t(locale, more ? "dashboard.breakdown.lessHelp" : "dashboard.breakdown.moreHelp")}
              </button>
            )}
            {outcome === "needs_work" && lockedFixes && (
              <div data-testid="row-actions" className="ml-[25px] mt-1">
                <LockedFixRow blurred />
              </div>
            )}
            {outcome === "needs_work" && businessId && !lockedFixes && (
              <div className="ml-[25px] flex flex-wrap items-center gap-x-3 gap-y-1">
                <PremiumOneClickLine businessId={businessId} item={item} />
                {fix?.howTo?.minutes ? <span className="text-[12px] text-ink-mute">{timeEstimateText(fix.howTo.minutes, locale)}</span> : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** "Not scored yet: Website speed · — / 3" — one muted line (tap: why, in full). */
function NotScoredYetLine({ checks, separated }: { checks: CheckResult[]; separated: boolean }) {
  const locale = useLocale();
  return (
    <details data-testid="not-scored-line" className={cn("group text-[12.5px] text-ink-mute", separated && "mt-3 border-t border-paper-line pt-3")}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-1.5 [&::-webkit-details-marker]:hidden">
        <IconMinus size={13} aria-hidden />
        <span>{t(locale, "dashboard.checkResult.notScoredYet")}:</span>
        {checks.map((c, i) => (
          <span key={c.id}>
            <span className="whitespace-nowrap">{c.label}</span> · <span className="tabular-nums">— / {formatPoints(c.maxPoints)}</span>
            {i < checks.length - 1 ? "," : ""}
          </span>
        ))}
      </summary>
      <div className="mt-1.5 flex flex-col gap-1">
        {checks.map((c) => (
          <div key={c.id} id={checkAnchorId(c.id)} data-row="check" data-outcome="not_scored_yet" className="scroll-mt-20">
            <RowStatus check={c} />
          </div>
        ))}
      </div>
    </details>
  );
}

/** "✓ N checks passed · Show all" (or "Everything here passes ✓ · Show all checks"): opens the passed checks in
 * place; "Show less" folds them back. Opens by itself when the page's address points at one of them. */
function PassedChecks({ count, allPass, anchors, initialOpen, children }: { count: number; allPass: boolean; anchors: string[]; initialOpen: boolean; children: ReactNode }) {
  const locale = useLocale();
  const [show, setShow] = useState(initialOpen);
  useEffect(() => {
    const open = () => {
      if (anchors.includes(window.location.hash.slice(1))) setShow(true);
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [anchors]);
  return (
    <div className={cn("flex flex-col", !allPass && "mt-3 border-t border-paper-line pt-3")} data-testid="passed-checks" data-open={show || undefined}>
      <button type="button" onClick={() => setShow((v) => !v)} aria-expanded={show} data-testid="passed-toggle" className="flex w-fit flex-wrap items-center gap-x-1.5 text-left text-[13px] text-ink-soft hover:text-ink">
        {allPass ? (
          <>
            <span className="font-medium text-ink">{t(locale, "dashboard.breakdown.allPass")}</span>
            <IconCheck size={14} className="text-green" aria-hidden />
          </>
        ) : (
          <>
            <IconCheck size={14} className="text-green" aria-hidden />
            <span className="font-medium text-ink">{tPlural(locale, "dashboard.breakdown.passed", count, { count })}</span>
          </>
        )}
        <span aria-hidden className="text-ink-mute">·</span>
        <span className="font-semibold text-ink underline decoration-brass underline-offset-2">
          {t(locale, show ? "dashboard.breakdown.showLess" : allPass ? "dashboard.breakdown.showAllChecks" : "dashboard.breakdown.showAll")}
        </span>
      </button>
      {show && <div className="mt-3 flex flex-col divide-y divide-paper-line">{children}</div>}
    </div>
  );
}

/** The row's status: what's missing, always in full (long URLs wrap).
 * Customer details: the scored groups still missing on Google. */
/** Where a row's own open/close is kept (this browser only). */
function rowMemoKey(businessId: string | null, checkId: string): string {
  return `postscore.breakdownRow.${businessId ?? "-"}.${checkId}`;
}

/** The scan's words split for a row: the first sentence (what we found, usually with the target) and the rest. */
export function helpSplit(text: string): { first: string; rest: string | null } {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡"“(])/);
  const first = parts[0] ?? text;
  const rest = parts.slice(1).join(" ").trim();
  return { first, rest: rest || null };
}

function RowStatus({ check, businessId = null, short = false }: { check: CheckResult; businessId?: string | null; short?: boolean }) {
  const locale = useLocale();
  // Day 23 2d-4: Google reads differently now than this saved result —
  // never words that contradict it; the page's own note covers "couldn't load".
  if (check.liveDiffers === "changed") return <ChangedOnGoogleNote businessId={businessId} />;
  if (check.liveDiffers === "unavailable") return null;
  // Waiting for a second speed test: the whole explanation, never cut off.
  if (isNotScoredYet(check)) return <p data-testid="not-scored-yet" className="break-words pl-[25px] text-[13px] text-ink-mute">{check.explanation}</p>;
  const missing = missingParts(check);
  if (check.id === "completeness.customer_details" && missing !== null) {
    return (
      <p data-testid="customer-details-status" className="break-words pl-[25px] text-[13px] text-ink-mute">
        {missing.length === 0 ? check.explanation : t(locale, "dashboard.breakdown.missingParts", { parts: partList(missing, locale) })}
      </p>
    );
  }
  // Short: the first sentence, whole (what we found and the target); the rest once "More help" is open. Never cut.
  // Never a hours line with the same value on both sides (lib/hoursCheck.ts hoursExplanation).
  const words = hoursExplanation(check, locale);
  const text = short ? helpSplit(words).first : words;
  return <p data-testid="row-status" className="break-words pl-[25px] text-[13px] text-ink-mute">{text}</p>;
}

/** Customer details: the scored groups not on Google yet (null: not known). */
function missingParts(check: CheckResult): string[] | null {
  const parts = (check.meta?.parts ?? "").split(",").filter(Boolean);
  if (check.meta?.present === undefined || parts.length === 0) return null;
  const present = new Set(check.meta.present.split(",").filter(Boolean));
  return parts.filter((p) => !present.has(p));
}

/** "parking & accessibility" / "estacionamiento y accesibilidad". */
function partList(parts: string[], locale: Locale): string {
  const names = parts.map((p) => t(locale, `content.checks.completeness.customer_details.partLabel.${p}` as MessageKey).toLowerCase());
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} ${t(locale, "dashboard.breakdown.and")} ${names[names.length - 1]}`;
}

