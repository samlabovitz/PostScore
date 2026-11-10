"use client";

// Premium + Google connected: the owner's Google reviews, read live from
// their Business Profile (shown, never stored). Filtered Needs a reply /
// Replied / All, sorted newest first (or lowest rating / oldest — the
// choice kept per browser), 3 at a time with "Show 10 more" / "Show all",
// under one summary line ("29 reviews need a reply · newest from …").
// "Draft a reply" uses PostAI's reply drafter (its rules and plan limits —
// app/actions/reviewReplies.ts); the owner edits it, and only their
// "Approve and post" click sends it to Google, which is then read back.
// A replied review leaves "Needs a reply" and the next one moves up. A
// reply Google accepted but isn't showing yet waits (no Draft / Write
// buttons) while the page re-checks Google every 15 seconds for up to 2
// minutes (lib/gbpReviewPending.ts) — and keeps waiting after a refresh.
// Green for posted, neutral or amber while waiting, red only for real failures.
// Practice mode shows a banner (nothing is sent to Google); a business not
// on the live posting allow list loads read-only (lib/gbpReviewPractice.ts).

import { useCallback, useEffect, useState } from "react";
import { IconBrandGoogle, IconCheck, IconClock, IconFlask, IconLock, IconPencil, IconSparkles, IconStarFilled, IconTrash } from "@tabler/icons-react";
import { changeGoogleReviewReply, checkGoogleReview, listGoogleReviews, type ChangeGoogleReplyResult } from "@/app/actions/googleReviews";
import { mergePending, pendingFor, pendingPhase, pendingResolved, readPending, watchPending, writePending, type PendingReply } from "@/lib/gbpReviewPending";
import { draftReviewReply } from "@/app/actions/reviewReplies";
import {
  filterReviews,
  inboxSummary,
  INBOX_FILTERS,
  INBOX_FIRST,
  INBOX_SORTS,
  isInboxSort,
  MAX_POSTED_REPLY_CHARS,
  needsReadMore,
  newestFirst,
  SHOW_MORE_STEP,
  visibleReviews,
  type InboxFilter,
  type InboxReview,
  type InboxSort,
} from "@/lib/gbpReviewInbox";
import { formatShortDate, t, tPlural, useLocale, useTimeZone, type Locale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const K = (key: string) => `dashboard.googleReviews.${key}` as MessageKey;
export const SORT_STORAGE_KEY = "postscore.reviewInbox.sort";
/** "Show all" loads Google's remaining pages, up to the newest 500. */
const MAX_PAGES = 10;

/** How a message under a review looks: red only for a real failure. */
export type MessageTone = "neutral" | "failure";

export function messageTone(result: ChangeGoogleReplyResult): MessageTone | null {
  if (result.status === "ok" || result.status === "unconfirmed") return null;
  return result.status === "already_replied" || result.status === "no_reply" ? "neutral" : "failure";
}

/** The message under a review after the owner's click — the real reason,
 * never a guess. "unconfirmed" has none: the review waits instead. */
export function changeMessage(result: ChangeGoogleReplyResult, locale: Locale, action: "post" | "edit" | "delete" = "post"): string | null {
  switch (result.status) {
    case "ok":
    case "unconfirmed":
      return null;
    case "already_replied":
      return t(locale, K("error.alreadyReplied"));
    case "no_reply":
      return t(locale, K("error.noReply"));
    case "not_set_up":
      return t(locale, K("error.notSetUp"));
    case "rules":
      return t(locale, K("error.rules"));
    case "invalid":
      return t(locale, K("error.invalid"), { max: MAX_POSTED_REPLY_CHARS.toLocaleString(locale) });
    case "posting_off":
      return t(locale, K("error.postingOff"));
    case "blocked":
      return t(locale, result.reason === "not_premium" ? K("error.notPremium") : result.reason === "archived" ? K("error.archived") : K("error.notConnected"));
    case "error":
      return t(locale, result.error === "reconnect" ? K("error.reconnect") : result.error === "not_found" ? K("error.notFound") : K(action === "delete" ? "error.deleteFailed" : "error.failed"));
  }
}

/** A star-only review still gets a real reply: the drafter is told so. */
function draftInput(review: InboxReview): string {
  if (review.comment) return review.comment;
  return review.stars ? `The reviewer left a ${review.stars}-star rating with no written review.` : "The reviewer left a rating with no written review.";
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readSort(): InboxSort {
  try {
    const saved = window.localStorage.getItem(SORT_STORAGE_KEY);
    return isInboxSort(saved) ? saved : "newest";
  } catch {
    return "newest";
  }
}

function saveSort(sort: InboxSort) {
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, sort);
  } catch {
    // Private window or blocked storage: the choice lasts for this visit.
  }
}

