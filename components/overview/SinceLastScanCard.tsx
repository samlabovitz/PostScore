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
import { IconMapPin,
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
import type { ProfileChange } from "@/lib/profileChanges";
import { describeScanChanges, type NowValues } from "@/lib/scanChangeText";
import { resolveChangeDisplay } from "@/lib/scoreChanges";
import { checkLabelKey, type ScoreBreakdown } from "@/lib/scoring";
import { formatShortDate, t, useLocale, useTimeZone, type Locale } from "@/lib/i18n";
import { calendarDaysAgo } from "@/lib/i18n/format";
import { isScoringUpdate } from "@/lib/websiteRecheckPolicy";
import { scoreMoves, type ScoreMove } from "@/lib/scanSplit";
import { FixButton } from "@/components/scoring/FixButton";
import { helpSplit } from "@/components/scoring/CategoryCard";
import { cn } from "@/lib/utils";


const FIELD_ICON: Record<ProfileChange["field"], typeof IconStar> = {
  phone: IconPhone,
  website: IconWorld,
  hours: IconClock,
  categories: IconCategory,
  photos: IconPhoto,
  rating: IconStar,
  reviews: IconMessageCircle,
  status: IconBuildingStore,
  name: IconBuildingStore,
  address: IconMapPin,
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
  gbpConnected = false,
  now = {},
}: {
  businessId: string;
  /** Connected owners get exact new-review counts from Business Profile;
   * others see "Review count changed" and how to get them. */
  gbpConnected?: boolean;
  /** Today's rating and review count, shown next to "… changed". */
  now?: NowValues;
  /** Newest first — the two most recent saved scans. */
  snapshots: ScoreSnapshot[];
  liveBreakdown: ScoreBreakdown;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [current, previous] = snapshots;
  const sameVersion = !!current && !!previous && !scoringUpdateBetween(previous, current);
  // Always which checks moved and why; across a scoring update, the earlier scan re-scored under today's rules
  // (lib/scanSplit.ts): the owner's changes first, PostScore's update after.
  // Every check that moved, gains and losses alike, each with its effect on the score (lib/scanSplit.ts) — on the
  // same version and across a scoring update (a check the update started counting is listed too, marked).
  const moves = current && previous ? scoreMoves(previous, current, sameVersion) : null;
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

      {/* Equal height with Top recommendations: content sits at the
          top; any extra height goes above the Reports link. */}
      <div className="flex flex-1 flex-col gap-3">
        <ScoreBeforeAfter current={current} previous={previous} timeZone={timeZone} explained={!!moves?.rescored} />
        {moves && <GainedLost moves={moves} current={current} liveBreakdown={liveBreakdown} businessId={businessId} />}

        <div className="flex flex-col gap-2">
          <SubHeading>{t(locale, "dashboard.overview.sinceCard.listingHeading")}</SubHeading>
          <ListingChanges businessId={businessId} current={current} gbpConnected={gbpConnected} now={now} />
        </div>
      </div>

      {reportsLink}
    </section>
  );
}

/** A scoring update between the two scans (a new version, or a re-score
 * of the same data): the difference is PostScore's, not the owner's. */
function scoringUpdateBetween(previous: ScoreSnapshot, current: ScoreSnapshot): boolean {
  return isScoringUpdate(previous.scoring_version, current.scoring_version, (current.breakdown_json as { scanKind?: string } | null)?.scanKind);
}

/** "Nov 20" this year, "Nov 20, 2025" before it. */
function shortDay(at: string, locale: Locale, timeZone: string): string {
  const full = formatShortDate(at, locale, timeZone);
  return new Date(at).getFullYear() === new Date().getFullYear() ? full.replace(/,? \d{4}$/, "") : full;
}

