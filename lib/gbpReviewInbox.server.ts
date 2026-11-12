// Server-only. Premium "Reply to your Google reviews" — the Google calls
// (My Business API v4), each through gbpFetch (the shared per-process
// rate limit, lib/gbpQuota.ts):
// - one page of the owner's reviews, newest first — shown, never stored;
// - post / edit a reply (reviews.updateReply, a PUT) and delete one,
//   ONLY from the owner's own click (app/actions/googleReviews.ts), then
//   read back from Google to confirm before saying "Posted to Google ✓".
// Every post, edit and delete is logged (gbp_review_reply_log: who, when,
// which review id, the reply's length — never the review or reply text).
// In practice mode (lib/gbpReviewPractice.ts) the same code runs against a
// fake Google, and its log rows say "practice" (the outcome in
// error_reason), so they never mix with real ones.
// Nothing is sent until that log table exists. Posting never touches the
// saved reply counts: only a later scan does (so "Reply to your reviews"
// is marked done only when a scan confirms it).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { markGbpReconnect } from "@/lib/gbpTokens.server";
import { isReviewId, sameReply, toInboxReview, type InboxReview, type RawGbpReview } from "@/lib/gbpReviewInbox";

const BASE = "https://mybusiness.googleapis.com/v4";
export const INBOX_PAGE_SIZE = 50;

export interface InboxTarget {
  businessId: string;
  userId: string;
  /** "accounts/…" */
  accountName: string;
  /** "locations/…" */
  locationName: string;
  accessToken: string;
}

export type GbpCallError = { kind: "auth" | "not_found" | "api"; status: number | null; reason: string | null };

async function callGoogle(fetchImpl: typeof fetch, url: string, accessToken: string, init: RequestInit = {}): Promise<{ ok: true; body: unknown } | ({ ok: false } & GbpCallError)> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  } catch {
    return { ok: false, kind: "api", status: null, reason: "network" };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { status?: string; details?: Array<{ reason?: string }> } } | null;
    // Google's machine-readable reason only — never its message text.
    const reason = body?.error?.details?.find((d) => typeof d.reason === "string")?.reason ?? body?.error?.status ?? null;
    return { ok: false, kind: res.status === 401 ? "auth" : res.status === 404 ? "not_found" : "api", status: res.status, reason };
  }
  return { ok: true, body: await res.json().catch(() => ({})) };
}

const reviewUrl = (t: InboxTarget, reviewId: string) => `${BASE}/${t.accountName}/${t.locationName}/reviews/${reviewId}`;

export type InboxPageResult = { ok: true; reviews: InboxReview[]; nextPageToken: string | null; total: number | null } | ({ ok: false } & GbpCallError);

/** One page of the owner's reviews, newest first. Shown, never stored. */
export async function fetchInboxPage(target: InboxTarget, pageToken: string | null, fetchImpl: typeof fetch = fetch): Promise<InboxPageResult> {
  const counter = { calls: 0 };
  const url = new URL(`${BASE}/${target.accountName}/${target.locationName}/reviews`);
  url.searchParams.set("pageSize", String(INBOX_PAGE_SIZE));
  url.searchParams.set("orderBy", "updateTime desc");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const res = await callGoogle(gbpFetch(counter, fetchImpl), url.toString(), target.accessToken);
  logGbpCalls("review-inbox", counter);
  if (!res.ok) return res;
  const body = res.body as { reviews?: RawGbpReview[]; nextPageToken?: string; totalReviewCount?: number };
  return {
    ok: true,
    reviews: (body.reviews ?? []).map(toInboxReview).filter((r): r is InboxReview => r !== null),
    nextPageToken: body.nextPageToken ?? null,
    total: typeof body.totalReviewCount === "number" ? body.totalReviewCount : null,
  };
}

/** One review as Google shows it now — the waiting page's re-check. */
export async function fetchReview(target: InboxTarget, reviewId: string, fetchImpl: typeof fetch = fetch) {
  if (!isReviewId(reviewId)) return { ok: false as const, kind: "not_found" as const, status: null, reason: "bad_review_id" };
  const counter = { calls: 0 };
  const res = await readReview(target, reviewId, gbpFetch(counter, fetchImpl));
  logGbpCalls("review-recheck", counter);
  return res;
}

/** Replies Google accepted but wasn't showing yet: each review's latest
 * log row in the last day, when it's "unconfirmed" (practice: its outcome
 * in error_reason). Survives a refresh on any browser. */
