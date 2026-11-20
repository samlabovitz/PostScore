"use client";

// Day 23E: this week's review replies for Approve all — the newest
// unanswered Google reviews (at most 10), each with PostAI's draft to read
// or edit first (app/actions/approveAll.ts draftWeekReplies). Each reply is
// posted through the inbox's own action (changeGoogleReviewReply: read back
// from Google, logged) only on the owner's click — Approve all or the
// reply's own "Post this reply".

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { draftWeekReplies, type WeekReply } from "@/app/actions/approveAll";
import { changeGoogleReviewReply } from "@/app/actions/googleReviews";
import { t, type MessageKey, useLocale } from "@/lib/i18n";
import { W_BUTTON_SOFT } from "@/components/gbp/PostPreview";

const W = (key: string) => `dashboard.googleTab.w.${key}` as MessageKey;

export type ReplyStatus = "draft" | "sending" | "sent" | "failed";

export interface WeekRepliesState {
  status: "idle" | "loading" | "ok" | "failed";
  items: Array<WeekReply & { text: string; include: boolean; sent: ReplyStatus }>;
  canPost: boolean;
  practice: boolean;
  more: number;
  setText: (reviewId: string, text: string) => void;
  setInclude: (reviewId: string, v: boolean) => void;
  /** The replies Approve all would post now. */
  ready: string[];
  /** Posts one reply (the inbox's own action). */
  post: (reviewId: string) => Promise<boolean>;
  load: () => void;
}

export function useWeekReplies(businessId: string, opts: { auto: boolean }): WeekRepliesState {
  const [status, setStatus] = useState<WeekRepliesState["status"]>("idle");
  const [items, setItems] = useState<WeekRepliesState["items"]>([]);
  const [meta, setMeta] = useState({ canPost: false, practice: false, more: 0 });
  const started = useRef(false);

  const load = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setStatus("loading");
    draftWeekReplies(businessId)
      .then((r) => {
        if (r.status !== "ok") return setStatus("failed");
        setItems(r.items.map((i) => ({ ...i, text: i.reply ?? "", include: !!i.reply, sent: "draft" as const })));
        setMeta({ canPost: r.canPost, practice: r.practice, more: r.more });
        setStatus("ok");
      })
      .catch(() => setStatus("failed"));
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

  return {
    status,
    items,
    ...meta,
    setText: (id, text) => patch(id, { text }),
    setInclude: (id, include) => patch(id, { include }),
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
        <Link href={`/business/${businessId}/website-reviews#google-reviews`} className="w-fit text-[12px] font-semibold text-ink underline underline-offset-2">
          {t(locale, W("replies.more"), { count: state.more })}
        </Link>
      )}
    </div>
  );
}