function ScoreBeforeAfter({ current, previous, timeZone, explained = false }: { current: ScoreSnapshot; previous: ScoreSnapshot; timeZone: string; explained?: boolean }) {
  const locale = useLocale();
  const sameVersion = !scoringUpdateBetween(previous, current);
  // Every move is listed below (gains and losses, the update's marked): never hidden behind one pill.
  const splitShown = !sameVersion && explained;
  const delta = current.total - previous.total;
  const Icon = delta > 0 ? IconArrowUpRight : delta < 0 ? IconArrowDownRight : IconMinus;
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-paper px-4 py-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex flex-col">
          <span className="text-[11.5px] text-ink-soft">
            {t(locale, "dashboard.overview.sinceCard.lastScan", { date: shortDay(previous.created_at, locale, timeZone) })}
          </span>
          <span className="font-serif text-[28px] font-semibold leading-none tabular-nums text-ink-soft">{previous.total}</span>
        </div>
        <IconArrowRight size={20} className="mb-1 text-brass" aria-hidden />
        <div className="flex flex-col">
          {/* The two latest scans: "Previous scan · Nov 20 → Today" (or "Latest scan · Nov 23"). */}
          <span className="text-[11.5px] text-ink-soft">
            {calendarDaysAgo(current.created_at, new Date(), timeZone) === 0 ? t(locale, "dashboard.overview.sinceCard.today") : t(locale, "dashboard.overview.sinceCard.latest", { date: shortDay(current.created_at, locale, timeZone) })}
          </span>
          <span className="font-serif text-[28px] font-bold leading-none tabular-nums text-ink">{current.total}</span>
        </div>
        {!sameVersion && !splitShown && (
          <span data-testid="since-scoring-updated" className="mb-0.5 inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[12.5px] font-semibold text-ink-soft">
            {t(locale, "dashboard.overview.scoreCard.scoringUpdated")}
          </span>
        )}
        {sameVersion && (current.breakdown_json as { scanKind?: string } | null)?.scanKind === "google_connected" && (
          <span data-testid="since-google-connected" className="mb-0.5 inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[12.5px] font-semibold text-ink-soft">
            {t(locale, "dashboard.overview.googleConnectedLabel")}
          </span>
        )}
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
      {!sameVersion && !splitShown && <p className="text-[12.5px] leading-snug text-ink">{t(locale, "dashboard.overview.scoringUpdatedBetweenScans")}</p>}
    </div>
  );
}

/** What changed on the listing, from our own change records (lib/scanChanges.ts):
 * a rating, or (without Business Profile) a review count, says only that
 * it changed, with today's value — never an amount we can't know. */
function ListingChanges({ businessId, current, gbpConnected, now }: { businessId: string; current: ScoreSnapshot; gbpConnected: boolean; now: NowValues }) {
  const locale = useLocale();
  const summary = current.listing_changes;
  if (!summary?.available) {
    return <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.overview.predatesListingTracking")}</p>;
  }
  const changes = describeScanChanges(summary.records, locale, now);
  if (changes.length === 0) return <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.overview.nothingChangedOnListing")}</p>;
  return (
    <>
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
      {!gbpConnected && changes.some((c) => c.field === "reviews") && (
        <Link href={`/business/${businessId}/connect-gbp`} data-testid="since-connect-for-reviews" className="inline-flex w-fit items-center gap-1 text-[12.5px] font-medium text-ink-soft hover:text-brass">
          {t(locale, "dashboard.overview.sinceCard.connectForReviews")}
          <IconArrowRight size={13} aria-hidden />
        </Link>
      )}
    </>
  );
}


const one = (n: number) => Math.round(n * 10) / 10;
const signedOne = (n: number) => (one(n) > 0 ? `+${formatPoints(one(n))}` : one(n) < 0 ? `−${formatPoints(Math.abs(one(n)))}` : "0");

/** "Gained +3.8" and "Lost −2.9": every check that moved — old → new points, why in today's words, and for a loss
 * the button to fix it. A check PostScore's scoring update started counting is listed like any other, with a note. */
