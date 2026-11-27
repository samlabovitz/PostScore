"use client";

// Day 23E: this week's review replies for Approve all — the newest
// unanswered Google reviews (at most 10), each with PostAI's draft to read
// or edit first (app/actions/approveAll.ts draftWeekReplies). Each reply is
// posted through the inbox's own action (changeGoogleReviewReply: read back
// from Google, logged) only on the owner's click — Approve all or the
// reply's own "Post this reply".

import { reviewsHref } from "@/lib/routes";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { draftWeekReplies, redraftWeekReply, saveReplyDraft, type WeekReply } from "@/app/actions/approveAll";
import { ReplyTweaks, ReplyVoicePicker } from "@/components/reviews/ReplyTweaks";
import type { ReplyLength } from "@/lib/reviewReplies";
import { changeGoogleReviewReply } from "@/app/actions/googleReviews";
import { t, tPlural, type MessageKey, useLocale } from "@/lib/i18n";
import { W_BUTTON_SOFT } from "@/components/gbp/PostPreview";

const W = (key: string) => `dashboard.googleTab.w.${key}` as MessageKey;

export type ReplyStatus = "draft" | "sending" | "sent" | "failed";

export interface WeekRepliesState {
  status: "idle" | "loading" | "ok" | "failed";
  items: Array<WeekReply & { text: string; include: boolean; sent: ReplyStatus; length: ReplyLength; redrafting: boolean }>;
  canPost: boolean;
  practice: boolean;
  more: number;
  /** false: the saved drafts can't be read yet (supabase/review-reply-batch.sql). */
  savedReady?: boolean;
  setText: (reviewId: string, text: string) => void;
  setInclude: (reviewId: string, v: boolean) => void;
  /** The replies Approve all would post now. */
  ready: string[];
  /** Posts one reply (the inbox's own action). */
  post: (reviewId: string) => Promise<boolean>;
  /** "Short · Medium · Long" / "Different wording": that one reply again. */
  redraft: (reviewId: string, opts: { length: ReplyLength; mode: "length" | "different" }) => Promise<void>;
  load: () => void;
  /** After "Replies are written as" changes: the batch is written again. */
  reload: () => void;
}

export function useWeekReplies(businessId: string, opts: { auto: boolean; all?: boolean }): WeekRepliesState {
  const [status, setStatus] = useState<WeekRepliesState["status"]>("idle");
  const [items, setItems] = useState<WeekRepliesState["items"]>([]);
  const [meta, setMeta] = useState({ canPost: false, practice: false, more: 0, savedReady: true });
  const started = useRef(false);

  const load = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setStatus("loading");
    draftWeekReplies(businessId, { all: opts.all === true })
      .then((r) => {
        if (r.status !== "ok") return setStatus("failed");
        setItems(r.items.map((i) => ({ ...i, text: i.reply ?? "", include: !!i.reply && i.include !== false, sent: "draft" as const, length: i.length ?? "medium", redrafting: false })));
        setMeta({ canPost: r.canPost, practice: r.practice, more: r.more, savedReady: r.ready });
        setStatus("ok");
      })
      .catch(() => setStatus("failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `all` is fixed per caller
  }, [businessId]);

  useEffect(() => {
    if (opts.auto) load();
  }, [opts.auto, load]);

  const patch = (reviewId: string, p: Partial<WeekRepliesState["items"][number]>) => setItems((list) => list.map((i) => (i.reviewId === reviewId ? { ...i, ...p } : i)));

  const post = useCallback(
    async (reviewId: string) => {
      const item = items.find((i) => i.reviewId === reviewId);
      if (!item || !item.text.trim()) return false;
      patch(reviewId, { sent: "sending" });
      const r = await changeGoogleReviewReply(businessId, reviewId, "post", item.text.trim()).catch(() => null);
      const ok = !!r && (r.status === "ok" || r.status === "unconfirmed");
      patch(reviewId, { sent: ok ? "sent" : "failed" });
      return ok;
    },
    [businessId, items]
  );

  const redraft = useCallback(
    async (reviewId: string, opts: { length: ReplyLength; mode: "length" | "different" }) => {
      const item = items.find((i) => i.reviewId === reviewId);
      if (!item) return;
      patch(reviewId, { redrafting: true });
      const others = items.filter((i) => i.reviewId !== reviewId && i.text.trim()).map((i) => i.text);
      const r = await redraftWeekReply(businessId, reviewId, { length: opts.length, mode: opts.mode, current: item.text, others }).catch(() => null);
      patch(reviewId, r?.status === "ok" ? { text: r.reply, length: opts.length, redrafting: false, include: true } : { redrafting: false });
    },
    [businessId, items]
  );
  const reload = useCallback(() => {
    started.current = false;
    load();
  }, [load]);

  return {
    status,
    items,
    ...meta,
    redraft,
    reload,
    setText: (id, text) => patch(id, { text }),
    setInclude: (id, include) => {
      patch(id, { include });
      void saveReplyDraft(businessId, id, { include }).catch(() => undefined);
    },
    // A reply Google didn't take isn't sent again by Approve all — its row says so, with "Try again".
    ready: items.filter((i) => i.include && i.text.trim() && i.sent === "draft").map((i) => i.reviewId),
    post,
    load,
  };
}

