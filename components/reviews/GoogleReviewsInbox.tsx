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

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { IconBrandGoogle, IconCheck, IconClock, IconFlask, IconLock, IconPencil, IconSparkles, IconStarFilled, IconTrash } from "@tabler/icons-react";
import { changeGoogleReviewReply, checkGoogleReview, listGoogleReviews, type ChangeGoogleReplyResult } from "@/app/actions/googleReviews";
import { mergePending, pendingFor, pendingPhase, pendingResolved, readPending, watchPending, writePending, type PendingReply } from "@/lib/gbpReviewPending";
import { draftReviewReply } from "@/app/actions/reviewReplies";
import { getSavedReplies, redraftWeekReply, saveReplyDraft, type SavedRepliesResult } from "@/app/actions/approveAll";
import { ReplyTweaks, ReplyVoicePicker } from "@/components/reviews/ReplyTweaks";
import { googleReviewsHref, type ReplyLength } from "@/lib/reviewReplies";
import { GOOGLE_WRITES_FOR_EVERYONE } from "@/lib/googleWritesLaunch";
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

type SavedDraft = Extract<SavedRepliesResult, { status: "ok" }>["drafts"][number];

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
  const { grow } = useContext(InboxPlanContext);
  const tip = t(locale, K(grow ? "postingPremiumTip" : "postingOffTip"));
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

/** Grow: the same inbox and pre-drafted replies, posted by the owner on Google (copy, then reply there); posting
 * from here is Premium. `googleHref`: where the owner replies on Google. */
export const InboxPlanContext = createContext<{ grow: boolean; googleHref: string | null }>({ grow: false, googleHref: null });

/** The small "Premium …" line next to what Grow does by hand. */
function PremiumLine({ businessId, label, testId }: { businessId: string; label: MessageKey; testId: string }) {
  const locale = useLocale();
  return (
    <Link href={`/business/${businessId}/settings#compare-plans`} data-testid={testId} className="w-fit text-[12px] font-medium text-ink-mute underline decoration-brass/60 underline-offset-2 hover:text-ink">
      {t(locale, label)}
    </Link>
  );
}

