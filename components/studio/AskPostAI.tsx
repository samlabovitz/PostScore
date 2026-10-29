"use client";

// "Confused? Ask PostAI →" (Campaigns: coupons and referrals; Reviews: the
// review sign): opens the floating PostAI panel right here, on this page,
// with this page's question typed in — the owner presses Send. The address
// (the Overview with an allowlisted question id, never free text) is only
// the fallback for a page without the panel.

import Link from "next/link";
import { POSTAI_ASK_QUESTIONS, postaiAskHref, type PostaiAskId } from "@/lib/postaiAsk";
import { askPostAIInPlace } from "@/lib/postaiDock";
import { t, useLocale } from "@/lib/i18n";

export function AskPostAI({ businessId, question }: { businessId: string; question: PostaiAskId }) {
  const locale = useLocale();
  return (
    <Link
      href={postaiAskHref(businessId, question)}
      onClick={(e) => askPostAIInPlace(e, t(locale, POSTAI_ASK_QUESTIONS[question]))}
      data-testid="ask-postai"
      className="text-[12.5px] font-medium text-brass hover:underline"
    >
      {t(locale, "dashboard.postaiAsk.link")}
    </Link>
  );
}
