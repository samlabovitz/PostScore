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
  ratingCaption,
  ratingProgressPercent,
  reviewCountCaption,
  reviewCountProgressPercent,
} from "@/lib/reviews";
import { GetMoreReviews } from "./GetMoreReviews";
import type { ReviewsPageData } from "@/app/actions/reviews";
import { t, useLocale } from "@/lib/i18n";

function StatCard({
  icon: Icon,
  label,
  value,
  percent,
  caption,
}: {
  icon: typeof IconStar;
  label: string;
  value: string;
  percent: number | null;
  caption: string;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        <Icon size={14} />
        {label}
      </div>
      <div className="font-serif text-4xl font-bold text-ink">{value}</div>
      <ProgressBar percent={percent} />
      <p className="text-[12.5px] text-ink-mute">{caption}</p>
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
      <div className="grid grid-cols-1 gap-5 nav:grid-cols-2">
        <StatCard
          icon={IconStar}
          label={t(locale, "dashboard.websiteReviews.avgRatingLabel")}
          value={rating !== null ? `${rating.toFixed(1)} ★` : "—"}
          percent={ratingProgressPercent(rating)}
          caption={ratingCaption(rating)}
        />
        <StatCard
          icon={IconMessages}
          label={t(locale, "dashboard.websiteReviews.reviewVolumeLabel")}
          value={reviewCount !== null ? reviewCount.toLocaleString() : "—"}
          percent={reviewCountProgressPercent(reviewCount)}
          caption={reviewCountCaption(reviewCount)}
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
}: {
  businessId: string;
  reviews: ReviewsPageData;
}) {
  const locale = useLocale();
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
        <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">
          {t(locale, "dashboard.websiteReviews.pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">{t(locale, "dashboard.websiteReviews.subtitle")}</p>
      </div>

      <GetMoreReviews
        businessName={reviews.businessName ?? t(locale, "dashboard.websiteReviews.businessNameFallback")}
        placeId={reviews.placeId}
      />

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
