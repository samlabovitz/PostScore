import "server-only";

// Day 25B, "one reply tool": the saved review reply drafts
// (supabase/review-reply-batch.sql). PostAI writes them in the BACKGROUND —
// the daily job (app/api/cron/reply-drafts), right after a scan, and after
// the owner changes "Replies are written as" — never during a page load.
// The Reviews inbox, the Growth plan and Google results only read them.
//
// - composeReplyBatch: the newest unanswered reviews (at most 10) written
//   together in one call (so they don't repeat each other), then each one
//   checked by the reply rules (lib/reviewReplies.ts) against the ones before
//   it; a reply that fails is written again on its own. Star-only reviews get
//   the fixed thanks + an owner line, never PostAI's guess.
// - writeReplyDrafts: reads the reviews live (Business Profile), keeps the
//   drafts that are still current (same review update, rules and voice, or
//   edited by the owner), writes the rest, and removes rows for reviews that
//   now have a reply. Never stores review text.
// - loadSavedReplyDrafts: what the pages read.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxReview } from "@/lib/gbpReviewInbox";
import type { Locale } from "@/lib/i18n";
import type { ReplyLength, ReplyStyle, ReplyVoice } from "@/lib/reviewReplies";
import { MAX_REPLIES } from "@/lib/googleRecommendations";

export interface SavedReplyDraft {
  reviewId: string;
  reviewUpdated: string | null;
  reply: string | null;
  status: "ready" | "failed";
  length: ReplyLength;
  include: boolean;
  edited: boolean;
  /** Written under today's rules and voice (else the next background run writes it again). */
  current: boolean;
}

export type SavedDraftsResult = { ok: true; drafts: SavedReplyDraft[] } | { ok: false; reason: "not_ready" };

/** The saved drafts (RLS: the owner's own rows). "not_ready": supabase/review-reply-batch.sql isn't run yet. */
export async function loadSavedReplyDrafts(db: SupabaseClient, businessId: string, voice: ReplyVoice): Promise<SavedDraftsResult> {
  const { REPLY_RULES_VERSION } = await import("@/lib/reviewReplies");
  const { data, error } = await db.from("review_reply_batch").select("review_id, review_updated, reply, status, length, include, edited, voice, rules_version").eq("business_id", businessId);
  if (error) return { ok: false, reason: "not_ready" };
  return {
    ok: true,
    drafts: ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      reviewId: String(r.review_id),
      reviewUpdated: (r.review_updated as string | null) ?? null,
      reply: (r.reply as string | null) ?? null,
      status: r.status === "failed" ? "failed" : "ready",
      length: (r.length as ReplyLength) ?? "medium",
      include: r.include !== false,
      edited: r.edited === true,
      current: r.edited === true || (r.rules_version === REPLY_RULES_VERSION && r.voice === voice),
    })),
  };
}

/** The newest unanswered reviews the tool drafts for: Google's own list, newest first, at most 10. */
export function replyTargets(reviews: InboxReview[], pendingIds: Set<string>): { list: InboxReview[]; more: number } {
  const unanswered = reviews.filter((r) => !r.reply && !pendingIds.has(r.reviewId)).sort((a, b) => (b.createTime ?? "").localeCompare(a.createTime ?? ""));
  return { list: unanswered.slice(0, MAX_REPLIES), more: Math.max(0, unanswered.length - MAX_REPLIES) };
}

