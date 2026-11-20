"use client";

// Day 23E: the Growth page's "More ways to bring people in" (moved from
// Campaigns): this week's Google post (components/gbp/WeekPost.tsx) and
// "Answer your customers' common questions" — on Premium applied to the
// Google listing in one click, on Grow the drafts to copy — each with the
// copy-paste website FAQ (FAQPage markup). The same flows as the Google
// Profile tab's This week; nothing is a second copy.

import Link from "next/link";
import { useState } from "react";
import { IconBrandGoogle, IconMessageQuestion } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { AnswersCopy, AnswersPreview, useAnswers } from "@/components/gbp/AnswersPreview";
import { WeekPost } from "@/components/gbp/WeekPost";
import { W_BUTTON } from "@/components/gbp/PostPreview";
import { t, type MessageKey, useLocale } from "@/lib/i18n";

const W = (key: string) => `dashboard.googleTab.w.${key}` as MessageKey;

function Answers({ businessId, premium }: { businessId: string; premium: boolean }) {
  const locale = useLocale();
  const state = useAnswers(businessId, { auto: true, suggest: [] });
  if (premium) return <AnswersPreview businessId={businessId} state={state} />;
  return (
    <div className="flex flex-col gap-2">
      <AnswersCopy businessId={businessId} state={state} />
      <Link href={`/business/${businessId}/settings#compare-plans`} data-testid="premium-one-click" className="w-fit text-[12px] font-medium text-ink-mute underline decoration-brass/60 underline-offset-2 hover:text-ink">
        {t(locale, "dashboard.fix.premiumOneClick")}
      </Link>
    </div>
  );
}

export function MoreWaysCards({ businessId, premium, connected }: { businessId: string; premium: boolean; connected: boolean }) {
  const locale = useLocale();
  const [open, setOpen] = useState<"post" | "answers" | null>(null);
  const card = (id: "post" | "answers", Icon: typeof IconBrandGoogle, title: string, body: string) => (
    <Card className="flex flex-col gap-3 p-4" data-testid={`more-ways-${id}`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
          <Icon size={16} />
        </span>
        <div className="text-sm font-semibold text-ink">{title}</div>
      </div>
      <p className="flex-1 text-[13px] text-ink-soft">{body}</p>
      <button type="button" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id} className={`${W_BUTTON} w-fit`} data-testid={`more-ways-open-${id}`}>
        {open === id ? t(locale, W("hide")) : premium ? t(locale, "dashboard.breakdown.action.doItForYou") : t(locale, W("more.getDraft"))}
      </button>
    </Card>
  );
  return (
    <section data-testid="more-ways">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">{t(locale, "dashboard.growth.moreWays.heading")}</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {card("post", IconBrandGoogle, t(locale, W("more.post.title")), t(locale, W(premium ? "more.post.body.premium" : "more.post.body.grow")))}
        {connected && card("answers", IconMessageQuestion, t(locale, W("more.answers.title")), t(locale, W(premium ? "more.answers.body.premium" : "more.answers.body.grow")))}
      </div>
      {open && (
        <Card className="mt-3 p-4" data-testid={`more-ways-panel-${open}`}>
          {open === "post" ? <WeekPost businessId={businessId} premium={premium} /> : <Answers businessId={businessId} premium={premium} />}
        </Card>
      )}
    </section>
  );
}
