// Server-only. Reads the owner's own Google reviews (My Business API v4)
// and stores ONLY the reply counts (lib/gbpReviewReplies.ts) on their
// gbp_connections row — never review text, reply text, reviewer names,
// star ratings or exact dates (supabase/gbp-reply-counts.sql,
// supabase/gbp-reply-alltime.sql).
//
// Runs once right after a successful connect, and at most once per normal
// scan (rescanBusinessWithClient: owner re-scan, the monthly job,
// rescan-all) — never on page load. Not scored yet; v1.12.0 scores the
// recent window only, never the all-time counts.
//
// The counts belong to the business that connected: never read for
// competitors or any other business. Disconnect deletes the row, and the
// counts with it.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeReplyCounts, MAX_ALL_TIME_REVIEWS, type GbpReplyCounts, type GbpReview } from "@/lib/gbpReviewReplies";
import { getValidAccessTokenWithClient, markGbpReconnect } from "@/lib/gbpTokens.server";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";

const REVIEWS_BASE = "https://mybusiness.googleapis.com/v4";
export const REVIEWS_PAGE_SIZE = 50;
/** The newest 500 reviews at most per check (the all-time cap). */
export const MAX_REVIEW_PAGES = MAX_ALL_TIME_REVIEWS / REVIEWS_PAGE_SIZE;
const MISSING_COLUMN = new Set(["PGRST204", "42703"]);

export type FetchReviewsResult =
  /** `capped`: Google had more after the 10th page. */
  | { ok: true; reviews: GbpReview[]; capped: boolean }
  /** `auth`: Google rejected the token (401) — the owner must reconnect. */
  | { ok: false; kind: "auth" | "api"; status: number | null; reason: string | null };