export function GainedLost({ moves, current, liveBreakdown, businessId }: { moves: NonNullable<ReturnType<typeof scoreMoves>>; current: ScoreSnapshot; liveBreakdown: ScoreBreakdown; businessId: string }) {
  const locale = useLocale();
  const checkOf = (id: string) => current.breakdown_json.checks.find((c) => c.id === id) ?? liveBreakdown.checks.find((c) => c.id === id);
  // Saved scans keep no words: the label from its key, else today's check.
  const labelOf = (id: string) => {
    const c = checkOf(id);
    const byKey = `content.checks.${id}.label`;
    const keyed = t(locale, byKey as Parameters<typeof t>[1]);
    // Translated: the scorer's own label key, else the check's generic one (a saved scan can carry English words).
    const own = checkLabelKey(id);
    return (own ? t(locale, own) : null) || (keyed !== byKey ? keyed : null) || (c && resolveChangeDisplay(c, liveBreakdown, locale).label) || liveBreakdown.checks.find((x) => x.id === id)?.label || id;
  };
  const pts = (v: number | null) => (v === null ? t(locale, "dashboard.overview.sinceCard.notScored") : formatPoints(v));
  const row = (m: ScoreMove, loss: boolean) => {
    const check = checkOf(m.id);
    // The reason in one sentence (what we found, and the line), like the breakdown rows.
    const why = check ? helpSplit(resolveChangeDisplay(check, liveBreakdown, locale).explanation).first : "";
    return (
      <li key={m.id} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0" data-testid="since-move" data-loss={loss || undefined}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-[13.5px] font-medium text-ink">
            {labelOf(m.id)}:{" "}
            <span className="tabular-nums">{m.from === null ? t(locale, "dashboard.overview.sinceCard.nowPoints", { points: `${pts(m.to)} / ${formatPoints(m.max)}` }) : `${pts(m.from)} → ${pts(m.to)} / ${formatPoints(m.max)}`}</span>
          </div>
          <span className={cn("inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold", loss ? "bg-[color:color-mix(in_srgb,var(--color-red)_10%,transparent)] text-red" : "bg-[color:color-mix(in_srgb,var(--color-green)_10%,transparent)] text-green")}>
            {signedOne(m.impact)} {t(locale, "dashboard.website.ptsAbbrev")}
          </span>
        </div>
        {why && <p className="text-[12px] text-ink-soft">{why}</p>}
        {m.byUpdate && <p className="text-[12px] font-medium text-ink" data-testid="since-by-update">{t(locale, "dashboard.overview.sinceCard.byUpdate")}</p>}
        {loss && (
          <span className="w-fit">
            <FixButton businessId={businessId} item={{ checkId: m.id }} fromScore premiumLine={false} />
          </span>
        )}
      </li>
    );
  };
  const gains = moves.moves.filter((m) => m.impact > 0);
  const losses = moves.moves.filter((m) => m.impact < 0);
  const group = (title: string, total: number, list: ScoreMove[], loss: boolean, testId: string) =>
    list.length > 0 && (
      <div className="flex flex-col gap-1.5" data-testid={testId}>
        <SubHeading>
          {title} <span className={loss ? "text-red" : "text-green"}>{signedOne(total)}</span>
        </SubHeading>
        <ul className="flex flex-col divide-y divide-paper-line">{list.map((m) => row(m, loss))}</ul>
      </div>
    );
  return (
    <div className="flex flex-col gap-3" data-testid="since-gained-lost">
      {!moves.rescored && <p className="text-[12.5px] text-ink-soft" data-testid="since-cant-rescore">{t(locale, "dashboard.overview.sinceCard.cantRescore")}</p>}
      {moves.moves.length === 0 ? (
        <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.overview.nothingChangedSinceLastScan")}</p>
      ) : (
        <>
          {group(t(locale, "dashboard.overview.sinceCard.gained"), moves.gained, gains, false, "since-gained")}
          {group(t(locale, "dashboard.overview.sinceCard.lost"), moves.lost, losses, true, "since-lost")}
        </>
      )}
    </div>
  );
}
