"use client";

import { IconAlertTriangle, IconCheck, IconMinus, IconX } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { formatPoints } from "@/components/scoring/CategoryCard";
import { cn } from "@/lib/utils";
import {
  gradeFromTotal,
  type CategoryResult,
  type CheckResult,
  type Grade,
  type Suggestion,
  type WebsiteAnalysis,
} from "@/lib/scoring";
import { t, tPlural, useLocale, type MessageKey } from "@/lib/i18n";

/** "Infrastructure" checks first, "what's actually on the page" checks
 * second — a deliberate, honest-only grouping (no check is invented or
 * moved out of its real category, this just orders the same live
 * checks for scanning). */
const TECHNICAL_CHECK_IDS = ["website.has_website", "website.https", "website.performance_mobile"];
const CONTENT_CHECK_IDS = ["website.content_depth", "website.contact_conversion"];

/** Four visual states from the same real data, not a new taxonomy: a
 * check is "excluded" whenever it isn't confidently determined
 * (NOT_FOUND/UNCERTAIN, earnedPoints null — PageSpeed couldn't score it,
 * a JS-rendered site we couldn't fully read, etc.); otherwise it's
 * "full"/"partial"/"zero" purely from its own real earnedPoints vs
 * maxPoints. "partial" exists so a real, mostly-good result (e.g. a
 * client-rendered site where PageSpeed recovered title/meta/headings but
 * content depth still isn't credited) reads as the partial credit it
 * honestly is, rather than being forced into either "passed" or "failed"
 * — the one non-negotiable rule the three required states still enforce
 * is that "excluded" never renders red and never claims a zero. */
type RowState = "full" | "partial" | "zero" | "excluded";

function deriveRowState(check: CheckResult): RowState {
  const determinable = check.confidence === "VERIFIED" || check.confidence === "LIKELY";
  if (!determinable || check.earnedPoints === null) return "excluded";
  if (check.earnedPoints >= check.maxPoints) return "full";
  if (check.earnedPoints <= 0) return "zero";
  return "partial";
}

const ROW_STYLES: Record<RowState, { icon: typeof IconCheck; iconWrap: string; bar: string | null; points: string }> = {
  full: { icon: IconCheck, iconWrap: "bg-green/10 text-green", bar: "bg-green", points: "text-green" },
  partial: { icon: IconAlertTriangle, iconWrap: "bg-amber/10 text-amber", bar: "bg-amber", points: "text-amber" },
  zero: { icon: IconX, iconWrap: "bg-red/10 text-red", bar: "bg-red", points: "text-red" },
  excluded: { icon: IconMinus, iconWrap: "bg-ink/5 text-ink-mute", bar: null, points: "text-ink-mute" },
};

/** A single real presence/absence chip — used only for signals PageSpeed
 * itself confirmed on a client-rendered site's real rendered DOM (see
 * RenderedContentSignals in lib/scoring.ts). true/false is a genuine
 * Lighthouse-confirmed fact (green/red); null means that specific audit
 * wasn't in the response — shown neutral, never guessed. */
function SignalChip({ label, value }: { label: MessageKey; value: boolean | null }) {
  const locale = useLocale();
  const Icon = value === true ? IconCheck : value === false ? IconX : IconMinus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        value === true ? "bg-green/10 text-green" : value === false ? "bg-red/10 text-red" : "bg-ink/5 text-ink-mute"
      )}
    >
      <Icon size={11} />
      {t(locale, label)}
    </span>
  );
}

