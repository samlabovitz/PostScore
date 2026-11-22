"use client";

// Day 23C: one recommendation, in words that say HOW MANY, WHAT TYPE and
// WHEN (lib/googleRecommendations.ts), with ONE button. CLAUDE.md "Plans":
//   - Premium: "PostScore can do this for you" (opens the editor or the
//     reply inbox) when Google writes are allowed for the place
//     (GOOGLE_WRITES_LIVE_PLACES); otherwise the editor's own verb — it
//     opens read only and says so. Day 23E: the post and the answers have
//     their own previews in This week (components/gbp/ThisWeekList.tsx).
//   - Grow/Free: "How to do it" (the steps, here) and "Open on Google ↗",
//     plus "Premium does this for you in one click →" where Premium does.
//     Day 23E, Grow: the post's and the answers' drafts to copy, with the steps.

import { reviewsHref } from "@/lib/routes";
import Link from "next/link";
import { useState } from "react";
import { GOOGLE_LINKS, googleHelpUrl } from "@/lib/googleHelpLinks";
import { photoTypeKey, recButton, type Rec } from "@/lib/googleRecommendations";
import { PostDraftCopy, usePostDraft } from "@/components/gbp/PostPreview";
import { AnswersCopy, useAnswers } from "@/components/gbp/AnswersPreview";
import type { IdeaType } from "@/lib/listingIdeas";
import { formatShortDate, t, type Locale, type MessageKey, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const K = (key: string) => `dashboard.googleTab.${key}` as MessageKey;

export const shortDate = (date: string, locale: Locale) => formatShortDate(`${date}T12:00:00Z`, locale, "UTC").replace(/,? \d{4}$/, "");
/** 0 = Sunday → "Monday" / "lunes". */
export const weekdayName = (day: number, locale: Locale) => new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1 + day, 12)));

/** The recommendation's sentence (and a second line where there is one). */
export function recText(rec: Rec, locale: Locale, type: IdeaType | null): { text: string; sub: string | null } {
  switch (rec.kind) {
    case "photos": {
      const list = rec.plan.types.map((c) => `1 ${t(locale, K(`rec.photoType.${photoTypeKey(c, type)}`))}`).join(", ");
      return { text: t(locale, K("rec.photos"), { count: rec.plan.count, list }), sub: rec.plan.fromMissing ? t(locale, K("rec.photos.missing")) : null };
    }
    case "replies":
      return { text: t(locale, K(rec.plan.count === 1 ? "rec.repliesOne" : "rec.replies"), { count: rec.plan.count, minutes: rec.plan.minutes }), sub: t(locale, K(rec.plan.total === 1 ? "rec.replies.subOne" : "rec.replies.sub"), { replied: rec.plan.replied, total: rec.plan.total }) };
    case "posts": {
      const topic = t(locale, K(`ideas.posts.topic.${rec.plan.topic}`));
      const text =
        rec.plan.weekday === null || rec.plan.date === null || rec.plan.busiest === null
          ? t(locale, K("rec.posts.week"))
          : t(locale, K("rec.posts.day"), { day: weekdayName(rec.plan.weekday, locale), date: shortDate(rec.plan.date, locale), busiest: t(locale, K(`s2.dayGroup.${rec.plan.busiest}`)) });
      return { text, sub: t(locale, K("rec.posts.topic"), { topic }) };
    }
    case "holiday": {
      const holiday = t(locale, K(`fields.holiday.${rec.plan.holiday}`));
      return rec.plan.today
        ? { text: t(locale, K("rec.holidayToday"), { holiday, date: shortDate(rec.plan.date, locale) }), sub: null }
        : { text: t(locale, K("rec.holiday"), { holiday, date: shortDate(rec.plan.by, locale) }), sub: null };
    }
    case "description":
      return { text: t(locale, K("rec.description"), { target: rec.plan.target, count: rec.plan.have, minutes: rec.plan.minutes }), sub: null };
    case "details":
      return { text: t(locale, K(`rec.details.${rec.plan.missing.length === 2 ? "both" : rec.plan.missing[0]}`), { minutes: rec.plan.minutes }), sub: null };
    case "services":
      return { text: t(locale, K(rec.plan.count === 1 ? "rec.servicesOne" : "rec.services"), { count: rec.plan.count, list: rec.plan.names.join(", "), minutes: rec.plan.minutes }), sub: null };
    case "answers": {
      const parts = rec.plan.missing.flatMap((p) => (p === "details" ? rec.plan.details.map((d) => t(locale, K(`rec.answers.part.${d}`))) : p === "services" ? [t(locale, K(`rec.answers.part.services.${rec.plan.services ?? "none"}`))] : [t(locale, K("rec.answers.part.description"))]));
      return { text: t(locale, K("rec.answers"), { minutes: rec.plan.minutes }), sub: t(locale, K("rec.answers.sub"), { list: parts.join(", ") }) };
    }
  }
}

