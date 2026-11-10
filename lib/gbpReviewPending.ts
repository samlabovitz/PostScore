// Review replies: a reply Google accepted but isn't showing yet
// ("unconfirmed" — lib/gbpReviewInbox.server.ts). The review waits — no
// Draft / Write buttons — while the page re-checks Google every 15 seconds
// for up to 2 minutes, then moves to Replied when it shows (or says to
// check Google Maps before trying again). The wait survives a refresh: it's
// kept per browser (with try/catch) and in the server log's unconfirmed
// row. Pure: the clock, timers and storage are passed in.
//
// Never the reply text: the browser keeps a short fingerprint of it, and
// the server log its length — enough to tell when Google shows that reply.

import type { InboxReview } from "@/lib/gbpReviewInbox";

export const PENDING_CHECK_MS = 15_000;
export const PENDING_TIMEOUT_MS = 120_000;
/** A wait older than this is forgotten (Google has long since answered). */
export const PENDING_KEEP_MS = 24 * 60 * 60 * 1000;

export type PendingAction = "post" | "edit" | "delete";

export interface PendingReply {
  reviewId: string;
  action: PendingAction;
  /** When Google accepted it (ISO). */
  since: string;
  /** The reply's length (the server log keeps only this). */
  replyLength: number | null;
  /** A short fingerprint of the reply text (this browser only). */
  hash: string | null;
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** A short, one-way fingerprint of a reply (djb2) — never the text itself. */
export function replyHash(text: string): string {
  let h = 5381;
  for (const ch of normalize(text)) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

export function pendingFor(action: PendingAction, reviewId: string, text: string | null, now: number): PendingReply {
  return { reviewId, action, since: new Date(now).toISOString(), replyLength: text === null ? null : text.length, hash: text === null ? null : replyHash(text) };
}

export function pendingPhase(p: PendingReply, now: number): "waiting" | "timed_out" {
  return now - Date.parse(p.since) < PENDING_TIMEOUT_MS ? "waiting" : "timed_out";
}

/** Is Google showing the change now? A delete: no reply. A post or edit: that reply. */
export function pendingResolved(p: PendingReply, review: InboxReview): boolean {
  if (p.action === "delete") return !review.reply;
  if (!review.reply) return false;
  if (p.hash) return replyHash(review.reply.comment) === p.hash;
  // From the server log alone (another browser): the length is all there is.
  return p.replyLength === null || review.reply.comment.trim().length === p.replyLength;
}

export function isPendingReply(value: unknown): value is PendingReply {
  const v = value as Partial<PendingReply> | null;
  return (
    !!v &&
    typeof v.reviewId === "string" &&
    (v.action === "post" || v.action === "edit" || v.action === "delete") &&
    typeof v.since === "string" &&
    Number.isFinite(Date.parse(v.since)) &&
    (v.replyLength === null || typeof v.replyLength === "number") &&
    (v.hash === null || typeof v.hash === "string")
  );
}

/** Newest wait per review wins; a browser's fingerprint is kept when the server's row matches it. */
export function mergePending(...lists: PendingReply[][]): PendingReply[] {
  const byReview = new Map<string, PendingReply>();
  for (const p of lists.flat()) {
    const seen = byReview.get(p.reviewId);
    if (!seen) byReview.set(p.reviewId, p);
    else if (Math.abs(Date.parse(p.since) - Date.parse(seen.since)) < PENDING_CHECK_MS) byReview.set(p.reviewId, { ...seen, ...p, hash: seen.hash ?? p.hash });
    else if (Date.parse(p.since) > Date.parse(seen.since)) byReview.set(p.reviewId, p);
  }
  return Array.from(byReview.values());
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

export const pendingStorageKey = (businessId: string) => `postscore.reviewInbox.pending.${businessId}`;

/** This browser's waits — none when storage is missing, blocked or holds junk. */
export function readPending(storage: Storage | null, businessId: string, now: number): PendingReply[] {
  try {
    const raw = storage?.getItem(pendingStorageKey(businessId));
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter(isPendingReply).filter((p) => now - Date.parse(p.since) < PENDING_KEEP_MS) : [];
  } catch {
    return [];
  }
}

export function writePending(storage: Storage | null, businessId: string, list: PendingReply[]): void {
  try {
    if (!storage) return;
    if (list.length === 0) storage.removeItem(pendingStorageKey(businessId));
    else storage.setItem(pendingStorageKey(businessId), JSON.stringify(list));
  } catch {
    // Private window or blocked storage: the server log still remembers it.
  }
}

/**
 * Re-checks Google every 15 seconds until the change shows (onShown) or 2
 * minutes have passed since Google accepted it (onTimedOut). Returns a
 * cancel function (the review left the page, or the page closed).
 */
export function watchPending(
  p: PendingReply,
  deps: {
    check: () => Promise<InboxReview | null>;
    onShown: (review: InboxReview) => void;
    onTimedOut: () => void;
    now?: () => number;
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
  }
): () => void {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const deadline = Date.parse(p.since) + PENDING_TIMEOUT_MS;
  let cancelled = false;
  let handle: unknown = null;

  const schedule = () => {
    if (cancelled) return;
    const left = deadline - now();
    if (left <= 0) {
      deps.onTimedOut();
      return;
    }
    handle = setTimer(async () => {
      const review = await deps.check().catch(() => null);
      if (cancelled) return;
      if (review && pendingResolved(p, review)) deps.onShown(review);
      else schedule();
    }, Math.min(PENDING_CHECK_MS, left));
  };
  schedule();
  return () => {
    cancelled = true;
    if (handle !== null) clearTimer(handle);
  };
}