type RowState =
  | { kind: "idle" }
  | { kind: "drafting" }
  | { kind: "editing"; text: string; action: "post" | "edit" }
  | { kind: "sending"; text: string; action: "post" | "edit" }
  | { kind: "confirm_delete" }
  | { kind: "deleting" };

type Done = { action: "post" | "edit" | "delete" | "shown"; reviewer: string | null };

function Stars({ count }: { count: number | null }) {
  const locale = useLocale();
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-brass" aria-label={t(locale, K("starsAria"), { count })} role="img">
      {Array.from({ length: 5 }, (_, i) => (
        <IconStarFilled key={i} size={13} aria-hidden className={i < count ? "text-brass" : "text-paper-deep"} />
      ))}
    </span>
  );
}

/** Read-only (posting off for this business): Approve, Edit reply and
 * Delete reply all look the same — grey, a small lock, and the tooltip on
 * a wrapper (some browsers show none on a disabled button). */
function LockedAction({ testId, label, size = "sm" }: { testId: string; label: string; size?: "sm" | "md" }) {
  const locale = useLocale();
  const tip = t(locale, K("postingOffTip"));
  return (
    <span title={tip} className="inline-flex">
      <button
        type="button"
        disabled
        aria-disabled="true"
        data-testid={testId}
        data-locked="true"
        aria-label={`${label} — ${tip}`}
        className={cn(
          "inline-flex cursor-not-allowed items-center gap-1 rounded-lg border border-paper-deep bg-paper font-medium text-ink-mute",
          size === "md" ? "px-3.5 py-2 text-[13px]" : "px-2.5 py-1 text-[12.5px]"
        )}
      >
        <IconLock size={12} aria-hidden />
        {label}
      </button>
    </span>
  );
}

function ReviewText({ text }: { text: string | null }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  if (!text) return <p className="text-[13.5px] italic leading-snug text-ink-mute">{t(locale, K("noText"))}</p>;
  const long = needsReadMore(text);
  return (
    <div className="flex flex-col items-start gap-0.5">
      <p data-testid="review-text" className={cn("whitespace-pre-line text-[13.5px] leading-snug text-ink", long && !open && "line-clamp-2")}>
        {text}
      </p>
      {long && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="text-[12.5px] font-semibold text-ink-soft hover:text-ink">
          {t(locale, K(open ? "showLess" : "readMore"))}
        </button>
      )}
    </div>
  );
}

