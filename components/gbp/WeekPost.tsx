"use client";

// Day 23E: this week's Google post anywhere outside the Google Profile
// tab's This week — the Growth page's weekly routine ("Post an update or
// offer to Google"), its "More ways to bring people in" card, and the
// Campaigns coupon screen's "Post this offer on Google →". The same draft,
// rules and one-post-a-day limit as This week (components/gbp/PostPreview.tsx):
// Premium edits and publishes in one click; Grow gets the draft to copy and
// "Premium does this for you in one click →". With an active coupon (or
// `promoId`) the draft is about the offer, published as a Google Offer post.

import Link from "next/link";
import { PostDraftCopy, PostPreview, usePostDraft } from "@/components/gbp/PostPreview";
import { t, useLocale } from "@/lib/i18n";

export function WeekPost({ businessId, premium, promoId = null }: { businessId: string; premium: boolean; promoId?: string | null }) {
  const locale = useLocale();
  const state = usePostDraft(businessId, { day: null, auto: true, promoId });
  if (premium) return <PostPreview businessId={businessId} state={state} />;
  return (
    <div className="flex flex-col gap-2" data-testid="week-post-grow">
      <PostDraftCopy state={state} />
      <Link href={`/business/${businessId}/settings#compare-plans`} data-testid="premium-one-click" className="w-fit text-[12px] font-medium text-ink-mute underline decoration-brass/60 underline-offset-2 hover:text-ink">
        {t(locale, "dashboard.fix.premiumOneClick")}
      </Link>
    </div>
  );
}
