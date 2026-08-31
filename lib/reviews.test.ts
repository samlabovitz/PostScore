import { describe, expect, test } from "vitest";
import {
  RATING_TARGET,
  REVIEW_COUNT_MILESTONE,
  buildGoogleReviewUrl,
  ratingCaption,
  ratingProgressPercent,
  reviewCountCaption,
  reviewCountProgressPercent,
} from "./reviews";

describe("buildGoogleReviewUrl", () => {
  test("builds the real Google write-a-review URL from a place_id", () => {
    expect(buildGoogleReviewUrl("ChIJrybQQu04dYgRYh3PmlPPD1A")).toBe(
      "https://search.google.com/local/writereview?placeid=ChIJrybQQu04dYgRYh3PmlPPD1A"
    );
  });

  test("encodes a place_id that needs it, rather than embedding it raw", () => {
    expect(buildGoogleReviewUrl("abc def")).toBe(
      "https://search.google.com/local/writereview?placeid=abc%20def"
    );
  });
});

describe("ratingProgressPercent", () => {
  test("is null when rating is null, never a fake zero-width bar", () => {
    expect(ratingProgressPercent(null)).toBeNull();
  });

  test("is a plain fraction of 5 stars, not the scoring curve", () => {
    expect(ratingProgressPercent(5)).toBe(100);
    expect(ratingProgressPercent(2.5)).toBe(50);
    expect(ratingProgressPercent(0)).toBe(0);
  });
});

describe("reviewCountProgressPercent", () => {
  test("is null when reviewCount is null", () => {
    expect(reviewCountProgressPercent(null)).toBeNull();
  });

  test("is a fraction of the milestone, capped at 100 once passed", () => {
    expect(reviewCountProgressPercent(0)).toBe(0);
    expect(reviewCountProgressPercent(REVIEW_COUNT_MILESTONE / 2)).toBe(50);
    expect(reviewCountProgressPercent(REVIEW_COUNT_MILESTONE)).toBe(100);
    expect(reviewCountProgressPercent(REVIEW_COUNT_MILESTONE * 5)).toBe(100);
  });
});

describe("ratingCaption", () => {
  test("is an honest empty state when there's no rating", () => {
    expect(ratingCaption(null)).toContain("No rating yet");
  });

  test("names the real rating and the target, below target", () => {
    const caption = ratingCaption(3.8);
    expect(caption).toContain("3.8");
    expect(caption).toContain(String(RATING_TARGET));
  });

  test("names the real rating at/above target without a false 'aim for' framing", () => {
    const caption = ratingCaption(4.9);
    expect(caption).toContain("4.9");
    expect(caption.toLowerCase()).not.toContain("aim for");
  });
});

describe("reviewCountCaption", () => {
  test("is an honest empty state when there are no reviews", () => {
    expect(reviewCountCaption(null)).toContain("No reviews yet");
  });

  test("names exactly how many more are needed to reach the milestone", () => {
    expect(reviewCountCaption(63)).toBe(`${REVIEW_COUNT_MILESTONE - 63} more reviews to reach ${REVIEW_COUNT_MILESTONE}.`);
  });

  test("singularizes '1 more review'", () => {
    expect(reviewCountCaption(REVIEW_COUNT_MILESTONE - 1)).toContain("1 more review to reach");
  });

  test("switches to a 'passed the milestone' framing with the real total, never overstates it", () => {
    const caption = reviewCountCaption(581);
    expect(caption).toContain("581");
    expect(caption).toContain(`passed ${REVIEW_COUNT_MILESTONE}`);
  });
});
