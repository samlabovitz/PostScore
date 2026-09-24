"use client";

import { ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconUsers, IconChevronDown, IconRefresh } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { GradeBadge } from "@/components/ui/GradeBadge";
import { ScoreGauge } from "@/components/ui/ScoreGauge";
import { StatTile } from "@/components/ui/StatTile";
import { CategoryCard, formatPoints } from "@/components/scoring/CategoryCard";
import { cn } from "@/lib/utils";
import { rescanBusiness } from "@/app/actions/scoring";
import type { BusinessRecord, ScoreHistoryRow, ScoreSnapshot } from "@/app/actions/scoring";
import { diffProfileSnapshots, type ProfileSnapshot } from "@/lib/profileChanges";
import { formatOpeningHours } from "@/lib/hours";
import { t, tPlural, useLocale, type Locale } from "@/lib/i18n";
import {
  GRADE_THRESHOLDS,
  type CategoryResult,
  type CheckResult,
  type Grade,
  type ScoreBreakdown,
  type ScoreWithSuggestions,
} from "@/lib/scoring";
import { AssistantLauncher } from "@/components/assistant/AssistantLauncher";
import type { AssistantBusinessContext } from "@/lib/assistant";
import { LocalBenchmarkTile } from "@/components/dashboard/LocalBenchmarkTile";
import type { GetLocalBenchmarkResult } from "@/app/actions/competitors";
import { LiveListingSection } from "@/components/gbp/LiveListingSection";

function formatSignedPoints(value: number): string {
  return value > 0 ? `+${formatPoints(value)}` : formatPoints(value);
}

/** Category's own 0–100 relative score, rendered as a labeled progress
 * bar — green once a category is scoring strong, amber while there's
 * real room to improve. Every number here (earned/possible points,
 * percentage) is read straight off the real breakdown; no category is
 * invented and no bar is drawn for a category with no determinable
 * checks. */
function CategoryProgressRow({ category }: { category: CategoryResult }) {
  const locale = useLocale();
  const pct = category.relativeScore;
  const strong = pct !== null && pct >= 80;

  return (
    <div className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">{category.label}</span>
        <span className="text-sm tabular-nums text-ink-soft">
          {formatPoints(category.earnedPoints)} / {formatPoints(category.possiblePoints)}{" "}
          {t(locale, "dashboard.website.ptsAbbrev")}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-paper-deep">
        {pct !== null && (
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]",
              strong ? "bg-green" : "bg-amber"
            )}
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        )}
      </div>
      {pct === null && (
        <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.overview.categoryNotDeterminable")}</p>
      )}
    </div>
  );
}

/** One honest sentence summarizing a completed re-scan — every number in
 * it comes straight from the real reconciliation/diff the scan just ran,
 * never a generic "Done!". A scan that genuinely found nothing new says
 * so plainly, rather than a silent or ambiguous success. */