function CheckRow({
  check,
  suggestion,
  websiteAnalysis,
}: {
  check: CheckResult;
  suggestion: Suggestion | undefined;
  websiteAnalysis: WebsiteAnalysis | null;
}) {
  const locale = useLocale();
  const state = deriveRowState(check);
  const style = ROW_STYLES[state];
  const Icon = style.icon;
  const fillPct =
    state === "excluded" || check.earnedPoints === null
      ? 0
      : Math.max(0, Math.min(100, (check.earnedPoints / check.maxPoints) * 100));

  // Real, previously-invisible detail worth its own small fact instead of
  // staying buried in prose — only rendered where the real data exists.
  const performanceScore =
    check.id === "website.performance_mobile" ? websiteAnalysis?.mobilePerformanceScore ?? null : null;
  const recovered =
    check.id === "website.content_depth" ? websiteAnalysis?.content?.renderedContentSignals ?? null : null;

  return (
    <div className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full", style.iconWrap)}>
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-sm font-medium text-ink">{check.label}</span>
          <span className={cn("shrink-0 text-sm font-semibold tabular-nums", style.points)}>
            {state === "excluded" ? "—" : formatPoints(check.earnedPoints)} / {check.maxPoints}
          </span>
        </div>

        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-paper-deep">
          {style.bar && (
            <div
              className={cn("h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]", style.bar)}
              style={{ width: `${fillPct}%` }}
            />
          )}
        </div>

        <p className="mt-2 text-[13px] text-ink-soft">
          {state === "excluded" && (
            <span className="mr-1.5 font-medium text-ink-mute">
              {t(locale, "dashboard.website.couldntVerifyPrefix")}
            </span>
          )}
          {check.explanation}
        </p>

        {(state === "partial" || state === "zero") && suggestion && (
          <p className="mt-1 text-[12.5px] text-ink-mute">{suggestion.advice}</p>
        )}

        {performanceScore !== null && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-paper px-2 py-1 text-[11.5px] font-medium text-ink-soft">
              {t(locale, "dashboard.website.lighthouseScoreLabel")}
              <span className="font-semibold text-ink">{performanceScore}/100</span>
            </span>
          </div>
        )}

        {recovered && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <SignalChip label="dashboard.website.signalTitle" value={recovered.hasTitle} />
            <SignalChip label="dashboard.website.signalMeta" value={recovered.hasMetaDescription} />
            <SignalChip label="dashboard.website.signalViewport" value={recovered.hasViewportTag} />
            <SignalChip label="dashboard.website.signalHeadings" value={recovered.hasHeadings} />
          </div>
        )}
      </div>
    </div>
  );
}

