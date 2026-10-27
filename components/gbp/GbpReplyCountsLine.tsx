"use client";

import { replyCountsView, type GbpReplyCounts } from "@/lib/gbpReviewReplies";
import { formatShortDate, t, useLocale, useTimeZone } from "@/lib/i18n";

/** "You've replied to A of B reviews · Lately: X of your last Y" — counts
 * only, from the owner's connected Google profile. Not scored yet. Counts
 * saved before the all-time columns existed show the recent line alone. */
export function GbpReplyCountsLine({ counts }: { counts: GbpReplyCounts | null }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const view = replyCountsView(counts);
  if (view.kind === "none") return null;
  const c = counts!;
  const allTime = c.allTimeReviews !== null && c.allTimeReplied !== null ? { allReplied: c.allTimeReplied, allReviews: c.allTimeReviews } : null;
  const date = formatShortDate(c.checkedAt, locale, timeZone);
  const checked = <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.gbpReplyCounts.checked", { date })}</p>;
  if (view.kind === "too_few") {
    return (
      <div data-testid="gbp-reply-counts" className="flex flex-col gap-0.5">
        {allTime && <p className="text-[13px] font-medium text-ink">{t(locale, "dashboard.gbpReplyCounts.allTimeOnly", allTime)}</p>}
        <p className="text-[12.5px] text-ink-soft">{t(locale, "dashboard.gbpReplyCounts.tooFew")}</p>
        {allTime && checked}
      </div>
    );
  }
  const recent = { replied: c.replied, count: c.reviewsInWindow };
  return (
    <div data-testid="gbp-reply-counts" className="flex flex-col gap-0.5">
      {allTime ? (
        <>
          <p className="text-[13px] font-medium text-ink">
            {t(locale, c.allTimeCapped ? "dashboard.gbpReplyCounts.allTimeCapped" : "dashboard.gbpReplyCounts.allTime", { ...allTime, ...recent })}
          </p>
          {checked}
        </>
      ) : (
        <p className="text-[13px] font-medium text-ink">{t(locale, "dashboard.gbpReplyCounts.line", { ...recent, date })}</p>
      )}
      {view.templated && (
        <p data-testid="gbp-reply-templated" className="text-[12.5px] text-amber">
          {t(locale, "dashboard.gbpReplyCounts.templated")}
        </p>
      )}
    </div>
  );
}
