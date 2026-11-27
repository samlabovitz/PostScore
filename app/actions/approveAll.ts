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

type Blocked = { status: "blocked"; reason: GbpEditBlock | "not_found" } | { status: "error"; error: string };

export interface WeekReply {
  reviewId: string;
  reviewer: string | null;
  stars: number | null;
  /** The review as Google shows it now — shown, never stored. */
  comment: string | null;
  createTime: string | null;
  /** The saved draft; null: none yet (being written in the background) or PostAI couldn't write one. */
  reply: string | null;
  /** "Include in Approve all" (saved). */
  include?: boolean;
  length?: import("@/lib/reviewReplies").ReplyLength;
  /** PostAI couldn't write one that keeps the rules: the owner writes it. */
  failed?: boolean;
}

export type WeekRepliesResult = { status: "ok"; canPost: boolean; practice: boolean; items: WeekReply[]; more: number; voice: import("@/lib/reviewReplies").ReplyVoice; /** false: supabase/review-reply-batch.sql isn't run yet. */ ready: boolean } | Blocked;


/** The week's replies — READ ONLY: the newest unanswered reviews as Google shows them now, each with its saved
 * draft (lib/replyBatch.server.ts writes them in the background, never here). `missing`: no draft yet. */
export async function draftWeekReplies(businessId: string, opts: { all?: boolean } = {}): Promise<WeekRepliesResult> {
  const [{ getPlan }, { isPremiumPlan }] = await Promise.all([import("@/lib/premium"), import("@/lib/plan")]);
  if (!isPremiumPlan(await getPlan())) return { status: "blocked", reason: "not_premium" };
  const { listGoogleReviews } = await import("@/app/actions/googleReviews");
  const page = await listGoogleReviews(businessId);
  if (page.status !== "ok") return page.status === "blocked" ? { status: "blocked", reason: page.reason } : { status: "error", error: page.error };
  const [{ createClient }, { loadReplyVoice }, { loadSavedReplyDrafts, replyTargets }] = await Promise.all([import("@/lib/supabase/server"), import("@/lib/reviewReplyDraft.server"), import("@/lib/replyBatch.server")]);
  const db = createClient();
  const voice = await loadReplyVoice(db, businessId);
  const saved = await loadSavedReplyDrafts(db, businessId, voice);
  const pendingIds = new Set((page.pending ?? []).map((p: { reviewId: string }) => p.reviewId));
  // `all` (Fix plan's "Approve fixes", Reviews' "Approve all replies" — one set, one count): every unanswered review
  // on Google's first page, newest first. Otherwise the week's newest 10 (today's Growth "Approve all").
  const { list, more } = opts.all
    ? { list: page.reviews.filter((r) => !r.reply && !pendingIds.has(r.reviewId)).sort((a, b) => (b.createTime ?? "").localeCompare(a.createTime ?? "")), more: 0 }
    : replyTargets(page.reviews, pendingIds);
  const byId = new Map((saved.ok ? saved.drafts : []).map((d) => [d.reviewId, d]));
  const items: WeekReply[] = list.map((r) => {
    const d = byId.get(r.reviewId);
    // A draft for an older version of the review (edited since) isn't shown: the next background run writes it again.
    const fits = d && d.reviewUpdated === (r.updateTime ?? null) && d.status === "ready";
    return { reviewId: r.reviewId, reviewer: r.reviewer, stars: r.stars, comment: r.comment, createTime: r.createTime, reply: fits ? d!.reply : null, include: fits ? d!.include : false, length: fits ? d!.length : "medium", failed: d?.status === "failed" };
  });
  return { status: "ok", canPost: page.canPost, practice: page.practice, items, more, voice, ready: saved.ok };
}

export type RedraftReplyResult = { status: "ok"; reply: string } | { status: "error" } | Blocked;

/** One reply again: "Short · Medium · Long" (the same points at that length) or "Different wording".
 * The review is read live again (never stored); the other replies' openings stay off-limits. */