function ReviewRow({
  businessId,
  review,
  saved = null,
  canPost,
  waiting,
  onChanged,
  onPending,
  onDraftChange = () => undefined,
  posted = false,
}: {
  businessId: string;
  review: InboxReview;
  /** This review's saved draft (current for this version of the review), if any. */
  saved?: SavedDraft | null;
  /** The owner changed the draft's text or "Include in Approve all": "Approve all replies" counts and sends what's here. */
  onDraftChange?: (reviewId: string, patch: Partial<SavedDraft>) => void;
  /** Sent by "Approve all replies" just now: "Posted ✓". */
  posted?: boolean;
  canPost: boolean;
  /** Google accepted a change it isn't showing yet: "waiting" (re-checking), or "timed_out" after 2 minutes. */
  waiting: { phase: "waiting" | "timed_out"; action: "post" | "edit" | "delete" } | null;
  onChanged: (r: InboxReview, done: Done | null) => void;
  onPending: (p: PendingReply) => void;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const { grow, googleHref } = useContext(InboxPlanContext);
  const [copied, setCopied] = useState(false);
  // A saved draft that fits this version of the review opens ready to read, edit and post.
  const fits = !review.reply && !!saved?.reply && saved.reviewUpdated === (review.updateTime ?? null);
  const [state, setState] = useState<RowState>(fits ? { kind: "editing", text: saved!.reply!, action: "post" } : { kind: "idle" });
  const [include, setInclude] = useState(saved?.include !== false);
  const [message, setMessage] = useState<{ text: string; tone: MessageTone } | null>(null);
  // The saved drafts arrive after the reviews: open on the draft then, unless the owner already started.
  useEffect(() => {
    if (fits) setState((s) => (s.kind === "idle" ? { kind: "editing", text: saved!.reply!, action: "post" } : s));
    setInclude(saved?.include !== false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the saved draft arrives
  }, [saved?.reply, saved?.include]);

  const [length, setLength] = useState<ReplyLength>("medium");
  const [redrafting, setRedrafting] = useState(false);

  async function draft() {
    setState({ kind: "drafting" });
    setMessage(null);
    const result = await draftReviewReply(businessId, draftInput(review), review.stars, { reviewer: review.reviewer }).catch(() => ({ status: "unavailable" }) as const);
    if (result.status === "ok") {
      setLength("medium");
      setState({ kind: "editing", text: result.reply, action: "post" });
      return;
    }
    setState({ kind: "idle" });
    setMessage({ text: t(locale, result.status === "error" ? "dashboard.replies.errorRules" : result.status === "limit" ? K("error.draftLimit") : "dashboard.replies.errorUnavailable"), tone: "failure" });
  }

  /** "Short · Medium · Long" / "Different wording": this reply again (counts as a draft on Free and Grow). */
  async function redraft(opts: { length: ReplyLength; mode: "length" | "different" }) {
    if (state.kind !== "editing") return;
    const current = state.text;
    setRedrafting(true);
    setMessage(null);
    // The one reply tool: the same rules as the saved drafts, saved as this review's draft. Grow: one of the week's drafts.
    const result = grow
      ? await draftReviewReply(businessId, draftInput(review), review.stars, { reviewer: review.reviewer, length: opts.length, current, mode: opts.mode }).catch(() => ({ status: "error" }) as const)
      : await redraftWeekReply(businessId, review.reviewId, { length: opts.length, mode: opts.mode, current }).catch(() => ({ status: "error" }) as const);
    setRedrafting(false);
    if (result.status === "ok") {
      setLength(opts.length);
      setState((s) => (s.kind === "editing" ? { ...s, text: result.reply } : s));
    } else setMessage({ text: t(locale, "dashboard.replies.errorRules"), tone: "failure" });
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
        {posted && (
          <span data-testid="reply-posted" className="rounded-full bg-[color:color-mix(in_srgb,var(--color-green)_12%,white)] px-2 py-0.5 text-[11.5px] font-semibold text-green">
            {t(locale, K("all.posted"))}
          </span>
        )}
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

      {/* Premium's pre-drafted inbox never falls back to the old buttons: the same reply box, with what happened. */}
      {!review.reply && !editing && !locked && !grow && !fits && (
        <div data-testid="no-draft-box" data-failed={saved?.failed || undefined} className="flex flex-col gap-2 rounded-xl border border-paper-deep bg-paper p-3">
          <span className="text-[12.5px] font-semibold text-ink">{t(locale, K("replyLabel"))}</span>
          <p className="text-[13px] text-ink-soft">{t(locale, K(saved?.failed ? "draftFailed" : "noDraftYet"))}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="draft-try-again" disabled={busy} onClick={draft} className="inline-flex items-center gap-1.5 rounded-lg border border-brass bg-brass px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-[#a5772a] disabled:opacity-60">
              <IconSparkles size={14} aria-hidden />
              {state.kind === "drafting" ? t(locale, K("drafting")) : t(locale, K(saved?.failed ? "tryAgain" : "draftNow"))}
            </button>
            <button
              type="button"
              disabled={busy}
              data-testid="reply-write-own"
              onClick={() => {
                setMessage(null);
                setState({ kind: "editing", text: "", action: "post" });
              }}
              className="text-[13px] font-semibold text-ink underline underline-offset-2"
            >
              {t(locale, K("write"))}
            </button>
          </div>
        </div>
      )}

      {!review.reply && !editing && !locked && (grow || fits) && (
        <div className="flex flex-wrap items-center gap-2">
          {fits ? (
            // Skipped for now: the saved draft is still there.
            <button type="button" data-testid="show-draft" onClick={() => setState({ kind: "editing", text: saved!.reply!, action: "post" })} className="inline-flex items-center gap-1.5 rounded-lg border border-brass bg-brass px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-[#a5772a]">
              <IconSparkles size={14} aria-hidden />
              {t(locale, K("showDraft"))}
            </button>
          ) : (
            <button type="button" data-testid="draft-google-reply" disabled={busy} onClick={draft} className="inline-flex items-center gap-1.5 rounded-lg border border-brass bg-brass px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-[#a5772a] disabled:opacity-60">
              <IconSparkles size={14} aria-hidden />
              {state.kind === "drafting" ? t(locale, K("drafting")) : t(locale, K("draft"))}
            </button>
          )}
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
          {grow && !fits && <PremiumLine businessId={businessId} label={K("premiumDraftsAll")} testId="premium-drafts-all" />}
        </div>
      )}

      {editing && (
        <div data-testid="google-reply-editor" className="flex flex-col gap-2 rounded-xl border border-paper-deep bg-paper p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-ink">{t(locale, K("replyLabel"))}</span>
            <textarea
              value={state.text}
              onChange={(e) => state.kind === "editing" && setState({ ...state, text: e.target.value })}
              onBlur={() => {
                // The owner's own words are kept for this review (never replaced by a background run).
                if (state.kind === "editing" && state.action === "post" && state.text.trim() && state.text !== saved?.reply) {
                  void saveReplyDraft(businessId, review.reviewId, { text: state.text }).catch(() => undefined);
                  onDraftChange(review.reviewId, { reply: state.text });
                }
              }}
              maxLength={MAX_POSTED_REPLY_CHARS}
              rows={5}
              disabled={state.kind === "sending"}
              className="w-full resize-y rounded-lg border border-paper-deep bg-white px-3 py-2 text-[14px] text-ink focus:border-brass focus:outline-none"
            />
          </label>
          {state.action === "post" && state.text.trim() && <ReplyTweaks length={length} busy={redrafting} disabled={state.kind === "sending"} onRedraft={redraft} />}
          {state.action === "post" && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
              {/* Approve all is Premium: Grow posts each reply on Google itself. */}
              {!grow && (
                <label className="flex items-center gap-1.5 text-ink-soft">
                <input
                  type="checkbox"
                  checked={include}
                  onChange={(e) => {
                    setInclude(e.target.checked);
                    void saveReplyDraft(businessId, review.reviewId, { include: e.target.checked }).catch(() => undefined);
                    onDraftChange(review.reviewId, { include: e.target.checked });
                  }}
                  data-testid="reply-include"
                />
                {t(locale, "dashboard.googleTab.w.include")}
                </label>
              )}
              <button type="button" onClick={() => setState((s) => (s.kind === "editing" ? { ...s, text: "" } : s))} className="font-semibold text-ink underline underline-offset-2" data-testid="reply-write-own">
                {t(locale, K("write"))}
              </button>
            </div>
          )}
          {grow && state.action === "post" && (
            <p className="text-[12.5px] text-ink-soft" data-testid="grow-reply-steps">
              {t(locale, K("growSteps"))}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {grow && state.action === "post" ? (
              <>
                <button
                  type="button"
                  data-testid="copy-reply"
                  disabled={state.text.trim().length === 0}
                  onClick={() => {
                    void navigator.clipboard?.writeText(state.text.trim()).then(
                      () => setCopied(true),
                      () => undefined
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink bg-ink px-3.5 py-2 text-[13px] font-semibold text-paper disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copied ? t(locale, K("copied")) : t(locale, K("copyReply"))}
                </button>
                {googleHref && (
                  <a href={googleHref} target="_blank" rel="noopener noreferrer" data-testid="reply-on-google" className="text-[13px] font-semibold text-ink underline underline-offset-2">
                    {t(locale, K("replyOnGoogle"))}
                  </a>
                )}
              </>
            ) : !canPost ? (
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
                {/* Beta until writes are on for everyone (lib/googleWritesLaunch.ts). */}
                {!GOOGLE_WRITES_FOR_EVERYONE && (
                  <span data-testid="beta-label" className="rounded bg-[color:color-mix(in_srgb,var(--color-paper)_20%,transparent)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]">
                    {t(locale, K("beta"))}
                  </span>
                )}
              </button>
            )}
            {/* A pre-drafted reply isn't thrown away: "Skip for now" folds it, "Show draft" brings it back. */}
            <button type="button" data-testid="reply-cancel" disabled={state.kind === "sending"} onClick={() => setState({ kind: "idle" })} className="rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink">
              {t(locale, K(fits && state.action === "post" ? "skip" : "cancel"))}
            </button>
          </div>
          {grow && state.action === "post" && <PremiumLine businessId={businessId} label="dashboard.googleReviews.premiumPosts" testId="premium-one-click" />}
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
/** The reviews "Approve all replies" sends: unanswered, not waiting on Google, with a draft that fits this version of
 * the review and is left in "Include in Approve all" — the same set and count as Fix plan's "Approve fixes". Pure. */
export function approveAllReplyIds(reviews: InboxReview[], drafts: Map<string, SavedDraft>, waitingIds: string[] = []): string[] {
  const waiting = new Set(waitingIds);
  return reviews
    .filter((r) => !r.reply && !waiting.has(r.reviewId))
    .filter((r) => {
      const d = drafts.get(r.reviewId);
      return !!d?.reply?.trim() && d.include !== false && !d.failed && d.reviewUpdated === (r.updateTime ?? null);
    })
    .map((r) => r.reviewId);
}

/** A pause between replies, so a long run stays inside Google's write limits. */
const APPROVE_ALL_GAP_MS = 1200;

/** "{n} replies ready · Approve all replies ({n})": sticky at the top of the list, a confirm step, then one by one
 * (the same server action and the same Google-writes rules as a single reply — practice mode, the live list). Grow:
 * the Premium line instead of the button. */
function ApproveAllReplies({
  businessId,
  reviews,
  drafts,
  canPost,
  grow,
  waitingIds,
  onPosted,
  onPending,
}: {
  businessId: string;
  reviews: InboxReview[];
  drafts: Map<string, SavedDraft>;
  canPost: boolean;
  grow: boolean;
  waitingIds: string[];
  onPosted: (review: InboxReview) => void;
  onPending: (p: PendingReply) => void;
}) {
  const locale = useLocale();
  const [step, setStep] = useState<"idle" | "confirm" | "posting" | "done">("idle");
  const [progress, setProgress] = useState({ done: 0, of: 0 });
  const [result, setResult] = useState<{ sent: number; failed: Array<{ name: string; why: string }> } | null>(null);
  const ids = approveAllReplyIds(reviews, drafts, waitingIds);
  const n = ids.length;
  if (n === 0 && step !== "posting" && step !== "done") return null;

  const run = async () => {
    const list = [...ids];
    setStep("posting");
    setProgress({ done: 0, of: list.length });
    let sent = 0;
    const failed: Array<{ name: string; why: string }> = [];
    for (let i = 0; i < list.length; i++) {
      const id = list[i];
      const review = reviews.find((r) => r.reviewId === id);
      const text = drafts.get(id)?.reply?.trim() ?? "";
      const r = await changeGoogleReviewReply(businessId, id, "post", text).catch(() => ({ status: "error", error: "failed" }) as const);
      if (r.status === "ok") {
        sent++;
        onPosted(r.review);
      } else if (r.status === "unconfirmed") {
        // Accepted; Google shows it shortly (the row waits and re-checks, like a single reply).
        sent++;
        onPending(pendingFor("post", id, text, Date.now()));
      } else if (r.status === "already_replied") onPosted(r.review);
      else failed.push({ name: review?.reviewer ?? t(locale, K("anonymous")), why: changeMessage(r, locale, "post") ?? "" });
      setProgress({ done: i + 1, of: list.length });
      if (i < list.length - 1) await new Promise((res) => setTimeout(res, APPROVE_ALL_GAP_MS));
    }
    setResult({ sent, failed });
    setStep("done");
  };

  return (
    <div data-testid="approve-all-replies" className="sticky top-14 z-20 -mx-1 rounded-xl border border-paper-deep bg-white/95 px-3 py-2.5 shadow-card backdrop-blur nav:top-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {/* After a run that sent them all, the result says it: no "0 replies ready". */}
        {(n > 0 || step === "posting") && (
          <p className="text-[13.5px] font-semibold text-ink" data-testid="approve-all-replies-count">
            {step === "posting" ? t(locale, K("all.posting"), { done: progress.done, count: progress.of }) : tPlural(locale, "dashboard.googleReviews.all.ready", n, { count: n })}
          </p>
        )}
        {grow ? (
          <Link href={`/business/${businessId}/settings#compare-plans`} data-testid="approve-all-replies-premium" className="text-[12.5px] font-medium text-ink-mute underline decoration-brass/60 underline-offset-2 hover:text-ink">
            {t(locale, K("all.premium"))}
          </Link>
        ) : step === "idle" || step === "done" ? (
          n > 0 &&
          (canPost ? (
            <button type="button" data-testid="approve-all-replies-button" onClick={() => setStep("confirm")} className="inline-flex items-center gap-1.5 rounded-lg border border-ink bg-ink px-3.5 py-2 text-[13px] font-semibold text-paper">
              <IconBrandGoogle size={14} aria-hidden />
              {t(locale, K("all.button"), { count: n })}
            </button>
          ) : (
            <LockedAction testId="approve-all-replies-button" label={t(locale, K("all.button"), { count: n })} size="md" />
          ))
        ) : null}
      </div>
      {step === "confirm" && (
        <div role="alertdialog" aria-label={t(locale, K("all.button"), { count: n })} data-testid="approve-all-replies-confirm" className="mt-2 flex flex-col gap-2 border-t border-paper-line pt-2">
          <p className="text-[13px] text-ink">{tPlural(locale, "dashboard.googleReviews.all.confirm", n, { count: n })}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="approve-all-replies-post" onClick={() => void run()} className="rounded-lg border border-ink bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-paper">
              {t(locale, K("all.post"))}
            </button>
            <button type="button" data-testid="approve-all-replies-cancel" onClick={() => setStep("idle")} className="rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink">
              {t(locale, K("cancel"))}
            </button>
          </div>
        </div>
      )}
      {step === "posting" && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper" aria-hidden>
          <div className="h-full rounded-full bg-green transition-[width]" style={{ width: `${progress.of ? (progress.done / progress.of) * 100 : 0}%` }} />
        </div>
      )}
      {step === "done" && result && (
        <div className="mt-2 flex flex-col gap-1 border-t border-paper-line pt-2 text-[13px]" data-testid="approve-all-replies-result" role="status">
          <span className="font-semibold text-green">{tPlural(locale, "dashboard.googleReviews.all.sent", result.sent, { count: result.sent })}</span>
          {result.failed.length > 0 && (
            <span className="text-red" data-testid="approve-all-replies-failed">
              {t(locale, K("all.failed"), { names: result.failed.map((f) => f.name).join(", ") })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

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
  saved = new Map(),
  onLoadAll,
  onChanged,
}: {
  /** The saved drafts by review id (lib/replyBatch.server.ts). */
  saved?: Map<string, SavedDraft>;
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
  const { grow } = useContext(InboxPlanContext);
  const timeZone = useTimeZone();
  const [filter, setFilter] = useState<InboxFilter>(initialFilter);
  const [sort, setSort] = useState<InboxSort>("newest");
  const [limit, setLimit] = useState<number | null>(initialLimit);
  const [done, setDone] = useState<Done | null>(null);
  const [pending, setPending] = useState<PendingReply[]>(initialPending);
  const [timedOut, setTimedOut] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  // The drafts as the owner has them now (their edits and "Include in Approve all"): what "Approve all replies" sends.
  const [drafts, setDrafts] = useState<Map<string, SavedDraft>>(saved);
  useEffect(() => setDrafts(saved), [saved]);
  const [posted, setPosted] = useState<Set<string>>(new Set());

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
      {/* Grow can't post from here because posting is Premium, not because writes are off: its own steps say so. */}
      {!practice && !canPost && !grow && (
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

      <ApproveAllReplies
        businessId={businessId}
        reviews={reviews}
        drafts={drafts}
        canPost={canPost}
        grow={grow}
        waitingIds={pending.map((p) => p.reviewId)}
        onPosted={(review) => {
          setPosted((s) => new Set(s).add(review.reviewId));
          onChanged(review);
        }}
        onPending={(p) => savePending(mergePending(pending.filter((x) => x.reviewId !== p.reviewId), [p]))}
      />

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
              saved={drafts.get(r.reviewId) ?? null}
              canPost={canPost}
              posted={posted.has(r.reviewId)}
              onDraftChange={(id, patch) => setDrafts((m) => (m.has(id) ? new Map(m).set(id, { ...m.get(id)!, ...patch }) : m))}
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

export function GoogleReviewsInbox({ businessId, grow = false, placeId = null }: { businessId: string; grow?: boolean; placeId?: string | null }) {
  const locale = useLocale();
  const [reviews, setReviews] = useState<InboxReview[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [practice, setPractice] = useState(false);
  const [canPost, setCanPost] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [serverPending, setServerPending] = useState<PendingReply[]>([]);
  // The saved drafts (written in the background; this page only reads them).
  const [saved, setSaved] = useState<Map<string, SavedDraft>>(new Map());

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
    getSavedReplies(businessId)
      .then((r) => r.status === "ok" && setSaved(new Map(r.drafts.map((d) => [d.reviewId, d]))))
      .catch(() => undefined);
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
    <InboxPlanContext.Provider value={{ grow, googleHref: googleReviewsHref(placeId) }}>
    <section id="google-reviews" data-testid="google-reviews-inbox" data-plan={grow ? "grow" : "premium"} className="flex scroll-mt-20 flex-col gap-3 rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-center gap-2">
        <IconBrandGoogle size={18} aria-hidden className="shrink-0 text-brass" />
        <h3 className="text-base font-semibold text-ink">{t(locale, K("heading"))}</h3>
      </div>
      <p className="text-[13px] leading-snug text-ink-soft">{t(locale, K(grow ? "introGrow" : "intro"))}</p>
      <ReplyVoicePicker businessId={businessId} />

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
            saved={saved}
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
      {!grow && <p className="text-[12px] leading-snug text-ink-mute">{t(locale, K("footer"))}</p>}
    </section>
    </InboxPlanContext.Provider>
  );
}
