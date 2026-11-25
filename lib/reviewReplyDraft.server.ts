import "server-only";

// Day 25B step 6, item 9: one review reply draft under the reply rules
// (lib/reviewReplies.ts): the reviewer's first name, the owner's voice, the
// length, a varied opening, no stock phrases, the voice and language kept. A
// draft that misses a rule is written again (3 tries at most); one that breaks a hard rule (an incentive, asking to
// change the review) is never shown.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n";
import { isReplyVoice, namedInReview, replyAcceptable, replyBreaksRules, replyHasStockPhrase, cleanReply, replySystemPrompt, replyUserMessage, type ReplyStyle, type ReplyVoice, type ReviewInput } from "@/lib/reviewReplies";
import type { AnthropicUsage } from "@/lib/anthropicClient";

/** The owner's "Replies are written as" choice; "me" until they choose (or before supabase/reply-voice.sql). */
export async function loadReplyVoice(db: SupabaseClient, businessId: string): Promise<ReplyVoice> {
  try {
    const { data, error } = await db.from("businesses").select("reply_voice").eq("id", businessId).maybeSingle();
    const v = (data as { reply_voice?: unknown } | null)?.reply_voice;
    return !error && isReplyVoice(v) ? v : "me";
  } catch {
    return "me";
  }
}

export async function draftReplyText(input: ReviewInput, locale: Locale, businessName: string | null, style: ReplyStyle, onUsage?: (u: AnthropicUsage) => void): Promise<string | null> {
  const { isStarOnlyReview, starOnlyReply } = await import("@/lib/reviewReplies");
  // Stars only: the fixed thanks + owner line (no PostAI, so nothing they didn't write); "Different wording" picks another line.
  if (isStarOnlyReview(input.review)) return starOnlyReply(style.firstName ?? null, input.stars, locale, [...(style.batch ?? []), ...(style.previous ? [{ text: style.previous.text, firstName: style.firstName ?? null }] : [])]);
  const { callAnthropicMessage } = await import("@/lib/anthropicClient");
  let fallback: string | null = null;
  style = { ...style, named: namedInReview(input.review, style.firstName ?? null, businessName) };
  for (let attempt = 0; attempt < 3; attempt++) {
    let reply: string;
    try {
      reply = cleanReply(
        await callAnthropicMessage({
          system: replySystemPrompt(locale, businessName, style),
          userMessage: replyUserMessage(input, style.previous?.text ?? null),
          maxTokens: 400,
          onUsage,
        })
      );
    } catch (e) {
      // One busy or rate-limited answer (ten drafts run at once) doesn't end the draft: try again.
      if (attempt === 2 && fallback === null) throw e;
      continue;
    }
    if (replyAcceptable(reply, style.firstName ?? null, { voice: style.voice ?? "me", review: input.review, businessName, locale, avoid: style.avoidPhrases, batch: style.batch })) return reply;
    // Only the name's place was off: usable if no later try is better (never one that misses the voice or language).
    if (reply && !replyBreaksRules(reply) && !replyHasStockPhrase(reply) && replyAcceptable(reply, null, { voice: style.voice ?? "me", review: input.review, businessName, locale, avoid: style.avoidPhrases })) fallback ??= reply;
  }
  return fallback;
}

/** The week's replies in one call (they're written together, so they don't repeat each other); null per reply
 * when the answer couldn't be read. Each one is still checked by the caller. */
export async function draftReplyBatch(items: Array<{ input: ReviewInput; firstName: string | null; locale: Locale }>, businessName: string | null, voice: ReplyVoice): Promise<Array<string | null>> {
  if (items.length === 0) return [];
  const { callAnthropicMessage } = await import("@/lib/anthropicClient");
  const { replyBatchSystemPrompt, replyBatchUserMessage, parseReplyBatch } = await import("@/lib/reviewReplies");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callAnthropicMessage({ system: replyBatchSystemPrompt(businessName, voice), userMessage: replyBatchUserMessage(items), maxTokens: 2500 });
      const parsed = parseReplyBatch(raw, items.length);
      if (parsed) return parsed;
    } catch {
      // try once more
    }
  }
  return items.map(() => null);
}