export function RepliesPreview({ businessId, state }: { businessId: string; state: WeekRepliesState }) {
  const locale = useLocale();
  if (state.status === "idle" || state.status === "loading") return <p className="text-[12.5px] text-ink-mute" data-testid="replies-loading">{t(locale, W("replies.loading"))}</p>;
  if (state.status === "failed") return <p className="text-[12.5px] text-ink-mute" data-testid="replies-failed">{t(locale, W("replies.failed"))}</p>;
  if (state.items.length === 0) return <p className="text-[12.5px] text-ink-soft" data-testid="replies-none">{t(locale, W("replies.none"))}</p>;
  return (
    <div className="flex flex-col gap-2.5" data-testid="replies-preview">
      <ReplyVoicePicker businessId={businessId} onChange={state.reload} />
      <ul className="flex flex-col gap-2.5">
        {state.items.map((i) => (
          <li key={i.reviewId} className="flex flex-col gap-1 rounded-lg bg-paper px-3 py-2" data-testid="reply-item" data-sent={i.sent}>
            <p className="text-[12px] text-ink-soft">
              <b className="text-ink">{i.reviewer ?? t(locale, W("replies.anonymous"))}</b>
              {i.stars ? ` · ${"★".repeat(i.stars)}` : ""}
            </p>
            <p className="line-clamp-3 text-[12.5px] text-ink-soft">{i.comment?.trim() ? i.comment : t(locale, W("replies.noText"))}</p>
            {i.sent === "sent" ? (
              <p className="text-[12.5px] text-ink">
                {i.text} <b className="text-green">{t(locale, W("replies.sent"))}</b>
              </p>
            ) : i.reply === null && !i.text ? (
              <p className="text-[12px] text-ink-mute">{t(locale, W("replies.noDraft"))}</p>
            ) : (
              <>
                <textarea value={i.text} onChange={(e) => state.setText(i.reviewId, e.target.value)} rows={3} disabled={i.sent === "sending"} className="w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-[12.5px] outline-none focus:border-ink" data-testid="reply-text" />
                <ReplyTweaks length={i.length} busy={i.redrafting} disabled={i.sent === "sending"} onRedraft={(o) => state.redraft(i.reviewId, o)} />
                <div className="flex flex-wrap items-center gap-3 text-[12px]">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={i.include} onChange={(e) => state.setInclude(i.reviewId, e.target.checked)} />
                    {t(locale, W("include"))}
                  </label>
                  <button type="button" onClick={() => void state.post(i.reviewId)} disabled={!state.canPost || i.sent === "sending" || !i.text.trim()} className={W_BUTTON_SOFT} data-testid="reply-post">
                    {i.sent === "sending" ? t(locale, W("sending")) : t(locale, W("replies.postOne"))}
                  </button>
                  {i.sent === "failed" && <span className="text-red">{t(locale, W("failed.generic"))}</span>}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {state.more > 0 && (
        <Link href={reviewsHref(businessId, { hash: "google-reviews" })} className="w-fit text-[12px] font-semibold text-ink underline underline-offset-2">
          {t(locale, W("replies.more"), { count: state.more })}
        </Link>
      )}
    </div>
  );
}

/** Growth plan + Google results: the reply task as one line — "{n} replies drafted and ready · Review them →"
 * ("8 of 10 ready" when some are left out) — to Presence → Reviews, the one place replies are read and posted. */
export function RepliesLine({ businessId, state }: { businessId: string; state: WeekRepliesState }) {
  const locale = useLocale();
  const R = (k: string) => `dashboard.replies.line.${k}` as MessageKey;
  const total = state.items.filter((i) => i.sent !== "sent").length;
  const ready = state.ready.length;
  const label =
    // No saved drafts can be read yet (supabase/review-reply-batch.sql): no count — never "being written" when they aren't.
    state.status !== "ok" || state.savedReady === false
      ? null
      : total === 0
        ? null
        : ready === 0
          ? t(locale, R("writing"))
          : ready === total
            ? tPlural(locale, "dashboard.replies.line.ready", ready, { count: ready })
            : t(locale, R("partial"), { ready, total });
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]" data-testid="replies-line" data-ready={ready} data-total={total}>
      {label && <span className="font-medium text-ink">{label}</span>}
      {label && <span className="text-ink-mute">·</span>}
      <Link href={reviewsHref(businessId, { hash: "reply-to-reviews" })} className="font-semibold text-ink underline decoration-brass underline-offset-2" data-testid="replies-review-link">
        {t(locale, R("review"))}
      </Link>
    </span>
  );
}
