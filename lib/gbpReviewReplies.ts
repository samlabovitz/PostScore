// Review-reply counts from the owner's own connected Google Business
// Profile — counts only. Pure: reviews come in, a few numbers come out, and
// the review text, reply text, reviewer names, star ratings and dates are
// dropped right here (lib/gbpReplyCounts.server.ts stores only the counts).
//
// Not scored yet. v1.12.0 scores the recent window only — the all-time
// counts are shown, never scored. Never used for competitors or any other
// business: the counts belong to the one business that connected.

/** The window: reviews created in the last 90 days — or, when that's
 * fewer than 20, the latest 20. */
export const REPLY_WINDOW_DAYS = 90;
export const REPLY_WINDOW_MIN_REVIEWS = 20;
/** Under this many reviews in the window there's nothing fair to say. */
export const REPLY_CHECK_MIN_REVIEWS = 3;
/** The all-time count covers at most the newest 500 reviews (10 pages of 50). */
export const MAX_ALL_TIME_REVIEWS = 500;
/** Two replies with word-trigram Jaccard at or above this are "the same text". */
export const TEMPLATED_JACCARD = 0.8;
/** "Most of your replies use the same text" above this share. */
export const TEMPLATED_WARN_SHARE = 0.5;

/** The only fields read from Google's review object (v4 Review). */
export interface GbpReview {
  createTime?: string;
  updateTime?: string;
  reviewer?: { displayName?: string };
  reviewReply?: { comment?: string };
}