/** Writes the replies for `list` (in order). `keep`: drafts already current, used as-is and as the batch's "already said". */
export async function composeReplyBatch(input: { list: InboxReview[]; keep: Map<string, string>; name: string | null; voice: ReplyVoice; bizLocale: Locale }): Promise<Array<string | null>> {
  const [rr, { reviewLanguage }, { draftReplyText, draftReplyBatch }] = await Promise.all([import("@/lib/reviewReplies"), import("@/lib/gbpReviewInbox"), import("@/lib/reviewReplyDraft.server")]);
  const { list, keep, name, voice, bizLocale } = input;
  const hasWords = (r: InboxReview) => !!(r.comment && r.comment.trim().length >= 2);
  const inputOf = (r: InboxReview) => rr.cleanReviewInput(hasWords(r) ? r.comment : "[The reviewer left a star rating with no text.]", r.stars);
  const write = async (r: InboxReview, style: ReplyStyle): Promise<string | null> => {
    const i = inputOf(r);
    if (!i) return null;
    return draftReplyText(i, reviewLanguage(r.comment) ?? bizLocale, name, { voice, firstName: rr.replyFirstName(r.reviewer), ...style }).catch(() => null);
  };
  // The new ones with words are written together in one call, so the batch reads like one person, not a template.
  const fresh = list.map((r, i) => ({ r, i })).filter(({ r }) => !keep.has(r.reviewId) && inputOf(r) && hasWords(r));
  const together = await draftReplyBatch(
    fresh.map(({ r }) => ({ input: inputOf(r)!, firstName: rr.replyFirstName(r.reviewer), locale: reviewLanguage(r.comment) ?? bizLocale })),
    name,
    voice
  ).catch(() => fresh.map(() => null));
  const candidate = new Map(fresh.map(({ i }, k) => [i, together[k]]));

  // Each reply is checked in order against the ones kept before it: the reply rules, plus no shared opening or
  // 4-word phrase ("means the world" and the like count too). One that fails is written again on its own.
  const out: Array<string | null> = [];
  const kept: Array<{ text: string; firstName: string | null }> = [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const first = rr.replyFirstName(r.reviewer);
    let reply: string | null = keep.get(r.reviewId) ?? null;
    if (reply === null && !hasWords(r)) {
      // Stars only: "Thank you for the 5 stars, Bari!" plus an owner line no other reply uses — never PostAI's guess.
      reply = rr.starOnlyReply(first, r.stars, bizLocale, kept);
    } else if (reply === null) {
      const review = inputOf(r)?.review;
      const ctx = { voice, review, businessName: name, locale: reviewLanguage(r.comment) ?? bizLocale, batch: kept };
      reply = candidate.get(i) ?? null;
      if (reply && !rr.replyAcceptable(reply, first, ctx)) {
        const first0 = reply;
        const retry = (n: number) => write(r, { opening: i + n, avoidOpenings: kept.map((k) => rr.replyOpening(k.text, k.firstName)), avoidPhrases: [...rr.signaturesIn(kept.map((k) => k.text)), ...rr.sharedPhrases(first0, kept, first)].slice(0, 16), batch: kept });
        const again = (await retry(0)) ?? (await retry(5));
        // Nothing better: keep the batch's own reply only if it keeps the hard rules (repeats aside).
        reply = again ?? (rr.replyAcceptable(first0, first, { ...ctx, batch: undefined }) ? first0 : null);
      } else if (!reply) reply = await write(r, { opening: i, batch: kept });
    }
    out.push(reply);
    if (reply) kept.push({ text: reply, firstName: first });
  }
  return out;
}

export type WriteDraftsResult = { status: "ok"; written: number; kept: number; removed: number } | { status: "skipped"; reason: "not_connected" | "reconnect" | "failed" | "not_ready" };

