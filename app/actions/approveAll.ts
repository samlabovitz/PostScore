"use server";

// Day 23E: "Approve all" on the Google Profile tab's This week (Premium).
// - draftWeekReplies: the newest unanswered Google reviews (at most 10),
//   each with a PostAI reply draft for the owner to read or edit first.
//   Reviews are read live and never stored; only the drafts are kept in
//   memory (24 hours, by review), so reopening the tab doesn't redraft.
//   Nothing is posted here — replies go out one by one through the
//   inbox's own action (changeGoogleReviewReply) on the owner's click.
// - approveListingAll: the listing items the owner approved in the same
//   click (this week's post, the answers) in ONE sitting (one approval,
//   lib/approveAll.server.ts). Off GOOGLE_WRITES_LIVE_PLACES (and not
//   practice mode): refused, nothing sent.

import { revalidatePath } from "next/cache";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";
import type { AnswersPayload, AnswersResult } from "@/lib/googleAnswers.server";
import type { PublishResult } from "@/lib/gbpPostsPublish.server";
import { MAX_REPLIES } from "@/lib/googleRecommendations";

type Blocked = { status: "blocked"; reason: GbpEditBlock | "not_found" } | { status: "error"; error: string };

export interface WeekReply {
  reviewId: string;
  reviewer: string | null;
  stars: number | null;
  /** The review as Google shows it now — shown, never stored. */
  comment: string | null;
  createTime: string | null;
  /** PostAI's draft; null: it couldn't write one (the owner writes it in the inbox). */
  reply: string | null;
}

export type WeekRepliesResult = { status: "ok"; canPost: boolean; practice: boolean; items: WeekReply[]; more: number } | Blocked;

const DAY_MS = 86_400_000;
const g = globalThis as unknown as { __weekReplyDrafts?: Map<string, { at: number; reply: string }> };
const drafts = (g.__weekReplyDrafts ??= new Map());

export async function draftWeekReplies(businessId: string): Promise<WeekRepliesResult> {
  const [{ getPlan }, { isPremiumPlan }] = await Promise.all([import("@/lib/premium"), import("@/lib/plan")]);
  if (!isPremiumPlan(await getPlan())) return { status: "blocked", reason: "not_premium" };
  const { listGoogleReviews } = await import("@/app/actions/googleReviews");
  const page = await listGoogleReviews(businessId);
  if (page.status !== "ok") return page.status === "blocked" ? { status: "blocked", reason: page.reason } : { status: "error", error: page.error };
  const pending = new Set((page.pending ?? []).map((p: { reviewId: string }) => p.reviewId));
  const unanswered = page.reviews.filter((r) => !r.reply && !pending.has(r.reviewId)).sort((a, b) => (b.createTime ?? "").localeCompare(a.createTime ?? ""));
  const list = unanswered.slice(0, MAX_REPLIES);

  const [{ createClient }, { withOwnerDetailsFor }, rr, { reviewLanguage }, { normalizeLocale }, { callAnthropicMessage }] = await Promise.all([
    import("@/lib/supabase/server"),
    import("@/lib/ownerDetails.server"),
    import("@/lib/reviewReplies"),
    import("@/lib/gbpReviewInbox"),
    import("@/lib/i18n"),
    import("@/lib/anthropicClient"),
  ]);
  const db = createClient();
  const { data: biz } = await db.from("businesses").select("language").eq("id", businessId).maybeSingle();
  const name = (await withOwnerDetailsFor<{ name?: string | null }>(db, businessId, {}).catch(() => ({ name: null }))).name ?? null;
  const now = Date.now();
  drafts.forEach((v, k) => {
    if (now - v.at > DAY_MS) drafts.delete(k);
  });

  const items = await Promise.all(
    list.map(async (r): Promise<WeekReply> => {
      const key = `${businessId}|${r.reviewId}|${r.updateTime ?? ""}`;
      const hit = drafts.get(key);
      const base = { reviewId: r.reviewId, reviewer: r.reviewer, stars: r.stars, comment: r.comment, createTime: r.createTime };
      if (hit) return { ...base, reply: hit.reply };
      // A star rating with no words still gets a short thank-you.
      const input = rr.cleanReviewInput(r.comment && r.comment.trim().length >= 2 ? r.comment : "[The reviewer left a star rating with no text.]", r.stars);
      if (!input) return { ...base, reply: null };
      try {
        const reply = rr.cleanReply(
          await callAnthropicMessage({ system: rr.replySystemPrompt(reviewLanguage(r.comment) ?? normalizeLocale((biz as { language?: string | null } | null)?.language ?? null), name), userMessage: rr.replyUserMessage(input), maxTokens: 300 })
        );
        if (!reply || rr.replyBreaksRules(reply)) return { ...base, reply: null };
        drafts.set(key, { at: now, reply });
        return { ...base, reply };
      } catch {
        return { ...base, reply: null };
      }
    })
  );
  return { status: "ok", canPost: page.canPost, practice: page.practice, items, more: Math.max(0, unanswered.length - list.length) };
}

export type ApproveListingResult =
  | { status: "ok"; post?: PublishResult; answers?: AnswersResult }
  | { status: "editing_off" }
  | { status: "wait"; error: "wait_minute" | "daily_cap" }
  | Blocked;

/** Approve all's listing part: this week's post and the answers, one sitting. */
export async function approveListingAll(
  businessId: string,
  payload: { post?: { text: unknown; cta: unknown; photoName: unknown; timeZone: unknown; promoId?: unknown; keep?: unknown } | null; answers?: AnswersPayload | null },
  practiceOutcome: unknown = null
): Promise<ApproveListingResult> {
  if (!payload || (!payload.post && !payload.answers)) return { status: "ok" };
  const { postContext } = await import("@/lib/gbpPostsContext.server");
  const c = await postContext(businessId);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  const { startSitting } = await import("@/lib/approveAll.server");
  const start = await startSitting(c.admin, businessId);
  if (start.status === "wait") return start;
  if (start.status !== "ok") return { status: "error", error: "not_enabled" };
  if (c.practice) {
    const practice = await import("@/lib/gbpProfilePractice.server");
    practice.setPracticeOutcome(businessId, practice.isPracticeOutcome(practiceOutcome) ? practiceOutcome : "accept");
  }
  const out: Extract<ApproveListingResult, { status: "ok" }> = { status: "ok" };
  if (payload.post) {
    const { cleanPostText } = await import("@/lib/gbpPosts");
    const text = cleanPostText(payload.post.text);
    const { publishWith } = await import("@/lib/gbpPostsPublish.server");
    out.post = text ? await publishWith(c, { text, cta: payload.post.cta, photoName: payload.post.photoName, kind: "week", timeZone: payload.post.timeZone, promoId: payload.post.promoId, keep: payload.post.keep }, practiceOutcome, "approve_all", start.at) : { status: "invalid", problems: ["empty"] };
  }
  if (payload.answers) {
    const { applyAnswersWith } = await import("@/lib/googleAnswers.server");
    out.answers = await applyAnswersWith(c, payload.answers, start.at, "answers");
  }
  if (!c.practice) revalidatePath(`/business/${businessId}`, "layout");
  return out;
}
