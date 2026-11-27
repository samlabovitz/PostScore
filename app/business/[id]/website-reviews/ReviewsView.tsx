"use client";

import Link from "next/link";
import { IconArrowLeft, IconCrown, IconMessage2, IconMessageCircle, IconMessages, IconStar } from "@tabler/icons-react";
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
import { ReviewGuide } from "@/components/reviews/ReviewGuide";
import { CounterTools } from "@/components/reviews/CounterTools";
import type { ReviewsPageData } from "@/app/actions/reviews";
import { isPremiumPlan, type Plan } from "@/lib/plan";
import { reviewGoalText } from "@/lib/reviewGoal";
import type { ReviewGoal } from "@/lib/competitorComparison";
import { formatCount, t, tPlural, useLocale } from "@/lib/i18n";
import { googleWritesCopy } from "@/lib/googleWritesLaunch";
import { useScrollToHash } from "@/lib/useScrollToHash";
import { ReviewReplyDrafter } from "@/components/reviews/ReviewReplyDrafter";
import type { reviewsFixSummary } from "@/lib/fixPlan";
import { fixPlanHref, getReviewsHref, NEW_PAGES_LIVE } from "@/lib/routes";
import { IconArrowRight } from "@tabler/icons-react";
import { GoogleReviewsInbox } from "@/components/reviews/GoogleReviewsInbox";
import { LockedPreview } from "@/components/plan/LockedPreview";
import { GoogleMapsAttribution } from "@/components/google/GoogleMapsAttribution";
import type { ReplyDraftStatus } from "@/app/actions/reviewReplies";
import { GbpReplyCheckConnect, type GbpReplyCheckState } from "@/components/gbp/GbpReplyCheckConnect";
import { LiveUnavailableNote } from "@/components/LiveUnavailableNote";

function StatCard({
  icon: Icon,
  label,
  value,
  percent,
  target,
  caption,
  action = null,
}: {
  icon: typeof IconStar;
  label: string;
  value: string;
  percent: number | null;
  /** Shown at the bar's right end, e.g. "4.5★ of 5" / "15 of 150". */
  target: string | null;
  caption: string;
  /** Under the caption (the new design's "Get more reviews (in Growth) →"). */
  action?: React.ReactNode;
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
      {action}
    </Card>
  );
}

/** The new design's one way into Growth from Reviews: a gold primary button to the review link & QR. */
function GetMoreReviewsButton({ businessId, testId }: { businessId: string; testId: string }) {
  const locale = useLocale();
  return (
    <Link href={getReviewsHref(businessId, { hash: "review-link" })} data-testid={testId} className="inline-flex w-fit max-w-full shrink-0 items-center gap-1 rounded-lg bg-brass px-3.5 py-2 text-[13.5px] font-semibold text-ink transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-brass)_85%,white)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
      {t(locale, "dashboard.reviewsSplit.getMore")}
      <IconArrowRight size={14} aria-hidden />
    </Link>
  );
}