/** The background run for one business (service role). Reads the reviews live, writes what's missing or out of date. */
export async function writeReplyDrafts(admin: SupabaseClient, businessId: string): Promise<WriteDraftsResult> {
  const { data: conn } = await admin.from("gbp_connections").select("status, google_account_id, google_location_id").eq("business_id", businessId).maybeSingle();
  const c = conn as { status?: string; google_account_id?: string | null; google_location_id?: string | null } | null;
  if (c?.status !== "connected" || !c.google_account_id?.startsWith("accounts/") || !c.google_location_id?.startsWith("locations/")) return { status: "skipped", reason: "not_connected" };
  const { getValidAccessTokenWithClient } = await import("@/lib/gbpTokens.server");
  const token = await getValidAccessTokenWithClient(admin, businessId);
  if (token.status !== "ok") return { status: "skipped", reason: token.reason === "reconnect" ? "reconnect" : "failed" };
  const { data: biz } = await admin.from("businesses").select("owner_id, language").eq("id", businessId).maybeSingle();
  const b = biz as { owner_id?: string; language?: string | null } | null;
  const { fetchInboxPage, pendingFromLog } = await import("@/lib/gbpReviewInbox.server");
  const page = await fetchInboxPage({ businessId, userId: b?.owner_id ?? "", accountName: c.google_account_id, locationName: c.google_location_id, accessToken: token.accessToken }, null);
  if (!page.ok) return { status: "skipped", reason: "failed" };
  const pending = new Set((await pendingFromLog(admin, businessId)).map((p: { reviewId: string }) => p.reviewId));
  const { list } = replyTargets(page.reviews, pending);

  // No cookies here (a background run): the business's own language.
  const [{ loadReplyVoice }, { withOwnerDetailsFor }, { normalizeLocale }, rr] = await Promise.all([import("@/lib/reviewReplyDraft.server"), import("@/lib/ownerDetails.server"), import("@/lib/i18n"), import("@/lib/reviewReplies")]);
  const voice = await loadReplyVoice(admin, businessId);
  const saved = await loadSavedReplyDrafts(admin, businessId, voice);
  if (!saved.ok) return { status: "skipped", reason: "not_ready" };
  const byId = new Map(saved.drafts.map((d) => [d.reviewId, d]));
  // Still current: same review update, today's rules and voice — or the owner's own edit (never replaced).
  const keep = new Map<string, string>();
  for (const r of list) {
    const d = byId.get(r.reviewId);
    if (d?.reply && d.status === "ready" && (d.edited || (d.current && d.reviewUpdated === (r.updateTime ?? null)))) keep.set(r.reviewId, d.reply);
  }
  const name = (await withOwnerDetailsFor<{ name?: string | null }>(admin, businessId, {}).catch(() => ({ name: null }))).name ?? null;
  const replies = await composeReplyBatch({ list, keep, name, voice, bizLocale: normalizeLocale(b?.language ?? null) });
  const now = new Date().toISOString();
  const rows = list
    .filter((r) => !keep.has(r.reviewId))
    .map((r) => {
      const reply = replies[list.indexOf(r)];
      return { business_id: businessId, review_id: r.reviewId, review_updated: r.updateTime ?? null, reply, status: reply ? "ready" : "failed", length: "medium", voice, rules_version: rr.REPLY_RULES_VERSION, include: !!reply, edited: false, updated_at: now };
    });
  if (rows.length) {
    const { error } = await admin.from("review_reply_batch").upsert(rows, { onConflict: "business_id,review_id" });
    if (error) return { status: "skipped", reason: "not_ready" };
  }
  // Reviews that now have a reply (or left the newest 10): their drafts go.
  const live = new Set(list.map((r) => r.reviewId));
  const stale = saved.drafts.filter((d) => !live.has(d.reviewId)).map((d) => d.reviewId);
  if (stale.length) await admin.from("review_reply_batch").delete().eq("business_id", businessId).in("review_id", stale);
  return { status: "ok", written: rows.length, kept: keep.size, removed: stale.length };
}

/** Fire and forget, from a user action (a scan, a voice change) — never from a page load. */
export function writeReplyDraftsSoon(businessId: string): void {
  if (process.env.VITEST) return;
  void (async () => {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const r = await writeReplyDrafts(createAdminClient(), businessId);
      console.info(`[reply-drafts] ${businessId.slice(0, 8)}: ${r.status === "ok" ? `${r.written} written, ${r.kept} kept, ${r.removed} removed` : `skipped (${r.reason})`}`);
    } catch (e) {
      console.warn("[reply-drafts] failed", e instanceof Error ? e.message : e);
    }
  })();
}
