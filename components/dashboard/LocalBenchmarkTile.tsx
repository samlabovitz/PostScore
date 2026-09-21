"use client";

import Link from "next/link";
import type { GetLocalBenchmarkResult } from "@/app/actions/competitors";
import { t, useLocale } from "@/lib/i18n";

/**
 * "How do I compare to my real local peers" — a compact tile that sits
 * alongside the other Overview "At a glance" stats (Google rating, Google
 * reviews), not a standalone section. Built entirely from the last SAVED
 * competitor scan (see getLocalBenchmark), never a fresh live Google
 * Places call, so it moves only when the owner re-saves a scan on the
 * Competitors page. Every number is real — the rank and percentile come
 * straight from real PostScores of the real, already-matched nearby peers
 * in that scan — and the sample size is always disclosed in the same
 * line, never a bigger comparison than the scan actually supports.
 */
export function LocalBenchmarkTile({
  businessId,
  result,
}: {
  businessId: string;
  result: GetLocalBenchmarkResult;
}) {
  const locale = useLocale();
  return (
    <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-mute">
        {t(locale, "dashboard.overview.localBenchmarkLabel")}
      </span>
      <LocalBenchmarkValue businessId={businessId} result={result} />
    </div>
  );
}

function LocalBenchmarkValue({
  businessId,
  result,
}: {
  businessId: string;
  result: GetLocalBenchmarkResult;
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