function ReviewSocialProof({
  rating,
  reviewCount,
  getMore = null,
}: {
  rating: number | null;
  reviewCount: number | null;
  /** The new design: "Get more reviews (in Growth) →" in the Review volume card. */
  getMore?: string | null;
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
          action={getMore ? <GetMoreReviewsButton businessId={getMore} testId="reviews-get-more-volume" /> : null}
        />
      </div>
      <GoogleMapsAttribution />

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

/** The review gap vs nearby competitors — free on every plan: the area
 * average and the real goal (beat the leader / stretch / you lead), from
 * the shared reviewGoal (same competitors as the rank). */
export function ReviewGapLine({ goal, group }: { goal: ReviewGoal | null; group: string | null }) {
  const locale = useLocale();
  if (!goal || !group) return null;
  const text = reviewGoalText(goal, group, locale);
  return (
    <div data-testid="review-gap" data-trailing={goal.kind !== "lead" || undefined} className="mt-4 flex flex-col gap-1 rounded-lg border border-paper-deep bg-white px-4 py-3">
      <p className="text-[13px] text-ink-soft">{text.average}</p>
      <p className="text-[13.5px] font-semibold text-ink">{text.goal}</p>
      {text.stretch && <p className="text-[13px] text-ink">{text.stretch}</p>}
    </div>
  );
}

export function ReviewsView({
  businessId,
  reviews,
  plan = "free",
  nearby = null,
  replyDrafts = null,
  reviewRepliesPractice = false,
  gbpReplyCheck = null,
  split = false,
  fixLine = null,
}: {
  businessId: string;
  reviews: ReviewsPageData;
  /** Day 25B step 5 (new design): Presence → Reviews — what customers say
   * and your replies. The asking (link, QR, guide, counter tools, signs)
   * is on Growth → Get more reviews (GetReviewsView). */
  split?: boolean;
  /** "Fix these 2 and Visibility & Reputation goes 21 → 32 pts (score 78 → 89)" (lib/fixPlan.ts reviewsFixSummary). */
  fixLine?: ReturnType<typeof reviewsFixSummary>;
  plan?: Plan;
  /** The shared review goal and its comparison group, or null. */
  nearby?: { goal: ReviewGoal | null; group: string } | null;
  /** AI review reply drafts left (Grow and up; Free's page is a showroom). */
  replyDrafts?: ReplyDraftStatus | null;
  /** Practice mode (lib/gbpReviewPractice.ts): the Google reviews inbox on fake data, connected or not. */
  reviewRepliesPractice?: boolean;
  /** Grow: connect Google for the "Replying to reviews" check (null = hidden). */
  gbpReplyCheck?: GbpReplyCheckState | null;
}) {
  const locale = useLocale();
  // The Google reviews inbox (Premium + Google connected, or practice mode). Grow + connected sees it too: its
  // pre-drafted replies (up to the week's allowance), copied and posted on Google by the owner.
  const growInbox = plan === "grow" && reviews.gbpConnected && !reviewRepliesPractice;
  const inboxShowing = (isPremiumPlan(plan) && (reviews.gbpConnected || reviewRepliesPractice)) || growInbox;
  // A link straight to #get-more-reviews (e.g. the Overview page's
  // growth strip) needs this — see useScrollToHash's own doc comment.
  useScrollToHash();
  return (
    <div className="flex flex-col gap-8 nav:gap-10">
      <div>
        {/* New design: the sidebar handles navigation. */}
        {!NEW_PAGES_LIVE && (
          <Link
            href={`/business/${businessId}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
          >
            <IconArrowLeft size={15} />
            {t(locale, "dashboard.websiteReviews.backTo", {
              name: reviews.businessName ?? t(locale, "dashboard.websiteReviews.businessFallback"),
            })}
          </Link>
        )}
        <h1 className="flex flex-wrap items-baseline gap-x-3 mt-1.5 font-serif text-2xl font-semibold text-ink nav:text-[27px]">
          {t(locale, "dashboard.websiteReviews.pageTitle")}
          {/* Visibility & Reputation's whole points from the saved scan, as the Overview's breakdown shows them. */}
          {reviews.categoryPoints && (
            <span className="font-sans text-[15px] font-semibold text-ink-soft" data-testid="reviews-pts">
              {t(locale, "dashboard.googlePages.listing.pts", { earned: reviews.categoryPoints.earned, of: reviews.categoryPoints.of })}
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">{t(locale, split ? "dashboard.reviewsSplit.subtitle" : "dashboard.websiteReviews.subtitle")}</p>
      </div>

      {split ? (
        <ReviewsFixLine businessId={businessId} fixLine={fixLine} />
      ) : (
        <>
          <div id="get-more-reviews" className="scroll-mt-20">
            <GetMoreReviews
              businessId={businessId}
              businessName={reviews.businessName}
              placeId={reviews.placeId}
              verifiedSocials={reviews.verifiedSocials}
              plan={plan}
            />
          </div>

          <div id="review-guide" className="scroll-mt-20">
            <ReviewGuide placeId={reviews.placeId} locked={plan === "free"} />
          </div>

          <CounterTools plan={plan} />
        </>
      )}

      <div>
        {reviews.liveUnavailable && <LiveUnavailableNote />}
        <ReviewSocialProof rating={reviews.rating} reviewCount={reviews.reviewCount} getMore={split ? businessId : null} />
        <ReviewGapLine goal={nearby?.goal ?? null} group={nearby?.group ?? null} />
      </div>

      <div>
        <SectionHeading title={t(locale, "dashboard.websiteReviews.rubricHeading")} className="mb-4" />
        <CategoryCard category={reviews.visibilityCategory} gainPoints={split} />
        {/* Grow: connect Google for the read-only "Replying to reviews"
            check (null when switched off, and on Premium — Premium
            connects from the Google Profile page). */}
        {gbpReplyCheck && (
          <div className="mt-3">
            <GbpReplyCheckConnect businessId={businessId} state={gbpReplyCheck} />
          </div>
        )}
      </div>

      <div id="reply-to-reviews" className="scroll-mt-20">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
          {t(locale, "dashboard.websiteReviews.replyAssistantLabel")}
        </div>
        {/* Premium/Multi: what the plan includes for replies — posting to
            Google says Beta until it's on for everyone (lib/googleWritesLaunch.ts). */}
        {isPremiumPlan(plan) && (
          <p data-testid="ai-replies-soon" className="mb-2 flex items-start gap-2 rounded-lg border border-[color:color-mix(in_srgb,var(--color-brass)_45%,white)] bg-white px-3 py-2 text-[13px] text-ink">
            <IconCrown size={15} aria-hidden className="mt-0.5 shrink-0 text-brass" />
            {t(locale, googleWritesCopy("reviewsPlanLine"))}
          </p>
        )}
        {/* Premium + Google connected: the owner's Google reviews, replied to
            from here (posted only on their click). */}
        {inboxShowing && (
          <div className="mb-3">
            <GoogleReviewsInbox businessId={businessId} grow={growInbox} placeId={reviews.placeId} />
          </div>
        )}
        {/* Paste a review, PostAI drafts the reply (3 free; Premium unlimited). */}
        {/* Paste a review, PostAI drafts the reply. With the inbox showing,
            it's one line — for reviews from anywhere else. */}
        {replyDrafts &&
          (inboxShowing ? (
            <details data-testid="paste-box-collapsed" className="group mb-3 rounded-xl border border-paper-deep bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[13.5px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                {t(locale, "dashboard.googleReviews.pasteCollapsed")}
                <span aria-hidden className="text-ink-soft transition-transform group-open:rotate-90">▸</span>
              </summary>
              <div className="border-t border-paper-line p-1">
                <ReviewReplyDrafter businessId={businessId} plan={plan} placeId={reviews.placeId} initial={replyDrafts} inbox />
              </div>
            </details>
          ) : (
            <div className="mb-3">
              <ReviewReplyDrafter businessId={businessId} plan={plan} placeId={reviews.placeId} initial={replyDrafts} />
            </div>
          ))}
        {/* Free and Grow: a preview of replying from here. */}
        {growInbox ? null : !isPremiumPlan(plan) ? (
          <LockedPreview
            id="google-reviews"
            feature="replies"
            icon={IconMessageCircle}
            title={t(locale, "dashboard.googleReviews.previewTitle")}
            unlock={t(locale, "dashboard.googleReviews.previewUnlock")}
          />
        ) : reviews.gbpConnected || reviewRepliesPractice ? null : (
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

/** Presence → Reviews (new design): the review fixes' line — "Fix these 2 and
 * Visibility & Reputation goes 21 → 32 pts (score 78 → 89)", the rest as
 * reviews grow — and the way into Growth, the gold "Get more reviews (in Growth) →" (also in the Review volume card). */
function ReviewsFixLine({ businessId, fixLine }: { businessId: string; fixLine: ReturnType<typeof reviewsFixSummary> }) {
  const locale = useLocale();
  return (
    <div className="-mt-3 flex flex-col gap-3 rounded-xl border border-paper-deep bg-white px-4 py-3 text-[13.5px] text-ink sm:flex-row sm:items-center sm:justify-between" data-testid="reviews-fix-line">
      {fixLine && (
        <p className="min-w-0">
          <b>{tPlural(locale, "dashboard.reviewsSplit.fixLine", fixLine.count, { count: fixLine.count, from: fixLine.from, to: fixLine.to, score: fixLine.score, after: fixLine.after })}</b>
          {fixLine.later && <span className="text-ink-soft"> {t(locale, "dashboard.reviewsSplit.later")}</span>}{" "}
          <Link href={fixPlanHref(businessId)} className="font-semibold underline decoration-brass underline-offset-2 hover:decoration-ink">
            {t(locale, "dashboard.fixPlan.link")}
          </Link>
        </p>
      )}
      <GetMoreReviewsButton businessId={businessId} testId="reviews-get-more" />
    </div>
  );
}