function ReviewRow({
  businessId,
  review,
  canPost,
  waiting,
  onChanged,
  onPending,
}: {
  businessId: string;
  review: InboxReview;
  canPost: boolean;
  /** Google accepted a change it isn't showing yet: "waiting" (re-checking), or "timed_out" after 2 minutes. */
  waiting: { phase: "waiting" | "timed_out"; action: "post" | "edit" | "delete" } | null;
  onChanged: (r: InboxReview, done: Done | null) => void;
  onPending: (p: PendingReply) => void;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [state, setState] = useState<RowState>({ kind: "idle" });
  const [message, setMessage] = useState<{ text: string; tone: MessageTone } | null>(null);

  async function draft() {
    setState({ kind: "drafting" });
    setMessage(null);
    const result = await draftReviewReply(businessId, draftInput(review), review.stars).catch(() => ({ status: "unavailable" }) as const);
    if (result.status === "ok") {
      setState({ kind: "editing", text: result.reply, action: "post" });
      return;
    }
    setState({ kind: "idle" });
    setMessage({ text: t(locale, result.status === "error" ? "dashboard.replies.errorRules" : result.status === "limit" ? K("error.draftLimit") : "dashboard.replies.errorUnavailable"), tone: "failure" });
  }

  async function send(action: "post" | "edit" | "delete", text: string | null) {
    setMessage(null);
    setState(action === "delete" ? { kind: "deleting" } : { kind: "sending", text: text ?? "", action });
    const result = await changeGoogleReviewReply(businessId, review.reviewId, action, text).catch(() => ({ status: "error", error: "failed" }) as const);
    if (result.status === "ok") {
      setState({ kind: "idle" });
      onChanged(result.review, { action, reviewer: review.reviewer });
      return;
    }
    // Accepted, not showing yet: the review waits (no buttons) while the page re-checks Google.
    if (result.status === "unconfirmed") {
      setState({ kind: "idle" });
      onPending(pendingFor(action, review.reviewId, action === "delete" ? null : (text ?? "").trim(), Date.now()));
      return;
    }
    // Google's own current state, so the row never shows something that isn't there.
    if (result.status === "already_replied" || result.status === "no_reply") onChanged(result.review, null);
    const text_ = changeMessage(result, locale, action);
    const tone = messageTone(result);
    setMessage(text_ && tone ? { text: text_, tone } : null);
    // A refused reply stays in the box, so the owner can change the wording.
    setState(action === "delete" || result.status === "already_replied" || result.status === "no_reply" ? { kind: "idle" } : { kind: "editing", text: text ?? "", action });
  }

  const busy = state.kind === "drafting" || state.kind === "sending" || state.kind === "deleting";
  const editing = (state.kind === "editing" || state.kind === "sending") && waiting?.phase !== "waiting";
  // While Google hasn't shown the change yet: no buttons at all.
  const locked = waiting?.phase === "waiting";

  return (
    <li data-testid="google-review" data-review-id={review.reviewId} className="flex flex-col gap-2.5 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-[14px] font-semibold text-ink">{review.reviewer ?? t(locale, K("anonymous"))}</span>
        <Stars count={review.stars} />
        {review.createTime && <span className="text-[12px] text-ink-mute">{formatShortDate(review.createTime, locale, timeZone)}</span>}
      </div>
      <ReviewText text={review.comment} />

      {locked && (
        <p data-testid="reply-waiting" role="status" className="flex items-center gap-1.5 rounded-lg border border-paper-deep bg-paper px-3 py-2 text-[13px] text-ink">
          <IconClock size={14} aria-hidden className="shrink-0 animate-pulse text-ink-soft motion-reduce:animate-none" />
          {t(locale, K(waiting!.action === "delete" ? "waiting.delete" : "waiting.reply"))}
        </p>
      )}
      {waiting?.phase === "timed_out" && (
        <p data-testid="reply-timed-out" role="status" className="rounded-lg border border-[color:color-mix(in_srgb,var(--color-amber)_45%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_10%,white)] px-3 py-2 text-[13px] text-ink">
          {t(locale, K("waiting.timedOut"))}
        </p>
      )}

      {review.reply && !editing && !locked && (
        <div data-testid="google-review-reply" className="flex flex-col gap-1.5 rounded-xl border border-paper-deep bg-paper p-3">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{t(locale, K("yourReply"))}</span>
          <ReviewText text={review.reply.comment} />
          {state.kind === "confirm_delete" || state.kind === "deleting" ? (
            <div role="alertdialog" aria-label={t(locale, K("delete"))} className="flex flex-col gap-2 rounded-lg border border-[color:color-mix(in_srgb,var(--color-red)_35%,white)] bg-white p-2.5">
              <p className="text-[13px] text-ink">{t(locale, K("deleteConfirm"))}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" data-testid="confirm-delete" disabled={busy || !canPost} onClick={() => send("delete", null)} className="rounded-lg border border-red bg-red px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60">
                  {state.kind === "deleting" ? t(locale, K("deleting")) : t(locale, K("deleteYes"))}
                </button>
                <button type="button" disabled={busy} onClick={() => setState({ kind: "idle" })} className="rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink">
                  {t(locale, K("cancel"))}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {!canPost ? (
                <>
                  <LockedAction testId="edit-reply" label={t(locale, K("edit"))} />
                  <LockedAction testId="delete-reply" label={t(locale, K("delete"))} />
                </>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="edit-reply"
                    onClick={() => {
                      setMessage(null);
                      setState({ kind: "editing", text: review.reply!.comment, action: "edit" });
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-paper-deep bg-white px-2.5 py-1 text-[12.5px] font-medium text-ink hover:border-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <IconPencil size={13} aria-hidden />
                    {t(locale, K("edit"))}
                  </button>
                  <button
                    type="button"
                    data-testid="delete-reply"
                    onClick={() => {
                      setMessage(null);
                      setState({ kind: "confirm_delete" });
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-paper-deep bg-white px-2.5 py-1 text-[12.5px] font-medium text-ink hover:border-red hover:text-red disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <IconTrash size={13} aria-hidden />
                    {t(locale, K("delete"))}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {!review.reply && !editing && !locked && (
        <div className="flex flex-wrap gap-2">
          <button type="button" data-testid="draft-google-reply" disabled={busy} onClick={draft} className="inline-flex items-center gap-1.5 rounded-lg border border-brass bg-brass px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-[#a5772a] disabled:opacity-60">
            <IconSparkles size={14} aria-hidden />
            {state.kind === "drafting" ? t(locale, K("drafting")) : t(locale, K("draft"))}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMessage(null);
              setState({ kind: "editing", text: "", action: "post" });
            }}
            className="rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-soft"
          >
            {t(locale, K("write"))}
          </button>
        </div>
      )}

      {editing && (
        <div data-testid="google-reply-editor" className="flex flex-col gap-2 rounded-xl border border-paper-deep bg-paper p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-ink">{t(locale, K("replyLabel"))}</span>
            <textarea
              value={state.text}
              onChange={(e) => state.kind === "editing" && setState({ ...state, text: e.target.value })}
              maxLength={MAX_POSTED_REPLY_CHARS}
              rows={5}
              disabled={state.kind === "sending"}
              className="w-full resize-y rounded-lg border border-paper-deep bg-white px-3 py-2 text-[14px] text-ink focus:border-brass focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {!canPost ? (
              <LockedAction testId="approve-reply" label={t(locale, K(state.action === "post" ? "approve" : "save"))} size="md" />
            ) : (
              <button
                type="button"
                data-testid="approve-reply"
                disabled={state.kind === "sending" || state.text.trim().length === 0}
                onClick={() => send(state.action, state.text)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink bg-ink px-3.5 py-2 text-[13px] font-semibold text-paper disabled:cursor-not-allowed disabled:opacity-50"
              >
                <IconBrandGoogle size={14} aria-hidden />
                {state.kind === "sending" ? t(locale, K(state.action === "post" ? "posting" : "saving")) : t(locale, K(state.action === "post" ? "approve" : "save"))}
                <span data-testid="beta-label" className="rounded bg-[color:color-mix(in_srgb,var(--color-paper)_20%,transparent)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]">
                  {t(locale, K("beta"))}
                </span>
              </button>
            )}
            <button type="button" disabled={state.kind === "sending"} onClick={() => setState({ kind: "idle" })} className="rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink">
              {t(locale, K("cancel"))}
            </button>
          </div>
        </div>
      )}

      {message && (
        <p data-testid="reply-message" role={message.tone === "failure" ? "alert" : "status"} className={cn("text-[13px]", message.tone === "failure" ? "text-red" : "text-ink-soft")}>
          {message.text}
        </p>
      )}
    </li>
  );
}

/** The list itself — filters, sort, summary, the first 3 and "Show more". */
export function InboxBody({
  businessId,
  reviews,
  practice,
  canPost,
  hasMore,
  loadingMore = false,
  initialPending = [],
  initialFilter = "needs_reply",
  initialLimit = INBOX_FIRST,
  onLoadAll,
  onChanged,
}: {
  businessId: string;
  reviews: InboxReview[];
  practice: boolean;
  canPost: boolean;
  /** Google has older pages not loaded yet. */
  hasMore: boolean;
  loadingMore?: boolean;
  /** Waits from the server log (lib/gbpReviewInbox.server.ts pendingFromLog). */
  initialPending?: PendingReply[];
  /** The filter it opens on (Needs a reply). */
  initialFilter?: InboxFilter;
  /** How many it opens with (3; null = all). */
  initialLimit?: number | null;
  onLoadAll: () => void;
  onChanged: (review: InboxReview) => void;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [filter, setFilter] = useState<InboxFilter>(initialFilter);
  const [sort, setSort] = useState<InboxSort>("newest");
  const [limit, setLimit] = useState<number | null>(initialLimit);
  const [done, setDone] = useState<Done | null>(null);
  const [pending, setPending] = useState<PendingReply[]>(initialPending);
  const [timedOut, setTimedOut] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => setSort(readSort()), []);

  // This browser's waits join the server log's — the wait survives a refresh.
  useEffect(() => {
    const storage = browserStorage();
    setPending((p) => mergePending(p, readPending(storage, businessId, Date.now())));
  }, [businessId]);
  const savePending = useCallback(
    (next: PendingReply[]) => {
      setPending(next);
      writePending(browserStorage(), businessId, next);
    },
    [businessId]
  );

  // A wait Google already answered (the list itself shows it) ends at once.
  useEffect(() => {
    const open = pending.filter((p) => {
      const r = reviews.find((x) => x.reviewId === p.reviewId);
      return !r || !pendingResolved(p, r);
    });
    if (open.length !== pending.length) savePending(open);
  }, [reviews, pending, savePending]);

  // Re-check Google every 15 seconds, for up to 2 minutes, for each wait.
  const watched = pending.map((p) => `${p.reviewId}:${p.since}`).join("|");
  useEffect(() => {
    const stops = pending.map((p) =>
      watchPending(p, {
        check: async () => {
          const result = await checkGoogleReview(businessId, p.reviewId);
          return result.status === "ok" ? result.review : null;
        },
        onShown: (review) => {
          setPending((list) => {
            const next = list.filter((x) => x.reviewId !== p.reviewId);
            writePending(browserStorage(), businessId, next);
            return next;
          });
          setDone({ action: p.action === "delete" ? "delete" : "shown", reviewer: review.reviewer });
          onChanged(review);
        },
        onTimedOut: () => {
          setTimedOut((s) => new Set(s).add(p.reviewId));
          setNow(Date.now());
        },
      })
    );
    return () => stops.forEach((stop) => stop());
    // `watched` stands for `pending` (same waits → the same watchers).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched, businessId]);

  const waitingFor = (reviewId: string): { phase: "waiting" | "timed_out"; action: "post" | "edit" | "delete" } | null => {
    const p = pending.find((x) => x.reviewId === reviewId);
    if (!p) return null;
    return { phase: timedOut.has(reviewId) ? "timed_out" : pendingPhase(p, now), action: p.action };
  };

  const { shown, total } = visibleReviews(reviews, filter, sort, limit);
  const counts = { needs_reply: filterReviews(reviews, "needs_reply").length, replied: filterReviews(reviews, "replied").length, all: reviews.length };
  const summary = inboxSummary(reviews);
  const more = hasMore ? "+" : "";
  const hidden = total - shown.length;
  // More than the first 3 are open: "Show fewer" closes back to 3 and
  // brings the top of the inbox into view.
  const expanded = shown.length > INBOX_FIRST;
  const showFewer = () => {
    setLimit(INBOX_FIRST);
    try {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("google-reviews")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    } catch {
      // No scrolling outside a browser.
    }
  };

  return (
    <>
      {practice && (
        <div data-testid="practice-banner" role="status" className="flex items-start gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--color-amber)_45%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_10%,white)] px-3 py-2.5">
          <IconFlask size={16} aria-hidden className="mt-0.5 shrink-0 text-ink" />
          <div className="text-[13px] leading-snug text-ink">
            <p className="font-semibold">{t(locale, K("practice.banner"))}</p>
            <p className="text-ink-soft">{t(locale, K("practice.body"))}</p>
          </div>
        </div>
      )}
      {!practice && !canPost && (
        <p data-testid="read-only-note" className="flex items-start gap-2 rounded-lg border border-paper-deep bg-paper px-3 py-2 text-[13px] leading-snug text-ink">
          <IconLock size={15} aria-hidden className="mt-0.5 shrink-0 text-ink-soft" />
          {t(locale, K("readOnly"))}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t(locale, K("filterLabel"))}>
          {INBOX_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => {
                setFilter(f);
                setLimit(INBOX_FIRST);
              }}
              className={cn("rounded-full border px-3 py-1 text-[12.5px] font-semibold", filter === f ? "border-ink bg-ink text-paper" : "border-paper-deep bg-white text-ink hover:border-ink-soft")}
            >
              {t(locale, K(`filter.${f}`))}
              <span className="ml-1 tabular-nums opacity-80">
                {counts[f]}
                {more}
              </span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft">
          {t(locale, K("sortLabel"))}
          <select
            data-testid="inbox-sort"
            value={sort}
            onChange={(e) => {
              const next = isInboxSort(e.target.value) ? e.target.value : "newest";
              setSort(next);
              setLimit(INBOX_FIRST);
              saveSort(next);
            }}
            className="rounded-lg border border-paper-deep bg-white px-2 py-1 text-[12.5px] font-medium text-ink focus:border-brass focus:outline-none"
          >
            {INBOX_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(locale, K(`sort.${s}`))}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p data-testid="inbox-summary" className={cn("text-[13px] font-semibold", summary.kind === "caught_up" ? "text-green" : "text-ink")}>
          {summary.kind === "caught_up"
            ? t(locale, K("summary.caughtUp"))
            : tPlural(locale, "dashboard.googleReviews.summary.needsReply", summary.count, {
                count: `${summary.count}${more}`,
                date: summary.newestAt ? formatShortDate(summary.newestAt, locale, timeZone) : "",
              })}
        </p>
        {/* The full list is open: close it from the top too. */}
        {limit === null && expanded && (
          <button type="button" data-testid="show-fewer-top" onClick={showFewer} className="text-[12.5px] font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline">
            {t(locale, K("showFewer"))}
          </button>
        )}
      </div>

      <div aria-live="polite">
        {done && (
          <p data-testid="google-reply-done" className="inline-flex items-center gap-1 text-[13px] font-semibold text-green">
            <IconCheck size={14} aria-hidden />
            {t(locale, K(`${practice ? "practice." : ""}done.${done.action}`), { name: done.reviewer ?? t(locale, K("anonymous")) })}
          </p>
        )}
      </div>

      {shown.length === 0 ? (
        <p data-testid="google-reviews-empty" className="text-[13px] text-ink-soft">
          {t(locale, K(`empty.${filter}`))}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-paper-line">
          {shown.map((r) => (
            <ReviewRow
              key={r.reviewId}
              businessId={businessId}
              review={r}
              canPost={canPost}
              waiting={waitingFor(r.reviewId)}
              onChanged={(updated, d) => {
                if (d) setDone(d);
                onChanged(updated);
              }}
              onPending={(p) => {
                setDone(null);
                setTimedOut((s) => {
                  const next = new Set(s);
                  next.delete(p.reviewId);
                  return next;
                });
                setNow(Date.now());
                savePending(mergePending(pending.filter((x) => x.reviewId !== p.reviewId), [p]));
              }}
            />
          ))}
        </ul>
      )}

      {(hidden > 0 || (hasMore && limit !== null) || expanded) && (
        <div className="flex flex-wrap gap-2">
          {hidden > 0 && limit !== null && (
            <button
              type="button"
              data-testid="show-more"
              disabled={loadingMore}
              onClick={() => {
                setLimit(limit + SHOW_MORE_STEP);
                if (hasMore && limit + SHOW_MORE_STEP > total) onLoadAll();
              }}
              className="rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-soft disabled:opacity-60"
            >
              {t(locale, K("showMore"), { count: Math.min(SHOW_MORE_STEP, hidden) })}
            </button>
          )}
          {(hidden > 0 || (hasMore && limit !== null)) && (
            <button
              type="button"
              data-testid="show-all"
              disabled={loadingMore}
              onClick={() => {
                setLimit(null);
                if (hasMore) onLoadAll();
              }}
              className="rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-soft disabled:opacity-60"
            >
              {loadingMore ? t(locale, K("loading")) : t(locale, K("showAll"), { count: `${total}${more}` })}
            </button>
          )}
          {expanded && (
            <button type="button" data-testid="show-fewer" onClick={showFewer} className="rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-soft">
              {t(locale, K("showFewer"))}
            </button>
          )}
        </div>
      )}
    </>
  );
}

export function GoogleReviewsInbox({ businessId }: { businessId: string }) {
  const locale = useLocale();
  const [reviews, setReviews] = useState<InboxReview[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [practice, setPractice] = useState(false);
  const [canPost, setCanPost] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [serverPending, setServerPending] = useState<PendingReply[]>([]);

  const page = useCallback(async (pageToken: string | null) => {
    const result = await listGoogleReviews(businessId, pageToken).catch(() => ({ status: "error", error: "failed" }) as const);
    if (result.status !== "ok") {
      setError(result.status === "error" && result.error === "reconnect" ? K("error.listReconnect") : result.status === "blocked" && result.reason === "not_connected" ? K("error.notConnected") : K("error.list"));
      return null;
    }
    setPractice(result.practice);
    setCanPost(result.canPost);
    return result;
  }, [businessId]);

  useEffect(() => {
    void (async () => {
      const first = await page(null);
      setServerPending(first?.pending ?? []);
      setReviews(first ? newestFirst(first.reviews) : []);
      setNext(first?.nextPageToken ?? null);
    })();
  }, [page]);

  async function loadAll() {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    let token: string | null = next;
    const more: InboxReview[] = [];
    for (let i = 1; token && i < MAX_PAGES; i++) {
      const result = await page(token);
      if (!result) break;
      more.push(...result.reviews);
      token = result.nextPageToken;
    }
    setReviews((prev) => {
      const seen = new Set((prev ?? []).map((r) => r.reviewId));
      return newestFirst([...(prev ?? []), ...more.filter((r) => !seen.has(r.reviewId))]);
    });
    setNext(token);
    setLoadingMore(false);
  }

  return (
    <section id="google-reviews" data-testid="google-reviews-inbox" className="flex scroll-mt-20 flex-col gap-3 rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-center gap-2">
        <IconBrandGoogle size={18} aria-hidden className="shrink-0 text-brass" />
        <h3 className="text-base font-semibold text-ink">{t(locale, K("heading"))}</h3>
      </div>
      <p className="text-[13px] leading-snug text-ink-soft">{t(locale, K("intro"))}</p>

      {reviews === null ? (
        <p className="text-[13px] text-ink-soft">{t(locale, K("loading"))}</p>
      ) : (
        reviews.length > 0 || !error ? (
          <InboxBody
            businessId={businessId}
            reviews={reviews}
            practice={practice}
            canPost={canPost}
            hasMore={!!next}
            loadingMore={loadingMore}
            initialPending={serverPending}
            onLoadAll={loadAll}
            onChanged={(updated) => setReviews((prev) => (prev ?? []).map((x) => (x.reviewId === updated.reviewId ? updated : x)))}
          />
        ) : null
      )}
      {error && (
        <p role="alert" className="text-[13px] text-red">
          {t(locale, error)}
        </p>
      )}
      <p className="text-[12px] leading-snug text-ink-mute">{t(locale, K("footer"))}</p>
    </section>
  );
}
