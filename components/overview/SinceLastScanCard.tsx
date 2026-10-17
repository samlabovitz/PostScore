"use client";

// "Since your last scan": the score before → after, what changed on the
// Google listing, and which checks went up or down — all from the two
// most recent SAVED scans. Honest at every step: fewer than two scans,
// a scan that predates listing tracking, or a scoring-version change
// (no point-for-point delta then) each say so instead of guessing.
//
// Both scans' check text was frozen in whatever language was live when
// they ran, so check labels/explanations are re-resolved in the current
// locale (resolveChangeDisplay — see lib/scoreChanges.ts).

import Link from "next/link";
import {
  IconArrowDownRight,
  IconArrowRight,
  IconArrowUpRight,
  IconCategory,
  IconClock,
  IconMessageCircle,
  IconMinus,
  IconPhone,
  IconPhoto,
  IconStar,
  IconWorld,
  IconBuildingStore,
} from "@tabler/icons-react";
import type { ScoreSnapshot } from "@/app/actions/scoring";
import { formatPoints } from "@/components/scoring/CategoryCard";
import { diffProfileSnapshots, type ProfileChange, type ProfileSnapshot } from "@/lib/profileChanges";
import { diffBreakdowns, resolveChangeDisplay } from "@/lib/scoreChanges";
import type { ScoreBreakdown } from "@/lib/scoring";
import { formatShortDate, t, useLocale, useTimeZone } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const MAX_CHECK_ROWS = 8;

const FIELD_ICON: Record<ProfileChange["field"], typeof IconStar> = {
  phone: IconPhone,
  website: IconWorld,
  hours: IconClock,
  categories: IconCategory,
  photos: IconPhoto,
  rating: IconStar,
  reviews: IconMessageCircle,
  status: IconBuildingStore,
};

function signed(n: number): string {
  return n > 0 ? `+${formatPoints(n)}` : n < 0 ? `−${formatPoints(Math.abs(n))}` : "0";
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-soft">{children}</h3>;
}

export function SinceLastScanCard({
  businessId,
  snapshots,
  liveBreakdown,
}: {
  businessId: string;
  /** Newest first — the two most recent saved scans. */
  snapshots: ScoreSnapshot[];
  liveBreakdown: ScoreBreakdown;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [current, previous] = snapshots;
  const reportsLink = (
    <Link
      href={`/business/${businessId}/reports`}
      className="inline-flex w-fit items-center gap-1 border-t border-paper-line pt-3 text-[13px] font-semibold text-ink hover:text-brass"
    >
      {t(locale, "dashboard.overview.sinceCard.reportsLink")}
      <IconArrowRight size={14} />
    </Link>
  );

  if (!current || !previous) {
    // No prior scan: the message and the Reports link sit together,
    // centered in the card — no gap between them.
    return (
      <section className="flex h-full flex-col gap-3 rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
        <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.overview.sinceCard.heading")}</h2>
        <div className="flex flex-1 flex-col justify-center gap-3">
          <p className="text-sm text-ink-soft">{t(locale, "dashboard.overview.noPriorScanChanges")}</p>
          {reportsLink}
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col gap-3 rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.overview.sinceCard.heading")}</h2>

      {/* Equal height with Top recommendations: if this side is
          shorter, its content centers rather than leaving a gap. */}
      <div className="flex flex-1 flex-col justify-center gap-3">
        <ScoreBeforeAfter current={current} previous={previous} timeZone={timeZone} />

        <div className="flex flex-col gap-2">
          <SubHeading>{t(locale, "dashboard.overview.sinceCard.listingHeading")}</SubHeading>
          <ListingChanges current={current} previous={previous} />
        </div>

        {/* A scoring-version change has no point-for-point comparison;
            the one note above already says so — no second message. */}
        {current.scoring_version === previous.scoring_version && (
          <div className="flex flex-col gap-2">
            <SubHeading>{t(locale, "dashboard.overview.sinceCard.checksHeading")}</SubHeading>
            <CheckChanges current={current} previous={previous} liveBreakdown={liveBreakdown} />
          </div>
        )}
      </div>

      {reportsLink}
    </section>
  );
}

function ScoreBeforeAfter({ current, previous, timeZone }: { current: ScoreSnapshot; previous: ScoreSnapshot; timeZone: string }) {
  const locale = useLocale();
  const sameVersion = current.scoring_version === previous.scoring_version;
  const delta = current.total - previous.total;
  const Icon = delta > 0 ? IconArrowUpRight : delta < 0 ? IconArrowDownRight : IconMinus;
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-paper px-4 py-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex flex-col">
          <span className="text-[11.5px] text-ink-soft">
            {t(locale, "dashboard.overview.sinceCard.lastScan", { date: formatShortDate(previous.created_at, locale, timeZone) })}
          </span>
          <span className="font-serif text-[28px] font-semibold leading-none tabular-nums text-ink-soft">{previous.total}</span>
        </div>
        <IconArrowRight size={20} className="mb-1 text-brass" aria-hidden />
        <div className="flex flex-col">
          <span className="text-[11.5px] text-ink-soft">{t(locale, "dashboard.overview.sinceCard.now")}</span>
          <span className="font-serif text-[28px] font-bold leading-none tabular-nums text-ink">{current.total}</span>
        </div>
        {sameVersion && (
          <span
            className={cn(
              "mb-0.5 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[12.5px] font-semibold",
              delta > 0 ? "text-green" : delta < 0 ? "text-red" : "text-ink-soft"
            )}
          >
            <Icon size={14} aria-hidden />
            {delta === 0 ? t(locale, "dashboard.overview.noChange") : signed(delta)}
          </span>
        )}
      </div>
      {!sameVersion && <p className="text-[12.5px] leading-snug text-ink">{t(locale, "dashboard.overview.scoringUpdatedBetweenScans")}</p>}
    </div>
  );
}

function ListingChanges({ current, previous }: { current: ScoreSnapshot; previous: ScoreSnapshot }) {
  const locale = useLocale();
  if (!current.profile_snapshot_json || !previous.profile_snapshot_json) {
    return <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.overview.predatesListingTracking")}</p>;
  }
  const changes = diffProfileSnapshots(previous.profile_snapshot_json as ProfileSnapshot, current.profile_snapshot_json as ProfileSnapshot, locale);
  if (changes.length === 0) return <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.overview.nothingChangedOnListing")}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {changes.map((change) => {
        const Icon = FIELD_ICON[change.field];
        return (
          <li key={change.field} className="inline-flex max-w-full items-start gap-1.5 rounded-lg border border-paper-deep bg-paper px-2.5 py-1.5 text-[12.5px] leading-snug text-ink">
            <Icon size={14} className="mt-0.5 shrink-0 text-brass" aria-hidden />
            <span>{change.description}</span>
          </li>
        );
      })}
    </ul>
  );
}

