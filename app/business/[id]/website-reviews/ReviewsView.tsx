"use client";

import Link from "next/link";
import { IconArrowLeft, IconMessage2, IconMessageCircle, IconMessages, IconStar } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CategoryCard } from "@/components/scoring/CategoryCard";
import { ConnectToUnlockCard } from "@/components/gbp/ConnectToUnlock";
import {
  RATING_TARGET,
  REVIEW_COUNT_MILESTONE,
  ratingCaption,
  ratingProgressPercent,
  reviewCountCaption,
  reviewCountProgressPercent,
} from "@/lib/reviews";
import { GetMoreReviews } from "./GetMoreReviews";
import type { ReviewsPageData } from "@/app/actions/reviews";
import type { Plan } from "@/lib/plan";
import { DevPlanSwitch } from "@/components/studio/DevPlanSwitch";
import { formatCount, t, useLocale } from "@/lib/i18n";
import { useScrollToHash } from "@/lib/useScrollToHash";

function StatCard({
  icon: Icon,
  label,
  value,
  percent,
  target,
  caption,
}: {
  icon: typeof IconStar;
  label: string;
  value: string;
  percent: number | null;
  /** Shown at the bar's right end, e.g. "4.5★ of 5" / "15 of 150". */
  target: string | null;
  caption: string;
}) {
  return (
    <Card className="flex flex-col gap-2 p-4 sm:p-5">
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        <Icon size={14} className="text-brass" aria-hidden />
        {label}
      </div>
      <div className="font-serif text-[34px] font-bold leading-none text-ink">{value}</div>
      <div className="mt-1 flex items-center gap-3">
        <ProgressBar percent={percent} className="h-1.5 flex-1" />
        {target && <span className="shrink-0 text-[12px] font-medium tabular-nums text-ink-soft">{target}</span>}
      </div>
      <p className="text-[12.5px] leading-snug text-ink-mute">{caption}</p>
    </Card>
  );
}

function ReviewSocialProof({
  rating,
  reviewCount,
}: {
  rating: number | null;
  reviewCount: number | null;
}) {
  const locale = useLocale();
  return (
    <div>
      <SectionHeading title={t(locale, "dashboard.websiteReviews.socialProofHeading")} className="mb-4" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          icon={IconStar}
          label={t(locale, "dashboard.websiteReviews.avgRatingLabel")}
          value={rating !== null ? `${rating.toFixed(1)} ★` : "—"}
          percent={ratingProgressPercent(rating)}
          target={rating !== null ? t(locale, "dashboard.websiteReviews.socialProof.ofRating", { rating: rating.toFixed(1) }) : null}
          caption={ratingCaption(rating, locale)}
        />
        <StatCard
          icon={IconMessages}
          label={t(locale, "dashboard.websiteReviews.reviewVolumeLabel")}
          value={reviewCount !== null ? formatCount(reviewCount, locale) : "—"}
          percent={reviewCountProgressPercent(reviewCount)}
          target={
            reviewCount !== null
              ? t(locale, "dashboard.websiteReviews.socialProof.ofReviews", {
                  count: formatCount(reviewCount, locale),
                  target: formatCount(REVIEW_COUNT_MILESTONE, locale),
                })
              : null
          }
          caption={reviewCountCaption(reviewCount, locale)}
        />
      </div>

      <div className="mt-5 rounded-xl bg-paper-deep/40 p-4">
        <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.websiteReviews.ratingVolumeExplainer")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-ink-mute">{t(locale, "dashboard.websiteReviews.forExampleLabel")}</span>
          <Pill variant="green">
            {t(locale, "dashboard.websiteReviews.exampleStrongTrust", { target: RATING_TARGET })}
          </Pill>
          <Pill variant="amber">
            {t(locale, "dashboard.websiteReviews.exampleBuildingTrust", { target: RATING_TARGET })}
          </Pill>
        </div>
      </div>
    </div>
  );
}

function ComingSoonCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof IconMessage2;
  title: string;
  body: string;
}) {
  const locale = useLocale();
  return (
    <Card className="flex items-start gap-3 p-4 opacity-70">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink/5 text-ink-mute">
        <Icon size={16} />
      </span>
      <div>
        <div className="text-[13px] font-semibold text-ink">
          {title}
          <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-mute">
            {t(locale, "dashboard.websiteReviews.comingSoonLabel")}
          </span>
        </div>
        <p className="mt-0.5 text-[12.5px] text-ink-mute">{body}</p>
      </div>
    </Card>
  );
}

export function ReviewsView({
  businessId,
  reviews,
  plan = "free",
  devPlanSwitch = false,
}: {
  businessId: string;
  reviews: ReviewsPageData;
  plan?: Plan;
  /** Show the dev-only plan switch (the page passes true only in local dev). */
  devPlanSwitch?: boolean;
}) {
  const locale = useLocale();
  // A link straight to #get-more-reviews (e.g. the Overview page's
  // growth strip) needs this — see useScrollToHash's own doc comment.
  useScrollToHash();
  return (
    <div className="flex flex-col gap-8 nav:gap-10">
      <div>
        <Link
          href={`/business/${businessId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
        >
          <IconArrowLeft size={15} />
          {t(locale, "dashboard.websiteReviews.backTo", {
            name: reviews.businessName ?? t(locale, "dashboard.websiteReviews.businessFallback"),
          })}
        </Link>
        <h1 className="mt-1.5 font-serif text-2xl font-semibold text-ink nav:text-[27px]">
          {t(locale, "dashboard.websiteReviews.pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">{t(locale, "dashboard.websiteReviews.subtitle")}</p>
      </div>

      {devPlanSwitch && <DevPlanSwitch plan={plan} backPath={`/business/${businessId}/website-reviews`} />}

      <div id="get-more-reviews" className="scroll-mt-20">
        <GetMoreReviews
          businessId={businessId}
          businessName={reviews.businessName}
          placeId={reviews.placeId}
          rating={reviews.rating}
          reviewCount={reviews.reviewCount}
          verifiedSocials={reviews.verifiedSocials}
          plan={plan}
        />
      </div>

      <ReviewSocialProof rating={reviews.rating} reviewCount={reviews.reviewCount} />

      <div>
        <SectionHeading title={t(locale, "dashboard.websiteReviews.rubricHeading")} className="mb-4" />
        <CategoryCard category={reviews.visibilityCategory} />
      </div>

      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
          {t(locale, "dashboard.websiteReviews.replyAssistantLabel")}
        </div>
        {reviews.gbpConnected ? (
          <ComingSoonCard
            icon={IconMessageCircle}
            title={t(locale, "dashboard.websiteReviews.replyAssistantLabel")}
            body={t(locale, "dashboard.websiteReviews.replyAssistantConnectedBody")}
          />
        ) : (
          <ConnectToUnlockCard
            businessId={businessId}
            title={t(locale, "dashboard.websiteReviews.replyAssistantLabel")}
            description={t(locale, "dashboard.websiteReviews.replyAssistantUnlockDescription")}
          />
        )}
      </div>

      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
          {t(locale, "dashboard.websiteReviews.comingSoonLabel")}
        </div>
        <div className="flex flex-col gap-3">
          <ComingSoonCard
            icon={IconMessage2}
            title={t(locale, "dashboard.websiteReviews.autoTextTitle")}
            body={t(locale, "dashboard.websiteReviews.autoTextBody")}
          />
        </div>
      </div>
    </div>
  );
}