/** The "when" line a section 5 idea card shows under its title. */
export function ideaPlanLine(rec: Rec, locale: Locale, type: IdeaType | null): string {
  if (rec.kind === "holiday") {
    const holiday = t(locale, K(`fields.holiday.${rec.plan.holiday}`));
    return rec.plan.today ? t(locale, K("rec.holidayByToday"), { holiday, date: shortDate(rec.plan.date, locale) }) : t(locale, K("rec.holidayBy"), { holiday, date: shortDate(rec.plan.by, locale) });
  }
  return recText(rec, locale, type).text;
}

/** Where Premium's button goes. */
export function recHref(rec: Rec, businessId: string): string {
  switch (rec.kind) {
    case "photos":
      return "#edit-photos";
    case "replies":
      return reviewsHref(businessId, { hash: "google-reviews" });
    case "posts":
      return "#google-tab-this-week";
    case "holiday":
      return "#edit-holiday";
    case "description":
      return "#edit-description";
    case "details":
      return "#edit-customer-details";
    case "services":
      return `#edit-services?add=${rec.plan.names.map(encodeURIComponent).join(",")}`;
    case "answers":
      return "#google-tab-this-week";
  }
}

/** Premium's verb when PostScore can't write for this place. */
const VERB: Record<Rec["kind"], string> = {
  photos: "ideas.photos.button",
  replies: "rec.openInbox",
  posts: "w.post.open",
  holiday: "ideas.holiday.button",
  description: "ideas.description.button",
  details: "ideas.details.button",
  services: "ideas.services.button",
  answers: "w.ans.open",
};

export function recButtonLabel(rec: Rec, locale: Locale, ctx: { premium: boolean; canEdit: boolean }): string {
  const b = recButton(rec.kind, ctx);
  // The owner's own photos: the owner uploads them — never "PostScore can do this for you".
  if (rec.kind === "photos" && b.kind === "do_it") return t(locale, K("w.photos.upload"));
  return b.kind === "do_it" ? t(locale, "dashboard.breakdown.action.doItForYou") : t(locale, K(VERB[rec.kind]));
}

/** At least 44px tall, 14px text (the Google Profile tab's buttons). */
const BUTTON = "inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-lg border border-ink bg-ink px-4 text-[14px] font-semibold text-paper lg:min-h-[40px] lg:px-3.5";
/** The secondary (outlined) look: Grow's "How to do it". */
const BUTTON_OUTLINE = "inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-lg border border-paper-line bg-white px-4 text-[14px] font-semibold text-ink hover:border-ink lg:min-h-[36px] lg:px-3";

/** Premium: one button. */
export function RecPremiumButton({ rec, businessId, canEdit, className }: { rec: Rec; businessId: string; canEdit: boolean; className?: string }) {
  const locale = useLocale();
  const href = recHref(rec, businessId);
  const label = recButtonLabel(rec, locale, { premium: true, canEdit });
  const testId = `rec-button-${rec.kind}`;
  const kind = recButton(rec.kind, { premium: true, canEdit }).kind;
  return href.startsWith("#") ? (
    <a href={href} className={cn(BUTTON, className)} data-testid={testId} data-kind={kind}>
      {label}
    </a>
  ) : (
    <Link href={href} className={cn(BUTTON, className)} data-testid={testId} data-kind={kind}>
      {label}
    </Link>
  );
}

