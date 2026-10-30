"use client";

// Shown instead of a rank when only 1–2 competitors were found
// (lib/competitorComparison.ts headToHead): "Only 2 salons like yours
// within 15 miles — here's how you compare with A and B", the scores side
// by side, and "Add a competitor" for others the owner really competes
// with. The rank comes back on its own at 3+.

import Link from "next/link";
import type { HeadToHead as HeadToHeadData } from "@/lib/competitorComparison";
import { headToHeadIntro } from "@/lib/competitorHeadToHead";
import { shortName } from "@/lib/displayName";
import { t, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function HeadToHead({
  businessId,
  headToHead,
  noun,
  compact = false,
  /** On the Competitors page "Add a competitor" jumps to the form there. */
  onCompetitorsPage = false,
}: {
  businessId: string;
  headToHead: HeadToHeadData;
  noun: string;
  compact?: boolean;
  onCompetitorsPage?: boolean;
}) {
  const locale = useLocale();
  const rows = [
    { key: headToHead.owner.placeId, label: t(locale, "dashboard.competitors.headToHead.you"), score: headToHead.owner.score, you: true },
    ...headToHead.rivals.map((r) => ({ key: r.placeId, label: r.name ? shortName(r.name) : t(locale, "dashboard.competitors.unnamedListing"), score: r.score, you: false })),
  ];
  return (
    <div data-testid="head-to-head" className="flex flex-col gap-2">
      <p className={cn("text-ink", compact ? "max-w-[260px] text-[13px] leading-snug" : "font-serif text-lg font-semibold leading-snug sm:text-xl")}>
        {headToHeadIntro(headToHead, noun, locale)}
      </p>
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-[12.5px]">
            <span className={cn("truncate", r.you ? "font-semibold text-ink" : "text-ink-soft")}>{r.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-paper">
              {r.score !== null && <span className={cn("block h-full rounded-full", r.you ? "bg-brass" : "bg-ink-mute/50")} style={{ width: `${Math.max(2, Math.min(100, r.score))}%` }} />}
            </span>
            <span className={cn("min-w-[2rem] text-right tabular-nums", r.you ? "font-semibold text-ink" : "text-ink-soft")}>{r.score === null ? "—" : Math.round(r.score)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[12px] leading-snug text-ink-mute">{t(locale, "dashboard.competitors.headToHead.rankNote")}</p>
      <Link
        href={onCompetitorsPage ? "#add-competitor" : `/business/${businessId}/competitors#add-competitor`}
        data-testid="head-to-head-add"
        className="self-start text-[12.5px] font-medium text-brass hover:underline"
      >
        {t(locale, "dashboard.competitors.headToHead.add")}
      </Link>
    </div>
  );
}
