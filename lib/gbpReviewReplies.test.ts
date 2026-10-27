import { describe, expect, test } from "vitest";
import {
  computeReplyCounts,
  normalizeReply,
  replyCountsFromRow,
  replyCountsView,
  reviewsInWindow,
  templatedShare,
  type GbpReview,
} from "@/lib/gbpReviewReplies";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
function review(daysAgo: number, reply?: string, name = "Maria Lopez", updatedDaysAgo = daysAgo): GbpReview {
  return { createTime: ago(daysAgo), updateTime: ago(updatedDaysAgo), reviewer: { displayName: name }, ...(reply ? { reviewReply: { comment: reply } } : {}) };
}

describe("window: last 90 days, or the latest 20", () => {
  test("20+ reviews in 90 days → exactly those", () => {
    const reviews = [...Array.from({ length: 25 }, (_, i) => review(i * 3)), review(100), review(200)];
    expect(reviewsInWindow(reviews, NOW)).toHaveLength(25);
  });

  test("fewer than 20 in 90 days → the latest 20 by creation date", () => {
    const reviews = [review(10), review(50), ...Array.from({ length: 30 }, (_, i) => review(100 + i))];
    const window = reviewsInWindow(reviews, NOW);
    expect(window).toHaveLength(20);
    expect(window[0].createTime).toBe(ago(10));
    expect(window[19].createTime).toBe(ago(117));
  });

  test("fewer than 20 reviews in total → all of them", () => {
    expect(reviewsInWindow([review(400), review(500)], NOW)).toHaveLength(2);
  });

  test("hasRecentReview is only a yes/no on the 90 days", () => {
    expect(computeReplyCounts([review(89)], NOW).hasRecentReview).toBe(true);
    expect(computeReplyCounts([review(91), review(300)], NOW).hasRecentReview).toBe(false);
  });
});

describe("all-time counts", () => {
  test("every review read counts — not just the window", () => {
    const reviews = [review(1), review(5), ...Array.from({ length: 28 }, (_, i) => review(100 + i * 10, i === 3 ? "Thanks for coming in!" : undefined))];
    const counts = computeReplyCounts(reviews, NOW);
    expect(counts).toMatchObject({ allTimeReviews: 30, allTimeReplied: 1, allTimeCapped: false, reviewsInWindow: 20, replied: 1 });
  });

  test("a reply outside the recent window still counts all-time, not recent", () => {
    const reviews = [...Array.from({ length: 20 }, (_, i) => review(i)), review(400, "Thank you!")];
    expect(computeReplyCounts(reviews, NOW)).toMatchObject({ allTimeReviews: 21, allTimeReplied: 1, reviewsInWindow: 20, replied: 0 });
  });

  test("capped is passed through", () => {
    expect(computeReplyCounts([review(1)], NOW, true).allTimeCapped).toBe(true);
  });
});

const C = { templatedShare: 0, hasRecentReview: true, allTimeReviews: 30, allTimeReplied: 1, allTimeCapped: false, checkedAt: ago(0) };

describe("reply counting", () => {
  test("only a non-empty reviewReply.comment counts as replied", () => {
    const counts = computeReplyCounts([review(1, "Thanks so much for visiting us today!"), review(2, "   "), review(3), review(4, "We appreciate you coming in, see you soon.")], NOW);
    expect(counts).toMatchObject({ reviewsInWindow: 4, replied: 2 });
  });

  test("under 3 reviews in the window → 'not enough recent reviews'", () => {
    expect(replyCountsView({ ...C, reviewsInWindow: 2, replied: 2 })).toMatchObject({ kind: "too_few" });
    expect(replyCountsView({ ...C, reviewsInWindow: 3, replied: 1 })).toMatchObject({ kind: "counts", templated: false });
    expect(replyCountsView({ ...C, reviewsInWindow: 10, replied: 10, templatedShare: 0.6 })).toMatchObject({ templated: true });
    expect(replyCountsView({ ...C, reviewsInWindow: 10, replied: 10, templatedShare: 0.5 })).toMatchObject({ templated: false });
    expect(replyCountsView(null)).toEqual({ kind: "none" });
  });
});

describe("templated replies", () => {
  test("normalizing: lowercase, no punctuation, reviewer's name removed", () => {
    expect(normalizeReply("Thank you, MARIA! See you soon.", "Maria Lopez")).toEqual(["thank", "you", "see", "you", "soon"]);
  });

  test("the same text with different names is templated", () => {
    const share = templatedShare([
      { text: "Thank you so much Maria for your kind words, we hope to see you again soon!", reviewerName: "Maria" },
      { text: "Thank you so much John for your kind words, we hope to see you again soon!", reviewerName: "John Smith" },
      { text: "Sorry the wait was long on Saturday — we've added a second stylist on weekends.", reviewerName: "Ana" },
    ]);
    expect(share).toBeCloseTo(2 / 3);
  });

  test("near-duplicates (trigram Jaccard ≥ 0.8) count; genuinely different replies don't", () => {
    const base = "thank you for the great review we really appreciate your support and hope to see you again very soon";
    expect(templatedShare([{ text: base }, { text: base + " friend" }])).toBe(1);
    expect(templatedShare([{ text: "Thanks for coming in for your color appointment, glad you love it." }, { text: "Sorry about the mix-up with your booking, please call us directly." }])).toBe(0);
  });

  test("short replies only match exactly", () => {
    expect(templatedShare([{ text: "Thanks!" }, { text: "thanks" }, { text: "Thank you" }])).toBeCloseTo(2 / 3);
  });

  test("one reply, or none, is never templated", () => {
    expect(templatedShare([])).toBe(0);
    expect(templatedShare([{ text: "Thanks!" }])).toBe(0);
  });
});

describe("only counts are kept", () => {
  test("the result has only counts — no text, names, ratings or review dates", () => {
    const reviews = [review(1, "Thanks Maria, see you soon!"), { ...review(2), starRating: "FIVE", comment: "Loved it" } as GbpReview];
    const counts = computeReplyCounts(reviews, NOW);
    expect(Object.keys(counts).sort()).toEqual(["allTimeCapped", "allTimeReplied", "allTimeReviews", "checkedAt", "hasRecentReview", "replied", "reviewsInWindow", "templatedShare"]);
    const json = JSON.stringify(counts);
    for (const leaked of ["Maria", "Loved", "FIVE", "Thanks", ago(1), ago(2)]) expect(json).not.toContain(leaked);
    expect(counts.checkedAt).toBe(new Date(NOW).toISOString());
  });

  test("reads counts back off a row; null until the first check; all-time null before its SQL", () => {
    expect(replyCountsFromRow({ status: "connected" })).toBeNull();
    expect(replyCountsFromRow({ reply_reviews_in_window: 3, reply_replied: 1, reply_checked_at: "2026-10-26T12:00:00Z" })).toMatchObject({ allTimeReviews: null, allTimeReplied: null, allTimeCapped: false });
    expect(replyCountsFromRow({ reply_reviews_in_window: 12, reply_replied: 9, reply_templated_share: 0.25, reply_has_recent_review: true, reply_all_time_reviews: 600, reply_all_time_replied: 400, reply_all_time_capped: true, reply_checked_at: "2026-10-26T12:00:00Z" })).toEqual({
      reviewsInWindow: 12,
      replied: 9,
      templatedShare: 0.25,
      hasRecentReview: true,
      allTimeReviews: 600,
      allTimeReplied: 400,
      allTimeCapped: true,
      checkedAt: "2026-10-26T12:00:00Z",
    });
  });
});
