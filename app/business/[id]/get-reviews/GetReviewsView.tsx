"use client";

// Day 25B step 5 (spec §2 Growth, §3 "Reviews split"): Growth → Get more
// reviews — asking only: the review link, QR + PNG, the "right way" guide,
// counter tools and Sign Studio. No replies here (they're on Presence →
// Reviews): one link back, "See what customers say →".

import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";
import { GetMoreReviews } from "@/app/business/[id]/website-reviews/GetMoreReviews";
import { ReviewGuide } from "@/components/reviews/ReviewGuide";
import { CounterTools } from "@/components/reviews/CounterTools";
import type { Plan } from "@/lib/plan";
import { reviewsHref } from "@/lib/routes";
import { t, useLocale } from "@/lib/i18n";
import { useScrollToHash } from "@/lib/useScrollToHash";

export function GetReviewsView({
  businessId,
  businessName,
  placeId,
  verifiedSocials,
  plan,
}: {
  businessId: string;
  businessName: string | null;
  placeId: string | null;
  verifiedSocials: Array<{ platform: string; url: string }>;
  plan: Plan;
}) {
  const locale = useLocale();
  // #get-more-reviews / #review-link (old links, the Overview's review link & QR).
  useScrollToHash();
  return (
    <div className="flex flex-col gap-8 nav:gap-10">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">{t(locale, "dashboard.getReviews.title")}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t(locale, "dashboard.getReviews.subtitle")}</p>
        <Link href={reviewsHref(businessId)} data-testid="get-reviews-back" className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-ink hover:text-brass">
          {t(locale, "dashboard.getReviews.seeWhatTheySay")}
          <IconArrowRight size={14} aria-hidden />
        </Link>
      </div>

      <div id="get-more-reviews" className="scroll-mt-20">
        <div id="review-link" className="scroll-mt-20">
          <GetMoreReviews businessId={businessId} businessName={businessName} placeId={placeId} verifiedSocials={verifiedSocials} plan={plan} />
        </div>
      </div>

      <div id="review-guide" className="scroll-mt-20">
        <ReviewGuide placeId={placeId} locked={plan === "free"} />
      </div>

      <CounterTools plan={plan} />
    </div>
  );
}