function summarizeRescan(
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

/**
 * The real "Re-scan now" trigger — the one manual entry point into
 * rescanBusiness() (app/actions/scoring.ts), which live-refetches this
 * business from Google, re-scores it, reconciles pending-verification
 * tasks against the fresh data, and diffs the listing for real changes.
 * One click, one Google Places call — never looped, never scheduled
 * here (see that function's own doc comment for how a future automatic
 * cadence could call the same function).
 */
function RescanControl({ businessId }: { businessId: string }) {
  const router = useRouter();
  const locale = useLocale();
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "scanning" }
    | { kind: "done"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleRescan() {
    setState({ kind: "scanning" });
    const result = await rescanBusiness(businessId);
    if (result.status === "ok") {
      setState({
        kind: "done",
        message: summarizeRescan(
          result.tasksConfirmed,
          result.pointsConfirmed,
          result.tasksReopened,
          result.changes.length,
          locale
        ),
      });
      router.refresh();
    } else if (result.status === "no_results") {
      setState({
        kind: "error",
        message: t(locale, "dashboard.overview.rescanNoResultsError"),
      });
    } else if (result.status === "error") {
      setState({ kind: "error", message: result.message });
    } else {
      setState({ kind: "error", message: t(locale, "dashboard.overview.rescanErrorFallback") });
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="brass" size="sm" onClick={handleRescan} disabled={state.kind === "scanning"}>
        <IconRefresh size={14} className={cn(state.kind === "scanning" && "animate-spin")} />
        {state.kind === "scanning"
          ? t(locale, "dashboard.overview.rescanning")
          : t(locale, "dashboard.overview.rescanNow")}
      </Button>
      {state.kind === "done" && <span className="text-sm text-green">{state.message}</span>}
      {state.kind === "error" && <span className="text-sm text-red">{state.message}</span>}
    </div>
  );
}

/** The label range for a grade — e.g. "90–100" for A, "60–69" for D —
 * derived directly from the real GRADE_THRESHOLDS the engine grades
 * against, never a hand-copied number that could drift out of sync. */
function gradeRangeLabel(index: number): string {
  const t = GRADE_THRESHOLDS[index];
  if (index === 0) return `${t.min}–100`;
  return `${t.min}–${GRADE_THRESHOLDS[index - 1].min - 1}`;
}

/** Wraps the grade badge so clicking it opens a short, honest explainer
 * of what each letter grade actually means — the real ranges the
 * scoring engine uses, not a guess. */
function GradeExplainer({ grade }: { grade: Grade }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t(locale, "dashboard.overview.gradeMeaningAriaLabel")}
        className="rounded-lg transition-opacity hover:opacity-80"
      >
        <GradeBadge grade={grade} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-60 rounded-xl border border-paper-deep bg-white p-4 shadow-card">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
            {t(locale, "dashboard.overview.gradeRangesHeading")}
          </div>
          <div className="flex flex-col gap-1.5">
            {GRADE_THRESHOLDS.map((t, i) => (
              <div
                key={t.grade}
                className={cn(
                  "flex items-center justify-between text-sm",
                  t.grade === grade ? "font-semibold text-ink" : "text-ink-soft"
                )}
              >
                <span>{t.grade}</span>
                <span className="tabular-nums">{gradeRangeLabel(i)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** "+N since last scan," derived from the two most recent rows in the
 * real scores table. With fewer than two scans there's genuinely
 * nothing to compare yet, so it says so rather than showing a fake 0
 * or hiding the control entirely. Clicking it reveals the real recent
 * scan history it was computed from. */
function SinceLastScanControl({ history }: { history: ScoreHistoryRow[] }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  if (history.length < 2) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[.05] p-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-brass">
          {t(locale, "dashboard.overview.sinceLastScanLabel")}
        </div>
        <div className="mt-1.5 text-sm text-white/70">{t(locale, "dashboard.overview.trackingStartsNow")}</div>
      </div>
    );
  }

  const [latest, previous] = history;
  const delta = latest.total - previous.total;
  const deltaColor = delta > 0 ? "text-green" : delta < 0 ? "text-red" : "text-white";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full rounded-xl border border-white/10 bg-white/[.05] p-4 text-left hover:border-white/20"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-brass">
            {t(locale, "dashboard.overview.sinceLastScanLabel")}
          </span>
          <IconChevronDown
            size={14}
            className={cn("shrink-0 text-white/50 transition-transform", open && "rotate-180")}
          />
        </div>
        <div className={cn("mt-1 font-serif text-2xl font-bold", deltaColor)}>
          {delta === 0 ? t(locale, "dashboard.overview.noChange") : formatSignedPoints(delta)}
        </div>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-xl border border-paper-deep bg-white p-3 shadow-card">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
            {t(locale, "dashboard.overview.recentScansHeading")}
          </div>
          <div className="flex flex-col divide-y divide-paper-line">
            {history.slice(0, 6).map((row) => (
              <div key={row.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink-soft">{new Date(row.created_at).toLocaleDateString()}</span>
                <span className="font-medium text-ink">
                  {row.total} · {row.grade}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ListingField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-paper-line py-3 last:border-b-0">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        {label}
      </span>
      <span className="text-sm text-ink">{value}</span>
    </div>
  );
}

/** The real saved Google listing data — every field either shows what
 * Google actually returned or honestly says "Not available." No field
 * is guessed or left blank without explanation. */
function ListingCard({ business }: { business: BusinessRecord }) {
  const locale = useLocale();
  const notAvailable = <span className="italic text-ink-mute">{t(locale, "dashboard.common.notAvailable")}</span>;
  // Only Spanish tries the localized lines — English businesses keep
  // reading the stored opening_hours weekday descriptions exactly as
  // before, so English output stays byte-identical. formatOpeningHours
  // itself falls back to null (and so, below, to opening_hours) whenever
  // the structured data is missing or doesn't parse.
  const localizedHours =
    locale === "es" ? formatOpeningHours(business.opening_hours_periods, locale) : null;
  const hoursLines = localizedHours ?? business.opening_hours;
  return (
    <Card className="p-5">
      <div className="flex flex-col divide-y divide-paper-line">
        <ListingField label={t(locale, "dashboard.common.addressLabel")} value={business.address ?? notAvailable} />
        <ListingField label={t(locale, "dashboard.common.phoneLabel")} value={business.phone ?? notAvailable} />
        <ListingField
          label={t(locale, "dashboard.overview.hoursLabel")}
          value={
            hoursLines && hoursLines.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {hoursLines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </div>
            ) : (
              notAvailable
            )
          }
        />
        <ListingField
          label={t(locale, "dashboard.common.ratingLabel")}
          value={business.rating !== null ? `${business.rating.toFixed(1)} ★` : notAvailable}
        />
        <ListingField
          label={t(locale, "dashboard.common.reviewsLabel")}
          value={business.review_count !== null ? business.review_count.toLocaleString() : notAvailable}
        />
        <ListingField
          label={t(locale, "dashboard.common.websiteLabel")}
          value={
            business.website ? (
              <a
                href={business.website}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brass hover:underline"
              >
                {business.website}
              </a>
            ) : (
              notAvailable
            )
          }
        />
        {business.google_maps_uri && (
          <ListingField
            label={t(locale, "dashboard.overview.googleMapsLabel")}
            value={
              <a
                href={business.google_maps_uri}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brass hover:underline"
              >
                {t(locale, "dashboard.overview.viewOnGoogleMaps")}
              </a>
            }
          />
        )}
      </div>
    </Card>
  );
}

interface CheckChange {
  check: CheckResult;
  fromPoints: number | null;
  toPoints: number | null;
}

/** Pure diff between two real, previously-saved breakdowns — only
 * checks whose earned points or confidence actually changed, sorted by
 * the size of the change. Never inferred or estimated. */
function diffBreakdowns(previous: ScoreBreakdown, current: ScoreBreakdown): CheckChange[] {
  const changes: CheckChange[] = [];
  for (const check of current.checks) {
    const prevCheck = previous.checks.find((c) => c.id === check.id);
    if (!prevCheck) continue;
    if (prevCheck.earnedPoints !== check.earnedPoints || prevCheck.confidence !== check.confidence) {
      changes.push({ check, fromPoints: prevCheck.earnedPoints, toPoints: check.earnedPoints });
    }
  }
  return changes.sort((a, b) => {
    const deltaA = Math.abs((a.toPoints ?? 0) - (a.fromPoints ?? 0));
    const deltaB = Math.abs((b.toPoints ?? 0) - (b.fromPoints ?? 0));
    return deltaB - deltaA;
  });
}

/** What changed between the two most recent saved scans, check by
 * check. With fewer than two scans, or a scoring-version change between
 * them (where a point-for-point comparison would be misleading), it
 * says so honestly instead of guessing. */
function ChangesFeed({ snapshots }: { snapshots: ScoreSnapshot[] }) {
  const locale = useLocale();

  if (snapshots.length < 2) {
    return (
      <Card className="p-5 text-sm text-ink-soft">{t(locale, "dashboard.overview.noPriorScanChanges")}</Card>
    );
  }

  const [current, previous] = snapshots;

  if (current.scoring_version !== previous.scoring_version) {
    return (
      <Card className="p-5 text-sm text-ink-soft">
        {t(locale, "dashboard.overview.scoringUpdatedBetweenScans", {
          previous: previous.scoring_version,
          current: current.scoring_version,
        })}
      </Card>
    );
  }

  const changes = diffBreakdowns(previous.breakdown_json, current.breakdown_json);

  if (changes.length === 0) {
    return (
      <Card className="p-5 text-sm text-ink-soft">{t(locale, "dashboard.overview.nothingChangedSinceLastScan")}</Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col divide-y divide-paper-line">
        {changes.slice(0, 8).map(({ check, fromPoints, toPoints }) => {
          const delta = fromPoints !== null && toPoints !== null ? toPoints - fromPoints : null;
          return (
            <div
              key={check.id}
              className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <div className="text-sm font-medium text-ink">{check.label}</div>
                <div className="mt-0.5 text-[12px] text-ink-mute">{check.explanation}</div>
              </div>
              {delta !== null ? (
                <Pill
                  variant={delta > 0 ? "green" : delta < 0 ? "red" : "neutral"}
                  className="shrink-0"
                >
                  {formatSignedPoints(delta)} {t(locale, "dashboard.website.ptsAbbrev")}
                </Pill>
              ) : (
                <Pill variant="neutral" className="shrink-0">
                  {t(locale, "dashboard.overview.updatedPillLabel")}
                </Pill>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Real changes to the business's own Google listing (hours, phone,
 * website, categories, photos, rating, reviews, status) between the two
 * most recent scans — see diffProfileSnapshots in lib/profileChanges.ts.
 * Distinct from ChangesFeed above: this reports what actually changed on
 * the real-world listing, not the resulting score-point deltas. Honest
 * at every branch: fewer than two scans, or either scan predating
 * profile-snapshot tracking, says so plainly rather than guessing; zero
 * real differences says so too, rather than showing nothing at all. */
function ListingChangesFeed({ snapshots }: { snapshots: ScoreSnapshot[] }) {
  const locale = useLocale();

  if (snapshots.length < 2) {
    return (
      <Card className="p-5 text-sm text-ink-soft">
        {t(locale, "dashboard.overview.noPriorScanListingChanges")}
      </Card>
    );
  }

  const [current, previous] = snapshots;

  if (!current.profile_snapshot_json || !previous.profile_snapshot_json) {
    return (
      <Card className="p-5 text-sm text-ink-soft">
        {t(locale, "dashboard.overview.predatesListingTracking")}
      </Card>
    );
  }

  const changes = diffProfileSnapshots(
    previous.profile_snapshot_json as ProfileSnapshot,
    current.profile_snapshot_json as ProfileSnapshot,
    locale
  );

  if (changes.length === 0) {
    return (
      <Card className="p-5 text-sm text-ink-soft">
        {t(locale, "dashboard.overview.nothingChangedOnListing")}
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col divide-y divide-paper-line">
        {changes.map((change) => (
          <div key={change.field} className="py-2.5 text-sm text-ink first:pt-0 last:pb-0">
            {change.description}
          </div>
        ))}
      </div>
    </Card>
  );
}

export type AssistantEmbedData =
  | {
      status: "ok";
      context: AssistantBusinessContext;
      starterPrompts: string[];
      conversationCount: number;
    }
  | { status: "unavailable"; message: string };

export function BusinessScoreView({
  businessId,
  business,
  result,
  history,
  recentSnapshots,
  assistant,
  benchmark,
  gbpConnected,
}: {
  businessId: string;
  business: BusinessRecord;
  result: ScoreWithSuggestions;
  history: ScoreHistoryRow[];
  recentSnapshots: ScoreSnapshot[];
  assistant: AssistantEmbedData;
  benchmark: GetLocalBenchmarkResult;
  gbpConnected: boolean;
}) {
  const locale = useLocale();
  const { breakdown, projectedBreakdown } = result;

  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">
            {business.name ?? t(locale, "dashboard.overview.untitledBusiness")}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {business.address ?? t(locale, "dashboard.overview.noAddressOnFile")}
          </p>
          <p className="mt-1 text-xs text-ink-mute">
            {t(locale, "dashboard.overview.scoringVersionNote", { version: breakdown.scoringVersion })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/business/${businessId}/competitors`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-paper-deep bg-white px-[15px] py-[7px] text-[13px] font-medium text-ink hover:border-ink-soft"
          >
            <IconUsers size={15} />
            {t(locale, "dashboard.overview.viewCompetitors")}
          </Link>
          <RescanControl businessId={businessId} />
        </div>
      </div>

      <SectionHeading title={t(locale, "dashboard.overview.currentScoreHeading")} />
      <div className="rounded-2xl bg-gradient-to-br from-[#1c2f4c] to-[#111f34] p-5 shadow-card sm:p-6 nav:p-8">
        <div className="grid grid-cols-1 items-center gap-6 nav:grid-cols-[auto_1fr_1fr_1fr] nav:gap-6">
          <ScoreGauge score={breakdown.total} className="mx-auto nav:mx-0" />
          <div className="flex items-center gap-3">
            <GradeExplainer grade={breakdown.grade} />
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#9FB0C7]">
                {t(locale, "dashboard.overview.gradeLabel")}
              </div>
              <div className="text-sm text-white/70">{breakdown.total} / 100</div>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[.05] p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-brass">
              {t(locale, "dashboard.overview.projectedLabel")}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-serif text-2xl font-bold text-white">
                {projectedBreakdown.total}
              </span>
              <span className="text-sm text-white/60">
                {t(locale, "dashboard.overview.scoreOutOf100WithGrade", { grade: projectedBreakdown.grade })}
              </span>
            </div>
            <Link
              href={`/business/${businessId}/growth`}
              className="mt-2 inline-block text-[12px] font-medium text-brass hover:underline"
            >
              {t(locale, "dashboard.overview.seeActionPlan")}
            </Link>
          </div>
          <SinceLastScanControl history={history} />
        </div>
      </div>

      {assistant.status === "ok" ? (
        <AssistantLauncher
          businessId={businessId}
          businessName={business.name}
          context={assistant.context}
          starterPrompts={assistant.starterPrompts}
          conversationCount={assistant.conversationCount}
        />
      ) : (
        <Card className="p-5 text-sm text-ink-soft">
          {t(locale, "dashboard.overview.assistantUnavailablePrefix", { message: assistant.message })}
        </Card>
      )}

      <SectionHeading title={t(locale, "dashboard.overview.atAGlanceHeading")} />
      <Card className="p-5">
        <div className="grid grid-cols-2 gap-6 sm:w-fit sm:grid-cols-3 sm:gap-10">
          <StatTile
            label={t(locale, "dashboard.overview.googleRatingLabel")}
            value={business.rating === null ? "—" : `${business.rating.toFixed(1)} ★`}
          />
          <StatTile
            label={t(locale, "dashboard.overview.googleReviewsLabel")}
            value={business.review_count === null ? "—" : business.review_count.toLocaleString()}
          />
          <LocalBenchmarkTile businessId={businessId} result={benchmark} />
        </div>
      </Card>

      <SectionHeading title={t(locale, "dashboard.overview.businessListingHeading")} />
      <ListingCard business={business} />

      <SectionHeading title={t(locale, "dashboard.overview.liveListingHeading")} />
      <LiveListingSection businessId={businessId} connected={gbpConnected} />

      <SectionHeading title={t(locale, "dashboard.overview.whatChangedHeading")} />
      <ListingChangesFeed snapshots={recentSnapshots} />

      <SectionHeading title={t(locale, "dashboard.overview.scoreImpactHeading")} />
      <ChangesFeed snapshots={recentSnapshots} />

      <SectionHeading title={t(locale, "dashboard.overview.wherePointsAreHeading")} />
      <Card className="p-5">
        <div className="flex flex-col divide-y divide-paper-line">
          {breakdown.categories.map((category) => (
            <CategoryProgressRow key={category.id} category={category} />
          ))}
        </div>
      </Card>

      <SectionHeading title={t(locale, "dashboard.overview.detailedChecksHeading")} />
      <div className="grid grid-cols-1 gap-4 nav:grid-cols-3">
        {breakdown.categories.map((category) => (
          <CategoryCard key={category.id} category={category} />
        ))}
      </div>

      <SectionHeading title={t(locale, "dashboard.overview.scanHistoryHeading")} />
      <Card className="p-5">
        {history.length === 0 ? (
          <p className="text-sm text-ink-soft">
            {t(locale, "dashboard.overview.noSavedScans", {
              rescanNow: t(locale, "dashboard.overview.rescanNow"),
            })}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-mute">
                <th className="pb-2 font-medium">{t(locale, "dashboard.overview.dateColumn")}</th>
                <th className="pb-2 font-medium">{t(locale, "dashboard.overview.scoreColumn")}</th>
                <th className="pb-2 font-medium">{t(locale, "dashboard.overview.gradeColumn")}</th>
                <th className="pb-2 font-medium">{t(locale, "dashboard.overview.versionColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} className="border-t border-paper-line">
                  <td className="py-2 text-ink">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 text-ink">{row.total}</td>
                  <td className="py-2 text-ink">{row.grade}</td>
                  <td className="py-2 text-ink-mute">{row.scoring_version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
