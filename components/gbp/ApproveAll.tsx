"use client";

// Day 23E: "Approve all" for the Google Profile tab's This week (Premium) —
// self-contained (the section 1 redesign moves it into "What to do this
// week"). One click approves every item that can ACTUALLY go to Google
// now: this week's post and the answers (one sitting, one approval —
// app/actions/approveAll.ts approveListingAll), then each review reply the
// owner kept checked (the inbox's own action, one by one). Never included:
// what needs the owner (their own photos, details only they know, a
// "Did you mean…?" not yet answered), what can't go today (a post already
// published today, the day's approval limit) and what just failed (its row
// says so, with "Try again"). Nothing goes to Google without this click (or
// an item's own button).

import { useState } from "react";
import { approveListingAll } from "@/app/actions/approveAll";
import { t, tPlural, type MessageKey, useLocale, useTimeZone } from "@/lib/i18n";
import type { AnswersState } from "@/components/gbp/AnswersPreview";
import type { PostDraftState } from "@/components/gbp/PostPreview";
import { W_BUTTON, failedText } from "@/components/gbp/PostPreview";
import type { WeekRepliesState } from "@/components/gbp/RepliesPreview";

const W = (key: string) => `dashboard.googleTab.w.${key}` as MessageKey;

/** Why an item didn't go through (shown on its own row), by kind. */
export type ItemFailures = Partial<Record<"replies" | "posts" | "answers", string>>;

/** The post can go now: drafted, within Google's rules and spelling, not blocked today, not already up, not just failed. */
export function postReady(post: PostDraftState | null | undefined, failed = false): boolean {
  return !!post && !failed && post.status === "ok" && post.problems.length === 0 && post.flags.length === 0 && post.publish?.canEdit === true && !post.blockedToday && (!post.latest || post.latest.state === "rejected");
}

export function answersReady(answers: AnswersState | null | undefined, failed = false): boolean {
  return !!answers && !failed && answers.data?.canEdit === true && answers.ready.length > 0;
}

/** What Approve all will send now, item by item: each unique ready reply, the post, the answers.
 * Never what's blocked (a post already up today, the day's limit, a spelling question, a failure, posting off). */
export function approveItems(parts: { replies?: WeekRepliesState | null; post?: PostDraftState | null; answers?: AnswersState | null; failures?: ItemFailures }): { replies: number; post: boolean; answers: boolean } {
  const f = parts.failures ?? {};
  const replies = parts.replies?.canPost ? new Set(parts.replies.ready).size : 0;
  return { replies, post: postReady(parts.post, !!f.posts), answers: answersReady(parts.answers, !!f.answers) };
}

export function approveCount(parts: { replies?: WeekRepliesState | null; post?: PostDraftState | null; answers?: AnswersState | null; failures?: ItemFailures }): number {
  const i = approveItems(parts);
  return i.replies + (i.post ? 1 : 0) + (i.answers ? 1 : 0);
}

/** The button's "Approve {n} tasks": the replies (one task, however many), the post, the answers. */
export function approveTaskCount(parts: { replies?: WeekRepliesState | null; post?: PostDraftState | null; answers?: AnswersState | null; failures?: ItemFailures }): number {
  const i = approveItems(parts);
  return (i.replies > 0 ? 1 : 0) + (i.post ? 1 : 0) + (i.answers ? 1 : 0);
}

