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
import { isPremiumPlan, type Plan } from "@/lib/plan";
import { GROW_REPLY_DRAFTS } from "@/lib/reviewReplies";

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

/** Off until checkout exists (CLAUDE.md "Before launch"): production drafts for every connected business as
 * Premium (pilots get Premium free for 30 days); locally the dev plan picks. Turn on when real plans exist, so
 * drafting follows each account's plan (draftTargets). */
export const PLAN_BASED_DRAFTING = false;

/** The plan the background drafts are written for. */
export function draftingPlan(plan: Plan, env: { NODE_ENV?: string } = process.env): Plan {
  return PLAN_BASED_DRAFTING || env.NODE_ENV === "development" ? plan : "premium";
}

/** At most this many review pages (50 each) read per run: a Premium catch-up of up to 500 unanswered reviews. */
const MAX_PAGES = 10;
/** New reviews per PostAI batch call. */
const CHUNK = 10;
/** No two replies within any 10 in a row (what the page shows together, and what Approve all sends) share an
 * opening or a 4-word phrase. Checked against the 9 kept before each one. */
const WINDOW = 10;

/**
 * Which unanswered reviews the background run drafts, newest first. Premium: every one (after the first catch-up,
 * only new ones are written; the rest are kept). Grow: the ones already drafted, plus new ones up to what's left
 * of this week's allowance (`growLeft`); the rest show "Draft a reply". Free: none (its own 3 a week, by hand).
 * Approve all and the Growth plan still use replyTargets, the newest 10 (this week's goal).
 */
export function draftTargets(reviews: InboxReview[], pendingIds: Set<string>, plan: Plan, current: Set<string>, growLeft: number): InboxReview[] {
  if (plan === "free") return [];
  const unanswered = reviews.filter((r) => !r.reply && !pendingIds.has(r.reviewId)).sort((a, b) => (b.createTime ?? "").localeCompare(a.createTime ?? ""));
  if (isPremiumPlan(plan)) return unanswered;
  // At most a week's allowance shows pre-drafted (the newest); older drafts (from Premium, say) give way.
  let left = Math.max(0, growLeft);
  const out: InboxReview[] = [];
  for (const r of unanswered) {
    if (out.length >= GROW_REPLY_DRAFTS) break;
    if (current.has(r.reviewId)) out.push(r);
    else if (left > 0) {
      left--;
      out.push(r);
    }
  }
  return out;
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
  const together: Array<string | null> = [];
  for (let k = 0; k < fresh.length; k += CHUNK) {
    const part = fresh.slice(k, k + CHUNK);
    together.push(
      ...(await draftReplyBatch(
        part.map(({ r }) => ({ input: inputOf(r)!, firstName: rr.replyFirstName(r.reviewer), locale: reviewLanguage(r.comment) ?? bizLocale })),
        name,
        voice
      ).catch(() => part.map(() => null)))
    );
  }
  const candidate = new Map(fresh.map(({ i }, k) => [i, together[k]]));

  // Each new reply is checked against its neighbours: the reply rules, plus no shared opening or 4-word phrase
  // ("honored" and the like count too) with any reply up to 9 places before it, or a kept one up to 9 after it
  // (a top-up run writes between drafts it keeps). One that fails is written again on its own.
  const out: Array<string | null> = [];
  const firstOf = (r: InboxReview) => rr.replyFirstName(r.reviewer);
  const near = (i: number) => [
    ...out.slice(Math.max(0, i - (WINDOW - 1)), i).flatMap((text, k) => (text ? [{ text, firstName: firstOf(list[Math.max(0, i - (WINDOW - 1)) + k]) }] : [])),
    ...list.slice(i + 1, i + WINDOW).flatMap((r) => (keep.has(r.reviewId) ? [{ text: keep.get(r.reviewId)!, firstName: firstOf(r) }] : [])),
  ];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const first = rr.replyFirstName(r.reviewer);
    let reply: string | null = keep.get(r.reviewId) ?? null;
    if (reply === null && !hasWords(r)) {
      // Stars only: "Thank you for the 5 stars, Bari!" plus an owner line no other reply uses — never PostAI's guess.
      reply = rr.starOnlyReply(first, r.stars, bizLocale, near(i));
    } else if (reply === null) {
      const review = inputOf(r)?.review;
      const ctx = { voice, review, businessName: name, locale: reviewLanguage(r.comment) ?? bizLocale, batch: near(i) };
      reply = candidate.get(i) ?? null;
      if (reply && !rr.replyAcceptable(reply, first, ctx)) {
        const first0 = reply;
        const around = near(i);
        // The first retry fixes the batch's reply, told exactly what was wrong; the later ones start fresh.
        const problem = rr.replyRejection(first0, first, ctx) ?? "";
        const retry = (n: number) => write(r, { opening: i + n, avoidOpenings: around.map((k) => rr.replyOpening(k.text, k.firstName)), avoidPhrases: [...rr.signaturesIn(around.map((k) => k.text)), ...rr.sharedPhrases(first0, around, first)].slice(0, 16), batch: around, previous: n === 0 ? { text: first0, mode: "fix", problem } : null, attempts: 8 });
        // Written again on its own, up to three times; none that passes every check: no draft (the owner sees
        // "Draft a reply"), never one that breaks a rule or repeats another reply.
        reply = (await retry(0)) ?? (await retry(3)) ?? (await retry(6));
      } else if (!reply) reply = await write(r, { opening: i, batch: near(i), attempts: 8 });
    }
    out.push(reply);
  }
  return out;
}

