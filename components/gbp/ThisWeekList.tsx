"use client";

// Day 23E: the Google Profile tab's "This week" (Premium) — self-contained
// (the section 1 redesign moves it into "What to do this week"). Each item
// says how many, what and when (lib/googleRecommendations.ts) and is
// either:
//   - Ready: PostScore has a draft (review replies, this week's post, the
//     answers) — "Preview / edit" opens it, and Approve all sends it;
//   - Needs you · {time}: only the owner can do it (their own photos,
//     details only they know) — the item's own button, never Approve all;
//   - done ✓.
// "All done this week ✓" once nothing ready is left.

import { useState } from "react";
import { recText, RecPremiumButton } from "@/components/gbp/GoogleRecs";
import { AnswersPreview, useAnswers, type AnswersState } from "@/components/gbp/AnswersPreview";
import { ApproveAll, type ItemFailures } from "@/components/gbp/ApproveAll";
import { PostPreview, failedText, usePostDraft, type PostDraftState } from "@/components/gbp/PostPreview";
import { publishPostAction } from "@/app/actions/gbpPosts";
import { applyAnswersAction } from "@/app/actions/googleAnswers";
import { RepliesPreview, useWeekReplies, type WeekRepliesState } from "@/components/gbp/RepliesPreview";
import type { Rec } from "@/lib/googleRecommendations";
import type { IdeaType } from "@/lib/listingIdeas";
import { t, type MessageKey, useLocale, useTimeZone } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { shortDate, weekdayName } from "@/components/gbp/GoogleRecs";

const W = (key: string) => `dashboard.googleTab.w.${key}` as MessageKey;

export type ItemState = "loading" | "ready" | "done" | "needs_you" | "tomorrow" | "failed";

/** Section 1's This week: the replies, photos, the post and the answers. */
export function thisWeekKinds(recs: Rec[]): Rec[] {
  return recs.filter((r) => r.kind === "replies" || r.kind === "photos" || r.kind === "posts" || r.kind === "answers");
}

export function repliesState(s: WeekRepliesState, failed = false): ItemState {
  if (s.status === "idle" || s.status === "loading") return "loading";
  if (s.status === "failed") return "needs_you";
  if (s.items.length === 0 || s.items.every((i) => i.sent === "sent")) return "done";
  if (s.ready.length > 0) return "ready";
  if (failed || s.items.some((i) => i.sent === "failed")) return "failed";
  return s.items.some((i) => i.sent === "sent") && s.items.every((i) => i.sent === "sent" || !i.include) ? "done" : "needs_you";
}

export function postState(s: PostDraftState, failed = false): ItemState {
  if (s.status === "idle" || s.status === "loading") return "loading";
  if (s.latest && s.latest.state !== "rejected") return "done";
  if (s.blockedToday) return "tomorrow";
  if (failed) return "failed";
  return s.status === "ok" && s.problems.length === 0 && s.flags.length === 0 && s.publish ? "ready" : "needs_you";
}

export function answersState(s: AnswersState, failed = false): ItemState {
  if (s.status === "idle" || s.status === "loading") return "loading";
  if (s.status === "failed" || !s.data) return "needs_you";
  if (!s.data.plan) return "done";
  if (failed) return "failed";
  if (s.ready.length > 0) return "ready";
  return s.needsYou.length > 0 || s.flags.length > 0 ? "needs_you" : "done";
}

/** Nothing left that can be sent now: "All done this week ✓" (what waits for tomorrow or for the owner stays listed underneath). */
export function allDoneThisWeek(states: ItemState[]): boolean {
  return states.length > 0 && !states.some((s) => s === "ready" || s === "loading");
}

/** "Needs you · 5 min": how long the owner's part takes. */
function needsMinutes(rec: Rec): number {
  switch (rec.kind) {
    case "photos":
      return 5;
    case "replies":
      return rec.plan.minutes;
    case "answers":
      return Math.max(1, rec.plan.details.length);
    default:
      return 5;
  }
}

