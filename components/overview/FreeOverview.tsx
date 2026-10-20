"use client";

// The Overview's Free pieces ("Free = a digital audit"): what is wrong
// and what it costs — never how to fix it (that's a LockedPreview of the
// fix guide's first step) — a strong focus on reviews, and PostAI as a
// locked preview. Every number is the business's own; nothing here makes
// a paid call. Grow and above never render these.

import { useState } from "react";
import Link from "next/link";
import { IconChevronDown, IconMapPin, IconStar, IconWorld } from "@tabler/icons-react";
import type { CheckResult, Suggestion } from "@/lib/scoring";
import { reviewToolHref } from "@/lib/growBannerTools";
import { issueUnlockLine, NO_FACTS, unlockLine } from "@/lib/upgradePromos";
import { formatCount, t, useLocale, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { boostPoints } from "@/components/overview/ScoreBand";
import { LockedPreview } from "@/components/plan/LockedPreview";
import { useUpgrade } from "@/components/upgrade/UpgradeContext";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";
import { reviewStatLine } from "@/components/overview/GrowMoreCustomers";

/** The top issues, biggest first (generateSuggestions order). */
export const HOLDING_BACK_COUNT = 3;

/** "Costs you 4 pts" — whole points from 1 up, one decimal below. */
export function costsText(points: number, locale: Locale): string {
  const shown = boostPoints(points);
  return shown === "1" ? t(locale, "dashboard.free.costsOne") : t(locale, "dashboard.free.costs", { points: shown });
}

/** The fix guide's first step: the first sentence of the real advice. */
export function firstStep(advice: string): string {
  const match = advice.trim().match(/^.+?[.!?](?=\s|$)/);
  return (match ? match[0] : advice).trim();
}

function IssueIcon({ category }: { category: Suggestion["category"] }) {
  const Icon = category === "visibility" ? IconStar : category === "completeness" ? IconMapPin : IconWorld;
  return (
    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
      <Icon size={17} />
    </span>
  );
}

/** "What's holding your score back": the top real issues with the
 * points each costs; "How to fix it" opens the locked first step. */
export function HoldingBack({ suggestions, checks }: { suggestions: Suggestion[]; checks: CheckResult[] }) {
  const locale = useLocale();
  const facts = useUpgrade()?.facts ?? NO_FACTS;
  const [open, setOpen] = useState<string | null>(null);
  const top = suggestions.slice(0, HOLDING_BACK_COUNT);
  return (
    <section data-testid="holding-back" className="flex h-full flex-col rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.free.holdingHeading")}</h2>
      <p className="mt-0.5 text-[12.5px] text-ink-soft">{t(locale, "dashboard.free.holdingSub")}</p>
      {top.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">{t(locale, "dashboard.free.noIssues")}</p>
      ) : (
        <ol className="mt-3 flex flex-col divide-y divide-paper-line">
          {top.map((s) => {
            const check = checks.find((c) => c.id === s.checkId);
            const isOpen = open === s.checkId;
            const panelId = `fix-${s.checkId.replace(/\W/g, "-")}`;
            return (
              <li key={s.checkId} className="flex flex-col gap-2 py-3 first:pt-1 last:pb-1">
                <div className="flex gap-3">
                  <IssueIcon category={s.category} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 text-sm font-semibold text-ink">{s.label}</span>
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-paper">{costsText(s.promisedPoints, locale)}</span>
                    </div>
                    {check?.explanation && <span className="text-[12.5px] leading-snug text-ink-soft">{check.explanation}</span>}
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpen(isOpen ? null : s.checkId)}
                      className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink"
                    >
                      {isOpen ? t(locale, "dashboard.free.hideFix") : t(locale, "dashboard.free.howToFix")}
                      <IconChevronDown size={14} aria-hidden className={cn("transition-transform", isOpen && "rotate-180")} />
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div id={panelId}>
                    <LockedPreview
                      title={`${t(locale, "dashboard.free.howToFix")}: ${s.label}`}
                      unlock={issueUnlockLine(s.checkId, check?.earnedPoints === 0, facts, locale)}
                      height="max-h-32"
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-brass">{t(locale, "dashboard.free.firstStep")}</div>
                      <p className="mt-1 text-[13.5px] leading-snug text-ink">{firstStep(s.advice)}</p>
                      <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-mute">{t(locale, "dashboard.free.moreSteps")}</div>
                      <div className="mt-1.5 flex flex-col gap-1.5" aria-hidden>
                        <span className="h-2.5 w-11/12 rounded bg-paper-deep" />
                        <span className="h-2.5 w-3/4 rounded bg-paper-deep" />
                      </div>
                    </LockedPreview>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Reviews, front and center: the real gap when they trail nearby
 * competitors, and the review link & QR (free on every plan). */
export function FreeReviewFocus({
  businessId,
  reviewCount,
  nearbyAverage,
  competitorNoun,
}: {
  businessId: string;
  reviewCount: number | null;
  nearbyAverage: number | null;
  competitorNoun: string | null;
}) {
  const locale = useLocale();
  const average = nearbyAverage !== null ? Math.round(nearbyAverage) : null;
  const trailing = reviewCount !== null && average !== null && competitorNoun !== null && reviewCount < average;
  return (
    <section
      data-testid="free-review-focus"
      data-trailing={trailing || undefined}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-5",
        trailing ? "border-[color:color-mix(in_srgb,var(--color-amber)_45%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_7%,white)]" : "border-paper-deep bg-white"
      )}
    >
      <div className="flex min-w-0 gap-3">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ps-icon-tile">
          <IconStar size={20} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.free.reviewHeading")}</h2>
          <p className="text-[13.5px] font-medium leading-snug text-ink">
            {trailing
              ? t(locale, reviewCount === 1 ? "dashboard.free.reviewGapOne" : "dashboard.free.reviewGap", {
                  count: formatCount(reviewCount!, locale),
                  noun: competitorNoun!,
                  average: formatCount(average!, locale),
                  gap: formatCount(average! - reviewCount!, locale),
                })
              : reviewStatLine(reviewCount, average, locale)}
          </p>
          <p className="text-[12.5px] text-ink-soft">{t(locale, "dashboard.free.reviewWhy")}</p>
        </div>
      </div>
      <Link
        href={reviewToolHref(businessId)}
        className="inline-flex w-fit shrink-0 items-center rounded-lg bg-brass px-3.5 py-2 text-[13.5px] font-semibold text-ink transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-brass)_85%,white)]"
      >
        {t(locale, "dashboard.overview.growBanner.reviews.cta")}
      </Link>
    </section>
  );
}

/** PostAI on Free: what it is, with their real starter questions, locked
 * (no AI call — nothing here can send). */
export function FreePostAIPreview({ starterPrompts }: { starterPrompts: string[] }) {
  const locale = useLocale();
  const facts = useUpgrade()?.facts ?? NO_FACTS;
  const title = t(locale, "dashboard.free.postaiTitle");
  return (
    <LockedPreview title={title} unlock={unlockLine("postai", facts, locale)} height="max-h-44">
      <div className="text-base font-semibold text-ink">{title}</div>
      <p className="mt-0.5 text-[13px] text-ink-soft">{t(locale, "dashboard.free.postaiBody")}</p>
      {starterPrompts.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {starterPrompts.slice(0, 4).map((p) => (
            <li key={p} className="rounded-full border border-paper-deep bg-paper px-3 py-1 text-[12.5px] text-ink">
              {p}
            </li>
          ))}
        </ul>
      )}
    </LockedPreview>
  );
}

/** "You're #N of M nearby…" under the rank, only when they trail. */
export function RankUnlockLine() {
  const locale = useLocale();
  const facts = useUpgrade()?.facts ?? NO_FACTS;
  const line = unlockLine("rank", facts, locale);
  if (!line) return null;
  return (
    <p data-testid="rank-unlock" className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-paper-line pt-3 text-[13px] leading-snug text-ink">
      <span>{line}</span>
      <UpgradeTrigger feature="grow" />
    </p>
  );
}
