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
// Free and Grow: 3 per business, lifetime. Premium and Multi: unlimited.

import { createClient } from "@/lib/supabase/server";
import { callAnthropicMessage, type AnthropicUsage } from "@/lib/anthropicClient";
import { normalizeLocale } from "@/lib/i18n";
import { getPlan } from "@/lib/premium";
import { cleanReply, cleanReviewInput, draftsLeft, replyBreaksRules, replyDraftLimit, replySystemPrompt, replyUserMessage } from "@/lib/reviewReplies";

export type ReplyDraftStatus = { status: "ok"; used: number; left: number | null } | { status: "unavailable" };

export type DraftReplyResult =
  | { status: "ok"; reply: string; left: number | null }
  | { status: "limit" }
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

async function countDrafts(businessId: string): Promise<number | null> {
  try {
    const { count, error } = await (await admin()).from("review_reply_drafts").select("id", { count: "exact", head: true }).eq("business_id", businessId);
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
  const used = await countDrafts(businessId);
  if (used === null) return { status: "unavailable" };
  return { status: "ok", used, left: draftsLeft(await getPlan(), used) };
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
  const limit = replyDraftLimit(plan);
  let db: Awaited<ReturnType<typeof admin>>;
  let rowId: string;
  try {
    db = await admin();
    // 1. Reserve (counts at once).
    const { data: row, error } = await db.from("review_reply_drafts").insert({ business_id: businessId, user_id: user.id, status: "pending", stars: input.stars }).select("id").single();
    if (error || !row) return { status: "unavailable" };
    rowId = row.id as string;
  } catch {
    return { status: "unavailable" };
  }
  const release = async () => {
    await db.from("review_reply_drafts").delete().eq("id", rowId);
  };

  const used = await countDrafts(businessId);
  if (used === null) {
    await release();
    return { status: "unavailable" };
  }
  if (limit !== null && used > limit) {
    await release();
    return { status: "limit" };
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
  return { status: "ok", reply, left: draftsLeft(plan, used) };
}
