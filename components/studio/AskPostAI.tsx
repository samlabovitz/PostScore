"use client";

// "Confused? Ask PostAI →" on the designers: opens PostAI (on the
// Overview) with this page's question typed in — an allowlisted id, never
// free text in the address.

import Link from "next/link";
import { postaiAskHref, type PostaiAskId } from "@/lib/postaiAsk";
import { t, useLocale } from "@/lib/i18n";

export function AskPostAI({ businessId, question }: { businessId: string; question: PostaiAskId }) {
  const locale = useLocale();
  return (
    <Link href={postaiAskHref(businessId, question)} data-testid="ask-postai" className="text-[12.5px] font-medium text-brass hover:underline">
      {t(locale, "dashboard.postaiAsk.link")}
    </Link>
  );
}
