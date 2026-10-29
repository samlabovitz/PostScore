"use client";

import { AddCompetitor, RemoveCompetitorButton, RemovedByOwner } from "./CompetitorOwnerControls";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconLock, IconArrowLeft, IconArrowRight, IconChevronDown, IconRefresh, IconTrendingDown, IconTrendingUp, IconAlertCircle } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button, buttonClasses } from "@/components/ui/Button";
import { UpgradeButton, UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";
import { useUpgrade } from "@/components/upgrade/UpgradeContext";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/SegmentedControl";
import { GoogleMapsAttribution } from "@/components/google/GoogleMapsAttribution";
import { refreshCompetitors, type GetCompetitorsResult } from "@/app/actions/competitors";
import type { SavedCompetitorEntry, SavedCompetitorScan } from "@/lib/savedCompetitorScans";
import { reviewGoal,
  COMPARE_VIEWS,
  FIX_PAGE,
  METRICS,
  compareMetric,
  computeGaps,
  entryScore,
  VIEW_CATEGORY,
  heroSummary,
  metricValue,
  websiteNotChecked,
  websiteNotCheckedReason,
  isFullScored,
  checkStatus,
  rankBy,
  type CompareView,
  type Gap,
  type MetricDef,
} from "@/lib/competitorComparison";
import { priceLevelToSymbol } from "@/lib/priceLevel";
import { MAX_SEARCH_RADIUS_MILES } from "@/lib/competitorScanPolicy";
import { estimateLabelWidth, layoutLabels, shortName, type Lane, type LabelRequest } from "@/lib/lineupLayout";
import { gradeFromTotal } from "@/lib/scoring";
import { formatCount, formatShortDate, t, tPlural, useLocale, useTimeZone, type Locale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { placeTypeList } from "@/lib/placeTypeLabels";
import { scopeGroupLabel, applyScope, type CompetitorScope } from "@/lib/competitorScope";
import { CompetitorGroups } from "./CompetitorGroups";
import { reviewGoalText } from "@/lib/reviewGoal";
import { hasFewReviews, type AlsoNearbyListing } from "@/lib/competitorQuality";
import { CompetitorSelectionNote } from "@/components/competitors/CompetitorSelectionNote";
import { DistanceNote } from "@/components/competitors/DistanceNote";

type OkResult = Extract<GetCompetitorsResult, { status: "ok" }>;

const VIEW_LABEL: Record<CompareView, MessageKey> = {
  overall: "dashboard.competitors.viewOverall",
  listing: "dashboard.competitors.viewListing",
  website: "dashboard.competitors.viewWebsite",
  reviews: "dashboard.competitors.viewReviews",
};
const FIX_LABEL: Record<"reviews" | "overview" | "website", MessageKey> = {
  reviews: "dashboard.competitors.fixReviews",
  overview: "dashboard.competitors.fixOverview",
  website: "dashboard.competitors.fixWebsite",
};
const BRASS = "#b8862f";

function checkLabel(checkId: string, locale: Locale): string {
  return t(locale, `content.checks.${checkId}.label` as MessageKey);
}

/** The Website chip's value: "67%", "No website" / "Facebook page only",
 * or "couldn't check" — never a made-up number. */
function websiteChipValue(entry: SavedCompetitorEntry, score: number | null, locale: Locale): string {
  if (entry.hasWebsite === false) {
    const platform = socialPlatformOf(entry);
    return platform ? t(locale, "dashboard.competitors.socialPageOnly", { platform }) : t(locale, "dashboard.competitors.noWebsite");
  }
  if (score !== null) return `${score}%`;
  if (!isFullScored(entry)) return t(locale, "dashboard.competitors.websiteNotCheckedYet");
  return t(locale, "dashboard.competitors.websiteCouldntCheckReason", { reason: reasonText(websiteNotCheckedReason(entry), locale) });
}

const KNOWN_REASONS = ["blocked", "timed_out", "js_only", "error_page", "unreachable", "no_address", "listing_facts", "speed_test"];

/** An observed reason in words ("couldn't check" alone when none was recorded). */
function reasonText(reason: string | null, locale: Locale): string {
  return reason && KNOWN_REASONS.includes(reason)
    ? t(locale, `dashboard.competitors.notCheckedReason.${reason}` as MessageKey)
    : t(locale, "dashboard.competitors.notCheckedReason.unknown");
}

/** Full scoring ran and the site's website checks couldn't run (not merely
 * "not checked yet") — the row mark and the page note. */
function websiteCouldntBeChecked(entry: SavedCompetitorEntry): boolean {
  return websiteNotChecked(entry) && isFullScored(entry);
}

function miles(meters: number | null, locale: Locale): string {
  if (meters === null) return "";
  const mi = meters / 1609.344;
  return `${mi < 0.1 ? "<0.1" : mi.toFixed(1)}${t(locale, "dashboard.competitors.milesSuffix")}`;
}

/** A metric value as text: "4.5★", "212", "Yes"/"No", or "Not checked". */
function formatMetric(m: MetricDef, v: number | null, locale: Locale, asShare = false): string {
  if (v === null) return t(locale, "dashboard.competitors.notChecked");
  if (m.kind === "rating") return `${v.toFixed(1)}★`;
  if (m.kind === "count") return formatCount(v, locale);
  if (asShare) return t(locale, "dashboard.competitors.shareHaveIt", { percent: Math.round(v * 100) });
  return v >= 1 ? t(locale, "dashboard.competitors.yes") : t(locale, "dashboard.competitors.no");
}


/** v1.11.0: the platform when this entry's listing links to a social page
 * instead of a website ("Facebook page only"), from its saved breakdown. */
function socialPlatformOf(entry: SavedCompetitorEntry): string | null {
  return entry.breakdown?.checks.find((c) => c.id === "website.has_website")?.meta?.socialPlatform ?? null;
}
export function CompetitorsView({ businessId, data, fullScore = null }: { businessId: string; data: OkResult; /** The Overview's full PostScore. */ fullScore?: number | null }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [view, setView] = useState<CompareView>("overall");
  // Who the rank is against (lib/competitorScope.ts) — the same scope the
  // Overview, reports and PostAI use; changing it here re-ranks saved data.
  const [scope, setScope] = useState<CompetitorScope | null>(data.niche?.scope ?? null);
  const latest = data.latest;
  const scoped = latest && scope ? applyScope(latest, scope) : null;
  const scan = scoped?.scan ?? latest;

  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div>
        <Link
          href={`/business/${businessId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
        >
          <IconArrowLeft size={15} />
          {t(locale, "dashboard.competitors.backTo", {
            name: data.businessName ?? t(locale, "dashboard.competitors.businessFallback"),
          })}
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">{t(locale, "dashboard.competitors.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t(locale, "dashboard.competitors.comparableNote")}</p>
      </div>

      {data.scoring && <ScoringProgressNote progress={data.scoring} />}
      {/* One time, after the competitor-picking update (no "dropped" alert across it). */}
      {data.selectionUpdated && <CompetitorSelectionNote businessId={businessId} />}

      {latest && latest.entries.some((e) => !e.isSubject) && <ScanInfo businessId={businessId} data={data} />}

      {latest && latest.entries.some((e) => !e.isSubject) && data.comparedViaTypes.length > 0 && (
        // Google's own types are all generic, so the scan searched the
        // owner's business type instead (Shoe Tech: dry cleaners, tailors).
        <p className="max-w-2xl text-sm text-ink-soft">
          {t(locale, "dashboard.competitors.comparedViaFallback", { types: placeTypeList(data.comparedViaTypes, locale) })}
        </p>
      )}

      {!scan && data.scanBlocker ? (
        // We can't search at all (from saved data, no cost) — say why
        // honestly; a "Run" button would only fail the same way.
        <Card className="p-6 text-sm text-ink-soft">
          {data.scanBlocker === "no_location"
            ? t(locale, "dashboard.competitors.noCoordinatesError")
            : t(locale, "dashboard.competitors.categoryTooGenericError", {
                name: data.businessName ?? t(locale, "dashboard.competitors.thisBusinessFallback"),
              })}
        </Card>
      ) : !scan && data.scoring ? null : !scan ? (
        <Card className="flex flex-col items-start gap-3 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.competitors.notRunYet")}</h2>
          <p className="text-sm text-ink-soft">
            {t(locale, "dashboard.competitors.notRunYetBody", { competitorNoun: data.competitorNoun })}
          </p>
          <RefreshButton businessId={businessId} allowed label={t(locale, "dashboard.competitors.runFirstScan")} />
        </Card>
      ) : !latest || !latest.entries.some((e) => !e.isSubject) ? (
        // A real scan searched every radius and Google listed no
        // comparable business — never "#1 of 1", never "not run yet".
        <Card className="flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-ink-soft">
            {t(locale, "dashboard.competitors.noneFoundNearby", {
              miles: MAX_SEARCH_RADIUS_MILES,
              date: formatShortDate((latest ?? scan).createdAt, locale, timeZone),
            })}
          </p>
          {data.refresh.allowed ? (
            <RefreshButton businessId={businessId} allowed label={t(locale, "dashboard.competitors.refreshButton")} />
          ) : (
            <span className="text-[12.5px] text-ink-mute">
              {t(locale, "dashboard.competitors.availableAgain", {
                date: formatShortDate(data.refresh.nextAvailableAt ?? (latest ?? scan).createdAt, locale, timeZone),
              })}
            </span>
          )}
        </Card>
      ) : (
        <>
          {scan.entries.some((e) => !e.isSubject) && <Hero scan={scan} competitorNoun={data.competitorNoun} businessId={businessId} fullScore={fullScore} />}
          {latest && <CompetitorsReviewGoal scan={latest} scope={scope} noun={data.competitorNoun} />}

          {latest && scope && scoped && (
            <CompetitorGroups businessId={businessId} scan={latest} scope={scope} scoped={scoped} enabled={!!data.niche?.enabled} onScopeChange={setScope} />
          )}

          {scan.entries.some((e) => !e.isSubject) && (<>

          <div className="flex flex-col gap-3">
            <SegmentedControl
              size="sm"
              options={COMPARE_VIEWS.map((v) => ({ value: v, label: t(locale, VIEW_LABEL[v]) })) as SegmentedControlOption<CompareView>[]}
              value={view}
              onChange={setView}
            />
            <Comparison scan={scan} view={view} />
          </div>

          <LeadTrail scan={scan} businessId={businessId} />

          <div>
            <SectionHeading
              title={t(locale, "dashboard.competitors.listHeading", { category: t(locale, VIEW_LABEL[view]) })}
              className="mb-3"
            />
            {data.distanceNote && <DistanceNote note={data.distanceNote} noun={data.competitorNoun} />}
            <RankedList scan={scan} view={view} businessId={businessId} />
            {(data.alsoNearby ?? []).length > 0 && <AlsoNearby listings={data.alsoNearby!} />}
            <RemovedByOwner businessId={businessId} removed={data.removedByOwner ?? []} />
            <AddCompetitor businessId={businessId} />
            <GoogleMapsAttribution />
          </div>

          {data.rankHistory.length >= 2 && <OverTime data={data} />}
          </>)}
        </>
      )}
    </div>
  );
}

/** "Checking 7 of 11 competitor websites…" while a scan is being fully
 * scored in the background (the last finished results stay on the page
 * meanwhile). Refreshes itself every few seconds while it runs. */
function ScoringProgressNote({ progress }: { progress: NonNullable<OkResult["scoring"]> }) {
  const locale = useLocale();
  const router = useRouter();
  const active = progress.status === "queued" || progress.status === "running";
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [active, router]);
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-xl border border-paper-deep bg-white px-4 py-3 text-[13px] text-ink-soft">
      {active ? <IconRefresh size={15} className="mt-0.5 shrink-0 animate-spin text-brass motion-reduce:animate-none" aria-hidden /> : <IconAlertCircle size={15} className="mt-0.5 shrink-0 text-ink-mute" aria-hidden />}
      <span>
        {active
          ? t(locale, "dashboard.competitors.scoringProgress", { done: progress.done, total: progress.total })
          : t(locale, "dashboard.competitors.scoringPaused", { done: progress.done, total: progress.total })}
        {active && <span className="text-ink-mute"> {t(locale, progress.kind === "backfill" ? "dashboard.competitors.scoringProgressBackfill" : "dashboard.competitors.scoringProgressNew")}</span>}
      </span>
    </div>
  );
}

function ScanInfo({ businessId, data }: { businessId: string; data: OkResult }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  if (!data.latest) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-paper-deep bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-[13px] text-ink-soft">
        <span className="font-medium text-ink">
          {t(locale, "dashboard.competitors.scannedOn", { date: formatShortDate(data.latest.createdAt, locale, timeZone) })}
        </span>
        <span className="text-ink-mute"> · {t(locale, "dashboard.competitors.savedAutomatically")}</span>
      </div>
      {data.refresh.allowed ? (
        <RefreshButton businessId={businessId} allowed label={t(locale, "dashboard.competitors.refreshButton")} />
      ) : (
        <span className="text-[12.5px] text-ink-mute">
          {t(locale, "dashboard.competitors.availableAgain", {
            date: formatShortDate(data.refresh.nextAvailableAt ?? data.latest.createdAt, locale, timeZone),
          })}
        </span>
      )}
    </div>
  );
}

function RefreshButton({ businessId, allowed, label }: { businessId: string; allowed: boolean; label: string }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const upgrade = useUpgrade();

  function run() {
    setMessage(null);
    startTransition(async () => {
      const result = await refreshCompetitors(businessId);
      if (result.status === "saved") router.refresh();
      else if (result.status === "too_soon")
        setMessage(t(locale, "dashboard.competitors.availableAgain", { date: formatShortDate(result.nextAvailableAt, locale, timeZone) }));
      else if (result.status === "capped") setMessage(t(locale, "dashboard.niche.capped", { date: formatShortDate(result.nextAvailableAt, locale, timeZone) }));
      else if (result.status === "no_data") setMessage(t(locale, "dashboard.competitors.noComparableCompetitors"));
      else setMessage(t(locale, "dashboard.competitors.refreshError"));
    });
  }

  // Free: the saved list and rank stay (the audit); refreshing them
  // (Places searches) is Grow — the button opens the promo box.
  if (upgrade?.plan === "free")
    return (
      <div className="flex flex-col items-start gap-1.5 sm:items-end">
        <UpgradeButton feature="grow" testId="competitors-refresh-locked" className={buttonClasses("default", "sm")}>
          <IconLock size={14} aria-hidden />
          {label}
        </UpgradeButton>
        <UpgradeTrigger feature="grow" />
      </div>
    );

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button variant="default" size="sm" onClick={run} disabled={!allowed || pending}>
        <IconRefresh size={14} className={cn(pending && "animate-spin")} />
        {pending ? t(locale, "dashboard.competitors.refreshing") : label}
      </Button>
      {message && <span className="text-[12px] text-ink-soft">{message}</span>}
    </div>
  );
}

/** The review goal (beat the leader), from the same scan and scope as the
 * rank above — re-ranks with the scope like everything else here. */
function CompetitorsReviewGoal({ scan, scope, noun }: { scan: SavedCompetitorScan; scope: CompetitorScope | null; noun: string }) {
  const locale = useLocale();
  const own = scan.entries.find((e) => e.isSubject)?.reviewCount ?? null;
  const goal = reviewGoal(scan, scope, own);
  if (!goal) return null;
  const text = reviewGoalText(goal, scopeGroupLabel(scan, scope, locale, noun), locale);
  return (
    <Card className="flex flex-col gap-1 p-4" data-testid="competitors-review-goal">
      <p className="text-[13px] text-ink-soft">{text.average}</p>
      <p className="text-[14px] font-semibold text-ink">{text.goal}</p>
      {text.nextUp && <p className="text-[13px] text-ink">{text.nextUp}</p>}
    </Card>
  );
}

function Hero({ scan, competitorNoun, businessId, fullScore }: { scan: SavedCompetitorScan; competitorNoun: string; businessId: string; fullScore: number | null }) {
  const locale = useLocale();
  const hero = heroSummary(scan, "overall");

  return (
    <Card className="p-5">
      <h2 className="font-serif text-xl font-semibold text-ink sm:text-[22px]">
        {hero.rank !== null
          ? t(locale, "dashboard.competitors.heroRank", { rank: hero.rank, total: hero.of, competitorNoun })
          : t(locale, "dashboard.competitors.heroNoRank")}
      </h2>

      <Lineup scan={scan} />

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-paper-line pt-4 sm:grid-cols-4">
        {/* The like-for-like score (only the checks competitors also
            get), so it can differ from the Overview's full PostScore. */}
        <div data-testid="comparable-score" className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-mute">{t(locale, "dashboard.competitors.statYourScoreComparable")}</span>
          <span className="font-serif text-[24px] font-semibold leading-tight text-ink tabular-nums">{hero.ownerScore ?? "—"}</span>
          <span className="text-[12px] leading-snug text-ink-soft">{t(locale, "dashboard.competitors.comparableExplain")}</span>
          {fullScore !== null && (
            <Link href={`/business/${businessId}`} className="text-[12px] font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline">
              {t(locale, "dashboard.competitors.fullScoreLink", { score: fullScore })}
            </Link>
          )}
        </div>
        <Stat label={t(locale, "dashboard.competitors.statLocalAverage")} value={hero.localAverage ?? "—"} />
        <Stat label={t(locale, "dashboard.competitors.statTop")} value={hero.topScore ?? "—"} detail={hero.topName} />
        <Stat
          label={t(locale, "dashboard.competitors.statRadius", { miles: hero.radiusMiles === null ? "—" : hero.radiusMiles.toFixed(1) })}
          value={hero.of - 1}
          detail={competitorNoun}
        />
      </div>
      {/* Competitor names and listings come from Google. */}
      <GoogleMapsAttribution />
    </Card>
  );
}

const LINEUP_HEIGHT = 112;
const LINE_Y = 56;
/** Server and first client render use this width, then the real one. */
const LINEUP_DEFAULT_WIDTH = 600;
const LANE_TOP: Record<Lane, number> = { above2: 0, above1: 18, below1: 72, below2: 90 };

/** Every business as a dot at its PostScore on one line: you as
 * the large brass dot; #1, the lowest and the area average labeled
 * (labels placed so they never overlap); hover or tap any dot for its
 * name, score and distance. Zoomed to the data. */
function Lineup({ scan }: { scan: SavedCompetitorScan }) {
  const locale = useLocale();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(LINEUP_DEFAULT_WIDTH);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(260, Math.round(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hero = heroSummary(scan, "overall");
  const ranked = rankBy(scan, "overall").filter((r) => r.score !== null);
  if (ranked.length === 0) return null;
  const scores = ranked.map((r) => r.score as number);
  const lo = Math.max(0, Math.floor((Math.min(...scores) - 3) / 5) * 5);
  const hi = Math.min(100, Math.ceil((Math.max(...scores) + 3) / 5) * 5);
  const PAD = 10;
  const x = (v: number) => PAD + (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (width - 2 * PAD);

  const owner = ranked.find((r) => r.entry.isSubject) ?? null;
  const comps = ranked.filter((r) => !r.entry.isSubject);
  const top = comps[0] ?? null;
  const lowest = comps.length > 1 ? comps[comps.length - 1] : null;
  const name = (e: SavedCompetitorEntry) => e.name ?? t(locale, "dashboard.competitors.unnamedListing");

  type Req = LabelRequest & { text: string; title?: string; strong?: boolean };
  const requests: Req[] = [];
  if (owner) {
    const text = `${t(locale, "dashboard.competitors.lineupYou")} · ${owner.score}`;
    requests.push({ key: "you", anchor: x(owner.score as number), width: estimateLabelWidth(text), prefer: "below", text, strong: true });
  }
  if (top) {
    const text = t(locale, "dashboard.competitors.lineupTop", { name: shortName(name(top.entry)), score: top.score as number });
    requests.push({ key: "top", anchor: x(top.score as number), width: estimateLabelWidth(text), prefer: "above", text, title: name(top.entry) });
  }
  if (lowest) {
    const text = t(locale, "dashboard.competitors.lineupLowest", { name: shortName(name(lowest.entry)), score: lowest.score as number });
    requests.push({ key: "low", anchor: x(lowest.score as number), width: estimateLabelWidth(text), prefer: "above", text, title: name(lowest.entry) });
  }
  if (hero.localAverage !== null) {
    const text = t(locale, "dashboard.competitors.lineupAverage", { score: hero.localAverage });
    requests.push({ key: "avg", anchor: x(hero.localAverage), width: estimateLabelWidth(text), prefer: "below", text });
  }
  const placed = layoutLabels(requests, width);
  const activeEntry = ranked.find((r) => r.entry.placeId === active) ?? null;

  return (
    <div className="mt-4">
      <div
        ref={wrapRef}
        role="img"
        aria-label={t(locale, "dashboard.competitors.lineupAria", { count: comps.length })}
        className="relative w-full select-none"
        style={{ height: LINEUP_HEIGHT }}
        onMouseLeave={() => setActive(null)}
      >
        <div className="absolute left-0 right-0 h-[2px] rounded-full bg-paper-deep" style={{ top: LINE_Y - 1 }} />
        {hero.localAverage !== null && (
          <span className="absolute w-[2px] rounded-full" style={{ left: x(hero.localAverage) - 1, top: LINE_Y - 9, height: 18, background: "#6b7890" }} />
        )}
        {comps.map((r) => (
          <button
            key={r.entry.placeId}
            type="button"
            aria-label={t(locale, "dashboard.competitors.lineupDotDetail", {
              name: name(r.entry),
              score: r.score as number,
              distance: miles(r.entry.distanceMeters, locale),
            })}
            onMouseEnter={() => setActive(r.entry.placeId)}
            onFocus={() => setActive(r.entry.placeId)}
            onClick={() => setActive((a) => (a === r.entry.placeId ? null : r.entry.placeId))}
            className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass"
            style={{ left: x(r.score as number), top: LINE_Y }}
          >
            <span className="block h-3 w-3 rounded-full border-2 border-white" style={{ background: "#7d8799" }} />
          </button>
        ))}
        {owner && (
          <span
            className="absolute block h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-card"
            style={{ left: x(owner.score as number), top: LINE_Y, background: BRASS }}
          />
        )}
        {placed.map((p) => {
          const r = requests.find((q) => q.key === p.key)!;
          return (
            <span
              key={p.key}
              title={r.title}
              className={cn("absolute whitespace-nowrap text-[11.5px] leading-4", r.strong ? "font-semibold text-ink" : "text-ink-soft")}
              style={{ left: p.left, top: LANE_TOP[p.lane], width: p.width }}
            >
              {r.text}
            </span>
          );
        })}
        {activeEntry && !activeEntry.entry.isSubject && (
          <span
            role="status"
            className="absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-paper-deep bg-white px-2 py-1 text-[12px] text-ink shadow-card"
            style={{
              left: Math.min(Math.max(x(activeEntry.score as number), 90), width - 90),
              top: LINE_Y + 14,
            }}
          >
            {t(locale, "dashboard.competitors.lineupDotDetail", {
              name: shortName(name(activeEntry.entry), 22),
              score: activeEntry.score as number,
              distance: miles(activeEntry.entry.distanceMeters, locale),
            })}
          </span>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-ink-mute">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
      {lo > 0 && <p className="mt-0.5 text-[11.5px] text-ink-mute">{t(locale, "dashboard.competitors.lineupZoomNote", { min: lo, max: hi })}</p>}
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string | number; detail?: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-mute">{label}</span>
      <span className="font-serif text-[24px] font-semibold leading-tight text-ink tabular-nums">{value}</span>
      {detail && <span className="truncate text-[12px] text-ink-soft">{detail}</span>}
    </div>
  );
}

function Bar({ label, value, fraction, highlight }: { label: string; value: string; fraction: number | null; highlight?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 text-[12.5px] sm:grid-cols-[10rem_1fr_auto]">
      <span className={cn("truncate", highlight ? "font-semibold text-ink" : "text-ink-soft")}>{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-paper">
        {fraction !== null && (
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.max(2, Math.min(100, fraction * 100))}%`, background: highlight ? BRASS : "#9aa3b3" }}
          />
        )}
      </span>
      <span className={cn("min-w-[4.5rem] text-right tabular-nums", highlight ? "font-semibold text-ink" : "text-ink-soft")}>{value}</span>
    </div>
  );
}

