"use client";

// Day 23C: one recommendation, in words that say HOW MANY, WHAT TYPE and
// WHEN (lib/googleRecommendations.ts), with ONE button. CLAUDE.md "Plans":
//   - Premium: "PostScore can do this for you" (opens the editor or the
//     reply inbox) when Google writes are allowed for the place
//     (GOOGLE_WRITES_LIVE_PLACES); otherwise the editor's own verb — it
//     opens read only and says so. Posts: "See post ideas" (PostScore
//     doesn't post for you).
//   - Grow/Free: "How to do it" (the steps, here) and "Open on Google ↗",
//     plus "Premium does this for you in one click →" where Premium does.

import Link from "next/link";
import { useState } from "react";
import { GOOGLE_LINKS, googleHelpUrl } from "@/lib/googleHelpLinks";
import { photoTypeKey, recButton, type Rec } from "@/lib/googleRecommendations";
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
      return { text: t(locale, K(rec.plan.count === 1 ? "rec.repliesOne" : "rec.replies"), { count: rec.plan.count, minutes: rec.plan.minutes }), sub: null };
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
      return `/business/${businessId}/website-reviews#google-reviews`;
    case "posts":
      return `/business/${businessId}/growth#ways-to-grow`;
    case "holiday":
      return "#edit-holiday";
    case "description":
      return "#edit-description";
    case "details":
      return "#edit-customer-details";
    case "services":
      return `#edit-services?add=${rec.plan.names.map(encodeURIComponent).join(",")}`;
  }
}

/** Premium's verb when PostScore can't write for this place. */
const VERB: Record<Rec["kind"], string> = {
  photos: "ideas.photos.button",
  replies: "rec.openInbox",
  posts: "ideas.posts.button",
  holiday: "ideas.holiday.button",
  description: "ideas.description.button",
  details: "ideas.details.button",
  services: "ideas.services.button",
};

export function recButtonLabel(rec: Rec, locale: Locale, ctx: { premium: boolean; canEdit: boolean }): string {
  const b = recButton(rec.kind, ctx);
  return b.kind === "do_it" ? t(locale, "dashboard.breakdown.action.doItForYou") : t(locale, K(VERB[rec.kind]));
}

const BUTTON = "inline-flex h-[30px] shrink-0 items-center whitespace-nowrap rounded-lg border border-ink bg-ink px-3 text-[12.5px] font-semibold text-paper";

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
export function RecSteps({ rec, businessId }: { rec: Rec; businessId: string }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const b = recButton(rec.kind, { premium: false, canEdit: false });
  const google = rec.kind === "replies" ? GOOGLE_LINKS.businessProfileReviews : GOOGLE_LINKS.businessProfile;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={BUTTON} data-testid={`rec-steps-${rec.kind}`}>
          {t(locale, K(open ? "rec.steps.hide" : "rec.steps.show"))}
        </button>
        {b.kind === "steps" && b.premiumLine && (
          <Link href={`/business/${businessId}/settings#compare-plans`} data-testid="premium-one-click" className="w-fit text-[12px] font-medium text-ink-mute underline decoration-brass/60 underline-offset-2 hover:text-ink">
            {t(locale, "dashboard.fix.premiumOneClick")}
          </Link>
        )}
      </div>
      {open && (
        <div className="rounded-lg bg-paper px-3 py-2 text-[12.5px] text-ink-soft" data-testid={`rec-steps-body-${rec.kind}`}>
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

/** One recommendation: the sentence, its second line, and the plan's one button. */
export function RecItem({ rec, businessId, premium, canEdit, type }: { rec: Rec; businessId: string; premium: boolean; canEdit: boolean; type: IdeaType | null }) {
  const locale = useLocale();
  const x = recText(rec, locale, type);
  return (
    <li className={cn("flex flex-col gap-1.5 border-t border-paper-line/70 py-2 first:border-t-0", premium && "sm:flex-row sm:items-center sm:justify-between sm:gap-3")} data-testid={`rec-${rec.kind}`}>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-snug text-ink">{x.text}</p>
        {x.sub && <p className="text-[12px] leading-snug text-ink-mute">{x.sub}</p>}
      </div>
      {premium ? <RecPremiumButton rec={rec} businessId={businessId} canEdit={canEdit} /> : <RecSteps rec={rec} businessId={businessId} />}
    </li>
  );
}