export type WriteDraftsResult = { status: "ok"; written: number; kept: number; removed: number } | { status: "skipped"; reason: "not_connected" | "reconnect" | "failed" | "not_ready" };

/** Grow's drafts used this week: the same counter and clock as drafting by hand (app/actions/reviewReplies.ts). */
async function growDraftsLeft(admin: SupabaseClient, businessId: string): Promise<number> {
  const [{ allowanceWindow }, { freeAllowanceAnchor }, { GROW_REPLY_DRAFTS }] = await Promise.all([import("@/lib/freeAiAllowance"), import("@/lib/freeAiUsage.server"), import("@/lib/reviewReplies")]);
  const week = allowanceWindow(await freeAllowanceAnchor(admin, businessId), new Date());
  const { count, error } = await admin.from("review_reply_drafts").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", week.start);
  return error ? 0 : Math.max(0, GROW_REPLY_DRAFTS - (count ?? 0));
}

/** The background run for one business (service role). Reads the reviews live, writes what's missing or out of
 * date. `plan`: the account's plan (draftTargets). */
export async function writeReplyDrafts(admin: SupabaseClient, businessId: string, plan: Plan): Promise<WriteDraftsResult> {
  if (plan === "free") return { status: "ok", written: 0, kept: 0, removed: 0 };
  const { data: conn } = await admin.from("gbp_connections").select("status, google_account_id, google_location_id").eq("business_id", businessId).maybeSingle();
  const c = conn as { status?: string; google_account_id?: string | null; google_location_id?: string | null } | null;
  if (c?.status !== "connected" || !c.google_account_id?.startsWith("accounts/") || !c.google_location_id?.startsWith("locations/")) return { status: "skipped", reason: "not_connected" };
  const { getValidAccessTokenWithClient } = await import("@/lib/gbpTokens.server");
  const token = await getValidAccessTokenWithClient(admin, businessId);
  if (token.status !== "ok") return { status: "skipped", reason: token.reason === "reconnect" ? "reconnect" : "failed" };
  const { data: biz } = await admin.from("businesses").select("owner_id, language").eq("id", businessId).maybeSingle();
  const b = biz as { owner_id?: string; language?: string | null } | null;
  const { fetchInboxPage, pendingFromLog, sentFromLog } = await import("@/lib/gbpReviewInbox.server");
  const target = { businessId, userId: b?.owner_id ?? "", accountName: c.google_account_id, locationName: c.google_location_id, accessToken: token.accessToken };
  // Premium reads every page (up to MAX_PAGES); Grow's allowance fits in the first.
  const reviews: InboxReview[] = [];
  let pageToken: string | null = null;
  for (let n = 0; n < (isPremiumPlan(plan) ? MAX_PAGES : 1); n++) {
    const page = await fetchInboxPage(target, pageToken);
    if (!page.ok) {
      if (n === 0) return { status: "skipped", reason: "failed" };
      break;
    }
    reviews.push(...page.reviews);
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }
  // Waiting on Google, or already replied by PostScore (Google slow to show it): never drafted again.
  const pending = new Set([...(await pendingFromLog(admin, businessId)).map((p: { reviewId: string }) => p.reviewId), ...Array.from((await sentFromLog(admin, businessId).catch(() => new Map())).keys())]);

  // No cookies here (a background run): the business's own language.
  const [{ loadReplyVoice }, { withOwnerDetailsFor }, { normalizeLocale }, rr] = await Promise.all([import("@/lib/reviewReplyDraft.server"), import("@/lib/ownerDetails.server"), import("@/lib/i18n"), import("@/lib/reviewReplies")]);
  const voice = await loadReplyVoice(admin, businessId);
  const saved = await loadSavedReplyDrafts(admin, businessId, voice);
  if (!saved.ok) return { status: "skipped", reason: "not_ready" };
  const byId = new Map(saved.drafts.map((d) => [d.reviewId, d]));
  // Still current: same review update, today's rules and voice — or the owner's own edit (never replaced).
  const keep = new Map<string, string>();
  for (const r of reviews) {
    const d = byId.get(r.reviewId);
    if (d?.reply && d.status === "ready" && (d.edited || (d.current && d.reviewUpdated === (r.updateTime ?? null)))) keep.set(r.reviewId, d.reply);
  }
  // Grow: a draft that's merely out of date (new rules, an edited review) is rewritten inside the allowance too.
  const drafted = new Set(Array.from(byId.keys()));
  const list = draftTargets(reviews, pending, plan, plan === "grow" ? drafted : new Set(), plan === "grow" ? await growDraftsLeft(admin, businessId) : 0);
  for (const id of Array.from(keep.keys())) if (!list.some((r) => r.reviewId === id)) keep.delete(id);
  // A kept draft that now repeats a kept neighbour (up to 9 places before it) is written again; the owner's own
  // edits always stay.
  list.forEach((r, i) => {
    const text = keep.get(r.reviewId);
    if (!text || byId.get(r.reviewId)?.edited) return;
    const before = list.slice(Math.max(0, i - (WINDOW - 1)), i).flatMap((x) => (keep.has(x.reviewId) ? [{ text: keep.get(x.reviewId)!, firstName: rr.replyFirstName(x.reviewer) }] : []));
    const first = rr.replyFirstName(r.reviewer);
    if (rr.sharedPhrases(text, before, first).length || before.some((b) => rr.replyOpening(b.text, b.firstName) === rr.replyOpening(text, first))) keep.delete(r.reviewId);
  });
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
  // Grow: each new pre-draft uses one of the week's drafts, the same as "Draft a reply" by hand.
  const newGrow = plan === "grow" ? rows.filter((r) => r.reply && !byId.has(r.review_id)) : [];
  if (newGrow.length) await admin.from("review_reply_drafts").insert(newGrow.map((r) => ({ business_id: businessId, user_id: b?.owner_id ?? null, status: "ok", stars: list.find((x) => x.reviewId === r.review_id)?.stars ?? null, reply: r.reply })));
  // Reviews that now have a reply (or are no longer drafted for this plan): their drafts go.
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
      // Read inside the owner's request: the plan they're on now.
      const plan = draftingPlan(await (await import("@/lib/premium")).getPlan());
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      // This week's post and the answers' description too (lib/postDrafts.server.ts), saved for the pages.
      await (await import("@/lib/postDrafts.server")).writeWeekDrafts(admin, businessId, plan).catch(() => null);
      const r = await writeReplyDrafts(admin, businessId, plan);
      console.info(`[reply-drafts] ${businessId.slice(0, 8)}: ${r.status === "ok" ? `${r.written} written, ${r.kept} kept, ${r.removed} removed` : `skipped (${r.reason})`}`);
    } catch (e) {
      console.warn("[reply-drafts] failed", e instanceof Error ? e.message : e);
    }
  })();
}
