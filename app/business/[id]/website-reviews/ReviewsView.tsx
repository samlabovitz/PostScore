"use client";

import Link from "next/link";
import { IconArrowLeft, IconMessageCircle, IconStar } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { CategoryCard } from "@/components/scoring/CategoryCard";
import {
  ratingCaption,
  ratingProgressPercent,
  reviewCountCaption,
  reviewCountProgressPercent,
} from "@/lib/reviews";
import { GetMoreReviews } from "./GetMoreReviews";
import type { ReviewsPageData } from "@/app/actions/reviews";

function ReviewSocialProof({
  rating,
  reviewCount,
}: {
  rating: number | null;
  reviewCount: number | null;
}) {
  return (
    <Card className="p-5">
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        Your review social proof
      </div>
      <div className="mt-4 grid grid-cols-1 gap-6 nav:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-ink">Average rating</span>
            <span className="text-sm tabular-nums text-ink-soft">
              {rating !== null ? `${rating.toFixed(1)} ★` : "—"}
            </span>
          </div>
          <ProgressBar percent={ratingProgressPercent(rating)} />
          <p className="text-[12.5px] text-ink-mute">{ratingCaption(rating)}</p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-ink">Review count</span>
            <span className="text-sm tabular-nums text-ink-soft">
              {reviewCount !== null ? reviewCount.toLocaleString() : "—"}
            </span>
          </div>
          <ProgressBar percent={reviewCountProgressPercent(reviewCount)} />
          <p className="text-[12.5px] text-ink-mute">{reviewCountCaption(reviewCount)}</p>
        </div>
      </div>
      <p className="mt-4 border-t border-paper-line pt-3 text-[12px] text-ink-mute">
        Rating and volume work together, not separately: a great rating from a handful of reviews
        doesn&apos;t carry much weight — customers (and Google) trust it more once it&apos;s backed
        by real volume. Building both together does more for how you&apos;re perceived than either
        alone.
      </p>
    </Card>
  );
}

function ReplyAssistantComingSoon() {
  return (
    <Card className="flex items-start gap-3 p-4 opacity-70">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink/5 text-ink-mute">
        <IconMessageCircle size={16} />
      </span>
      <div>
        <div className="text-[13px] font-semibold text-ink">
          Reply assistant
          <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-mute">
            Coming soon
          </span>
        </div>
        <p className="mt-0.5 text-[12.5px] text-ink-mute">
          Drafting replies to your actual reviews needs deeper Google Business Profile access than
          we have today — we only get your rating and review count, not individual review content or
          authors. We won&apos;t show you reviews to reply to until we can show real ones.
        </p>
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
  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div>
        <Link
          href={`/business/${businessId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
        >
          <IconArrowLeft size={15} />
          Back to {reviews.businessName ?? "business"}
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">
          Reviews & Replies
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Everything here is your real Google data, or clearly labeled as coming soon — nothing
          fabricated.
        </p>
      </div>

      <ReviewSocialProof rating={reviews.rating} reviewCount={reviews.reviewCount} />

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-2">
        <StatTile
          label="Rating"
          value={reviews.rating !== null ? `${reviews.rating.toFixed(1)} ★` : "—"}
        />
        <StatTile
          label="Total reviews"
          value={reviews.reviewCount !== null ? reviews.reviewCount.toLocaleString() : "—"}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
          <IconStar size={13} />
          The rubric behind your review score
        </div>
        <CategoryCard category={reviews.visibilityCategory} />
      </div>

      <GetMoreReviews businessName={reviews.businessName ?? "Your business"} placeId={reviews.placeId} />

      <ReplyAssistantComingSoon />
    </div>
  );
}