/** Grow/Free: the steps (one button that opens them), "Open on Google ↗" and the Premium line. */
export function RecSteps({ rec, businessId, drafts = false }: { rec: Rec; businessId: string; drafts?: boolean }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const b = recButton(rec.kind, { premium: false, canEdit: false });
  const google = rec.kind === "replies" ? GOOGLE_LINKS.businessProfileReviews : GOOGLE_LINKS.businessProfile;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={BUTTON_OUTLINE} data-testid={`rec-steps-${rec.kind}`}>
          {t(locale, K(open ? "rec.steps.hide" : "rec.steps.show"))}
        </button>
        {b.kind === "steps" && b.premiumLine && (
          <Link href={`/business/${businessId}/settings#compare-plans`} data-testid="premium-one-click" className="w-fit text-[13px] font-medium text-ink-mute underline decoration-brass/60 underline-offset-2 hover:text-ink">
            {t(locale, "dashboard.fix.premiumOneClick")}
          </Link>
        )}
      </div>
      {open && drafts && rec.kind === "posts" && <GrowPostDraft businessId={businessId} rec={rec} />}
      {open && drafts && rec.kind === "answers" && <GrowAnswers businessId={businessId} suggest={rec.plan.suggest} />}
      {open && (
        <div className="rounded-lg bg-paper px-4 py-3 text-[13px] text-ink-soft" data-testid={`rec-steps-body-${rec.kind}`}>
          <ol className="list-decimal pl-4">
            {[1, 2, 3].map((n) => (
              <li key={n}>{t(locale, K(`rec.steps.${rec.kind}.${n}`))}</li>
            ))}
          </ol>
          <a href={googleHelpUrl(google, locale)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold text-ink underline decoration-brass underline-offset-2">
            {t(locale, K("rec.openGoogle"))}
          </a>
        </div>
      )}
    </div>
  );
}

/** Grow: this week's post draft to copy (made once a week; 3 "Write another"). */
function GrowPostDraft({ businessId, rec }: { businessId: string; rec: Extract<Rec, { kind: "posts" }> }) {
  const day = rec.plan.weekday !== null && rec.plan.date ? `${weekdayName(rec.plan.weekday, "en")}, ${shortDate(rec.plan.date, "en")}` : null;
  const state = usePostDraft(businessId, { day, auto: false });
  return <PostDraftCopy state={state} />;
}

/** Grow: the answers' drafts to copy. */
function GrowAnswers({ businessId, suggest }: { businessId: string; suggest: string[] }) {
  const state = useAnswers(businessId, { auto: false, suggest });
  return <AnswersCopy businessId={businessId} state={state} />;
}

/** One recommendation: the sentence, its second line, and the plan's one button. */
/** `drafts`: Grow — the post's and the answers' drafts to copy come with their steps (Free: the steps only). */
export function RecItem({ rec, businessId, premium, canEdit, type, drafts = false }: { rec: Rec; businessId: string; premium: boolean; canEdit: boolean; type: IdeaType | null; drafts?: boolean }) {
  const locale = useLocale();
  const x = recText(rec, locale, type);
  return (
    <li className={cn("flex flex-col gap-2.5 border-t border-paper-line py-4 first:border-t-0 lg:gap-1.5 lg:py-2.5", premium && "sm:flex-row sm:items-center sm:justify-between sm:gap-4")} data-testid={`rec-${rec.kind}`}>
      <div className="min-w-0">
        <p className="text-[15px] font-medium leading-snug text-ink">{x.text}</p>
        {x.sub && <p className="mt-0.5 text-[13px] leading-snug text-ink-mute">{x.sub}</p>}
      </div>
      {premium ? <RecPremiumButton rec={rec} businessId={businessId} canEdit={canEdit} /> : <RecSteps rec={rec} businessId={businessId} drafts={drafts} />}
    </li>
  );
}