function Badge({ state, minutes, tomorrow }: { state: ItemState; minutes: number; tomorrow?: string }) {
  const locale = useLocale();
  const soft = "bg-[color:color-mix(in_srgb,var(--color-brass)_14%,white)] text-brass";
  const cls = { loading: "bg-paper text-ink-mute", ready: "bg-[color:color-mix(in_srgb,var(--color-green)_12%,white)] text-green", done: "bg-[color:color-mix(in_srgb,var(--color-green)_12%,white)] text-green", needs_you: soft, tomorrow: soft, failed: "bg-[color:color-mix(in_srgb,var(--color-red)_10%,white)] text-red" }[state];
  const label =
    state === "loading"
      ? t(locale, W("preparing"))
      : state === "ready"
        ? t(locale, W("ready"))
        : state === "done"
          ? t(locale, W("doneMark"))
          : state === "tomorrow"
            ? (tomorrow ?? t(locale, W("tomorrow.cap")))
            : state === "failed"
              ? t(locale, W("failed.badge"))
              : t(locale, W("needsYou"), { time: t(locale, W("time.min"), { count: minutes }) });
  return (
    <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold", cls)} data-testid="week-badge" data-state={state}>
      {label}
    </span>
  );
}

export function WeekItem({ rec, state, type, businessId, canEdit, children, failure, onRetry, tomorrow }: { rec: Rec; state: ItemState; type: IdeaType | null; businessId: string; canEdit: boolean; children?: React.ReactNode; failure?: string | null; onRetry?: () => Promise<void>; tomorrow?: string }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const x = itemText(rec, locale, type);
  return (
    <li className="flex flex-col gap-2 border-t border-paper-line/70 py-2.5 first:border-t-0" data-testid={`week-${rec.kind}`} data-state={state}>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold leading-snug text-ink">{x.text}</p>
          {x.sub && <p className="text-[12px] leading-snug text-ink-mute">{x.sub}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge state={state} minutes={needsMinutes(rec)} tomorrow={tomorrow} />
          {rec.kind === "photos" ? (
            // The owner's own photos: never "PostScore can do this for you".
            <a href="#edit-photos" className="inline-flex h-[30px] shrink-0 items-center whitespace-nowrap rounded-lg border border-ink bg-ink px-3 text-[12.5px] font-semibold text-paper" data-testid="week-upload-photos">
              {t(locale, W("photos.upload"))}
            </a>
          ) : children ? (
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-[12px] font-semibold text-ink underline underline-offset-2" data-testid={`week-toggle-${rec.kind}`}>
              {t(locale, W(open ? "hide" : "preview"))}
            </button>
          ) : (
            <RecPremiumButton rec={rec} businessId={businessId} canEdit={canEdit} />
          )}
        </div>
      </div>
      {state === "failed" && (
        <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-red" data-testid={`week-failed-${rec.kind}`}>
          {t(locale, W("failed.row"), { reason: failure ?? t(locale, W("failed.generic")) })}
          {onRetry && (
            <button
              type="button"
              disabled={retrying || !canEdit}
              onClick={async () => {
                setRetrying(true);
                await onRetry().finally(() => setRetrying(false));
              }}
              className="font-semibold text-ink underline underline-offset-2"
              data-testid={`week-retry-${rec.kind}`}
            >
              {retrying ? t(locale, W("sending")) : t(locale, W("retry"))}
            </button>
          )}
        </p>
      )}
      {children && open && <div className="rounded-lg border border-paper-line/70 bg-white px-3 py-2.5">{children}</div>}
    </li>
  );
}

/** The item's sentence; the post's and answers' in Day 23E words. */
export function itemText(rec: Rec, locale: ReturnType<typeof useLocale>, type: IdeaType | null): { text: string; sub: string | null } {
  if (rec.kind === "posts") {
    const base = recText(rec, locale, type);
    const text =
      rec.plan.weekday === null || rec.plan.date === null
        ? t(locale, W("post.item.week"))
        : t(locale, W("post.item.day"), { day: weekdayName(rec.plan.weekday, locale), date: shortDate(rec.plan.date, locale), busiest: t(locale, `dashboard.googleTab.s2.dayGroup.${rec.plan.busiest}` as MessageKey) });
    return { text, sub: base.sub };
  }
  return recText(rec, locale, type);
}

export function ThisWeekList({ businessId, recs, type, canEdit, practice }: { businessId: string; recs: Rec[]; type: IdeaType | null; canEdit: boolean; practice: boolean }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const list = thisWeekKinds(recs);
  const has = (k: Rec["kind"]) => list.some((r) => r.kind === k);
  const postRec = list.find((r): r is Extract<Rec, { kind: "posts" }> => r.kind === "posts");
  const answersRec = list.find((r): r is Extract<Rec, { kind: "answers" }> => r.kind === "answers");
  const day = postRec && postRec.plan.weekday !== null && postRec.plan.date ? `${weekdayName(postRec.plan.weekday, "en")}, ${shortDate(postRec.plan.date, "en")}` : null;
  const replies = useWeekReplies(businessId, { auto: has("replies") });
  const post = usePostDraft(businessId, { day, auto: has("posts") });
  const answers = useAnswers(businessId, { auto: has("answers"), suggest: answersRec?.plan.suggest ?? [] });
  const [failures, setFailures] = useState<ItemFailures>({});
  if (list.length === 0) return null;
  const onFailure = (kind: keyof ItemFailures, reason: string | null) => setFailures((f) => ({ ...f, [kind]: reason ?? undefined }));

  const stateOf = (rec: Rec): ItemState =>
    rec.kind === "replies" ? repliesState(replies, !!failures.replies) : rec.kind === "posts" ? postState(post, !!failures.posts) : rec.kind === "answers" ? answersState(answers, !!failures.answers) : "needs_you";
  const states = list.map(stateOf);
  const allDone = allDoneThisWeek(states);
  const done = list.filter((_, i) => states[i] === "done");
  const rest = list.filter((_, i) => states[i] !== "done");

  // "Try again" on a row: that item alone, through its own action.
  const retry: Partial<Record<Rec["kind"], () => Promise<void>>> = {
    replies: async () => {
      for (const i of replies.items.filter((x) => x.sent === "failed")) await replies.post(i.reviewId);
      onFailure("replies", null);
    },
    posts: async () => {
      const r = await publishPostAction(businessId, { text: post.text, cta: post.cta, photoName: post.photoName, kind: "week", timeZone, promoId: post.offer?.promoId ?? null, keep: post.keep }).catch(() => null);
      if (r?.status === "published") {
        post.setLatest(r.latest);
        onFailure("posts", null);
      } else if (r?.status === "posted_today") {
        post.setBlockedToday("posted_today");
        onFailure("posts", null);
      } else onFailure("posts", r?.status === "error" ? failedText(r.error, locale) : t(locale, W("failed.generic")));
    },
    answers: async () => {
      const r = await applyAnswersAction(businessId, answers.payload).catch(() => null);
      if (r?.status === "ok") {
        answers.setResults({ ...(answers.results ?? {}), ...r.results });
        const bad = Object.values(r.results).find((p) => p && (p.status === "error" || p.status === "invalid" || p.status === "spelling"));
        onFailure("answers", bad ? (bad.status === "error" ? failedText(bad.error, locale) : t(locale, W("failed.generic"))) : null);
      } else onFailure("answers", r && r.status === "wait" ? failedText(r.error, locale) : t(locale, W("failed.generic")));
    },
  };

  const row = (rec: Rec) => {
    const state = stateOf(rec);
    const child = rec.kind === "replies" ? <RepliesPreview businessId={businessId} state={replies} /> : rec.kind === "posts" ? <PostPreview businessId={businessId} state={post} /> : rec.kind === "answers" ? <AnswersPreview businessId={businessId} state={answers} /> : null;
    const tomorrow = rec.kind === "posts" && post.blockedToday === "posted_today" ? t(locale, W("tomorrow.posted")) : undefined;
    return (
      <WeekItem key={rec.kind} rec={rec} state={state} type={type} businessId={businessId} canEdit={canEdit} failure={failures[rec.kind as keyof ItemFailures]} onRetry={retry[rec.kind]} tomorrow={tomorrow}>
        {child}
      </WeekItem>
    );
  };

  return (
    <div className="mt-2 flex flex-col gap-2" data-testid="google-tab-this-week" id="google-tab-this-week">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brass">{t(locale, "dashboard.googleTab.rec.thisWeek")}</p>
        {allDone && (
          <p className="text-[13px] font-bold text-green" data-testid="week-all-done">
            {t(locale, W("allDone"))}
          </p>
        )}
      </div>
      {!allDone && (
        <ApproveAll businessId={businessId} replies={has("replies") ? replies : null} post={has("posts") ? post : null} answers={has("answers") ? answers : null} canEdit={canEdit} practice={practice} failures={failures} onFailure={onFailure} />
      )}
      {allDone ? (
        <>
          {done.length > 0 && <ul>{done.map(row)}</ul>}
          {rest.length > 0 && (
            <>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft" data-testid="week-still-needs-you">
                {t(locale, W("stillNeedsYou"))}
              </p>
              <ul>{rest.map(row)}</ul>
            </>
          )}
        </>
      ) : (
        <ul>{list.map(row)}</ul>
      )}
    </div>
  );
}