function Comparison({ scan, view }: { scan: SavedCompetitorScan; view: CompareView }) {
  const locale = useLocale();
  const hero = heroSummary(scan, view);
  const youLabel = t(locale, "dashboard.competitors.compareYou");
  const avgLabel = t(locale, "dashboard.competitors.compareAverage");
  const topLabel = t(locale, "dashboard.competitors.compareTop", { name: hero.topName ?? "—" });
  const metrics = view === "overall" ? [] : METRICS.filter((m) => m.view === view);

  return (
    <Card className="p-5">
      <h3 className="font-serif text-base font-semibold text-ink">
        {t(locale, "dashboard.competitors.compareHeading", { category: t(locale, VIEW_LABEL[view]) })}
      </h3>
      <div className="mt-4 flex flex-col gap-2.5">
        <Bar label={youLabel} value={hero.ownerScore === null ? "—" : `${hero.ownerScore}`} fraction={hero.ownerScore === null ? null : hero.ownerScore / 100} highlight />
        <Bar label={avgLabel} value={hero.localAverage === null ? "—" : `${hero.localAverage}`} fraction={hero.localAverage === null ? null : hero.localAverage / 100} />
        <Bar label={topLabel} value={hero.topScore === null ? "—" : `${hero.topScore}`} fraction={hero.topScore === null ? null : hero.topScore / 100} />
      </div>

      {view === "overall" ? (
        <p className="mt-3 text-[12px] text-ink-mute">{t(locale, "dashboard.competitors.compareOverallHint")}</p>
      ) : (
        <div className="mt-5 flex flex-col gap-5 border-t border-paper-line pt-4">
          {metrics.map((m) => {
            const c = compareMetric(scan, m);
            const max =
              m.kind === "rating" ? 5 : m.kind === "yesno" ? 1 : Math.max(1, c.owner ?? 0, c.average ?? 0, c.top ?? 0);
            const frac = (v: number | null) => (v === null ? null : v / max);
            return (
              <div key={m.checkId} className="flex flex-col gap-1.5">
                <div className="text-[13px] font-medium text-ink">{checkLabel(m.checkId, locale)}</div>
                <Bar label={youLabel} value={formatMetric(m, c.owner, locale)} fraction={frac(c.owner)} highlight />
                <Bar label={avgLabel} value={formatMetric(m, c.average === null ? null : m.kind === "count" ? Math.round(c.average) : c.average, locale, m.kind === "yesno")} fraction={frac(c.average)} />
                <Bar label={t(locale, "dashboard.competitors.compareTop", { name: c.topName ?? "—" })} value={formatMetric(m, c.top, locale)} fraction={frac(c.top)} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function GapItem({ gap, businessId, trailing }: { gap: Gap; businessId: string; trailing: boolean }) {
  const locale = useLocale();
  const m = gap.metric;
  const c = gap.comparison;
  const page = FIX_PAGE[m.view];
  const href = page === "reviews" ? `/business/${businessId}/website-reviews` : page === "website" ? `/business/${businessId}/website` : `/business/${businessId}`;
  return (
    <li className="flex flex-col gap-0.5 border-t border-paper-line py-2.5 first:border-t-0 first:pt-0">
      <span className="text-[13.5px] font-medium text-ink">{checkLabel(m.checkId, locale)}</span>
      <span className="text-[12.5px] text-ink-soft">
        {t(locale, "dashboard.competitors.gapLine", {
          you: formatMetric(m, c.owner, locale),
          average: formatMetric(m, m.kind === "count" ? Math.round(c.average ?? 0) : c.average, locale, m.kind === "yesno"),
        })}
      </span>
      {trailing && (
        <Link href={href} className="mt-0.5 inline-flex w-fit items-center gap-1 text-[12.5px] font-medium text-brass hover:underline">
          {t(locale, FIX_LABEL[page])}
          <IconArrowRight size={13} />
        </Link>
      )}
    </li>
  );
}

function LeadTrail({ scan, businessId }: { scan: SavedCompetitorScan; businessId: string }) {
  const locale = useLocale();
  const { leads, trails } = computeGaps(scan);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card className="p-5">
        <h3 className="mb-3 inline-flex items-center gap-2 font-serif text-base font-semibold text-ink">
          <IconTrendingUp size={17} className="text-green" />
          {t(locale, "dashboard.competitors.leadHeading")}
        </h3>
        {leads.length === 0 ? (
          <p className="text-[13px] text-ink-mute">{t(locale, "dashboard.competitors.noLeads")}</p>
        ) : (
          <ul>{leads.map((g) => <GapItem key={g.metric.checkId} gap={g} businessId={businessId} trailing={false} />)}</ul>
        )}
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 inline-flex items-center gap-2 font-serif text-base font-semibold text-ink">
          <IconTrendingDown size={17} className="text-red" />
          {t(locale, "dashboard.competitors.trailHeading")}
        </h3>
        {trails.length === 0 ? (
          <p className="text-[13px] text-ink-mute">{t(locale, "dashboard.competitors.noTrails")}</p>
        ) : (
          <ul>{trails.map((g) => <GapItem key={g.metric.checkId} gap={g} businessId={businessId} trailing />)}</ul>
        )}
      </Card>
    </div>
  );
}

function RankedList({ scan, view, businessId }: { scan: SavedCompetitorScan; view: CompareView; businessId: string }) {
  const locale = useLocale();
  const ranked = rankBy(scan, view);
  const anyNotChecked = (view === "overall" || view === "website") && scan.entries.some(websiteCouldntBeChecked);
  return (
    <>
      {anyNotChecked && <p className="mb-2.5 text-[12.5px] text-ink-soft">{t(locale, "dashboard.competitors.someWebsitesNotChecked")}</p>}
      <ol className="flex flex-col gap-2.5">
        {ranked.map((r) => (
          <CompetitorCard key={r.entry.placeId} entry={r.entry} rank={r.rank} view={view} businessId={businessId} />
        ))}
      </ol>
    </>
  );
}

function CompetitorCard({ entry, rank, view, businessId }: { entry: SavedCompetitorEntry; rank: number; view: CompareView; businessId: string }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const price = priceLevelToSymbol(entry.priceLevel);
  const viewScore = entryScore(entry, view);
  const categoryScores = (["listing", "website", "reviews"] as const).map((v) => ({ v, score: entryScore(entry, v) }));

  return (
    <li
      className={cn(
        "rounded-xl border bg-white p-4",
        entry.isSubject ? "border-brass/60 shadow-card ring-1 ring-brass/30" : "border-paper-deep"
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 w-7 shrink-0 font-serif text-lg font-semibold tabular-nums", entry.isSubject ? "text-brass" : "text-ink-mute")}>
          #{rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-[14.5px] font-semibold text-ink">{entry.name ?? t(locale, "dashboard.competitors.unnamedListing")}</span>
            {entry.isSubject && (
              <span className="rounded-md bg-brass/15 px-1.5 py-0.5 text-[11px] font-semibold text-brass">
                {t(locale, "dashboard.competitors.yourBusiness")}
              </span>
            )}
            {!entry.isSubject && entry.distanceMeters !== null && (
              <span className="text-[12px] text-ink-mute">{miles(entry.distanceMeters, locale)}</span>
            )}
            {entry.ownerAdded && (
              <span data-testid="owner-added-tag" className="rounded-md bg-brass/10 px-1.5 py-0.5 text-[11px] font-semibold text-ink">
                {t(locale, "dashboard.memory.addedByYou")}
              </span>
            )}
            {/* Kept only when there weren't enough established competitors
                (lib/competitorQuality.ts) — said plainly. */}
            {!entry.isSubject && hasFewReviews(entry.reviewCount) && (
              <span data-testid="few-reviews-tag" className="rounded-md bg-paper px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">
                {t(locale, "dashboard.competitors.fewReviewsTag")}
              </span>
            )}
            {websiteCouldntBeChecked(entry) && (
              <span className="inline-flex items-center gap-1 rounded-md border border-paper-deep bg-paper px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">
                <IconAlertCircle size={12} aria-hidden />
                {t(locale, "dashboard.competitors.websiteCouldntBeCheckedReason", { reason: reasonText(websiteNotCheckedReason(entry), locale) })}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-soft">
            <span>
              {entry.rating !== null ? `${entry.rating.toFixed(1)}★` : t(locale, "dashboard.competitors.noRating")}
              {" · "}
              {entry.reviewCount !== null
                ? tPlural(locale, "dashboard.competitors.reviewCount", entry.reviewCount, { count: formatCount(entry.reviewCount, locale) })
                : t(locale, "dashboard.competitors.noReviewCount")}
            </span>
            <span>
              {t(locale, "dashboard.competitors.priceLevelLabel")}: {price ?? t(locale, "dashboard.competitors.notListedByGoogle")}
            </span>
            <span>
              {entry.hasWebsite === null
                ? t(locale, "dashboard.competitors.notChecked")
                : entry.hasWebsite
                  ? t(locale, "dashboard.competitors.hasWebsite")
                  : socialPlatformOf(entry)
                    ? t(locale, "dashboard.competitors.socialPageOnly", { platform: socialPlatformOf(entry)! })
                    : t(locale, "dashboard.competitors.noWebsite")}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {categoryScores.map(({ v, score }) =>
              v === "website" ? (
                <span key={v} className={cn("rounded-md px-1.5 py-0.5 text-[11.5px]", v === view ? "bg-[color:color-mix(in_srgb,var(--color-ink)_10%,transparent)] font-semibold text-ink" : "bg-paper text-ink-soft")}>
                  {t(locale, VIEW_LABEL.website)} {websiteChipValue(entry, score, locale)}
                </span>
              ) : (
                <span key={v} className={cn("rounded-md px-1.5 py-0.5 text-[11.5px]", v === view ? "bg-[color:color-mix(in_srgb,var(--color-ink)_10%,transparent)] font-semibold text-ink" : "bg-paper text-ink-soft")}>
                  {t(locale, VIEW_LABEL[v])} {score === null ? "—" : `${score}%`}
                </span>
              )
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {/* Overall = each business's full PostScore and grade — the
              owner's is the same number as on the Overview. */}
          <div className="font-serif text-[22px] font-semibold leading-none text-ink tabular-nums">
            {viewScore === null ? "—" : view === "overall" ? viewScore : `${viewScore}%`}
          </div>
          {view === "overall" && viewScore !== null && <div className="mt-1 text-[11.5px] text-ink-mute">{gradeFromTotal(viewScore)}</div>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-soft hover:text-ink"
        >
          <IconChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
          {open ? t(locale, "dashboard.competitors.hideDetails") : t(locale, "dashboard.competitors.showDetails")}
        </button>
        {!entry.isSubject && <RemoveCompetitorButton businessId={businessId} placeId={entry.placeId} name={entry.name} />}
      </div>
      {open && <CheckDetail entry={entry} />}
    </li>
  );
}

/** Every check behind this business's PostScore, by category: rating,
 * review and photo counts as values; the rest Done / Needs work /
 * Couldn't check — the same checks as the owner's own score. */
function CheckDetail({ entry }: { entry: SavedCompetitorEntry }) {
  const locale = useLocale();
  if (!entry.breakdown) return null;
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-paper-line pt-3">
      {(["reviews", "listing", "website"] as const).map((v) => {
        const checks = entry.breakdown!.checks.filter((c) => c.category === VIEW_CATEGORY[v]);
        if (checks.length === 0) return null;
        return (
          <div key={v} className="flex flex-col gap-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mute">{t(locale, VIEW_LABEL[v])}</div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {checks.map((c) => {
                const m = METRICS.find((x) => x.checkId === c.id && x.kind !== "yesno");
                const status = checkStatus(entry, c);
                const social = c.id === "website.has_website" ? socialPlatformOf(entry) : null;
                const value = social
                  ? t(locale, "dashboard.competitors.socialPageOnly", { platform: social })
                  : m && (status.kind === "done" || status.kind === "needs_work")
                    ? formatMetric(m, metricValue(entry, m), locale)
                    : status.kind === "done"
                      ? t(locale, "dashboard.competitors.checkDone")
                      : status.kind === "needs_work"
                        ? t(locale, "dashboard.competitors.checkNeedsWork")
                        : status.kind === "not_applicable"
                          ? t(locale, "dashboard.competitors.checkNotApplicable")
                          : status.kind === "not_checked_yet"
                            ? t(locale, "dashboard.competitors.checkNotCheckedYet")
                            : t(locale, "dashboard.competitors.checkCouldntCheckReason", { reason: reasonText(status.kind === "couldnt" ? status.reason : null, locale) });
                return (
                  <div key={c.id} className="flex items-start justify-between gap-3 text-[12.5px]">
                    <span className="text-ink-soft">{checkLabel(c.id, locale)}</span>
                    <span className={cn("text-right font-medium tabular-nums", status.kind === "done" && !social ? "text-green" : status.kind === "done" || status.kind === "needs_work" || social ? "text-ink" : "text-ink-mute")}>{value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Closer listings of the same kind skipped for few or no reviews — name,
 * distance, review count. Not ranked, not scored. */
function AlsoNearby({ listings }: { listings: AlsoNearbyListing[] }) {
  const locale = useLocale();
  return (
    <section data-testid="also-nearby" className="mt-5">
      <h3 className="text-[13px] font-semibold text-ink">{t(locale, "dashboard.competitors.alsoNearbyHeading")}</h3>
      <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.competitors.alsoNearbyNote")}</p>
      {listings.some((l) => l.temporarilyClosed) && <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.competitors.alsoNearbyClosedNote")}</p>}
      <ul className="mt-2 flex flex-col divide-y divide-paper-line rounded-xl border border-paper-deep bg-white">
        {listings.map((l) => (
          <li key={l.placeId} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-[13px]">
            <span className="min-w-0 truncate text-ink">{l.name}</span>
            <span className="shrink-0 text-[12px] text-ink-mute">
              {miles(l.distanceMeters, locale)} ·{" "}
              {l.temporarilyClosed ? (
                <span data-testid="temporarily-closed" className="font-semibold text-[color:var(--color-amber)]">
                  {t(locale, "dashboard.competitors.temporarilyClosedTag")}
                </span>
              ) : (
                tPlural(locale, "dashboard.competitors.reviewCount", l.reviewCount, { count: formatCount(l.reviewCount, locale) })
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OverTime({ data }: { data: OkResult }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const points = [...data.rankHistory].reverse();
  return (
    <Card className="p-5">
      <h3 className="font-serif text-base font-semibold text-ink">{t(locale, "dashboard.competitors.overTimeHeading")}</h3>
      <ul className="mt-3 flex flex-col">
        {points.map((p) => (
          <li key={p.scanId} className="flex items-center justify-between gap-3 border-t border-paper-line py-2 text-[13px] first:border-t-0">
            <span className="text-ink-soft">{formatShortDate(p.createdAt, locale, timeZone)}</span>
            <span className="font-medium tabular-nums text-ink">
              {p.rank === null ? "—" : t(locale, "dashboard.competitors.overTimeRank", { rank: p.rank, total: p.of })}
            </span>
            <span className="w-10 text-right tabular-nums text-ink-mute">{p.score ?? "—"}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
