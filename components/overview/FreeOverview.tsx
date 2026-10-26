"use client";

// The Overview's Free pieces ("Free = a digital audit"). Everything here is
// either a real, working free feature (the review link & QR, the review
// gap, the rank line) or a LockedPreview that shows only a title, a real
// count and its own unlock line — the locked content itself is never put
// into the page. Nothing here makes a paid call. Grow and above never
// render these.

import { useState } from "react";
import { FREE_REPLY_DRAFTS } from "@/lib/reviewReplies";
import {
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconLink,
  IconStar,
} from "@tabler/icons-react";
import { buildGoogleReviewUrl, shortReviewLink } from "@/lib/reviews";
import { NO_FACTS, unlockLine } from "@/lib/upgradePromos";
import { formatCount, t, useLocale, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { LockFooter } from "@/components/plan/LockedPreview";
import { useUpgrade } from "@/components/upgrade/UpgradeContext";
import { reviewStatLine } from "@/components/overview/GrowMoreCustomers";
import { reviewGoalText } from "@/lib/reviewGoal";
import type { ReviewGoal } from "@/lib/competitorComparison";
import { copyText, ReviewQrTile } from "@/app/business/[id]/website-reviews/GetMoreReviews";
import { GoogleMapsAttribution } from "@/components/google/GoogleMapsAttribution";

/** "3 fixes · 13 pts" — real counts only; null when there's nothing. */
export function fixesSummary(count: number, points: number | null, locale: Locale): string | null {
  if (count <= 0) return null;
  const pts = points !== null && points > 0 ? points : 0;
  return count === 1 ? t(locale, "dashboard.free.sumFixesOne", { points: pts }) : t(locale, "dashboard.free.sumFixes", { count, points: pts });
}

/** PostAI on Free: a showroom — the chat panel with their real starter
 * questions and ONE clearly labeled, generic example answer. Nothing is
 * sent: the questions, the box and Send open the promo box, and the server
 * refuses PostAI on Free anyway (app/actions/assistant.ts). No AI call. */
/** A Free Overview section: a heading and one plain sentence, then its
 * cards (same style for every section). */
export function FreeSection({ id, title, body, children }: { id: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <section data-testid={`free-section-${id}`} aria-labelledby={`free-section-${id}-title`} className="flex flex-col gap-3">
      <div>
        <h2 id={`free-section-${id}-title`} className="font-serif text-xl font-semibold text-ink">
          {title}
        </h2>
        <p className="text-[13px] text-ink-soft">{body}</p>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Reviews on Free — all of it works: rating and count, the real review
 * gap vs nearby (the shared nearbyReviewAverage), the review link (copy,
 * open) and the QR code (PNG download). */
export function FreeReviews({
  placeId,
  rating,
  reviewCount,
  goal,
  group,
  connect = null,
  children,
}: {
  /** Connect Google for the "Replying to reviews" check (GbpReplyCheckConnect), right under the header. */
  connect?: React.ReactNode;
  placeId: string | null;
  rating: number | null;
  reviewCount: number | null;
  /** The shared review goal (beat the leader) and its comparison group. */
  goal: ReviewGoal | null;
  group: string | null;
  /** "Reply to a review" (the AI reply drafter), at the bottom. */
  children?: React.ReactNode;
}) {
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const trailing = goal !== null && goal.kind !== "lead";
  const text = goal && group ? reviewGoalText(goal, group, locale) : null;
  const reviewUrl = placeId ? buildGoogleReviewUrl(placeId) : null;

  return (
    <section id="free-reviews" data-testid="free-reviews" data-trailing={trailing || undefined} className="flex scroll-mt-20 flex-col gap-4 rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <div className="flex min-w-0 gap-3">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ps-icon-tile">
          <IconStar size={20} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.free.reviewHeading")}</h2>
          {children && <p data-testid="reviews-what" className="text-[13px] text-ink-soft">{t(locale, "dashboard.free.reviewsWhat", { count: FREE_REPLY_DRAFTS })}</p>}
          {rating !== null && reviewCount !== null && (
            <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.free.reviewsRatingCount", { rating: rating.toFixed(1), count: formatCount(reviewCount, locale) })}</p>
          )}
          {text ? (
            <>
              <p className="text-[13px] text-ink-soft" data-testid="review-average">{text.average}</p>
              <p className={cn("text-[13.5px] font-semibold leading-snug", trailing ? "text-amber" : "text-green")} data-testid="review-goal">
                {text.goal}
              </p>
              {text.nextUp && <p className="text-[13px] text-ink" data-testid="review-next-up">{text.nextUp}</p>}
            </>
          ) : (
            <p className="text-[13.5px] font-medium leading-snug text-ink">{reviewStatLine(reviewCount, null, locale)}</p>
          )}
          <p className="text-[12.5px] text-ink-soft">{t(locale, "dashboard.free.reviewWhy")}</p>
        </div>
      </div>
      {connect}
      {reviewUrl && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center">
          <div className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-[color:color-mix(in_srgb,var(--color-brass)_28%,white)] bg-paper p-4">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-soft">{t(locale, "dashboard.websiteReviews.hero.linkLabel")}</div>
            <div title={reviewUrl} className="flex min-w-0 items-center gap-2 rounded-lg border border-paper-line bg-white px-3 py-2 text-[13px] text-ink">
              <IconLink size={15} aria-hidden className="shrink-0 text-brass" />
              <span className="truncate" data-testid="free-review-link">
                {shortReviewLink(reviewUrl)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async () => setCopied(await copyText(reviewUrl))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brass bg-brass px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-[#a5772a]"
              >
                <IconCopy size={14} aria-hidden />
                {copied ? t(locale, "dashboard.websiteReviews.hero.copied") : t(locale, "dashboard.websiteReviews.hero.copy")}
              </button>
              <a href={reviewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-soft">
                <IconExternalLink size={14} aria-hidden />
                {t(locale, "dashboard.websiteReviews.hero.open")}
              </a>
              <button
                type="button"
                onClick={async () => {
                  const { downloadQrPng } = await import("@/lib/signStudio/output");
                  await downloadQrPng(reviewUrl);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-soft"
              >
                <IconDownload size={14} aria-hidden />
                {t(locale, "dashboard.free.downloadQr")}
              </button>
            </div>
          </div>
          <div className="flex justify-center">
            <ReviewQrTile reviewUrl={reviewUrl} label={t(locale, "dashboard.websiteReviews.hero.scanLabel")} />
          </div>
        </div>
      )}
      {children}
      {/* The rating, count and nearby numbers come from Google. */}
      <GoogleMapsAttribution className="mt-0" />
    </section>
  );
}

/** "You're #N of M nearby…" under the rank, only when they trail. */
export function RankUnlockLine() {
  const locale = useLocale();
  const facts = useUpgrade()?.facts ?? NO_FACTS;
  const line = unlockLine("rank", facts, locale);
  if (!line) return null;
  return (
    <LockFooter testId="rank-unlock" line={line} feature="grow" inset className="mt-4" />
  );
}

