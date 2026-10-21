"use client";

// The Overview's Free pieces ("Free = a digital audit"). Everything here is
// either a real, working free feature (the review link & QR, the review
// gap, the rank line) or a LockedPreview that shows only a title, a real
// count and its own unlock line — the locked content itself is never put
// into the page. Nothing here makes a paid call. Grow and above never
// render these.

import { useState } from "react";
import {
  IconBrandGoogle,
  IconCalendarCheck,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconFileText,
  IconLayout,
  IconLink,
  IconListCheck,
  IconLock,
  IconMessageCircle,
  IconRefresh,
  IconSparkles,
  IconSpeakerphone,
  IconStar,
  IconTag,
  IconTools,
  IconWorldWww,
} from "@tabler/icons-react";
import { buildGoogleReviewUrl, shortReviewLink } from "@/lib/reviews";
import { NO_FACTS, unlockLine } from "@/lib/upgradePromos";
import { formatCount, t, useLocale, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { LockFooter, LockedPreview } from "@/components/plan/LockedPreview";
import { useUpgrade } from "@/components/upgrade/UpgradeContext";
import { UpgradeButton } from "@/components/upgrade/UpgradeTrigger";
import { reviewStatLine } from "@/components/overview/GrowMoreCustomers";
import { reviewGoalText } from "@/lib/reviewGoal";
import type { ReviewGoal } from "@/lib/competitorComparison";
import { copyText, ReviewQrTile } from "@/app/business/[id]/website-reviews/GetMoreReviews";

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
export function FreePostAIShowroom({ starterPrompts }: { starterPrompts: string[] }) {
  const locale = useLocale();
  const facts = useUpgrade()?.facts ?? NO_FACTS;
  const line = unlockLine("postai", facts, locale);
  return (
    <section data-testid="postai-showroom" className="flex flex-col gap-3 rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
          <IconSparkles size={17} />
        </span>
        <div className="min-w-0">
          <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.free.postaiTitle")}</h2>
          <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.free.postaiBody")}</p>
        </div>
      </div>
      {starterPrompts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {starterPrompts.slice(0, 3).map((prompt) => (
            <UpgradeButton key={prompt} feature="grow" className="rounded-full border border-paper-deep bg-paper px-3 py-1 text-left text-[12.5px] text-ink hover:border-ink-soft">
              {prompt}
            </UpgradeButton>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 rounded-xl bg-paper p-3" data-testid="postai-example">
        <div className="self-end rounded-2xl rounded-br-md bg-ink px-3 py-2 text-[13px] text-white">{t(locale, "dashboard.free.postaiExampleQuestion")}</div>
        <div className="flex flex-col gap-1 self-start rounded-2xl rounded-bl-md border border-paper-deep bg-white px-3 py-2">
          <span className="w-fit rounded-full bg-[color:color-mix(in_srgb,var(--color-brass)_18%,white)] px-2 py-px text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink">
            {t(locale, "dashboard.free.postaiExampleLabel")}
          </span>
          <p className="text-[13px] leading-snug text-ink">{t(locale, "dashboard.free.postaiExampleAnswer")}</p>
          <p className="text-[11.5px] text-ink-mute">{t(locale, "dashboard.free.postaiExampleNote")}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <UpgradeButton feature="grow" testId="postai-input" className="flex min-w-0 flex-1 items-center rounded-lg border border-paper-deep bg-white px-3 py-2 text-left text-[13px] text-ink-mute">
          <span className="truncate">{t(locale, "dashboard.free.postaiPlaceholder")}</span>
        </UpgradeButton>
        <UpgradeButton feature="grow" testId="postai-send" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white">
          <IconLock size={13} aria-hidden />
          {t(locale, "dashboard.free.postaiSend")}
        </UpgradeButton>
      </div>
      <LockFooter line={line} feature="grow" inset />
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
}: {
  placeId: string | null;
  rating: number | null;
  reviewCount: number | null;
  /** The shared review goal (beat the leader) and its comparison group. */
  goal: ReviewGoal | null;
  group: string | null;
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

/** "Unlock more with a plan": every plan-only feature as a locked tile —
 * its plan chip, a real count where there is one, skeleton rows with the
 * feature's real icon (the advice itself is never in the page), and its
 * OWN unlock line and promo box. 2 columns on desktop, 1 on a phone. */
export function UnlockMore({
  fixCount,
  fixPoints,
  hasWebsite,
  websiteChecks,
  pricingOk = true,
}: {
  fixCount: number;
  fixPoints: number | null;
  hasWebsite: boolean;
  websiteChecks: number;
  pricingOk?: boolean;
}) {
  const locale = useLocale();
  const facts = useUpgrade()?.facts ?? NO_FACTS;
  const line = (id: Parameters<typeof unlockLine>[0]) => unlockLine(id, facts, locale);
  const premium = t(locale, "dashboard.settings.plan.name.premium");
  return (
    <section data-testid="unlock-more" className="flex flex-col gap-3">
      <div>
        <h2 className="font-serif text-xl font-semibold text-ink">{t(locale, "dashboard.free.unlockMoreHeading")}</h2>
        <p className="mt-0.5 text-[13px] text-ink-soft">{t(locale, "dashboard.free.unlockMoreSub")}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <LockedPreview icon={IconListCheck} title={t(locale, "dashboard.free.actionPlanTitle")} summary={fixesSummary(fixCount, fixPoints, locale)} unlock={line("plan")} rows={Math.min(Math.max(fixCount, 2), 4)} />
        <LockedPreview icon={IconCalendarCheck} title={t(locale, "dashboard.growth.checklist.sectionHeading")} summary={t(locale, "dashboard.free.sumHabits", { count: 5 })} unlock={line("routine")} />
        {hasWebsite && (
          <LockedPreview
            icon={IconTools}
            title={t(locale, "dashboard.free.tile.fixGuides", { builder: facts.builderName ?? t(locale, "dashboard.free.tile.yourWebsite") })}
            summary={websiteChecks > 0 ? t(locale, "dashboard.free.sumChecks", { count: websiteChecks }) : null}
            unlock={line("website") ?? line("websiteFixes")}
            rows={Math.min(Math.max(websiteChecks, 2), 4)}
          />
        )}
        {hasWebsite && <LockedPreview icon={IconRefresh} title={t(locale, "dashboard.websiteRecheck.button")} unlock={line("recheck")} feature="recheck" rows={2} />}
        <LockedPreview icon={IconLayout} title={t(locale, "dashboard.free.showroom.starterSite")} unlock={line("starterSite")} rows={2} />
        {pricingOk && <LockedPreview icon={IconTag} title={t(locale, "dashboard.free.showroom.priceCheck")} unlock={line("priceCheck")} rows={3} />}
        <LockedPreview icon={IconFileText} title={t(locale, "dashboard.free.tile.reports")} summary={t(locale, "dashboard.free.tile.reportsPdf")} unlock={line("reportsPremium")} rows={2} />
        <LockedPreview icon={IconSpeakerphone} title={t(locale, "dashboard.free.tile.hub")} unlock={line("hub")} feature="campaignHub" soon rows={3} />
        <LockedPreview icon={IconBrandGoogle} title={t(locale, "dashboard.free.tile.google")} unlock={line("connect")} feature="googleProfile" soon rows={2} />
        <LockedPreview
          icon={IconMessageCircle}
          title={t(locale, "dashboard.free.tile.aiReplies")}
          summary={facts.reviewCount ? t(locale, "dashboard.free.tile.reviewsCount", { count: facts.reviewCount }) : null}
          unlock={line("aiReplies")}
          feature="premium"
          planLabel={premium}
          soon
          rows={3}
        />
        <LockedPreview icon={IconSparkles} title={t(locale, "dashboard.free.tile.postaiUnlimited")} unlock={line("postaiUnlimited")} feature="premium" planLabel={premium} rows={2} />
        <LockedPreview
          icon={IconWorldWww}
          title={t(locale, "dashboard.overview.postStudio.title")}
          summary={t(locale, "dashboard.free.tile.postStudioPrice")}
          unlock={line("postStudio")}
          feature="postStudio"
          planLabel={t(locale, "dashboard.free.tile.addOn")}
          soon
          rows={2}
        />
      </div>
    </section>
  );
}