export async function redraftWeekReply(businessId: string, reviewId: unknown, opts: { length?: unknown; mode?: unknown; current?: unknown; others?: unknown }): Promise<RedraftReplyResult> {
  const [{ getPlan }, { isPremiumPlan }] = await Promise.all([import("@/lib/premium"), import("@/lib/plan")]);
  if (!isPremiumPlan(await getPlan())) return { status: "blocked", reason: "not_premium" };
  if (typeof reviewId !== "string") return { status: "error" };
  const { listGoogleReviews } = await import("@/app/actions/googleReviews");
  const page = await listGoogleReviews(businessId);
  if (page.status !== "ok") return page.status === "blocked" ? { status: "blocked", reason: page.reason } : { status: "error", error: page.error };
  const r = page.reviews.find((x) => x.reviewId === reviewId);
  if (!r) return { status: "error" };
  const [{ createClient }, { withOwnerDetailsFor }, rr, { reviewLanguage }, { viewLocale }, { draftReplyText, loadReplyVoice }] = await Promise.all([
    import("@/lib/supabase/server"),
    import("@/lib/ownerDetails.server"),
    import("@/lib/reviewReplies"),
    import("@/lib/gbpReviewInbox"),
    import("@/lib/viewLocale.server"),
    import("@/lib/reviewReplyDraft.server"),
  ]);
  const db = createClient();
  const { data: biz } = await db.from("businesses").select("language").eq("id", businessId).maybeSingle();
  const name = (await withOwnerDetailsFor<{ name?: string | null }>(db, businessId, {}).catch(() => ({ name: null }))).name ?? null;
  const voice = await loadReplyVoice(db, businessId);
  const input = rr.cleanReviewInput(r.comment && r.comment.trim().length >= 2 ? r.comment : "[The reviewer left a star rating with no text.]", r.stars);
  if (!input) return { status: "error" };
  const firstName = rr.replyFirstName(r.reviewer);
  const current = typeof opts.current === "string" && opts.current.trim() ? opts.current.trim().slice(0, rr.MAX_REPLY_CHARS) : null;
  const mode = opts.mode === "different" ? "different" : "length";
  const others = Array.isArray(opts.others) ? opts.others.filter((o): o is string => typeof o === "string").slice(0, 20).map((o) => rr.replyOpening(o, null)) : [];
  const avoid = mode === "different" && current ? [...others, rr.replyOpening(current, firstName)] : others;
  const reply = await draftReplyText(input, reviewLanguage(r.comment) ?? viewLocale((biz as { language?: string | null } | null)?.language ?? null), name, {
    voice,
    firstName,
    length: rr.isReplyLength(opts.length) ? opts.length : "medium",
    avoidOpenings: avoid.filter(Boolean),
    avoidPhrases: current ? rr.sharedPhrases(current, (Array.isArray(opts.others) ? opts.others : []).filter((o): o is string => typeof o === "string").map((text) => ({ text, firstName: null })), firstName).slice(0, 12) : [],
    previous: current ? { text: current, mode } : null,
  }).catch(() => null);
  if (!reply) return { status: "error" };
  // The owner asked for it (a click, not a page load): saved as this review's draft.
  await db.from("review_reply_batch").update({ reply, length: rr.isReplyLength(opts.length) ? opts.length : "medium", status: "ready", include: true, edited: false, voice, rules_version: rr.REPLY_RULES_VERSION, review_updated: r.updateTime ?? null, updated_at: new Date().toISOString() }).eq("business_id", businessId).eq("review_id", r.reviewId);
  return { status: "ok", reply };
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

export type SaveReplyResult = { status: "ok" } | { status: "not_ready" | "invalid" };

/** The owner's own changes to a saved draft: the text ("Write my own" or edits) and "Include in Approve all". RLS: their own rows. */
export async function saveReplyDraft(businessId: string, reviewId: unknown, patch: { text?: unknown; include?: unknown }): Promise<SaveReplyResult> {
  if (typeof reviewId !== "string" || reviewId.length > 300) return { status: "invalid" };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.text === "string") {
    const { MAX_REPLY_CHARS } = await import("@/lib/reviewReplies");
    update.reply = patch.text.slice(0, MAX_REPLY_CHARS);
    update.edited = true;
    update.status = "ready";
  }
  if (typeof patch.include === "boolean") update.include = patch.include;
  const { createClient } = await import("@/lib/supabase/server");
  const db = createClient();
  const { data: own } = await db.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!own) return { status: "invalid" };
  const { createAdminClient } = await import("@/lib/supabase/admin");
  // Upsert (a "Write my own" for a review with no draft yet creates its row), the owner checked above through RLS.
  const { error } = await createAdminClient().from("review_reply_batch").upsert({ business_id: businessId, review_id: reviewId, ...update }, { onConflict: "business_id,review_id" });
  return { status: error ? "not_ready" : "ok" };
}

export type SavedRepliesResult = { status: "ok"; ready: boolean; drafts: Array<{ reviewId: string; reviewUpdated: string | null; reply: string | null; include: boolean; length: import("@/lib/reviewReplies").ReplyLength; failed: boolean }> } | { status: "blocked" };

/** The Reviews inbox: the saved drafts (read only — written in the background). */
export async function getSavedReplies(businessId: string): Promise<SavedRepliesResult> {
  const [{ createClient }, { loadReplyVoice }, { loadSavedReplyDrafts }] = await Promise.all([import("@/lib/supabase/server"), import("@/lib/reviewReplyDraft.server"), import("@/lib/replyBatch.server")]);
  const db = createClient();
  const { data: own } = await db.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!own) return { status: "blocked" };
  const saved = await loadSavedReplyDrafts(db, businessId, await loadReplyVoice(db, businessId));
  if (!saved.ok) return { status: "ok", ready: false, drafts: [] };
  return { status: "ok", ready: true, drafts: saved.drafts.map((d) => ({ reviewId: d.reviewId, reviewUpdated: d.reviewUpdated, reply: d.status === "ready" ? d.reply : null, include: d.include, length: d.length, failed: d.status === "failed" })) };
}
