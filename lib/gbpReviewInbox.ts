// Premium "Reply to your Google reviews": the owner's own Google reviews,
// read live from the Business Profile API (My Business v4) and shown —
// never stored (only the reply counts are saved, at scan time:
// lib/gbpReplyCounts.server.ts). Pure: the shapes, filters and checks the
// server and the page share.

export type InboxFilter = "needs_reply" | "replied" | "all";
export const INBOX_FILTERS: readonly InboxFilter[] = ["needs_reply", "replied", "all"];

/** Google's limit on a reply is 4,096 characters; ours matches the drafter. */
export const MAX_POSTED_REPLY_CHARS = 1200;

export interface InboxReview {
  /** Google's review id (the last part of the review's name). */
  reviewId: string;
  reviewer: string | null;
  stars: number | null;
  /** The review in the reviewer's own words (Google's translation removed). */
  comment: string | null;
  createTime: string | null;
  updateTime: string | null;
  reply: { comment: string; updateTime: string | null } | null;
}

/** Google's raw review, only the fields read here. */
export interface RawGbpReview {
  name?: string;
  reviewId?: string;
  reviewer?: { displayName?: string; isAnonymous?: boolean };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
}

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** A review id is safe to put in a Google URL: letters, digits, - and _. */
export function isReviewId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
}

/** Google adds its own translation: "(Translated by Google) …\n\n(Original)\n…"
 * — the owner replies to what the reviewer wrote. */
export function originalReviewText(comment: string | null | undefined): string | null {
  if (!comment) return null;
  const original = comment.match(/\(Original\)\s*\n([\s\S]*)$/);
  if (original) return original[1].trim() || null;
  return comment.replace(/^\(Translated by Google\)\s*/, "").trim() || null;
}

export function toInboxReview(raw: RawGbpReview): InboxReview | null {
  const reviewId = raw.reviewId ?? raw.name?.split("/").pop();
  if (!isReviewId(reviewId)) return null;
  const reply = raw.reviewReply?.comment ? { comment: raw.reviewReply.comment, updateTime: raw.reviewReply.updateTime ?? null } : null;
  return {
    reviewId,
    reviewer: raw.reviewer?.isAnonymous ? null : (raw.reviewer?.displayName ?? null),
    stars: raw.starRating ? (STARS[raw.starRating] ?? null) : null,
    comment: originalReviewText(raw.comment),
    createTime: raw.createTime ?? null,
    updateTime: raw.updateTime ?? null,
    reply,
  };
}

export function filterReviews(reviews: InboxReview[], filter: InboxFilter): InboxReview[] {
  if (filter === "needs_reply") return reviews.filter((r) => !r.reply);
  if (filter === "replied") return reviews.filter((r) => !!r.reply);
  return reviews;
}

/** Newest first, by when the review was written. */
export function newestFirst(reviews: InboxReview[]): InboxReview[] {
  return [...reviews].sort((a, b) => Date.parse(b.createTime ?? "") - Date.parse(a.createTime ?? "") || 0);
}

/** The reply as it's posted: trimmed, line breaks kept; null when empty or too long. */
export function cleanPostedReply(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const clean = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return clean.length > 0 && clean.length <= MAX_POSTED_REPLY_CHARS ? clean : null;
}

/** Google's read-back matches what was posted (spacing aside). */
export function sameReply(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  return norm(a) !== "" && norm(a) === norm(b);
}

/** The review's language for the reply (EN or ES), from its own words;
 * null when it can't tell (the business's language is used then). */
export function reviewLanguage(text: string | null | undefined): "en" | "es" | null {
  if (!text) return null;
  const words = text.toLowerCase().match(/[a-záéíóúüñ]+/g) ?? [];
  const ES = new Set(["el", "la", "los", "las", "muy", "gracias", "excelente", "servicio", "que", "por", "para", "con", "una", "es", "pero", "buen", "buena", "bueno", "todo", "siempre", "lugar", "comida", "atención", "recomiendo", "mi", "fue", "son", "y", "del", "lo", "más"]);
  const EN = new Set(["the", "and", "very", "great", "service", "was", "is", "with", "for", "but", "good", "they", "i", "my", "it", "this", "place", "food", "recommend", "always", "staff", "friendly", "of", "to", "were", "best"]);
  let es = /[ñ¿¡]|[áéíóú]/.test(text) ? 1 : 0;
  let en = 0;
  for (const w of words) {
    if (ES.has(w)) es++;
    if (EN.has(w)) en++;
  }
  if (es >= 2 && es > en) return "es";
  if (en >= 2 && en > es) return "en";
  return null;
}

export type InboxSort = "newest" | "lowest" | "oldest";
export const INBOX_SORTS: readonly InboxSort[] = ["newest", "lowest", "oldest"];
export function isInboxSort(value: unknown): value is InboxSort {
  return typeof value === "string" && (INBOX_SORTS as readonly string[]).includes(value);
}

/** Newest first (default), lowest rating first (unrated last; ties newest
 * first), or oldest first — by when the review was written. */
export function sortReviews(reviews: InboxReview[], sort: InboxSort): InboxReview[] {
  const time = (r: InboxReview) => Date.parse(r.createTime ?? "") || 0;
  const newest = (a: InboxReview, b: InboxReview) => time(b) - time(a);
  if (sort === "oldest") return [...reviews].sort((a, b) => time(a) - time(b));
  if (sort === "lowest") return [...reviews].sort((a, b) => (a.stars ?? 6) - (b.stars ?? 6) || newest(a, b));
  return [...reviews].sort(newest);
}

/** The inbox starts with this many; "Show 10 more" adds SHOW_MORE_STEP. */
export const INBOX_FIRST = 3;
export const SHOW_MORE_STEP = 10;

/** The reviews shown: the filter, the sort, then the first `limit` (null = all). */
export function visibleReviews(reviews: InboxReview[], filter: InboxFilter, sort: InboxSort, limit: number | null): { shown: InboxReview[]; total: number } {
  const matching = sortReviews(filterReviews(reviews, filter), sort);
  return { shown: limit === null ? matching : matching.slice(0, limit), total: matching.length };
}

/** "29 reviews need a reply · newest from Sep 14, 2026", or caught up. */
export function inboxSummary(reviews: InboxReview[]): { kind: "caught_up" } | { kind: "needs_reply"; count: number; newestAt: string | null } {
  const waiting = sortReviews(filterReviews(reviews, "needs_reply"), "newest");
  if (waiting.length === 0) return { kind: "caught_up" };
  return { kind: "needs_reply", count: waiting.length, newestAt: waiting[0].createTime };
}

/** Long enough that two lines won't hold it: the clamp gets a "Read more". */
export function needsReadMore(text: string | null): boolean {
  return !!text && (text.length > 140 || text.split("\n").length > 2);
}