/** Everything PostScore keeps. */
export interface GbpReplyCounts {
  reviewsInWindow: number;
  replied: number;
  /** 0–1: share of replies that are exact or near-duplicates of another reply. */
  templatedShare: number;
  /** At least one review created in the last 90 days. */
  hasRecentReview: boolean;
  /** Reviews created in the last 90 days, kept only as a bucket: 0, 1, 2
   * or 3 (= 3 or more). Null on counts saved before
   * supabase/scoring-v1-12-recency-details.sql. */
  recentReviews?: 0 | 1 | 2 | 3 | null;
  /** Every review read (newest first, at most 500) and how many have a
   * reply. Null on counts saved before supabase/gbp-reply-alltime.sql. */
  allTimeReviews: number | null;
  allTimeReplied: number | null;
  /** More than 500 reviews: the all-time counts are of the latest 500. */
  allTimeCapped: boolean;
  checkedAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const time = (iso: string | undefined) => (iso ? Date.parse(iso) : NaN);

export function windowCutoff(now: number): number {
  return now - REPLY_WINDOW_DAYS * DAY_MS;
}

/** Reviews created in the last 90 days; if fewer than 20, the latest 20. */
export function reviewsInWindow(reviews: GbpReview[], now: number): GbpReview[] {
  const dated = reviews.filter((r) => Number.isFinite(time(r.createTime)));
  const cutoff = windowCutoff(now);
  const recent = dated.filter((r) => time(r.createTime) >= cutoff);
  if (recent.length >= REPLY_WINDOW_MIN_REVIEWS) return recent;
  return [...dated].sort((a, b) => time(b.createTime) - time(a.createTime)).slice(0, REPLY_WINDOW_MIN_REVIEWS);
}

export function hasReply(r: GbpReview): boolean {
  return typeof r.reviewReply?.comment === "string" && r.reviewReply.comment.trim().length > 0;
}

// Built at runtime: the tsconfig target predates the /u flag.
const NOT_WORD = new RegExp("[^\\p{L}\\p{N}\\s]", "gu");

/** Lowercase, reviewer's name removed, punctuation stripped, words. */
export function normalizeReply(text: string, reviewerName: string | undefined): string[] {
  const words = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(NOT_WORD, " ")
      .split(/\s+/)
      .filter(Boolean);
  // Name parts of one letter ("John D.") stay — "a" and "i" are words.
  const name = new Set(words(reviewerName ?? "").filter((w) => w.length > 1));
  return words(text).filter((w) => !name.has(w));
}

function trigrams(words: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  a.forEach((g) => {
    if (b.has(g)) shared++;
  });
  return shared / (a.size + b.size - shared);
}

/** Share of replies that match at least one other reply (exact after
 * normalizing, or trigram Jaccard ≥ 0.8). Replies under three words have
 * no trigrams, so only an exact match counts for them. */
export function templatedShare(replies: Array<{ text: string; reviewerName?: string }>): number {
  if (replies.length < 2) return 0;
  const norm = replies.map((r) => normalizeReply(r.text, r.reviewerName));
  const joined = norm.map((w) => w.join(" "));
  const grams = norm.map(trigrams);
  let templated = 0;
  for (let i = 0; i < norm.length; i++) {
    for (let j = 0; j < norm.length; j++) {
      if (i === j) continue;
      const same = joined[i] === joined[j] || (grams[i].size > 0 && grams[j].size > 0 && jaccard(grams[i], grams[j]) >= TEMPLATED_JACCARD);
      if (same) {
        templated++;
        break;
      }
    }
  }
  return templated / norm.length;
}

/** 0, 1, 2 or 3 (= 3 or more). */
export function recentBucket(count: number): 0 | 1 | 2 | 3 {
  return count >= 3 ? 3 : count <= 0 ? 0 : (count as 1 | 2);
}

/** The numbers kept — nothing else from the reviews survives this.
 * `capped`: Google had more reviews than the 500 read. */
export function computeReplyCounts(reviews: GbpReview[], now: number, capped = false): GbpReplyCounts {
  const window = reviewsInWindow(reviews, now);
  const repliedReviews = window.filter(hasReply);
  return {
    reviewsInWindow: window.length,
    replied: repliedReviews.length,
    templatedShare: Math.round(templatedShare(repliedReviews.map((r) => ({ text: r.reviewReply!.comment!, reviewerName: r.reviewer?.displayName }))) * 1000) / 1000,
    hasRecentReview: reviews.some((r) => time(r.createTime) >= windowCutoff(now)),
    recentReviews: recentBucket(reviews.filter((r) => time(r.createTime) >= windowCutoff(now)).length),
    allTimeReviews: reviews.length,
    allTimeReplied: reviews.filter(hasReply).length,
    allTimeCapped: capped,
    checkedAt: new Date(now).toISOString(),
  };
}

export function replyRate(c: Pick<GbpReplyCounts, "reviewsInWindow" | "replied">): number {
  return c.reviewsInWindow > 0 ? c.replied / c.reviewsInWindow : 0;
}

/** What the owner sees. `too_few`: under 3 reviews in the window. */
export function replyCountsView(c: GbpReplyCounts | null): { kind: "none" } | { kind: "too_few"; checkedAt: string } | { kind: "counts"; counts: GbpReplyCounts; templated: boolean } {
  if (!c) return { kind: "none" };
  if (c.reviewsInWindow < REPLY_CHECK_MIN_REVIEWS) return { kind: "too_few", checkedAt: c.checkedAt };
  return { kind: "counts", counts: c, templated: c.templatedShare > TEMPLATED_WARN_SHARE };
}

/** The stored counts off a gbp_connections row (null until the first check,
 * or before supabase/gbp-reply-counts.sql has been run). */
export function replyCountsFromRow(row: Record<string, unknown>): GbpReplyCounts | null {
  if (typeof row.reply_checked_at !== "string" || typeof row.reply_reviews_in_window !== "number" || typeof row.reply_replied !== "number") return null;
  return {
    reviewsInWindow: row.reply_reviews_in_window,
    replied: row.reply_replied,
    templatedShare: typeof row.reply_templated_share === "number" ? row.reply_templated_share : 0,
    hasRecentReview: row.reply_has_recent_review === true,
    recentReviews: typeof row.reply_recent_reviews === "number" ? recentBucket(row.reply_recent_reviews) : null,
    allTimeReviews: typeof row.reply_all_time_reviews === "number" ? row.reply_all_time_reviews : null,
    allTimeReplied: typeof row.reply_all_time_replied === "number" ? row.reply_all_time_replied : null,
    allTimeCapped: row.reply_all_time_capped === true,
    checkedAt: row.reply_checked_at,
  };
}
