"use client";

import Link from "next/link";
import type { GetLocalBenchmarkResult } from "@/app/actions/competitors";
import { CompetitorSelectionNote } from "@/components/competitors/CompetitorSelectionNote";
import { DistanceNote } from "@/components/competitors/DistanceNote";
import { HeadToHead } from "@/components/competitors/HeadToHead";
import { IconLock } from "@tabler/icons-react";
import { t, useLocale } from "@/lib/i18n";

/**
 * "How do I compare to my real local peers" — a compact tile that sits
 * alongside the other Overview "At a glance" stats (Google rating, Google
 * reviews), not a standalone section. The rank is our own result from the
 * last saved competitor scan (see getLocalBenchmark), so it moves only
 * when a scan runs; Google's values next to it are read live on paid
 * plans and not at all on Free. Every number is real — the rank and percentile come
 * straight from real PostScores of the real, already-matched nearby peers
 * in that scan — and the sample size is always disclosed in the same
 * line, never a bigger comparison than the scan actually supports.
 */
export function LocalBenchmarkTile({
  businessId,
  result,
  lockedHref = null,
}: {
  businessId: string;
  result: GetLocalBenchmarkResult;
  /** Free: no live Google read for competitor names, so 1–2 competitors
   * (a head-to-head) show the locked line to the plans instead. */
  lockedHref?: string | null;
}) {
  const locale = useLocale();
  return (
    <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-mute">
        {t(locale, "dashboard.overview.localBenchmarkLabel")}
      </span>
      <LocalBenchmarkValue businessId={businessId} result={result} lockedHref={lockedHref} />
      {result.status === "ok" && result.benchmark.distanceNote && (
        <DistanceNote note={result.benchmark.distanceNote} noun={result.benchmark.competitorNoun} compact />
      )}
      {/* One time, after the competitor-picking update. */}
      {result.status === "ok" && result.benchmark.selectionUpdated && <CompetitorSelectionNote businessId={businessId} compact />}
    </div>
  );
}

function LocalBenchmarkValue({
  businessId,
  result,
  lockedHref,
}: {
  businessId: string;
  result: GetLocalBenchmarkResult;
  lockedHref: string | null;
}) {
  const locale = useLocale();

  if (result.status === "no_scan") {
    return (
      <Link
        href={`/business/${businessId}/competitors`}
        className="max-w-[220px] text-sm font-medium text-brass hover:underline"
      >
        {t(locale, "dashboard.overview.saveScanToSeeRanking")}
      </Link>
    );
  }

  if (result.status === "no_peers") {
    return (
      <span className="max-w-[220px] text-sm text-ink-soft">
        {t(locale, "dashboard.overview.noComparablePeers", { competitorNoun: result.competitorNoun })}
      </span>
    );
  }

  if (result.status === "head_to_head" && lockedHref) {
    return (
      <Link href={lockedHref} data-testid="head-to-head-locked" className="inline-flex max-w-[260px] items-center gap-1 text-[12.5px] font-medium text-brass hover:underline">
        <IconLock size={13} aria-hidden className="shrink-0" />
        {t(locale, "dashboard.free.reviewGoalLocked")}
      </Link>
    );
  }

  if (result.status === "head_to_head") {
    // 1–2 competitors: never "#1 of 2" — a head-to-head instead.
    return <HeadToHead businessId={businessId} headToHead={result.headToHead} noun={result.competitorNoun} compact />;
  }

  if (result.status !== "ok") {
    return <span className="text-sm text-ink-mute">—</span>;
  }

  const b = result.benchmark;
  return (
    <>
      <span className="font-serif text-[26px] font-semibold text-ink">
        {t(locale, "dashboard.overview.rankOfPeerCount", { rank: b.rank, peerCount: b.peerCount })}
      </span>
      <span className="max-w-[220px] text-[12px] text-ink-mute">
        {t(locale, "dashboard.overview.aheadOfNearby", {
          percentileAhead: b.percentileAhead,
          othersCount: b.othersCount,
          competitorNoun: b.competitorNoun,
        })}
        {b.smallSample ? t(locale, "dashboard.overview.smallSampleSuffix") : ""}
      </span>
    </>
  );
}