function WebsiteScoreRing({ relativeScore, grade }: { relativeScore: number | null; grade: Grade | null }) {
  const locale = useLocale();
  const size = 100;
  const viewBox = 120;
  const radius = 50;
  const strokeWidth = 11;
  const circumference = 2 * Math.PI * radius;
  const pct = relativeScore === null ? null : Math.max(0, Math.min(100, relativeScore));
  const offset = pct === null ? circumference : circumference * (1 - pct / 100);
  const strokeColor =
    grade === "A" || grade === "B"
      ? "var(--color-green)"
      : grade === "C" || grade === "D"
        ? "var(--color-amber)"
        : grade === "F"
          ? "var(--color-red)"
          : "var(--color-ink-mute)";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${viewBox} ${viewBox}`} width={size} height={size} className="-rotate-90">
        <circle cx={viewBox / 2} cy={viewBox / 2} r={radius} strokeWidth={strokeWidth} fill="none" className="stroke-paper-deep" />
        {pct !== null && (
          <circle
            cx={viewBox / 2}
            cy={viewBox / 2}
            r={radius}
            strokeWidth={strokeWidth}
            fill="none"
            stroke={strokeColor}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-serif text-[24px] font-bold leading-none text-ink">{pct === null ? "—" : Math.round(pct)}</div>
        <div className="mt-0.5 text-[10px] text-ink-mute">{t(locale, "dashboard.website.outOf100")}</div>
      </div>
    </div>
  );
}

/**
 * The one, merged "how is your Website score built" section — replaces
 * what used to be two separate, drifting-risk views (a prose "findings"
 * list next to the screenshot, and a separate numeric "Score breakdown"
 * card): both read the exact same live websiteCategory
 * (scoreBusiness()'s real CategoryResult for "website"), so there's only
 * ever one set of numbers to keep in sync. Grouped into Technical
 * (infrastructure: has a website, HTTPS, performance) and Content &
 * contact (what's actually on the page) purely for scanning — every
 * check still renders with its own real state, never re-labeled.
 *
 * Three honest states, never collapsed (see RowState): a real pass is
 * green, a real failure is red, and anything PostScore couldn't
 * confidently determine — PageSpeed failing to score, a client-rendered
 * site our static check can't fully read — is neutral gray with an
 * explicit "Couldn't verify" reason, never a red X and never a fabricated
 * zero.
 */
export function WebsiteScoreBreakdown({
  websiteCategory,
  websiteAnalysis,
  websiteSuggestions,
}: {
  websiteCategory: CategoryResult | null;
  websiteAnalysis: WebsiteAnalysis | null;
  websiteSuggestions: Suggestion[];
}) {
  const locale = useLocale();

  if (!websiteCategory) return null;

  const grade = websiteCategory.relativeScore !== null ? gradeFromTotal(websiteCategory.relativeScore) : null;
  // The category's full real ceiling (sum of every check's maxPoints,
  // determinable or not) — possiblePoints below only counts checks we
  // could actually determine, so the gap between the two is exactly how
  // many points are sitting in "couldn't verify" right now, never
  // counted for or against.
  const totalMaxPoints = websiteCategory.checks.reduce((sum, c) => sum + c.maxPoints, 0);
  const excludedPoints = roundToOneDecimal(totalMaxPoints - websiteCategory.possiblePoints);

  const technicalChecks = websiteCategory.checks.filter((c) => TECHNICAL_CHECK_IDS.includes(c.id));
  const contentChecks = websiteCategory.checks.filter((c) => CONTENT_CHECK_IDS.includes(c.id));

  return (
    <div>
      <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        {t(locale, "dashboard.website.scoreHeading")}
      </div>

      <Card className="mb-5 flex flex-col items-start gap-4 nav:flex-row nav:items-center">
        <WebsiteScoreRing relativeScore={websiteCategory.relativeScore} grade={grade} />
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-2xl font-bold text-ink">
              {formatPoints(websiteCategory.earnedPoints)}
            </span>
            <span className="text-sm text-ink-mute">
              / {formatPoints(websiteCategory.possiblePoints)} {t(locale, "dashboard.website.ptsAbbrev")}
            </span>
            {grade && (
              <span
                className={cn(
                  "ml-1 rounded-md px-2 py-0.5 text-[13px] font-bold",
                  grade === "A" || grade === "B"
                    ? "bg-green/10 text-green"
                    : grade === "C" || grade === "D"
                      ? "bg-amber/10 text-amber"
                      : "bg-red/10 text-red"
                )}
              >
                {grade}
              </span>
            )}
          </div>
          <p className="text-[13px] text-ink-soft">
            {excludedPoints > 0
              ? tPlural(locale, "dashboard.website.excludedPoints", excludedPoints)
              : t(locale, "dashboard.website.allVerified")}
          </p>
        </div>
      </Card>

      <div className="flex flex-col gap-5">
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
            {t(locale, "dashboard.website.technicalHeading")}
          </div>
          <Card className="p-5">
            <div className="flex flex-col divide-y divide-paper-line">
              {technicalChecks.map((check) => (
                <CheckRow
                  key={check.id}
                  check={check}
                  suggestion={websiteSuggestions.find((s) => s.checkId === check.id)}
                  websiteAnalysis={websiteAnalysis}
                />
              ))}
            </div>
          </Card>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
            {t(locale, "dashboard.website.contentContactHeading")}
          </div>
          <Card className="p-5">
            <div className="flex flex-col divide-y divide-paper-line">
              {contentChecks.map((check) => (
                <CheckRow
                  key={check.id}
                  check={check}
                  suggestion={websiteSuggestions.find((s) => s.checkId === check.id)}
                  websiteAnalysis={websiteAnalysis}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function roundToOneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}
