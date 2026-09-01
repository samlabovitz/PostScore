"use client";

import Link from "next/link";
import { IconArrowLeft, IconMessage2, IconMessageCircle, IconMessages, IconStar } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CategoryCard } from "@/components/scoring/CategoryCard";
import {
  RATING_TARGET,
  ratingCaption,
  ratingProgressPercent,
  reviewCountCaption,
  reviewCountProgressPercent,
} from "@/lib/reviews";
import { GetMoreReviews } from "./GetMoreReviews";
import type { ReviewsPageData } from "@/app/actions/reviews";

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
  return (
    <div>
      <SectionHeading title="Your review social proof" className="mb-4" />
      <div className="grid grid-cols-1 gap-5 nav:grid-cols-2">
        <StatCard
          icon={IconStar}
          label="Average rating"
          value={rating !== null ? `${rating.toFixed(1)} ★` : "—"}
          percent={ratingProgressPercent(rating)}
          caption={ratingCaption(rating)}
        />
        <StatCard
          icon={IconMessages}
          label="Review volume"
          value={reviewCount !== null ? reviewCount.toLocaleString() : "—"}
          percent={reviewCountProgressPercent(reviewCount)}
          caption={reviewCountCaption(reviewCount)}
        />
      </div>

      <div className="mt-5 rounded-xl bg-paper-deep/40 p-4">
        <p className="text-[13px] text-ink-soft">
          Rating and volume work together, not separately: a great rating from a handful of reviews
          doesn&apos;t carry much weight — customers (and Google) trust it more once it&apos;s backed
          by real volume. Building both together does more for how you&apos;re perceived than either
          alone.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-ink-mute">For example:</span>
          <Pill variant="green">{RATING_TARGET}★ from 200 reviews — strong trust</Pill>
          <Pill variant="amber">{RATING_TARGET}★ from 5 reviews — still building trust</Pill>
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
  return (
    <Card className="flex items-start gap-3 p-4 opacity-70">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink/5 text-ink-mute">
        <Icon size={16} />
      </span>
      <div>
        <div className="text-[13px] font-semibold text-ink">
          {title}
          <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-mute">
            Coming soon
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
  return (
    <div className="flex flex-col gap-8 nav:gap-10">
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

      <GetMoreReviews businessName={reviews.businessName ?? "Your business"} placeId={reviews.placeId} />

      <ReviewSocialProof rating={reviews.rating} reviewCount={reviews.reviewCount} />

      <div>
        <SectionHeading title="The rubric behind your review score" className="mb-4" />
        <CategoryCard category={reviews.visibilityCategory} />
      </div>

      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
          Coming soon
        </div>
        <div className="flex flex-col gap-3">
          <ComingSoonCard
            icon={IconMessage2}
            title="Auto-text customers after their visit"
            body="Automatically texting a review link after a visit needs a way to know who visited and when — we don't have that yet. For now, sharing the link or sign above is on you."
          />
          <ComingSoonCard
            icon={IconMessageCircle}
            title="Reply assistant"
            body="Drafting replies to your actual reviews needs deeper Google Business Profile access than we have today — we only get your rating and review count, not individual review content or authors. We won't show you reviews to reply to until we can show real ones."
          />
        </div>
      </div>
    </div>
  );
}
