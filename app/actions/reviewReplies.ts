"use server";

// AI review reply drafts (option B — the owner pastes the review; nothing
// is fetched from or stored for Google). The count is kept on the server
// in review_reply_drafts (supabase/review-reply-drafts.sql), written only
// with the service role after the owner is checked through RLS:
// 1. reserve: a 'pending' row is added first, then the business's rows are
//    counted — over the limit, the row is removed and the draft refused, so
//    two clicks at once can't both get past it;
// 2. PostAI drafts the reply (lib/reviewReplies.ts rules); a draft that
//    breaks a rule (an incentive, asking to change the review) or a failed
//    call removes the row, so it never uses up a free draft;
// 3. the row becomes 'ok' with the reply and the tokens it used.
// Free: 3 per business per WEEK, on the Free re-scan clock, counted in
// free_ai_usage (lib/freeAiUsage.server.ts, supabase/free-ai-usage.sql)
// before any AI call, plus the FREE_AI_MONTHLY_CAP guard. Grow: 10 per
// business per week on the same clock, counted in review_reply_drafts.
// Premium and Multi: unlimited.

import { createClient } from "@/lib/supabase/server";
import { callAnthropicMessage, type AnthropicUsage } from "@/lib/anthropicClient";
import { normalizeLocale } from "@/lib/i18n";
import { getPlan } from "@/lib/premium";
import { allowanceWindow, FREE_AI_WEEKLY } from "@/lib/freeAiAllowance";
import { confirmFreeAiWithClient, freeAiAllowance, freeAllowanceAnchor, releaseFreeAiWithClient, reserveFreeAi } from "@/lib/freeAiUsage.server";
import { cleanReply, cleanReviewInput, draftsLeft, replyBreaksRules, replyDraftLimit, replySystemPrompt, replyUserMessage } from "@/lib/reviewReplies";

export type ReplyDraftStatus =
  /** `resetsAt`: Free only — when the week's drafts come back. `pausedUntil`:
   * Free only — the month's Free AI budget is used up. */
  | { status: "ok"; used: number; left: number | null; resetsAt?: string; pausedUntil?: string | null }
  | { status: "unavailable" };

export type DraftReplyResult =
  | { status: "ok"; reply: string; left: number | null; resetsAt?: string }
  | { status: "limit"; resetsAt?: string }
  /** Free: the month's Free AI budget is used up until `until`. */
  | { status: "paused"; until: string }
  | { status: "invalid" }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  /** The counter table isn't set up yet, or PostAI couldn't draft one. */
  | { status: "unavailable" }
  | { status: "error" };

async function admin() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  return createAdminClient();
}

async function countDrafts(businessId: string, since: string | null = null): Promise<number | null> {
  try {
    let query = (await admin()).from("review_reply_drafts").select("id", { count: "exact", head: true }).eq("business_id", businessId);
    if (since) query = query.gte("created_at", since);
    const { count, error } = await query;
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

/** Drafts used and left for this business (the page's "2 of 3 free
 * replies left"). "unavailable" until the SQL has been run. */
export async function getReplyDraftStatus(businessId: string): Promise<ReplyDraftStatus> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unavailable" };
  const { data: business } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!business) return { status: "unavailable" };
  if ((await getPlan()) === "free") {
    const allowance = await freeAiAllowance(businessId, "reply_draft");
    if (allowance.status === "unavailable") return { status: "unavailable" };
    return { status: "ok", used: FREE_AI_WEEKLY - allowance.left, left: allowance.left, resetsAt: allowance.resetsAt, pausedUntil: allowance.status === "paused" ? allowance.until : null };
  }
  const plan = await getPlan();
  const week = plan === "grow" ? await growWeek(businessId) : null;
  const used = await countDrafts(businessId, week?.start ?? null);
  if (used === null) return { status: "unavailable" };
  return { status: "ok", used, left: draftsLeft(plan, used), ...(week ? { resetsAt: week.resetsAt } : {}) };
}

/** Grow's week — the same clock as Free (lib/freeAiAllowance.ts). */
async function growWeek(businessId: string): Promise<{ start: string; resetsAt: string } | null> {
  try {
    return allowanceWindow(await freeAllowanceAnchor(await admin(), businessId), new Date());
  } catch {
    return null;
  }
}

export async function draftReviewReply(businessId: string, review: unknown, stars: unknown): Promise<DraftReplyResult> {
  const input = cleanReviewInput(review, stars);
  if (!input) return { status: "invalid" };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  // Ownership, through RLS.
  const { data: business } = await supabase.from("businesses").select("id, name, language").eq("id", businessId).maybeSingle();
  if (!business) return { status: "not_found" };

  const plan = await getPlan();
  // Free: this week's allowance, reserved before any AI call.
  let free: Extract<Awaited<ReturnType<typeof reserveFreeAi>>, { status: "ok" }> | null = null;
  if (plan === "free") {
    const reservation = await reserveFreeAi(businessId, user.id, "reply_draft");
    if (reservation.status === "limit") return { status: "limit", resetsAt: reservation.resetsAt };
    if (reservation.status === "paused") return { status: "paused", until: reservation.until };
    if (reservation.status !== "ok") return { status: "unavailable" };
    free = reservation;
  }
  const releaseFree = async () => {
    if (free?.db) await releaseFreeAiWithClient(free.db, free.id);
  };
  const limit = plan === "free" ? null : replyDraftLimit(plan);
  let db: Awaited<ReturnType<typeof admin>>;
  let rowId: string;
  try {
    db = await admin();
    // 1. Reserve (counts at once).
    const { data: row, error } = await db.from("review_reply_drafts").insert({ business_id: businessId, user_id: user.id, status: "pending", stars: input.stars }).select("id").single();
    if (error || !row) {
      await releaseFree();
      return { status: "unavailable" };
    }
    rowId = row.id as string;
  } catch {
    await releaseFree();
    return { status: "unavailable" };
  }
  const release = async () => {
    await db.from("review_reply_drafts").delete().eq("id", rowId);
    await releaseFree();
  };

  // Grow: this week's drafts (the reserved row counts).
  const week = plan === "grow" ? await growWeek(businessId) : null;
  const used = plan === "free" ? 0 : await countDrafts(businessId, week?.start ?? null);
  if (used === null) {
    await release();
    return { status: "unavailable" };
  }
  if (limit !== null && used > limit) {
    await release();
    return { status: "limit", ...(week ? { resetsAt: week.resetsAt } : {}) };
  }

  // 2. Draft.
  let usage: AnthropicUsage = { inputTokens: null, outputTokens: null };
  let reply: string;
  try {
    reply = cleanReply(
      await callAnthropicMessage({
        system: replySystemPrompt(normalizeLocale(business.language), (business.name as string | null) ?? null),
        userMessage: replyUserMessage(input),
        maxTokens: 300,
        onUsage: (u) => {
          usage = u;
        },
      })
    );
  } catch {
    await release();
    return { status: "unavailable" };
  }
  if (!reply || replyBreaksRules(reply)) {
    await release();
    return { status: "error" };
  }

  // 3. Save the owner's draft.
  await db.from("review_reply_drafts").update({ status: "ok", reply, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens }).eq("id", rowId);
  if (free?.db) {
    await confirmFreeAiWithClient(free.db, free.id);
    return { status: "ok", reply, left: free.left, resetsAt: free.resetsAt };
  }
  return { status: "ok", reply, left: draftsLeft(plan, used), ...(week ? { resetsAt: week.resetsAt } : {}) };
}