function CheckChanges({ current, previous, liveBreakdown }: { current: ScoreSnapshot; previous: ScoreSnapshot; liveBreakdown: ScoreBreakdown }) {
  const locale = useLocale();
  const changes = diffBreakdowns(previous.breakdown_json, current.breakdown_json);
  if (changes.length === 0) return <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.overview.nothingChangedSinceLastScan")}</p>;
  return (
    <ul className="flex flex-col divide-y divide-paper-line">
      {changes.slice(0, MAX_CHECK_ROWS).map(({ check, fromPoints, toPoints, methodChanged }) => {
        // A method change confounds the delta (HOW speed was measured
        // changed) — never imply the business itself got faster/slower.
        const delta = !methodChanged && fromPoints !== null && toPoints !== null ? toPoints - fromPoints : null;
        const { label, explanation } = resolveChangeDisplay(check, liveBreakdown, locale);
        return (
          <li key={check.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium text-ink">{label}</div>
              <div className="mt-0.5 text-[12px] text-ink-soft">
                {methodChanged ? t(locale, "dashboard.overview.speedMeasurementMethodChanged") : explanation}
              </div>
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold",
                delta === null ? "bg-[color:color-mix(in_srgb,var(--color-ink)_5%,transparent)] text-ink-soft" : delta > 0 ? "bg-[color:color-mix(in_srgb,var(--color-green)_10%,transparent)] text-green" : delta < 0 ? "bg-[color:color-mix(in_srgb,var(--color-red)_10%,transparent)] text-red" : "bg-[color:color-mix(in_srgb,var(--color-ink)_5%,transparent)] text-ink-soft"
              )}
            >
              {delta === null ? (
                t(locale, "dashboard.overview.updatedPillLabel")
              ) : (
                <>
                  {delta > 0 ? <IconArrowUpRight size={13} aria-hidden /> : delta < 0 ? <IconArrowDownRight size={13} aria-hidden /> : null}
                  {signed(delta)} {t(locale, "dashboard.website.ptsAbbrev")}
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