export function ApproveAll({
  businessId,
  replies = null,
  post = null,
  answers = null,
  canEdit,
  practice,
  failures = {},
  onFailure = () => undefined,
  title = null,
}: {
  /** The card's title, on the left of the button (the button sits at the top right). */
  title?: React.ReactNode;
  businessId: string;
  replies?: WeekRepliesState | null;
  post?: PostDraftState | null;
  answers?: AnswersState | null;
  canEdit: boolean;
  practice: boolean;
  failures?: ItemFailures;
  /** An item's own row shows why it didn't go through (null: it went). */
  onFailure?: (kind: keyof ItemFailures, reason: string | null) => void;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [summary, setSummary] = useState<{ sent: number; failed: number } | null>(null);
  const count = approveCount({ replies, post, answers, failures });
  const tasks = approveTaskCount({ replies, post, answers, failures });
  const items = approveItems({ replies, post, answers, failures });
  const what = [
    items.replies ? t(locale, W(items.replies === 1 ? "approveAll.what.replyOne" : "approveAll.what.replies"), { count: items.replies }) : null,
    items.post ? t(locale, W("approveAll.what.post")) : null,
    items.answers ? t(locale, W("approveAll.what.answers")) : null,
  ].filter(Boolean);
  // A saved post draft isn't "getting ready": only a part with nothing to show yet is.
  const loading = [replies, post, answers].some((s) => s && (s.status === "idle" || s.status === "loading") && !(s === post && post?.text));

  const run = async () => {
    const replyIds = replies?.canPost ? Array.from(new Set(replies.ready)) : [];
    const withPost = postReady(post, !!failures.posts);
    const withAnswers = answersReady(answers, !!failures.answers);
    const of = replyIds.length + (withPost ? 1 : 0) + (withAnswers ? 1 : 0);
    if (of === 0) return;
    let done = 0;
    let sent = 0;
    let failed = 0;
    setSummary(null);
    setProgress({ done, of });
    // 1. The listing items, one sitting.
    if (withPost || withAnswers) {
      const r = await approveListingAll(businessId, {
        post: withPost && post ? { text: post.text, cta: post.cta, photoName: post.photoName, timeZone, promoId: post.offer?.promoId ?? null, keep: post.keep } : null,
        answers: withAnswers && answers ? answers.payload : null,
      }).catch(() => null);
      const failBoth = (reason: string) => {
        if (withPost) onFailure("posts", reason);
        if (withAnswers) onFailure("answers", reason);
        failed += (withPost ? 1 : 0) + (withAnswers ? 1 : 0);
      };
      if (!r) failBoth(t(locale, W("failed.generic")));
      else if (r.status === "ok") {
        if (r.post && post) {
          if (r.post.status === "published") {
            post.setLatest(r.post.latest);
            onFailure("posts", null);
            sent++;
          } else if (r.post.status === "posted_today" || (r.post.status === "error" && r.post.error === "daily_cap")) {
            // Can't go today: the row says "tomorrow" — not a failure.
            post.setBlockedToday(r.post.status === "posted_today" ? "posted_today" : "daily_cap");
          } else {
            failed++;
            onFailure("posts", r.post.status === "error" ? failedText(r.post.error, locale) : t(locale, W("post.problemShort")));
          }
        }
        if (r.answers && answers) {
          answers.setResults({ ...(answers.results ?? {}), ...r.answers });
          const parts = Object.values(r.answers);
          const bad = parts.find((p) => p && (p.status === "error" || p.status === "invalid" || p.status === "spelling"));
          if (parts.some((p) => p && (p.status === "sent" || p.status === "pending_review" || p.status === "no_change"))) sent++;
          else failed++;
          onFailure("answers", bad ? (bad.status === "error" ? failedText(bad.error, locale) : t(locale, W(bad.status === "spelling" ? "spelling.blocked" : "failed.generic"))) : null);
        }
      } else if (r.status === "wait" && r.error === "daily_cap") {
        post?.setBlockedToday("daily_cap");
        if (withAnswers) onFailure("answers", t(locale, W("tomorrow.cap")));
      } else failBoth(r.status === "editing_off" ? t(locale, W("readOnly")) : failedText(r.status === "wait" ? r.error : r.status === "error" ? r.error : "", locale));
      done += (withPost ? 1 : 0) + (withAnswers ? 1 : 0);
      setProgress({ done, of });
    }
    // 2. The replies, one by one.
    let repliesFailed = 0;
    for (const id of replyIds) {
      const ok = await replies!.post(id);
      if (ok) sent++;
      else {
        failed++;
        repliesFailed++;
      }
      done++;
      setProgress({ done, of });
    }
    if (replyIds.length) onFailure("replies", repliesFailed ? t(locale, W(repliesFailed === 1 ? "replies.failedOne" : "replies.failedMany"), { count: repliesFailed }) : null);
    setProgress(null);
    setSummary({ sent, failed });
  };

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5" data-testid="approve-all">
      {/* Title, what goes and the note on the left; the button with its item count on the right (no gap under the title). */}
      <div className="flex min-w-0 grow basis-full flex-col gap-1.5 sm:basis-0 lg:gap-0.5">
        <div className="min-w-0">{title}</div>
        {what.length > 0 && !progress && (
          <p className="text-[13px] font-semibold text-ink-soft" data-testid="approve-all-what">
            {t(locale, W("approveAll.what"), { list: what.join(" · ") })}
          </p>
        )}
        <p className="text-[13px] text-ink-mute">{t(locale, W("approveAll.note"))}</p>
      </div>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        {/* While drafts load: disabled, "Approve all (getting ready…)" — the final count once ready, never a misleading "(0)". */}
        <button type="button" onClick={run} disabled={!canEdit || loading || count === 0 || progress !== null} className={W_BUTTON} data-testid="approve-all-button" data-count={count} data-tasks={tasks} data-loading={loading ? "1" : "0"}>
          {progress ? t(locale, W("approveAll.sending"), { done: progress.done, count: progress.of }) : loading ? t(locale, W("approveAll.gettingReady")) : tPlural(locale, "dashboard.googleTab.w.approveTasks", tasks, { count: tasks })}
        </button>
        {!loading && !progress && count > 0 && (
          <p className="text-[12px] text-ink-mute" data-testid="approve-all-items">
            {tPlural(locale, "dashboard.googleTab.w.approveItems", count, { count })}
          </p>
        )}
      </div>
      {practice && <p className="w-full text-[13px] font-semibold text-brass" data-testid="approve-all-practice">{t(locale, W("practice"))}</p>}
      {!canEdit && <p className="w-full text-[13px] text-ink-mute" data-testid="approve-all-off">{t(locale, W("readOnly"))}</p>}
      {summary && (
        <p className="w-full text-[13px]" data-testid="approve-all-summary">
          <b className="text-green">{t(locale, W("approveAll.sent"), { count: summary.sent })}</b>
          {summary.failed > 0 && <span className="text-red"> · {t(locale, W("approveAll.failedRows"), { count: summary.failed })}</span>}
        </p>
      )}
    </div>
  );
}
