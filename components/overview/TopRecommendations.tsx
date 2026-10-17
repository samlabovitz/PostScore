"use client";

// The action plan's biggest open items (the same list as Growth), with
// a priority from their real points on the 0–100 total — High 5+,
// Medium 2+ (lib/overviewTiles.ts) — and PostAI's fix link for each.

import Link from "next/link";
import { IconArrowRight, IconMapPin, IconStar, IconWorld } from "@tabler/icons-react";
import { recRangeText, websiteRangeText, wholePointRange } from "@/lib/pointRange";
import { LINK_PILL_CLASS } from "@/components/ui/linkPill";
import { ANCHOR_HIGHLIGHT_EVENT } from "@/components/layout/AnchorHighlight";
import { HIGH_PRIORITY_POINTS, MEDIUM_PRIORITY_POINTS, type Priority, type Recommendation } from "@/lib/overviewTiles";
import { t, tPlural, useLocale, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function PriorityTag({ priority }: { priority: Priority }) {
  const locale = useLocale();
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
        priority === "high" ? "bg-ink text-paper" : "border border-[color:color-mix(in_srgb,var(--color-brass)_50%,transparent)] bg-[color:color-mix(in_srgb,var(--color-brass)_15%,transparent)] text-ink"
      )}
    >
      {t(locale, priority === "high" ? "dashboard.overview.recs.high" : "dashboard.overview.recs.medium")}
    </span>
  );
}

function RecIcon({ rec }: { rec: Recommendation }) {
  const category = rec.source.kind === "website" ? "website" : rec.source.task.category;
  const Icon = category === "visibility" ? IconStar : category === "completeness" ? IconMapPin : IconWorld;
  return (
    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
      <Icon size={17} />
    </span>
  );
}

function RecText({ rec }: { rec: Recommendation }) {
  const locale = useLocale();
  if (rec.source.kind === "task") {
    const { task } = rec.source;
    return (
      <>
        <span className="text-sm font-semibold text-ink">{task.label}</span>
        <span className="text-[12.5px] leading-snug text-ink-soft">{task.weeklyTarget ?? task.action}</span>
      </>
    );
  }
  const { banner } = rec.source;
  if (banner.kind === "improve") {
    return (
      <>
        <span className="text-sm font-semibold text-ink">{t(locale, "dashboard.overview.recs.improveWebsite")}</span>
        <span className="text-[12.5px] leading-snug text-ink-soft">
          {tPlural(locale, "dashboard.growth.websiteBanner.improve", banner.improvements, { score: banner.score, points: wholePointRange(banner.points, null).low })}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="text-sm font-semibold text-ink">{t(locale, "dashboard.growth.websiteBanner.getWebsite.title")}</span>
      <span className="text-[12.5px] leading-snug text-ink-soft">
        {websiteRangeText(locale, banner.low, banner.high)}
      </span>
    </>
  );
}

/** Whole points everywhere ("+19 pts", "about +29–31 pts"); the website
 * item is an estimate, so it says "about". */
function recPointsText(locale: Locale, rec: Recommendation): string {
  if (rec.pointsHigh !== null) return recRangeText(locale, rec.points, rec.pointsHigh);
  const points = wholePointRange(rec.points, null).low;
  return rec.source.kind === "website"
    ? t(locale, "dashboard.overview.recs.pointsAbout", { points })
    : t(locale, "dashboard.overview.recs.points", { points });
}

export function TopRecommendations({ businessId, recommendations }: { businessId: string; recommendations: Recommendation[] | null }) {
  const locale = useLocale();
  return (
    <section className="flex h-full flex-col rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.overview.recs.heading")}</h2>
        <Link href={`/business/${businessId}/growth`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink hover:text-brass">
          {t(locale, "dashboard.overview.recs.viewAll")}
          <IconArrowRight size={14} />
        </Link>
      </div>

      <Link
        href={`/business/${businessId}/growth#weekly-plan`}
        className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-paper transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-ink)_90%,transparent)]"
      >
        <span className="text-[13.5px] font-semibold">
          <span className="text-brass">{t(locale, "dashboard.overview.recs.startHereLabel")}</span> {t(locale, "dashboard.overview.recs.startHere")}
        </span>
        <IconArrowRight size={16} className="shrink-0 text-brass" aria-hidden />
      </Link>

      {/* Equal height with "Since your last scan": if this side is
          shorter, its list centers rather than leaving a gap. */}
      <div className="flex flex-1 flex-col justify-center">
        {recommendations === null ? (
          <p className="mt-3 text-sm text-ink-soft">{t(locale, "dashboard.overview.recs.unavailable")}</p>
        ) : recommendations.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">{t(locale, "dashboard.overview.recs.empty")}</p>
        ) : (
          <ol className="mt-3 flex flex-col divide-y divide-paper-line">
            {recommendations.map((rec) => (
              <li key={rec.key} className="flex gap-3 py-3 first:pt-1 last:pb-1">
                <RecIcon rec={rec} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {/* Pill + points sit in the same top-right spot on every
                      item (stacked, so long text never pushes them around). */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <RecText rec={rec} />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {rec.priority && <PriorityTag priority={rec.priority} />}
                      <span className="whitespace-nowrap text-[12px] font-semibold tabular-nums text-ink">{recPointsText(locale, rec)}</span>
                    </div>
                  </div>
                  <Link
                    href={rec.href}
                    // Same-page anchors (a listing check's row in the
                    // breakdown) don't fire "hashchange" under client navigation.
                    onClick={() => setTimeout(() => window.dispatchEvent(new Event(ANCHOR_HIGHLIGHT_EVENT)), 150)}
                    className={LINK_PILL_CLASS}
                  >
                    {rec.linkLabel ? t(locale, rec.linkLabel) : t(locale, "dashboard.overview.recs.seeCheck")}
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <p className="mt-3 border-t border-paper-line pt-3 text-[11.5px] text-ink-soft">
        {t(locale, "dashboard.overview.recs.priorityNote", { high: HIGH_PRIORITY_POINTS, medium: MEDIUM_PRIORITY_POINTS })}
      </p>
    </section>
  );
}