export async function pendingFromLog(admin: SupabaseClient, businessId: string, now: number = Date.now()) {
  const { data, error } = await admin
    .from("gbp_review_reply_log")
    .select("review_id, action, status, error_reason, reply_length, created_at")
    .eq("business_id", businessId)
    .gte("created_at", new Date(now - 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  const latest = new Map<string, { review_id: string; action: ReplyAction; status: string; error_reason: string | null; reply_length: number | null; created_at: string }>();
  for (const row of data as Array<{ review_id: string; action: ReplyAction; status: string; error_reason: string | null; reply_length: number | null; created_at: string }>) {
    if (!latest.has(row.review_id)) latest.set(row.review_id, row);
  }
  return Array.from(latest.values())
    .filter((r) => r.status === "unconfirmed" || (r.status === "practice" && (r.error_reason ?? "").startsWith("unconfirmed")))
    .map((r) => ({ reviewId: r.review_id, action: r.action, since: r.created_at, replyLength: r.reply_length, hash: null }));
}

async function readReview(target: InboxTarget, reviewId: string, fetchImpl: typeof fetch): Promise<{ ok: true; review: InboxReview } | ({ ok: false } & GbpCallError)> {
  const res = await callGoogle(fetchImpl, reviewUrl(target, reviewId), target.accessToken);
  if (!res.ok) return res;
  const review = toInboxReview(res.body as RawGbpReview);
  return review ? { ok: true, review } : { ok: false, kind: "not_found", status: null, reason: "unreadable" };
}

export type ReplyAction = "post" | "edit" | "delete";

export type ReplyChangeResult =
  /** Google confirmed it on read-back. */
  | { status: "ok"; review: InboxReview }
  /** Google accepted it, but the read-back didn't show it yet. */
  | { status: "unconfirmed" }
  /** "post" on a review that already has a reply — use Edit (never overwritten unseen). */
  | { status: "already_replied"; review: InboxReview }
  /** "edit" / "delete" on a review with no reply. */
  | { status: "no_reply"; review: InboxReview }
  /** The log table isn't there yet (supabase/gbp-review-reply-log.sql) — nothing sent. */
  | { status: "not_set_up" }
  | { status: "error"; error: "reconnect" | "not_found" | "failed"; reason: string | null };

export async function logReplyChange(
  admin: SupabaseClient,
  row: { businessId: string; userId: string; action: ReplyAction; reviewId: string; replyLength: number | null; status: "ok" | "unconfirmed" | "failed" | "practice"; errorReason?: string | null }
): Promise<void> {
  const { error } = await admin.from("gbp_review_reply_log").insert({
    business_id: row.businessId,
    user_id: row.userId,
    action: row.action,
    review_id: row.reviewId,
    reply_length: row.replyLength,
    status: row.status,
    error_reason: row.errorReason ? row.errorReason.slice(0, 120) : null,
  });
  if (error) console.error(`[review-replies] log failed for ${row.businessId}: ${error.code ?? "unknown"}`);
}

/**
 * Posts, edits or deletes the owner's reply on one review — called only
 * from the owner's own click. Reads the review first (a "post" never
 * overwrites a reply the owner hasn't seen), sends the one change, then
 * reads it back from Google. A failed send changes nothing on Google.
 */
export async function changeReplyWithClient(
  admin: SupabaseClient,
  target: InboxTarget,
  change: { action: ReplyAction; reviewId: string; text: string | null },
  fetchImpl: typeof fetch = fetch,
  options: { practice?: boolean } = {}
): Promise<ReplyChangeResult> {
  if (!isReviewId(change.reviewId)) return { status: "error", error: "not_found", reason: "bad_review_id" };
  if (change.action !== "delete" && !change.text) return { status: "error", error: "failed", reason: "empty_reply" };

  // Every change is logged, so nothing is sent before the log exists.
  const { error: logMissing } = await admin.from("gbp_review_reply_log").select("id", { head: true, count: "exact" }).eq("business_id", target.businessId).limit(1);
  if (logMissing) return { status: "not_set_up" };

  const counter = { calls: 0 };
  const limited = gbpFetch(counter, fetchImpl);
  const replyLength = change.action === "delete" ? null : change.text!.length;
  // Practice: status "practice", the outcome kept in error_reason ("ok", "failed:INVALID_ARGUMENT").
  const log = (status: "ok" | "unconfirmed" | "failed", errorReason: string | null = null) =>
    logReplyChange(admin, {
      businessId: target.businessId,
      userId: target.userId,
      action: change.action,
      reviewId: change.reviewId,
      replyLength,
      ...(options.practice ? { status: "practice" as const, errorReason: errorReason ? `${status}:${errorReason}` : status } : { status, errorReason }),
    });
  const fail = async (e: GbpCallError): Promise<ReplyChangeResult> => {
    logGbpCalls("review-reply", counter);
    await log("failed", e.reason ?? e.kind);
    // Practice mode's fake Google never touches the real connection.
    if (e.kind === "auth" && !options.practice) {
      const checked = await markGbpReconnect(admin, target.businessId);
      // Google took the refresh: still connected, this one call just failed.
      if (checked.status === "error" && checked.reason === "reconnect") return { status: "error", error: "reconnect", reason: e.reason };
    }
    return { status: "error", error: e.kind === "not_found" ? "not_found" : "failed", reason: e.reason };
  };

  // 1. The review as it is now.
  const before = await readReview(target, change.reviewId, limited);
  if (!before.ok) return fail(before);
  if (change.action === "post" && before.review.reply) {
    logGbpCalls("review-reply", counter);
    return { status: "already_replied", review: before.review };
  }
  if (change.action !== "post" && !before.review.reply) {
    logGbpCalls("review-reply", counter);
    return { status: "no_reply", review: before.review };
  }

  // 2. The one change.
  const sent =
    change.action === "delete"
      ? await callGoogle(limited, `${reviewUrl(target, change.reviewId)}/reply`, target.accessToken, { method: "DELETE" })
      : await callGoogle(limited, `${reviewUrl(target, change.reviewId)}/reply`, target.accessToken, { method: "PUT", body: JSON.stringify({ comment: change.text }) });
  // A network error may or may not have reached Google — the read-back says which.
  if (!sent.ok && sent.reason !== "network") return fail(sent);

  // 3. Read it back.
  const after = await readReview(target, change.reviewId, limited);
  logGbpCalls("review-reply", counter);
  if (!after.ok) {
    if (!sent.ok) return fail(sent);
    await log("unconfirmed", after.reason ?? after.kind);
    return { status: "unconfirmed" };
  }
  const confirmed = change.action === "delete" ? !after.review.reply : sameReply(after.review.reply?.comment, change.text);
  if (confirmed) {
    await log("ok");
    return { status: "ok", review: after.review };
  }
  if (!sent.ok) return fail(sent);
  await log("unconfirmed", "read_back_differs");
  return { status: "unconfirmed" };
}