/** Newest-updated first, page by page, up to the newest 500. */
export async function fetchGbpReviews(
  accessToken: string,
  accountName: string,
  locationName: string,
  fetchImpl: typeof fetch
): Promise<FetchReviewsResult> {
  const reviews: GbpReview[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_REVIEW_PAGES; page++) {
    const url = new URL(`${REVIEWS_BASE}/${accountName}/${locationName}/reviews`);
    url.searchParams.set("pageSize", String(REVIEWS_PAGE_SIZE));
    url.searchParams.set("orderBy", "updateTime desc");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    let res: Response;
    try {
      res = await fetchImpl(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    } catch {
      return { ok: false, kind: "api", status: null, reason: "network" };
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { status?: string; details?: Array<{ reason?: string }> } } | null;
      // Google's machine-readable reason only — never its message text.
      const reason = body?.error?.details?.find((d) => typeof d.reason === "string")?.reason ?? body?.error?.status ?? null;
      return { ok: false, kind: res.status === 401 ? "auth" : "api", status: res.status, reason };
    }
    const data = (await res.json()) as { reviews?: GbpReview[]; nextPageToken?: string };
    // Keep only the fields the counts need; everything else is dropped here.
    for (const r of data.reviews ?? []) {
      reviews.push({
        createTime: r.createTime,
        updateTime: r.updateTime,
        reviewer: r.reviewer?.displayName ? { displayName: r.reviewer.displayName } : undefined,
        reviewReply: r.reviewReply?.comment ? { comment: r.reviewReply.comment } : undefined,
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return { ok: true, reviews: reviews.slice(0, MAX_ALL_TIME_REVIEWS), capped: !!pageToken };
}

export type GbpReplyCheckRun =
  | { status: "ok"; counts: GbpReplyCounts }
  /** Not connected (or no matched location): nothing to do. */
  | { status: "skipped" }
  /** Token rejected: the connection is now "error" → "Reconnect Google". */
  | { status: "reconnect" }
  /** An API or save error: the last counts and their date stay. */
  | { status: "failed" };

function logFailure(step: string, details: Record<string, unknown> = {}) {
  console.warn(`[gbp-reply-check] ${step} failed`, JSON.stringify(details));
}

export async function runGbpReplyCheckWithClient(
  admin: SupabaseClient,
  businessId: string,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now()
): Promise<GbpReplyCheckRun> {
  const { data: row } = await admin
    .from("gbp_connections")
    .select("status, google_account_id, google_location_id")
    .eq("business_id", businessId)
    .maybeSingle();
  if (row?.status !== "connected" || !row.google_account_id || !row.google_location_id) return { status: "skipped" };

  // The token refresh goes to Google's OAuth endpoint, not the GBP API —
  // it isn't counted against the 300/min.
  const token = await getValidAccessTokenWithClient(admin, businessId, fetchImpl, now);
  if (token.status !== "ok") {
    if (token.reason === "not_connected") return { status: "skipped" };
    logFailure("token", { reason: token.reason });
    return token.reason === "reconnect" ? { status: "reconnect" } : { status: "failed" };
  }

  const counter = { calls: 0 };
  const fetched = await fetchGbpReviews(token.accessToken, row.google_account_id, row.google_location_id, gbpFetch(counter, fetchImpl));
  logGbpCalls("reply-check", counter);
  if (!fetched.ok) {
    logFailure("reviews", { status: fetched.status, reason: fetched.reason });
    if (fetched.kind === "auth") {
      await markGbpReconnect(admin, businessId);
      return { status: "reconnect" };
    }
    return { status: "failed" };
  }

  const counts = computeReplyCounts(fetched.reviews, now, fetched.capped);
  const recent = {
    reply_reviews_in_window: counts.reviewsInWindow,
    reply_replied: counts.replied,
    reply_templated_share: counts.templatedShare,
    reply_has_recent_review: counts.hasRecentReview,
    reply_checked_at: counts.checkedAt,
  };
  let { error } = await admin
    .from("gbp_connections")
    .update({
      ...recent,
      reply_all_time_reviews: counts.allTimeReviews,
      reply_all_time_replied: counts.allTimeReplied,
      reply_all_time_capped: counts.allTimeCapped,
    })
    .eq("business_id", businessId);
  // Before supabase/gbp-reply-alltime.sql: keep the recent counts anyway.
  if (error && MISSING_COLUMN.has(error.code ?? "")) {
    logFailure("save all-time", { reason: "columns missing — run supabase/gbp-reply-alltime.sql" });
    ({ error } = await admin.from("gbp_connections").update(recent).eq("business_id", businessId));
  }
  if (error) {
    logFailure("save", MISSING_COLUMN.has(error.code ?? "") ? { reason: "columns missing — run supabase/gbp-reply-counts.sql" } : { code: error.code ?? null });
    return { status: "failed" };
  }
  // The recent-review bucket (supabase/scoring-v1-12-recency-details.sql) —
  // its own update, so a missing column never blocks the counts above.
  await admin.from("gbp_connections").update({ reply_recent_reviews: counts.recentReviews }).eq("business_id", businessId);
  // The numbers scoring v1.12.0 uses, on the business's own row so
  // every page scores it the same (supabase/scoring-v1-12.sql). Before that
  // file is run this simply doesn't save — never an error for the owner.
  await setGbpScoringCounts(admin, businessId, counts);
  return { status: "ok", counts };
}

/** The owner's own reply counts for scoring (null clears them: disconnect,
 * or Google needs reconnecting). Never another business's. */
export async function setGbpScoringCounts(
  admin: SupabaseClient,
  businessId: string,
  counts: (Pick<GbpReplyCounts, "reviewsInWindow" | "replied" | "hasRecentReview"> & { recentReviews?: GbpReplyCounts["recentReviews"] }) | null
): Promise<void> {
  try {
    await admin
      .from("businesses")
      .update({
        gbp_reviews_in_window: counts?.reviewsInWindow ?? null,
        gbp_replied: counts?.replied ?? null,
        gbp_has_recent_review: counts ? counts.hasRecentReview : null,
      })
      .eq("id", businessId);
    // Separate, so a missing column (SQL not run yet) never blocks the above.
    await admin.from("businesses").update({ gbp_recent_reviews: counts?.recentReviews ?? null }).eq("id", businessId);
  } catch {
    // Missing columns (SQL not run yet): scoring leaves replies out.
  }
}

/** Never throws — a reply check must never fail a connect or a scan. */
export async function runGbpReplyCheck(businessId: string): Promise<GbpReplyCheckRun> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    return await runGbpReplyCheckWithClient(createAdminClient(), businessId);
  } catch (err) {
    logFailure("run", { error: err instanceof Error ? err.message.slice(0, 120) : "unknown" });
    return { status: "failed" };
  }
}

