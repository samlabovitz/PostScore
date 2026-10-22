"use client";

// "Reply to a review" (option B): the owner pastes a review copied from
// Google (and, optionally, its stars); PostAI drafts a short, polite reply
// in the business's language; the owner edits it, copies it and posts it
// on Google themselves ("Open my Google reviews"). Nothing is fetched from
// Google, and the pasted review isn't saved — only the reply.
// Free: 3 drafts a week (on the Free re-scan clock), counted on the server
// before any AI call, and paused when the month's Free AI budget is used.
// Grow: 10 drafts a week on the same clock, then the plans box (Premium =
// unlimited). Premium and Multi: unlimited.

import { useState } from "react";
import { IconCopy, IconExternalLink, IconMessageCircle, IconSparkles } from "@tabler/icons-react";
import { draftReviewReply, type ReplyDraftStatus } from "@/app/actions/reviewReplies";
import { copyText } from "@/app/business/[id]/website-reviews/GetMoreReviews";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";
import { FREE_REPLY_DRAFTS, googleReviewsHref, MAX_REVIEW_CHARS, replyDraftLimit } from "@/lib/reviewReplies";
import { isPremiumPlan, type Plan } from "@/lib/plan";
import { formatShortDate, t, useLocale, useTimeZone, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const K = (key: string) => `dashboard.replies.${key}` as MessageKey;

export function ReviewReplyDrafter({
  businessId,
  plan,
  placeId,
  initial,
  embedded = false,
}: {
  businessId: string;
  plan: Plan;
  placeId: string | null;
  /** From getReplyDraftStatus (server). */
  initial: ReplyDraftStatus;
  /** Inside another section (Free Overview's reviews): no card of its own. */
  embedded?: boolean;
}) {
  const locale = useLocale();
  const [review, setReview] = useState("");
  const [stars, setStars] = useState<number | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(initial.status === "ok" ? initial.left : null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<MessageKey | null>(null);
  const [resetsAt, setResetsAt] = useState<string | null>(initial.status === "ok" ? (initial.resetsAt ?? null) : null);
  const [pausedUntil, setPausedUntil] = useState<string | null>(initial.status === "ok" ? (initial.pausedUntil ?? null) : null);
  const weekly = plan === "free" || plan === "grow";
  const total = replyDraftLimit(plan) ?? FREE_REPLY_DRAFTS;
  const timeZone = useTimeZone();
  const date = (iso: string | null) => (iso ? formatShortDate(iso, locale, timeZone) : "");
  const premium = isPremiumPlan(plan);
  const available = initial.status === "ok";
  const usedUp = !premium && left !== null && left <= 0;
  const reviewsHref = googleReviewsHref(placeId);

  async function draft() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setCopied(false);
    try {
      const result = await draftReviewReply(businessId, review, stars);
      if (result.status === "ok") {
        setReply(result.reply);
        setLeft(result.left);
        if (result.resetsAt) setResetsAt(result.resetsAt);
      } else if (result.status === "limit") {
        setLeft(0);
        if (result.resetsAt) setResetsAt(result.resetsAt);
      } else if (result.status === "paused") setPausedUntil(result.until);
      else setMessage(K(result.status === "invalid" ? "errorInvalid" : result.status === "error" ? "errorRules" : "errorUnavailable"));
    } catch {
      setMessage(K("errorUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="reply-to-a-review"
      data-testid="review-reply-drafter"
      className={cn("flex scroll-mt-20 flex-col gap-3", embedded ? "border-t border-paper-line pt-4" : "rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <IconMessageCircle size={18} aria-hidden className="shrink-0 text-brass" />
          <h3 className="text-base font-semibold text-ink">{t(locale, K("heading"))}</h3>
        </div>
        {available && (
          <span data-testid="replies-left" className="rounded-full border border-paper-deep bg-paper px-2 py-0.5 text-[11.5px] font-semibold text-ink-soft">
            {premium
              ? t(locale, K("unlimited"))
              : weekly && resetsAt
                ? t(locale, K(plan === "grow" ? "leftWeeklyGrow" : "leftWeekly"), { left: left ?? 0, total, date: date(resetsAt) })
                : t(locale, K("left"), { left: left ?? 0, total })}
          </span>
        )}
      </div>
      <p className="text-[13px] leading-snug text-ink-soft">{t(locale, K("intro"))}</p>

      {!available ? (
        <p data-testid="replies-unavailable" className="text-[13px] text-ink-soft">{t(locale, K("errorUnavailable"))}</p>
      ) : weekly && pausedUntil ? (
        <div data-testid="replies-paused" className="flex flex-col gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--color-amber)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_8%,white)] p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] font-medium text-ink">{t(locale, "dashboard.free.ai.paused", { date: date(pausedUntil) })}</p>
          <UpgradeTrigger feature="replies" label={t(locale, K("unlimitedPremium"))} />
        </div>
      ) : usedUp ? (
        <div data-testid="replies-used-up" className="flex flex-col gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--color-brass)_35%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_6%,white)] p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] font-medium text-ink">
            {weekly && resetsAt ? t(locale, K(plan === "grow" ? "usedUpWeeklyGrow" : "usedUpWeekly"), { date: date(resetsAt), total }) : t(locale, K("usedUp"), { total })}
          </p>
          <UpgradeTrigger feature="replies" label={t(locale, K("unlimitedPremium"))} />
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-ink">{t(locale, K("reviewLabel"))}</span>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              maxLength={MAX_REVIEW_CHARS}
              rows={4}
              placeholder={t(locale, K("reviewPlaceholder"))}
              className="w-full resize-y rounded-lg border border-paper-deep bg-white px-3 py-2 text-[14px] text-ink placeholder:text-ink-mute focus:border-brass focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
              {t(locale, K("starsLabel"))}
              <select
                value={stars ?? ""}
                onChange={(e) => setStars(e.target.value ? Number(e.target.value) : null)}
                className="rounded-lg border border-paper-deep bg-white px-2 py-1.5 text-[13px] font-normal text-ink focus:border-brass focus:outline-none"
              >
                <option value="">{t(locale, K("starsNone"))}</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={draft}
              disabled={busy || review.trim().length < 2}
              data-testid="draft-reply"
              className="inline-flex items-center gap-1.5 rounded-lg border border-brass bg-brass px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-[#a5772a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <IconSparkles size={14} aria-hidden />
              {busy ? t(locale, K("drafting")) : t(locale, K("draft"))}
            </button>
            {!premium && <UpgradeTrigger feature="replies" label={t(locale, K("unlimitedPremium"))} />}
          </div>
          {message && (
            <p role="alert" className="text-[13px] text-red">
              {t(locale, message)}
            </p>
          )}
        </div>
      )}

      {reply !== null && (
        <div data-testid="reply-draft" className="flex flex-col gap-2 rounded-xl border border-paper-deep bg-paper p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-ink">{t(locale, K("replyLabel"))}</span>
            <textarea
              value={reply}
              onChange={(e) => {
                setReply(e.target.value);
                setCopied(false);
              }}
              rows={5}
              className="w-full resize-y rounded-lg border border-paper-deep bg-white px-3 py-2 text-[14px] text-ink focus:border-brass focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => setCopied(await copyText(reply))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brass bg-brass px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-[#a5772a]"
            >
              <IconCopy size={14} aria-hidden />
              {copied ? t(locale, K("copied")) : t(locale, K("copy"))}
            </button>
            {reviewsHref && (
              <a href={reviewsHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-soft">
                <IconExternalLink size={14} aria-hidden />
                {t(locale, K("open"))}
              </a>
            )}
          </div>
        </div>
      )}

      <p className="text-[12px] leading-snug text-ink-mute" data-testid="replies-footer">
        {t(locale, K(premium ? "footerPremium" : "footerFree"))} {t(locale, K("privacy"))}
      </p>
    </section>
  );
}
